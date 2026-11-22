import { z } from "zod";

/**
 * Verified authenticated user identity derived strictly from a server-verified
 * Supabase Auth JWT. Clients must never supply or override `id`.
 */
export const AuthUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().nullable(),
  provider: z.string().nullable(),
  role: z.string().nullable(),
});

export type AuthUser = z.infer<typeof AuthUserSchema>;

export const AuthMeResponseSchema = z.object({
  user: AuthUserSchema,
});

export type AuthMeResponse = z.infer<typeof AuthMeResponseSchema>;
