"use client";

import { useSakuga } from "@/components/sakuga";
import { cn } from "@/lib/cn";
import { dayOfMonth, weekdayShort } from "@/lib/dates";
import type { ISODate } from "@/types";

/** Seven-day strip. Selection state uses crisp ink/violet fill plus aria-pressed; a violet outline marks today. */
export function WeekStrip({
  dates,
  selected,
  today,
  onSelect,
  progressOf,
}: {
  dates: readonly ISODate[];
  selected: ISODate;
  today: ISODate;
  onSelect: (date: ISODate) => void;
  progressOf?: (date: ISODate) => { scheduled: number; completed: number };
}) {
  const { fireEffect, reducedMotion } = useSakuga();

  return (
    <ul className="grid grid-cols-7 gap-1.5" aria-label="Week">
      {dates.map((date) => {
        const isSelected = date === selected;
        const isToday = date === today;
        const p = progressOf?.(date);
        const all = p && p.scheduled > 0 && p.completed === p.scheduled;
        return (
          <li key={date}>
            <button
              type="button"
              aria-pressed={isSelected}
              aria-current={isToday ? "date" : undefined}
              aria-label={`${new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}${isToday ? ", today" : ""}${p ? `, ${p.completed} of ${p.scheduled} done` : ""}`}
              onClick={(e) => {
                if (!isSelected && !reducedMotion) {
                  fireEffect("ticks", e.currentTarget, { scale: 0.65, accent: "violet" });
                }
                onSelect(date);
              }}
              className={cn(
                "flex min-h-[4.25rem] w-full flex-col items-center justify-center gap-1 rounded-ui border text-sm transition-[background-color,border-color,transform] duration-150 active:scale-95",
                isSelected
                  ? "border-2 border-line-strong bg-inverse text-on-inverse sk-ink-shadow"
                  : "border-line bg-surface text-ink sk-card-shadow hover:border-sk-violet/60 hover:bg-surface-2",
                isToday && !isSelected && "border-2 border-sk-violet bg-sk-violet-soft/60",
              )}
            >
              <span className={cn("text-xs", isSelected ? "opacity-80" : "text-ink-3")}>{weekdayShort(date)}</span>
              <span className="text-base font-semibold tabular-nums">{dayOfMonth(date)}</span>
              <span
                aria-hidden
                className={cn(
                  "size-1.5 rounded-full border",
                  all
                    ? isSelected
                      ? "border-sk-pink bg-sk-pink"
                      : "border-sk-success bg-sk-success"
                    : "border-current bg-transparent opacity-60",
                  p && p.scheduled > 0 ? "opacity-100" : "opacity-0",
                )}
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
