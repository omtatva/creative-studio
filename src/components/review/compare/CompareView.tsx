"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Layers, Columns2, Minus, Pause, Play, Plus, Send, Volume2, VolumeX } from "lucide-react";
import { AnnotationOverlay } from "@/components/creative/review/AnnotationOverlay";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Loader } from "@/components/ui/Loader";
import { Textarea } from "@/components/ui/Textarea";
import { cn } from "@/lib/utils/cn";
import { formatDuration } from "@/lib/utils/fileFormat";
import { timeAgo } from "@/lib/utils/date";
import { getMarkerColor } from "@/lib/utils/markerColor";
import { shouldToggleOnMediaClick, shouldToggleOnSpace } from "@/lib/utils/playbackInteraction";
import { aspectsDiffer, clampToDuration, formatDimensions, leaderIndex, planFollowerCorrection, sharedDuration } from "@/lib/utils/compareSync";
import type { AssetAnnotation, AssetComment, AssetType } from "@/types/file.types";

export interface CompareSide {
  versionNumber: number;
  /** null while the media URL is still being issued. */
  mediaUrl: string | null;
  assetType: AssetType;
  contentType: string;
  durationSeconds: number | null;
  comments: AssetComment[];
  annotations: AssetAnnotation[];
}

export type CompareMode = "side" | "overlay";
type AnnoMode = "a" | "b" | "both" | "none";
type Dims = { width: number; height: number };
type Idx = 0 | 1;

interface CompareViewProps {
  sides: [CompareSide, CompareSide];
  /** Version numbers the viewer may pick from (already filtered to what they are authorized to see). */
  versions: number[];
  onChangeVersion: (side: Idx, versionNumber: number) => void;
  onExit: () => void;
  isLoading?: boolean;
  error?: string | null;
  /** Shown under the header, e.g. "Review decision applies to v3". */
  headerNote?: string | null;
  /** Versions the viewer may leave a comment on (explicit — never inferred from where they clicked). */
  commentTargets: number[];
  canComment: boolean;
  /** Why commenting is unavailable, shown in place of the composer. */
  commentDisabledReason?: string;
  onSubmitComment: (args: { versionNumber: number; body: string; timestampSeconds: number | null }) => Promise<boolean>;
  composerExtra?: ReactNode;
  mode: CompareMode;
  onModeChange: (mode: CompareMode) => void;
}

const SPEEDS = [0.5, 1, 1.5, 2];
const MARKER_TOLERANCE = 0.5;
const noop = () => {};

/** Where the decoded pixels actually render inside a letterboxed (object-contain) frame — so annotation overlays line up with real media, not the element box. */
function useContainedBox(frameRef: React.RefObject<HTMLDivElement | null>, dims: Dims | null) {
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !dims) return setBox(null);
    const compute = () => {
      const r = frame.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const mediaAspect = dims.width / dims.height;
      let width = r.width;
      let height = width / mediaAspect;
      if (height > r.height) {
        height = r.height;
        width = height * mediaAspect;
      }
      setBox({ left: (r.width - width) / 2, top: (r.height - height) / 2, width, height });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(frame);
    return () => ro.disconnect();
  }, [frameRef, dims]);
  return box;
}

interface SideMediaProps {
  side: CompareSide;
  label: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  muted: boolean;
  volume: number;
  zoom: number;
  dims: Dims | null;
  onDims: (d: Dims) => void;
  onDuration: (d: number) => void;
  onWaiting: (waiting: boolean) => void;
  comments: AssetComment[];
  annotations: AssetAnnotation[];
  highlightedCommentId: string | null;
  onSelectComment: (id: string) => void;
  onSelectAnnotation: (annotation: AssetAnnotation) => void;
  /** Click on the picture (either version, either layout) → toggle the ONE shared playback state for both players. */
  onTogglePlayback?: () => void;
}

function SideMedia({ side, label, videoRef, muted, volume, zoom, dims, onDims, onDuration, onWaiting, comments, annotations, highlightedCommentId, onSelectComment, onSelectAnnotation, onTogglePlayback }: SideMediaProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const box = useContainedBox(frameRef, dims);

  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume;
  }, [volume, videoRef, side.mediaUrl]);

  return (
    <div
      ref={frameRef}
      className={cn("relative h-full w-full overflow-hidden bg-black", onTogglePlayback && "cursor-pointer")}
      role="group"
      aria-label={label}
      // Compare has no draw tools (annotating happens outside compare), so a click here is always "toggle playback".
      // Markers, shapes and every control stop propagation or live outside this element, so only a click on the picture arrives.
      onClick={(e) => {
        if (onTogglePlayback && shouldToggleOnMediaClick({ tool: "select", hasPendingMarker: false, clickDetail: e.detail })) onTogglePlayback();
      }}
    >
      <div className="h-full w-full origin-center transition-transform" style={zoom !== 1 ? { transform: `scale(${zoom})` } : undefined}>
        {side.mediaUrl && side.assetType === "video" && (
          <video
            ref={videoRef}
            src={side.mediaUrl}
            muted={muted}
            playsInline
            preload="metadata"
            className="h-full w-full object-contain"
            aria-label={label}
            onLoadedMetadata={(e) => {
              onDuration(e.currentTarget.duration);
              onDims({ width: e.currentTarget.videoWidth, height: e.currentTarget.videoHeight });
            }}
            onWaiting={() => onWaiting(true)}
            onPlaying={() => onWaiting(false)}
            onCanPlay={() => onWaiting(false)}
            onSeeked={() => onWaiting(false)}
          />
        )}
        {side.mediaUrl && side.assetType === "image" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={side.mediaUrl} alt={label} className="h-full w-full object-contain" onLoad={(e) => onDims({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })} />
        )}
        {box && (
          <div className="pointer-events-none absolute" style={{ left: box.left, top: box.top, width: box.width, height: box.height }}>
            {/* The layer itself is pointer-transparent in select mode; only markers/shapes opt back in (and own their clicks). */}
            <AnnotationOverlay
              annotations={annotations}
              comments={comments}
              activeTool="select"
              color="#f59e0b"
              highlightedCommentId={highlightedCommentId}
              onCreateShape={noop}
              onCreateCommentMarker={noop}
              onSelectComment={onSelectComment}
              onSelectAnnotation={onSelectAnnotation}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Professional version comparison — shared by the internal review workspace and the
 * external (client) review page. It is data-source agnostic: wrappers do the
 * authorization and supply media URLs, comments and annotations per VERSION; this
 * component keeps them separate (nothing is merged into one version's list) and never
 * decides access itself.
 */
export function CompareView({ sides, versions, onChangeVersion, onExit, isLoading, error, headerNote, commentTargets, canComment, commentDisabledReason, onSubmitComment, composerExtra, mode, onModeChange }: CompareViewProps) {
  const isVideo = sides[0].assetType === "video" && sides[1].assetType === "video";
  const isImage = sides[0].assetType === "image" && sides[1].assetType === "image";
  const newerIdx: Idx = sides[1].versionNumber >= sides[0].versionNumber ? 1 : 0;

  const videoA = useRef<HTMLVideoElement>(null);
  const videoB = useRef<HTMLVideoElement>(null);
  const videoRefs = useMemo(() => [videoA, videoB] as const, []);
  const sidesRef = useRef(sides);
  sidesRef.current = sides;

  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [audioFrom, setAudioFrom] = useState<Idx | null>(null); // null = default to the newer version
  const [opacity, setOpacity] = useState(50);
  const [annoChoice, setAnnoChoice] = useState<AnnoMode | null>(null);
  const [zoom, setZoom] = useState(1);
  const [dims, setDims] = useState<[Dims | null, Dims | null]>([null, null]);
  const [durs, setDurs] = useState<[number | null, number | null]>([null, null]);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | Idx>("all");
  const [draft, setDraft] = useState("");
  const [target, setTarget] = useState<number | null>(null);
  const [includeTime, setIncludeTime] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const durRef = useRef<[number | null, number | null]>([null, null]);
  const wantsPlay = useRef(false);
  const waiting = useRef<[boolean, boolean]>([false, false]);
  const lastSeek = useRef(0);
  const speedRef = useRef(1);
  const pendingSeek = useRef<number | null>(null);
  const seekRaf = useRef<number | null>(null);
  speedRef.current = speed;

  const getDur = useCallback((i: Idx): number | null => {
    const measured = durRef.current[i];
    if (measured !== null && Number.isFinite(measured) && measured > 0) return measured;
    return sidesRef.current[i].durationSeconds ?? null;
  }, []);
  const total = sharedDuration(durs[0] ?? sides[0].durationSeconds, durs[1] ?? sides[1].durationSeconds);
  const effectiveAudio: Idx = audioFrom ?? newerIdx;
  const anno: AnnoMode = annoChoice ?? (mode === "overlay" ? "b" : "both");

  // New media (a different version picked) → fresh playback state; nothing carries over.
  const mediaKey = `${sides[0].mediaUrl}|${sides[1].mediaUrl}`;
  useEffect(() => {
    wantsPlay.current = false;
    durRef.current = [null, null];
    waiting.current = [false, false];
    setDurs([null, null]);
    setDims([null, null]);
    setPlaying(false);
    setTime(0);
    setHighlighted(null);
  }, [mediaKey]);

  const stop = useCallback(() => {
    wantsPlay.current = false;
    setPlaying(false);
    videoRefs.forEach((r) => r.current?.pause());
  }, [videoRefs]);

  const seekAll = useCallback(
    (t: number) => {
      const max = sharedDuration(getDur(0), getDur(1));
      const target = Math.min(Math.max(0, t), max > 0 ? max : t);
      ([0, 1] as const).forEach((i) => {
        const v = videoRefs[i].current;
        if (!v) return;
        const d = getDur(i);
        v.currentTime = clampToDuration(target, d);
        if (d !== null && target >= d - 0.05) v.pause(); // shorter version holds on its last frame
      });
      lastSeek.current = performance.now();
      setTime(target);
    },
    [getDur, videoRefs]
  );

  const seekCoalesced = useCallback(
    (t: number) => {
      pendingSeek.current = t;
      setTime(t);
      if (seekRaf.current === null) {
        seekRaf.current = requestAnimationFrame(() => {
          seekRaf.current = null;
          if (pendingSeek.current !== null) seekAll(pendingSeek.current);
        });
      }
    },
    [seekAll]
  );

  const play = useCallback(() => {
    const max = sharedDuration(getDur(0), getDur(1));
    if (max > 0 && time >= max - 0.1) seekAll(0);
    wantsPlay.current = true;
    setPlaying(true);
    ([0, 1] as const).forEach((i) => {
      const v = videoRefs[i].current;
      const d = getDur(i);
      if (v && (d === null || v.currentTime < d - 0.06)) void v.play().catch(() => {});
    });
  }, [getDur, seekAll, time, videoRefs]);

  // ONE clock, light drift correction. The longer version leads; the follower is only touched when it actually drifts
  // (see compareSync.planFollowerCorrection: ignore < 80 ms, nudge playbackRate < 300 ms, seek only beyond that, with a cooldown).
  useEffect(() => {
    if (!isVideo) return;
    const id = setInterval(() => {
      const d0 = getDur(0);
      const d1 = getDur(1);
      const L = leaderIndex(d0, d1);
      const F: Idx = L === 0 ? 1 : 0;
      const lv = videoRefs[L].current;
      const fv = videoRefs[F].current;
      if (!lv || !fv || !wantsPlay.current) return;
      if (waiting.current[0] || waiting.current[1]) {
        lv.pause();
        fv.pause(); // buffering: hold both together; the tick resumes them once both can play
        return;
      }
      const leaderDur = getDur(L);
      if (lv.ended || (leaderDur !== null && lv.currentTime >= leaderDur - 0.06)) return stop();
      if (lv.paused) void lv.play().catch(() => {});
      const action = planFollowerCorrection({ leaderTime: lv.currentTime, followerTime: fv.currentTime, followerDuration: getDur(F), baseRate: speedRef.current, nowMs: performance.now(), lastSeekMs: lastSeek.current });
      if (action.type === "hold") {
        if (!fv.paused) fv.pause();
      } else {
        if (fv.paused) void fv.play().catch(() => {});
        if (action.type === "rate" && Math.abs(fv.playbackRate - action.rate) > 0.001) fv.playbackRate = action.rate;
        if (action.type === "seek") {
          fv.currentTime = action.time;
          lastSeek.current = performance.now();
        }
      }
      if (Math.abs(lv.playbackRate - speedRef.current) > 0.001) lv.playbackRate = speedRef.current;
      setTime(lv.currentTime);
    }, 200);
    return () => clearInterval(id);
  }, [isVideo, getDur, stop, videoRefs]);

  useEffect(() => () => { if (seekRaf.current !== null) cancelAnimationFrame(seekRaf.current); }, []);

  // Space toggles playback — but never while typing, or on a control that already uses Space (see playbackInteraction).
  useEffect(() => {
    if (!isVideo) return;
    const onKey = (e: KeyboardEvent) => {
      if (!shouldToggleOnSpace({ key: e.key, code: e.code, target: e.target as HTMLElement | null, defaultPrevented: e.defaultPrevented, hasModifier: e.ctrlKey || e.metaKey || e.altKey })) return;
      e.preventDefault();
      if (wantsPlay.current) stop();
      else play();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isVideo, play, stop]);

  // Default comment target: the newer compared version, when the viewer may comment on it.
  useEffect(() => {
    const newer = sides[newerIdx].versionNumber;
    setTarget((prev) => (prev !== null && commentTargets.includes(prev) ? prev : commentTargets.includes(newer) ? newer : (commentTargets[0] ?? null)));
  }, [commentTargets, sides, newerIdx]);

  const allComments = useMemo(
    () =>
      ([0, 1] as const)
        .flatMap((i) => sides[i].comments.map((c) => ({ c, idx: i, version: sides[i].versionNumber })))
        .filter((x) => filter === "all" || x.idx === filter)
        .sort((x, y) => (x.c.createdAt < y.c.createdAt ? -1 : 1)),
    [sides, filter]
  );

  // Clicking an existing annotation: pause both, jump to the moment it was drawn, highlight the comment left then (on THAT version only).
  function selectAnnotation(a: AssetAnnotation, idx: Idx) {
    if (isVideo && a.timestampSeconds !== null) {
      stop();
      seekAll(a.timestampSeconds);
      const ts = a.timestampSeconds;
      const related = sides[idx].comments
        .filter((c) => c.timestampSeconds !== null && Math.abs((c.timestampSeconds as number) - ts) <= MARKER_TOLERANCE)
        .sort((x, y) => Math.abs((x.timestampSeconds as number) - ts) - Math.abs((y.timestampSeconds as number) - ts))[0];
      if (related) setHighlighted(related.id);
    }
  }

  function selectComment(c: AssetComment, idx: Idx) {
    setHighlighted(c.id);
    if (isVideo && c.timestampSeconds !== null) {
      stop();
      seekAll(c.timestampSeconds); // both players go to the same moment; only THIS version's comment is highlighted
    }
    void idx;
  }

  async function submit() {
    if (target === null || !draft.trim()) return;
    setIsSubmitting(true);
    const idx: Idx = sides[0].versionNumber === target ? 0 : 1;
    const ts = isVideo && includeTime ? clampToDuration(time, getDur(idx)) : null;
    const ok = await onSubmitComment({ versionNumber: target, body: draft.trim(), timestampSeconds: ts });
    setIsSubmitting(false);
    if (ok) {
      setDraft("");
      setIncludeTime(false);
    }
  }

  const visibleOverlay = (i: Idx) => {
    const show = anno === "both" || (anno === "a" && i === 0) || (anno === "b" && i === 1);
    if (!show) return { comments: [] as AssetComment[], annotations: [] as AssetAnnotation[] };
    const side = sides[i];
    const own = isVideo ? clampToDuration(time, getDur(i)) : 0;
    const near = (ts: number | null) => (isVideo ? ts !== null && Math.abs(own - ts) <= MARKER_TOLERANCE : true);
    return {
      comments: side.comments.filter((c) => c.positionX !== null && near(c.timestampSeconds)),
      annotations: side.annotations.filter((a) => (isVideo ? near(a.timestampSeconds) : a.pageNumber === null)),
    };
  };

  const dimsText = formatDimensions(dims[0]) && formatDimensions(dims[1]) ? `${formatDimensions(dims[0])} vs ${formatDimensions(dims[1])}` : null;
  const durationsDiffer = isVideo && durs[0] !== null && durs[1] !== null && Math.abs(durs[0] - durs[1]) > 0.5;
  const audioLabel = (i: Idx) => `V${sides[i].versionNumber}`;
  const labelOf = (i: Idx) => `${i === 0 ? "A" : "B"} · V${sides[i].versionNumber}`;

  if (error) return <div className="flex h-full items-center justify-center p-6"><EmptyState title="Couldn't open the comparison" description={error} action={<Button size="sm" variant="outline" onClick={onExit}>Exit compare</Button>} /></div>;
  if (!isVideo && !isImage && !isLoading) {
    return <div className="flex h-full items-center justify-center p-6"><EmptyState title="Comparison supports video and image assets" description="Open the files one at a time to review this type." action={<Button size="sm" variant="outline" onClick={onExit}>Exit compare</Button>} /></div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col lg:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-black">
        {/* header */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-white/10 bg-surface px-3 py-2">
          <Button size="sm" variant="outline" onClick={onExit} aria-label="Exit compare and return to single-version review">
            <ArrowLeft className="h-3.5 w-3.5" />
            Exit compare
          </Button>
          <div className="flex items-center gap-2 text-sm">
            <label className="sr-only" htmlFor="compare-a">Version A</label>
            <select id="compare-a" value={sides[0].versionNumber} onChange={(e) => onChangeVersion(0, Number(e.target.value))} className="h-8 rounded-theme border border-border bg-surface px-2 text-xs text-foreground">
              {versions.map((v) => <option key={v} value={v} disabled={v === sides[1].versionNumber}>A · V{v}</option>)}
            </select>
            <span className="text-xs text-foreground-muted">vs</span>
            <label className="sr-only" htmlFor="compare-b">Version B</label>
            <select id="compare-b" value={sides[1].versionNumber} onChange={(e) => onChangeVersion(1, Number(e.target.value))} className="h-8 rounded-theme border border-border bg-surface px-2 text-xs text-foreground">
              {versions.map((v) => <option key={v} value={v} disabled={v === sides[0].versionNumber}>B · V{v}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-0.5 rounded-theme border border-border bg-surface p-0.5" role="group" aria-label="Comparison layout">
            <button type="button" aria-pressed={mode === "side"} onClick={() => onModeChange("side")} className={cn("flex items-center gap-1 rounded-theme px-2 py-1 text-xs font-medium", mode === "side" ? "bg-primary/10 text-primary" : "text-foreground-muted hover:bg-surface-muted")}><Columns2 className="h-3.5 w-3.5" />Side by side</button>
            <button type="button" aria-pressed={mode === "overlay"} onClick={() => onModeChange("overlay")} className={cn("flex items-center gap-1 rounded-theme px-2 py-1 text-xs font-medium", mode === "overlay" ? "bg-primary/10 text-primary" : "text-foreground-muted hover:bg-surface-muted")}><Layers className="h-3.5 w-3.5" />Overlay</button>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-foreground-muted">
            Annotations
            <select aria-label="Which version's annotations to show" value={anno} onChange={(e) => setAnnoChoice(e.target.value as AnnoMode)} className="h-8 rounded-theme border border-border bg-surface px-2 text-xs text-foreground">
              <option value="a">V{sides[0].versionNumber}</option>
              <option value="b">V{sides[1].versionNumber}</option>
              <option value="both">Both</option>
              <option value="none">None</option>
            </select>
          </label>
          {isVideo && (
            <label className="flex items-center gap-1.5 text-xs text-foreground-muted">
              Audio
              <select aria-label="Audio source (only one version plays sound)" value={muted ? "off" : effectiveAudio} onChange={(e) => (e.target.value === "off" ? setMuted(true) : (setMuted(false), setAudioFrom(Number(e.target.value) as Idx)))} className="h-8 rounded-theme border border-border bg-surface px-2 text-xs text-foreground">
                <option value={0}>{audioLabel(0)}</option>
                <option value={1}>{audioLabel(1)}</option>
                <option value="off">Off</option>
              </select>
            </label>
          )}
          {dimsText && (
            <span className={cn("text-[11px]", aspectsDiffer(dims[0], dims[1]) ? "text-warning" : "text-foreground-muted")} title={aspectsDiffer(dims[0], dims[1]) ? "The versions have different aspect ratios — shown contained, not stretched." : undefined}>
              {dimsText}{aspectsDiffer(dims[0], dims[1]) ? " · different aspect" : ""}
            </span>
          )}
        </div>
        {headerNote && <p className="border-b border-white/10 bg-primary/10 px-3 py-1.5 text-xs text-foreground">{headerNote}</p>}
        {durationsDiffer && <p className="border-b border-white/10 bg-surface px-3 py-1 text-[11px] text-foreground-muted">V{sides[0].versionNumber} is {formatDuration(durs[0] ?? 0)}, V{sides[1].versionNumber} is {formatDuration(durs[1] ?? 0)} — the shorter version holds on its last frame while the longer one finishes.</p>}

        {/* media */}
        <div className={cn("relative min-h-[40vh] flex-1 overflow-y-auto lg:min-h-0", mode === "side" ? "grid grid-cols-1 gap-1 md:grid-cols-2" : "")}>
          {isLoading && <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60"><Loader label="Loading versions..." /></div>}
          {([0, 1] as const).map((i) => {
            const side = sides[i];
            const ov = visibleOverlay(i);
            return (
              <div
                key={i}
                className={cn("relative", mode === "overlay" ? "absolute inset-0" : "min-h-[30vh] md:min-h-0")}
                style={mode === "overlay" && i === 1 ? { opacity: opacity / 100 } : undefined}
              >
                <span className="pointer-events-none absolute left-2 top-2 z-10 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white">
                  {mode === "overlay" ? (i === 0 ? `A · V${side.versionNumber} (base)` : `B · V${side.versionNumber} (overlay ${opacity}%)`) : labelOf(i)}
                </span>
                <SideMedia
                  side={side}
                  label={`Version ${side.versionNumber}`}
                  videoRef={videoRefs[i]}
                  muted={muted || effectiveAudio !== i}
                  volume={volume}
                  zoom={zoom}
                  dims={dims[i]}
                  onDims={(d) => setDims((prev) => (i === 0 ? [d, prev[1]] : [prev[0], d]))}
                  onDuration={(d) => {
                    durRef.current = i === 0 ? [d, durRef.current[1]] : [durRef.current[0], d];
                    setDurs([durRef.current[0], durRef.current[1]]);
                  }}
                  onWaiting={(w) => { waiting.current[i] = w; }}
                  comments={ov.comments}
                  annotations={ov.annotations}
                  highlightedCommentId={highlighted}
                  onSelectComment={(id) => {
                    const hit = allComments.find((x) => x.c.id === id);
                    if (hit) selectComment(hit.c, hit.idx);
                  }}
                  onSelectAnnotation={(a) => selectAnnotation(a, i)}
                  onTogglePlayback={isVideo ? () => (wantsPlay.current ? stop() : play()) : undefined}
                />
              </div>
            );
          })}
        </div>

        {/* controls */}
        <div className="flex flex-col gap-2 border-t border-white/10 bg-black/95 px-3 py-2.5 text-white">
          {mode === "overlay" && (
            <label className="flex items-center gap-3 text-xs">
              <span className="w-28 shrink-0 text-white/70">A · V{sides[0].versionNumber}</span>
              <input type="range" min={0} max={100} step={1} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} aria-label="Overlay opacity" aria-valuetext={`Version B at ${opacity} percent over version A`} className="h-1 flex-1 accent-primary" />
              <span className="w-28 shrink-0 text-right text-white/70">B · V{sides[1].versionNumber} <span className="font-mono">{opacity}%</span></span>
            </label>
          )}
          {isVideo ? (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => (playing ? stop() : play())} className="rounded-theme p-1.5 hover:bg-white/10" aria-label={playing ? "Pause both versions" : "Play both versions"}>
                {playing ? <Pause className="h-5 w-5" fill="currentColor" /> : <Play className="h-5 w-5" fill="currentColor" />}
              </button>
              <span className="min-w-[92px] font-mono text-xs text-white/80" aria-live="off">{formatDuration(time)} / {formatDuration(total)}</span>
              <input type="range" min={0} max={Math.max(total, 0.01)} step={0.01} value={Math.min(time, total || 0)} onChange={(e) => seekCoalesced(Number(e.target.value))} aria-label="Timeline (both versions)" aria-valuetext={`${formatDuration(time)} of ${formatDuration(total)}`} className="h-1 min-w-[120px] flex-1 accent-primary" />
              <select aria-label="Playback speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="h-7 rounded-theme border border-white/20 bg-black px-1 text-xs text-white">
                {SPEEDS.map((s) => <option key={s} value={s}>{s}x</option>)}
              </select>
              <button type="button" onClick={() => setMuted((m) => !m)} className="rounded-theme p-1.5 hover:bg-white/10" aria-label={muted ? "Unmute" : "Mute"}>
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} aria-label="Volume" className="h-1 w-16 accent-primary" />
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-white/70">Zoom</span>
              <button type="button" onClick={() => setZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)))} className="rounded-theme p-1.5 hover:bg-white/10" aria-label="Zoom out both images"><Minus className="h-4 w-4" /></button>
              <span className="w-12 text-center font-mono">{Math.round(zoom * 100)}%</span>
              <button type="button" onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))} className="rounded-theme p-1.5 hover:bg-white/10" aria-label="Zoom in both images"><Plus className="h-4 w-4" /></button>
            </div>
          )}
        </div>
      </div>

      {/* comments — kept per version, never merged */}
      <aside className="flex max-h-[50vh] w-full shrink-0 flex-col border-t border-border bg-surface lg:max-h-none lg:w-96 lg:border-l lg:border-t-0">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <p className="text-sm font-semibold text-foreground">Comments</p>
          <div className="ml-auto flex items-center gap-0.5 rounded-theme border border-border p-0.5" role="group" aria-label="Filter comments by version">
            {([["all", "All"], [0, `V${sides[0].versionNumber}`], [1, `V${sides[1].versionNumber}`]] as const).map(([val, label]) => (
              <button key={String(val)} type="button" aria-pressed={filter === val} onClick={() => setFilter(val as "all" | Idx)} className={cn("rounded-theme px-2 py-0.5 text-xs font-medium", filter === val ? "bg-primary/10 text-primary" : "text-foreground-muted hover:bg-surface-muted")}>{label}</button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {allComments.length === 0 ? (
            <EmptyState title="No comments" description="Nothing has been said about the selected version(s)." className="py-6" />
          ) : (
            <div className="flex flex-col gap-2">
              {allComments.map(({ c, idx, version }) => (
                <button key={`${idx}-${c.id}`} type="button" onClick={() => selectComment(c, idx)} className={cn("flex flex-col gap-1 rounded-theme border p-2.5 text-left transition-colors", highlighted === c.id ? "border-primary bg-primary/5" : "border-border hover:bg-surface-muted")}>
                  <div className="flex items-center gap-2">
                    <Badge variant={idx === 0 ? "info" : "warning"}>V{version}</Badge>
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{c.author.displayName}</span>
                    {c.authorId.startsWith("ext:") && <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning">Client</span>}
                    {c.timestampSeconds !== null && <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white" style={{ backgroundColor: getMarkerColor(c.markerNumber) }}>{formatDuration(c.timestampSeconds)}</span>}
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-foreground">{c.body}</p>
                  <p className="text-[10px] text-foreground-muted">{timeAgo(c.createdAt)}</p>
                </button>
              ))}
            </div>
          )}
        </div>
        {canComment && commentTargets.length > 0 ? (
          <div className="flex flex-col gap-2 border-t border-border p-3">
            {composerExtra}
            <label className="flex items-center gap-2 text-xs text-foreground-muted">
              Comment on
              <select aria-label="Which version this comment belongs to" value={target ?? ""} onChange={(e) => setTarget(Number(e.target.value))} className="h-8 rounded-theme border border-border bg-surface px-2 text-xs text-foreground">
                {commentTargets.map((v) => <option key={v} value={v}>V{v}</option>)}
              </select>
            </label>
            <Textarea rows={2} placeholder={`Add a comment on V${target ?? ""}...`} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000} />
            <div className="flex items-center justify-between gap-2">
              {isVideo ? (
                <label className="flex items-center gap-1.5 text-xs text-foreground-muted">
                  <input type="checkbox" checked={includeTime} onChange={(e) => setIncludeTime(e.target.checked)} className="accent-primary" />
                  At {formatDuration(time)}
                </label>
              ) : <span />}
              <Button size="sm" onClick={submit} isLoading={isSubmitting} disabled={!draft.trim() || target === null}><Send className="h-3.5 w-3.5" />Comment</Button>
            </div>
          </div>
        ) : (
          <div className="border-t border-border p-3 text-center text-xs text-foreground-muted">{commentDisabledReason ?? "Commenting isn't available here."}</div>
        )}
      </aside>
    </div>
  );
}
