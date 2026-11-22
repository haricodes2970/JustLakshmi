"use client";

import { CalendarOff, Clock, Repeat } from "lucide-react";
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
}: {
  title: string;
  completed: boolean;
  onToggle: () => void;
  time?: string;
  category?: string;
  schedule?: string;
  /** When false, the routine does not occur on the viewed day, so no completion control is shown. */
  scheduledToday?: boolean;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      {scheduledToday ? (
        <TaskCheck checked={completed} onToggle={onToggle} label={`${title}${time ? `, ${formatTime(time)}` : ""}`} />
      ) : (
        <span className="-m-2 grid size-11 shrink-0 place-items-center text-ink-3" title="Not scheduled today">
          <CalendarOff aria-hidden className="size-5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-[0.9375rem] font-medium", completed && "text-ink-3 line-through")}>{title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-ink-3">
          {time ? (
            <span className="inline-flex items-center gap-1">
              <Clock aria-hidden className="size-3" />
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
          {category ? <span>{category}</span> : null}
        </p>
      </div>
      <span className="text-xs font-medium text-ink-3">{scheduledToday ? (completed ? "Done" : "Pending") : "Not today"}</span>
    </li>
  );
}
