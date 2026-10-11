# Testing

```
npm run check        # typecheck + lint (0 warnings) + all tests + production build
npm test             # 165 tests, ~30s, needs no services
npm run test:e2e     # Playwright (needs `npm run e2e:install` and a built app)
```

## What runs where

| Layer | Tests | How | Verified in this repo's dev environment? |
|---|---|---|---|
| **Database** (migrations, seed, RLS, SQL workflows) | 118 | Real Postgres in-process (PGlite) with Supabase's `auth` shim, running as `anon` / `authenticated` / `service_role` | Yes |
| **Webhook handler** | 10 | Real Stripe signatures verified with Stripe's library, applied to the real SQL functions | Yes |
| **Unit** (validators, CSV, image sniffing, headers, rate-limit keys, cart tokens, money) | 24 | Vitest | Yes |
| **Components + accessibility** | 13 | jsdom + Testing Library + axe-core (marketing page, pricing, FAQ, demo tour) | Yes |
| **End-to-end** | 2 spec files that need no backend (`marketing`, `security`), 2 that need a seeded one (`demo`, `storefront`) | Playwright (Chromium desktop, mobile, reduced-motion) | **No: no browser could be installed in the build sandbox. Type-checked only.** |

Per-suite counts: `db/orders` 29, `db/inventory` 21, `db/ops` 21, `db/storefront` 17, `db/team` 14, `db/rls` 10, `db/ratelimit` 6, `webhook` 10, `marketing` 9, `csv` 5, `security-headers` 5, `demo-tour` 4, `image-type` 4, `validators` 4, `client-key` 3, `storefront-lib` 3.

## The workflows you asked to be tested

| Workflow | Where |
|---|---|
| Login and authorization | RLS, role and demo-session tests (`db/rls`, `db/team`); auth gating in `e2e/security` |
| Tenant data isolation | `db/rls`, plus a "does not leak another tenant" case in every suite |
| Product creation | `db/inventory` (`save_product` incl. atomic rollback) |
| Inventory adjustments / transfers | `db/inventory`, ledger invariants re-checked in `db/orders` and `db/ops` |
| Order placement | `db/orders` (numbering, snapshots, reservation, oversell race, supersede) |
| Checkout webhook processing | `webhook` (signature, replay, tamper), `db/orders` |
| Duplicate webhook delivery | `webhook` (3 repeats), `db/orders` |
| Cancellation and stock release | `db/orders` (expiry, session-expired, staff cancel, refund + restock) |
| Unauthorized access attempts | every suite; `e2e/security` |

## Honest gaps
- **Concurrency**: the database tests use one connection, so row-lock behavior under truly simultaneous writers is by design but untested. A load test against a real Postgres (e.g. `pgbench` or k6 hitting `create_order_from_cart` for the last unit) is the right next step.
- **Server actions** are thin and not unit-tested; their logic is in the SQL they call and the validators they use, which are.
- **Stripe, Supabase Auth/Storage, Resend** were never exercised live.
- **Visual regression** is not set up.
- Color contrast is only checked in the browser e2e (jsdom can't compute it).

## Running the backend-dependent e2e specs
1. Apply migrations and seed to a Supabase project (or `supabase start` locally), enable anonymous sign-ins.
2. Export `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (plus `SUPABASE_SERVICE_ROLE_KEY` to enable the rate limiter).
3. `npm run build && E2E_BACKEND=1 npx playwright test`

## Screenshots
`npm run screenshots` writes PNGs to `docs/screenshots/` (marketing always; app screens when `E2E_BACKEND=1`). **None are committed**: they could not be captured in the build environment, and placeholders would be misleading.
