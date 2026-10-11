# Security model

What is enforced, where, and **how it is verified**. "Tested" means an automated test in this repo exercises it; "reviewed" means designed and implemented but not covered by a test here.

| Threat | Mitigation | Status |
|---|---|---|
| Reading or writing another tenant's data | RLS on every tenant table; composite FKs prevent cross-tenant references | Tested (`rls`, `inventory`, `ops`, `team` suites) |
| Privilege escalation via a column (e.g. making your org a public demo) | Column-level grants: admins may update only `name, currency`; `is_demo` and `slug` are not writable | Tested |
| Role escalation | Functions refuse granting/touching roles above your own, changing your own role, or removing the last owner | Tested (`team`) |
| Browser marks an order paid / mints orders | No client write policies on orders; creation and payment confirmation are `service_role`-only functions | Tested |
| Forged or replayed Stripe webhooks | Signature verified over the raw body with Stripe's library; timestamp tolerance rejects replays | Tested with real signatures (`webhook`) |
| Duplicate webhook delivery double-applying | `processed_events` insert in the same transaction as the effect | Tested |
| Overselling / race on last item | Row locks in `(variant, warehouse)` order, `CHECK (reserved <= on_hand)` | Tested sequentially; **true concurrent writers not tested** (single-connection test DB) |
| Refund issued but not recorded | Validate and authorize everything before calling Stripe; deterministic idempotency key; retry records without double-refund | Reviewed (Stripe call not exercised) |
| Guessing cart or order tokens | 256-bit random tokens; only SHA-256 stored; secret-bearing pages send `Referrer-Policy: no-referrer` and `noindex` | Tested (hashing, isolation) |
| Order enumeration | Lookup needs order number **and** email; identical response for "not found" | Reviewed |
| Brute force / scraping of anonymous endpoints | DB-backed fixed-window rate limits on cart, checkout, login, signup, demo, invite, tracking; hashed IP keys; service-role only | Tested (SQL); **fails open** if the service key is absent |
| Malicious file upload | Magic-byte sniffing (JPEG/PNG/WebP only, no SVG), 5 MB cap, server-chosen filename, bucket MIME allow-list, org-scoped storage policy | Tested (sniffing); storage policy not run (needs Supabase) |
| CSV/spreadsheet formula injection | Text cells beginning `= + - @ \t \r` are prefixed with `'` | Tested |
| HTML injection in emails | All interpolated values HTML-escaped | Tested |
| XSS / clickjacking / mixed content | CSP (no framing, no plugins, restricted sources), `X-Frame-Options`, `nosniff`, HSTS in production | Header values tested; **not exercised in a real browser here** (an e2e check is in CI) |
| Open redirect via `?next=` | Only same-site relative paths accepted | Tested |
| Leaking secrets to the client | Service key behind `server-only`; Stripe key server-only; live Stripe keys refused unless explicitly allowed | Build-enforced |
| Secrets in the audit log / errors | DB errors are mapped to safe messages; unknown errors never echo internals | Tested (`friendlyDbError`) |
| Existence leaks | Non-members get 404 for orgs; unpublished stores 404; login errors are uniform | Reviewed |

## Known limitations (read before going public)

1. **CSP allows `'unsafe-inline'` scripts** because Next injects inline bootstrap code. A nonce-based CSP via middleware would be stricter.
2. **Rate limiting trusts `X-Forwarded-For`**, correct behind Vercel (it overwrites the header) but spoofable elsewhere. It also **fails open** by design.
3. **Fixed windows** allow up to 2x bursts at a window boundary.
4. **Anonymous sign-ins** power the demo; enable CAPTCHA or Supabase's anonymous rate limits before exposing it publicly.
5. **No automated dependency or secret scanning** is configured; enable Dependabot / GitHub secret scanning.
6. Profiles expose co-members' emails to each other (needed for team lists).
7. Stripe, Supabase Auth/Storage and Resend integrations were **never run live** during development.
