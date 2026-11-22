"use client";

import { BarChart3, Flame } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, SectionHeading } from "@/components/ui/page-header";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Skeleton } from "@/components/ui/skeleton";
import { categoryBreakdown, habitStreak, overallStreak, percent, sumCompletion } from "@/domain/analytics";
import { useWorkspace } from "@/features/workspace/workspace-provider";
import { addDays, fromISODate, weekdayShort } from "@/lib/dates";

const shortDate = (iso: string) => fromISODate(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

export function AnalyticsView() {
  const ws = useWorkspace();

  if (!ws.ready) {
    return (
      <div role="status" aria-label="Loading analytics" className="space-y-4">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const today = ws.today;
  const last = (n: number) => Array.from({ length: n }, (_, i) => ws.completionOn(addDays(today, i - (n - 1))));
  const week = last(7);
  const month = last(30);
  const todayC = ws.completionOn(today);
  const weekSum = sumCompletion(week);
  const monthSum = sumCompletion(month);
  const streak = overallStreak(month);

  const monthOccurrences = month.flatMap((d) => ws.occurrencesOn(d.date));
  const categoriesSummary = categoryBreakdown(monthOccurrences, ws.categories);

  const habits = ws.templates
    .filter((t) => !t.isArchived && t.recurrence.kind !== "once")
    .map((t) => ({ t, streak: habitStreak(t, today, ws.isDone) }))
    .sort((a, b) => b.streak - a.streak);

  const hasAnyData = monthSum.scheduled > 0;

  return (
    <div className="space-y-8">
      <PageHeader title="Analytics" subtitle={`Patterns, not pressure (${ws.timeZone}).`} />

      {!hasAnyData ? (
        <Card>
          <EmptyState
            icon={BarChart3}
            title="No history recorded yet"
            description="Complete routines or tasks on Home or Routines to see real completion rates, category trends, and streaks here."
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Card className="col-span-2 flex items-center gap-4 p-5 sm:col-span-1">
              <ProgressRing percent={percent(todayC.completed, todayC.scheduled)} size={80} stroke={7} label="Today's completion" />
              <div>
                <p className="text-sm text-ink-3">Today</p>
                <p className="font-medium tabular-nums">
                  {todayC.completed} of {todayC.scheduled} done
                </p>
              </div>
            </Card>
            <Card className="p-5">
              <p className="text-sm text-ink-3">Last 7 days</p>
              <p className="font-display text-3xl tabular-nums">{weekSum.percent}%</p>
              <p className="text-sm text-ink-3 tabular-nums">
                {weekSum.completed} of {weekSum.scheduled} tasks
              </p>
            </Card>
            <Card className="p-5">
              <p className="text-sm text-ink-3">Last 30 days</p>
              <p className="font-display text-3xl tabular-nums">{monthSum.percent}%</p>
              <p className="text-sm text-ink-3 tabular-nums">
                {monthSum.completed} of {monthSum.scheduled} tasks
              </p>
            </Card>
          </div>

          <section aria-labelledby="trend-heading">
            <SectionHeading id="trend-heading">Weekly completion trend</SectionHeading>
            <Card className="p-5">
              <div
                role="img"
                aria-label={`Completion by day: ${week.map((d) => `${weekdayShort(d.date)} ${percent(d.completed, d.scheduled)} percent`).join(", ")}`}
                className="flex h-40 items-end gap-2"
              >
                {week.map((d) => {
                  const p = percent(d.completed, d.scheduled);
                  return (
                    <div key={d.date} className="flex h-full flex-1 flex-col items-center justify-end gap-2" aria-hidden>
                      <span className="text-xs tabular-nums text-ink-3">{p}%</span>
                      <div className="flex w-full flex-1 items-end rounded-[8px] bg-surface-2">
                        <div className="w-full rounded-[8px] bg-inverse" style={{ height: `${Math.max(p, 3)}%` }} />
                      </div>
                      <span className="text-xs text-ink-3">{weekdayShort(d.date)}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </section>

          <section aria-labelledby="month-heading">
            <SectionHeading id="month-heading">Monthly overview</SectionHeading>
            <Card className="p-5">
              <div
                role="img"
                aria-label={`Daily completion for the last 30 days, averaging ${monthSum.percent} percent`}
                className="grid grid-cols-10 gap-1.5"
              >
                {month.map((d) => {
                  const p = percent(d.completed, d.scheduled);
                  return (
                    <div key={d.date} aria-hidden className="aspect-square rounded-[6px] bg-surface-2">
                      <div className="size-full rounded-[6px] bg-inverse" style={{ opacity: Math.max(p / 100, 0.04) }} />
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 flex items-center justify-between gap-2 text-xs text-ink-3">
                <span>
                  {shortDate(month[0]?.date ?? today)} to {shortDate(today)}
                </span>
                <span className="flex items-center gap-2">
                  Less
                  {[0.15, 0.4, 0.7, 1].map((o) => (
                    <span key={o} aria-hidden className="size-3 rounded-[4px] bg-inverse" style={{ opacity: o }} />
                  ))}
                  More
                </span>
              </p>
            </Card>
          </section>

          {categoriesSummary.length > 0 ? (
            <section aria-labelledby="cat-heading">
              <SectionHeading id="cat-heading">By category (30 days)</SectionHeading>
              <Card className="divide-y divide-line">
                {categoriesSummary.map((c) => (
                  <div key={c.categoryId} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                    <span className="truncate font-medium">{c.name}</span>
                    <span className="shrink-0 text-ink-3 tabular-nums">
                      {c.completed}/{c.scheduled} ({c.percent}%)
                    </span>
                  </div>
                ))}
              </Card>
            </section>
          ) : null}

          <section aria-labelledby="streak-heading">
            <SectionHeading id="streak-heading">Streaks</SectionHeading>
            <Card className="overflow-hidden">
              <div className="flex items-center gap-4 border-b border-line p-5">
                <Flame aria-hidden className="size-6 text-ink-2" />
                <div>
                  <p className="font-display text-2xl tabular-nums">
                    {streak} {streak === 1 ? "day" : "days"}
                  </p>
                  <p className="text-sm text-ink-3">Overall consistency (days with 70% or more completed)</p>
                </div>
              </div>
              {habits.length > 0 ? (
                <ul className="divide-y divide-line">
                  {habits.map(({ t, streak: s }) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                      <span className="truncate">{t.title}</span>
                      <span className="shrink-0 font-medium tabular-nums">
                        {s} scheduled {s === 1 ? "day" : "days"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
            <p className="mt-3 text-sm text-ink-3">
              Habit streaks count only days a routine is scheduled. Unscheduled days never break a streak, and missing one habit never affects another.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
