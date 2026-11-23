// Cloud Run Job entrypoint: processes ONE file (FILE_ID env) and exits. Scale-to-zero by construction — nothing runs between jobs.
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { processFile } from "./processor.mjs";

const fileId = process.env.FILE_ID;
if (!fileId || !/^[A-Za-z0-9_-]{8,64}$/.test(fileId)) {
  console.error("FILE_ID is missing or malformed.");
  process.exit(2);
}
const bucketName = process.env.STORAGE_BUCKET;
if (!bucketName) {
  console.error("STORAGE_BUCKET is not set.");
  process.exit(2);
}

initializeApp({ credential: applicationDefault(), storageBucket: bucketName });
const result = await processFile({
  db: getFirestore(),
  bucket: getStorage().bucket(),
  fileId,
  ffmpeg: process.env.FFMPEG_PATH || "ffmpeg",
  ffprobe: process.env.FFPROBE_PATH || "ffprobe",
  log: (m) => console.log(`[video-processor] ${m}`),
});
console.log(`[video-processor] ${fileId}: ${result.outcome}${result.detail ? ` (${result.detail})` : ""}`);
// "failed" exits non-zero so Cloud Run retries the task (up to the job's maxRetries); ready / unsupported / skipped are final successes.
process.exit(result.outcome === "failed" ? 1 : 0);
