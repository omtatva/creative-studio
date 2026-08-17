"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";
import { useToastStore, type ToastVariant } from "@/store/useToastStore";
import { cn } from "@/lib/utils/cn";

const VARIANT_CONFIG: Record<ToastVariant, { icon: typeof CheckCircle2; classes: string }> = {
  success: { icon: CheckCircle2, classes: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  error: { icon: XCircle, classes: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400" },
  info: { icon: Info, classes: "border-primary/30 bg-primary/10 text-primary" },
};

/** Mounted once in the root layout (see app/layout.tsx) — every useToast() call anywhere in the app renders here. */
export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[200] flex flex-col gap-2">
      <AnimatePresence>
        {toasts.map((toast) => {
          const { icon: Icon, classes } = VARIANT_CONFIG[toast.variant];
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className={cn(
                "pointer-events-auto flex items-center gap-2.5 rounded-theme border px-4 py-3 shadow-soft-lg backdrop-blur-glass",
                "bg-surface min-w-[260px] max-w-sm",
                classes
              )}
            >
              <Icon className="h-4.5 w-4.5 shrink-0" />
              <p className="flex-1 text-sm font-medium text-foreground">{toast.message}</p>
              <button onClick={() => dismiss(toast.id)} className="shrink-0 text-foreground-muted hover:text-foreground" aria-label="Dismiss">
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
