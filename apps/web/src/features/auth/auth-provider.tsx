"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { clearDriveAccessToken } from "@/lib/drive/token-memory";
import { getSupabaseClient, isSupabaseAuthConfigured } from "@/lib/supabase";

export type AuthStatus = "loading" | "unconfigured" | "unauthenticated" | "authenticated";

export type SignedInUser = {
  id: string;
  email: string | null;
  displayName: string | null;
};

type AuthContextValue = {
  status: AuthStatus;
  user: SignedInUser | null;
  accessToken: string | null;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function extractUser(session: Session | null): SignedInUser | null {
  if (!session?.user) return null;
  const meta = session.user.user_metadata as Record<string, unknown> | undefined;
  const name = typeof meta?.full_name === "string" ? meta.full_name : typeof meta?.name === "string" ? meta.name : null;
  return {
    id: session.user.id,
    email: session.user.email ?? null,
    displayName: name,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const configured = isSupabaseAuthConfigured();
  const [status, setStatus] = useState<AuthStatus>(configured ? "loading" : "unconfigured");
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;

    let active = true;
    client.auth
      .getSession()
      .then(({ data, error: sessionErr }) => {
        if (!active) return;
        if (sessionErr) {
          setError(sessionErr.message);
          setStatus("unauthenticated");
          return;
        }
        setSession(data.session);
        setStatus(data.session ? "authenticated" : "unauthenticated");
      })
      .catch(() => {
        if (!active) return;
        setError("Unable to check authentication status.");
        setStatus("unauthenticated");
      });

    const { data: sub } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setStatus(nextSession ? "authenticated" : "unauthenticated");
      if (!nextSession) {
        clearDriveAccessToken();
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    const client = getSupabaseClient();
    if (!client) {
      setError("Supabase Auth is not configured in this environment.");
      return;
    }
    const { error: oauthErr } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (oauthErr) {
      setError(oauthErr.message);
    }
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    clearDriveAccessToken();
    const client = getSupabaseClient();
    if (!client) return;
    const { error: signOutErr } = await client.auth.signOut();
    if (signOutErr) {
      setError(signOutErr.message);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: extractUser(session),
      accessToken: session?.access_token ?? null,
      error,
      signInWithGoogle,
      signOut,
      clearError: () => setError(null),
    }),
    [status, session, error, signInWithGoogle, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
