"use client";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { loginAction, signupAction } from "@/app/actions/auth";
import { loginSchema, signupSchema, type LoginValues, type SignupValues } from "@/lib/validators/auth";

export function LoginForm({ next }: { next?: string }) {
  const [pending, start] = useTransition();
  const [formError, setFormError] = useState<string>();
  const { register, handleSubmit, formState: { errors } } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit((values) =>
        start(async () => {
          setFormError(undefined);
          const res = await loginAction(values, next);
          if (res?.error) setFormError(res.error);
        }),
      )}
    >
      <Field id="email" label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register("email")} />
      <Field id="password" label="Password" type="password" autoComplete="current-password" error={errors.password?.message} {...register("password")} />
      {formError && <p role="alert" className="text-sm text-red-300">{formError}</p>}
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Signing in…" : "Sign in"}</Button>
    </form>
  );
}

export function SignupForm() {
  const [pending, start] = useTransition();
  const [formError, setFormError] = useState<string>();
  const { register, handleSubmit, formState: { errors } } = useForm<SignupValues>({ resolver: zodResolver(signupSchema) });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit((values) =>
        start(async () => {
          setFormError(undefined);
          const res = await signupAction(values);
          if (res?.error) setFormError(res.error);
          if (res?.message) toast.success(res.message);
        }),
      )}
    >
      <Field id="fullName" label="Full name" autoComplete="name" error={errors.fullName?.message} {...register("fullName")} />
      <Field id="email" label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register("email")} />
      <Field id="password" label="Password" type="password" autoComplete="new-password" hint="At least 8 characters." error={errors.password?.message} {...register("password")} />
      {formError && <p role="alert" className="text-sm text-red-300">{formError}</p>}
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Creating account…" : "Create account"}</Button>
    </form>
  );
}
