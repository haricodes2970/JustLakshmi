"use client";

/**
 * Sakuga VFX-inspired spring physics and motion configuration for JustLakshmi.
 *
 * Design principles adapted from sakuga-vfx (https://github.com/finktheartist/sakuga-vfx, MIT License):
 * - Springs, not easings, for interactive movement.
 * - Volume-preserving squash and stretch (sy * sx^2 ~= 1).
 * - Plain at rest; expressive only in response to user action.
 * - Strict respect for prefers-reduced-motion: reduce.
 */

import { useEffect, useState } from "react";

export type SpringConfig = {
  stiffness: number;
  damping: number;
  precision?: number;
};

export const SAKUGA_SPRINGS = {
  /** Crisp button press squash & release overshoot */
  button: { stiffness: 520, damping: 22, precision: 0.002 } satisfies SpringConfig,
  /** Checkbox pop & settle */
  checkbox: { stiffness: 580, damping: 20, precision: 0.002 } satisfies SpringConfig,
  /** Toggle knob slide with velocity smear */
  toggle: { stiffness: 460, damping: 24, precision: 0.002 } satisfies SpringConfig,
  /** Tab / segmented pill indicator */
  tab: { stiffness: 420, damping: 28, precision: 0.002 } satisfies SpringConfig,
  /** Progress ring / bar smooth spring */
  progress: { stiffness: 220, damping: 24, precision: 0.05 } satisfies SpringConfig,
  /** Toast entrance & settle */
  toast: { stiffness: 440, damping: 26, precision: 0.005 } satisfies SpringConfig,
} as const;

export class Spring {
  x: number;
  v: number;
  to: number;
  stiffness: number;
  damping: number;
  precision: number;

  constructor(initial: number, config: SpringConfig = SAKUGA_SPRINGS.button) {
    this.x = initial;
    this.v = 0;
    this.to = initial;
    this.stiffness = config.stiffness;
    this.damping = config.damping;
    this.precision = config.precision ?? 0.002;
  }

  /** Semi-implicit Euler integration with clamped dt for frame-rate stability. */
  step(dt: number): number {
    const safeDt = Math.min(dt, 0.032);
    const force = -this.stiffness * (this.x - this.to) - this.damping * this.v;
    this.v += force * safeDt;
    this.x += this.v * safeDt;
    if (this.isSettled()) {
      this.x = this.to;
      this.v = 0;
    }
    return this.x;
  }

  isSettled(): boolean {
    return Math.abs(this.x - this.to) < this.precision && Math.abs(this.v) < this.precision * 10;
  }
}

/**
 * Computes volume-preserving 2D scale from a vertical scale factor `sy`.
 * When `sy < 1` (squashed), `sx > 1` (wider). When `sy > 1` (stretched), `sx < 1` (thinner).
 */
export function volumeSquash(sy: number): { sx: number; sy: number } {
  const clamped = Math.max(0.65, Math.min(1.35, sy));
  const sx = 1 / Math.sqrt(clamped);
  return { sx, sy: clamped };
}

/** Reads `prefers-reduced-motion: reduce` reactively and safely during SSR. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return reduced;
}
