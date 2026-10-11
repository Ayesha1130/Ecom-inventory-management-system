-- Phase 5: storefront and guest carts.
--
-- Security model
--  * Anonymous shoppers have NO table privileges. They reach data only through the SECURITY DEFINER
--    functions below, which expose a fixed set of public fields and only for PUBLISHED stores.
--    Costs, thresholds, exact stock beyond a cap, and other tenants' data are never returned.
--  * Carts are guest carts keyed by a random bearer token held in an httpOnly cookie. Only sha256(token)
--    is stored, so a database leak does not yield usable cart tokens. carts/cart_items have RLS on and no
--    policies: nothing but these functions can touch them.
--  * A cart does not reserve stock. It validates against availability when items are added or changed;
--    the authoritative check and reservation happen at checkout (Phase 6).

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 40),
  name text not null check (char_length(name) between 2 and 80),
  tagline text check (tagline is null or char_length(tagline) <= 140),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, organization_id)
);
alter table public.stores enable row level security;
create policy stores_select on public.stores for select to authenticated using (public.can_read_org(organization_id));
create policy stores_update on public.stores for update to authenticated
  using (public.is_member(organization_id, 'admin')) with check (public.is_member(organization_id, 'admin'));
revoke update on public.stores from authenticated;
grant update (name, tagline, is_published) on public.stores to authenticated;

-- existing workspaces get an unpublished store; new ones get it in create_organization
insert into public.stores (organization_id, slug, name)
select o.id, o.slug, o.name from public.organizations o
where not exists (select 1 from public.stores s where s.organization_id = o.id);

create or replace function public.create_organization(p_name text, p_slug text)
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
  insert into public.warehouses (organization_id, name, code) values (v_org, 'Main warehouse', 'MAIN');
  insert into public.stores (organization_id, slug, name) values (v_org, lower(trim(p_slug)), trim(p_name));
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id)
  values (v_org, v_uid, 'organization.created', 'organization', v_org);
  return v_org;
end $$;

create table public.carts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  store_id uuid not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  unique (id, organization_id),
  foreign key (store_id, organization_id) references public.stores (id, organization_id) on delete cascade
);
create index carts_expires_idx on public.carts (expires_at);

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  cart_id uuid not null,
  variant_id uuid not null,
  quantity integer not null check (quantity between 1 and 99),
  created_at timestamptz not null default now(),
  unique (cart_id, variant_id),
  foreign key (cart_id, organization_id) references public.carts (id, organization_id) on delete cascade,
  foreign key (variant_id, organization_id) references public.product_variants (id, organization_id) on delete cascade
);
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
revoke all on public.carts, public.cart_items from anon, authenticated;

-- ---------- internal helpers (not callable by clients) ----------
create function public.published_store(p_slug text) returns public.stores
language sql stable security definer set search_path = '' as $$
  select * from public.stores where slug = p_slug and is_published
$$;
create function public.cart_hash(p_token text) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(p_token, 'utf8')), 'hex')
$$;
create function public.variant_available(p_variant uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(on_hand - reserved), 0)::int from public.inventory_levels where variant_id = p_variant
$$;
revoke execute on function public.published_store(text), public.cart_hash(text), public.variant_available(uuid)
  from public, anon, authenticated;

-- ---------- public read API ----------
create function public.storefront_info(p_store text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'name', s.name, 'tagline', s.tagline, 'currency', o.currency, 'is_demo', o.is_demo,
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('slug', c.slug, 'name', c.name, 'count', x.n) order by c.name)
      from public.categories c
      cross join lateral (select count(*)::int n from public.products p
                          where p.category_id = c.id and p.organization_id = c.organization_id and p.status = 'active'
                            and exists (select 1 from public.product_variants v where v.product_id = p.id)) x
      where c.organization_id = s.organization_id and x.n > 0), '[]'::jsonb))
  from public.published_store(p_store) s join public.organizations o on o.id = s.organization_id
$$;

create function public.storefront_products(
  p_store text, p_category text default null, p_search text default null,
  p_sort text default 'new', p_limit integer default 12, p_offset integer default 0
) returns jsonb language sql stable security definer set search_path = '' as $$
  with s as (select * from public.published_store(p_store)),
  agg as (
    select p.id, p.slug, p.name, p.created_at, c.slug as category_slug, c.name as category,
      (select min(coalesce(v.sale_price_cents, v.price_cents)) from public.product_variants v where v.product_id = p.id) as min_price,
      (select max(coalesce(v.sale_price_cents, v.price_cents)) from public.product_variants v where v.product_id = p.id) as max_price,
      exists (select 1 from public.product_variants v where v.product_id = p.id and v.sale_price_cents is not null) as on_sale,
      (select coalesce(jsonb_agg(distinct v.option_color) filter (where v.option_color is not null), '[]'::jsonb)
         from public.product_variants v where v.product_id = p.id) as colors,
      coalesce((select sum(l.on_hand - l.reserved) from public.inventory_levels l
                join public.product_variants v on v.id = l.variant_id where v.product_id = p.id), 0) > 0 as in_stock,
      (select i.path from public.product_images i where i.product_id = p.id order by i.position, i.created_at limit 1) as image_path
    from public.products p join s on s.organization_id = p.organization_id
    left join public.categories c on c.id = p.category_id and c.organization_id = p.organization_id
    where p.status = 'active'
      and exists (select 1 from public.product_variants v where v.product_id = p.id)
      and (p_category is null or c.slug = p_category)
      and (nullif(trim(p_search), '') is null
           or p.name ilike '%' || replace(replace(replace(trim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%')
  ), page as (
    select *, row_number() over (order by
        case when p_sort = 'price_asc' then min_price end asc nulls last,
        case when p_sort = 'price_desc' then max_price end desc nulls last,
        case when p_sort = 'name' then name end asc,
        created_at desc, id) as rn
    from agg
  )
  select jsonb_build_object(
    'total', (select count(*) from agg),
    'rows', coalesce((select jsonb_agg(to_jsonb(r) - 'rn' - 'created_at' order by r.rn)
                      from (select * from page order by rn
                            limit least(greatest(p_limit, 1), 48) offset greatest(p_offset, 0)) r), '[]'::jsonb))
$$;

create function public.storefront_product(p_store text, p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'name', p.name, 'slug', p.slug, 'description', p.description,
    'category', c.name, 'category_slug', c.slug,
    'images', coalesce((select jsonb_agg(jsonb_build_object('path', i.path, 'alt', i.alt) order by i.position, i.created_at)
                        from public.product_images i where i.product_id = p.id), '[]'::jsonb),
    'variants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'size', v.option_size, 'color', v.option_color,
        'price_cents', v.price_cents, 'sale_price_cents', v.sale_price_cents,
        'available', least(public.variant_available(v.id), 20)) order by v.option_size, v.option_color, v.sku)
      from public.product_variants v where v.product_id = p.id), '[]'::jsonb))
  from public.published_store(p_store) s
  join public.products p on p.organization_id = s.organization_id and p.slug = p_slug and p.status = 'active'
  left join public.categories c on c.id = p.category_id and c.organization_id = p.organization_id
$$;

-- ---------- guest cart API ----------
create function public.cart_get(p_store text, p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with s as (select * from public.published_store(p_store)),
  c as (select c.* from public.carts c join s on s.id = c.store_id
        where c.token_hash = public.cart_hash(p_token) and c.expires_at > now()),
  lines as (
    select i.variant_id, p.name as product_name, p.slug as product_slug,
           v.option_size as size, v.option_color as color,
           coalesce(v.sale_price_cents, v.price_cents) as unit_price_cents, v.price_cents as list_price_cents,
           i.quantity, least(public.variant_available(v.id), 99) as available,
           (select pi.path from public.product_images pi where pi.product_id = p.id order by pi.position, pi.created_at limit 1) as image_path,
           i.created_at
    from public.cart_items i
    join c on c.id = i.cart_id
    join public.product_variants v on v.id = i.variant_id and v.organization_id = c.organization_id
    join public.products p on p.id = v.product_id and p.organization_id = v.organization_id and p.status = 'active'
  )
  select jsonb_build_object(
    'lines', coalesce((select jsonb_agg(to_jsonb(l) - 'created_at' order by l.created_at, l.variant_id) from lines l), '[]'::jsonb),
    'subtotal_cents', coalesce((select sum(unit_price_cents::bigint * quantity) from lines), 0),
    'count', coalesce((select sum(quantity) from lines), 0))
$$;

create function public.cart_add(p_store text, p_token text, p_variant uuid, p_qty integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_store public.stores;
  v_cart uuid;
  v_hash text := public.cart_hash(p_token);
  v_avail integer;
  v_existing integer;
begin
  select * into v_store from public.published_store(p_store);
  if v_store.id is null then raise exception 'Store not found' using errcode = 'P0002'; end if;
  if p_token is null or length(p_token) < 32 then raise exception 'Invalid cart' using errcode = '22023'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 99 then raise exception 'Choose a quantity between 1 and 99' using errcode = '22023'; end if;
  if not exists (select 1 from public.product_variants v join public.products p on p.id = v.product_id and p.organization_id = v.organization_id
                 where v.id = p_variant and v.organization_id = v_store.organization_id and p.status = 'active') then
    raise exception 'That item is not available' using errcode = 'P0002';
  end if;

  select id into v_cart from public.carts where token_hash = v_hash and store_id = v_store.id and expires_at > now();
  if v_cart is null then
    delete from public.carts where token_hash = v_hash;
    insert into public.carts (organization_id, store_id, token_hash) values (v_store.organization_id, v_store.id, v_hash)
    returning id into v_cart;
  end if;

  select quantity into v_existing from public.cart_items where cart_id = v_cart and variant_id = p_variant;
  if v_existing is null and (select count(*) from public.cart_items where cart_id = v_cart) >= 50 then
    raise exception 'Your cart is full' using errcode = '22023';
  end if;
  v_existing := coalesce(v_existing, 0);
  v_avail := public.variant_available(p_variant);
  if v_existing + p_qty > least(v_avail, 99) then
    raise exception '%', case when v_avail <= 0 then 'Sorry, that item is out of stock.'
      else format('Only %s available (you already have %s in your cart).', v_avail, v_existing) end
      using errcode = '23514';
  end if;

  insert into public.cart_items (organization_id, cart_id, variant_id, quantity)
  values (v_store.organization_id, v_cart, p_variant, p_qty)
  on conflict (cart_id, variant_id) do update set quantity = public.cart_items.quantity + excluded.quantity;
  update public.carts set updated_at = now(), expires_at = now() + interval '30 days' where id = v_cart;
  return public.cart_get(p_store, p_token);
end $$;

create function public.cart_set_qty(p_store text, p_token text, p_variant uuid, p_qty integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_cart uuid;
  v_avail integer;
begin
  if p_qty is null or p_qty < 0 or p_qty > 99 then raise exception 'Choose a quantity between 0 and 99' using errcode = '22023'; end if;
  select c.id into v_cart from public.carts c join public.published_store(p_store) s on s.id = c.store_id
  where c.token_hash = public.cart_hash(p_token) and c.expires_at > now();
  if v_cart is null then raise exception 'Cart not found' using errcode = 'P0002'; end if;

  if p_qty = 0 then
    delete from public.cart_items where cart_id = v_cart and variant_id = p_variant;
  else
    v_avail := public.variant_available(p_variant);
    if p_qty > least(v_avail, 99) then
      raise exception '%', case when v_avail <= 0 then 'Sorry, that item is out of stock.' else format('Only %s available.', v_avail) end
        using errcode = '23514';
    end if;
    update public.cart_items set quantity = p_qty where cart_id = v_cart and variant_id = p_variant;
    if not found then raise exception 'That item is not in your cart' using errcode = 'P0002'; end if;
  end if;
  update public.carts set updated_at = now() where id = v_cart;
  return public.cart_get(p_store, p_token);
end $$;

-- run from a scheduled job (pg_cron / Supabase cron); not callable by clients
create function public.purge_expired_carts() returns integer
language sql security definer set search_path = '' as $$
  with d as (delete from public.carts where expires_at < now() returning 1) select count(*)::int from d
$$;
revoke execute on function public.purge_expired_carts() from public, anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'storefront_info(text)', 'storefront_products(text, text, text, text, integer, integer)',
    'storefront_product(text, text)', 'cart_get(text, text)', 'cart_add(text, text, uuid, integer)',
    'cart_set_qty(text, text, uuid, integer)'] loop
    execute format('revoke execute on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;
