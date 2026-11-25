"use client";

import { useState } from "react";
import { CalendarOff, Clock, History, Minus, Plus, Repeat } from "lucide-react";
import type { AuditEvent, TaskMode } from "@justlakshmi/shared";
import { TaskCheck } from "@/components/ui/task-check";
import { cn } from "@/lib/cn";
import { formatTime } from "@/lib/dates";

export function TaskRow({
  title,
  completed,
  onToggle,
  time,
  category,
  schedule,
  scheduledToday = true,
  mode = "checkbox",
  progressValue = 0,
  targetValue,
  unit,
  targetDurationMinutes,
  onIncrement,
  onCorrect,
  auditEvents = [],
  actions,
}: {
  title: string;
  completed: boolean;
  onToggle: () => void;
  time?: string;
  category?: string;
  schedule?: string;
  scheduledToday?: boolean;
  mode?: TaskMode;
  progressValue?: number;
  targetValue?: number;
  unit?: string;
  targetDurationMinutes?: number;
  onIncrement?: (delta: number) => void;
  onCorrect?: (exactValue: number) => void;
  auditEvents?: readonly AuditEvent[];
  actions?: React.ReactNode;
}) {
  const [showAudit, setShowAudit] = useState(false);
  const [editingValue, setEditingValue] = useState(false);
  const [draftVal, setDraftVal] = useState(String(progressValue));

  const target = mode === "measurable" ? targetValue : mode === "duration" ? targetDurationMinutes : undefined;
  const displayUnit = mode === "duration" ? "min" : (unit ?? "");
  const step = mode === "duration" ? 5 : target && target >= 500 ? 250 : 1;

  return (
    <li className={cn("px-4 py-3.5 transition-colors", completed && "bg-surface-2/40")}>
      <div className="flex items-center gap-3">
        {scheduledToday ? (
          <TaskCheck
            checked={completed}
            onToggle={onToggle}
            celebrate={Boolean(time)}
            label={`${title}${time ? `, ${formatTime(time)}` : ""}`}
          />
        ) : (
          <span className="-m-2 grid size-11 shrink-0 place-items-center text-ink-3" title="Not scheduled today">
            <CalendarOff aria-hidden className="size-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className={cn("truncate text-[0.9375rem] font-medium transition-colors", completed && "text-ink-3 line-through")}>
            {title}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-3">
            {time ? (
              <span className="inline-flex items-center gap-1">
                <Clock aria-hidden className="size-3 text-sk-violet" />
                {formatTime(time)}
              </span>
            ) : (
              <span>Anytime</span>
            )}
            {schedule ? (
              <span className="inline-flex items-center gap-1">
                <Repeat aria-hidden className="size-3" />
                {schedule}
              </span>
            ) : null}
            {category ? (
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-2">{category}</span>
            ) : null}
            {mode !== "checkbox" && target !== undefined ? (
              <span className="font-semibold text-sk-violet tabular-nums">
                {progressValue} / {target} {displayUnit}
              </span>
            ) : null}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          {auditEvents.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowAudit((v) => !v)}
              aria-expanded={showAudit}
              aria-label={`Audit history (${auditEvents.length})`}
              className="grid size-8 place-items-center rounded-ui text-ink-3 hover:bg-surface-2 hover:text-ink"
            >
              <History aria-hidden className="size-4" />
            </button>
          ) : null}
          {actions}
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-medium",
              !scheduledToday
                ? "text-ink-3"
                : completed
                  ? "bg-sk-success-soft text-sk-success"
                  : "bg-surface-2 text-ink-3",
            )}
          >
            {scheduledToday ? (completed ? "Done" : "Pending") : "Not today"}
          </span>
        </div>
      </div>

      {scheduledToday && mode !== "checkbox" && onIncrement ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-9">
          <button
            type="button"
            onClick={() => onIncrement(-step)}
            disabled={progressValue <= 0}
            aria-label={`Decrease ${title} by ${step} ${displayUnit}`}
            className="inline-flex min-h-8 items-center gap-1 rounded-ui border border-line bg-surface px-2.5 text-xs text-ink-2 transition-colors hover:bg-surface-2 active:scale-95 disabled:opacity-40"
          >
            <Minus aria-hidden className="size-3" />
            {step} {displayUnit}
          </button>
          <button
            type="button"
            onClick={() => onIncrement(step)}
            aria-label={`Add ${step} ${displayUnit} to ${title}`}
            className="inline-flex min-h-8 items-center gap-1 rounded-ui border border-line-strong/60 bg-sk-violet-soft px-2.5 text-xs font-medium text-ink transition-colors hover:bg-sk-lavender active:scale-95"
          >
            <Plus aria-hidden className="size-3" />
            {step} {displayUnit}
          </button>
          {onCorrect ? (
            editingValue ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const num = Number(draftVal);
                  if (!Number.isNaN(num) && num >= 0) onCorrect(num);
                  setEditingValue(false);
                }}
                className="inline-flex items-center gap-1.5"
              >
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={draftVal}
                  onChange={(e) => setDraftVal(e.target.value)}
                  aria-label={`Set exact ${displayUnit} for ${title}`}
                  className="h-8 w-20 rounded-ui border border-line bg-surface px-2 text-xs text-ink"
                />
                <button type="submit" className="min-h-8 rounded-ui bg-inverse px-2.5 text-xs font-medium text-on-inverse">
                  Save
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setDraftVal(String(progressValue));
                  setEditingValue(true);
                }}
                className="min-h-8 px-2 text-xs text-ink-3 underline underline-offset-4 hover:text-ink"
              >
                Edit value
              </button>
            )
          ) : null}
        </div>
      ) : null}

      {showAudit && auditEvents.length > 0 ? (
        <div className="mt-2 ml-9 rounded-ui border border-line bg-bg px-3 py-2 text-xs text-ink-3">
          <p className="mb-1 font-medium text-ink-2">Audit history</p>
          <ul className="space-y-1">
            {auditEvents.slice(-5).reverse().map((ev) => (
              <li key={ev.id} className="flex flex-wrap justify-between gap-2">
                <span>{ev.action.replace("_", " ")}</span>
                <span className="tabular-nums">{new Date(ev.occurredAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}
