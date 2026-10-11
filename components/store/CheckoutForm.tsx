"use client";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { startCheckoutAction } from "@/app/actions/checkout";
import { COUNTRIES, checkoutSchema, type CheckoutValues } from "@/lib/validators/checkout";

const input = "w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-violet aria-invalid:border-red-600";

function Row({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm">{label}</label>
      {children}
      {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}

export function CheckoutForm({ slug, disabledReason }: { slug: string; disabledReason?: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const { register, handleSubmit, formState: { errors } } = useForm<CheckoutValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { email: "", name: "", line1: "", line2: "", city: "", region: "", postal_code: "", country: "US" },
  });

  return (
    <form noValidate className="space-y-8"
      onSubmit={handleSubmit((values) => start(async () => {
        setError(undefined);
        const res = await startCheckoutAction(slug, values); // redirects to Stripe on success
        if (res?.error) setError(res.error);
      }))}>
      <fieldset disabled={pending || !!disabledReason} className="space-y-4">
        <legend className="mb-1 font-display text-2xl">Contact</legend>
        <Row id="email" label="Email" error={errors.email?.message}>
          <input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} className={input} {...register("email")} />
        </Row>
        <Row id="name" label="Full name" error={errors.name?.message}>
          <input id="name" autoComplete="name" aria-invalid={!!errors.name} className={input} {...register("name")} />
        </Row>
      </fieldset>

      <fieldset disabled={pending || !!disabledReason} className="space-y-4">
        <legend className="mb-1 font-display text-2xl">Shipping address</legend>
        <Row id="line1" label="Address" error={errors.line1?.message}>
          <input id="line1" autoComplete="address-line1" aria-invalid={!!errors.line1} className={input} {...register("line1")} />
        </Row>
        <Row id="line2" label="Apartment, suite (optional)">
          <input id="line2" autoComplete="address-line2" className={input} {...register("line2")} />
        </Row>
        <div className="grid gap-4 sm:grid-cols-2">
          <Row id="city" label="City" error={errors.city?.message}>
            <input id="city" autoComplete="address-level2" aria-invalid={!!errors.city} className={input} {...register("city")} />
          </Row>
          <Row id="region" label="State / region (optional)">
            <input id="region" autoComplete="address-level1" className={input} {...register("region")} />
          </Row>
          <Row id="postal_code" label="Postal code" error={errors.postal_code?.message}>
            <input id="postal_code" autoComplete="postal-code" aria-invalid={!!errors.postal_code} className={input} {...register("postal_code")} />
          </Row>
          <Row id="country" label="Country" error={errors.country?.message}>
            <select id="country" autoComplete="country" className={input} {...register("country")}>
              {COUNTRIES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
          </Row>
        </div>
      </fieldset>

      {(error || disabledReason) && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error ?? disabledReason}</p>}
      <button type="submit" disabled={pending || !!disabledReason}
        className="w-full rounded-full bg-violet px-6 py-3.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">
        {pending ? "Preparing secure payment…" : "Continue to payment"}
      </button>
      <p className="text-center text-xs text-muted">You&apos;ll pay on Stripe&apos;s secure page. Stock is held for you while you pay.</p>
    </form>
  );
}
