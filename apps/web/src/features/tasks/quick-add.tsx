"use client";

import { useId, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import type { Category, ISODate, LocalTime, Recurrence, ReminderConfig, TaskMode, Weekday } from "@justlakshmi/shared";
import { SakugaInput, SakugaToggle, useSakuga } from "@/components/sakuga";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { WEEKDAY_LABELS } from "@/lib/dates";

export type QuickAddValue = {
  title: string;
  categoryId?: string;
  time?: LocalTime;
  mode: TaskMode;
  targetValue?: number;
  unit?: string;
  targetDurationMinutes?: number;
  recurrence?: Recurrence;
  reminder: ReminderConfig;
};

const selectClass =
  "min-h-11 w-full rounded-ui border border-line bg-surface px-3 text-ink transition-[border-color,box-shadow] duration-150 focus:border-sk-violet focus:shadow-[0_2px_0_var(--sk-lavender)] focus:outline-none";

/**
 * Quick add requires only a task name. Optional fields (time, category, mode/target,
 * recurrence, reminder) are progressively disclosed.
 */
export function QuickAdd({
  mode,
  categories,
  today,
  onSubmit,
  contextLabel,
}: {
  mode: "task" | "routine";
  categories: readonly Category[];
  today: ISODate;
  onSubmit: (value: QuickAddValue) => void | Promise<void>;
  contextLabel?: string;
}) {
  const uid = useId();
  const { toast } = useSakuga();
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [taskMode, setTaskMode] = useState<TaskMode>("checkbox");
  const [targetValue, setTargetValue] = useState("2000");
  const [unit, setUnit] = useState("ml");
  const [targetMinutes, setTargetMinutes] = useState("20");
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [overdueEnabled, setOverdueEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [scheduleKind, setScheduleKind] = useState<"daily" | "weekdays" | "custom">("daily");
  const [days, setDays] = useState<Weekday[]>([1, 2, 3, 4, 5]);
  const [intervalDays, setIntervalDays] = useState("2");
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);

  const noun = mode === "task" ? "task" : "routine";

  function toggleDay(d: Weekday) {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  async function submit(e: React.FormEvent) {
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

    const parsedInterval = Math.max(1, Math.min(365, Math.floor(Number(intervalDays) || 1)));
    const parsedTarget = Number(targetValue);
    const parsedMinutes = Number(targetMinutes);

    if (taskMode === "measurable" && (!parsedTarget || parsedTarget <= 0)) {
      setMessage({ kind: "error", text: "Enter a positive target quantity." });
      return;
    }
    if (taskMode === "duration" && (!parsedMinutes || parsedMinutes <= 0)) {
      setMessage({ kind: "error", text: "Enter a positive duration in minutes." });
      return;
    }

    const recurrence: Recurrence | undefined =
      mode === "routine"
        ? scheduleKind === "daily"
          ? { kind: "daily", startsOn: today }
          : scheduleKind === "weekdays"
            ? { kind: "weekdays", days: [...days].sort() as Weekday[], startsOn: today }
            : { kind: "custom", intervalDays: parsedInterval, startsOn: today }
        : undefined;

    await onSubmit({
      title: trimmed,
      categoryId: categoryId || undefined,
      time: time || undefined,
      mode: taskMode,
      targetValue: taskMode === "measurable" ? parsedTarget : undefined,
      unit: taskMode === "measurable" ? unit.trim() || "units" : undefined,
      targetDurationMinutes: taskMode === "duration" ? parsedMinutes : undefined,
      recurrence,
      reminder: {
        enabled: reminderEnabled,
        time: reminderEnabled && time ? time : undefined,
        overdueEnabled: reminderEnabled && overdueEnabled,
        overdueDelayMinutes: 30,
      },
    });

    setTitle("");
    setTime("");
    setCategoryId("");
    setTaskMode("checkbox");
    setReminderEnabled(false);
    setOverdueEnabled(false);
    const savedText = `Saved ${contextLabel ?? noun} locally.`;
    setMessage({ kind: "ok", text: savedText });
    toast(`Added "${trimmed}"`, "success");
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3" noValidate>
      <div className="flex gap-2">
        <label htmlFor={`${uid}-title`} className="sr-only">
          New {noun} name
        </label>
        <SakugaInput
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
        />
        <Button type="submit" size="icon" variant="accent" effect="ticks" aria-label={`Add ${noun}`}>
          <Plus aria-hidden className="size-5" />
        </Button>
      </div>

      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${uid}-more`}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-8 items-center gap-1 text-sm text-ink-3 transition-colors hover:text-ink"
      >
        More options
        <ChevronDown aria-hidden className={cn("size-4 transition-transform duration-150", open && "rotate-180")} />
      </button>

      {open ? (
        <div id={`${uid}-more`} className="jl-enter grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${uid}-time`} className="mb-1 block text-xs text-ink-3">
              Time (optional)
            </label>
            <SakugaInput id={`${uid}-time`} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div>
            <label htmlFor={`${uid}-cat`} className="mb-1 block text-xs text-ink-3">
              Category (optional)
            </label>
            <select id={`${uid}-cat`} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={selectClass}>
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor={`${uid}-mode`} className="mb-1 block text-xs text-ink-3">
              Tracking mode
            </label>
            <select
              id={`${uid}-mode`}
              value={taskMode}
              onChange={(e) => setTaskMode(e.target.value as TaskMode)}
              className={selectClass}
            >
              <option value="checkbox">Checkbox (tap to complete)</option>
              <option value="measurable">Measurable target (e.g. ml, pages)</option>
              <option value="duration">Duration target (minutes)</option>
            </select>
          </div>

          {taskMode === "measurable" ? (
            <>
              <div>
                <label htmlFor={`${uid}-target`} className="mb-1 block text-xs text-ink-3">
                  Target quantity
                </label>
                <SakugaInput
                  id={`${uid}-target`}
                  type="number"
                  min={1}
                  step="any"
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor={`${uid}-unit`} className="mb-1 block text-xs text-ink-3">
                  Unit
                </label>
                <SakugaInput
                  id={`${uid}-unit`}
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="ml, pages, steps"
                />
              </div>
            </>
          ) : null}

          {taskMode === "duration" ? (
            <div className="sm:col-span-2">
              <label htmlFor={`${uid}-dur`} className="mb-1 block text-xs text-ink-3">
                Target duration (minutes)
              </label>
              <SakugaInput
                id={`${uid}-dur`}
                type="number"
                min={1}
                value={targetMinutes}
                onChange={(e) => setTargetMinutes(e.target.value)}
              />
            </div>
          ) : null}

          {mode === "routine" ? (
            <fieldset className="sm:col-span-2">
              <legend className="mb-1.5 text-xs text-ink-3">Repeats</legend>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["daily", "Every day"],
                    ["weekdays", "Selected days"],
                    ["custom", "Every N days"],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center rounded-ui border px-4 text-sm font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
                      scheduleKind === value
                        ? "border-2 border-line-strong bg-inverse text-on-inverse"
                        : "border-line bg-surface text-ink-2 hover:bg-surface-2",
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
                        "min-h-11 min-w-11 rounded-ui border px-2 text-sm font-medium transition-colors active:scale-95",
                        days.includes(d)
                          ? "border-2 border-line-strong bg-sk-violet text-white"
                          : "border-line bg-surface text-ink-2 hover:bg-surface-2",
                      )}
                    >
                      {WEEKDAY_LABELS[d]}
                    </button>
                  ))}
                </div>
              ) : null}
              {scheduleKind === "custom" ? (
                <div className="mt-3">
                  <label htmlFor={`${uid}-int`} className="mb-1 block text-xs text-ink-3">
                    Repeat every N days
                  </label>
                  <SakugaInput
                    id={`${uid}-int`}
                    type="number"
                    min={1}
                    max={365}
                    value={intervalDays}
                    onChange={(e) => setIntervalDays(e.target.value)}
                  />
                </div>
              ) : null}
            </fieldset>
          ) : null}

          <div className="flex flex-wrap items-center gap-4 pt-1 sm:col-span-2">
            <div className="inline-flex min-h-10 items-center gap-2.5 text-sm text-ink-2">
              <SakugaToggle checked={reminderEnabled} onChange={setReminderEnabled} label="Enable reminder" />
              <span>Enable reminder</span>
            </div>
            {reminderEnabled ? (
              <div className="inline-flex min-h-10 items-center gap-2.5 text-sm text-ink-2">
                <SakugaToggle
                  checked={overdueEnabled}
                  onChange={setOverdueEnabled}
                  label="One overdue reminder (+30m)"
                />
                <span>Overdue reminder (+30m)</span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <p
        id={`${uid}-msg`}
        role="status"
        aria-live="polite"
        className={cn("min-h-5 text-sm", message?.kind === "error" ? "font-medium text-sk-danger" : "text-ink-3")}
      >
        {message?.text}
      </p>
    </form>
  );
}
