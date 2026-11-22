import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export function isSupabaseAuthConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  return Boolean(url && key && !key.startsWith("sb_secret_"));
}

/**
 * Returns a browser Supabase Auth client using ONLY the publishable key.
 * Returns null honestly when environment variables are not configured.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  if (!isSupabaseAuthConfigured()) return null;
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!.trim();

  browserClient = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return browserClient;
}
