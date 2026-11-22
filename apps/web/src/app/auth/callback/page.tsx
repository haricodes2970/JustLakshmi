"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    return params.get("error_description") ?? params.get("error");
  });

  useEffect(() => {
    if (error) return;
    const client = getSupabaseClient();
    if (!client) {
      router.replace("/settings");
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (code) {
      client.auth
        .exchangeCodeForSession(code)
        .then(({ error: exchangeErr }) => {
          if (exchangeErr) setError(exchangeErr.message);
          else router.replace("/");
        })
        .catch(() => setError("Authentication callback failed."));
    } else {
      client.auth.getSession().then(() => router.replace("/"));
    }
  }, [error, router]);

  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div className="max-w-sm space-y-4">
        <h1 className="font-display text-2xl">{error ? "Sign-in could not complete" : "Completing sign-in…"}</h1>
        {error ? (
          <>
            <p className="text-sm text-ink-3">{error}</p>
            <Link
              href="/settings"
              className="inline-flex min-h-11 items-center rounded-ui bg-inverse px-5 text-sm font-medium text-on-inverse"
            >
              Back to Settings
            </Link>
          </>
        ) : (
          <p className="text-sm text-ink-3">Verifying your session with Supabase Auth.</p>
        )}
      </div>
    </main>
  );
}
