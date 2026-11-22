/**
 * In-memory Google Drive access token store.
 *
 * SECURITY INVARIANT:
 * Google Drive access tokens MUST stay in memory only.
 * Never persist them to localStorage, sessionStorage, IndexedDB, cookies, URLs, or logs.
 */

type TokenRecord = {
  accessToken: string;
  expiresAtMs: number;
};

let currentToken: TokenRecord | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function setDriveAccessToken(accessToken: string, expiresInSeconds: number): void {
  // Subtract a 60-second safety margin so we prompt reauth before hard expiry.
  const safeMs = Math.max(expiresInSeconds - 60, 0) * 1000;
  currentToken = {
    accessToken,
    expiresAtMs: Date.now() + safeMs,
  };
  notify();
}

export function getDriveAccessToken(): string | null {
  if (!currentToken) return null;
  if (Date.now() >= currentToken.expiresAtMs) {
    currentToken = null;
    notify();
    return null;
  }
  return currentToken.accessToken;
}

export function clearDriveAccessToken(): void {
  if (currentToken !== null) {
    currentToken = null;
    notify();
  }
}

export function hasActiveDriveToken(): boolean {
  return getDriveAccessToken() !== null;
}

export function subscribeDriveToken(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
