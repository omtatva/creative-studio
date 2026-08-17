"use client";

import { useEffect, useState } from "react";

/**
 * Generic debounce hook. Used by SearchBar and the workspace-slug
 * availability check so we don't fire a Firestore query on every
 * keystroke.
 */
export function useDebounce<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
