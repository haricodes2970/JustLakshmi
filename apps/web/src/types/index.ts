/** YYYY-MM-DD in the user's local calendar. */
export type ISODate = string;
/** HH:mm, 24-hour, local. */
export type LocalTime = string;
export type EntityId = string;

export type Category = {
  id: EntityId;
  name: string;
};

/** 0 = Sunday ... 6 = Saturday (matches Date#getDay). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Recurrence kinds. `custom` is reserved for a later phase and is intentionally
 * not constructible from the Phase 1 UI.
 */
export type Recurrence =
  | { kind: "once"; date: ISODate }
  | { kind: "daily" }
  | { kind: "weekdays"; days: readonly Weekday[] };

/** A routine template or one-off task definition. Occurrences are derived per date. */
export type TaskTemplate = {
  id: EntityId;
  title: string;
  categoryId?: EntityId;
  time?: LocalTime;
  recurrence: Recurrence;
};

/** A template resolved for one specific date. */
export type TaskOccurrence = {
  key: string;
  templateId: EntityId;
  date: ISODate;
  title: string;
  categoryId?: EntityId;
  time?: LocalTime;
  completed: boolean;
};

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export type DayCompletion = {
  date: ISODate;
  scheduled: number;
  completed: number;
};
