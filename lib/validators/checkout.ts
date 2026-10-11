import { z } from "zod";

export const COUNTRIES = [
  ["US", "United States"], ["CA", "Canada"], ["GB", "United Kingdom"], ["AU", "Australia"], ["DE", "Germany"],
  ["FR", "France"], ["IN", "India"], ["PK", "Pakistan"], ["AE", "United Arab Emirates"],
] as const;
const codes = COUNTRIES.map((c) => c[0]) as unknown as [string, ...string[]];

export const checkoutSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
  name: z.string().trim().min(2, "Enter your full name.").max(100),
  line1: z.string().trim().min(1, "Enter your street address.").max(120),
  line2: z.string().trim().max(120),
  city: z.string().trim().min(1, "Enter your city.").max(80),
  region: z.string().trim().max(80),
  postal_code: z.string().trim().min(1, "Enter your postal code.").max(20),
  country: z.enum(codes, { message: "Choose a country." }),
});
export type CheckoutValues = z.infer<typeof checkoutSchema>;
