import { BarChart3, Bot, CalendarDays, Home, ListChecks, type LucideIcon } from "lucide-react";
import { DRIVE_ROOT_FOLDER_NAME } from "@justlakshmi/shared";

/**
 * Product constants. Branding is configurable; persisted data must never depend on it.
 * `driveRootFolderName` is a fixed, user-approved requirement (exact spelling).
 */
export const PRODUCT = {
  displayName: "JustLakshmi",
  tagline: "Plan. Track. Thrive.",
  description: "Daily routines, tasks, calendar and progress, kept calm and simple.",
  driveRootFolderName: DRIVE_ROOT_FOLDER_NAME,
} as const;

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

/** The five primary destinations, in order. */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/routines", label: "Routines", icon: ListChecks },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/ai", label: "Lakshmi AI", icon: Bot },
] as const;

export const SETTINGS_HREF = "/settings";
