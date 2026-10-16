"use client";

import { useEffect, useMemo, useState } from "react";
import { CompareView, type CompareMode, type CompareSide } from "@/components/review/compare/CompareView";
import { useFileComments } from "@/hooks/useFileComments";
import { useFileAnnotations } from "@/hooks/useFileAnnotations";
import { useToast } from "@/hooks/useToast";
import { addAssetComment } from "@/services/fileCommentService";
import { createInternalCompare, previewUrl, type ComparePreviewSide } from "@/services/compareService";
import type { ProjectFile } from "@/types/file.types";
import type { TaskActor } from "@/types/task.types";

interface InternalCompareProps {
  /** Every version of THIS asset (the review workspace's AssetGroup) — the only versions offered. The server re-validates the pair regardless. */
  versions: ProjectFile[];
  pair: [number, number];
  onPairChange: (pair: [number, number]) => void;
  mode: CompareMode;
  onModeChange: (mode: CompareMode) => void;
  actor: TaskActor;
  onExit: () => void;
}

/**
 * Internal (signed-in) comparison. Authorization is the server's: POST /api/files/compare
 * checks project access and that both versions are the SAME asset in the SAME project
 * before issuing preview tickets, and /api/files/preview re-checks access on every media
 * request. Comments and annotations stay per version (each version is its own `files`
 * document with its own subcollections) — never merged.
 */
export function InternalCompare({ versions, pair, onPairChange, mode, onModeChange, actor, onExit }: InternalCompareProps) {
  const toast = useToast();
  const byVersion = useMemo(() => new Map(versions.map((v) => [v.versionNumber ?? 1, v])), [versions]);
  const fileA = byVersion.get(pair[0]);
  const fileB = byVersion.get(pair[1]);

  const { comments: commentsA } = useFileComments(fileA?.id);
  const { comments: commentsB } = useFileComments(fileB?.id);
  const { annotations: annotationsA } = useFileAnnotations(fileA?.id);
  const { annotations: annotationsB } = useFileAnnotations(fileB?.id);

  const [tickets, setTickets] = useState<{ a: ComparePreviewSide; b: ComparePreviewSide } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Only the two SELECTED versions' media is ever requested (no preloading of the history).
  useEffect(() => {
    if (!fileA || !fileB) return;
    let cancelled = false;
    setTickets(null);
    setError(null);
    createInternalCompare(fileA.workspaceId, fileA.id, fileB.id)
      .then((t) => !cancelled && setTickets(t))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Couldn't open the comparison."));
    return () => {
      cancelled = true;
    };
  }, [fileA, fileB]);

  if (!fileA || !fileB) return null;

  const mk = (f: ProjectFile, t: ComparePreviewSide | undefined, comments: CompareSide["comments"], annotations: CompareSide["annotations"]): CompareSide => ({
    versionNumber: f.versionNumber ?? 1,
    mediaUrl: t ? previewUrl(t.ticket) : null,
    assetType: f.assetType,
    contentType: f.contentType,
    durationSeconds: f.durationSeconds ?? null,
    comments,
    annotations,
  });
  const sides: [CompareSide, CompareSide] = [mk(fileA, tickets?.a, commentsA, annotationsA), mk(fileB, tickets?.b, commentsB, annotationsB)];

  async function submit({ versionNumber, body, timestampSeconds }: { versionNumber: number; body: string; timestampSeconds: number | null }) {
    const target = byVersion.get(versionNumber);
    if (!target) return false;
    try {
      await addAssetComment({ workspaceId: target.workspaceId, projectId: target.projectId, fileId: target.id, version: versionNumber, author: actor, body, parentCommentId: null, timestampSeconds });
      return true;
    } catch (err) {
      console.error("[InternalCompare] comment failed:", err);
      toast.error("Couldn't post the comment. You may not have permission to comment on this project.");
      return false;
    }
  }

  const allVersions = [...byVersion.keys()].sort((x, y) => y - x);
  const targets = [pair[0], pair[1]];
  return (
    <CompareView
      sides={sides}
      versions={allVersions}
      onChangeVersion={(side, v) => onPairChange(side === 0 ? [v, pair[1]] : [pair[0], v])}
      onExit={onExit}
      isLoading={!tickets && !error}
      error={error}
      headerNote="Approvals and reviews still apply to the version they were requested on — comparing doesn't change that."
      commentTargets={targets}
      canComment
      onSubmitComment={submit}
      mode={mode}
      onModeChange={onModeChange}
    />
  );
}
