"use client";

import { useThemeContext } from "@/contexts/ThemeContext";

/**
 * Thin re-export so components import `useTheme` from `hooks/`
 * consistently with `useAuth`/`useWorkspace`, without caring that
 * the underlying state lives in ThemeContext.
 */
export function useTheme() {
  return useThemeContext();
}
