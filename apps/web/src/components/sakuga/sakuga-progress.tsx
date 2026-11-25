"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { SAKUGA_SPRINGS, Spring } from "./motion-config";
import { useSakuga } from "./sakuga-provider";

/**
 * Spring-driven horizontal progress bar with flat two-tone Sakuga styling.
 */
export function SakugaProgress({
  percent,
  label,
  className,
}: {
  percent: number;
  label: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const fillRef = useRef<HTMLDivElement | null>(null);
  const springRef = useRef<Spring | null>(null);
  const rafRef = useRef<number | null>(null);
  const { reducedMotion } = useSakuga();

  useEffect(() => {
    const el = fillRef.current;
    if (!el) return;

    if (reducedMotion) {
      el.style.width = `${clamped}%`;
      return;
    }

    if (!springRef.current) {
      springRef.current = new Spring(clamped, SAKUGA_SPRINGS.progress);
      el.style.width = `${clamped}%`;
      return;
    }

    const spring = springRef.current;
    spring.to = clamped;

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    let last = performance.now();

    const step = (now: number) => {
      const node = fillRef.current;
      if (!node) {
        rafRef.current = null;
        return;
      }
      const dt = (now - last) / 1000;
      last = now;
      const val = Math.max(0, Math.min(100, spring.step(dt)));
      node.style.width = `${val.toFixed(2)}%`;
      if (!spring.isSettled()) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        node.style.width = `${clamped}%`;
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [clamped, reducedMotion]);

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-2.5 w-full overflow-hidden rounded-full border border-line bg-surface-2", className)}
    >
      <div
        ref={fillRef}
        style={{ width: `${clamped}%` }}
        className={cn(
          "h-full rounded-full transition-colors duration-200",
          clamped >= 100 ? "bg-sk-success" : "bg-sk-violet",
        )}
      />
    </div>
  );
}
