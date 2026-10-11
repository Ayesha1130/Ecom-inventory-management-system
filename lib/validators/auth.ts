import { z } from "zod";

const email = z.string().trim().toLowerCase().email("Enter a valid email address.");
const password = z.string().min(8, "Use at least 8 characters.").max(72, "Use 72 characters or fewer.");

export const loginSchema = z.object({ email, password: z.string().min(1, "Enter your password.") });
export const signupSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name.").max(80),
  email,
  password,
});
export type LoginValues = z.infer<typeof loginSchema>;
export type SignupValues = z.infer<typeof signupSchema>;
