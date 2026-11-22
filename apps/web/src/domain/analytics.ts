import type { Category, ISODate, TaskOccurrence, TaskTemplate } from "@justlakshmi/shared";
import { addDays } from "@/lib/dates";
import { occursOn } from "./recurrence";

export type DayCompletion = {
  date: ISODate;
  scheduled: number;
  completed: number;
};

export function percent(completed: number, scheduled: number): number {
  return scheduled === 0 ? 0 : Math.round((completed / scheduled) * 100);
}

export function completionFromOccurrences(date: ISODate, occurrences: readonly TaskOccurrence[]): DayCompletion {
  const forDay = occurrences.filter((o) => o.date === date);
  const completed = forDay.filter((o) => o.completed).length;
  return { date, scheduled: forDay.length, completed };
}

export function sumCompletion(days: readonly DayCompletion[]): { scheduled: number; completed: number; percent: number } {
  const scheduled = days.reduce((n, d) => n + d.scheduled, 0);
  const completed = days.reduce((n, d) => n + d.completed, 0);
  return { scheduled, completed, percent: percent(completed, scheduled) };
}

/**
 * Individual habit streak: consecutive scheduled dates completed, ending at `today`.
 * Unscheduled days NEVER break a streak. If today is still pending, it does not
 * break an active streak from prior scheduled days.
 */
export function habitStreak(
  template: TaskTemplate,
  today: ISODate,
  isDone: (templateId: string, date: ISODate) => boolean,
  lookbackDays = 180,
): number {
  if (template.recurrence.kind === "once") return 0;
  let streak = 0;
  for (let i = 0; i <= lookbackDays; i++) {
    const date = addDays(today, -i);
    if (!occursOn(template.recurrence, date)) continue;
    if (isDone(template.id, date)) {
      streak += 1;
    } else if (i === 0) {
      continue;
    } else {
      break;
    }
  }
  return streak;
}

/** Overall daily consistency streak: consecutive days with scheduled tasks >= threshold%. */
export function overallStreak(days: readonly DayCompletion[], threshold = 70): number {
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const day = days[i];
    if (!day || day.scheduled === 0) continue;
    if (percent(day.completed, day.scheduled) >= threshold) streak += 1;
    else if (i === days.length - 1) continue;
    else break;
  }
  return streak;
}

export type CategorySummary = {
  categoryId: string;
  name: string;
  scheduled: number;
  completed: number;
  percent: number;
};

export function categoryBreakdown(
  occurrences: readonly TaskOccurrence[],
  categories: readonly Category[],
): CategorySummary[] {
  const map = new Map<string, { scheduled: number; completed: number }>();
  for (const occ of occurrences) {
    const key = occ.categoryIdSnapshot ?? "uncategorized";
    const cur = map.get(key) ?? { scheduled: 0, completed: 0 };
    cur.scheduled += 1;
    if (occ.completed) cur.completed += 1;
    map.set(key, cur);
  }

  return Array.from(map.entries())
    .map(([categoryId, stats]) => ({
      categoryId,
      name:
        categoryId === "uncategorized"
          ? "Uncategorized"
          : (categories.find((c) => c.id === categoryId)?.name ?? "Uncategorized"),
      scheduled: stats.scheduled,
      completed: stats.completed,
      percent: percent(stats.completed, stats.scheduled),
    }))
    .sort((a, b) => b.scheduled - a.scheduled);
}
