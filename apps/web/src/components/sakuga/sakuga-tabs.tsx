"use client";

import { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/cn";
import { SAKUGA_SPRINGS, Spring } from "./motion-config";
import { useSakuga } from "./sakuga-provider";

export type SakugaTabOption<T extends string> = {
  value: T;
  label: string;
  icon?: React.ReactNode;
};

/**
 * Accessible radio-group segmented tabs with a spring-driven sliding ink/paper pill indicator.
 * Native radio inputs preserve keyboard arrow navigation out of the box.
 */
export function SakugaTabs<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: readonly SakugaTabOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
  const name = useId();
  const activeIdx = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const pillRef = useRef<HTMLSpanElement | null>(null);
  const springRef = useRef<Spring | null>(null);
  const rafRef = useRef<number | null>(null);
  const prevIdxRef = useRef(activeIdx);
  const { reducedMotion } = useSakuga();

  useEffect(() => {
    const el = pillRef.current;
    if (!el || options.length === 0) return;

    const targetPct = activeIdx * 100;
    if (reducedMotion || prevIdxRef.current === activeIdx) {
      el.style.transform = `translate3d(${targetPct}%, 0, 0)`;
      prevIdxRef.current = activeIdx;
      return;
    }

    const fromPct = prevIdxRef.current * 100;
    prevIdxRef.current = activeIdx;
    if (!springRef.current) {
      springRef.current = new Spring(fromPct, SAKUGA_SPRINGS.tab);
    }
    const spring = springRef.current;
    spring.to = targetPct;

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    let last = performance.now();

    const step = (now: number) => {
      const node = pillRef.current;
      if (!node) {
        rafRef.current = null;
        return;
      }
      const dt = (now - last) / 1000;
      last = now;
      const x = spring.step(dt);
      node.style.transform = `translate3d(${x.toFixed(2)}%, 0, 0)`;
      if (!spring.isSettled()) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        node.style.transform = `translate3d(${targetPct}%, 0, 0)`;
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [activeIdx, options.length, reducedMotion]);

  const widthPct = options.length > 0 ? 100 / options.length : 100;

  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className="sr-only">{label}</legend>
      <div className="relative grid auto-cols-fr grid-flow-col rounded-ui border border-line bg-surface-2 p-1">
        <span
          ref={pillRef}
          aria-hidden="true"
          style={{
            width: `calc(${widthPct}% - 4px)`,
            transform: `translate3d(${activeIdx * 100}%, 0, 0)`,
          }}
          className="pointer-events-none absolute top-1 bottom-1 left-1 rounded-[10px] border border-line-strong/80 bg-surface sk-card-shadow will-change-transform"
        />
        {options.map((o) => {
          const active = value === o.value;
          return (
            <label
              key={o.value}
              className={cn(
                "relative z-10 flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-[10px] px-3 text-sm font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
                active ? "text-ink" : "text-ink-3 hover:text-ink",
              )}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={active}
                onChange={() => onChange(o.value)}
                className="sr-only"
              />
              {o.icon}
              <span>{o.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
