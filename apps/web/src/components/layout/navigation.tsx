"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, PRODUCT, SETTINGS_HREF, type NavItem } from "@/config/product";
import { cn } from "@/lib/cn";
import { Settings } from "lucide-react";
import { Logo } from "./logo";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, active, variant }: { item: NavItem; active: boolean; variant: "bottom" | "side" }) {
  const Icon = item.icon;
  if (variant === "bottom") {
    return (
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium transition-colors",
          active ? "text-ink" : "text-ink-3",
        )}
      >
        <span
          className={cn(
            "grid h-7 w-12 place-items-center rounded-full border transition-[background-color,border-color,transform] duration-150 active:scale-95",
            active
              ? "border-line-strong bg-sk-lavender/65 text-ink dark:bg-sk-violet-soft dark:text-sk-lavender"
              : "border-transparent bg-transparent",
          )}
        >
          <Icon aria-hidden className="size-5" strokeWidth={active ? 2.25 : 1.75} />
        </span>
        {item.label}
      </Link>
    );
  }
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-ui border px-3 text-sm font-medium transition-[background-color,border-color,color] duration-150",
        active
          ? "border-line-strong bg-sk-lavender/55 text-ink sk-card-shadow dark:bg-sk-violet-soft dark:text-sk-lavender"
          : "border-transparent text-ink-3 hover:bg-surface-2 hover:text-ink",
      )}
    >
      <Icon aria-hidden className="size-5" strokeWidth={active ? 2.25 : 1.75} />
      {item.label}
    </Link>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="pb-safe pl-safe pr-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface lg:hidden"
    >
      <div className="mx-auto flex max-w-xl">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} variant="bottom" />
        ))}
      </div>
    </nav>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface p-4 lg:flex">
      <Link href="/" className="mb-8 mt-2 px-2" aria-label={`${PRODUCT.displayName} home`}>
        <Logo />
      </Link>
      <nav aria-label="Primary" className="flex flex-1 flex-col gap-1.5">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} variant="side" />
        ))}
      </nav>
      <div className="space-y-3 border-t border-line pt-4">
        <Link
          href={SETTINGS_HREF}
          aria-current={isActive(pathname, SETTINGS_HREF) ? "page" : undefined}
          className={cn(
            "flex min-h-11 items-center gap-3 rounded-ui border px-3 text-sm font-medium transition-colors",
            isActive(pathname, SETTINGS_HREF)
              ? "border-line-strong bg-sk-lavender/55 text-ink sk-card-shadow dark:bg-sk-violet-soft dark:text-sk-lavender"
              : "border-transparent text-ink-3 hover:bg-surface-2 hover:text-ink",
          )}
        >
          <Settings aria-hidden className="size-5" strokeWidth={1.75} />
          Settings
        </Link>
        <p className="px-3 text-xs text-ink-3">{PRODUCT.tagline}</p>
      </div>
    </aside>
  );
}
