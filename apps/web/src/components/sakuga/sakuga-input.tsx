"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/cn";

/**
 * Calm, distraction-free `<input>` with crisp Sakuga ink/violet active focus state.
 * Maintains >= 16px font size to prevent iOS Safari focus zoom.
 */
export const SakugaInput = forwardRef<HTMLInputElement, React.ComponentProps<"input">>(function SakugaInput(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "min-h-11 w-full rounded-ui border border-line bg-surface px-3 text-ink placeholder:text-ink-3 transition-[border-color,box-shadow] duration-150 focus:border-sk-violet focus:shadow-[0_2px_0_var(--sk-lavender)] focus:outline-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});

/** Calm `<textarea>` with matching Sakuga focus styling. */
export const SakugaTextarea = forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  function SakugaTextarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "w-full rounded-ui border border-line bg-surface px-3 py-2 text-ink placeholder:text-ink-3 transition-[border-color,box-shadow] duration-150 focus:border-sk-violet focus:shadow-[0_2px_0_var(--sk-lavender)] focus:outline-none disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);
