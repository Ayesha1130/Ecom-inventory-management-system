import { z } from "zod";

export const createOrgSchema = z.object({
  name: z.string().trim().min(2, "Enter at least 2 characters.").max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Use at least 3 characters.")
    .max(40)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Lowercase letters, numbers and single hyphens only."),
});
export type CreateOrgValues = z.infer<typeof createOrgSchema>;
