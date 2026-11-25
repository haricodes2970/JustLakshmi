"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, forwardRef } from "react";

export type SakugaEffectKind = "burst" | "ticks" | "shards" | "puff" | "ring" | "kira" | "sfx";

export type SakugaEffectOptions = {
  scale?: number;
  word?: "ドン!" | "カチッ" | "ポン" | "シュッ";
  accent?: "pink" | "violet" | "success";
};

export type EffectsLayerHandle = {
  emit: (kind: SakugaEffectKind, x: number, y: number, opts?: SakugaEffectOptions) => void;
};

type Palette = {
  ink: string;
  paper: string;
  lavender: string;
  violet: string;
  pink: string;
  success: string;
};

type Particle = {
  kind: SakugaEffectKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  angle: number;
  spin: number;
  points: number;
  accent: "pink" | "violet" | "success";
  word?: string;
};

function readPalette(): Palette {
  if (typeof window === "undefined") {
    return {
      ink: "#24212d",
      paper: "#faf9f6",
      lavender: "#dad1ff",
      violet: "#7462d8",
      pink: "#f2a5c4",
      success: "#2a7f62",
    };
  }
  const styles = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return {
    ink: get("--ink", "#24212d"),
    paper: get("--surface", "#ffffff"),
    lavender: get("--sk-lavender", "#dad1ff"),
    violet: get("--sk-violet", "#7462d8"),
    pink: get("--sk-pink", "#f2a5c4"),
    success: get("--sk-success", "#2a7f62"),
  };
}

/**
 * On-demand 2D canvas overlay for Sakuga VFX particles.
 *
 * Key architecture guarantees:
 * - Sits at z-25 (below fixed navigation z-30 and modals z-40/z-50) with pointer-events-none.
 * - Strictly idle (no requestAnimationFrame loop) when no particles are active.
 * - Follows Sakuga VFX drawing rules: flat two-tone fills + crisp ink outline, zero gradients,
 *   zero blur, and particles exit by shrinking/thinning rather than fading opacity.
 */
export const EffectsLayer = forwardRef<EffectsLayerHandle, { reducedMotion: boolean }>(function EffectsLayer(
  { reducedMotion },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const startLoop = useCallback(() => {
    if (rafRef.current !== null) return;
    lastTimeRef.current = performance.now();

    const tick = (now: number) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        stopLoop();
        return;
      }

      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.04);
      lastTimeRef.current = now;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        stopLoop();
        return;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      const palette = readPalette();
      const next: Particle[] = [];

      for (const p of particlesRef.current) {
        p.age += dt;
        if (p.age >= p.life) continue;

        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.kind === "shards") {
          p.vy += 340 * dt;
        } else if (p.kind === "puff") {
          p.vx *= 0.92;
          p.vy *= 0.92;
        }
        p.angle += p.spin * dt;

        const t = p.age / p.life;
        // Shrink-out curve: fast pop-in, then shrink cleanly to 0 (no alpha fade)
        const scale = t < 0.18 ? t / 0.18 : Math.max(0, 1 - (t - 0.18) / 0.82);
        if (scale <= 0.02) {
          next.push(p);
          continue;
        }

        const accentColor =
          p.accent === "violet" ? palette.violet : p.accent === "success" ? palette.success : palette.pink;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.lineJoin = "round";
        ctx.lineCap = "round";

        if (p.kind === "burst") {
          // 8-point flat two-tone anime impact star
          const outer = p.size * (0.45 + 0.65 * Math.sin(Math.min(1, t * 2.2) * Math.PI * 0.5)) * scale;
          const inner = outer * 0.44;
          const drawStar = (ox: number, oy: number, fill: string, stroke: boolean) => {
            ctx.beginPath();
            for (let i = 0; i < p.points * 2; i++) {
              const r = i % 2 === 0 ? outer : inner;
              const a = (i * Math.PI) / p.points;
              const px = ox + Math.cos(a) * r;
              const py = oy + Math.sin(a) * r;
              if (i === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fillStyle = fill;
            ctx.fill();
            if (stroke) {
              ctx.lineWidth = Math.max(1.2, 2 * scale);
              ctx.strokeStyle = palette.ink;
              ctx.stroke();
            }
          };
          drawStar(2 * scale, 2 * scale, palette.lavender, false);
          drawStar(0, 0, palette.paper, true);
        } else if (p.kind === "ticks") {
          // Sharp accent wedge shooting outward and thinning
          const len = p.size * scale;
          const halfW = Math.max(1, 3.2 * scale);
          ctx.beginPath();
          ctx.moveTo(len, 0);
          ctx.lineTo(-len * 0.35, -halfW);
          ctx.lineTo(-len * 0.15, 0);
          ctx.lineTo(-len * 0.35, halfW);
          ctx.closePath();
          ctx.fillStyle = accentColor;
          ctx.fill();
          ctx.lineWidth = Math.max(1, 1.5 * scale);
          ctx.strokeStyle = palette.ink;
          ctx.stroke();
        } else if (p.kind === "shards") {
          // Crisp two-tone crystal diamond chip
          const s = p.size * scale;
          ctx.beginPath();
          ctx.moveTo(0, -s);
          ctx.lineTo(s * 0.65, 0);
          ctx.lineTo(0, s);
          ctx.lineTo(-s * 0.65, 0);
          ctx.closePath();
          ctx.fillStyle = palette.lavender;
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(0, -s);
          ctx.lineTo(s * 0.65, 0);
          ctx.lineTo(0, s);
          ctx.closePath();
          ctx.fillStyle = accentColor;
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(0, -s);
          ctx.lineTo(s * 0.65, 0);
          ctx.lineTo(0, s);
          ctx.lineTo(-s * 0.65, 0);
          ctx.closePath();
          ctx.lineWidth = Math.max(1, 1.4 * scale);
          ctx.strokeStyle = palette.ink;
          ctx.stroke();
        } else if (p.kind === "puff") {
          // Flat two-tone smoke puff shrinking away
          const r = p.size * scale;
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fillStyle = palette.paper;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(r * 0.18, r * 0.18, r * 0.72, 0, Math.PI * 2);
          ctx.fillStyle = palette.lavender;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.lineWidth = Math.max(1, 1.6 * scale);
          ctx.strokeStyle = palette.ink;
          ctx.stroke();
        } else if (p.kind === "ring") {
          // Expanding ring that thins to 0
          const radius = p.size * (0.35 + t * 0.9);
          const strokeW = Math.max(0.8, 3.2 * (1 - t));
          ctx.beginPath();
          ctx.arc(0, 0, radius, 0, Math.PI * 2);
          ctx.lineWidth = strokeW;
          ctx.strokeStyle = accentColor;
          ctx.stroke();
        } else if (p.kind === "kira") {
          // 4-point anime sparkle glint
          const r = p.size * scale;
          const inner = r * 0.24;
          ctx.beginPath();
          for (let i = 0; i < 8; i++) {
            const rad = i % 2 === 0 ? r : inner;
            const a = (i * Math.PI) / 4;
            const px = Math.cos(a) * rad;
            const py = Math.sin(a) * rad;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fillStyle = accentColor;
          ctx.fill();
          ctx.lineWidth = Math.max(1, 1.4 * scale);
          ctx.strokeStyle = palette.ink;
          ctx.stroke();
        } else if (p.kind === "sfx" && p.word) {
          // Restrained flat manga lettering with crisp ink outline
          const fontSize = Math.max(8, Math.round(p.size * scale));
          ctx.font = `900 ${fontSize}px system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.lineWidth = Math.max(2, 3.5 * scale);
          ctx.strokeStyle = palette.ink;
          ctx.strokeText(p.word, 0, 0);
          ctx.fillStyle = palette.paper;
          ctx.fillText(p.word, 0, 0);
        }

        ctx.restore();
        next.push(p);
      }

      ctx.restore();
      particlesRef.current = next;

      if (next.length > 0 && !document.hidden) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        stopLoop();
        if (next.length === 0) clearCanvas();
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [clearCanvas, stopLoop]);

  useImperativeHandle(
    ref,
    () => ({
      emit(kind, x, y, opts = {}) {
        if (reducedMotion || typeof window === "undefined" || document.hidden) return;
        const scale = opts.scale ?? 1;
        const accent = opts.accent ?? "pink";
        const list = particlesRef.current;

        // Cap active particles for mobile battery & frame-rate safety
        if (list.length > 48) list.splice(0, list.length - 36);

        if (kind === "burst") {
          list.push({
            kind: "burst",
            x,
            y,
            vx: 0,
            vy: 0,
            age: 0,
            life: 0.34,
            size: 18 * scale,
            angle: (Math.random() - 0.5) * 0.5,
            spin: 0.6,
            points: 8,
            accent,
          });
          list.push({
            kind: "ring",
            x,
            y,
            vx: 0,
            vy: 0,
            age: 0,
            life: 0.32,
            size: 26 * scale,
            angle: 0,
            spin: 0,
            points: 0,
            accent: "violet",
          });
        } else if (kind === "ticks") {
          const count = 4;
          const base = Math.random() * Math.PI * 2;
          for (let i = 0; i < count; i++) {
            const a = base + (i * Math.PI * 2) / count + (Math.random() - 0.5) * 0.35;
            const speed = (68 + Math.random() * 34) * scale;
            list.push({
              kind: "ticks",
              x: x + Math.cos(a) * 6,
              y: y + Math.sin(a) * 6,
              vx: Math.cos(a) * speed,
              vy: Math.sin(a) * speed,
              age: 0,
              life: 0.28,
              size: 9 * scale,
              angle: a,
              spin: 0,
              points: 0,
              accent,
            });
          }
        } else if (kind === "shards") {
          const count = 5;
          for (let i = 0; i < count; i++) {
            const a = -Math.PI * 0.85 + Math.random() * Math.PI * 0.7;
            const speed = (90 + Math.random() * 60) * scale;
            list.push({
              kind: "shards",
              x,
              y,
              vx: Math.cos(a) * speed,
              vy: Math.sin(a) * speed - 30,
              age: 0,
              life: 0.44,
              size: 6.5 * scale,
              angle: Math.random() * Math.PI,
              spin: (Math.random() - 0.5) * 8,
              points: 4,
              accent,
            });
          }
        } else if (kind === "puff") {
          const count = 3;
          for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const speed = (28 + Math.random() * 24) * scale;
            list.push({
              kind: "puff",
              x: x + Math.cos(a) * 4,
              y: y + Math.sin(a) * 4,
              vx: Math.cos(a) * speed,
              vy: Math.sin(a) * speed - 8,
              age: 0,
              life: 0.32,
              size: (6 + Math.random() * 3) * scale,
              angle: 0,
              spin: 0,
              points: 0,
              accent,
            });
          }
        } else if (kind === "ring") {
          list.push({
            kind: "ring",
            x,
            y,
            vx: 0,
            vy: 0,
            age: 0,
            life: 0.3,
            size: 20 * scale,
            angle: 0,
            spin: 0,
            points: 0,
            accent,
          });
        } else if (kind === "kira") {
          list.push({
            kind: "kira",
            x,
            y,
            vx: 0,
            vy: -14 * scale,
            age: 0,
            life: 0.34,
            size: 11 * scale,
            angle: 0,
            spin: 2.2,
            points: 4,
            accent,
          });
        } else if (kind === "sfx" && opts.word) {
          list.push({
            kind: "sfx",
            x,
            y: y - 18,
            vx: 0,
            vy: -24,
            age: 0,
            life: 0.52,
            size: 15 * scale,
            angle: -0.09,
            spin: 0,
            points: 0,
            accent,
            word: opts.word,
          });
        }

        startLoop();
      },
    }),
    [reducedMotion, startLoop],
  );

  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        particlesRef.current = [];
        stopLoop();
        clearCanvas();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      stopLoop();
    };
  }, [clearCanvas, stopLoop]);

  if (reducedMotion) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-25 h-dvh w-screen overflow-hidden"
    />
  );
});
