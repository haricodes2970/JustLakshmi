"use client";

import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DemoBadge } from "@/components/ui/demo-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, SectionHeading } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { WeekStrip } from "@/features/calendar/week-strip";
import { useDemoStore } from "@/features/demo/demo-store";
import { TaskRow } from "@/features/tasks/task-row";
import { cn } from "@/lib/cn";
import { WEEKDAY_LABELS, addMonths, dayOfMonth, formatLong, formatMonthYear, monthGrid, weekDates } from "@/lib/dates";

const HEADER_DAYS = [1, 2, 3, 4, 5, 6, 0] as const;

export function CalendarView() {
  const store = useDemoStore();
  const [picked, setPicked] = useState<string | null>(null);

  if (!store.ready) {
    return (
      <div role="status" aria-label="Loading calendar" className="space-y-4">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const today = store.today;
  const selected = picked ?? today;
  const items = store.occurrencesOn(selected);
  const done = items.filter((o) => o.completed).length;
  const cells = monthGrid(selected);

  const goMonth = (delta: number) => setPicked(addMonths(selected, delta));

  return (
    <div className="space-y-8">
      <PageHeader title="Calendar" subtitle="Plan ahead and look back." action={<DemoBadge label="Sample data" />} />

      <WeekStrip dates={weekDates(selected)} selected={selected} today={today} onSelect={setPicked} progressOf={store.completionOn} />

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <section aria-label="Month" className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-display text-xl" aria-live="polite">
              {formatMonthYear(selected)}
            </h2>
            <div className="flex items-center gap-1">
              <Button variant="secondary" className="min-h-9 px-3" onClick={() => setPicked(today)} disabled={selected === today}>
                Today
              </Button>
              <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => goMonth(-1)}>
                <ChevronLeft aria-hidden className="size-5" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Next month" onClick={() => goMonth(1)}>
                <ChevronRight aria-hidden className="size-5" />
              </Button>
            </div>
          </div>

          <Card className="p-2 sm:p-3">
            <div className="mb-1 grid grid-cols-7 text-center text-xs text-ink-3" aria-hidden>
              {HEADER_DAYS.map((d) => (
                <span key={d} className="py-2">
                  {WEEKDAY_LABELS[d]}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((date, i) => {
                if (!date) return <span key={`pad-${i}`} aria-hidden />;
                const c = store.completionOn(date);
                const pending = c.scheduled - c.completed;
                const isSelected = date === selected;
                const isToday = date === today;
                return (
                  <button
                    key={date}
                    type="button"
                    aria-pressed={isSelected}
                    aria-current={isToday ? "date" : undefined}
                    aria-label={`${formatLong(date)}: ${c.completed} completed, ${pending} pending`}
                    onClick={() => setPicked(date)}
                    className={cn(
                      "flex min-h-14 flex-col items-center justify-center gap-1.5 rounded-ui border text-sm transition-colors sm:min-h-16",
                      isSelected ? "border-inverse bg-inverse text-on-inverse" : "border-transparent hover:bg-surface-2",
                      isToday && !isSelected && "border-ink",
                    )}
                  >
                    <span className="font-medium tabular-nums">{dayOfMonth(date)}</span>
                    <span aria-hidden className="flex h-2 items-center gap-0.5">
                      {Array.from({ length: Math.min(c.completed, 3) }, (_, k) => (
                        <span key={`d${k}`} className="size-1.5 rounded-full bg-current" />
                      ))}
                      {Array.from({ length: Math.min(pending, 3) }, (_, k) => (
                        <span key={`p${k}`} className="size-1.5 rounded-full border border-current opacity-70" />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>
          <p className="mt-3 flex items-center gap-4 text-xs text-ink-3">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full bg-ink-2" /> Completed
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full border border-ink-2" /> Pending
            </span>
          </p>
        </section>

        <section aria-labelledby="day-heading" className="min-w-0">
          <SectionHeading id="day-heading">{formatLong(selected)}</SectionHeading>
          <Card className="overflow-hidden">
            <div className="border-b border-line px-4 py-3 text-sm text-ink-3" aria-live="polite">
              {items.length === 0 ? (
                "Nothing scheduled"
              ) : (
                <>
                  <span className="font-semibold text-ink tabular-nums">{done}</span> of {items.length} done
                  <span aria-hidden> · </span>
                  <span className="tabular-nums">{items.length - done}</span> pending
                </>
              )}
            </div>
            {items.length === 0 ? (
              <EmptyState icon={CalendarDays} title="A clear day" description="No tasks are scheduled for this date." />
            ) : (
              <ul className="divide-y divide-line">
                {items.map((o) => (
                  <TaskRow
                    key={o.key}
                    title={o.title}
                    time={o.time}
                    category={o.categoryId ? store.categoryName(o.categoryId) : undefined}
                    completed={o.completed}
                    onToggle={() => store.toggle(o.templateId, o.date)}
                  />
                ))}
              </ul>
            )}
          </Card>
        </section>
      </div>
    </div>
  );
}
