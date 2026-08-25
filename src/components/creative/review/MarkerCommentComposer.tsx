"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Send, X } from "lucide-react";
import { formatDuration } from "@/lib/utils/fileFormat";
import type { PendingMarker } from "./ReviewPanel";

interface MarkerCommentComposerProps {
  marker: PendingMarker;
  onSubmit: (body: string) => Promise<boolean>;
  onCancel: () => void;
}

/**
 * Floating comment composer that appears directly over the media
 * canvas right after placing a marker or drawing a shape — the
 * in-context equivalent of the side panel's pending-marker composer
 * (ReviewPanel.tsx), for the common case where the reviewer wants to
 * type their note immediately without a context switch to the right
 * panel. Submitting goes through the exact same onAddComment path the
 * panel's composer already uses (see ReviewWorkspace.handleAddComment)
 * — this is a second ENTRY POINT into identical logic, not a parallel
 * comment system. The side panel keeps its own composer too (useful
 * once you're already browsing comments there), so nothing there
 * changes.
 */
export function MarkerCommentComposer({ marker, onSubmit, onCancel }: MarkerCommentComposerProps) {
  const [body, setBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSend() {
    if (!body.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const ok = await onSubmit(body.trim());
      if (ok) setBody("");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Anchored at the actual spot marked (clamped off the edges so the box
  // itself never clips out of the frame) instead of a fixed top-center —
  // flips above/below the point depending which half of the frame it's in,
  // same idea as a tooltip, so it never renders upside-down off-screen.
  const clampedX = Math.min(88, Math.max(12, marker.positionX ?? 50));
  const y = marker.positionY ?? 50;
  const opensBelow = y < 40;

  return (
    <motion.div
      initial={{ opacity: 0, y: opensBelow ? -8 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: opensBelow ? -8 : 8 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        left: `${clampedX}%`,
        [opensBelow ? "top" : "bottom"]: `calc(${opensBelow ? y : 100 - y}% + 14px)`,
      }}
      className="pointer-events-auto absolute z-30 w-[min(420px,calc(100%-1.5rem))] -translate-x-1/2 rounded-theme border border-border bg-surface p-2 shadow-soft-lg"
    >
      <div className="flex items-center gap-2">
        {marker.timestampSeconds !== null && (
          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
            {formatDuration(marker.timestampSeconds)}
          </span>
        )}
        <input
          ref={inputRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
            if (e.key === "Escape") onCancel();
          }}
          placeholder="Write a comment..."
          className="h-8 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-foreground-muted"
        />
        <button
          onClick={onCancel}
          aria-label="Cancel"
          className="shrink-0 rounded-theme p-1.5 text-foreground-muted hover:bg-surface-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleSend}
          disabled={!body.trim() || isSubmitting}
          aria-label="Send comment"
          className="flex shrink-0 items-center gap-1 rounded-theme bg-primary px-2.5 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <Send className="h-3 w-3" />
          Send
        </button>
      </div>
    </motion.div>
  );
}
