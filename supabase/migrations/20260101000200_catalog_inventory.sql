-- Phase 4: product images, transactional stock functions, listing functions, default warehouse.
--
-- Design notes
--  * Stock is mutated ONLY by adjust_stock / transfer_stock. They are SECURITY DEFINER (clients have no
--    write policy on inventory_*), so each one re-checks membership itself, locks rows with FOR UPDATE in a
--    deterministic order (no deadlocks), writes the ledger entry, and writes the audit log in the same transaction.
--  * Listing functions are SECURITY INVOKER: RLS still decides what the caller can see.
--  * Sorting uses a whitelist mapped to fixed SQL fragments, never user-supplied identifiers.

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  product_id uuid not null,
  path text not null,
  alt text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  -- the object path must live under this org and product, so a row can never point at another tenant's file
  check (path like organization_id::text || '/' || product_id::text || '/%'),
  foreign key (product_id, organization_id) references public.products (id, organization_id) on delete cascade
);
create index product_images_product_idx on public.product_images (product_id, position);
alter table public.product_images enable row level security;
create policy product_images_select on public.product_images for select to authenticated
  using (public.can_read_org(organization_id));
create policy product_images_insert on public.product_images for insert to authenticated
  with check (public.is_member(organization_id, 'manager'));
create policy product_images_update on public.product_images for update to authenticated
  using (public.is_member(organization_id, 'manager')) with check (public.is_member(organization_id, 'manager'));
create policy product_images_delete on public.product_images for delete to authenticated
  using (public.is_member(organization_id, 'manager'));

-- New workspaces get a first warehouse so stock can be entered immediately.
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
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id)
  values (v_org, v_uid, 'organization.created', 'organization', v_org);
  return v_org;
end $$;

-- ---------- stock mutations ----------
create function public.adjust_stock(
  p_org uuid, p_variant uuid, p_warehouse uuid, p_delta integer,
  p_reason public.movement_reason, p_note text default null
) returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_on_hand integer;
  v_reserved integer;
begin
  if not public.is_member(p_org, 'manager') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_delta = 0 then
    raise exception 'Quantity change cannot be zero' using errcode = '22023';
  end if;
  if p_reason not in ('restock', 'return', 'damage', 'adjustment') then
    raise exception 'That reason is not allowed for manual changes' using errcode = '22023';
  end if;
  if (p_reason in ('restock', 'return') and p_delta < 0) or (p_reason = 'damage' and p_delta > 0) then
    raise exception 'The quantity direction does not match the reason' using errcode = '22023';
  end if;
  if not exists (select 1 from public.product_variants where id = p_variant and organization_id = p_org)
     or not exists (select 1 from public.warehouses where id = p_warehouse and organization_id = p_org) then
    raise exception 'Variant or warehouse not found' using errcode = 'P0002';
  end if;

  insert into public.inventory_levels (organization_id, variant_id, warehouse_id)
  values (p_org, p_variant, p_warehouse) on conflict do nothing;

  select on_hand, reserved into v_on_hand, v_reserved
  from public.inventory_levels where variant_id = p_variant and warehouse_id = p_warehouse for update;

  if v_on_hand + p_delta < v_reserved then
    raise exception 'Not enough unreserved stock to remove % units', -p_delta using errcode = '23514';
  end if;

  update public.inventory_levels set on_hand = on_hand + p_delta, updated_at = now()
  where variant_id = p_variant and warehouse_id = p_warehouse;
  insert into public.inventory_movements
    (organization_id, variant_id, warehouse_id, delta, reason, note, created_by)
  values (p_org, p_variant, p_warehouse, p_delta, p_reason, nullif(trim(p_note), ''), (select auth.uid()));
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_org, (select auth.uid()), 'inventory.adjusted', 'variant', p_variant,
          jsonb_build_object('warehouse_id', p_warehouse, 'delta', p_delta, 'reason', p_reason));
  return v_on_hand + p_delta;
end $$;

create function public.transfer_stock(
  p_org uuid, p_variant uuid, p_from uuid, p_to uuid, p_qty integer, p_note text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_on_hand integer;
  v_reserved integer;
  v_ref uuid := gen_random_uuid();
begin
  if not public.is_member(p_org, 'manager') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'Transfer quantity must be positive' using errcode = '22023';
  end if;
  if p_from = p_to then
    raise exception 'Choose two different warehouses' using errcode = '22023';
  end if;
  if not exists (select 1 from public.product_variants where id = p_variant and organization_id = p_org)
     or (select count(*) from public.warehouses where id in (p_from, p_to) and organization_id = p_org) <> 2 then
    raise exception 'Variant or warehouse not found' using errcode = 'P0002';
  end if;

  insert into public.inventory_levels (organization_id, variant_id, warehouse_id)
  values (p_org, p_variant, p_from), (p_org, p_variant, p_to) on conflict do nothing;

  -- lock both rows in a fixed order so two opposite transfers can never deadlock
  perform 1 from public.inventory_levels
  where variant_id = p_variant and warehouse_id in (p_from, p_to)
  order by warehouse_id for update;

  select on_hand, reserved into v_on_hand, v_reserved
  from public.inventory_levels where variant_id = p_variant and warehouse_id = p_from;
  if v_on_hand - v_reserved < p_qty then
    raise exception 'Only % units are available to transfer', v_on_hand - v_reserved using errcode = '23514';
  end if;

  update public.inventory_levels set on_hand = on_hand - p_qty, updated_at = now()
  where variant_id = p_variant and warehouse_id = p_from;
  update public.inventory_levels set on_hand = on_hand + p_qty, updated_at = now()
  where variant_id = p_variant and warehouse_id = p_to;

  insert into public.inventory_movements
    (organization_id, variant_id, warehouse_id, delta, reason, reference_type, reference_id, note, created_by)
  values
    (p_org, p_variant, p_from, -p_qty, 'transfer_out', 'transfer', v_ref, nullif(trim(p_note), ''), (select auth.uid())),
    (p_org, p_variant, p_to, p_qty, 'transfer_in', 'transfer', v_ref, nullif(trim(p_note), ''), (select auth.uid()));
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_org, (select auth.uid()), 'inventory.transferred', 'variant', p_variant,
          jsonb_build_object('from', p_from, 'to', p_to, 'quantity', p_qty));
  return v_ref;
end $$;

revoke execute on function public.adjust_stock(uuid, uuid, uuid, integer, public.movement_reason, text) from public, anon;
revoke execute on function public.transfer_stock(uuid, uuid, uuid, uuid, integer, text) from public, anon;
grant execute on function public.adjust_stock(uuid, uuid, uuid, integer, public.movement_reason, text) to authenticated;
grant execute on function public.transfer_stock(uuid, uuid, uuid, uuid, integer, text) to authenticated;

-- ---------- product save (create or update with variants, atomically, as the caller) ----------
create function public.save_product(p_org uuid, p_id uuid, p_data jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
  v jsonb;
  v_vid uuid;
  v_keep uuid[] := '{}';
begin
  if jsonb_array_length(coalesce(p_data -> 'variants', '[]')) = 0 then
    raise exception 'At least one variant is required' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.products (organization_id, name, slug, description, status, category_id)
    values (p_org, p_data ->> 'name', p_data ->> 'slug', nullif(p_data ->> 'description', ''),
            coalesce((p_data ->> 'status')::public.product_status, 'draft'),
            nullif(p_data ->> 'category_id', '')::uuid)
    returning id into v_id;
  else
    update public.products set
      name = p_data ->> 'name', slug = p_data ->> 'slug',
      description = nullif(p_data ->> 'description', ''),
      status = coalesce((p_data ->> 'status')::public.product_status, status),
      category_id = nullif(p_data ->> 'category_id', '')::uuid
    where id = p_id and organization_id = p_org
    returning id into v_id;
    if v_id is null then
      raise exception 'Product not found' using errcode = 'P0002';
    end if;
  end if;

  for v in select * from jsonb_array_elements(p_data -> 'variants') loop
    v_vid := nullif(v ->> 'id', '')::uuid;
    if v_vid is null then
      insert into public.product_variants
        (organization_id, product_id, sku, option_size, option_color, price_cents, sale_price_cents, cost_cents, low_stock_threshold)
      values (p_org, v_id, v ->> 'sku', nullif(v ->> 'option_size', ''), nullif(v ->> 'option_color', ''),
              (v ->> 'price_cents')::integer, (v ->> 'sale_price_cents')::integer,
              coalesce((v ->> 'cost_cents')::integer, 0), coalesce((v ->> 'low_stock_threshold')::integer, 5))
      returning id into v_vid;
    else
      update public.product_variants set
        sku = v ->> 'sku', option_size = nullif(v ->> 'option_size', ''), option_color = nullif(v ->> 'option_color', ''),
        price_cents = (v ->> 'price_cents')::integer, sale_price_cents = (v ->> 'sale_price_cents')::integer,
        cost_cents = coalesce((v ->> 'cost_cents')::integer, 0),
        low_stock_threshold = coalesce((v ->> 'low_stock_threshold')::integer, 5)
      where id = v_vid and product_id = v_id and organization_id = p_org;
      if not found then
        raise exception 'Variant not found' using errcode = 'P0002';
      end if;
    end if;
    v_keep := v_keep || v_vid;
  end loop;

  -- variants with stock history cannot be removed (FK on the ledger); the error surfaces to the caller
  delete from public.product_variants
  where product_id = v_id and organization_id = p_org and id <> all (v_keep);

  perform public.log_audit(p_org, case when p_id is null then 'product.created' else 'product.updated' end, 'product', v_id);
  return v_id;
end $$;
revoke execute on function public.save_product(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_product(uuid, uuid, jsonb) to authenticated;

-- ---------- listing functions ----------
create function public.list_products(
  p_org uuid, p_search text default null, p_status public.product_status default null,
  p_category uuid default null, p_sort text default 'created', p_dir text default 'desc',
  p_limit integer default 20, p_offset integer default 0
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_order text := case p_sort when 'name' then 'name' when 'price' then 'min_price'
                              when 'stock' then 'available' else 'created_at' end;
  v_dir text := case when lower(p_dir) = 'asc' then 'asc' else 'desc' end;
  v_pat text := case when nullif(trim(p_search), '') is null then null
                     else '%' || replace(replace(replace(trim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%' end;
  v_result jsonb;
begin
  execute format($q$
    with agg as (
      select p.id, p.name, p.slug, p.status, p.created_at, c.name as category,
        (select count(*) from public.product_variants v where v.product_id = p.id)::int as variants,
        (select min(coalesce(v.sale_price_cents, v.price_cents)) from public.product_variants v where v.product_id = p.id) as min_price,
        (select max(coalesce(v.sale_price_cents, v.price_cents)) from public.product_variants v where v.product_id = p.id) as max_price,
        coalesce((select sum(l.on_hand - l.reserved) from public.inventory_levels l
                  join public.product_variants v on v.id = l.variant_id where v.product_id = p.id), 0)::int as available,
        (select i.path from public.product_images i where i.product_id = p.id order by i.position, i.created_at limit 1) as image_path
      from public.products p
      left join public.categories c on c.id = p.category_id and c.organization_id = p.organization_id
      where p.organization_id = $1
        and ($2::text is null or p.name ilike $2 or exists (
              select 1 from public.product_variants v where v.product_id = p.id and v.sku ilike $2))
        and ($3::public.product_status is null or p.status = $3)
        and ($4::uuid is null or p.category_id = $4)
    ), page as (
      select *, row_number() over (order by %I %s nulls last, id) as rn from agg
      order by rn limit $5 offset $6
    )
    select jsonb_build_object(
      'total', (select count(*) from agg),
      'rows', coalesce((select jsonb_agg(to_jsonb(page) - 'rn' order by rn) from page), '[]'::jsonb))
  $q$, v_order, v_dir)
  into v_result
  using p_org, v_pat, p_status, p_category, least(greatest(p_limit, 1), 100), greatest(p_offset, 0);
  return v_result;
end $$;

create function public.list_inventory(
  p_org uuid, p_search text default null, p_low_only boolean default false,
  p_limit integer default 25, p_offset integer default 0
) returns jsonb language sql stable security invoker set search_path = '' as $$
  with base as (
    select v.id as variant_id, v.sku, p.name as product, p.status,
           nullif(concat_ws(' / ', v.option_size, v.option_color), '') as variant,
           v.cost_cents, v.low_stock_threshold as threshold,
           coalesce(sum(l.on_hand), 0)::int as on_hand,
           coalesce(sum(l.reserved), 0)::int as reserved,
           coalesce(sum(l.on_hand - l.reserved), 0)::int as available,
           coalesce(jsonb_object_agg(l.warehouse_id, jsonb_build_object('on_hand', l.on_hand, 'reserved', l.reserved))
                    filter (where l.warehouse_id is not null), '{}'::jsonb) as by_warehouse
    from public.product_variants v
    join public.products p on p.id = v.product_id and p.organization_id = v.organization_id
    left join public.inventory_levels l on l.variant_id = v.id
    where v.organization_id = p_org and p.status <> 'archived'
    group by v.id, p.id
  ), filtered as (
    select * from base
    where (not p_low_only or available <= threshold)
      and (nullif(trim(p_search), '') is null
           or product ilike '%' || replace(replace(replace(trim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
           or sku ilike '%' || replace(replace(replace(trim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%')
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'summary', (select jsonb_build_object(
        'units', coalesce(sum(on_hand), 0),
        'valuation_cents', coalesce(sum(on_hand::bigint * cost_cents), 0),
        'low_count', count(*) filter (where available <= threshold)) from base),
    'rows', coalesce((select jsonb_agg(to_jsonb(r) order by r.sku)
                      from (select * from filtered order by sku
                            limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)) r), '[]'::jsonb))
$$;

create function public.list_movements(p_org uuid, p_limit integer default 25, p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'total', (select count(*) from public.inventory_movements where organization_id = p_org),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at desc, r.id desc)
      from (
        select m.id, m.delta, m.reason, m.note, m.created_at, v.sku, p.name as product, w.name as warehouse, pr.full_name as actor
        from public.inventory_movements m
        join public.product_variants v on v.id = m.variant_id
        join public.products p on p.id = v.product_id
        join public.warehouses w on w.id = m.warehouse_id
        left join public.profiles pr on pr.id = m.created_by
        where m.organization_id = p_org
        order by m.created_at desc, m.id desc
        limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
      ) r), '[]'::jsonb))
$$;

revoke execute on function public.list_products(uuid, text, public.product_status, uuid, text, text, integer, integer) from public, anon;
revoke execute on function public.list_inventory(uuid, text, boolean, integer, integer) from public, anon;
revoke execute on function public.list_movements(uuid, integer, integer) from public, anon;
grant execute on function public.list_products(uuid, text, public.product_status, uuid, text, text, integer, integer) to authenticated;
grant execute on function public.list_inventory(uuid, text, boolean, integer, integer) to authenticated;
grant execute on function public.list_movements(uuid, integer, integer) to authenticated;
