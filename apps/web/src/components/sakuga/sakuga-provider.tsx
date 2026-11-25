"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { EffectsLayer, type EffectsLayerHandle, type SakugaEffectKind, type SakugaEffectOptions } from "./effects-layer";
import { useReducedMotion } from "./motion-config";
import { SakugaToastViewport, type SakugaToastItem, type SakugaToastTone } from "./sakuga-toast";

type Anchor = HTMLElement | { x: number; y: number } | null | undefined;

type SakugaContextValue = {
  reducedMotion: boolean;
  fireEffect: (kind: SakugaEffectKind, anchor?: Anchor, opts?: SakugaEffectOptions) => void;
  toast: (message: string, tone?: SakugaToastTone) => void;
};

const NOOP_CONTEXT: SakugaContextValue = {
  reducedMotion: false,
  fireEffect: () => {},
  toast: () => {},
};

const SakugaContext = createContext<SakugaContextValue>(NOOP_CONTEXT);

export function useSakuga(): SakugaContextValue {
  return useContext(SakugaContext);
}

export function SakugaProvider({ children }: { children: React.ReactNode }) {
  const reducedMotion = useReducedMotion();
  const effectsRef = useRef<EffectsLayerHandle | null>(null);
  const [toasts, setToasts] = useState<SakugaToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: SakugaToastTone = "default") => {
      const id = `sk_toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-2), { id, message, tone }]);
      const timer = setTimeout(() => {
        timersRef.current.delete(id);
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3200);
      timersRef.current.set(id, timer);
    },
    [],
  );

  const fireEffect = useCallback(
    (kind: SakugaEffectKind, anchor?: Anchor, opts?: SakugaEffectOptions) => {
      if (reducedMotion || !anchor) return;
      let x = 0;
      let y = 0;
      if (typeof HTMLElement !== "undefined" && anchor instanceof HTMLElement) {
        const rect = anchor.getBoundingClientRect();
        x = rect.left + rect.width / 2;
        y = rect.top + rect.height / 2;
      } else if ("x" in anchor && "y" in anchor) {
        x = anchor.x;
        y = anchor.y;
      } else {
        return;
      }
      effectsRef.current?.emit(kind, x, y, opts);
    },
    [reducedMotion],
  );

  const value = useMemo<SakugaContextValue>(
    () => ({ reducedMotion, fireEffect, toast }),
    [reducedMotion, fireEffect, toast],
  );

  return (
    <SakugaContext.Provider value={value}>
      {children}
      <EffectsLayer ref={effectsRef} reducedMotion={reducedMotion} />
      <SakugaToastViewport toasts={toasts} reducedMotion={reducedMotion} onDismiss={dismissToast} />
    </SakugaContext.Provider>
  );
}
