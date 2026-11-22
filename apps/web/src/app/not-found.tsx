import Image from "next/image";
import Link from "next/link";
import { PRODUCT } from "@/config/product";

export default function NotFound() {
  return (
    <main className="pt-safe pb-safe grid min-h-dvh place-items-center px-6 text-center">
      <div className="space-y-5">
        <Image src="/brand/logo-full.png" alt={PRODUCT.displayName} width={160} height={160} className="mx-auto rounded-ui dark:invert" />
        <h1 className="font-display text-3xl">Page not found</h1>
        <p className="text-ink-3">That page does not exist.</p>
        <Link href="/" className="inline-flex min-h-11 items-center rounded-ui bg-inverse px-5 text-sm font-medium text-on-inverse">
          Back to Home
        </Link>
      </div>
    </main>
  );
}
