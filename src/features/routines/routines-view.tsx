"use client";

import { useState } from "react";
import { ListChecks } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DemoBadge } from "@/components/ui/demo-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, SectionHeading } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { describeRecurrence, occursOn } from "@/domain/recurrence";
import { useDemoStore } from "@/features/demo/demo-store";
import { QuickAdd } from "@/features/tasks/quick-add";
import { TaskRow } from "@/features/tasks/task-row";
import { cn } from "@/lib/cn";

export function RoutinesView() {
  const store = useDemoStore();
  const [category, setCategory] = useState("all");

  if (!store.ready) {
    return (
      <div role="status" aria-label="Loading routines" className="space-y-4">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const routines = store.templates.filter((t) => t.recurrence.kind !== "once");
  const filtered = routines.filter((t) => category === "all" || (t.categoryId ?? "none") === category);
  const groups = [...store.categories.map((c) => c.id), "none"]
    .map((id) => ({ id, name: store.categoryName(id === "none" ? undefined : id), items: filtered.filter((t) => (t.categoryId ?? "none") === id) }))
    .filter((g) => g.items.length > 0);

  const chips = [
    { id: "all", name: "All", count: routines.length },
    ...store.categories.map((c) => ({ id: c.id, name: c.name, count: routines.filter((t) => t.categoryId === c.id).length })),
    { id: "none", name: "Uncategorized", count: routines.filter((t) => !t.categoryId).length },
  ].filter((c) => c.id === "all" || c.count > 0);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Routines"
        subtitle="Repeating tasks that shape your day."
        action={<DemoBadge label="Sample routines" />}
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-6">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="group" aria-label="Filter by category">
            {chips.map((c) => (
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

          {groups.length === 0 ? (
            <Card>
              <EmptyState
                icon={ListChecks}
                title="No routines yet"
                description="Routines repeat every day or on days you choose. Add your first one to get started."
              />
            </Card>
          ) : (
            groups.map((g) => (
              <section key={g.id} aria-label={g.name}>
                <SectionHeading>{g.name}</SectionHeading>
                <Card className="overflow-hidden">
                  <ul className="divide-y divide-line">
                    {g.items.map((t) => {
                      const scheduledToday = occursOn(t.recurrence, store.today);
                      return (
                        <TaskRow
                          key={t.id}
                          title={t.title}
                          time={t.time}
                          schedule={describeRecurrence(t.recurrence)}
                          scheduledToday={scheduledToday}
                          completed={store.isDone(t.id, store.today)}
                          onToggle={() => store.toggle(t.id, store.today)}
                        />
                      );
                    })}
                  </ul>
                </Card>
              </section>
            ))
          )}
        </div>

        <aside className="min-w-0 space-y-8">
          <section aria-labelledby="add-routine">
            <SectionHeading id="add-routine">New routine</SectionHeading>
            <Card className="p-4">
              <QuickAdd
                mode="routine"
                categories={store.categories}
                contextLabel="routine"
                onSubmit={(v) =>
                  store.addRoutine({ title: v.title, categoryId: v.categoryId, time: v.time, recurrence: v.recurrence ?? { kind: "daily" } })
                }
              />
            </Card>
          </section>
          <p className="text-sm text-ink-3">
            Completion controls apply to today. Editing a routine will never rewrite days you have already completed.
          </p>
        </aside>
      </div>
    </div>
  );
}
