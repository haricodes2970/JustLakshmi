"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarCheck, Quote } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DemoBadge } from "@/components/ui/demo-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressRing } from "@/components/ui/progress-ring";
import { SectionHeading } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { DEMO_QUOTES } from "@/data/demo/quotes";
import { describeRecurrence } from "@/domain/recurrence";
import { percent } from "@/domain/analytics";
import { WeekStrip } from "@/features/calendar/week-strip";
import { useDemoStore } from "@/features/demo/demo-store";
import { QuickAdd } from "@/features/tasks/quick-add";
import { TaskRow } from "@/features/tasks/task-row";
import { cn } from "@/lib/cn";
import { addDays, dayOfYear, formatLong, formatTime, greetingFor, weekDates } from "@/lib/dates";
import { useClock } from "@/lib/use-clock";
import type { TaskOccurrence } from "@/types";

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
  const store = useDemoStore();
  const clock = useClock();
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [category, setCategory] = useState<string>("all");

  const today = store.today;
  const selected = pickedDate ?? today;
  const isToday = selected === today;

  const dayItems = store.occurrencesOn(selected);
  const done = dayItems.filter((o) => o.completed).length;
  const pending = dayItems.length - done;
  const pct = percent(done, dayItems.length);

  const visible = category === "all" ? dayItems : dayItems.filter((o) => (o.categoryId ?? "none") === category);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of dayItems) counts.set(o.categoryId ?? "none", (counts.get(o.categoryId ?? "none") ?? 0) + 1);
    return counts;
  }, [dayItems]);

  const upcoming = useMemo(() => {
    const onceIds = new Set(store.templates.filter((t) => t.recurrence.kind === "once").map((t) => t.id));
    const list: TaskOccurrence[] = [];
    for (let i = 1; i <= 7; i++) {
      list.push(...store.occurrencesOn(addDays(today, i)).filter((o) => onceIds.has(o.templateId)));
    }
    return list.slice(0, 5);
  }, [store, today]);

  if (!store.ready || !clock) return <HomeSkeleton />;

  const quote = DEMO_QUOTES[dayOfYear(today) % DEMO_QUOTES.length];
  const week = weekDates(selected);

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="text-sm text-ink-3">{formatLong(today)}</p>
        <h1 className="font-display text-3xl leading-tight sm:text-3xl">{greetingFor(clock.hour)}</h1>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-8">
          <Card className="flex items-center gap-5 p-5">
            <ProgressRing percent={pct} label={isToday ? "Today's completion" : "Day completion"} />
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h2 className="font-medium">{isToday ? "Today's progress" : "Progress"}</h2>
                <DemoBadge />
              </div>
              <p className="text-sm text-ink-3">
                <span className="font-semibold text-ink tabular-nums">{done}</span> completed
                <span aria-hidden> · </span>
                <span className="font-semibold text-ink tabular-nums">{pending}</span> pending
              </p>
              <p className="mt-1 text-sm text-ink-3">
                {dayItems.length === 0 ? "Nothing scheduled." : pending === 0 ? "All done. Well paced." : "One calm step at a time."}
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
              progressOf={store.completionOn}
            />
          </section>

          <section aria-labelledby="tasks-heading">
            <SectionHeading id="tasks-heading" trailing={<DemoBadge label="Demo tasks" />}>
              {isToday ? "Today's tasks" : formatLong(selected)}
            </SectionHeading>

            <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="group" aria-label="Filter by category">
              {[{ id: "all", name: "All", count: dayItems.length }, ...store.categories.map((c) => ({ id: c.id, name: c.name, count: categoryCounts.get(c.id) ?? 0 })), { id: "none", name: "Uncategorized", count: categoryCounts.get("none") ?? 0 }]
                .filter((c) => c.id === "all" || c.count > 0)
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={category === c.id}
                    onClick={() => setCategory(c.id)}
                    className={cn(
                      "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors",
                      category === c.id ? "border-inverse bg-inverse text-on-inverse" : "border-line bg-surface text-ink-2 hover:bg-surface-2",
                    )}
                  >
                    {c.name}
                    <span className="text-xs tabular-nums opacity-70">{c.count}</span>
                  </button>
                ))}
            </div>

            <Card className="overflow-hidden">
              {visible.length === 0 ? (
                <EmptyState
                  icon={CalendarCheck}
                  title={dayItems.length === 0 ? "A clear day" : "Nothing in this category"}
                  description={dayItems.length === 0 ? "No tasks are scheduled. Add one below if you like." : "Pick another category to see more."}
                />
              ) : (
                <ul className="divide-y divide-line">
                  {visible.map((o) => (
                    <TaskRow
                      key={o.key}
                      title={o.title}
                      completed={o.completed}
                      time={o.time}
                      category={o.categoryId ? store.categoryName(o.categoryId) : undefined}
                      onToggle={() => store.toggle(o.templateId, o.date)}
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
                categories={store.categories}
                contextLabel="task"
                onSubmit={(v) => store.addTask({ title: v.title, categoryId: v.categoryId, time: v.time }, selected)}
              />
            </Card>
          </section>
        </div>

        <aside className="min-w-0 space-y-8">
          <section aria-labelledby="quote-heading">
            <SectionHeading id="quote-heading" trailing={<DemoBadge label="Sample quote" />}>
              Daily note
            </SectionHeading>
            <Card className="p-5">
              <Quote aria-hidden className="mb-3 size-5 text-ink-3" />
              <p className="font-display text-xl leading-snug">{quote?.text}</p>
            </Card>
          </section>

          <section aria-labelledby="upcoming-heading">
            <SectionHeading id="upcoming-heading" trailing={<DemoBadge />}>
              Upcoming
            </SectionHeading>
            <Card className="overflow-hidden">
              {upcoming.length === 0 ? (
                <EmptyState icon={CalendarCheck} title="Nothing upcoming" description="One-off tasks scheduled in the next week appear here." />
              ) : (
                <ul className="divide-y divide-line">
                  {upcoming.map((o) => (
                    <li key={o.key} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{o.title}</p>
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
              Manage repeating tasks in <Link href="/routines" className="text-ink underline underline-offset-4">Routines</Link>. Daily
              routines ({describeRecurrence({ kind: "daily" }).toLowerCase()}) are not listed here.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
