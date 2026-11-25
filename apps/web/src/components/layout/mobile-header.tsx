import Link from "next/link";
import { Settings } from "lucide-react";
import { PRODUCT, SETTINGS_HREF } from "@/config/product";
import { Logo } from "./logo";

/** Compact mobile top bar. Hidden on desktop where the sidebar carries branding. */
export function MobileHeader() {
  return (
    <header className="pt-safe pl-safe pr-safe sticky top-0 z-20 border-b border-line bg-bg lg:hidden">
      <div className="flex h-14 items-center justify-between px-4">
        <Link href="/" aria-label={`${PRODUCT.displayName} home`}>
          <Logo />
        </Link>
        <Link
          href={SETTINGS_HREF}
          aria-label="Settings"
          className="-mr-2 grid size-11 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <Settings aria-hidden className="size-5" strokeWidth={1.75} />
        </Link>
      </div>
    </header>
  );
}
