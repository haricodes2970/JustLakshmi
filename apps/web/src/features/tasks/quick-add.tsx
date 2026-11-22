"use client";

import { useId, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { WEEKDAY_LABELS } from "@/lib/dates";
import type { Category, LocalTime, Recurrence, Weekday } from "@/types";

export type QuickAddValue = { title: string; categoryId?: string; time?: LocalTime; recurrence?: Recurrence };

const fieldClass =
  "min-h-11 w-full rounded-ui border border-line bg-surface px-3 text-ink placeholder:text-ink-3 focus-visible:outline-2";

/**
 * Quick add needs only a title. Time, category and (for routines) schedule are
 * progressively disclosed. Nothing is saved anywhere: demo store only.
 */
export function QuickAdd({
  mode,
  categories,
  onSubmit,
  contextLabel,
}: {
  mode: "task" | "routine";
  categories: readonly Category[];
  onSubmit: (value: QuickAddValue) => void;
  contextLabel?: string;
}) {
  const uid = useId();
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [open, setOpen] = useState(false);
  const [scheduleKind, setScheduleKind] = useState<"daily" | "weekdays">("daily");
  const [days, setDays] = useState<Weekday[]>([1, 2, 3, 4, 5]);
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);

  const noun = mode === "task" ? "task" : "routine";

  function toggleDay(d: Weekday) {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setMessage({ kind: "error", text: `Give your ${noun} a name first.` });
      return;
    }
    if (mode === "routine" && scheduleKind === "weekdays" && days.length === 0) {
      setMessage({ kind: "error", text: "Choose at least one day." });
      return;
    }
    onSubmit({
      title: trimmed,
      categoryId: categoryId || undefined,
      time: time || undefined,
      recurrence:
        mode === "routine"
          ? scheduleKind === "daily"
            ? { kind: "daily" }
            : { kind: "weekdays", days: [...days].sort() }
          : undefined,
    });
    setTitle("");
    setTime("");
    setCategoryId("");
    setMessage({ kind: "ok", text: `Added to demo ${contextLabel ?? noun}s. Not saved.` });
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="flex gap-2">
        <label htmlFor={`${uid}-title`} className="sr-only">
          New {noun} name
        </label>
        <input
          id={`${uid}-title`}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (message) setMessage(null);
          }}
          placeholder={mode === "task" ? "Add a task…" : "Add a routine…"}
          autoComplete="off"
          enterKeyHint="done"
          aria-invalid={message?.kind === "error"}
          aria-describedby={`${uid}-msg`}
          className={fieldClass}
        />
        <Button type="submit" size="icon" aria-label={`Add ${noun}`}>
          <Plus aria-hidden className="size-5" />
        </Button>
      </div>

      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${uid}-more`}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-8 items-center gap-1 text-sm text-ink-3 hover:text-ink"
      >
        More options
        <ChevronDown aria-hidden className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div id={`${uid}-more`} className="jl-enter grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${uid}-time`} className="mb-1 block text-xs text-ink-3">
              Time (optional)
            </label>
            <input id={`${uid}-time`} type="time" value={time} onChange={(e) => setTime(e.target.value)} className={fieldClass} />
          </div>
          <div>
            <label htmlFor={`${uid}-cat`} className="mb-1 block text-xs text-ink-3">
              Category (optional)
            </label>
            <select id={`${uid}-cat`} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={fieldClass}>
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {mode === "routine" ? (
            <fieldset className="sm:col-span-2">
              <legend className="mb-1 text-xs text-ink-3">Repeats</legend>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["daily", "Every day"],
                    ["weekdays", "Selected days"],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center rounded-ui border px-4 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink",
                      scheduleKind === value ? "border-inverse bg-inverse text-on-inverse" : "border-line bg-surface",
                    )}
                  >
                    <input
                      type="radio"
                      name={`${uid}-repeat`}
                      checked={scheduleKind === value}
                      onChange={() => setScheduleKind(value)}
                      className="sr-only"
                    />
                    {label}
                  </label>
                ))}
              </div>
              {scheduleKind === "weekdays" ? (
                <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Days of the week">
                  {([1, 2, 3, 4, 5, 6, 0] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={days.includes(d)}
                      onClick={() => toggleDay(d)}
                      className={cn(
                        "min-h-11 min-w-11 rounded-ui border px-2 text-sm font-medium",
                        days.includes(d) ? "border-inverse bg-inverse text-on-inverse" : "border-line bg-surface text-ink-2",
                      )}
                    >
                      {WEEKDAY_LABELS[d]}
                    </button>
                  ))}
                </div>
              ) : null}
              <p className="mt-2 text-xs text-ink-3">Custom repeat rules arrive in a later phase.</p>
            </fieldset>
          ) : null}
        </div>
      ) : null}

      <p id={`${uid}-msg`} role="status" aria-live="polite" className={cn("min-h-5 text-sm", message?.kind === "error" ? "text-ink" : "text-ink-3")}>
        {message?.text}
      </p>
    </form>
  );
}
