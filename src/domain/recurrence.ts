import { WEEKDAY_LABELS, weekdayOf } from "@/lib/dates";
import type { ISODate, Recurrence, TaskTemplate, Weekday } from "@/types";

/** Pure: does a recurrence produce an occurrence on `date`? */
export function occursOn(recurrence: Recurrence, date: ISODate): boolean {
  switch (recurrence.kind) {
    case "once":
      return recurrence.date === date;
    case "daily":
      return true;
    case "weekdays":
      return recurrence.days.includes(weekdayOf(date));
  }
}

export function templatesOn(templates: readonly TaskTemplate[], date: ISODate): TaskTemplate[] {
  return templates.filter((t) => occursOn(t.recurrence, date));
}

const WEEKDAYS_MON_FRI: readonly Weekday[] = [1, 2, 3, 4, 5];
const WEEKEND: readonly Weekday[] = [0, 6];

function sameDays(a: readonly Weekday[], b: readonly Weekday[]) {
  return a.length === b.length && b.every((d) => a.includes(d));
}

export function describeRecurrence(recurrence: Recurrence): string {
  switch (recurrence.kind) {
    case "once":
      return "One time";
    case "daily":
      return "Every day";
    case "weekdays": {
      if (sameDays(recurrence.days, WEEKDAYS_MON_FRI)) return "Weekdays";
      if (sameDays(recurrence.days, WEEKEND)) return "Weekends";
      const ordered = [...recurrence.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
      return ordered.map((d) => WEEKDAY_LABELS[d]).join(", ");
    }
  }
}
