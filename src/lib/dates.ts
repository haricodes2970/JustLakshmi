import type { ISODate, Weekday } from "@/types";

const pad = (n: number) => String(n).padStart(2, "0");

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parses YYYY-MM-DD as a local date (noon avoids DST edge cases). */
export function fromISODate(iso: ISODate): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

export function addDays(iso: ISODate, days: number): ISODate {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function weekdayOf(iso: ISODate): Weekday {
  return fromISODate(iso).getDay() as Weekday;
}

/** Monday-based week containing `iso`. */
export function weekDates(iso: ISODate): ISODate[] {
  const offset = (weekdayOf(iso) + 6) % 7;
  const start = addDays(iso, -offset);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function addMonths(iso: ISODate, months: number): ISODate {
  const d = fromISODate(iso);
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  return toISODate(d);
}

/** Six-row Monday-first grid; `null` cells pad outside the month. */
export function monthGrid(iso: ISODate): (ISODate | null)[] {
  const first = fromISODate(iso);
  first.setDate(1);
  const lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: (ISODate | null)[] = Array.from({ length: lead }, () => null);
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push(toISODate(new Date(first.getFullYear(), first.getMonth(), i, 12)));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function isSameMonth(a: ISODate, b: ISODate): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

export function formatLong(iso: ISODate): string {
  return fromISODate(iso).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function formatMonthYear(iso: ISODate): string {
  return fromISODate(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function weekdayShort(iso: ISODate): string {
  return fromISODate(iso).toLocaleDateString(undefined, { weekday: "short" });
}

export function weekdayInitial(iso: ISODate): string {
  return weekdayShort(iso).slice(0, 1);
}

export function dayOfMonth(iso: ISODate): number {
  return fromISODate(iso).getDate();
}

export function dayOfYear(iso: ISODate): number {
  const d = fromISODate(iso);
  return Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0, 12).getTime()) / 86_400_000);
}

export function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const d = new Date(2000, 0, 1, h ?? 0, m ?? 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function greetingFor(hour: number): string {
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
