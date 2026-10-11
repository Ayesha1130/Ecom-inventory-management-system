# Deployment

Everything below is documented, not yet performed: the project was built without access to Vercel, a Supabase project, or Stripe.

## 1. Supabase
1. Create a project. Install the Supabase CLI, then `supabase link --project-ref <ref>`.
2. Apply the schema: `supabase db push` (runs `supabase/migrations/*` in order).
3. Seed the demo business: run `supabase/seed.sql` (SQL editor or `psql`). **Re-running it resets the demo** (it deletes and rebuilds the demo org). Never run it against an organization that isn't the demo.
4. **Auth settings**
   - Enable *Anonymous sign-ins* (powers the read-only demo). Add CAPTCHA / rate limits.
   - Site URL = your production URL. Add `https://<domain>/auth/callback` and `http://localhost:3000/auth/callback` to the redirect allow-list.
   - Email confirmation may stay on.
5. **Storage**: the `product-images` bucket and policies are created by migration `...0300_storage.sql`. Confirm it exists and is public-read.
6. **Scheduled jobs** (Database → Extensions → enable `pg_cron`):
   ```sql
   select cron.schedule('expire-orders',  '*/5 * * * *', 'select public.release_expired_reservations()');
   select cron.schedule('purge-carts',    '17 3 * * *',  'select public.purge_expired_carts()');
   select cron.schedule('purge-ratelimit','23 3 * * *',  'select public.purge_rate_limits()');
   ```
7. Copy the project URL, `anon` key and `service_role` key.

## 2. Stripe (test mode)
1. Use **test** keys only (`sk_test_...`); live keys are refused unless `STRIPE_ALLOW_LIVE=true`.
2. Developers → Webhooks → add endpoint `https://<domain>/api/webhooks/stripe` for:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`.
3. Copy the signing secret (`whsec_...`).
4. Local development: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.
5. Test card `4242 4242 4242 4242`, any future expiry and CVC.

## 3. Vercel
1. Import the repo. Framework: Next.js. Node 22.
2. Environment variables (Production **and** Preview):

| Variable | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Bypasses RLS. Mark sensitive. |
| `STRIPE_SECRET_KEY` | **server only** | `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | **server only** | `whsec_...` |
| `NEXT_PUBLIC_SITE_URL` | public | e.g. `https://nexora.example.com` (Stripe redirect URLs, email links) |
| `RESEND_API_KEY`, `EMAIL_FROM` | server only | Optional. Without them emails are skipped (and logged as skipped). |
| `CRON_SECRET` | server only | Only if you use `/api/cron/expire-orders` instead of pg_cron |

3. Deploy. The marketing site works with no variables; features switch on as you add them.

## 4. Post-deploy checklist
- [ ] `/` loads; `curl -I` shows `Content-Security-Policy` and `Strict-Transport-Security`
- [ ] `/demo` → "Enter the demo" reaches the dashboard with a read-only banner
- [ ] Demo storefront `/s/alder-finch`: add to cart, check out with the test card, see the confirmation page update
- [ ] The order appears in the admin **and** the Stripe dashboard shows the webhook delivered (200)
- [ ] Resend the same event from Stripe: order and stock unchanged
- [ ] A new sign-up can create a workspace; a second account cannot see its data
- [ ] An invitation link works for the invited email only
- [ ] pg_cron jobs show in `cron.job`
- [ ] `E2E_BACKEND=1 npx playwright test` passes against the deployed seed

## Operating notes
- **Resetting the demo**: re-run `seed.sql`. Orders placed on the demo storefront are wiped.
- **Backups / PITR** are your Supabase plan's responsibility.
- **Rotating secrets**: rotate the service-role key and `whsec_` in Vercel, then redeploy.
