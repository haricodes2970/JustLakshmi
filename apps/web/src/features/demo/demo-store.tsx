"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { DEMO_CATEGORIES, buildDemoTemplates } from "@/data/demo/tasks";
import { completionOn } from "@/domain/analytics";
import { templatesOn } from "@/domain/recurrence";
import { useClock } from "@/lib/use-clock";
import type { Category, DayCompletion, ISODate, LocalTime, Recurrence, TaskOccurrence, TaskTemplate } from "@/types";

/**
 * In-memory demo store. Nothing here is persisted or synced: it exists so the
 * Phase 1 UI is interactive. A later phase replaces it with repository-backed
 * data (IndexedDB working copy + Google Drive), keeping the same read API.
 */

export type NewTaskInput = { title: string; categoryId?: string; time?: LocalTime };
export type NewRoutineInput = NewTaskInput & { recurrence: Recurrence };

type DemoStore = {
  ready: boolean;
  today: ISODate;
  categories: readonly Category[];
  templates: readonly TaskTemplate[];
  categoryName: (id?: string) => string;
  occurrencesOn: (date: ISODate) => TaskOccurrence[];
  completionOn: (date: ISODate) => DayCompletion;
  isDone: (templateId: string, date: ISODate) => boolean;
  toggle: (templateId: string, date: ISODate) => void;
  addTask: (input: NewTaskInput, date: ISODate) => void;
  addRoutine: (input: NewRoutineInput) => void;
};

const Ctx = createContext<DemoStore | null>(null);

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 100;
}

const byTime = (a: { time?: string; title: string }, b: { time?: string; title: string }) =>
  (a.time ?? "99:99").localeCompare(b.time ?? "99:99") || a.title.localeCompare(b.title);

export function DemoStoreProvider({ children }: { children: React.ReactNode }) {
  const clock = useClock();
  const today = clock?.date ?? "1970-01-01";
  const nowTime = clock ? `${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}` : "00:00";

  const [added, setAdded] = useState<TaskTemplate[]>([]);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const templates = useMemo(() => [...buildDemoTemplates(today), ...added], [today, added]);

  const isDone = useCallback(
    (templateId: string, date: ISODate) => {
      const key = `${templateId}@${date}`;
      const override = overrides[key];
      if (override !== undefined) return override;
      if (date > today) return false;
      const template = templates.find((t) => t.id === templateId);
      // Added items start pending; seeded history only applies to sample templates.
      if (!template || added.some((a) => a.id === templateId)) return false;
      if (date < today) return hash(key) < 78;
      return !!template.time && template.time < nowTime && hash(key) < 70;
    },
    [overrides, today, templates, added, nowTime],
  );

  const toggle = useCallback(
    (templateId: string, date: ISODate) => {
      const key = `${templateId}@${date}`;
      setOverrides((prev) => ({ ...prev, [key]: !isDone(templateId, date) }));
    },
    [isDone],
  );

  const occurrencesOn = useCallback(
    (date: ISODate): TaskOccurrence[] =>
      templatesOn(templates, date)
        .map((t) => ({
          key: `${t.id}@${date}`,
          templateId: t.id,
          date,
          title: t.title,
          categoryId: t.categoryId,
          time: t.time,
          completed: isDone(t.id, date),
        }))
        .sort(byTime),
    [templates, isDone],
  );

  const addTask = useCallback((input: NewTaskInput, date: ISODate) => {
    setAdded((prev) => [
      ...prev,
      { id: `new-${prev.length}-${Date.now()}`, ...input, recurrence: { kind: "once", date } },
    ]);
  }, []);

  const addRoutine = useCallback((input: NewRoutineInput) => {
    setAdded((prev) => [...prev, { id: `new-${prev.length}-${Date.now()}`, ...input }]);
  }, []);

  const value = useMemo<DemoStore>(
    () => ({
      ready: clock !== null,
      today,
      categories: DEMO_CATEGORIES,
      templates,
      categoryName: (id) => DEMO_CATEGORIES.find((c) => c.id === id)?.name ?? "Uncategorized",
      occurrencesOn,
      completionOn: (date) => completionOn(templates, date, isDone),
      isDone,
      toggle,
      addTask,
      addRoutine,
    }),
    [clock, today, templates, occurrencesOn, isDone, toggle, addTask, addRoutine],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDemoStore(): DemoStore {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDemoStore must be used within DemoStoreProvider");
  return ctx;
}
