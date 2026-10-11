# Architecture

## System overview

```mermaid
flowchart LR
  subgraph Browser
    M[Marketing site<br/>static, 3D hero lazy-loaded]
    A[Admin app<br/>/o/:org/*]
    S[Storefront<br/>/s/:store/*]
  end
  subgraph Next["Next.js on Vercel (App Router, Node runtime)"]
    RSC[Server Components<br/>+ Server Actions]
    WH[/api/webhooks/stripe/]
    CR[/api/cron/expire-orders/]
  end
  subgraph Supabase
    AUTH[Auth<br/>users, anonymous demo sessions]
    PG[(Postgres<br/>RLS + SQL functions)]
    ST[Storage<br/>product-images bucket]
  end
  STRIPE[Stripe<br/>test mode]
  MAIL[Resend<br/>optional]

  M --> RSC
  A -->|user JWT| RSC
  S -->|anon key, no session| RSC
  RSC -->|user JWT: RLS decides| PG
  RSC -->|service role: only service_role functions| PG
  RSC --> ST
  RSC --> AUTH
  RSC -->|create Checkout Session, refunds| STRIPE
  STRIPE -->|signed events| WH --> PG
  RSC --> MAIL
  CR --> PG
```

## The one idea behind everything

**Authorization and invariants live in the database; the application is a thin, validated client of them.**

| Concern | Where it is enforced |
|---|---|
| Tenant isolation | Row Level Security on every tenant table (`is_member()`, `can_read_org()`), plus **composite foreign keys** `(child_id, organization_id)` so a row can't even *reference* another tenant's row |
| Roles | `member_role` enum ordered `staff < manager < admin < owner`; every write policy / function checks a minimum role |
| Stock correctness | `CHECK (reserved <= on_hand)`, an append-only `inventory_movements` ledger, and row-locked SQL functions (no direct writes) |
| Order state | No client write policies on `orders`; only `update_fulfillment`, `cancel_order`, `record_refund` and service-only functions change it |
| Payment idempotency | Stripe event id inserted into `processed_events` **in the same transaction** as its effect |
| Public storefront | Shoppers have *no table privileges*; they call `storefront_*` / `cart_*` functions that return a fixed set of fields |

The app code still re-checks (`requireOrgAccess`, `hasRole`) for good error messages and defense in depth, but removing it would not open a hole.

### Why the Supabase client + SQL functions, not Drizzle
RLS needs the caller's JWT to reach Postgres. The Supabase client does that natively; Drizzle would connect as a privileged role and bypass RLS unless the claims plumbing were rebuilt. Transactional workflows (reserve stock, commit payment) are Postgres functions so each is one atomic transaction. Results are validated at the boundary with Zod rather than trusted from generated types (run `supabase gen types` if you prefer; the schemas would then be the second line of defense).

## Data model (core relationships)

```mermaid
erDiagram
  organizations ||--o{ organization_members : has
  organizations ||--o{ invitations : issues
  organizations ||--|| stores : publishes
  organizations ||--o{ warehouses : owns
  organizations ||--o{ categories : owns
  categories ||--o{ products : groups
  products ||--o{ product_variants : has
  products ||--o{ product_images : has
  product_variants ||--o{ inventory_levels : "stocked as"
  warehouses ||--o{ inventory_levels : holds
  inventory_levels ||--o{ inventory_movements : "ledger"
  stores ||--o{ carts : "guest carts"
  carts ||--o{ cart_items : contains
  organizations ||--o{ customers : has
  customers ||--o{ customer_notes : "notes"
  customers ||--o{ orders : places
  orders ||--o{ order_items : "snapshots"
  orders ||--o{ inventory_reservations : holds
  orders ||--o{ payments : "paid by"
  orders ||--o{ refunds : "refunded by"
  orders ||--o{ order_events : timeline
  organizations ||--o{ suppliers : "buys from"
  suppliers ||--o{ purchase_orders : receives
  purchase_orders ||--o{ purchase_order_items : contains
  product_variants ||--o{ purchase_order_items : ordered
  organizations ||--o{ notifications : emits
  organizations ||--o{ audit_logs : records
  organizations ||--|| subscriptions : "plan record"
```
Supporting tables: `profiles`, `order_counters`, `po_counters` (per-org numbering), `processed_events` (webhook idempotency), `rate_limit_hits`. 31 tables and 66 functions in 8 migrations (`supabase/migrations`).

Key decisions:
- **Money** is integer minor units plus an ISO currency, never floats.
- **Order items snapshot** name, SKU and price, so history survives catalog edits.
- **Segments, stock availability, valuation** are computed, not stored, so they can't drift.
- **Per-organization order and PO numbers** come from counter tables (row-locked upsert) so numbers don't collide under concurrency.

## Stock and order lifecycle

```mermaid
stateDiagram-v2
  [*] --> Pending: create_order_from_cart<br/>reserved += n
  Pending --> Confirmed: confirm_order_payment (webhook)<br/>on_hand -= n, reserved -= n, 'sale' movement
  Pending --> Cancelled: expiry / session expired / staff cancel<br/>reserved -= n
  Cancelled --> Confirmed: payment arrives late and stock still available
  Cancelled --> RefundNeeded: payment arrives late and stock is gone
  Confirmed --> Shipped --> Delivered
  Confirmed --> Cancelled: full refund + restock<br/>on_hand += n, 'return' movement
```

## Checkout request flow

```mermaid
sequenceDiagram
  participant B as Shopper
  participant N as Next.js (server action)
  participant D as Postgres
  participant S as Stripe
  B->>N: submit address (cart cookie)
  N->>N: rate limit, validate (Zod)
  N->>D: create_order_from_cart (service role)
  D-->>N: order + reserved stock (one transaction)
  N->>S: create Checkout Session (idempotency key)
  N->>D: set_checkout_session
  N-->>B: redirect to Stripe
  S-->>N: POST /api/webhooks/stripe (signed)
  N->>N: verify signature on the raw body
  N->>D: confirm_order_payment(event id, ...)
  Note over D: processed_events insert + commit stock + mark paid<br/>in one transaction. Duplicate delivery = no-op.
  N-->>S: 200
  B->>N: confirmation page (secret token) polls until Confirmed
```

## Folder map

```
app/
  (auth)/ login, signup        onboarding/       invite/[token]/
  o/[orgSlug]/...              admin app (dashboard, orders, customers, products, inventory,
                               suppliers, purchase-orders, analytics, storefront, settings, notifications)
  s/[storeSlug]/...            storefront (home, products, category, product, cart, checkout, order, track)
  api/webhooks/stripe, api/cron/expire-orders
  actions/                     server actions (auth, products, inventory, orders, checkout, cart, purchasing, team, crm)
components/  marketing/ app/ store/ ui/
lib/         authz, supabase/{server,public,admin,middleware}, validators/, stripe*, rate-limit, emails, csv, ...
supabase/    migrations/ seed.sql
tests/       db/ (in-process Postgres), unit and component tests      e2e/  Playwright
```
