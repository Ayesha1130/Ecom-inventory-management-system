-- Phase 7: customers, suppliers + purchase orders, notifications, analytics, team management, audit log reads.
--
-- Design notes
--  * Purchase-order receiving is a stock mutation like any other: row-locked in (variant, warehouse) order, ledgered
--    as 'restock' with the PO as reference, and it moves the variant's unit cost to a weighted average so inventory
--    valuation stays meaningful.
--  * Team changes only happen through functions that enforce: you can't grant or touch a role above your own, you
--    can't change your own role, and an organization can never lose its last owner.
--  * Notifications are created by DEFERRED constraint triggers, so they evaluate the final state of a transaction
--    (a transfer that briefly dips a warehouse never raises a false low-stock alert).

-- ---------- profiles carry the email so team lists can show it (visible to co-members only) ----------
alter table public.profiles add column email text;
update public.profiles p set email = lower(u.email) from auth.users u where u.id = p.id;
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data ->> 'full_name', lower(new.email))
  on conflict (id) do nothing;
  return new;
end $$;

-- ---------- customers ----------
create table public.customer_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  customer_id uuid not null,
  body text not null check (char_length(body) between 1 and 2000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (customer_id, organization_id) references public.customers (id, organization_id) on delete cascade
);
create index customer_notes_customer_idx on public.customer_notes (customer_id, created_at desc);
alter table public.customer_notes enable row level security;
create policy customer_notes_select on public.customer_notes for select to authenticated using (public.can_read_org(organization_id));
create policy customer_notes_insert on public.customer_notes for insert to authenticated
  with check (public.is_member(organization_id, 'staff') and created_by = (select auth.uid()));
revoke update, delete, truncate on public.customer_notes from authenticated;

-- Segments are computed, never stored, so they can't go stale. Thresholds: VIP >= 500.00 net spend.
create function public.customer_segment(p_orders integer, p_spent bigint) returns text
language sql immutable set search_path = '' as $$
  select case when p_spent >= 50000 then 'vip' when p_orders >= 2 then 'returning' when p_orders = 1 then 'new' else 'prospect' end
$$;

create function public.list_customers(
  p_org uuid, p_search text default null, p_segment text default null, p_sort text default 'spent',
  p_limit integer default 25, p_offset integer default 0
) returns jsonb language sql stable security invoker set search_path = '' as $$
  with q as (
    select case when nullif(trim(p_search), '') is null then null
                else '%' || replace(replace(replace(trim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%' end as pat
  ), stats as (
    select c.id, c.full_name, c.email, c.created_at,
      count(o.id) filter (where o.status = 'confirmed' and o.payment_status in ('paid', 'partially_refunded'))::int as orders,
      coalesce(sum(o.total_cents - o.refunded_cents) filter (where o.status = 'confirmed' and o.payment_status in ('paid', 'partially_refunded')), 0)::bigint as spent_cents,
      max(o.placed_at) filter (where o.status = 'confirmed') as last_order_at
    from public.customers c
    left join public.orders o on o.customer_id = c.id and o.organization_id = c.organization_id
    where c.organization_id = p_org
    group by c.id
  ), seg as (
    select *, public.customer_segment(orders, spent_cents) as segment from stats
  ), f as (
    select seg.* from seg, q
    where (p_segment is null or seg.segment = p_segment) and (q.pat is null or full_name ilike q.pat or email ilike q.pat)
  ), page as (
    select f.*, row_number() over (order by
        case when p_sort = 'name' then full_name end asc,
        case when p_sort = 'recent' then last_order_at end desc nulls last,
        spent_cents desc, id) as rn
    from f
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'segments', (select coalesce(jsonb_object_agg(segment, n), '{}'::jsonb) from (select segment, count(*) n from seg group by segment) s),
    'rows', coalesce((select jsonb_agg(to_jsonb(r) - 'rn' order by r.rn)
                      from (select * from page order by rn limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)) r), '[]'::jsonb))
$$;

create function public.get_customer(p_org uuid, p_customer uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with paid as (
    select o.* from public.orders o
    where o.customer_id = p_customer and o.organization_id = p_org and o.status = 'confirmed' and o.payment_status in ('paid', 'partially_refunded')
  )
  select jsonb_build_object(
    'customer', to_jsonb(c) - 'organization_id',
    'orders', (select count(*) from paid),
    'spent_cents', coalesce((select sum(total_cents - refunded_cents) from paid), 0),
    'segment', public.customer_segment((select count(*)::int from paid), coalesce((select sum(total_cents - refunded_cents) from paid), 0)),
    'recent_orders', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'order_number', r.order_number, 'placed_at', r.placed_at,
        'status', r.status, 'payment_status', r.payment_status, 'fulfillment_status', r.fulfillment_status,
        'total_cents', r.total_cents, 'currency', r.currency) order by r.placed_at desc)
      from (select * from public.orders where customer_id = p_customer and organization_id = p_org order by placed_at desc limit 25) r), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'created_at', n.created_at, 'author', pr.full_name) order by n.created_at desc)
      from public.customer_notes n left join public.profiles pr on pr.id = n.created_by
      where n.customer_id = p_customer and n.organization_id = p_org), '[]'::jsonb))
  from public.customers c where c.id = p_customer and c.organization_id = p_org
$$;

-- ---------- suppliers and purchase orders ----------
create type public.po_status as enum ('draft', 'ordered', 'partially_received', 'received', 'cancelled');

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  email text check (email is null or char_length(email) <= 254),
  phone text check (phone is null or char_length(phone) <= 40),
  notes text check (notes is null or char_length(notes) <= 2000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, organization_id)
);
create unique index suppliers_org_name_idx on public.suppliers (organization_id, lower(name));

create table public.po_counters (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  last_number integer not null
);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  supplier_id uuid not null,
  po_number integer not null,
  status public.po_status not null default 'draft',
  expected_at date,
  notes text check (notes is null or char_length(notes) <= 2000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  ordered_at timestamptz,
  received_at timestamptz,
  unique (organization_id, po_number),
  unique (id, organization_id),
  foreign key (supplier_id, organization_id) references public.suppliers (id, organization_id)
);
create index purchase_orders_org_created_idx on public.purchase_orders (organization_id, created_at desc);

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  po_id uuid not null,
  variant_id uuid not null,
  qty_ordered integer not null check (qty_ordered between 1 and 100000),
  qty_received integer not null default 0,
  unit_cost_cents integer not null check (unit_cost_cents >= 0),
  unique (po_id, variant_id),
  check (qty_received between 0 and qty_ordered),
  foreign key (po_id, organization_id) references public.purchase_orders (id, organization_id) on delete cascade,
  foreign key (variant_id, organization_id) references public.product_variants (id, organization_id)
);

alter table public.suppliers enable row level security;
alter table public.po_counters enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
revoke all on public.po_counters from anon, authenticated;
create policy suppliers_select on public.suppliers for select to authenticated using (public.can_read_org(organization_id));
create policy suppliers_insert on public.suppliers for insert to authenticated with check (public.is_member(organization_id, 'manager'));
create policy suppliers_update on public.suppliers for update to authenticated
  using (public.is_member(organization_id, 'manager')) with check (public.is_member(organization_id, 'manager'));
create policy suppliers_delete on public.suppliers for delete to authenticated using (public.is_member(organization_id, 'manager'));
create policy po_select on public.purchase_orders for select to authenticated using (public.can_read_org(organization_id));
create policy poi_select on public.purchase_order_items for select to authenticated using (public.can_read_org(organization_id));
revoke insert, update, delete, truncate on public.purchase_orders, public.purchase_order_items from authenticated;

create function public.create_purchase_order(
  p_org uuid, p_supplier uuid, p_expected date, p_notes text, p_items jsonb, p_place boolean
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_po uuid;
  v_number integer;
  v_uid uuid := (select auth.uid());
  v_count integer;
begin
  if not public.is_member(p_org, 'manager') then raise exception 'Forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.suppliers where id = p_supplier and organization_id = p_org and is_active) then
    raise exception 'Supplier not found' using errcode = 'P0002';
  end if;
  v_count := coalesce(jsonb_array_length(p_items), 0);
  if v_count < 1 or v_count > 100 then raise exception 'Add between 1 and 100 lines' using errcode = '22023'; end if;
  if (select count(*) from jsonb_to_recordset(p_items) as x(variant_id uuid, quantity integer, unit_cost_cents integer)
      join public.product_variants v on v.id = x.variant_id and v.organization_id = p_org
      where x.quantity between 1 and 100000 and x.unit_cost_cents >= 0) <> v_count
     or (select count(distinct x.variant_id) from jsonb_to_recordset(p_items) as x(variant_id uuid)) <> v_count then
    raise exception 'Each line needs a distinct product of yours, a quantity of 1 or more, and a cost' using errcode = '22023';
  end if;

  insert into public.po_counters (organization_id, last_number)
  values (p_org, (select coalesce(max(po_number), 0) + 1 from public.purchase_orders where organization_id = p_org))
  on conflict (organization_id) do update set last_number = public.po_counters.last_number + 1
  returning last_number into v_number;

  insert into public.purchase_orders (organization_id, supplier_id, po_number, status, expected_at, notes, created_by, ordered_at)
  values (p_org, p_supplier, v_number, case when p_place then 'ordered' else 'draft' end::public.po_status,
          p_expected, nullif(trim(p_notes), ''), v_uid, case when p_place then now() end)
  returning id into v_po;
  insert into public.purchase_order_items (organization_id, po_id, variant_id, qty_ordered, unit_cost_cents)
  select p_org, v_po, x.variant_id, x.quantity, x.unit_cost_cents
  from jsonb_to_recordset(p_items) as x(variant_id uuid, quantity integer, unit_cost_cents integer);
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_org, v_uid, 'purchase_order.created', 'purchase_order', v_po, jsonb_build_object('po_number', v_number, 'placed', p_place));
  return v_po;
end $$;

create function public.place_purchase_order(p_org uuid, p_po uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_status public.po_status;
begin
  if not public.is_member(p_org, 'manager') then raise exception 'Forbidden' using errcode = '42501'; end if;
  select status into v_status from public.purchase_orders where id = p_po and organization_id = p_org for update;
  if v_status is null then raise exception 'Purchase order not found' using errcode = 'P0002'; end if;
  if v_status <> 'draft' then raise exception 'Only draft purchase orders can be placed' using errcode = '22023'; end if;
  update public.purchase_orders set status = 'ordered', ordered_at = now() where id = p_po;
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id)
  values (p_org, (select auth.uid()), 'purchase_order.placed', 'purchase_order', p_po);
end $$;

create function public.cancel_purchase_order(p_org uuid, p_po uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_status public.po_status;
begin
  if not public.is_member(p_org, 'manager') then raise exception 'Forbidden' using errcode = '42501'; end if;
  select status into v_status from public.purchase_orders where id = p_po and organization_id = p_org for update;
  if v_status is null then raise exception 'Purchase order not found' using errcode = 'P0002'; end if;
  if v_status not in ('draft', 'ordered') then
    raise exception 'Only draft or fully outstanding purchase orders can be cancelled' using errcode = '22023';
  end if;
  update public.purchase_orders set status = 'cancelled' where id = p_po;
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id)
  values (p_org, (select auth.uid()), 'purchase_order.cancelled', 'purchase_order', p_po);
end $$;

create function public.receive_purchase_order(p_org uuid, p_po uuid, p_warehouse uuid, p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_po public.purchase_orders;
  r record;
  v_item public.purchase_order_items;
  v_total_on_hand integer;
  v_pending integer;
  v_new public.po_status;
  v_uid uuid := (select auth.uid());
  v_lines integer := coalesce(jsonb_array_length(p_lines), 0);
begin
  if not public.is_member(p_org, 'manager') then raise exception 'Forbidden' using errcode = '42501'; end if;
  select * into v_po from public.purchase_orders where id = p_po and organization_id = p_org for update;
  if v_po.id is null then raise exception 'Purchase order not found' using errcode = 'P0002'; end if;
  if v_po.status not in ('ordered', 'partially_received') then
    raise exception 'Only ordered purchase orders can be received' using errcode = '22023';
  end if;
  if not exists (select 1 from public.warehouses where id = p_warehouse and organization_id = p_org) then
    raise exception 'Warehouse not found' using errcode = 'P0002';
  end if;
  if v_lines < 1 then raise exception 'Choose at least one line to receive' using errcode = '22023'; end if;
  if (select count(distinct x.item_id) from jsonb_to_recordset(p_lines) as x(item_id uuid)) <> v_lines then
    raise exception 'Each line can appear only once' using errcode = '22023';
  end if;

  -- variant order matches every other stock function, so concurrent work can't deadlock
  for r in
    select x.item_id, x.quantity, i.variant_id
    from jsonb_to_recordset(p_lines) as x(item_id uuid, quantity integer)
    left join public.purchase_order_items i on i.id = x.item_id and i.po_id = p_po
    order by i.variant_id nulls first
  loop
    if r.variant_id is null then raise exception 'A line does not belong to this purchase order' using errcode = '22023'; end if;
    select * into v_item from public.purchase_order_items where id = r.item_id for update;
    if r.quantity is null or r.quantity < 1 or r.quantity > v_item.qty_ordered - v_item.qty_received then
      raise exception 'Cannot receive % units: only % outstanding on that line', r.quantity, v_item.qty_ordered - v_item.qty_received using errcode = '23514';
    end if;

    insert into public.inventory_levels (organization_id, variant_id, warehouse_id) values (p_org, r.variant_id, p_warehouse) on conflict do nothing;
    perform 1 from public.inventory_levels where variant_id = r.variant_id and warehouse_id = p_warehouse for update;
    select coalesce(sum(on_hand), 0) into v_total_on_hand from public.inventory_levels where variant_id = r.variant_id;
    update public.product_variants set cost_cents = case
        when v_total_on_hand + r.quantity > 0
          then round((v_total_on_hand::numeric * cost_cents + r.quantity::numeric * v_item.unit_cost_cents) / (v_total_on_hand + r.quantity))::integer
        else v_item.unit_cost_cents end
      where id = r.variant_id;
    update public.inventory_levels set on_hand = on_hand + r.quantity, updated_at = now()
      where variant_id = r.variant_id and warehouse_id = p_warehouse;
    insert into public.inventory_movements (organization_id, variant_id, warehouse_id, delta, reason, reference_type, reference_id, note, created_by)
    values (p_org, r.variant_id, p_warehouse, r.quantity, 'restock', 'purchase_order', p_po, 'PO #' || v_po.po_number, v_uid);
    update public.purchase_order_items set qty_received = qty_received + r.quantity where id = r.item_id;
  end loop;

  select count(*) filter (where qty_received < qty_ordered) into v_pending from public.purchase_order_items where po_id = p_po;
  v_new := case when v_pending = 0 then 'received' else 'partially_received' end;
  update public.purchase_orders set status = v_new, received_at = case when v_pending = 0 then now() else received_at end where id = p_po;
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_org, v_uid, 'purchase_order.received', 'purchase_order', p_po, jsonb_build_object('status', v_new, 'warehouse_id', p_warehouse));
  return jsonb_build_object('status', v_new);
end $$;

create function public.list_purchase_orders(p_org uuid, p_status text default null, p_limit integer default 25, p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with base as (
    select po.id, po.po_number, po.status, po.expected_at, po.created_at, s.name as supplier_name,
      (select count(*)::int from public.purchase_order_items i where i.po_id = po.id) as item_count,
      (select coalesce(sum(qty_ordered), 0)::int from public.purchase_order_items i where i.po_id = po.id) as units_ordered,
      (select coalesce(sum(qty_received), 0)::int from public.purchase_order_items i where i.po_id = po.id) as units_received,
      (select coalesce(sum(qty_ordered::bigint * unit_cost_cents), 0)::bigint from public.purchase_order_items i where i.po_id = po.id) as total_cost_cents
    from public.purchase_orders po join public.suppliers s on s.id = po.supplier_id and s.organization_id = po.organization_id
    where po.organization_id = p_org and (p_status is null or po.status::text = p_status)
  )
  select jsonb_build_object('total', (select count(*) from base),
    'rows', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc, r.po_number desc)
                      from (select * from base order by created_at desc, po_number desc
                            limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)) r), '[]'::jsonb))
$$;

create function public.get_purchase_order(p_org uuid, p_po uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'po', to_jsonb(po) - 'organization_id',
    'supplier', (select to_jsonb(s) - 'organization_id' from public.suppliers s where s.id = po.supplier_id and s.organization_id = po.organization_id),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'variant_id', i.variant_id, 'sku', v.sku, 'product', p.name,
          'variant', nullif(concat_ws(' / ', v.option_size, v.option_color), ''), 'qty_ordered', i.qty_ordered,
          'qty_received', i.qty_received, 'unit_cost_cents', i.unit_cost_cents) order by p.name, v.sku)
        from public.purchase_order_items i
        join public.product_variants v on v.id = i.variant_id and v.organization_id = i.organization_id
        join public.products p on p.id = v.product_id and p.organization_id = v.organization_id
        where i.po_id = po.id), '[]'::jsonb))
  from public.purchase_orders po where po.id = p_po and po.organization_id = p_org
$$;

-- ---------- notifications ----------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  type text not null check (type in ('low_stock', 'new_order')),
  title text not null,
  body text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_org_created_idx on public.notifications (organization_id, created_at desc);
create index notifications_unread_idx on public.notifications (organization_id) where read_at is null;
alter table public.notifications enable row level security;
create policy notifications_select on public.notifications for select to authenticated using (public.can_read_org(organization_id));
revoke insert, update, delete, truncate on public.notifications from authenticated;

create function public.mark_notifications_read(p_org uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if not public.is_member(p_org, 'staff') then raise exception 'Forbidden' using errcode = '42501'; end if;
  update public.notifications set read_at = now() where organization_id = p_org and read_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

create function public.trg_low_stock() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_avail integer;
  v_thr integer;
  v_sku text;
  v_name text;
  v_status public.product_status;
begin
  select coalesce(sum(on_hand - reserved), 0) into v_avail from public.inventory_levels where variant_id = new.variant_id;
  select v.low_stock_threshold, v.sku, p.name, p.status into v_thr, v_sku, v_name, v_status
  from public.product_variants v join public.products p on p.id = v.product_id where v.id = new.variant_id;
  if v_status = 'active' and v_avail <= v_thr
     and not exists (select 1 from public.notifications where organization_id = new.organization_id
                     and type = 'low_stock' and entity_id = new.variant_id and read_at is null) then
    insert into public.notifications (organization_id, type, title, body, entity_id)
    values (new.organization_id, 'low_stock', case when v_avail <= 0 then 'Out of stock: ' else 'Low stock: ' end || v_name,
            format('%s has %s available (reorder point %s)', v_sku, v_avail, v_thr), new.variant_id);
  end if;
  return null;
end $$;
create constraint trigger low_stock_alert after update of on_hand, reserved on public.inventory_levels
  deferrable initially deferred for each row
  when (new.on_hand - new.reserved < old.on_hand - old.reserved)
  execute function public.trg_low_stock();

create function public.trg_new_order() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (organization_id, type, title, body, entity_id)
  values (new.organization_id, 'new_order', 'New order #' || new.order_number,
          format('%s paid by %s', to_char(new.total_cents / 100.0, 'FM999,999,990.00') || ' ' || new.currency, coalesce(new.customer_name, 'a customer')), new.id);
  return null;
end $$;
create trigger new_paid_order after update of payment_status on public.orders
  for each row when (old.payment_status = 'unpaid' and new.payment_status = 'paid')
  execute function public.trg_new_order();
revoke execute on function public.trg_low_stock(), public.trg_new_order() from public, anon, authenticated;

-- ---------- analytics ----------
-- Revenue is net of refunds. Category figures are gross item sales. Turnover is an ESTIMATE: period COGS at current
-- unit costs divided by current inventory value (there are no historical stock snapshots yet).
create function public.analytics_summary(p_org uuid, p_from timestamptz, p_to timestamptz) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with o as (
    select * from public.orders
    where organization_id = p_org and placed_at >= p_from and placed_at < p_to
      and status = 'confirmed' and payment_status in ('paid', 'partially_refunded')
  ), days as (
    select d::date as day from generate_series(p_from::date, (p_to - interval '1 second')::date, interval '1 day') d
  ), daily as (
    select days.day, coalesce(sum(o.total_cents - o.refunded_cents), 0)::bigint as revenue_cents, count(o.id)::int as orders
    from days left join o on o.placed_at::date = days.day group by days.day
  ), items as (
    select i.quantity, i.unit_price_cents, i.product_name, v.cost_cents, coalesce(c.name, 'Uncategorized') as category
    from public.order_items i join o on o.id = i.order_id and o.organization_id = i.organization_id
    left join public.product_variants v on v.id = i.variant_id and v.organization_id = i.organization_id
    left join public.products p on p.id = v.product_id and p.organization_id = v.organization_id
    left join public.categories c on c.id = p.category_id and c.organization_id = p.organization_id
  ), inv as (
    select coalesce(sum(l.on_hand::bigint * v.cost_cents), 0)::bigint as value_cents
    from public.inventory_levels l join public.product_variants v on v.id = l.variant_id and v.organization_id = l.organization_id
    where l.organization_id = p_org
  ), first_paid as (
    select customer_id, min(placed_at) as first_at from public.orders
    where organization_id = p_org and status = 'confirmed' and payment_status in ('paid', 'partially_refunded') and customer_id is not null
    group by customer_id
  ), weekly as (
    select date_trunc('week', o.placed_at)::date as week,
           count(distinct o.customer_id) filter (where fp.first_at >= date_trunc('week', o.placed_at))::int as new_customers,
           count(distinct o.customer_id) filter (where fp.first_at < date_trunc('week', o.placed_at))::int as returning_customers
    from o join first_paid fp on fp.customer_id = o.customer_id group by 1
  ), totals as (
    select coalesce(sum(total_cents - refunded_cents), 0)::bigint as revenue, count(*)::int as n from o
  ), cogs as (
    select coalesce(sum(quantity::bigint * coalesce(cost_cents, 0)), 0)::bigint as v, coalesce(sum(quantity), 0)::int as units from items
  )
  select jsonb_build_object(
    'revenue_cents', (select revenue from totals),
    'orders', (select n from totals),
    'aov_cents', (select case when n = 0 then 0 else round(revenue::numeric / n)::bigint end from totals),
    'units', (select units from cogs),
    'cogs_cents', (select v from cogs),
    'inventory_value_cents', (select value_cents from inv),
    'turnover', (select case when value_cents = 0 then null else round((select v from cogs)::numeric / value_cents, 2) end from inv),
    'days_of_inventory', (select case when (select v from cogs) = 0 then null
        else round((select value_cents from inv)::numeric / (select v from cogs) * greatest(1, extract(epoch from (p_to - p_from)) / 86400.0), 0) end),
    'daily', coalesce((select jsonb_agg(to_jsonb(d) order by d.day) from daily d), '[]'::jsonb),
    'by_category', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'revenue_cents', rev, 'units', u) order by rev desc)
        from (select category as name, sum(quantity::bigint * unit_price_cents)::bigint as rev, sum(quantity)::int as u from items group by category) x), '[]'::jsonb),
    'best_sellers', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'units', u, 'revenue_cents', rev) order by u desc, name)
        from (select product_name as name, sum(quantity)::int as u, sum(quantity::bigint * unit_price_cents)::bigint as rev
              from items group by product_name order by u desc, name limit 10) x), '[]'::jsonb),
    'weekly_customers', coalesce((select jsonb_agg(to_jsonb(w) order by w.week) from weekly w), '[]'::jsonb))
$$;

-- ---------- team management ----------
drop policy invitations_insert on public.invitations;
drop policy invitations_delete on public.invitations;
revoke insert, update, delete, truncate on public.invitations from authenticated;

create function public.create_invitation(p_org uuid, p_email text, p_role public.member_role, p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_caller public.member_role;
  v_email text := lower(trim(p_email));
  v_id uuid;
  v_uid uuid := (select auth.uid());
begin
  select role into v_caller from public.organization_members where organization_id = p_org and user_id = v_uid;
  if v_caller is null or v_caller < 'admin' then raise exception 'Forbidden' using errcode = '42501'; end if;
  if p_role = 'owner' then raise exception 'Owners can''t be invited; promote an existing member instead' using errcode = '22023'; end if;
  if p_role > v_caller then raise exception 'You can''t grant a role higher than your own' using errcode = '42501'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then raise exception 'Enter a valid email address' using errcode = '22023'; end if;
  if p_token is null or length(p_token) < 32 then raise exception 'Invalid request' using errcode = '22023'; end if;
  if exists (select 1 from public.organization_members m join public.profiles p on p.id = m.user_id
             where m.organization_id = p_org and lower(p.email) = v_email) then
    raise exception 'That person is already on your team' using errcode = '22023';
  end if;
  if (select count(*) from public.invitations where organization_id = p_org and accepted_at is null and email <> v_email) >= 50 then
    raise exception 'Too many pending invitations' using errcode = '22023';
  end if;
  delete from public.invitations where organization_id = p_org and email = v_email and accepted_at is null; -- re-inviting replaces the old link
  insert into public.invitations (organization_id, email, role, token_hash, invited_by)
  values (p_org, v_email, p_role, public.cart_hash(p_token), v_uid) returning id into v_id;
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_org, v_uid, 'invitation.created', 'invitation', v_id, jsonb_build_object('email', v_email, 'role', p_role));
  return v_id;
end $$;

create function public.revoke_invitation(p_org uuid, p_invitation uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_member(p_org, 'admin') then raise exception 'Forbidden' using errcode = '42501'; end if;
  delete from public.invitations where id = p_invitation and organization_id = p_org and accepted_at is null;
  if not found then raise exception 'Invitation not found' using errcode = 'P0002'; end if;
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id)
  values (p_org, (select auth.uid()), 'invitation.revoked', 'invitation', p_invitation);
end $$;

create function public.invitation_preview(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('organization', o.name, 'role', i.role, 'email', i.email)
  from public.invitations i join public.organizations o on o.id = i.organization_id
  where i.token_hash = public.cart_hash(p_token) and i.accepted_at is null and i.expires_at > now()
$$;

create function public.accept_invitation(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text := lower((select auth.jwt() ->> 'email'));
  v_inv public.invitations;
  v_org public.organizations;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Create an account to accept an invitation' using errcode = '42501';
  end if;
  select * into v_inv from public.invitations where token_hash = public.cart_hash(p_token) for update;
  if v_inv.id is null or v_inv.accepted_at is not null or v_inv.expires_at < now() then
    raise exception 'This invitation is invalid or has expired' using errcode = 'P0002';
  end if;
  if v_email is null or lower(v_inv.email) <> v_email then
    raise exception 'This invitation was sent to a different email address' using errcode = '42501';
  end if;
  insert into public.organization_members (organization_id, user_id, role) values (v_inv.organization_id, v_uid, v_inv.role)
  on conflict (organization_id, user_id) do nothing;
  update public.invitations set accepted_at = now() where id = v_inv.id;
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (v_inv.organization_id, v_uid, 'member.joined', 'member', v_uid, jsonb_build_object('role', v_inv.role));
  select * into v_org from public.organizations where id = v_inv.organization_id;
  return jsonb_build_object('slug', v_org.slug, 'name', v_org.name);
end $$;

create function public.change_member_role(p_org uuid, p_user uuid, p_role public.member_role) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_caller public.member_role;
  v_target public.member_role;
begin
  select role into v_caller from public.organization_members where organization_id = p_org and user_id = v_uid;
  if v_caller is null or v_caller < 'admin' then raise exception 'Forbidden' using errcode = '42501'; end if;
  if p_user = v_uid then raise exception 'You can''t change your own role' using errcode = '22023'; end if;
  select role into v_target from public.organization_members where organization_id = p_org and user_id = p_user for update;
  if v_target is null then raise exception 'Member not found' using errcode = 'P0002'; end if;
  if v_target > v_caller or p_role > v_caller then raise exception 'You can''t change roles above your own' using errcode = '42501'; end if;
  if v_target = 'owner' and p_role <> 'owner'
     and (select count(*) from public.organization_members where organization_id = p_org and role = 'owner') <= 1 then
    raise exception 'An organization needs at least one owner' using errcode = '22023';
  end if;
  update public.organization_members set role = p_role where organization_id = p_org and user_id = p_user;
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_org, v_uid, 'member.role_changed', 'member', p_user, jsonb_build_object('from', v_target, 'to', p_role));
end $$;

create function public.remove_member(p_org uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_caller public.member_role;
  v_target public.member_role;
begin
  select role into v_caller from public.organization_members where organization_id = p_org and user_id = v_uid;
  if v_caller is null then raise exception 'Forbidden' using errcode = '42501'; end if;
  select role into v_target from public.organization_members where organization_id = p_org and user_id = p_user for update;
  if v_target is null then raise exception 'Member not found' using errcode = 'P0002'; end if;
  if p_user <> v_uid and (v_caller < 'admin' or v_target > v_caller) then
    raise exception 'You can''t remove this member' using errcode = '42501';
  end if;
  if v_target = 'owner' and (select count(*) from public.organization_members where organization_id = p_org and role = 'owner') <= 1 then
    raise exception 'An organization needs at least one owner' using errcode = '22023';
  end if;
  delete from public.organization_members where organization_id = p_org and user_id = p_user;
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_org, v_uid, case when p_user = v_uid then 'member.left' else 'member.removed' end, 'member', p_user, jsonb_build_object('role', v_target));
end $$;

create function public.list_members(p_org uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'role', m.role, 'full_name', p.full_name, 'email', p.email,
         'joined_at', m.created_at, 'is_you', m.user_id = (select auth.uid())) order by m.role desc, m.created_at), '[]'::jsonb)
  from public.organization_members m left join public.profiles p on p.id = m.user_id
  where m.organization_id = p_org
$$;

create function public.list_audit_logs(p_org uuid, p_limit integer default 25, p_offset integer default 0) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('total', (select count(*) from public.audit_logs where organization_id = p_org),
    'rows', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc, r.id desc)
      from (select a.id, a.action, a.entity_type, a.entity_id, a.metadata, a.created_at, coalesce(p.full_name, p.email) as actor
            from public.audit_logs a left join public.profiles p on p.id = a.actor_id
            where a.organization_id = p_org order by a.created_at desc, a.id desc
            limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)) r), '[]'::jsonb))
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'create_purchase_order(uuid, uuid, date, text, jsonb, boolean)', 'place_purchase_order(uuid, uuid)',
    'cancel_purchase_order(uuid, uuid)', 'receive_purchase_order(uuid, uuid, uuid, jsonb)',
    'list_purchase_orders(uuid, text, integer, integer)', 'get_purchase_order(uuid, uuid)',
    'list_customers(uuid, text, text, text, integer, integer)', 'get_customer(uuid, uuid)',
    'mark_notifications_read(uuid)', 'analytics_summary(uuid, timestamptz, timestamptz)',
    'create_invitation(uuid, text, public.member_role, text)', 'revoke_invitation(uuid, uuid)',
    'invitation_preview(text)', 'accept_invitation(text)', 'change_member_role(uuid, uuid, public.member_role)',
    'remove_member(uuid, uuid)', 'list_members(uuid)', 'list_audit_logs(uuid, integer, integer)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
