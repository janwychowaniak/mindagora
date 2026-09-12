import { z } from "zod";

// Shared by POST /api/auth/login and POST /api/auth/register. The password minimum mirrors
// `minimum_password_length` in supabase/config.toml; Supabase enforces it again server-side.
export const authCredentialsSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export type AuthCredentials = z.infer<typeof authCredentialsSchema>;
