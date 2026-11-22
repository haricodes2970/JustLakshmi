"use client";

import { useState } from "react";
import { ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import type { TaskTemplate } from "@justlakshmi/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, SectionHeading } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { describeRecurrence, occursOn } from "@/domain/recurrence";
import { QuickAdd } from "@/features/tasks/quick-add";
import { TaskRow } from "@/features/tasks/task-row";
import { useWorkspace, type EditScope } from "@/features/workspace/workspace-provider";
import { cn } from "@/lib/cn";

export function RoutinesView() {
  const ws = useWorkspace();
  const [category, setCategory] = useState("all");
  const [newCatName, setNewCatName] = useState("");
  const [editing, setEditing] = useState<TaskTemplate | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editScope, setEditScope] = useState<EditScope>("future_occurrences");

  if (!ws.ready) {
    return (
      <div role="status" aria-label="Loading routines" className="space-y-4">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const routines = ws.templates.filter((t) => !t.isArchived && t.recurrence.kind !== "once");
  const filtered = routines.filter((t) => category === "all" || (t.categoryId ?? "none") === category);
  const groups = [...ws.categories.map((c) => c.id), "none"]
    .map((id) => ({
      id,
      name: ws.categoryName(id === "none" ? undefined : id),
      items: filtered.filter((t) => (t.categoryId ?? "none") === id),
    }))
    .filter((g) => g.items.length > 0);

  const chips = [
    { id: "all", name: "All", count: routines.length },
    ...ws.categories.map((c) => ({ id: c.id, name: c.name, count: routines.filter((t) => t.categoryId === c.id).length })),
    { id: "none", name: "Uncategorized", count: routines.filter((t) => !t.categoryId).length },
  ].filter((c) => c.id === "all" || c.count > 0);

  function startEdit(t: TaskTemplate) {
    setEditing(t);
    setEditTitle(t.title);
    setEditTime(t.time ?? "");
    setEditScope("future_occurrences");
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || !editTitle.trim()) return;
    await ws.editTemplate(editing.id, { title: editTitle.trim(), time: editTime || undefined }, editScope, ws.today);
    setEditing(null);
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Routines" subtitle="Repeating tasks that shape your day." />

      {editing ? (
        <Card className="p-5">
          <form onSubmit={(e) => void saveEdit(e)} className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-medium">Edit routine</h2>
              <button type="button" onClick={() => setEditing(null)} className="text-sm text-ink-3 hover:text-ink">
                Cancel
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="edit-rt-title" className="mb-1 block text-xs text-ink-3">
                  Title
                </label>
                <input
                  id="edit-rt-title"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="min-h-11 w-full rounded-ui border border-line bg-surface px-3 text-ink"
                />
              </div>
              <div>
                <label htmlFor="edit-rt-time" className="mb-1 block text-xs text-ink-3">
                  Time (optional)
                </label>
                <input
                  id="edit-rt-time"
                  type="time"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  className="min-h-11 w-full rounded-ui border border-line bg-surface px-3 text-ink"
                />
              </div>
            </div>
            <fieldset>
              <legend className="mb-2 text-xs text-ink-3">Apply change to (past completed days remain unchanged)</legend>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["this_occurrence", "Today only"],
                    ["future_occurrences", "Future occurrences"],
                  ] as const
                ).map(([val, label]) => (
                  <label
                    key={val}
                    className={cn(
                      "flex min-h-10 cursor-pointer items-center rounded-ui border px-4 text-sm",
                      editScope === val ? "border-inverse bg-inverse text-on-inverse" : "border-line bg-surface",
                    )}
                  >
                    <input
                      type="radio"
                      name="edit-scope"
                      checked={editScope === val}
                      onChange={() => setEditScope(val)}
                      className="sr-only"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex gap-2">
              <Button type="submit">Save changes</Button>
              <Button
                variant="secondary"
                onClick={async () => {
                  await ws.archiveTemplate(editing.id);
                  setEditing(null);
                }}
              >
                Archive routine
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-6">
          {routines.length > 0 ? (
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
          ) : null}

          {groups.length === 0 ? (
            <Card>
              <EmptyState
                icon={ListChecks}
                title="No routines yet"
                description="Routines repeat every day, on selected weekdays, or every N days. Add your first one."
                action={
                  <Button variant="secondary" onClick={() => void ws.loadStarterRoutine()}>
                    Load starter routine
                  </Button>
                }
              />
            </Card>
          ) : (
            groups.map((g) => (
              <section key={g.id} aria-label={g.name}>
                <SectionHeading>{g.name}</SectionHeading>
                <Card className="overflow-hidden">
                  <ul className="divide-y divide-line">
                    {g.items.map((t) => {
                      const scheduledToday = occursOn(t.recurrence, ws.today);
                      const occ = ws.occurrencesOn(ws.today).find((o) => o.templateId === t.id);
                      return (
                        <TaskRow
                          key={t.id}
                          title={occ?.titleSnapshot ?? t.title}
                          time={occ?.time ?? t.time}
                          schedule={describeRecurrence(t.recurrence)}
                          scheduledToday={scheduledToday}
                          completed={occ?.completed ?? false}
                          mode={t.mode}
                          progressValue={occ?.progressValue ?? 0}
                          targetValue={t.targetValue}
                          unit={t.unit}
                          targetDurationMinutes={t.targetDurationMinutes}
                          onToggle={() => void ws.toggleOccurrence(t.id, ws.today)}
                          onIncrement={(delta) => void ws.recordProgress(t.id, ws.today, delta)}
                          onCorrect={(val) => void ws.correctProgress(t.id, ws.today, val)}
                          actions={
                            <button
                              type="button"
                              onClick={() => startEdit(t)}
                              aria-label={`Edit ${t.title}`}
                              className="grid size-8 place-items-center rounded-ui text-ink-3 hover:bg-surface-2 hover:text-ink"
                            >
                              <Pencil aria-hidden className="size-4" />
                            </button>
                          }
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
                categories={ws.categories}
                today={ws.today}
                contextLabel="routine"
                onSubmit={(v) =>
                  ws.addRoutine({
                    title: v.title,
                    categoryId: v.categoryId,
                    time: v.time,
                    mode: v.mode,
                    targetValue: v.targetValue,
                    unit: v.unit,
                    targetDurationMinutes: v.targetDurationMinutes,
                    recurrence: v.recurrence ?? { kind: "daily", startsOn: ws.today },
                    reminder: v.reminder,
                  })
                }
              />
            </Card>
          </section>

          <section aria-labelledby="manage-cats">
            <SectionHeading id="manage-cats">Categories</SectionHeading>
            <Card className="space-y-3 p-4">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newCatName.trim()) return;
                  await ws.createCategory(newCatName);
                  setNewCatName("");
                }}
                className="flex gap-2"
              >
                <label htmlFor="new-category" className="sr-only">
                  New category name
                </label>
                <input
                  id="new-category"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="New category…"
                  className="min-h-10 flex-1 rounded-ui border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3"
                />
                <Button type="submit" size="icon" aria-label="Add category">
                  <Plus aria-hidden className="size-4" />
                </Button>
              </form>
              {ws.categories.length === 0 ? (
                <p className="text-xs text-ink-3">No categories yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {ws.categories.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <span className="truncate">{c.name}</span>
                      <button
                        type="button"
                        onClick={() => void ws.deleteCategory(c.id)}
                        aria-label={`Delete category ${c.name} (tasks move to Uncategorized)`}
                        className="grid size-8 place-items-center rounded-ui text-ink-3 hover:bg-surface-2 hover:text-ink"
                      >
                        <Trash2 aria-hidden className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-ink-3">Deleting a category moves its routines to Uncategorized and preserves history.</p>
            </Card>
          </section>
        </aside>
      </div>
    </div>
  );
}
