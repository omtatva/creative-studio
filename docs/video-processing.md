# Background video processing (Cloud Run Job + FFmpeg)

## What it does
After an upload is **final** (multipart `/api/uploads/complete` or classic `/api/files/finalize`), the server marks the file `processing.status = "queued"` and starts a **Cloud Run Job** that reads the **original** from GCS and produces:

| Output | Where | Notes |
|---|---|---|
| Metadata | `files/{id}.processing.metadata` | duration, width × height, frame rate, video/audio codec, container, bit rate (ffprobe) |
| Thumbnail | `…/files/{id}/derived/thumb.jpg` | 640 px JPEG (separate from the client-made `thumbnailUrl`) |
| Playback proxy | `…/files/{id}/derived/proxy-720p.mp4` | H.264/AAC, ≤720p, ≤3 Mbps, **same frame timing** (`-fps_mode passthrough`), `+faststart` |

The **original object is only read, never written**. `storagePath` always points at the original; downloads (`/api/files/download`, external reviewers) only ever resolve `storagePath`. Derivatives are separate objects with deterministic names, so a retry overwrites instead of duplicating, and deleting a file deletes the whole `files/{id}/` folder including `derived/`.

States (Firestore `files/{id}.processing.status`): `queued → processing → ready | failed | unsupported`. In the UI: Uploading / Finalizing (the upload manager), **Processing**, ready (no badge), **Processing failed** (+ Retry). `unsupported` (corrupt / no video stream) is final.

## Playback
`POST /api/files/preview` returns the proxy ticket only when `processing.status == "ready"`, the proxy exists inside the file's own `derived/` folder, and its duration was verified against the original (±max(0.25 s, 1 %)). Otherwise — or if the player's `<video>` errors on the proxy (the page then re-requests `quality:"original"`) — the original is played. Comments/markers are stored in **seconds on the original's timeline**; the proxy keeps the source frame timing and is rejected if its duration drifts, so markers stay aligned. Version comparison and external reviewer playback still use the original.

## Idempotency / retries / safety
- Claim = Firestore transaction: `ready` → no-op; live `processing` lease → skip; stale lease / `failed` / `queued` → (re)claim, attempts ≤ 3. Heartbeat extends the lease every 5 min.
- Failure cleans the partial proxy, records a scrubbed message (no URLs/paths), and exits non-zero so Cloud Run retries; a person can also press Retry (`POST /api/files/processing`).
- Source is read through a short-lived signed URL that FFmpeg streams with seeking — a 30 GB original is never copied to local disk. The URL is never stored or logged.
- Limits: sources longer than `maxProxySeconds` (4 h) or already small (≤720p and < 3.5 Mbps) get metadata + thumbnail and a recorded `proxySkipped` reason; the proxy is built on the job's memory-backed temp disk, so give the job memory ≥ the proxy size (3 Mbps ⇒ ~1.35 GB per hour of video).

## Deploy (NOT applied — needs your approval)
```bash
PROJECT=creative-studio-176c0 REGION=asia-south1 BUCKET=creative-studio-176c0.firebasestorage.app

# 1. Dedicated least-privilege service account for the job
gcloud iam service-accounts create feedo-video-processor --project $PROJECT
SA=feedo-video-processor@$PROJECT.iam.gserviceaccount.com
gcloud storage buckets add-iam-policy-binding gs://$BUCKET --member=serviceAccount:$SA --role=roles/storage.objectAdmin
gcloud projects add-iam-policy-binding $PROJECT --member=serviceAccount:$SA --role=roles/datastore.user
gcloud iam service-accounts add-iam-policy-binding $SA --member=serviceAccount:$SA --role=roles/iam.serviceAccountTokenCreator   # to sign its own read URL

# 2. Build + create the job (scale-to-zero: it only runs when triggered)
gcloud builds submit workers/video-processor --tag $REGION-docker.pkg.dev/$PROJECT/feedo/video-processor --project $PROJECT
gcloud run jobs create feedo-video-processor --image $REGION-docker.pkg.dev/$PROJECT/feedo/video-processor \
  --region $REGION --service-account $SA --cpu 4 --memory 8Gi --task-timeout 6h --max-retries 1 --parallelism 1 \
  --set-env-vars STORAGE_BUCKET=$BUCKET,FFMPEG_THREADS=4

# 3. Let the App Hosting runtime service account START this one job with an env override (run.jobs.runWithOverrides) and nothing else
gcloud run jobs add-iam-policy-binding feedo-video-processor --region $REGION \
  --member=serviceAccount:firebase-app-hosting-compute@$PROJECT.iam.gserviceaccount.com --role=roles/run.developer

# 4. Turn it on in App Hosting (apphosting.yaml env): VIDEO_PROCESSOR_JOB=feedo-video-processor  VIDEO_PROCESSOR_REGION=asia-south1
```
Cost model: no always-on server; you pay only for job runtime (≈ CPU-seconds of FFmpeg) plus the proxy's storage. Rollback: unset `VIDEO_PROCESSOR_JOB` (new uploads get no `processing` field and behave as before) and delete the job.

## Local development / tests
`VIDEO_PROCESSOR_LOCAL_CMD="node workers/video-processor/src/main.mjs"` (with `STORAGE_BUCKET`, `FFMPEG_PATH`, `FFPROBE_PATH`, `GOOGLE_APPLICATION_CREDENTIALS`) runs the same worker locally instead of the Cloud Run Job. See `scripts/qa/large-files/proc_e2e.cjs`.
