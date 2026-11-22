"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";

export type SegmentOption<T extends string> = { value: T; label: string; icon?: React.ReactNode };

/** Radio-group segmented control (arrow keys supported by native radios). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">{label}</legend>
      <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-ui bg-surface-2 p-1">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-[10px] px-3 text-sm font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink",
              value === o.value ? "bg-surface text-ink" : "text-ink-3 hover:text-ink",
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.icon}
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
