"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Portal-rendered modal with a Framer Motion fade/scale transition.
 * Driven by `useUIStore().activeModal` for app-wide singleton
 * modals, but also usable standalone with local `useState`.
 *
 * Handles Escape-to-close, focuses the panel on open, restores focus
 * to the trigger on close, and traps Tab within the panel — all in
 * one place since every modal in the app (20+ call sites) renders
 * through this component.
 */
export function Modal({ isOpen, onClose, title, children, className }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  // Every caller passes onClose as an inline arrow function, so it's a
  // new reference on EVERY render of the parent — including a render
  // triggered by typing a single character into a controlled input
  // inside this modal. Depending on `onClose` directly below used to
  // re-run this whole effect (steal-focus-onto-first-focusable-element
  // included) on every keystroke, forcing the input to lose focus after
  // every single character. A ref sidesteps that: handleKeyDown always
  // calls whatever onClose currently is, with no effect re-run needed
  // just because the closure identity changed.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const firstFocusable = panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (firstFocusable ?? panel)?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;

      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused.current?.focus();
    };
    // Deliberately NOT depending on onClose — see onCloseRef above. This
    // effect should only ever re-run when the modal actually opens/closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            className={cn(
              "w-full max-w-md rounded-theme border border-border bg-surface p-6 shadow-soft-lg outline-none",
              className
            )}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              {title && <h2 className="text-lg font-semibold text-foreground">{title}</h2>}
              <button
                onClick={onClose}
                className="ml-auto rounded-theme p-1 text-foreground-muted hover:bg-surface-muted"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
