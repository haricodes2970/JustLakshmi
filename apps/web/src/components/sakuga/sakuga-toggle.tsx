"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { SAKUGA_SPRINGS, Spring } from "./motion-config";
import { useSakuga } from "./sakuga-provider";

/**
 * Accessible switch (`role="switch"`) whose knob slides on a spring with velocity-driven
 * horizontal stretch and a subtle puff on change. Plain at rest.
 */
export function SakugaToggle({
  checked,
  onChange,
  disabled = false,
  id,
  label,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  id?: string;
  label?: string;
  className?: string;
}) {
  const knobRef = useRef<HTMLSpanElement | null>(null);
  const trackRef = useRef<HTMLButtonElement | null>(null);
  const springRef = useRef<Spring | null>(null);
  const rafRef = useRef<number | null>(null);
  const prevCheckedRef = useRef(checked);
  const { fireEffect, reducedMotion } = useSakuga();

  useEffect(() => {
    const el = knobRef.current;
    if (!el) return;

    const target = checked ? 20 : 0;
    if (reducedMotion || prevCheckedRef.current === checked) {
      el.style.transform = `translate3d(${target}px, 0, 0)`;
      prevCheckedRef.current = checked;
      return;
    }

    prevCheckedRef.current = checked;
    if (!springRef.current) {
      springRef.current = new Spring(checked ? 0 : 20, SAKUGA_SPRINGS.toggle);
    }
    const spring = springRef.current;
    spring.to = target;

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    let last = performance.now();

    const step = (now: number) => {
      const node = knobRef.current;
      if (!node) {
        rafRef.current = null;
        return;
      }
      const dt = (now - last) / 1000;
      last = now;
      const x = spring.step(dt);
      // Velocity-driven stretch (keeps volume: wider when fast, slightly shorter)
      const speed = Math.min(Math.abs(spring.v) / 480, 0.24);
      const sx = 1 + speed;
      const sy = 1 / Math.sqrt(sx);
      node.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0) scale3d(${sx.toFixed(3)}, ${sy.toFixed(3)}, 1)`;
      if (!spring.isSettled()) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        node.style.transform = `translate3d(${target}px, 0, 0)`;
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [checked, reducedMotion]);

  return (
    <button
      ref={trackRef}
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        const next = !checked;
        if (!reducedMotion && trackRef.current) {
          fireEffect(next ? "ticks" : "puff", trackRef.current, {
            scale: 0.65,
            accent: next ? "violet" : "pink",
          });
        }
        onChange(next);
      }}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 p-0.5 transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40",
        checked ? "border-line-strong bg-sk-violet" : "border-line bg-surface-2 hover:border-ink-3",
        className,
      )}
    >
      <span
        ref={knobRef}
        aria-hidden="true"
        style={{ transform: `translate3d(${checked ? 20 : 0}px, 0, 0)` }}
        className={cn(
          "block size-5 rounded-full border-2 border-line-strong bg-surface will-change-transform",
        )}
      />
    </button>
  );
}
