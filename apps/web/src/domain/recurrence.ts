import type { ISODate, Recurrence, TaskTemplate, Weekday } from "@justlakshmi/shared";
import { WEEKDAY_LABELS, fromISODate, weekdayOf } from "@/lib/dates";

export function occurrenceId(templateId: string, date: ISODate): string {
  return `${templateId}@${date}`;
}

function diffDays(start: ISODate, end: ISODate): number {
  const a = fromISODate(start);
  const b = fromISODate(end);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** Pure: does a recurrence produce an occurrence on `date`? */
export function occursOn(recurrence: Recurrence, date: ISODate): boolean {
  switch (recurrence.kind) {
    case "once":
      return recurrence.date === date;
    case "daily":
      if (recurrence.startsOn && date < recurrence.startsOn) return false;
      if (recurrence.endsOn && date > recurrence.endsOn) return false;
      return true;
    case "weekdays":
      if (recurrence.startsOn && date < recurrence.startsOn) return false;
      if (recurrence.endsOn && date > recurrence.endsOn) return false;
      return recurrence.days.includes(weekdayOf(date));
    case "custom": {
      if (date < recurrence.startsOn) return false;
      if (recurrence.endsOn && date > recurrence.endsOn) return false;
      const delta = diffDays(recurrence.startsOn, date);
      return delta >= 0 && delta % recurrence.intervalDays === 0;
    }
  }
}

export function templatesOn(templates: readonly TaskTemplate[], date: ISODate): TaskTemplate[] {
  return templates.filter((t) => !t.isArchived && occursOn(t.recurrence, date));
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
    case "custom":
      return recurrence.intervalDays === 1 ? "Every day" : `Every ${recurrence.intervalDays} days`;
  }
}
