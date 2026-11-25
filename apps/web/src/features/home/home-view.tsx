"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, CalendarCheck, Cloud, CloudOff, Quote, RefreshCw } from "lucide-react";
import type { TaskOccurrence } from "@justlakshmi/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressRing } from "@/components/ui/progress-ring";
import { SectionHeading } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { DEMO_QUOTES } from "@/data/demo/quotes";
import { percent } from "@/domain/analytics";
import { WeekStrip } from "@/features/calendar/week-strip";
import { QuickAdd } from "@/features/tasks/quick-add";
import { TaskRow } from "@/features/tasks/task-row";
import { useWorkspace } from "@/features/workspace/workspace-provider";
import { cn } from "@/lib/cn";
import { addDays, dayOfYear, formatLong, formatTime, greetingFor, weekDates } from "@/lib/dates";
import { useClock } from "@/lib/use-clock";

function HomeSkeleton() {
  return (
    <div role="status" aria-label="Loading your day" className="space-y-4">
      <Skeleton className="h-12 w-3/4" />
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export function HomeView() {
  const ws = useWorkspace();
  const clock = useClock();
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [category, setCategory] = useState<string>("all");

  const today = ws.today;
  const selected = pickedDate ?? today;
  const isToday = selected === today;

  const dayItems = ws.occurrencesOn(selected);
  const done = dayItems.filter((o) => o.completed).length;
  const pending = dayItems.length - done;
  const pct = percent(done, dayItems.length);

  const visible = category === "all" ? dayItems : dayItems.filter((o) => (o.categoryIdSnapshot ?? "none") === category);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of dayItems) counts.set(o.categoryIdSnapshot ?? "none", (counts.get(o.categoryIdSnapshot ?? "none") ?? 0) + 1);
    return counts;
  }, [dayItems]);

  const upcoming = useMemo(() => {
    const onceIds = new Set(ws.templates.filter((t) => !t.isArchived && t.recurrence.kind === "once").map((t) => t.id));
    const list: TaskOccurrence[] = [];
    for (let i = 1; i <= 7; i++) {
      list.push(...ws.occurrencesOn(addDays(today, i)).filter((o) => onceIds.has(o.templateId)));
    }
    return list.slice(0, 5);
  }, [ws, today]);

  if (!ws.ready || !clock) return <HomeSkeleton />;

  const quote = DEMO_QUOTES[dayOfYear(today) % DEMO_QUOTES.length];
  const week = weekDates(selected);
  const todayJournal = ws.getJournal(selected);

  const syncLabel =
    ws.syncState === "synced"
      ? "Synced with Drive"
      : ws.syncState === "syncing"
        ? "Syncing…"
        : ws.syncState === "reauth_required"
          ? "Drive reconnect needed"
          : ws.syncState === "conflict"
            ? `${ws.unresolvedConflicts.length} sync conflict`
            : ws.outboxCount > 0
              ? `Saved locally (${ws.outboxCount} queued)`
              : "Saved on device";

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm text-ink-3">{formatLong(today)}</p>
          <h1 className="font-display text-3xl leading-tight">{greetingFor(clock.hour)}</h1>
        </div>
        <Link
          href="/settings#s-drive"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-xs font-medium text-ink-2 sk-card-shadow transition-colors hover:border-sk-violet/60 hover:bg-surface-2"
        >
          {ws.driveConnection?.status === "connected" ? (
            ws.syncState === "syncing" ? (
              <RefreshCw aria-hidden className="size-3.5 animate-spin text-sk-violet" />
            ) : (
              <Cloud aria-hidden className="size-3.5 text-sk-success" />
            )
          ) : (
            <CloudOff aria-hidden className="size-3.5 text-ink-3" />
          )}
          {syncLabel}
        </Link>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-8">
          <Card className="flex items-center gap-5 border-line bg-surface p-5">
            <ProgressRing
              percent={pct}
              celebrateOnFull={dayItems.length > 0}
              label={isToday ? "Today's completion" : "Day completion"}
            />
            <div className="min-w-0 flex-1">
              <h2 className="mb-1 font-medium text-ink">{isToday ? "Today's progress" : "Progress"}</h2>
              <p className="text-sm text-ink-3">
                <span className="font-semibold text-ink tabular-nums">{done}</span> completed
                <span aria-hidden> · </span>
                <span className="font-semibold text-ink tabular-nums">{pending}</span> pending
              </p>
              <p className="mt-1.5 text-sm text-ink-2">
                {dayItems.length === 0 ? "Nothing scheduled yet." : pending === 0 ? "All done. Well paced." : "One calm step at a time."}
              </p>
            </div>
          </Card>

          <section aria-label="Week">
            <WeekStrip
              dates={week}
              selected={selected}
              today={today}
              onSelect={(d) => {
                setPickedDate(d);
                setCategory("all");
              }}
              progressOf={ws.completionOn}
            />
          </section>

          <section aria-labelledby="tasks-heading">
            <SectionHeading id="tasks-heading">{isToday ? "Today's tasks" : formatLong(selected)}</SectionHeading>

            {dayItems.length > 0 ? (
              <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="group" aria-label="Filter by category">
                {[
                  { id: "all", name: "All", count: dayItems.length },
                  ...ws.categories.map((c) => ({ id: c.id, name: c.name, count: categoryCounts.get(c.id) ?? 0 })),
                  { id: "none", name: "Uncategorized", count: categoryCounts.get("none") ?? 0 },
                ]
                  .filter((c) => c.id === "all" || c.count > 0)
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={category === c.id}
                      onClick={() => setCategory(c.id)}
                      className={cn(
                        "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors active:scale-95",
                        category === c.id
                          ? "border-2 border-line-strong bg-inverse text-on-inverse"
                          : "border-line bg-surface text-ink-2 hover:border-sk-violet/60 hover:bg-surface-2",
                      )}
                    >
                      {c.name}
                      <span className="text-xs tabular-nums opacity-70">{c.count}</span>
                    </button>
                  ))}
              </div>
            ) : null}

            <Card className="overflow-hidden">
              {visible.length === 0 ? (
                <EmptyState
                  icon={CalendarCheck}
                  title={dayItems.length === 0 ? "A clear day" : "Nothing in this category"}
                  description={
                    dayItems.length === 0
                      ? "Add a task below, create routines, or load an editable starter routine."
                      : "Pick another category to see more."
                  }
                  action={
                    ws.templates.filter((t) => !t.isArchived).length === 0 ? (
                      <Button variant="secondary" onClick={() => void ws.loadStarterRoutine()}>
                        Load starter routine
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <ul className="divide-y divide-line">
                  {visible.map((o) => (
                    <TaskRow
                      key={o.id}
                      title={o.titleSnapshot}
                      completed={o.completed}
                      time={o.time}
                      category={o.categoryIdSnapshot ? ws.categoryName(o.categoryIdSnapshot) : undefined}
                      mode={o.mode}
                      progressValue={o.progressValue}
                      targetValue={o.targetValue}
                      unit={o.unit}
                      targetDurationMinutes={o.targetDurationMinutes}
                      auditEvents={ws.auditForOccurrence(o.id)}
                      onToggle={() => void ws.toggleOccurrence(o.templateId, o.date)}
                      onIncrement={(delta) => void ws.recordProgress(o.templateId, o.date, delta)}
                      onCorrect={(val) => void ws.correctProgress(o.templateId, o.date, val)}
                    />
                  ))}
                </ul>
              )}
            </Card>
          </section>

          <section aria-labelledby="add-heading">
            <SectionHeading id="add-heading">Quick add</SectionHeading>
            <Card className="p-4">
              <QuickAdd
                mode="task"
                categories={ws.categories}
                today={today}
                contextLabel="task"
                onSubmit={(v) =>
                  ws.addTask(
                    {
                      title: v.title,
                      categoryId: v.categoryId,
                      time: v.time,
                      mode: v.mode,
                      targetValue: v.targetValue,
                      unit: v.unit,
                      targetDurationMinutes: v.targetDurationMinutes,
                      reminder: v.reminder,
                    },
                    selected,
                  )
                }
              />
            </Card>
          </section>
        </div>

        <aside className="min-w-0 space-y-8">
          <section aria-labelledby="journal-heading">
            <SectionHeading id="journal-heading">Daily journal</SectionHeading>
            <Card className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-ink">{todayJournal ? "Reflection saved" : "Capture today's reflection"}</p>
                  <p className="text-xs text-ink-3">
                    {todayJournal?.mood ? `Mood: ${todayJournal.mood}` : "Mood, energy, stress, and guided prompts."}
                  </p>
                </div>
                <span className="grid size-9 shrink-0 place-items-center rounded-ui bg-sk-violet-soft text-sk-violet">
                  <BookOpen aria-hidden className="size-4" />
                </span>
              </div>
              <Link
                href={`/journal?date=${selected}`}
                className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-ui border border-line-strong/60 bg-sk-violet-soft px-4 text-sm font-medium text-ink transition-colors hover:bg-sk-lavender/70"
              >
                {todayJournal ? "Open journal entry" : "Write reflection"}
              </Link>
            </Card>
          </section>

          <section aria-labelledby="quote-heading">
            <SectionHeading id="quote-heading">Daily note</SectionHeading>
            <Card className="border-l-4 border-l-sk-violet p-5">
              <Quote aria-hidden className="mb-3 size-5 text-sk-violet" />
              <p className="font-display text-xl leading-snug text-ink">{quote?.text}</p>
            </Card>
          </section>

          <section aria-labelledby="upcoming-heading">
            <SectionHeading id="upcoming-heading">Upcoming</SectionHeading>
            <Card className="overflow-hidden">
              {upcoming.length === 0 ? (
                <EmptyState icon={CalendarCheck} title="Nothing upcoming" description="One-off tasks scheduled in the next week appear here." />
              ) : (
                <ul className="divide-y divide-line">
                  {upcoming.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{o.titleSnapshot}</p>
                        <p className="text-xs text-ink-3">
                          {formatLong(o.date)}
                          {o.time ? ` · ${formatTime(o.time)}` : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <p className="mt-3 text-sm text-ink-3">
              Manage repeating schedules in{" "}
              <Link href="/routines" className="text-ink underline underline-offset-4">
                Routines
              </Link>
              .
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
