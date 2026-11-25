"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { SAKUGA_SPRINGS, Spring, volumeSquash } from "./motion-config";
import { useSakuga } from "./sakuga-provider";

export type SakugaButtonVariant = "primary" | "secondary" | "ghost" | "accent";
export type SakugaButtonSize = "sm" | "md" | "icon";

const VARIANTS: Record<SakugaButtonVariant, string> = {
  primary:
    "border-2 border-line-strong bg-inverse text-on-inverse sk-ink-shadow hover:brightness-110",
  accent:
    "border-2 border-line-strong bg-sk-violet text-white sk-ink-shadow hover:brightness-110",
  secondary:
    "border border-line bg-surface text-ink sk-card-shadow hover:border-line-strong/60 hover:bg-surface-2",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
};

const SIZES: Record<SakugaButtonSize, string> = {
  sm: "min-h-9 px-3 text-xs font-medium",
  md: "min-h-11 px-4 text-sm font-medium",
  icon: "size-11",
};

/**
 * Real `<button>` with Sakuga spring squash-on-press, volume-preserving overshoot on release,
 * and optional micro-burst or accent ticks. Plain at rest; reactive on pointer/keyboard press.
 */
export function SakugaButton({
  variant = "primary",
  size = "md",
  effect = "none",
  className,
  type = "button",
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  onClick,
  disabled,
  ...props
}: React.ComponentProps<"button"> & {
  variant?: SakugaButtonVariant;
  size?: SakugaButtonSize;
  effect?: "none" | "ticks" | "burst";
}) {
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const springRef = useRef<Spring | null>(null);
  const rafRef = useRef<number | null>(null);
  const { fireEffect, reducedMotion } = useSakuga();

  const animateTo = (targetSy: number, kickVelocity = 0) => {
    if (reducedMotion || disabled) return;
    if (!springRef.current) {
      springRef.current = new Spring(1, SAKUGA_SPRINGS.button);
    }
    const spring = springRef.current;
    spring.to = targetSy;
    if (kickVelocity !== 0) spring.v += kickVelocity;

    if (rafRef.current !== null) return;
    let last = performance.now();

    const step = (now: number) => {
      const el = btnRef.current;
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
      ref={btnRef}
      type={type}
      disabled={disabled}
      onPointerDown={(e) => {
        animateTo(0.88);
        onPointerDown?.(e);
      }}
      onPointerUp={(e) => {
        animateTo(1, 3.2);
        onPointerUp?.(e);
      }}
      onPointerLeave={(e) => {
        animateTo(1);
        onPointerLeave?.(e);
      }}
      onClick={(e) => {
        if (!reducedMotion && !disabled && effect !== "none" && btnRef.current) {
          fireEffect(effect, btnRef.current, { scale: effect === "burst" ? 0.9 : 0.85, accent: "pink" });
        }
        onClick?.(e);
      }}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-ui transition-[background-color,border-color,color,filter] duration-150 will-change-transform disabled:pointer-events-none disabled:opacity-40",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}
