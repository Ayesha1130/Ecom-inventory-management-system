"use client";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { createOrganizationAction } from "@/app/actions/org";
import { createOrgSchema, type CreateOrgValues } from "@/lib/validators/org";
import { slugify } from "@/lib/slug";

export function OnboardingForm() {
  const [pending, start] = useTransition();
  const [formError, setFormError] = useState<string>();
  const { register, handleSubmit, setValue, setError, formState: { errors, dirtyFields } } =
    useForm<CreateOrgValues>({ resolver: zodResolver(createOrgSchema), defaultValues: { name: "", slug: "" } });

  const nameField = register("name");
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit((values) =>
        start(async () => {
          setFormError(undefined);
          const res = await createOrganizationAction(values);
          if (res?.field === "slug") setError("slug", { message: res.error });
          else if (res?.error) setFormError(res.error);
        }),
      )}
    >
      <Field
        id="name"
        label="Business name"
        autoComplete="organization"
        error={errors.name?.message}
        {...nameField}
        onChange={(e) => {
          void nameField.onChange(e);
          if (!dirtyFields.slug) setValue("slug", slugify(e.target.value), { shouldValidate: false });
        }}
      />
      <Field id="slug" label="Workspace URL" hint="Appears as /o/your-url" error={errors.slug?.message} {...register("slug")} />
      {formError && <p role="alert" className="text-sm text-red-300">{formError}</p>}
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Creating…" : "Create workspace"}</Button>
    </form>
  );
}
