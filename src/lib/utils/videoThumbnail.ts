/**
 * Captures a real frame from a video File as a JPEG Blob, entirely in
 * the browser (an off-DOM <video> + <canvas>, no server/library
 * involved) — used to give video assets a thumbnail without faking
 * one. Best-effort: resolves `null` on any failure (unsupported
 * codec, decode error, etc.) so an upload never fails just because a
 * thumbnail couldn't be captured.
 */
export function captureVideoThumbnail(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(file);
    video.src = url;

    const cleanup = () => URL.revokeObjectURL(url);
    const fail = () => {
      cleanup();
      resolve(null);
    };

    const timeout = setTimeout(fail, 8000);

    video.addEventListener("loadedmetadata", () => {
      video.currentTime = Math.min(0.5, (video.duration || 1) / 4);
    });

    video.addEventListener("seeked", () => {
      clearTimeout(timeout);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 180;
        const ctx = canvas.getContext("2d");
        if (!ctx) return fail();
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            cleanup();
            resolve(blob);
          },
          "image/jpeg",
          0.8
        );
      } catch {
        fail();
      }
    });

    video.addEventListener("error", fail);
  });
}

/** Reads a video/audio File's duration in seconds without uploading it first. Best-effort, resolves null on failure. */
export function readMediaDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const el = document.createElement(file.type.startsWith("audio/") ? "audio" : "video");
    el.preload = "metadata";
    const url = URL.createObjectURL(file);
    el.src = url;

    const cleanup = () => URL.revokeObjectURL(url);
    const timeout = setTimeout(() => {
      cleanup();
      resolve(null);
    }, 8000);

    el.addEventListener("loadedmetadata", () => {
      clearTimeout(timeout);
      cleanup();
      resolve(Number.isFinite(el.duration) ? el.duration : null);
    });
    el.addEventListener("error", () => {
      clearTimeout(timeout);
      cleanup();
      resolve(null);
    });
  });
}
