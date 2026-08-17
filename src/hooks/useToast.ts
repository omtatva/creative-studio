"use client";

import { useToastStore } from "@/store/useToastStore";

/**
 * The hook every settings (and future) form calls to report a save
 * result — `toast.success("Saved")` / `toast.error("Couldn't save")`.
 * Renders via <ToastContainer /> mounted once in the root layout.
 */
export function useToast() {
  const push = useToastStore((s) => s.push);
  return {
    success: (message: string) => push("success", message),
    error: (message: string) => push("error", message),
    info: (message: string) => push("info", message),
  };
}
