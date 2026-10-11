-- Fictional demo business. Re-running this file RESETS the demo org (delete cascades, then rebuild).
-- All names, emails (example.com) and figures are simulated. Run as a privileged role (bypasses RLS).
do $$
declare
  v_org uuid;
  v_wh1 uuid;
  v_wh2 uuid;
  rec record;
  v_size text;
  v_color text;
  v_idx int := 0;
  v_ids uuid[];
  v_cust uuid[];
  v_n int;
  v_order uuid;
  v_status public.order_status;
  v_pay public.payment_status;
  v_ful public.fulfillment_status;
  v_placed timestamptz;
  v_r double precision;
  v_items int;
  v_pick uuid;
  v_qty int;
  v_sub int;
  v_var record;
  v_s1 uuid;
  v_s2 uuid;
  v_s3 uuid;
  v_po uuid;
  v_firsts text[] := array['Ava','Noah','Mia','Liam','Zoe','Ethan','Ivy','Lucas','Nora','Owen','Ruby','Caleb','Elena','Felix','Hana','Isaac','Jade','Kai','Lena','Milo'];
  v_lasts  text[] := array['Hart','Okafor','Lindqvist','Reyes','Tanaka','Moreau','Novak','Brandt','Silva','Kowalski','Haddad','Ferreira','Larsen','Mehta','Ortiz','Quinn','Rossi','Sato','Vance','Wells'];
begin
  delete from public.organizations where slug = 'alder-finch-demo';
  insert into public.organizations (name, slug, is_demo)
  values ('Alder & Finch (demo)', 'alder-finch-demo', true) returning id into v_org;
  insert into public.stores (organization_id, slug, name, tagline, is_published)
  values (v_org, 'alder-finch', 'Alder & Finch', 'Everyday outerwear and carry, made to be worn in.', true);
  perform setseed(0.42);

  insert into public.categories (organization_id, name, slug) values
    (v_org, 'Outerwear', 'outerwear'), (v_org, 'Bags', 'bags'), (v_org, 'Accessories', 'accessories');
  insert into public.warehouses (organization_id, name, code) values (v_org, 'Main Warehouse', 'MAIN') returning id into v_wh1;
  insert into public.warehouses (organization_id, name, code) values (v_org, 'East Fulfillment', 'EAST') returning id into v_wh2;

  for rec in
    select * from (values
      ('Linen Overshirt','linen-overshirt','outerwear',12800,9600,'S,M,L,XL','Sand,Ink','active'),
      ('Waxed Field Jacket','waxed-field-jacket','outerwear',24800,null,'S,M,L','Olive','active'),
      ('Ridge Canvas Tote','ridge-canvas-tote','bags',6400,null,'','Sand,Ink','active'),
      ('Harbor Wool Beanie','harbor-wool-beanie','accessories',3200,null,'','Ink,Moss,Rust','active'),
      ('Field Trail Sock','field-trail-sock','accessories',1800,null,'M,L','Grey','active'),
      ('Alder Daypack','alder-daypack','bags',11800,null,'','Ink,Olive','active'),
      ('Finch Merino Crew','finch-merino-crew','outerwear',9600,null,'S,M,L','Oat,Ink','active'),
      ('Leather Card Wallet','leather-card-wallet','accessories',4800,null,'','Tan,Black','active'),
      ('Coastal Rain Shell','coastal-rain-shell','outerwear',17800,null,'S,M,L','Slate','active'),
      ('Canvas Weekender','canvas-weekender','bags',14800,null,'','Sand','active'),
      ('Harbor Wool Scarf','harbor-wool-scarf','accessories',5200,null,'','Moss','draft')
    ) as t(name, slug, cat, price, sale, sizes, colors, status)
  loop
    v_idx := v_idx + 1;
    insert into public.products (organization_id, category_id, name, slug, status, description)
    values (v_org,
            (select id from public.categories where organization_id = v_org and slug = rec.cat),
            rec.name, rec.slug, rec.status::public.product_status, 'Simulated demo product.')
    returning id into v_order;  -- reused here as the product id
    foreach v_size in array coalesce(string_to_array(nullif(rec.sizes, ''), ','), array[null]::text[]) loop
      foreach v_color in array string_to_array(rec.colors, ',') loop
        insert into public.product_variants
          (organization_id, product_id, sku, option_size, option_color, price_cents, sale_price_cents, cost_cents)
        values (v_org, v_order,
                'AF-' || lpad(v_idx::text, 2, '0') || '-' || coalesce(upper(v_size), 'OS') || '-' || upper(left(v_color, 3)),
                v_size, v_color, rec.price, rec.sale, (rec.price * 0.4)::int);
      end loop;
    end loop;
  end loop;

  -- opening stock + ledger
  insert into public.inventory_levels (organization_id, variant_id, warehouse_id, on_hand)
  select v_org, v.id, w.id, case when w.id = v_wh1 then 150 + floor(random() * 150)::int else 80 + floor(random() * 80)::int end
  from public.product_variants v cross join (select v_wh1 as id union all select v_wh2) w
  where v.organization_id = v_org;
  insert into public.inventory_movements (organization_id, variant_id, warehouse_id, delta, reason, note, created_at)
  select organization_id, variant_id, warehouse_id, on_hand, 'initial', 'Opening stock', now() - interval '91 days'
  from public.inventory_levels where organization_id = v_org;

  insert into public.customers (organization_id, email, full_name)
  select v_org, lower(v_firsts[1 + (g % 20)] || '.' || v_lasts[1 + ((g * 7) % 20)] || g) || '@example.com',
         v_firsts[1 + (g % 20)] || ' ' || v_lasts[1 + ((g * 7) % 20)]
  from generate_series(1, 40) g;
  select array_agg(id) into v_cust from public.customers where organization_id = v_org;

  select array_agg(v.id order by v.sku) into v_ids
  from public.product_variants v join public.products p on p.id = v.product_id
  where v.organization_id = v_org and p.status = 'active';
  v_n := array_length(v_ids, 1);

  for i in 1..320 loop
    v_r := random();
    v_placed := now() - ((1 - sqrt(random())) * 90) * interval '1 day';
    if v_r < 0.10 then v_status := 'cancelled'; v_pay := 'unpaid'; v_ful := 'unfulfilled';  -- abandoned checkouts expire
    else
      v_status := 'confirmed'; v_pay := 'paid';
      v_ful := case when v_placed < now() - interval '5 days' then 'delivered'
                    when v_placed < now() - interval '2 days' then 'shipped' else 'unfulfilled' end;
    end if;
    insert into public.orders (organization_id, order_number, customer_id, status, payment_status, fulfillment_status, placed_at)
    values (v_org, 1000 + i, v_cust[1 + floor(random() * 40)::int], v_status, v_pay, v_ful, v_placed)
    returning id into v_order;

    v_sub := 0;
    v_items := 1 + floor(random() * 3)::int;
    for j in 1..v_items loop
      v_pick := v_ids[1 + floor(power(random(), 1.6) * v_n)::int];
      v_qty := 1 + floor(random() * 2)::int;
      select v.sku, p.name as pname, nullif(concat_ws(' / ', v.option_size, v.option_color), '') as label,
             coalesce(v.sale_price_cents, v.price_cents) as price
        into v_var
        from public.product_variants v join public.products p on p.id = v.product_id where v.id = v_pick;
      insert into public.order_items (organization_id, order_id, variant_id, product_name, sku, variant_label, quantity, unit_price_cents)
      values (v_org, v_order, v_pick, v_var.pname, v_var.sku, v_var.label, v_qty, v_var.price);
      v_sub := v_sub + v_qty * v_var.price;

      if v_status = 'confirmed' then
        update public.inventory_levels set on_hand = on_hand - v_qty
          where variant_id = v_pick and warehouse_id = v_wh1;
        insert into public.inventory_movements (organization_id, variant_id, warehouse_id, delta, reason, reference_type, reference_id, created_at)
        values (v_org, v_pick, v_wh1, -v_qty, 'sale', 'order', v_order, v_placed);
      end if;
    end loop;
    update public.orders set subtotal_cents = v_sub, total_cents = v_sub where id = v_order;
  end loop;

  -- order snapshots, lifecycle timestamps, timeline and a couple of partial refunds (all simulated)
  update public.orders o set customer_email = c.email, customer_name = c.full_name,
         shipping_address = jsonb_build_object('line1', '1 Example Street', 'city', 'Springfield', 'postal_code', '00000', 'country', 'US')
  from public.customers c where c.id = o.customer_id and o.organization_id = v_org;
  update public.orders set paid_at = placed_at + interval '2 minutes' where organization_id = v_org and payment_status = 'paid';
  update public.orders set shipped_at = placed_at + interval '1 day' where organization_id = v_org and fulfillment_status in ('shipped', 'delivered');
  update public.orders set delivered_at = placed_at + interval '4 days' where organization_id = v_org and fulfillment_status = 'delivered';
  update public.orders set cancel_reason = 'expired', cancelled_at = placed_at + interval '35 minutes' where organization_id = v_org and status = 'cancelled';

  with pick as (
    select id, total_cents / 4 as amt from public.orders
    where organization_id = v_org and payment_status = 'paid' and fulfillment_status = 'delivered' order by placed_at limit 2
  ), upd as (
    update public.orders o set refunded_cents = pick.amt, payment_status = 'partially_refunded' from pick where o.id = pick.id returning o.id, pick.amt
  )
  insert into public.refunds (organization_id, order_id, amount_cents, reason, created_at)
  select v_org, id, amt, 'Item returned (demo)', now() - interval '3 days' from upd;

  insert into public.order_events (organization_id, order_id, type, message, created_at)
  select organization_id, id, 'order.created', 'Order placed; awaiting payment', placed_at from public.orders where organization_id = v_org
  union all select organization_id, id, 'payment.succeeded', 'Payment received', paid_at from public.orders where organization_id = v_org and paid_at is not null
  union all select organization_id, id, 'fulfillment.shipped', 'Marked as shipped', shipped_at from public.orders where organization_id = v_org and shipped_at is not null
  union all select organization_id, id, 'fulfillment.delivered', 'Marked as delivered', delivered_at from public.orders where organization_id = v_org and delivered_at is not null
  union all select organization_id, id, 'order.cancelled', 'Order cancelled (expired); reserved stock released', cancelled_at from public.orders where organization_id = v_org and status = 'cancelled'
  union all select organization_id, order_id, 'refund.recorded', 'Partial refund recorded', created_at from public.refunds where organization_id = v_org;

  -- suppliers, purchase orders (one already received, with its stock and ledger entries) and customer notes
  insert into public.suppliers (organization_id, name, email, phone, notes) values
    (v_org, 'Northfield Mills', 'orders@northfield.example.com', '+1 555 0101', 'Wovens and linen. About three weeks lead time.') returning id into v_s1;
  insert into public.suppliers (organization_id, name, email, notes) values
    (v_org, 'Harbor Knit Co.', 'sales@harborknit.example.com', 'Knitwear and accessories.') returning id into v_s2;
  insert into public.suppliers (organization_id, name, email, phone) values
    (v_org, 'Ridge Canvas Works', 'hello@ridgecanvas.example.com', '+1 555 0144') returning id into v_s3;

  insert into public.purchase_orders (organization_id, supplier_id, po_number, status, expected_at, notes, created_at, ordered_at, received_at)
  values (v_org, v_s1, 1, 'received', (now() - interval '33 days')::date, 'Spring restock', now() - interval '40 days', now() - interval '40 days', now() - interval '30 days')
  returning id into v_po;
  insert into public.purchase_order_items (organization_id, po_id, variant_id, qty_ordered, qty_received, unit_cost_cents)
  select v_org, v_po, v.id, 40, 40, v.cost_cents from public.product_variants v where v.organization_id = v_org order by v.sku limit 2;
  update public.inventory_levels l set on_hand = on_hand + 40
  where l.warehouse_id = v_wh1 and l.variant_id in (select variant_id from public.purchase_order_items where po_id = v_po);
  insert into public.inventory_movements (organization_id, variant_id, warehouse_id, delta, reason, reference_type, reference_id, note, created_at)
  select v_org, variant_id, v_wh1, 40, 'restock', 'purchase_order', v_po, 'PO #1', now() - interval '30 days'
  from public.purchase_order_items where po_id = v_po;

  insert into public.purchase_orders (organization_id, supplier_id, po_number, status, expected_at, created_at, ordered_at)
  values (v_org, v_s2, 2, 'ordered', (now() + interval '9 days')::date, now() - interval '5 days', now() - interval '5 days') returning id into v_po;
  insert into public.purchase_order_items (organization_id, po_id, variant_id, qty_ordered, unit_cost_cents)
  select v_org, v_po, v.id, 100, v.cost_cents from public.product_variants v where v.organization_id = v_org order by v.sku offset 10 limit 2;

  insert into public.purchase_orders (organization_id, supplier_id, po_number, status, notes, created_at)
  values (v_org, v_s3, 3, 'draft', 'Tote reorder, pending approval', now() - interval '1 day') returning id into v_po;
  insert into public.purchase_order_items (organization_id, po_id, variant_id, qty_ordered, unit_cost_cents)
  select v_org, v_po, v.id, 60, v.cost_cents from public.product_variants v where v.organization_id = v_org order by v.sku offset 20 limit 1;

  insert into public.customer_notes (organization_id, customer_id, body)
  select v_org, id, 'Prefers email over phone. Asked about the winter range.' from public.customers where organization_id = v_org order by email limit 1;
  insert into public.customer_notes (organization_id, customer_id, body)
  select v_org, id, 'Wholesale enquiry, follow up next quarter.' from public.customers where organization_id = v_org order by email offset 1 limit 1;

  -- a few variants fall below threshold via a recorded cycle count, so alerts have real data
  for rec in
    select l.variant_id, l.warehouse_id, l.on_hand, l.reserved
    from public.inventory_levels l
    where l.variant_id in (select id from public.product_variants where organization_id = v_org order by sku limit 5 offset 3)
  loop
    v_n := greatest(rec.reserved, floor(random() * 3)::int);
    update public.inventory_levels set on_hand = v_n where variant_id = rec.variant_id and warehouse_id = rec.warehouse_id;
    if v_n <> rec.on_hand then
      insert into public.inventory_movements (organization_id, variant_id, warehouse_id, delta, reason, note)
      values (v_org, rec.variant_id, rec.warehouse_id, v_n - rec.on_hand, 'adjustment', 'Cycle count correction');
    end if;
  end loop;
end $$;
