"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Accessible hover/focus tooltip with crisp ink border and calm appearance.
 * Never used as the sole carrier of essential state or instructions.
 */
export function SakugaTooltip({
  content,
  children,
  className,
}: {
  content: string;
  children: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);

  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span aria-describedby={open ? id : undefined} className="inline-flex">
        {children}
      </span>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className="jl-enter pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 whitespace-nowrap rounded-[10px] border-2 border-line-strong bg-surface px-2.5 py-1 text-xs font-medium text-ink sk-ink-shadow"
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
