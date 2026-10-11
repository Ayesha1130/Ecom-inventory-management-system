-- Phase 6: checkout, orders, payments, reservations, refunds, fulfillment.
--
-- Design notes
--  * Orders are NEVER written directly by clients. The Phase 3 insert/update policies are dropped; every state
--    change goes through a function that updates the order, its stock, and its timeline in ONE transaction.
--  * Order creation and payment confirmation are callable only by service_role (the Next.js server). A shopper
--    can't mint orders or mark them paid from the browser; the webhook is verified in application code.
--  * Stock lifecycle: reserve (reserved += n) -> on payment commit (on_hand -= n, reserved -= n, 'sale' movement)
--    | on expiry/cancel release (reserved -= n) | on refund+restock return (on_hand += n, 'return' movement).
--  * Webhook idempotency: the Stripe event id is inserted into processed_events inside the same transaction as the
--    work. A duplicate delivery conflicts and becomes a no-op; a failure rolls the insert back so Stripe's retry works.
--  * Lock order is always (variant_id, warehouse_id) so concurrent checkouts can never deadlock.

alter table public.orders
  add column customer_email text,
  add column customer_name text,
  add column shipping_address jsonb,
  add column access_token_hash text unique,        -- sha256 of the confirmation-page token
  add column stripe_session_id text unique,
  add column cart_id uuid references public.carts (id) on delete set null,
  add column expires_at timestamptz,
  add column paid_at timestamptz,
  add column cancelled_at timestamptz,
  add column cancel_reason text,
  add column shipped_at timestamptz,
  add column delivered_at timestamptz,
  add column tracking_number text,
  add column refunded_cents integer not null default 0 check (refunded_cents >= 0),
  add constraint orders_refund_within_total check (refunded_cents <= total_cents);
create index orders_pending_expiry_idx on public.orders (expires_at) where status = 'pending';

create table public.order_counters (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  last_number integer not null
);

create table public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  order_id uuid not null,
  variant_id uuid not null,
  warehouse_id uuid not null,
  quantity integer not null check (quantity > 0),
  status text not null default 'active' check (status in ('active', 'committed', 'released', 'returned')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (order_id, organization_id) references public.orders (id, organization_id) on delete cascade,
  foreign key (variant_id, organization_id) references public.product_variants (id, organization_id),
  foreign key (warehouse_id, organization_id) references public.warehouses (id, organization_id)
);
create index inventory_reservations_order_idx on public.inventory_reservations (order_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  order_id uuid not null,
  provider text not null default 'stripe',
  stripe_payment_intent text unique,
  amount_cents integer not null check (amount_cents >= 0),
  currency char(3) not null,
  status text not null default 'succeeded',
  created_at timestamptz not null default now(),
  foreign key (order_id, organization_id) references public.orders (id, organization_id) on delete cascade
);
create index payments_order_idx on public.payments (order_id);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  order_id uuid not null,
  payment_id uuid references public.payments (id) on delete set null,
  amount_cents integer not null check (amount_cents > 0),
  reason text,
  stripe_refund_id text unique,
  restocked boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (order_id, organization_id) references public.orders (id, organization_id) on delete cascade
);
create index refunds_order_idx on public.refunds (order_id);

create table public.order_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  order_id uuid not null,
  type text not null,
  message text not null,
  actor_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (order_id, organization_id) references public.orders (id, organization_id) on delete cascade
);
create index order_events_order_idx on public.order_events (order_id, created_at);

create table public.processed_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

-- ---------- RLS ----------
alter table public.order_counters enable row level security;
alter table public.processed_events enable row level security;
alter table public.inventory_reservations enable row level security;
alter table public.payments enable row level security;
alter table public.refunds enable row level security;
alter table public.order_events enable row level security;
revoke all on public.order_counters, public.processed_events from anon, authenticated;

create policy order_events_select on public.order_events for select to authenticated using (public.can_read_org(organization_id));
create policy reservations_select on public.inventory_reservations for select to authenticated using (public.is_member(organization_id, 'staff'));
create policy payments_select on public.payments for select to authenticated using (public.is_member(organization_id, 'staff'));
create policy refunds_select on public.refunds for select to authenticated using (public.is_member(organization_id, 'staff'));
revoke insert, update, delete, truncate on public.order_events, public.inventory_reservations, public.payments, public.refunds from authenticated;

-- orders become read-only for clients; the functions below are the only writers
drop policy orders_insert on public.orders;
drop policy orders_update on public.orders;
drop policy order_items_insert on public.order_items;
drop policy order_items_update on public.order_items;
revoke insert, update, delete, truncate on public.orders, public.order_items from authenticated;

-- ---------- internal helpers (no client can execute these) ----------
create function public.log_order_event(p_order uuid, p_type text, p_message text, p_actor uuid default null) returns void
language sql security definer set search_path = '' as $$
  insert into public.order_events (organization_id, order_id, type, message, actor_id)
  select organization_id, id, p_type, p_message, p_actor from public.orders where id = p_order
$$;

create function public.order_public_view(p_order uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'order_number', o.order_number, 'status', o.status, 'payment_status', o.payment_status,
    'fulfillment_status', o.fulfillment_status, 'placed_at', o.placed_at,
    'total_cents', o.total_cents, 'refunded_cents', o.refunded_cents, 'currency', o.currency,
    'tracking_number', o.tracking_number, 'customer_name', o.customer_name, 'customer_email', o.customer_email,
    'shipping_address', o.shipping_address, 'store_name', s.name, 'store_slug', s.slug,
    'lines', coalesce((select jsonb_agg(jsonb_build_object('name', i.product_name, 'variant', i.variant_label,
                'quantity', i.quantity, 'unit_price_cents', i.unit_price_cents) order by i.product_name, i.variant_label)
              from public.order_items i where i.order_id = o.id), '[]'::jsonb))
  from public.orders o join public.stores s on s.organization_id = o.organization_id
  where o.id = p_order
$$;

-- Reserve stock for every item of an order, or raise (rolling back the caller's whole transaction).
create function public.allocate_order_stock(p_order uuid, p_expires timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  r record;
  w record;
  v_need integer;
  v_take integer;
begin
  select organization_id into v_org from public.orders where id = p_order;
  if exists (select 1 from public.order_items where order_id = p_order and variant_id is null) then
    raise exception 'An item in this order is no longer available' using errcode = '23514';
  end if;

  perform 1 from public.inventory_levels
  where variant_id in (select variant_id from public.order_items where order_id = p_order)
  order by variant_id, warehouse_id for update;

  for r in
    select i.variant_id, sum(i.quantity)::int as qty, min(i.product_name) as pname
    from public.order_items i where i.order_id = p_order group by i.variant_id order by i.variant_id
  loop
    v_need := r.qty;
    for w in
      select warehouse_id, on_hand - reserved as avail from public.inventory_levels
      where variant_id = r.variant_id and on_hand - reserved > 0
      order by on_hand - reserved desc, warehouse_id
    loop
      exit when v_need = 0;
      v_take := least(v_need, w.avail);
      update public.inventory_levels set reserved = reserved + v_take, updated_at = now()
      where variant_id = r.variant_id and warehouse_id = w.warehouse_id;
      insert into public.inventory_reservations (organization_id, order_id, variant_id, warehouse_id, quantity, expires_at)
      values (v_org, p_order, r.variant_id, w.warehouse_id, v_take, p_expires);
      v_need := v_need - v_take;
    end loop;
    if v_need > 0 then
      raise exception 'Only % of "%" available', r.qty - v_need, r.pname using errcode = '23514';
    end if;
  end loop;
end $$;

create function public.commit_order_stock(p_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select * from public.inventory_reservations where order_id = p_order and status = 'active'
           order by variant_id, warehouse_id loop
    update public.inventory_levels set on_hand = on_hand - r.quantity, reserved = reserved - r.quantity, updated_at = now()
    where variant_id = r.variant_id and warehouse_id = r.warehouse_id;
    insert into public.inventory_movements (organization_id, variant_id, warehouse_id, delta, reason, reference_type, reference_id)
    values (r.organization_id, r.variant_id, r.warehouse_id, -r.quantity, 'sale', 'order', p_order);
  end loop;
  update public.inventory_reservations set status = 'committed' where order_id = p_order and status = 'active';
end $$;

create function public.restock_order_stock(p_order uuid, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select * from public.inventory_reservations where order_id = p_order and status = 'committed'
           order by variant_id, warehouse_id loop
    update public.inventory_levels set on_hand = on_hand + r.quantity, updated_at = now()
    where variant_id = r.variant_id and warehouse_id = r.warehouse_id;
    insert into public.inventory_movements (organization_id, variant_id, warehouse_id, delta, reason, reference_type, reference_id, note, created_by)
    values (r.organization_id, r.variant_id, r.warehouse_id, r.quantity, 'return', 'order', p_order, 'Order refunded and restocked', p_actor);
  end loop;
  update public.inventory_reservations set status = 'returned' where order_id = p_order and status = 'committed';
end $$;

create function public.cancel_pending_order_internal(p_order uuid, p_reason text, p_actor uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_status public.order_status;
  r record;
begin
  select status into v_status from public.orders where id = p_order for update;
  if v_status is distinct from 'pending' then return false; end if;
  for r in select * from public.inventory_reservations where order_id = p_order and status = 'active'
           order by variant_id, warehouse_id loop
    update public.inventory_levels set reserved = reserved - r.quantity, updated_at = now()
    where variant_id = r.variant_id and warehouse_id = r.warehouse_id;
  end loop;
  update public.inventory_reservations set status = 'released' where order_id = p_order and status = 'active';
  update public.orders set status = 'cancelled', cancel_reason = p_reason, cancelled_at = now() where id = p_order;
  perform public.log_order_event(p_order, 'order.cancelled', 'Order cancelled (' || p_reason || '); reserved stock released', p_actor);
  return true;
end $$;

revoke execute on function
  public.log_order_event(uuid, text, text, uuid), public.order_public_view(uuid),
  public.allocate_order_stock(uuid, timestamptz), public.commit_order_stock(uuid),
  public.restock_order_stock(uuid, uuid), public.cancel_pending_order_internal(uuid, text, uuid)
from public, anon, authenticated;

-- ---------- server-only (service_role) workflow functions ----------
create function public.create_order_from_cart(
  p_store text, p_token text, p_access_token text, p_email text, p_name text, p_shipping jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_store public.stores;
  v_org public.organizations;
  v_cart public.carts;
  v_email text := lower(trim(p_email));
  v_name text := trim(p_name);
  v_customer uuid;
  v_order uuid;
  v_number integer;
  v_total bigint;
  r record;
begin
  select * into v_store from public.published_store(p_store);
  if v_store.id is null then raise exception 'Store not found' using errcode = 'P0002'; end if;
  select * into v_org from public.organizations where id = v_store.organization_id;

  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then
    raise exception 'Enter a valid email address' using errcode = '22023';
  end if;
  if length(v_name) < 2 or length(v_name) > 100 then raise exception 'Enter your full name' using errcode = '22023'; end if;
  if p_access_token is null or length(p_access_token) < 32 then raise exception 'Invalid request' using errcode = '22023'; end if;
  if coalesce(trim(p_shipping ->> 'line1'), '') = '' or coalesce(trim(p_shipping ->> 'city'), '') = ''
     or coalesce(trim(p_shipping ->> 'postal_code'), '') = '' or coalesce(trim(p_shipping ->> 'country'), '') = '' then
    raise exception 'Complete the shipping address' using errcode = '22023';
  end if;

  select * into v_cart from public.carts
  where token_hash = public.cart_hash(p_token) and store_id = v_store.id and expires_at > now();
  if v_cart.id is null then raise exception 'Your cart is empty or has expired' using errcode = 'P0002'; end if;

  -- restarting checkout supersedes any earlier unpaid order for this cart, freeing its reserved stock first
  for r in select id from public.orders where cart_id = v_cart.id and status = 'pending' order by id loop
    perform public.cancel_pending_order_internal(r.id, 'superseded', null);
  end loop;

  select coalesce(sum(coalesce(v.sale_price_cents, v.price_cents)::bigint * i.quantity), 0) into v_total
  from public.cart_items i
  join public.product_variants v on v.id = i.variant_id and v.organization_id = v_cart.organization_id
  join public.products p on p.id = v.product_id and p.organization_id = v.organization_id and p.status = 'active'
  where i.cart_id = v_cart.id;
  if v_total <= 0 then raise exception 'Your cart is empty' using errcode = 'P0002'; end if;

  insert into public.customers (organization_id, email, full_name) values (v_org.id, v_email, v_name)
  on conflict (organization_id, email) do update set full_name = excluded.full_name
  returning id into v_customer;

  insert into public.order_counters (organization_id, last_number)
  values (v_org.id, (select coalesce(max(order_number), 1000) + 1 from public.orders where organization_id = v_org.id))
  on conflict (organization_id) do update set last_number = public.order_counters.last_number + 1
  returning last_number into v_number;

  insert into public.orders (organization_id, order_number, customer_id, customer_email, customer_name, shipping_address,
                             access_token_hash, cart_id, status, payment_status, fulfillment_status,
                             subtotal_cents, total_cents, currency, expires_at)
  values (v_org.id, v_number, v_customer, v_email, v_name, p_shipping, public.cart_hash(p_access_token), v_cart.id,
          'pending', 'unpaid', 'unfulfilled', v_total, v_total, v_org.currency, now() + interval '35 minutes')
  returning id into v_order;

  insert into public.order_items (organization_id, order_id, variant_id, product_name, sku, variant_label, quantity, unit_price_cents)
  select v_org.id, v_order, v.id, p.name, v.sku, nullif(concat_ws(' / ', v.option_size, v.option_color), ''),
         i.quantity, coalesce(v.sale_price_cents, v.price_cents)
  from public.cart_items i
  join public.product_variants v on v.id = i.variant_id and v.organization_id = v_cart.organization_id
  join public.products p on p.id = v.product_id and p.organization_id = v.organization_id and p.status = 'active'
  where i.cart_id = v_cart.id;

  perform public.allocate_order_stock(v_order, now() + interval '35 minutes');
  perform public.log_order_event(v_order, 'order.created', 'Order placed; awaiting payment');

  return public.order_public_view(v_order) || jsonb_build_object('order_id', v_order);
end $$;

create function public.set_checkout_session(p_order uuid, p_session text) returns void
language sql security definer set search_path = '' as $$
  update public.orders set stripe_session_id = p_session where id = p_order and status = 'pending'
$$;

create function public.cancel_pending_order(p_order uuid, p_reason text) returns boolean
language sql security definer set search_path = '' as $$
  select public.cancel_pending_order_internal(p_order, p_reason, null)
$$;

create function public.confirm_order_payment(
  p_event_id text, p_session_id text, p_payment_intent text, p_amount integer, p_currency text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_rows integer;
  v_o public.orders;
  v_ok boolean := true;
begin
  insert into public.processed_events (event_id, event_type) values (p_event_id, 'payment') on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return jsonb_build_object('status', 'duplicate'); end if;

  select * into v_o from public.orders where stripe_session_id = p_session_id for update;
  if v_o.id is null then return jsonb_build_object('status', 'ignored', 'reason', 'unknown_session'); end if;
  if v_o.payment_status <> 'unpaid' then return jsonb_build_object('status', 'already_paid'); end if;

  if p_amount is distinct from v_o.total_cents or lower(p_currency) is distinct from lower(v_o.currency) then
    perform public.log_order_event(v_o.id, 'payment.mismatch',
      format('Payment of %s %s did not match the order total of %s %s; not confirmed', p_amount, p_currency, v_o.total_cents, v_o.currency));
    return jsonb_build_object('status', 'amount_mismatch');
  end if;

  insert into public.payments (organization_id, order_id, stripe_payment_intent, amount_cents, currency)
  values (v_o.organization_id, v_o.id, p_payment_intent, p_amount, upper(p_currency))
  on conflict (stripe_payment_intent) do nothing;

  if v_o.status = 'pending' then
    perform public.commit_order_stock(v_o.id);
  elsif v_o.status = 'cancelled' then
    -- paid after the reservation expired: re-reserve if stock allows, otherwise flag for refund
    begin
      perform public.allocate_order_stock(v_o.id, null);
      perform public.commit_order_stock(v_o.id);
    exception when check_violation then
      v_ok := false;
    end;
  end if;

  if v_ok then
    update public.orders set status = 'confirmed', payment_status = 'paid', paid_at = now(),
           cancel_reason = null, cancelled_at = null where id = v_o.id;
    delete from public.carts where id = v_o.cart_id;
    perform public.log_order_event(v_o.id, 'payment.succeeded',
      case when v_o.status = 'cancelled' then 'Payment received after the reservation expired; stock re-reserved and order reinstated'
           else 'Payment received' end);
    return jsonb_build_object('status', 'confirmed') || public.order_public_view(v_o.id);
  end if;

  update public.orders set payment_status = 'paid', paid_at = now() where id = v_o.id;
  perform public.log_order_event(v_o.id, 'payment.refund_required',
    'Payment received after the order expired and stock is no longer available. Refund this order.');
  return jsonb_build_object('status', 'refund_required');
end $$;

create function public.expire_order_session(p_event_id text, p_session_id text, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_rows integer;
  v_order uuid;
begin
  insert into public.processed_events (event_id, event_type) values (p_event_id, 'expire') on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return jsonb_build_object('status', 'duplicate'); end if;
  select id into v_order from public.orders where stripe_session_id = p_session_id;
  if v_order is null then return jsonb_build_object('status', 'ignored'); end if;
  return jsonb_build_object('status', case when public.cancel_pending_order_internal(v_order, p_reason, null) then 'cancelled' else 'noop' end);
end $$;

create function public.release_expired_reservations() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  n integer := 0;
begin
  for r in select id from public.orders where status = 'pending' and expires_at < now() order by id for update skip locked loop
    if public.cancel_pending_order_internal(r.id, 'expired', null) then n := n + 1; end if;
  end loop;
  return n;
end $$;

create function public.order_by_token(p_store text, p_number integer, p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select public.order_public_view(o.id)
  from public.published_store(p_store) s
  join public.orders o on o.organization_id = s.organization_id and o.order_number = p_number
  where o.access_token_hash = public.cart_hash(p_token)
$$;

create function public.order_lookup(p_store text, p_number integer, p_email text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select public.order_public_view(o.id)
  from public.published_store(p_store) s
  join public.orders o on o.organization_id = s.organization_id and o.order_number = p_number
  where lower(o.customer_email) = lower(trim(p_email))
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'create_order_from_cart(text, text, text, text, text, jsonb)', 'set_checkout_session(uuid, text)',
    'cancel_pending_order(uuid, text)', 'confirm_order_payment(text, text, text, integer, text)',
    'expire_order_session(text, text, text)', 'release_expired_reservations()',
    'order_by_token(text, integer, text)', 'order_lookup(text, integer, text)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- ---------- staff workflow functions (authenticated; each re-checks the caller's role) ----------
create function public.update_fulfillment(p_org uuid, p_order uuid, p_to public.fulfillment_status, p_tracking text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_o public.orders;
begin
  if not public.is_member(p_org, 'staff') then raise exception 'Forbidden' using errcode = '42501'; end if;
  select * into v_o from public.orders where id = p_order and organization_id = p_org for update;
  if v_o.id is null then raise exception 'Order not found' using errcode = 'P0002'; end if;
  if v_o.status <> 'confirmed' or v_o.payment_status not in ('paid', 'partially_refunded') then
    raise exception 'Only paid orders can be fulfilled' using errcode = '22023';
  end if;
  if not ((v_o.fulfillment_status = 'unfulfilled' and p_to = 'shipped') or (v_o.fulfillment_status = 'shipped' and p_to = 'delivered')) then
    raise exception 'Cannot move an order from % to %', v_o.fulfillment_status, p_to using errcode = '22023';
  end if;
  if p_to = 'shipped' then
    update public.orders set fulfillment_status = 'shipped', shipped_at = now(),
           tracking_number = left(nullif(trim(p_tracking), ''), 100) where id = p_order;
    perform public.log_order_event(p_order, 'fulfillment.shipped',
      'Marked as shipped' || coalesce(' (tracking ' || nullif(trim(p_tracking), '') || ')', ''), (select auth.uid()));
  else
    update public.orders set fulfillment_status = 'delivered', delivered_at = now() where id = p_order;
    perform public.log_order_event(p_order, 'fulfillment.delivered', 'Marked as delivered', (select auth.uid()));
  end if;
end $$;

create function public.cancel_order(p_org uuid, p_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_status public.order_status;
begin
  if not public.is_member(p_org, 'manager') then raise exception 'Forbidden' using errcode = '42501'; end if;
  select status into v_status from public.orders where id = p_order and organization_id = p_org;
  if v_status is null then raise exception 'Order not found' using errcode = 'P0002'; end if;
  if v_status <> 'pending' then
    raise exception 'Only unpaid orders can be cancelled; refund paid orders instead' using errcode = '22023';
  end if;
  perform public.cancel_pending_order_internal(p_order, 'staff', (select auth.uid()));
end $$;

create function public.record_refund(
  p_org uuid, p_order uuid, p_amount integer, p_stripe_refund text, p_reason text, p_restock boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_o public.orders;
  v_new integer;
  v_uid uuid := (select auth.uid());
begin
  if not public.is_member(p_org, 'manager') then raise exception 'Forbidden' using errcode = '42501'; end if;
  select * into v_o from public.orders where id = p_order and organization_id = p_org for update;
  if v_o.id is null then raise exception 'Order not found' using errcode = 'P0002'; end if;
  if p_stripe_refund is not null and exists (select 1 from public.refunds where stripe_refund_id = p_stripe_refund) then
    return jsonb_build_object('status', 'duplicate');
  end if;
  if v_o.payment_status not in ('paid', 'partially_refunded') then
    raise exception 'This order has no refundable payment' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > v_o.total_cents - v_o.refunded_cents then
    raise exception 'Refund must be between 0.01 and the remaining %', (v_o.total_cents - v_o.refunded_cents) using errcode = '23514';
  end if;
  v_new := v_o.refunded_cents + p_amount;
  if p_restock and (v_new <> v_o.total_cents or v_o.fulfillment_status <> 'unfulfilled') then
    raise exception 'Restocking requires a full refund of an order that has not shipped' using errcode = '22023';
  end if;

  insert into public.refunds (organization_id, order_id, payment_id, amount_cents, reason, stripe_refund_id, restocked, created_by)
  values (p_org, p_order, (select id from public.payments where order_id = p_order order by created_at limit 1),
          p_amount, nullif(trim(p_reason), ''), p_stripe_refund, coalesce(p_restock, false), v_uid);
  update public.orders set refunded_cents = v_new,
         payment_status = case when v_new = total_cents then 'refunded'::public.payment_status else 'partially_refunded'::public.payment_status end
  where id = p_order;

  if p_restock then
    perform public.restock_order_stock(p_order, v_uid);
    update public.orders set status = 'cancelled', cancel_reason = 'refunded', cancelled_at = now() where id = p_order and status = 'confirmed';
  end if;
  perform public.log_order_event(p_order, 'refund.recorded',
    format('Refunded %s%s', p_amount, case when p_restock then ' and restocked items' else '' end), v_uid);
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_org, v_uid, 'order.refunded', 'order', p_order, jsonb_build_object('amount_cents', p_amount, 'restock', coalesce(p_restock, false)));
  return jsonb_build_object('status', 'recorded', 'refunded_cents', v_new);
end $$;

create function public.list_orders(p_org uuid, p_search text default null, p_filter text default 'all',
                                   p_limit integer default 25, p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with q as (
    select case when nullif(trim(p_search), '') is null then null
                else '%' || replace(replace(replace(trim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%' end as pat
  ), base as (
    select o.id, o.order_number, o.placed_at, coalesce(o.customer_name, c.full_name) as customer_name,
           coalesce(o.customer_email, c.email) as customer_email, o.status, o.payment_status, o.fulfillment_status,
           o.total_cents, o.currency,
           (select coalesce(sum(i.quantity), 0)::int from public.order_items i where i.order_id = o.id) as item_count
    from public.orders o
    left join public.customers c on c.id = o.customer_id and c.organization_id = o.organization_id
    where o.organization_id = p_org
  ), f as (
    select base.* from base, q
    where (case p_filter
            when 'to_fulfill' then status = 'confirmed' and payment_status in ('paid', 'partially_refunded') and fulfillment_status = 'unfulfilled'
            when 'pending' then status = 'pending'
            when 'shipped' then fulfillment_status = 'shipped'
            when 'cancelled' then status = 'cancelled'
            when 'needs_refund' then status = 'cancelled' and payment_status in ('paid', 'partially_refunded')
            when 'refunded' then payment_status in ('refunded', 'partially_refunded')
            else true end)
      and (q.pat is null or order_number::text = trim(p_search) or customer_email ilike q.pat or customer_name ilike q.pat)
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'rows', coalesce((select jsonb_agg(to_jsonb(r) order by r.placed_at desc, r.order_number desc)
                      from (select * from f order by placed_at desc, order_number desc
                            limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)) r), '[]'::jsonb))
$$;

create function public.get_order(p_org uuid, p_order uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'order', to_jsonb(o) - 'access_token_hash' - 'stripe_session_id' - 'cart_id',
    'customer', (select to_jsonb(c) - 'organization_id' from public.customers c where c.id = o.customer_id and c.organization_id = o.organization_id),
    'items', coalesce((select jsonb_agg(to_jsonb(i) - 'organization_id' order by i.product_name, i.variant_label) from public.order_items i where i.order_id = o.id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('type', e.type, 'message', e.message, 'created_at', e.created_at) order by e.created_at, e.id)
                        from public.order_events e where e.order_id = o.id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('stripe_payment_intent', p.stripe_payment_intent, 'amount_cents', p.amount_cents,
                        'currency', p.currency, 'created_at', p.created_at) order by p.created_at) from public.payments p where p.order_id = o.id), '[]'::jsonb),
    'refunds', coalesce((select jsonb_agg(jsonb_build_object('amount_cents', r.amount_cents, 'reason', r.reason, 'restocked', r.restocked,
                        'created_at', r.created_at) order by r.created_at) from public.refunds r where r.order_id = o.id), '[]'::jsonb))
  from public.orders o where o.id = p_order and o.organization_id = p_org
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'update_fulfillment(uuid, uuid, public.fulfillment_status, text)', 'cancel_order(uuid, uuid)',
    'record_refund(uuid, uuid, integer, text, text, boolean)',
    'list_orders(uuid, text, text, integer, integer)', 'get_order(uuid, uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------- dashboard: revenue is net of refunds ----------
create or replace function public.dashboard_summary(p_org uuid, p_from timestamptz, p_to timestamptz)
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
           coalesce(sum(o.total_cents - o.refunded_cents) filter (where o.payment_status in ('paid', 'partially_refunded')), 0)::bigint as revenue_cents,
           count(o.id)::int as orders
    from days left join o on o.placed_at::date = days.day
    group by days.day
  ),
  top as (
    select i.product_name as name, sum(i.quantity)::int as units,
           sum(i.quantity::bigint * i.unit_price_cents)::bigint as revenue_cents
    from public.order_items i join o on o.id = i.order_id and o.organization_id = i.organization_id
    where o.payment_status in ('paid', 'partially_refunded')
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
    select r.id, r.order_number, coalesce(r.customer_name, c.full_name) as customer, r.total_cents, r.status, r.payment_status, r.placed_at
    from public.orders r left join public.customers c on c.id = r.customer_id and c.organization_id = r.organization_id
    where r.organization_id = p_org
    order by r.placed_at desc limit 6
  )
  select jsonb_build_object(
    'revenue_cents', coalesce((select sum(total_cents - refunded_cents) from o where payment_status in ('paid', 'partially_refunded')), 0),
    'orders', (select count(*) from o),
    'active_products', (select count(*) from public.products where organization_id = p_org and status = 'active'),
    'low_stock_count', (select count(*) from low),
    'daily', coalesce((select jsonb_agg(to_jsonb(d) order by d.day) from daily d), '[]'::jsonb),
    'top_products', coalesce((select jsonb_agg(to_jsonb(t) order by t.revenue_cents desc) from top t), '[]'::jsonb),
    'recent_orders', coalesce((select jsonb_agg(to_jsonb(r) order by r.placed_at desc) from recent r), '[]'::jsonb),
    'low_stock', coalesce((select jsonb_agg(to_jsonb(x) order by x.available, x.sku) from (select * from low order by available, sku limit 8) x), '[]'::jsonb)
  )
$$;
