import type { Category, ISODate, TaskTemplate } from "@/types";
import { addDays } from "@/lib/dates";

/** All content in src/data/demo is sample data. It is never a real user record. */

export const DEMO_CATEGORIES: readonly Category[] = [
  { id: "cat-morning", name: "Morning" },
  { id: "cat-health", name: "Health" },
  { id: "cat-focus", name: "Focus" },
  { id: "cat-home", name: "Home" },
  { id: "cat-evening", name: "Evening" },
];

/** Routine templates plus a few one-off tasks anchored to "today". */
export function buildDemoTemplates(today: ISODate): TaskTemplate[] {
  return [
    { id: "r-stretch", title: "Wake up and stretch", categoryId: "cat-morning", time: "06:30", recurrence: { kind: "daily" } },
    { id: "r-water", title: "Drink a glass of water", categoryId: "cat-morning", time: "06:45", recurrence: { kind: "daily" } },
    { id: "r-walk", title: "Morning walk", categoryId: "cat-health", time: "07:30", recurrence: { kind: "weekdays", days: [1, 2, 3, 4, 5, 6] } },
    { id: "r-read", title: "Read 20 pages", categoryId: "cat-focus", time: "09:00", recurrence: { kind: "daily" } },
    { id: "r-deep", title: "Deep work block", categoryId: "cat-focus", time: "10:00", recurrence: { kind: "weekdays", days: [1, 2, 3, 4, 5] } },
    { id: "r-lunch", title: "Lunch away from the screen", categoryId: "cat-health", time: "13:00", recurrence: { kind: "daily" } },
    { id: "r-tidy", title: "Tidy the workspace", categoryId: "cat-home", time: "17:30", recurrence: { kind: "weekdays", days: [1, 3, 5] } },
    { id: "r-prep", title: "Meal prep for the week", categoryId: "cat-home", time: "16:00", recurrence: { kind: "weekdays", days: [0] } },
    { id: "r-review", title: "Weekly review", categoryId: "cat-focus", time: "18:00", recurrence: { kind: "weekdays", days: [0] } },
    { id: "r-journal", title: "Evening reflection", categoryId: "cat-evening", time: "21:00", recurrence: { kind: "daily" } },
    { id: "r-plan", title: "Plan tomorrow", categoryId: "cat-evening", time: "21:30", recurrence: { kind: "daily" } },
    { id: "t-dentist", title: "Call the dentist", categoryId: "cat-home", time: "15:00", recurrence: { kind: "once", date: today } },
    { id: "t-tickets", title: "Book train tickets", categoryId: "cat-home", time: "11:00", recurrence: { kind: "once", date: addDays(today, 1) } },
    { id: "t-parcel", title: "Pick up the parcel", categoryId: "cat-home", recurrence: { kind: "once", date: addDays(today, 2) } },
    { id: "t-library", title: "Renew library card", categoryId: "cat-focus", time: "12:00", recurrence: { kind: "once", date: addDays(today, 3) } },
  ];
}
