"use client";

import { useCallback, useSyncExternalStore } from "react";
import { readPreference, subscribeTheme, writePreference } from "@/theme/theme";
import type { ThemePreference } from "@/types";

export function useThemePreference(): [ThemePreference, (next: ThemePreference) => void] {
  const preference = useSyncExternalStore<ThemePreference>(subscribeTheme, readPreference, () => "system");
  const setPreference = useCallback((next: ThemePreference) => writePreference(next), []);
  return [preference, setPreference];
}
