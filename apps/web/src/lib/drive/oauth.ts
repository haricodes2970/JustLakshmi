import { DRIVE_LEAST_PRIVILEGE_SCOPE } from "@justlakshmi/shared";
import { clearDriveAccessToken, getDriveAccessToken, setDriveAccessToken } from "./token-memory";

type GisTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type GisGlobal = {
  accounts?: {
    oauth2?: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        prompt?: string;
        callback: (response: GisTokenResponse) => void;
        error_callback?: (err: { type?: string; message?: string }) => void;
      }) => { requestAccessToken: (override?: { prompt?: string }) => void };
      revoke: (token: string, done?: () => void) => void;
    };
  };
};

let gisLoader: Promise<void> | null = null;

function loadGisScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Browser environment required."));
  const g = (window as unknown as { google?: GisGlobal }).google;
  if (g?.accounts?.oauth2) return Promise.resolve();
  if (gisLoader) return gisLoader;

  gisLoader = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Identity Services script."));
    document.head.appendChild(script);
  });
  return gisLoader;
}

export function getGoogleClientId(): string | null {
  const id = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
  return id || null;
}

/**
 * Separate Google Drive authorization using ONLY the least-privilege `drive.file` scope.
 * Keeps the returned access token strictly in memory.
 */
export async function requestDriveAuthorization(options?: { promptConsent?: boolean }): Promise<string> {
  const clientId = getGoogleClientId();
  if (!clientId) {
    throw new Error("Google OAuth Client ID is not configured (NEXT_PUBLIC_GOOGLE_CLIENT_ID).");
  }

  await loadGisScript();
  const oauth2 = (window as unknown as { google?: GisGlobal }).google?.accounts?.oauth2;
  if (!oauth2) {
    throw new Error("Google OAuth client is unavailable.");
  }

  return new Promise<string>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_LEAST_PRIVILEGE_SCOPE,
      prompt: options?.promptConsent ? "consent" : "",
      callback(resp) {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error_description || resp.error || "Drive authorization was cancelled."));
          return;
        }
        setDriveAccessToken(resp.access_token, resp.expires_in ?? 3500);
        resolve(resp.access_token);
      },
      error_callback(err) {
        reject(new Error(err.message || err.type || "Google Drive authorization popup failed."));
      },
    });
    client.requestAccessToken();
  });
}

export async function revokeDriveAuthorization(): Promise<void> {
  const token = getDriveAccessToken();
  clearDriveAccessToken();
  if (!token || typeof window === "undefined") return;
  const oauth2 = (window as unknown as { google?: GisGlobal }).google?.accounts?.oauth2;
  if (!oauth2) return;
  await new Promise<void>((resolve) => oauth2.revoke(token, () => resolve()));
}
