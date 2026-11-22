"use client";

import { useEffect } from "react";

/** Registers the service worker in production only, so dev HMR is never cached. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Registration failure is non-fatal: the app works online without it.
    });
  }, []);

  return null;
}
