import { z } from "zod";

export const storeSettingsSchema = z.object({
  name: z.string().trim().min(2, "Enter at least 2 characters.").max(80),
  tagline: z.string().trim().max(140, "Keep it under 140 characters."),
  is_published: z.boolean(),
});
export type StoreSettingsValues = z.infer<typeof storeSettingsSchema>;
