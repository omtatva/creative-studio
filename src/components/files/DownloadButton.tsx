"use client";

import { useState, type ReactNode } from "react";
import { useToast } from "@/hooks/useToast";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { downloadFile, type DownloadTarget } from "@/services/downloadService";

interface DownloadButtonProps {
  target: DownloadTarget;
  className?: string;
  ariaLabel?: string;
  title?: string;
  children: ReactNode;
  /** Fired once the download has been authorized and started (e.g. activity logging). */
  onDownloaded?: () => void;
}

/**
 * Every Download control in the app renders this, so they all go through
 * the same authorized route (see downloadService.ts). Hidden when the
 * Feature Access matrix turns `files.download` off for the user's role —
 * the server enforces the same rule, so hiding is only a convenience.
 */
export function DownloadButton({ target, className, ariaLabel, title, children, onDownloaded }: DownloadButtonProps) {
  const toast = useToast();
  const { can } = useFeatureAccess();
  const [isBusy, setIsBusy] = useState(false);

  if (!can("files.download")) return null;

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    setIsBusy(true);
    try {
      await downloadFile(target);
      onDownloaded?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't download this file.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <button type="button" onClick={handleClick} disabled={isBusy} className={className} aria-label={ariaLabel} title={title}>
      {children}
    </button>
  );
}
