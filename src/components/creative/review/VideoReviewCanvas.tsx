"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Maximize, Pause, Play, RotateCcw, RotateCw, Volume1, Volume2, VolumeX } from "lucide-react";
import { AnnotationOverlay } from "./AnnotationOverlay";
import { AnnotationTool } from "./AnnotationToolbar";
import { MarkerCommentComposer } from "./MarkerCommentComposer";
import type { PendingMarker } from "./ReviewPanel";
import { cn } from "@/lib/utils/cn";
import { formatDuration } from "@/lib/utils/fileFormat";
import { getMarkerColor } from "@/lib/utils/markerColor";
import { AnnotationData, AssetAnnotation, AssetComment, ProjectFile } from "@/types/file.types";

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

interface VideoReviewCanvasProps {
  asset: ProjectFile;
  comments: AssetComment[];
  annotations: AssetAnnotation[];
  activeTool: AnnotationTool;
  annotationColor: string;
  seekTo: number | null;
  onSeekHandled: () => void;
  onTimeChange: (t: number) => void;
  highlightedCommentId: string | null;
  onCreateCommentMarker: (x: number, y: number, timestampSeconds: number) => void;
  onCreateShape: (data: AnnotationData, timestampSeconds: number) => void;
  onSelectComment: (commentId: string) => void;
  onDeleteAnnotation?: (annotationId: string) => void;
  /** Set right after placing a marker or drawing a shape — renders the floating in-context composer (see MarkerCommentComposer) until submitted or cancelled. */
  pendingMarker: PendingMarker | null;
  onSubmitPendingComment: (body: string) => Promise<boolean>;
  onCancelPendingComment: () => void;
}

export function VideoReviewCanvas({
  asset,
  comments,
  annotations,
  activeTool,
  annotationColor,
  seekTo,
  onSeekHandled,
  onTimeChange,
  highlightedCommentId,
  onCreateCommentMarker,
  onCreateShape,
  onSelectComment,
  onDeleteAnnotation,
  pendingMarker,
  onSubmitPendingComment,
  onCancelPendingComment,
}: VideoReviewCanvasProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  // Scrubbing coalesces every pointermove into at most one real seek
  // per animation frame (~60/s) instead of one per raw pointer event
  // (which can fire well over 100/s) — setting video.currentTime is a
  // real decode operation, not a cheap property write, so firing it
  // uncoalesced floods the browser's media pipeline with seek requests
  // faster than it can service them, and the visible frame lags
  // noticeably behind the pointer. This is the same rAF-coalescing
  // pattern already used for the landing page's scroll-scrubbed video.
  const pendingSeekRef = useRef<number | null>(null);
  const seekRafRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(asset.durationSeconds ?? 0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [isSpeedMenuOpen, setIsSpeedMenuOpen] = useState(false);
  // The <video> is `object-contain` inside a fixed aspect-video box, so its
  // OWN box (from getBoundingClientRect) is almost never exactly where the
  // decoded pixels render — a non-16:9 source gets letterboxed inside it.
  // This is the actual visible-content rect, in pixels relative to the
  // frame wrapper, that AnnotationOverlay gets positioned to match, so its
  // own inset-0 percentage math lines up with real video pixels instead of
  // the (possibly larger) element box around them.
  const [contentBox, setContentBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  function recomputeContentBox() {
    const video = videoRef.current;
    const frame = frameRef.current;
    if (!video || !frame || !video.videoWidth || !video.videoHeight) return;

    const frameRect = frame.getBoundingClientRect();
    const videoAspect = video.videoWidth / video.videoHeight;
    const boxAspect = frameRect.width / frameRect.height;

    let width: number, height: number;
    if (videoAspect > boxAspect) {
      width = frameRect.width;
      height = width / videoAspect;
    } else {
      height = frameRect.height;
      width = height * videoAspect;
    }

    setContentBox({ left: (frameRect.width - width) / 2, top: (frameRect.height - height) / 2, width, height });
  }

  useEffect(() => {
    recomputeContentBox();
    const observer = new ResizeObserver(recomputeContentBox);
    if (frameRef.current) observer.observe(frameRef.current);
    window.addEventListener("resize", recomputeContentBox);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", recomputeContentBox);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.id]);

  // Selecting a comment (from the panel or a timeline marker) seeks to its
  // exact timestamp AND pauses — landing on a specific frame is the whole
  // point of a frame-specific marker, so autoplay carrying past it would
  // undermine the "look at this exact moment" intent of the click.
  useEffect(() => {
    if (seekTo === null || !videoRef.current) return;
    videoRef.current.currentTime = seekTo;
    videoRef.current.pause();
    setCurrentTime(seekTo);
    onSeekHandled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekTo]);

  // Resets playback state when switching to a different version's video.
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
  }, [asset.id]);

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play();
    else video.pause();
  }

  function flushSeek() {
    seekRafRef.current = null;
    const time = pendingSeekRef.current;
    if (time === null || !videoRef.current) return;
    videoRef.current.currentTime = time;
    setCurrentTime(time);
  }

  function seekToClientX(bar: HTMLDivElement, clientX: number) {
    const rect = bar.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    pendingSeekRef.current = fraction * duration;
    if (seekRafRef.current === null) seekRafRef.current = requestAnimationFrame(flushSeek);
  }

  useEffect(() => {
    return () => {
      if (seekRafRef.current !== null) cancelAnimationFrame(seekRafRef.current);
    };
  }, []);

  function toggleFullscreen() {
    if (!containerRef.current) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else containerRef.current.requestFullscreen();
  }

  function changeSpeed(rate: number) {
    setSpeed(rate);
    if (videoRef.current) videoRef.current.playbackRate = rate;
    setIsSpeedMenuOpen(false);
  }

  // A marker only appears ON TOP OF THE VIDEO while playback is actually at
  // (or within a small tolerance of) the moment it was left at — otherwise,
  // once the video moves, every pin from every timestamp would stay stacked
  // on screen with no way to tell which one belongs to the current frame.
  // The chip row and timeline below always list every comment regardless of
  // playhead — that's the "see everything at once" view; the canvas overlay
  // is the "what does THIS frame's feedback look like" view. Selecting a
  // comment seeks + pauses to its EXACT timestamp (see the seekTo effect
  // above), so it naturally satisfies this same tolerance check — no
  // separate "always show the selected one" carve-out needed.
  const MARKER_VISIBILITY_TOLERANCE = 0.5;
  const positionedComments = comments.filter(
    (c) => c.positionX !== null && c.timestampSeconds !== null && Math.abs(currentTime - c.timestampSeconds) <= MARKER_VISIBILITY_TOLERANCE
  );
  // Same tolerance-based visibility as comment markers above — a
  // rectangle/circle/arrow/text annotation is drawn AT a specific
  // moment (it carries its own timestampSeconds, same as a comment
  // marker) and should only be visible while playback is at that
  // moment, not for the entire video. This filter was missing
  // entirely before, which is why shapes stayed on screen throughout
  // playback instead of only appearing at the point they were drawn.
  const positionedAnnotations = annotations.filter(
    (a) => a.timestampSeconds !== null && Math.abs(currentTime - a.timestampSeconds) <= MARKER_VISIBILITY_TOLERANCE
  );
  const timelineMarkers = comments.filter((c) => c.timestampSeconds !== null);

  const TICK_COUNT = 6;
  const tickTimes = duration > 0 ? Array.from({ length: TICK_COUNT + 1 }, (_, i) => (duration / TICK_COUNT) * i) : [];

  const VolumeIcon = isMuted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div className="flex h-full flex-col bg-black">
      <div ref={containerRef} className="relative flex flex-1 items-center justify-center overflow-hidden bg-black">
        <div ref={frameRef} className="relative aspect-video w-full max-h-full max-w-full">
          <video
            ref={videoRef}
            src={asset.url}
            className="h-full w-full object-contain"
            onClick={activeTool === "select" ? togglePlay : undefined}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onTimeUpdate={(e) => {
              const t = e.currentTarget.currentTime;
              setCurrentTime(t);
              onTimeChange(t);
            }}
            onLoadedMetadata={(e) => {
              setDuration(e.currentTarget.duration);
              recomputeContentBox();
            }}
          />
          {contentBox && (
            <div className="absolute" style={{ left: contentBox.left, top: contentBox.top, width: contentBox.width, height: contentBox.height }}>
              <AnnotationOverlay
                annotations={positionedAnnotations}
                comments={positionedComments}
                activeTool={activeTool}
                color={annotationColor}
                highlightedCommentId={highlightedCommentId}
                onCreateCommentMarker={(x, y) => onCreateCommentMarker(x, y, currentTime)}
                onCreateShape={(data) => onCreateShape(data, currentTime)}
                onSelectComment={onSelectComment}
                onDeleteAnnotation={onDeleteAnnotation}
              />

              {/* Lives in the same positioned box as AnnotationOverlay (not frameRef) so
                  marker.positionX/positionY — captured there as percentages of THIS box,
                  see AnnotationOverlay's own click handler — place it at the actual spot the
                  reviewer marked instead of a fixed top-center that ignores where they clicked. */}
              <AnimatePresence>
                {pendingMarker && (
                  <MarkerCommentComposer marker={pendingMarker} onSubmit={onSubmitPendingComment} onCancel={onCancelPendingComment} />
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2.5 border-t border-white/10 bg-black/95 px-4 py-3">
        <div className="flex items-center gap-3 text-white">
          <button onClick={togglePlay} className="rounded-theme p-1.5 hover:bg-white/10" aria-label={isPlaying ? "Pause" : "Play"}>
            {isPlaying ? <Pause className="h-5 w-5" fill="currentColor" /> : <Play className="h-5 w-5" fill="currentColor" />}
          </button>

          <span className="min-w-[92px] font-mono text-xs text-white/80">
            {formatDuration(currentTime)} / {formatDuration(duration)}
          </span>

          <button
            onClick={() => {
              const t = Math.max(0, currentTime - 10);
              if (videoRef.current) videoRef.current.currentTime = t;
              setCurrentTime(t);
            }}
            className="rounded-theme p-1.5 hover:bg-white/10"
            aria-label="Rewind 10 seconds"
            title="Rewind 10s"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              const t = Math.min(duration, currentTime + 10);
              if (videoRef.current) videoRef.current.currentTime = t;
              setCurrentTime(t);
            }}
            className="rounded-theme p-1.5 hover:bg-white/10"
            aria-label="Forward 10 seconds"
            title="Forward 10s"
          >
            <RotateCw className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                const next = !isMuted;
                setIsMuted(next);
                if (videoRef.current) videoRef.current.muted = next;
              }}
              className="rounded-theme p-1.5 hover:bg-white/10"
              aria-label="Mute"
            >
              <VolumeIcon className="h-4 w-4" />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setVolume(v);
                setIsMuted(v === 0);
                if (videoRef.current) {
                  videoRef.current.volume = v;
                  videoRef.current.muted = v === 0;
                }
              }}
              className="h-1 w-16 accent-primary"
            />
          </div>

          <div className="relative">
            <button
              onClick={() => setIsSpeedMenuOpen((v) => !v)}
              className="rounded-theme px-2 py-1 text-xs font-medium hover:bg-white/10"
            >
              {speed}x
            </button>
            {isSpeedMenuOpen && (
              <div className="absolute bottom-full mb-1 flex flex-col rounded-theme border border-white/10 bg-black py-1 shadow-soft-lg">
                {PLAYBACK_SPEEDS.map((rate) => (
                  <button
                    key={rate}
                    onClick={() => changeSpeed(rate)}
                    className={cn("px-3 py-1 text-left text-xs hover:bg-white/10", rate === speed && "text-primary")}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1" />

          <button onClick={toggleFullscreen} className="rounded-theme p-1.5 hover:bg-white/10" aria-label="Fullscreen">
            <Maximize className="h-4 w-4" />
          </button>
        </div>

        {timelineMarkers.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            {timelineMarkers.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelectComment(c.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium transition-colors",
                  highlightedCommentId === c.id ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10"
                )}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getMarkerColor(c.markerNumber) }} />
                {formatDuration(c.timestampSeconds)}
              </button>
            ))}
          </div>
        )}

        <div
          className="group relative h-12 w-full cursor-pointer overflow-hidden rounded-theme bg-white/10 bg-cover bg-center"
          style={asset.thumbnailUrl ? { backgroundImage: `repeating-linear-gradient(90deg, rgb(0 0 0 / 0.55), rgb(0 0 0 / 0.55) 100%), url(${asset.thumbnailUrl})`, backgroundSize: "auto 100%" } : undefined}
          onPointerDown={(e) => {
            const bar = e.currentTarget;
            seekToClientX(bar, e.clientX);
            const move = (ev: PointerEvent) => seekToClientX(bar, ev.clientX);
            const up = () => {
              window.removeEventListener("pointermove", move);
              window.removeEventListener("pointerup", up);
            };
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up);
          }}
        >
          {timelineMarkers.map((c) => (
            <button
              key={c.id}
              onClick={(e) => {
                e.stopPropagation();
                onSelectComment(c.id);
              }}
              title={`${formatDuration(c.timestampSeconds)} — ${c.author.displayName}: ${c.body}`}
              className={cn(
                "absolute bottom-0.5 h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-black shadow transition-transform hover:scale-125",
                highlightedCommentId === c.id && "scale-125 ring-2 ring-white"
              )}
              style={{ left: duration ? `${((c.timestampSeconds ?? 0) / duration) * 100}%` : "0%", backgroundColor: getMarkerColor(c.markerNumber) }}
            />
          ))}

          <div
            className="pointer-events-none absolute top-0 h-full w-0.5 bg-primary shadow-[0_0_6px_rgb(var(--color-primary))]"
            style={{ left: duration ? `${(currentTime / duration) * 100}%` : "0%" }}
          >
            <div className="absolute -top-1 left-1/2 h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[6px] border-x-transparent border-t-primary" />
          </div>
        </div>

        {duration > 0 && (
          <div className="flex justify-between px-0.5 font-mono text-[10px] text-white/50">
            {tickTimes.map((t) => (
              <span key={t}>{formatDuration(t)}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
