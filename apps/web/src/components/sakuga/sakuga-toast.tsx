"use client";

import { useEffect, useRef } from "react";
import { CheckCircle2, Info, AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { SAKUGA_SPRINGS, Spring } from "./motion-config";

export type SakugaToastTone = "default" | "success" | "danger";

export type SakugaToastItem = {
  id: string;
  message: string;
  tone: SakugaToastTone;
};

function ToastCard({
  item,
  reducedMotion,
  onDismiss,
}: {
  item: SakugaToastItem;
  reducedMotion: boolean;
  onDismiss: (id: string) => void;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = cardRef.current;
    if (!el || reducedMotion) return;

    const springY = new Spring(18, SAKUGA_SPRINGS.toast);
    springY.to = 0;
    let raf = 0;
    let last = performance.now();

    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const y = springY.step(dt);
      el.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`;
      if (!springY.isSettled()) {
        raf = requestAnimationFrame(step);
      } else {
        el.style.transform = "";
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [reducedMotion]);

  const Icon = item.tone === "success" ? CheckCircle2 : item.tone === "danger" ? AlertCircle : Info;

  return (
    <div
      ref={cardRef}
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-auto flex items-center gap-2.5 rounded-ui border-2 border-line-strong bg-surface px-3.5 py-2.5 text-sm text-ink sk-ink-shadow",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded-full",
          item.tone === "success"
            ? "bg-sk-success-soft text-sk-success"
            : item.tone === "danger"
              ? "bg-sk-danger-soft text-sk-danger"
              : "bg-sk-violet-soft text-sk-violet",
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1 text-xs font-medium leading-snug sm:text-sm">{item.message}</span>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label="Dismiss notification"
        className="grid size-7 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink"
      >
        <X aria-hidden className="size-3.5" />
      </button>
    </div>
  );
}

export function SakugaToastViewport({
  toasts,
  reducedMotion,
  onDismiss,
}: {
  toasts: readonly SakugaToastItem[];
  reducedMotion: boolean;
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-label="Notifications"
      className="pointer-events-none fixed inset-x-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-sm flex-col gap-2 lg:right-6 lg:bottom-6 lg:left-auto lg:mx-0"
    >
      {toasts.map((item) => (
        <ToastCard key={item.id} item={item} reducedMotion={reducedMotion} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
