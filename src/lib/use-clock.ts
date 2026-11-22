"use client";

import { useMemo, useSyncExternalStore } from "react";
import { toISODate } from "@/lib/dates";
import type { ISODate } from "@/types";

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(cb: () => void) {
  listeners.add(cb);
  timer ??= setInterval(() => listeners.forEach((l) => l()), 30_000);
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/** Minute-resolution string snapshot keeps useSyncExternalStore stable between ticks. */
function snapshot(): string {
  const d = new Date();
  return `${toISODate(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export type Clock = { date: ISODate; hour: number; minute: number };

/** Returns null on the server and during hydration, then the live local time. */
export function useClock(): Clock | null {
  const key = useSyncExternalStore(subscribe, snapshot, () => null);
  return useMemo(() => {
    if (!key) return null;
    const [date = "", time = "00:00"] = key.split("T");
    const [h = "0", m = "0"] = time.split(":");
    return { date, hour: Number(h), minute: Number(m) };
  }, [key]);
}
