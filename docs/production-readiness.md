# Production readiness — configuration audit and Cloud Run Job plan

Audited 2026-11-23 with READ-ONLY probes (`scratchpad/prod_audit*.cjs`, `rules_probe.cjs`, `bucket_audit.cjs`). **Nothing was changed, deployed or applied.** Project `creative-studio-176c0`, bucket `creative-studio-176c0.firebasestorage.app` (asia-south1).

## Phase 3 — checklist

### Already correct (verified)
| Item | Evidence |
|---|---|
| Bucket and planned job in the same region | Bucket `ASIA-SOUTH1`, class REGIONAL; the job/region in this plan is `asia-south1` |
| Uniform bucket-level access on, public access prevention inherited | Bucket metadata |
| V4 URL signing works with a service-account key | Local key signs; the same code path is used by direct downloads |
| Soft delete retention 7 days | Bucket metadata (deleted originals are recoverable for 7 d; note it still bills) |
| Feature flags default OFF and every new path has a fallback | `NEXT_PUBLIC_MULTIPART_UPLOADS` is on only when exactly `"1"` (else classic resumable upload); `VIDEO_PROCESSOR_JOB` unset ⇒ no processing field, files behave as before; `DIRECT_DOWNLOADS=0` ⇒ ticketed proxy download; if URL signing fails ⇒ proxy download automatically |
| `apphosting.yaml` sets NO flags | So production runs with multipart OFF and no processor until you set them |
| Repo Firestore rules deny clients for `upload_sessions` and `download_tickets`; `download_history` is self-read-only | `firebase-config/firestore.rules` |

### Missing / not applied
| # | Item | Finding | Impact |
|---|---|---|---|
| 1 | **Bucket CORS** | `cors: null`. A real browser `fetch` to a signed `storage.googleapis.com` URL fails (`TypeError: Failed to fetch`) — reproduced in the browser pane. | Direct-to-GCS **multipart upload from the browser cannot work** (PUT of each part is cross-origin). Anchor-based direct downloads are NOT affected (navigation, not fetch). **Do not enable `NEXT_PUBLIC_MULTIPART_UPLOADS` before this is applied.** |
| 2 | **Incomplete-multipart cleanup** | `lifecycle: null`. | GCS discards abandoned XML multipart uploads on its own after 7 days; an explicit rule shortens that. App-side expiry sweep already releases quota reservations. Low risk. |
| 3 | **Deployed Firestore rules are stale** | Deployed release `cloud.firestore` dated 2026-10-23 contains neither `upload_sessions` nor `download_history`. | `upload_sessions`: safe (no rule = clients denied; server uses Admin SDK). **`download_history`: the new "My download history" tab will show "Couldn't load your download history" until the rules are deployed** (history is still being recorded server-side). |
| 4 | **Runtime SA Token Creator** | Cannot be read with the current key (IAM `getIamPolicy` 403). | If missing in production, direct downloads silently fall back to the ticket proxy (still correct, but bytes pass through the app). Multipart initiate/list/complete use an OAuth token, not signing; **per-part URLs need signing**, so multipart also needs this. |
| 5 | **Cloud Run Job** | Not verifiable (`run.jobs.list` 403 with the current key); no job is known to exist. | Processing is simply off (`VIDEO_PROCESSOR_JOB` unset). |
| 6 | Artifact Registry repo `feedo` | Not verified. | Needed by the build step below. |
| 7 | Firestore TTL policy on `download_tickets`/`preview_tickets` `expireAt` | Not enabled (pre-existing). | Expired tickets accumulate harmlessly. |

### Requires your approval (exact commands — none run)
```bash
PROJECT=creative-studio-176c0; BUCKET=creative-studio-176c0.firebasestorage.app
RUNTIME_SA=firebase-app-hosting-compute@$PROJECT.iam.gserviceaccount.com

# 0. Verify first (read-only) — what is currently true
gcloud storage buckets describe gs://$BUCKET --format="yaml(cors_config,lifecycle_config)"
gcloud iam service-accounts get-iam-policy $RUNTIME_SA
gcloud firestore databases describe --database="(default)" >/dev/null && firebase firestore:rules:get 2>/dev/null | head -5

# 1. CORS (needed ONLY for browser multipart upload). Production origin confirmed live: https://otdfeedo.omtatvadigitals.com (no staging origin exists).
#    While testing from a local dev server against this bucket use docs/infra/cors.testing.json (adds http://localhost:3000), then switch to production-only.
gcloud storage buckets update gs://$BUCKET --cors-file=docs/infra/cors.production.json
node scripts/qa/large-files/verify_cors.cjs https://otdfeedo.omtatvadigitals.com     # read-only; must print "CORS OK"

# 2. Abandoned multipart uploads
gcloud storage buckets update gs://$BUCKET --lifecycle-file=docs/infra/lifecycle.json

# 3. Let the runtime SA sign (per-part upload URLs + direct downloads)
gcloud iam service-accounts add-iam-policy-binding $RUNTIME_SA \
  --member=serviceAccount:$RUNTIME_SA --role=roles/iam.serviceAccountTokenCreator

# 4. Deploy the Firestore rules in the repo (adds download_history + upload_sessions)
firebase deploy --only firestore:rules --project $PROJECT
```
Rollback: CORS/lifecycle — `gcloud storage buckets update gs://$BUCKET --clear-cors` / `--clear-lifecycle`; IAM — `remove-iam-policy-binding`; rules — redeploy the previous release from the Firebase console history.

**Recommended rollout order:** rules (4) → Token Creator (3) → CORS (1) → lifecycle (2) → enable `NEXT_PUBLIC_MULTIPART_UPLOADS=1` for a test workspace/build → watch → enable the processor (Phase 4).

## Phase 4 — Cloud Run Job (video processor)

### Image verification
- **Built and verified locally 2026-11-23** (`docker build workers/video-processor`): ffmpeg/ffprobe 5.1.9, libx264 + aac encoders, a real 1080p transcode, runs as non-root `node`; the app-triggered processing path (26 checks incl. original SHA-256 unchanged, separate thumb/proxy, idempotency) passes with the worker running in this image against the real bucket and Firestore. Building it caught a real defect (Node 20 base image) — fixed, lockfile added.
- The Dockerfile now has a **build-time gate** (`ffmpeg -version && ffprobe -version` + libx264 and aac encoder checks) so a broken image fails `gcloud builds submit`, never a production job.
- The worker itself was tested end to end against the real bucket and Firestore with a local FFmpeg 6.1.1 (26/26 checks). That proves the logic, not the Debian build of FFmpeg.
- Suggested smoke test once Docker runs (local, no push):
  `docker build -t feedo-vp workers/video-processor && docker run --rm feedo-vp ffprobe -version` and `docker run --rm --entrypoint ffmpeg feedo-vp -f lavfi -i testsrc2=size=1920x1080:rate=30 -t 3 -c:v libx264 -f null -`.
- Bucket/Firestore access from inside the deployed job can only be proven after deployment with the job's own service account (a dry run on one test file, below).

### Deployment plan
| Setting | Value | Why |
|---|---|---|
| Image / region | `asia-south1-docker.pkg.dev/creative-studio-176c0/feedo/video-processor`, region `asia-south1` | Same region as the bucket ⇒ no egress charge, lowest latency |
| Job | `feedo-video-processor`, `--tasks 1 --parallelism 1`, triggered once per file (`FILE_ID` override) | One file per execution; scale-to-zero |
| Service account | dedicated `feedo-video-processor@…` (not the default compute SA) | Least privilege |
| IAM — Firestore | `roles/datastore.user` (project) | Claim/lease/status writes on `files/{id}` |
| IAM — Storage (**original preservation**) | `roles/storage.objectViewer` on the bucket **plus** `roles/storage.objectAdmin` with condition `resource.name.contains("/derived/")` | The job can read originals but is **technically unable to write or delete anything outside `derived/`**, so an original cannot be modified even by a bug |
| IAM — signing | `roles/iam.serviceAccountTokenCreator` on itself | Signs the short-lived read URL FFmpeg streams from |
| Run trigger | App Hosting runtime SA gets `roles/run.developer` **on this one job only** | Can start the job with env overrides, nothing else |
| Env vars | `STORAGE_BUCKET=creative-studio-176c0.firebasestorage.app`, `FFMPEG_THREADS=4` (job); `VIDEO_PROCESSOR_JOB=feedo-video-processor`, `VIDEO_PROCESSOR_REGION=asia-south1` (App Hosting) | `FILE_ID` is injected per run; credentials come from the job's service account (no key file) |
| Resources | 4 vCPU / 8 GiB; task timeout 2 h (6 h only if you accept multi-hour sources); `--max-retries 1` | The proxy is built on memory-backed temp: ~1.35 GB per hour of video at 3 Mbps |
| Retry | Cloud Run retries once on non-zero exit; the worker also caps attempts at 3 in Firestore; a person can press Retry | Bounded; no loop |
| Duplicate-job protection | Firestore transaction claim + 15-min lease (heartbeat every 5 min); `ready` ⇒ no-op; concurrent workers ⇒ exactly one proceeds (tested) | A double trigger, a Cloud Run retry or a retried request cannot produce duplicate work or duplicate derivatives |
| Failure handling | Partial proxy deleted; scrubbed message (no URL/path) stored; status `failed` + Retry; corrupt input ⇒ final `unsupported`; file stays downloadable and playable from the original | Tested |
| Original preservation | Worker only reads `storagePath`; derivatives are separate deterministic objects under `files/{id}/derived/`; downloads/external reviewers resolve only `storagePath`; enforced a second time by the IAM condition above | Tested (SHA-256 identical before/after) |

Commands: see `docs/video-processing.md` → "Deploy". Apply the two refinements above (objectViewer + conditioned objectAdmin; 2 h timeout) instead of the broader `objectAdmin` shown there when you approve:
```bash
gcloud storage buckets add-iam-policy-binding gs://$BUCKET --member=serviceAccount:$SA --role=roles/storage.objectViewer
gcloud storage buckets add-iam-policy-binding gs://$BUCKET --member=serviceAccount:$SA --role=roles/storage.objectAdmin \
  --condition='expression=resource.name.contains("/derived/"),title=derived-only,description=processor writes derivatives only'
```
**Post-deploy verification (one test video, then enable for everyone):** upload a 20-30 s clip in a test workspace → `processing.status` goes `queued → processing → ready` → proxy exists under `derived/` → original SHA-256 unchanged → download returns the original → `gcloud run jobs executions list --job feedo-video-processor` shows one execution, exit 0.
Rollback: unset `VIDEO_PROCESSOR_JOB` (new uploads are untouched) → delete the job → delete `derived/` objects if wanted (originals are never touched).
