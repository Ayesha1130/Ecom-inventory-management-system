-- NEXORA core: identity, tenancy, authorization helpers, audit log.
-- Design notes
--  * member_role is declared in ascending privilege order, so `role >= 'manager'` works.
--  * Authorization lives in the database: every tenant table is protected by RLS that calls
--    is_member()/can_read_org(). App code re-checks, but never replaces, these policies.
--  * Helper functions are SECURITY DEFINER with an empty search_path so policies can read
--    organization_members without recursing into its own RLS.

create type public.member_role as enum ('staff', 'manager', 'admin', 'owner');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 40),
  is_demo boolean not null default false,
  currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email = lower(email)),
  role public.member_role not null check (role <> 'owner'),
  token_hash text not null unique,          -- sha256 of the emailed token; the raw token is never stored
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index invitations_org_idx on public.invitations (organization_id);

create table public.subscriptions (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'growth', 'scale')),
  status text not null default 'trialing',
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_logs_org_created_idx on public.audit_logs (organization_id, created_at desc);

-- ---------- authorization helpers ----------
create function public.is_member(p_org uuid, p_min public.member_role default 'staff')
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org
      and m.user_id = (select auth.uid())
      and m.role >= p_min
  )
$$;

-- Members can read their org. Demo orgs are readable by any signed-in session
-- (including anonymous ones) but is_member() stays false, so they can never write.
create function public.can_read_org(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_member(p_org, 'staff')
      or exists (select 1 from public.organizations o where o.id = p_org and o.is_demo)
$$;

create function public.shares_org_with(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.organization_members a
    join public.organization_members b on b.organization_id = a.organization_id
    where a.user_id = (select auth.uid()) and b.user_id = p_user
  )
$$;

-- ---------- RPCs ----------
create function public.create_organization(p_name text, p_slug text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Demo sessions cannot create organizations' using errcode = '42501';
  end if;
  if (select count(*) from public.organizations where created_by = v_uid) >= 5 then
    raise exception 'Organization limit reached' using errcode = '53400';
  end if;

  insert into public.organizations (name, slug, created_by)
  values (trim(p_name), lower(trim(p_slug)), v_uid)
  returning id into v_org;

  insert into public.organization_members (organization_id, user_id, role) values (v_org, v_uid, 'owner');
  insert into public.subscriptions (organization_id) values (v_org);
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id)
  values (v_org, v_uid, 'organization.created', 'organization', v_org);
  return v_org;
end $$;

create function public.log_audit(
  p_org uuid, p_action text, p_entity_type text, p_entity_id uuid default null, p_metadata jsonb default '{}'
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_member(p_org, 'staff') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_org, (select auth.uid()), p_action, p_entity_type, p_entity_id, p_metadata);
end $$;

revoke execute on function public.create_organization(text, text) from public, anon;
revoke execute on function public.log_audit(uuid, text, text, uuid, jsonb) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;
grant execute on function public.log_audit(uuid, text, text, uuid, jsonb) to authenticated;

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.invitations enable row level security;
alter table public.subscriptions enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_org_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy organizations_select on public.organizations for select to authenticated
  using (public.can_read_org(id));
create policy organizations_update on public.organizations for update to authenticated
  using (public.is_member(id, 'admin')) with check (public.is_member(id, 'admin'));

-- Members are changed only through RPCs added with team management (Phase 7).
create policy members_select on public.organization_members for select to authenticated
  using (public.is_member(organization_id, 'staff'));

create policy invitations_select on public.invitations for select to authenticated
  using (public.is_member(organization_id, 'admin'));
create policy invitations_insert on public.invitations for insert to authenticated
  with check (public.is_member(organization_id, 'admin') and invited_by = (select auth.uid()));
create policy invitations_delete on public.invitations for delete to authenticated
  using (public.is_member(organization_id, 'admin'));

create policy subscriptions_select on public.subscriptions for select to authenticated
  using (public.is_member(organization_id, 'staff'));

create policy audit_logs_select on public.audit_logs for select to authenticated
  using (public.is_member(organization_id, 'admin'));

-- ---------- privileges (defense in depth beyond RLS) ----------
-- A column grant stops admins from flipping is_demo (which would expose their org to every session).
revoke update on public.organizations from authenticated;
grant update (name, currency) on public.organizations to authenticated;
revoke update, delete, truncate on public.audit_logs from authenticated;
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
