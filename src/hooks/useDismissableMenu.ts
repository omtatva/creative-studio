"use client";

import { useEffect, useRef } from "react";

/**
 * Shared open/close-on-outside-click + close-on-Escape wiring for
 * popover-style menus (dropdowns, context menus, pickers). Every
 * such menu in the app previously hand-rolled its own outside-click
 * listener with no Escape support — this is the single version they
 * all use now, so Escape works consistently everywhere at once.
 */
export function useDismissableMenu<T extends HTMLElement>(isOpen: boolean, onClose: () => void) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  return ref;
}
