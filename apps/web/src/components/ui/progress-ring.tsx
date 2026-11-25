"use client";

import { useEffect, useRef } from "react";
import { SAKUGA_SPRINGS, Spring, useSakuga } from "@/components/sakuga";
import { cn } from "@/lib/cn";

export function ProgressRing({
  percent,
  size = 96,
  stroke = 8,
  label,
  celebrateOnFull = false,
  className,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  label: string;
  celebrateOnFull?: boolean;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const circleRef = useRef<SVGCircleElement | null>(null);
  const springRef = useRef<Spring | null>(null);
  const rafRef = useRef<number | null>(null);
  const prevPercentRef = useRef(clamped);
  const { fireEffect, reducedMotion } = useSakuga();

  useEffect(() => {
    const circle = circleRef.current;
    if (!circle) return;

    const prev = prevPercentRef.current;
    prevPercentRef.current = clamped;

    if (celebrateOnFull && prev < 100 && clamped === 100 && !reducedMotion && rootRef.current) {
      fireEffect("burst", rootRef.current, { scale: 1.2, accent: "violet" });
      fireEffect("shards", rootRef.current, { scale: 1.0, accent: "pink" });
      fireEffect("sfx", rootRef.current, { word: "ドン!", scale: 1.0 });
    }

    if (reducedMotion) {
      circle.style.strokeDashoffset = String(c * (1 - clamped / 100));
      return;
    }

    if (!springRef.current) {
      springRef.current = new Spring(clamped, SAKUGA_SPRINGS.progress);
      circle.style.strokeDashoffset = String(c * (1 - clamped / 100));
      return;
    }

    const spring = springRef.current;
    spring.to = clamped;

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    let last = performance.now();

    const step = (now: number) => {
      const node = circleRef.current;
      if (!node) {
        rafRef.current = null;
        return;
      }
      const dt = (now - last) / 1000;
      last = now;
      const val = Math.max(0, Math.min(100, spring.step(dt)));
      node.style.strokeDashoffset = String(c * (1 - val / 100));
      if (!spring.isSettled()) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        node.style.strokeDashoffset = String(c * (1 - clamped / 100));
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [clamped, c, celebrateOnFull, fireEffect, reducedMotion]);

  const isComplete = clamped >= 100;

  return (
    <div
      ref={rootRef}
      role="img"
      aria-label={`${label}: ${Math.round(clamped)} percent`}
      className={cn("relative grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--line)"
          strokeWidth={1.25}
        />
        <circle
          ref={circleRef}
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={isComplete ? "var(--sk-success)" : "var(--sk-violet)"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped / 100)}
        />
      </svg>
      <span className="absolute font-display text-xl tabular-nums text-ink">{Math.round(clamped)}%</span>
    </div>
  );
}
