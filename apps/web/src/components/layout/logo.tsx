import Image from "next/image";
import { PRODUCT } from "@/config/product";
import { cn } from "@/lib/cn";

/** Lotus mark from the official logo plus an HTML wordmark that stays legible at small sizes. */
export function Logo({ className, showWordmark = true }: { className?: string; showWordmark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Image
        src="/brand/mark.png"
        alt={showWordmark ? "" : PRODUCT.displayName}
        width={320}
        height={229}
        priority
        className="h-7 w-auto mix-blend-multiply dark:invert dark:mix-blend-screen"
      />
      {showWordmark ? (
        <span className="text-lg leading-none tracking-tight">
          Just<span className="font-bold">Lakshmi</span>
        </span>
      ) : null}
    </span>
  );
}
