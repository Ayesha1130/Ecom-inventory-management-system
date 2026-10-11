-- NEXORA commerce core: catalog, warehouses, inventory ledger, customers, orders.
-- Not yet created (later phases): stores, product_images, carts, payments, refunds, suppliers,
-- purchase orders, discount codes, notifications, inventory_reservations, processed_events.
--
-- Design notes
--  * Composite FKs (child_id, organization_id) -> parent (id, organization_id) make cross-tenant
--    references impossible at the schema level, even for code running with elevated privileges.
--  * Money is integer minor units. Stock changes will go only through SQL functions (Phase 4);
--    inventory_levels / inventory_movements therefore have no write policies.

create type public.product_status as enum ('draft', 'active', 'archived');
create type public.order_status as enum ('pending', 'confirmed', 'cancelled');
create type public.payment_status as enum ('unpaid', 'paid', 'partially_refunded', 'refunded');
create type public.fulfillment_status as enum ('unfulfilled', 'shipped', 'delivered');
create type public.movement_reason as enum
  ('initial', 'restock', 'sale', 'return', 'adjustment', 'damage', 'transfer_in', 'transfer_out');

create function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  slug text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, slug),
  unique (id, organization_id)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  category_id uuid,
  name text not null check (char_length(name) between 1 and 160),
  slug text not null,
  description text,
  status public.product_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug),
  unique (id, organization_id),
  foreign key (category_id, organization_id) references public.categories (id, organization_id)
    on delete set null (category_id)
);
create index products_org_status_idx on public.products (organization_id, status);
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  product_id uuid not null,
  sku text not null check (char_length(sku) between 1 and 64),
  option_size text,
  option_color text,
  price_cents integer not null check (price_cents >= 0),
  sale_price_cents integer check (sale_price_cents is null or (sale_price_cents >= 0 and sale_price_cents < price_cents)),
  cost_cents integer not null default 0 check (cost_cents >= 0),
  low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
  created_at timestamptz not null default now(),
  unique (organization_id, sku),
  unique (id, organization_id),
  foreign key (product_id, organization_id) references public.products (id, organization_id) on delete cascade
);
create index product_variants_product_idx on public.product_variants (product_id);

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  code text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (id, organization_id)
);

create table public.inventory_levels (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  variant_id uuid not null,
  warehouse_id uuid not null,
  on_hand integer not null default 0 check (on_hand >= 0),
  reserved integer not null default 0 check (reserved >= 0),
  updated_at timestamptz not null default now(),
  primary key (variant_id, warehouse_id),
  check (reserved <= on_hand),               -- the database itself refuses to oversell
  foreign key (variant_id, organization_id) references public.product_variants (id, organization_id) on delete cascade,
  foreign key (warehouse_id, organization_id) references public.warehouses (id, organization_id) on delete cascade
);
create index inventory_levels_org_idx on public.inventory_levels (organization_id);

-- Append-only ledger: on_hand always equals the sum of its movements.
create table public.inventory_movements (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  variant_id uuid not null,
  warehouse_id uuid not null,
  delta integer not null check (delta <> 0),
  reason public.movement_reason not null,
  reference_type text,
  reference_id uuid,
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (variant_id, organization_id) references public.product_variants (id, organization_id),
  foreign key (warehouse_id, organization_id) references public.warehouses (id, organization_id)
);
create index inventory_movements_org_created_idx on public.inventory_movements (organization_id, created_at desc);
create index inventory_movements_variant_idx on public.inventory_movements (variant_id, created_at desc);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email = lower(email)),
  full_name text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, email),
  unique (id, organization_id)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  order_number integer not null,
  customer_id uuid,
  status public.order_status not null default 'pending',
  payment_status public.payment_status not null default 'unpaid',
  fulfillment_status public.fulfillment_status not null default 'unfulfilled',
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  total_cents integer not null default 0 check (total_cents >= 0),
  currency char(3) not null default 'USD',
  placed_at timestamptz not null default now(),
  unique (organization_id, order_number),
  unique (id, organization_id),
  foreign key (customer_id, organization_id) references public.customers (id, organization_id)
    on delete set null (customer_id)
);
create index orders_org_placed_idx on public.orders (organization_id, placed_at desc);
create index orders_customer_idx on public.orders (customer_id);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  order_id uuid not null,
  variant_id uuid,
  product_name text not null,          -- snapshots: history must survive catalog edits
  sku text not null,
  variant_label text,
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  foreign key (order_id, organization_id) references public.orders (id, organization_id) on delete cascade,
  foreign key (variant_id, organization_id) references public.product_variants (id, organization_id)
    on delete set null (variant_id)
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_variant_idx on public.order_items (variant_id);

-- ---------- RLS (generated, so every table gets identical, reviewable policies) ----------
do $$
declare
  t text;
begin
  -- catalog and parties: managers and above can write
  foreach t in array array['categories', 'products', 'product_variants', 'warehouses', 'customers'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.can_read_org(organization_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_member(organization_id, ''manager''))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_member(organization_id, ''manager'')) with check (public.is_member(organization_id, ''manager''))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_member(organization_id, ''manager''))', t || '_delete', t);
  end loop;
  -- orders: any staff member can work them
  foreach t in array array['orders', 'order_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.can_read_org(organization_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_member(organization_id, ''staff''))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_member(organization_id, ''staff'')) with check (public.is_member(organization_id, ''staff''))', t || '_update', t);
  end loop;
  -- stock: read-only from the client; mutated by SQL functions in Phase 4
  foreach t in array array['inventory_levels', 'inventory_movements'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.can_read_org(organization_id))', t || '_select', t);
  end loop;
end $$;

revoke update, delete, truncate on public.inventory_movements from authenticated;

-- ---------- dashboard aggregate ----------
-- SECURITY INVOKER: RLS applies, so a caller only ever aggregates rows they may read.
create function public.dashboard_summary(p_org uuid, p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with o as (
    select * from public.orders
    where organization_id = p_org and placed_at >= p_from and placed_at < p_to and status <> 'cancelled'
  ),
  days as (
    select d::date as day
    from generate_series(p_from::date, (p_to - interval '1 second')::date, interval '1 day') d
  ),
  daily as (
    select days.day,
           coalesce(sum(o.total_cents) filter (where o.payment_status = 'paid'), 0)::bigint as revenue_cents,
           count(o.id)::int as orders
    from days left join o on o.placed_at::date = days.day
    group by days.day
  ),
  top as (
    select i.product_name as name, sum(i.quantity)::int as units,
           sum(i.quantity::bigint * i.unit_price_cents)::bigint as revenue_cents
    from public.order_items i join o on o.id = i.order_id and o.organization_id = i.organization_id
    where o.payment_status = 'paid'
    group by i.product_name
    order by revenue_cents desc limit 5
  ),
  low as (
    select v.sku, p.name as product,
           nullif(concat_ws(' / ', v.option_size, v.option_color), '') as variant,
           coalesce(sum(l.on_hand - l.reserved), 0)::int as available,
           v.low_stock_threshold as threshold
    from public.product_variants v
    join public.products p on p.id = v.product_id and p.organization_id = v.organization_id
    left join public.inventory_levels l on l.variant_id = v.id
    where v.organization_id = p_org and p.status = 'active'
    group by v.id, p.id
    having coalesce(sum(l.on_hand - l.reserved), 0) <= v.low_stock_threshold
  ),
  recent as (
    select r.id, r.order_number, c.full_name as customer, r.total_cents, r.status, r.payment_status, r.placed_at
    from public.orders r left join public.customers c on c.id = r.customer_id and c.organization_id = r.organization_id
    where r.organization_id = p_org
    order by r.placed_at desc limit 6
  )
  select jsonb_build_object(
    'revenue_cents', coalesce((select sum(total_cents) from o where payment_status = 'paid'), 0),
    'orders', (select count(*) from o),
    'active_products', (select count(*) from public.products where organization_id = p_org and status = 'active'),
    'low_stock_count', (select count(*) from low),
    'daily', coalesce((select jsonb_agg(to_jsonb(d) order by d.day) from daily d), '[]'::jsonb),
    'top_products', coalesce((select jsonb_agg(to_jsonb(t) order by t.revenue_cents desc) from top t), '[]'::jsonb),
    'recent_orders', coalesce((select jsonb_agg(to_jsonb(r) order by r.placed_at desc) from recent r), '[]'::jsonb),
    'low_stock', coalesce((select jsonb_agg(to_jsonb(x) order by x.available, x.sku) from (select * from low order by available, sku limit 8) x), '[]'::jsonb)
  )
$$;
revoke execute on function public.dashboard_summary(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.dashboard_summary(uuid, timestamptz, timestamptz) to authenticated;
