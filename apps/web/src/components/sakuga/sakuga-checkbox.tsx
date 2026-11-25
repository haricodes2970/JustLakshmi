"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { SAKUGA_SPRINGS, Spring, volumeSquash } from "./motion-config";
import { useSakuga } from "./sakuga-provider";

/**
 * Accessible checkbox control (`role="checkbox"`) with Sakuga completion reaction:
 * quick spring squash-overshoot, drawn checkmark stroke, and restrained pink accent ticks.
 */
export function SakugaCheckbox({
  checked,
  onToggle,
  label,
  celebrate = false,
  className,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  celebrate?: boolean;
  className?: string;
}) {
  const boxRef = useRef<HTMLSpanElement | null>(null);
  const springRef = useRef<Spring | null>(null);
  const rafRef = useRef<number | null>(null);
  const { fireEffect, reducedMotion } = useSakuga();

  const kickPop = () => {
    if (reducedMotion) return;
    if (!springRef.current) {
      springRef.current = new Spring(1, SAKUGA_SPRINGS.checkbox);
    }
    const spring = springRef.current;
    spring.x = 0.8;
    spring.v = 5.4;
    spring.to = 1;

    if (rafRef.current !== null) return;
    let last = performance.now();

    const step = (now: number) => {
      const el = boxRef.current;
      if (!el) {
        rafRef.current = null;
        return;
      }
      const dt = (now - last) / 1000;
      last = now;
      const sy = spring.step(dt);
      const { sx } = volumeSquash(sy);
      el.style.transform = `scale3d(${sx.toFixed(4)}, ${sy.toFixed(4)}, 1)`;
      if (!spring.isSettled()) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        el.style.transform = "";
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(step);
  };

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => {
        const willCheck = !checked;
        if (willCheck && !reducedMotion && boxRef.current) {
          kickPop();
          fireEffect(celebrate ? "burst" : "ticks", boxRef.current, {
            scale: celebrate ? 0.95 : 0.82,
            accent: "pink",
          });
          if (celebrate) {
            fireEffect("kira", boxRef.current, { scale: 0.9, accent: "violet" });
          }
        }
        onToggle();
      }}
      className={cn("-m-2 grid size-11 shrink-0 place-items-center rounded-full", className)}
    >
      <span
        ref={boxRef}
        className={cn(
          "grid size-6 place-items-center rounded-full border-2 transition-colors duration-150 will-change-transform",
          checked
            ? "border-line-strong bg-sk-violet text-white"
            : "border-ink-3 bg-surface text-transparent hover:border-sk-violet",
        )}
      >
        {checked ? (
          <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden="true">
            <path
              d="M3.2 8.4L6.4 11.6L12.8 4.8"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="sk-check-path"
            />
          </svg>
        ) : null}
      </span>
    </button>
  );
}
