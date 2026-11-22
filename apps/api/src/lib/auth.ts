import { createClient } from "@supabase/supabase-js";
import { AuthUserSchema, type AuthUser } from "@justlakshmi/shared";

export interface TokenVerifier {
  verifyAccessToken(accessToken: string): Promise<AuthUser | null>;
}

/** Extracts the raw token from an `Authorization: Bearer <token>` header. */
export function extractBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) return null;
  const parts = authorizationHeader.trim().split(/\s+/);
  if (parts.length !== 2) return null;
  const [scheme, token] = parts;
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") return null;
  return token;
}

/**
 * Verifies Supabase Auth access tokens server-side using ONLY the publishable key.
 * Never uses a service-role key and never trusts client-supplied user IDs.
 */
export function createSupabaseTokenVerifier(supabaseUrl: string, supabasePublishableKey: string): TokenVerifier {
  const client = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return {
    async verifyAccessToken(accessToken: string): Promise<AuthUser | null> {
      const { data, error } = await client.auth.getUser(accessToken);
      if (error || !data.user) return null;

      const parsed = AuthUserSchema.safeParse({
        id: data.user.id,
        email: data.user.email ?? null,
        provider: typeof data.user.app_metadata?.provider === "string" ? data.user.app_metadata.provider : null,
        role: data.user.role ?? null,
      });

      return parsed.success ? parsed.data : null;
    },
  };
}
