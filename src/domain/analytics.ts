import { templatesOn } from "@/domain/recurrence";
import { addDays } from "@/lib/dates";
import type { DayCompletion, ISODate, TaskTemplate } from "@/types";

export function completionOn(
  templates: readonly TaskTemplate[],
  date: ISODate,
  isDone: (templateId: string, date: ISODate) => boolean,
): DayCompletion {
  const scheduled = templatesOn(templates, date);
  const completed = scheduled.filter((t) => isDone(t.id, date)).length;
  return { date, scheduled: scheduled.length, completed };
}

export function percent(completed: number, scheduled: number): number {
  return scheduled === 0 ? 0 : Math.round((completed / scheduled) * 100);
}

export function sumCompletion(days: readonly DayCompletion[]): { scheduled: number; completed: number; percent: number } {
  const scheduled = days.reduce((n, d) => n + d.scheduled, 0);
  const completed = days.reduce((n, d) => n + d.completed, 0);
  return { scheduled, completed, percent: percent(completed, scheduled) };
}

/**
 * Habit streak: consecutive scheduled dates completed, ending at `today`.
 * Unscheduled days never break a streak. If today is still pending it is skipped
 * rather than counted as a miss, so a streak is never broken by the current day.
 */
export function habitStreak(
  template: TaskTemplate,
  today: ISODate,
  isDone: (templateId: string, date: ISODate) => boolean,
  lookbackDays = 120,
): number {
  let streak = 0;
  for (let i = 0; i <= lookbackDays; i++) {
    const date = addDays(today, -i);
    if (templatesOn([template], date).length === 0) continue;
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

/** A day counts toward the overall streak when at least `threshold` percent was completed. */
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
