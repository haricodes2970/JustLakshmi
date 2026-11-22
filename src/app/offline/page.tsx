import type { Metadata } from "next";
import Image from "next/image";
import { PRODUCT } from "@/config/product";

export const metadata: Metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="pt-safe pb-safe grid min-h-dvh place-items-center px-6 text-center">
      <div className="max-w-sm space-y-5">
        <Image src="/brand/logo-full.png" alt={PRODUCT.displayName} width={160} height={160} className="mx-auto rounded-ui dark:invert" />
        <h1 className="font-display text-3xl">You are offline</h1>
        <p className="text-ink-3">
          This page has not been saved on this device yet. Reconnect and open the app once to make it available offline.
        </p>
      </div>
    </main>
  );
}
