"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Download, GitCompare, Lock, MessageSquare, Send, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Loader } from "@/components/ui/Loader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { FileTypeIcon } from "@/components/files/FileTypeIcon";
import { VideoReviewCanvas } from "@/components/creative/review/VideoReviewCanvas";
import { ImageReviewCanvas } from "@/components/creative/review/ImageReviewCanvas";
import { PdfReviewCanvas } from "@/components/creative/review/PdfReviewCanvas";
import { AnnotationToolbar, type AnnotationTool } from "@/components/creative/review/AnnotationToolbar";
import { annotationAnchorPosition } from "@/components/creative/review/ReviewWorkspace";
import type { PendingMarker } from "@/components/creative/review/ReviewPanel";
import { reviewApi } from "@/services/reviewShareService";
import { CompareView, type CompareMode, type CompareSide } from "@/components/review/compare/CompareView";
import { defaultComparePair } from "@/lib/utils/compareSync";
import { formatDuration } from "@/lib/utils/fileFormat";
import { timeAgo } from "@/lib/utils/date";
import { getMarkerColor } from "@/lib/utils/markerColor";
import { cn } from "@/lib/utils/cn";
import type { AnnotationData, AssetAnnotation, AssetComment, ProjectFile } from "@/types/file.types";
import type { ExternalComment, ReviewSharePermissions } from "@/types/reviewShare.types";

type Gate = "loading" | "ready" | "password" | "email" | "unavailable" | "expired" | "revoked" | "error";

interface ExternalAnnotation {
  id: string;
  type: AssetAnnotation["type"];
  data: AnnotationData;
  color: string;
  timestampSeconds: number | null;
  pageNumber: number | null;
}

interface ReviewData {
  workspaceName: string;
  projectName: string;
  title: string | null;
  message: string | null;
  expiresAt: string | null;
  permissions: ReviewSharePermissions;
  sharedVersion: number;
  viewingVersion: number;
  versions: { versionNumber: number }[];
  asset: { fileName: string; assetType: ProjectFile["assetType"]; contentType: string; durationSeconds: number | null };
  comments: ExternalComment[];
  annotations: ExternalAnnotation[];
  identity: { displayName: string | null; email: string | null };
  decision: { decision: "approved" | "changes_requested"; decidedAt: string | null; byMe: boolean } | null;
  /** This link's review round: progress and the reviewer's own state (never other reviewers' identities). */
  round: {
    roundNumber: number;
    version: number;
    status: "draft" | "waiting" | "in_review" | "changes_requested" | "approved";
    superseded: boolean;
    open: boolean;
    requiredTotal: number;
    requiredApproved: number;
    me: { required: boolean; decision: "approved" | "changes_requested" | null; decidedAt: string | null } | null;
  };
}

const ANNOTATION_COLOR = "#f59e0b";

function Shell({ children, workspaceName }: { children: React.ReactNode; workspaceName?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      {workspaceName && <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">{workspaceName}</p>}
      {children}
    </div>
  );
}

/** The whole external-reviewer experience: gates (password / emailed code) → review page. Contains no internal navigation. */
export function ExternalReviewView({ token }: { token: string }) {
  const [gate, setGate] = useState<Gate>("loading");
  const [gateWorkspace, setGateWorkspace] = useState("");
  const [data, setData] = useState<ReviewData | null>(null);
  const [version, setVersion] = useState<number | undefined>(undefined);

  const loadData = useCallback(
    async (v?: number) => {
      const res = await reviewApi<ReviewData>("data", { token, version: v });
      if (res.status === 401) {
        setGate("loading");
        return false;
      }
      if (!res.ok) {
        if (res.data.code === "expired" || res.data.code === "revoked" || res.data.code === "unavailable") setGate(res.data.code);
        return false;
      }
      setData(res.data as ReviewData);
      return true;
    },
    [token]
  );

  const open = useCallback(async () => {
    const res = await reviewApi<{ state: Gate; workspaceName: string }>("status", { token });
    if (!res.ok) {
      setGate(res.data.code === "expired" || res.data.code === "revoked" ? res.data.code : res.status === 429 ? "error" : "unavailable");
      return;
    }
    setGateWorkspace(res.data.workspaceName);
    if (res.data.state === "ready") {
      const ok = await loadData(undefined);
      setGate(ok ? "ready" : "error");
    } else setGate(res.data.state);
  }, [token, loadData]);

  useEffect(() => {
    void open();
  }, [open]);

  // Light polling so new comments from the team appear without a refresh (paused while the tab is hidden).
  useEffect(() => {
    if (gate !== "ready") return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void loadData(version);
    }, 20000);
    return () => clearInterval(id);
  }, [gate, loadData, version]);

  if (gate === "loading") return <Loader fullScreen label="Opening review..." />;
  if (gate === "unavailable") return <Shell><EmptyState icon={<Lock className="h-9 w-9 text-foreground-muted" />} title="This review link isn't available" description="Check that you copied the whole link, or ask the sender for a new one." /></Shell>;
  if (gate === "expired") return <Shell workspaceName={gateWorkspace}><EmptyState icon={<Lock className="h-9 w-9 text-foreground-muted" />} title="This review link has expired" description="Ask the sender for a new link." /></Shell>;
  if (gate === "revoked") return <Shell workspaceName={gateWorkspace}><EmptyState icon={<Lock className="h-9 w-9 text-foreground-muted" />} title="This review link is no longer available" description="The sender turned it off. Ask them for a new link if you still need access." /></Shell>;
  if (gate === "error") return <Shell><EmptyState title="Something went wrong" description="Please refresh the page and try again." /></Shell>;
  if (gate === "password") return <PasswordGate token={token} workspaceName={gateWorkspace} onDone={open} />;
  if (gate === "email") return <EmailGate token={token} workspaceName={gateWorkspace} onDone={open} />;
  if (!data) return <Loader fullScreen label="Loading..." />;

  return (
    <ReviewPage
      token={token}
      data={data}
      version={version}
      onVersion={(v) => {
        setVersion(v);
        void loadData(v);
      }}
      onRefresh={() => loadData(version)}
    />
  );
}

/* ───────────────────────────── gates ───────────────────────────── */

function PasswordGate({ token, workspaceName, onDone }: { token: string; workspaceName: string; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await reviewApi("auth", { token, password });
    setBusy(false);
    if (!res.ok) return setError(res.status === 429 ? "Too many attempts. Please wait a few minutes." : "Couldn't verify access. Check the password and try again.");
    onDone();
  }
  return (
    <Shell workspaceName={workspaceName}>
      <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-3 rounded-theme border border-border bg-cards p-6 text-left shadow-soft">
        <div className="flex items-center gap-2"><Lock className="h-4 w-4 text-primary" /><h1 className="text-base font-semibold text-foreground">This review is password protected</h1></div>
        <Input type="password" autoComplete="off" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus error={error ?? undefined} />
        <Button type="submit" isLoading={busy} disabled={!password}>Continue</Button>
      </form>
    </Shell>
  );
}

function EmailGate({ token, workspaceName, onDone }: { token: string; workspaceName: string; onDone: () => void }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await reviewApi("email-request", { token, email });
    setBusy(false);
    if (!res.ok) return setError(res.status === 429 ? "Too many requests. Please wait a few minutes." : "Enter a valid email address.");
    setStep("code"); // identical whether or not the address is on the list
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await reviewApi("email-verify", { token, email, code });
    setBusy(false);
    if (!res.ok) return setError("That code isn't valid or has expired.");
    onDone();
  }
  return (
    <Shell workspaceName={workspaceName}>
      <div className="flex w-full max-w-sm flex-col gap-3 rounded-theme border border-border bg-cards p-6 text-left shadow-soft">
        <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /><h1 className="text-base font-semibold text-foreground">Verify your email to open this review</h1></div>
        {step === "email" ? (
          <form onSubmit={requestCode} className="flex flex-col gap-3">
            <Input type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus error={error ?? undefined} />
            <Button type="submit" isLoading={busy} disabled={!email}>Email me a code</Button>
          </form>
        ) : (
          <form onSubmit={verify} className="flex flex-col gap-3">
            <p className="text-xs text-foreground-muted">If that address has access, a 6-digit code is on its way. It expires in 10 minutes.</p>
            <Input inputMode="numeric" maxLength={6} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus error={error ?? undefined} />
            <Button type="submit" isLoading={busy} disabled={code.length !== 6}>Verify</Button>
            <button type="button" className="text-xs text-primary hover:underline" onClick={() => { setStep("email"); setCode(""); setError(null); }}>Use a different email</button>
          </form>
        )}
      </div>
    </Shell>
  );
}

/* ───────────────────────────── the review page ───────────────────────────── */

function toAssetComment(c: ExternalComment, version: number): AssetComment {
  return {
    id: c.id, workspaceId: "", projectId: "", fileId: "", version, authorId: c.authorKind === "external" ? "ext:reviewer" : "", author: { uid: "", displayName: c.authorName, photoURL: null, email: "" },
    body: c.body, parentCommentId: c.parentCommentId, isResolved: c.isResolved, resolvedBy: null, resolvedAt: null,
    timestampSeconds: c.timestampSeconds, positionX: c.positionX, positionY: c.positionY, pageNumber: c.pageNumber, markerNumber: c.markerNumber,
    createdAt: c.createdAt, updatedAt: c.createdAt,
  } as AssetComment;
}
function toAssetAnnotation(a: ExternalAnnotation, version: number): AssetAnnotation {
  return {
    id: a.id, workspaceId: "", projectId: "", fileId: "", version, authorId: "", author: { uid: "", displayName: "", photoURL: null, email: "" },
    type: a.type, data: a.data, color: a.color, timestampSeconds: a.timestampSeconds, pageNumber: a.pageNumber, createdAt: "", updatedAt: "",
  } as AssetAnnotation;
}

function ReviewPage({ token, data, version, onVersion, onRefresh }: { token: string; data: ReviewData; version: number | undefined; onVersion: (v: number | undefined) => void; onRefresh: () => Promise<boolean> }) {
  const isSharedVersion = data.viewingVersion === data.sharedVersion;
  const needsName = !data.identity.displayName;
  const canWriteComments = data.permissions.canComment && isSharedVersion;
  // A closed or superseded round takes no decisions: an old Round 1 link can never decide Round 2.
  const canDecide = isSharedVersion && data.round.open && (data.permissions.canApprove || data.permissions.canRequestChanges);
  const roundNote = data.round.superseded
    ? "A newer review round has started, so this one no longer takes decisions. Ask the sender for the new link."
    : !data.round.open
      ? data.round.status === "approved" ? "This round has been approved — decisions are closed." : "Changes were requested on this version — decisions are closed."
      : null;

  const [name, setName] = useState("");
  const [nameSaved, setNameSaved] = useState(!needsName);
  const [activeTool, setActiveTool] = useState<AnnotationTool>("select");
  const [currentTime, setCurrentTime] = useState(0);
  const [seekTo, setSeekTo] = useState<number | null>(null);
  const [seekToPage, setSeekToPage] = useState<number | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [pendingMarker, setPendingMarker] = useState<PendingMarker | null>(null);
  const [draft, setDraft] = useState("");
  const [includeTimestamp, setIncludeTimestamp] = useState(false);
  const [replyTo, setReplyTo] = useState<ExternalComment | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [note, setNote] = useState("");
  const [deciding, setDeciding] = useState<null | "approved" | "changes_requested">(null);
  const [message, setMessage] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // ── Version comparison (only offered when the link allows previous versions; the server re-validates the pair) ──
  interface CompareSideData { versionNumber: number; asset: ReviewData["asset"]; comments: ExternalComment[]; annotations: ExternalAnnotation[] }
  const [comparePair, setComparePair] = useState<[number, number] | null>(null);
  const [compareMode, setCompareMode] = useState<CompareMode>("side");
  const [compareData, setCompareData] = useState<{ a: CompareSideData; b: CompareSideData } | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);
  const canCompare = data.permissions.canViewPreviousVersions && data.versions.length > 1 && (data.asset.assetType === "video" || data.asset.assetType === "image");
  const versionNumbers = data.versions.map((v) => v.versionNumber);

  const loadCompare = useCallback(async (pair: [number, number]) => {
    const res = await reviewApi<{ a: CompareSideData; b: CompareSideData }>("compare", { token, versionA: pair[0], versionB: pair[1] });
    if (!res.ok) {
      setCompareError(res.data.error ?? "Couldn't open the comparison.");
      return;
    }
    setCompareError(null);
    setCompareData({ a: res.data.a, b: res.data.b });
  }, [token]);

  useEffect(() => {
    if (!comparePair) return;
    setCompareData(null);
    void loadCompare(comparePair);
  }, [comparePair, loadCompare]);

  const comments = useMemo(() => data.comments.map((c) => toAssetComment(c, data.viewingVersion)), [data.comments, data.viewingVersion]);
  const annotations = useMemo(() => data.annotations.map((a) => toAssetAnnotation(a, data.viewingVersion)), [data.annotations, data.viewingVersion]);
  const mediaUrl = `/api/review/media?t=${encodeURIComponent(token)}${version ? `&v=${version}` : ""}`;
  const asset = useMemo(
    () => ({ id: "external", workspaceId: "", projectId: "", fileName: data.asset.fileName, originalName: data.asset.fileName, contentType: data.asset.contentType, assetType: data.asset.assetType, sizeBytes: 0, url: mediaUrl, thumbnailUrl: null, storagePath: "", durationSeconds: data.asset.durationSeconds }) as unknown as ProjectFile,
    [data.asset, mediaUrl]
  );

  // The reviewer must give a name before their first comment/decision (never an account).
  async function ensureName(): Promise<boolean> {
    if (nameSaved) return true;
    const trimmed = name.trim();
    if (!trimmed) {
      nameRef.current?.focus();
      setMessage("Enter your name first so the team knows who is reviewing.");
      return false;
    }
    const res = await reviewApi("identity", { token, name: trimmed });
    if (!res.ok) {
      setMessage(res.data.error ?? "Couldn't save your name.");
      return false;
    }
    setNameSaved(true);
    return true;
  }

  async function postComment(body: string, marker: PendingMarker | null): Promise<boolean> {
    if (!(await ensureName())) return false;
    setIsSubmitting(true);
    setMessage(null);
    const res = await reviewApi("comment", {
      token, body: body.trim(), parentCommentId: replyTo?.id ?? null,
      timestampSeconds: marker?.timestampSeconds ?? null, positionX: marker?.positionX ?? null, positionY: marker?.positionY ?? null, pageNumber: marker?.pageNumber ?? null,
    });
    setIsSubmitting(false);
    if (!res.ok) {
      setMessage(res.data.error ?? "Couldn't post your comment.");
      return false;
    }
    setReplyTo(null);
    await onRefresh();
    return true;
  }

  async function handleComposerSubmit() {
    const marker = includeTimestamp && !replyTo ? { timestampSeconds: currentTime, positionX: null, positionY: null, pageNumber: null } : null;
    if (await postComment(draft, marker)) {
      setDraft("");
      setIncludeTimestamp(false);
    }
  }

  async function handleShape(shape: AnnotationData, t: number | null, page: number | null) {
    if (!canWriteComments || !(await ensureName())) return;
    setActiveTool("select");
    const res = await reviewApi("annotation", { token, data: shape, color: ANNOTATION_COLOR, timestampSeconds: t, pageNumber: page });
    if (!res.ok) return setMessage(res.data.error ?? "Couldn't save your drawing.");
    const anchor = annotationAnchorPosition(shape);
    setPendingMarker({ timestampSeconds: t, positionX: anchor.x, positionY: anchor.y, pageNumber: page });
    await onRefresh();
  }

  function handleMarker(x: number, y: number, t: number | null, page: number | null) {
    if (!canWriteComments) return;
    setActiveTool("select");
    setPendingMarker({ timestampSeconds: t, positionX: x, positionY: y, pageNumber: page });
  }

  function select(c: ExternalComment) {
    setHighlighted(c.id);
    if (c.timestampSeconds !== null) setSeekTo(c.timestampSeconds);
    if (c.pageNumber !== null) setSeekToPage(c.pageNumber);
  }

  async function decide(decision: "approved" | "changes_requested") {
    if (!(await ensureName())) return;
    setDeciding(decision);
    setMessage(null);
    const res = await reviewApi("decision", { token, decision, note: note.trim() || null });
    setDeciding(null);
    if (!res.ok) return setMessage(res.data.error ?? "Couldn't record your decision.");
    setNote("");
    await onRefresh();
  }

  async function download() {
    const res = await reviewApi<{ ticket: string; fileName: string }>("download", { token, version });
    if (!res.ok) return setMessage(res.data.error ?? "Download isn't available.");
    const a = document.createElement("a");
    a.href = `/api/files/download?t=${encodeURIComponent(res.data.ticket)}`;
    a.download = res.data.fileName ?? "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const topLevel = data.comments.filter((c) => !c.parentCommentId);
  const repliesOf = (id: string) => data.comments.filter((c) => c.parentCommentId === id);
  const markerLabel = (c: ExternalComment) => (c.timestampSeconds !== null ? formatDuration(c.timestampSeconds) : c.pageNumber !== null ? `Page ${c.pageNumber}` : null);
  const canvasProps = { annotationColor: ANNOTATION_COLOR, highlightedCommentId: highlighted, activeTool: canWriteComments ? activeTool : ("select" as AnnotationTool) };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-surface px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
            {data.workspaceName}{data.projectName ? ` · ${data.projectName}` : ""}
          </p>
          <h1 className="truncate text-sm font-semibold text-foreground">{data.title || data.asset.fileName}</h1>
        </div>
        {data.versions.length > 1 ? (
          <select
            aria-label="Version"
            value={data.viewingVersion}
            onChange={(e) => onVersion(Number(e.target.value) === data.sharedVersion ? undefined : Number(e.target.value))}
            className="h-8 rounded-theme border border-border bg-surface px-2 text-xs text-foreground"
          >
            {data.versions.map((v) => (
              <option key={v.versionNumber} value={v.versionNumber}>v{v.versionNumber}{v.versionNumber === data.sharedVersion ? " (shared)" : ""}</option>
            ))}
          </select>
        ) : (
          <Badge variant="info">v{data.sharedVersion}</Badge>
        )}
        {canCompare && !comparePair && (
          <Button size="sm" variant="outline" onClick={() => setComparePair(defaultComparePair(versionNumbers, data.sharedVersion))} aria-label="Compare versions of this asset">
            <GitCompare className="h-3.5 w-3.5" />
            Compare versions
          </Button>
        )}
        {data.permissions.canDownload && (
          <Button size="sm" variant="outline" onClick={download}>
            <Download className="h-3.5 w-3.5" />
            Download
          </Button>
        )}
      </header>

      {data.message && <p className="border-b border-border bg-primary/5 px-4 py-2 text-xs text-foreground">{data.message}</p>}
      {!isSharedVersion && <p className="border-b border-border bg-warning/10 px-4 py-1.5 text-xs text-foreground">You&apos;re viewing an earlier version (read-only). Switch back to v{data.sharedVersion} to comment or decide.</p>}

      {comparePair ? (() => {
        const mk = (s: CompareSideData | undefined, v: number): CompareSide => ({
          versionNumber: v,
          // Each version streams through the authorized review media proxy — no Firebase URL, and each request is checked against the share.
          mediaUrl: s ? `/api/review/media?t=${encodeURIComponent(token)}&v=${v}` : null,
          assetType: s?.asset.assetType ?? data.asset.assetType,
          contentType: s?.asset.contentType ?? data.asset.contentType,
          durationSeconds: s?.asset.durationSeconds ?? null,
          comments: (s?.comments ?? []).map((c) => toAssetComment(c, v)),
          annotations: (s?.annotations ?? []).map((a) => toAssetAnnotation(a, v)),
        });
        const sides: [CompareSide, CompareSide] = [mk(compareData?.a, comparePair[0]), mk(compareData?.b, comparePair[1])];
        const sharedInPair = comparePair.includes(data.sharedVersion);
        return (
          <CompareView
            sides={sides}
            versions={versionNumbers}
            onChangeVersion={(side, v) => setComparePair(side === 0 ? [v, comparePair[1]] : [comparePair[0], v])}
            onExit={() => { setComparePair(null); setCompareData(null); setCompareError(null); }}
            isLoading={!compareData && !compareError}
            error={compareError}
            headerNote={`Review decision applies to v${data.sharedVersion} — the version this link was sent for — not to the versions being compared.`}
            commentTargets={data.permissions.canComment && sharedInPair ? [data.sharedVersion] : []}
            canComment={data.permissions.canComment}
            commentDisabledReason={!data.permissions.canComment ? "Commenting is turned off for this link." : `You can comment on v${data.sharedVersion} (the version shared with you). Include it in the comparison to leave a comment.`}
            onSubmitComment={async ({ body, timestampSeconds }) => {
              const ok = await postComment(body, timestampSeconds !== null ? { timestampSeconds, positionX: null, positionY: null, pageNumber: null } : null);
              if (ok) await loadCompare(comparePair);
              return ok;
            }}
            composerExtra={!nameSaved ? <Input ref={nameRef} label="Your name" placeholder="So the team knows who's commenting" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /> : null}
            mode={compareMode}
            onModeChange={setCompareMode}
          />
        );
      })() : (
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative flex min-h-[40vh] min-w-0 flex-1 flex-col lg:min-h-0">
          <div className="flex-1 overflow-hidden">
            {data.asset.assetType === "video" ? (
              <VideoReviewCanvas
                {...canvasProps} asset={asset} comments={comments} annotations={annotations} seekTo={seekTo} onSeekHandled={() => setSeekTo(null)} onTimeChange={setCurrentTime}
                onCreateCommentMarker={(x, y, t) => handleMarker(x, y, t, null)} onCreateShape={(d, t) => handleShape(d, t, null)}
                onSelectComment={(id) => { const c = data.comments.find((c) => c.id === id); if (c) select(c); }}
                pendingMarker={pendingMarker} onSubmitPendingComment={async (b) => { const ok = await postComment(b, pendingMarker); if (ok) setPendingMarker(null); return ok; }} onCancelPendingComment={() => setPendingMarker(null)}
              />
            ) : data.asset.assetType === "image" ? (
              <ImageReviewCanvas
                {...canvasProps} asset={asset} comments={comments.filter((c) => c.positionX !== null)} annotations={annotations}
                onCreateCommentMarker={(x, y) => handleMarker(x, y, null, null)} onCreateShape={(d) => handleShape(d, null, null)}
                onSelectComment={(id) => { const c = data.comments.find((c) => c.id === id); if (c) select(c); }}
              />
            ) : data.asset.assetType === "pdf" ? (
              <PdfReviewCanvas
                {...canvasProps} asset={asset} comments={comments.filter((c) => c.pageNumber !== null)} annotations={annotations} seekToPage={seekToPage} onSeekPageHandled={() => setSeekToPage(null)}
                onCreateCommentMarker={(x, y, page) => handleMarker(x, y, null, page)} onCreateShape={(d, page) => handleShape(d, null, page)}
                onSelectComment={(id) => { const c = data.comments.find((c) => c.id === id); if (c) select(c); }}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 bg-surface-muted text-center">
                <FileTypeIcon contentType={data.asset.contentType} className="h-12 w-12 text-foreground-muted" />
                <p className="text-sm font-medium text-foreground">{data.asset.fileName}</p>
                <p className="text-xs text-foreground-muted">No preview is available for this file type.</p>
              </div>
            )}
          </div>
          {canWriteComments && (data.asset.assetType === "video" || data.asset.assetType === "image" || data.asset.assetType === "pdf") && (
            <div className="absolute left-1/2 top-3 -translate-x-1/2"><AnnotationToolbar active={activeTool} onChange={setActiveTool} /></div>
          )}
        </div>

        <aside className="flex max-h-[55vh] w-full shrink-0 flex-col border-t border-border bg-surface lg:max-h-none lg:w-96 lg:border-l lg:border-t-0">
          {(canDecide || data.decision || roundNote) && (
            <div className="flex flex-col gap-2 border-b border-border p-3">
              <p className="text-xs text-foreground-muted">
                Round {data.round.roundNumber} · v{data.round.version}
                {data.round.requiredTotal > 0 && data.round.status !== "changes_requested" ? ` · ${data.round.requiredApproved} / ${data.round.requiredTotal} required approvals` : data.round.status === "changes_requested" ? " · Changes requested" : ""}
                {data.round.me ? ` · you are a ${data.round.me.required ? "required" : "optional"} reviewer` : ""}
              </p>
              {roundNote && <p className="rounded-theme bg-surface-muted px-2.5 py-1.5 text-xs text-foreground">{roundNote}</p>}
              {data.decision && (
                <div className={cn("flex items-center gap-2 rounded-theme px-2.5 py-1.5 text-xs font-medium", data.decision.decision === "approved" ? "bg-success/10 text-success" : "bg-warning/10 text-warning")}>
                  {data.decision.decision === "approved" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  {data.decision.decision === "approved" ? "Approved" : "Changes requested"}{data.decision.decidedAt ? ` · ${timeAgo(data.decision.decidedAt)}` : ""}
                </div>
              )}
              {canDecide && (
                <>
                  <Textarea rows={2} placeholder="Add a note with your decision (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
                  <div className="flex gap-2">
                    {data.permissions.canApprove && <Button size="sm" className="flex-1" onClick={() => decide("approved")} isLoading={deciding === "approved"} disabled={deciding !== null}><CheckCircle2 className="h-4 w-4" />Approve</Button>}
                    {data.permissions.canRequestChanges && <Button size="sm" variant="outline" className="flex-1" onClick={() => decide("changes_requested")} isLoading={deciding === "changes_requested"} disabled={deciding !== null}><XCircle className="h-4 w-4" />Request changes</Button>}
                  </div>
                </>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
            <MessageSquare className="h-4 w-4 text-foreground-muted" />
            <p className="text-sm font-semibold text-foreground">Comments</p>
            <span className="text-xs text-foreground-muted">({data.comments.length})</span>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {topLevel.length === 0 ? (
              <EmptyState title="No comments yet" description={canWriteComments ? "Leave feedback or drop a timestamp." : "Nothing has been said about this yet."} className="py-6" />
            ) : (
              <div className="flex flex-col gap-3">
                {topLevel.map((c) => {
                  const label = markerLabel(c);
                  return (
                    <div key={c.id} className={cn("rounded-theme border p-2.5", highlighted === c.id ? "border-primary bg-primary/5" : "border-border")}>
                      <button className="flex w-full flex-col gap-1 text-left" onClick={() => select(c)}>
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{c.authorName}</span>
                          <Badge variant={c.authorKind === "external" ? "warning" : "info"}>{c.authorKind === "external" ? (c.isMine ? "You" : "Client") : "Team"}</Badge>
                          {label && <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white" style={{ backgroundColor: getMarkerColor(c.markerNumber) }}>{label}</span>}
                        </div>
                        <p className="whitespace-pre-wrap text-sm text-foreground">{c.body}</p>
                        <p className="text-[10px] text-foreground-muted">{timeAgo(c.createdAt)}</p>
                      </button>
                      {repliesOf(c.id).map((r) => (
                        <div key={r.id} className="mt-2 border-l-2 border-border pl-2.5">
                          <p className="text-[11px] font-medium text-foreground">{r.authorName} <span className="font-normal text-foreground-muted">· {timeAgo(r.createdAt)}</span></p>
                          <p className="whitespace-pre-wrap text-xs text-foreground">{r.body}</p>
                        </div>
                      ))}
                      {canWriteComments && <button className="mt-1.5 text-[11px] font-medium text-primary hover:underline" onClick={() => setReplyTo(c)}>Reply</button>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {canWriteComments ? (
            <div className="flex flex-col gap-2 border-t border-border p-3">
              {!nameSaved && (
                <Input ref={nameRef} label="Your name" placeholder="So the team knows who's commenting" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
              )}
              {replyTo && (
                <div className="flex items-center justify-between rounded-theme bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary">
                  <span>Replying to {replyTo.authorName}</span>
                  <button onClick={() => setReplyTo(null)} aria-label="Cancel reply">×</button>
                </div>
              )}
              {pendingMarker && (
                <div className="flex items-center justify-between rounded-theme bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary">
                  <span>Commenting {pendingMarker.timestampSeconds !== null && `at ${formatDuration(pendingMarker.timestampSeconds)}`}{pendingMarker.pageNumber !== null && `on page ${pendingMarker.pageNumber}`}</span>
                  <button onClick={() => setPendingMarker(null)} aria-label="Cancel marker">×</button>
                </div>
              )}
              <Textarea rows={2} placeholder="Add a comment..." value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000} />
              <div className="flex items-center justify-between gap-2">
                {data.asset.assetType === "video" && !pendingMarker && !replyTo ? (
                  <label className="flex items-center gap-1.5 text-xs text-foreground-muted">
                    <input type="checkbox" checked={includeTimestamp} onChange={(e) => setIncludeTimestamp(e.target.checked)} className="accent-primary" />
                    At {formatDuration(currentTime)}
                  </label>
                ) : <span />}
                <Button size="sm" onClick={handleComposerSubmit} isLoading={isSubmitting} disabled={!draft.trim()}><Send className="h-3.5 w-3.5" />Comment</Button>
              </div>
              {message && <p className="text-xs text-error">{message}</p>}
            </div>
          ) : (
            <div className="border-t border-border p-3 text-center text-xs text-foreground-muted">
              {isSharedVersion ? "Commenting is turned off for this link." : "Earlier versions are read-only."}
              {message && <p className="mt-1 text-error">{message}</p>}
            </div>
          )}
          {!canWriteComments && canDecide && !nameSaved && (
            <div className="border-t border-border p-3"><Input ref={nameRef} label="Your name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></div>
          )}
        </aside>
      </div>
      )}
    </div>
  );
}
