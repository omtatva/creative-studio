# Feedo deployment plan (for approval — nothing here has been run)

Existing project/bucket/regions only: `creative-studio-176c0`, `creative-studio-176c0.firebasestorage.app`, `asia-south1`. Production origin: `https://otdfeedo.omtatvadigitals.com` (App Hosting backend `creative-studio-backend`, rolls out from GitHub `main`). `gcloud` is **not installed on the development machine** — run the `gcloud`/`firebase` steps in Cloud Shell or after installing the Google Cloud SDK. No new infrastructure is created except the one Cloud Run Job (and its dedicated service account / Artifact Registry repo if they don't exist yet).

Principle: every step is additive and independently reversible; **feature flags stay OFF until their prerequisites are verified**; the code that ships is safe with the flags off (classic uploader, proxy-capable downloads, no processing field).

## Verified before this plan
| Check | Result |
|---|---|
| Video processor image (Node 22, Debian ffmpeg 5.1.9, libx264+aac, non-root) built and run locally; app-triggered processing in the container against real bucket + Firestore | 26/26 |
| External reviewer downloads / regression / download-history (direct 17, proxy 10) | pass |
| Firestore rules on the emulator (download_history self-only, `_external` unreadable, `upload_sessions` server-only, existing project/file/comment/workspace isolation) | 33/33; deployed-vs-working diff = 9 added lines |
| `tsc`, lint (0 errors), `next build` | pass |
| Secret scan of all 143 committed files; no server env var referenced from client code | clean |

## Sequence
Do the steps in this order; stop at the first failure. Each has its verification and rollback.

### 1. Firestore rules (additive)
```bash
firebase deploy --only firestore:rules --project creative-studio-176c0
```
Diff vs. what is deployed (ruleset `ceee14fd…`, 2026-10-23): adds `match /upload_sessions/{id} { allow read, write: if false; }` and, inside `workspaces/{workspaceId}`, `match /download_history/{uid}/items/{itemId} { allow read: if isSelf(uid) && isWorkspaceMember(workspaceId); allow write: if false; }`. Nothing else changes.
Verify: sign in → Downloads → "My download history" loads (empty state, no error). Rollback: Firebase console → Firestore → Rules → history → restore the previous release.

### 2. Runtime service account may sign URLs
```bash
RUNTIME_SA=firebase-app-hosting-compute@creative-studio-176c0.iam.gserviceaccount.com
gcloud iam service-accounts add-iam-policy-binding $RUNTIME_SA --member=serviceAccount:$RUNTIME_SA --role=roles/iam.serviceAccountTokenCreator
```
Verify (after step 5): a download response contains `"direct": true` (signing works); a `"ticket"` response means signing failed and the proxy fallback is being used. Rollback: `remove-iam-policy-binding`.

### 3. Bucket CORS (production origin only) — then verify
```bash
gcloud storage buckets update gs://creative-studio-176c0.firebasestorage.app --cors-file=docs/infra/cors.production.json
node scripts/qa/large-files/verify_cors.cjs https://otdfeedo.omtatvadigitals.com      # read-only, must end "CORS OK"
```
No wildcard origin. Methods PUT/GET/HEAD; response headers Content-Type, ETag. (Use `docs/infra/cors.testing.json` instead only while testing from a local dev server, then switch back.) Rollback: `gcloud storage buckets update gs://… --clear-cors`.

### 4. Abandoned multipart cleanup
```bash
gcloud storage buckets update gs://creative-studio-176c0.firebasestorage.app --lifecycle-file=docs/infra/lifecycle.json
```
Rollback: `--clear-lifecycle`.

### 5. Push and let App Hosting roll out (flags still OFF)
`git push origin main` (after you approve). Watch the rollout in the Firebase console (App Hosting → creative-studio-backend). With no flags set: uploads use the classic resumable uploader, no video processing, downloads are direct (falls back to the proxy if step 2 is missing).
Verify: `https://otdfeedo.omtatvadigitals.com/login` returns 200; sign in works (Firebase Auth); open a project; download a file (check `direct:true`); Downloads → history shows it as **Started**; App Hosting / Cloud Run logs show no errors. Rollback: App Hosting → roll back to the previous rollout.

### 6. Video processor Cloud Run Job (push the exact image that was verified locally)
```bash
PROJECT=creative-studio-176c0; REGION=asia-south1; BUCKET=creative-studio-176c0.firebasestorage.app
SA=feedo-video-processor@$PROJECT.iam.gserviceaccount.com
IMAGE=$REGION-docker.pkg.dev/$PROJECT/feedo/video-processor:v1

gcloud artifacts repositories describe feedo --location=$REGION || \
  gcloud artifacts repositories create feedo --repository-format=docker --location=$REGION
gcloud iam service-accounts describe $SA || gcloud iam service-accounts create feedo-video-processor

# least privilege: read originals, write ONLY under derived/
gcloud storage buckets add-iam-policy-binding gs://$BUCKET --member=serviceAccount:$SA --role=roles/storage.objectViewer
gcloud storage buckets add-iam-policy-binding gs://$BUCKET --member=serviceAccount:$SA --role=roles/storage.objectAdmin \
  --condition='expression=resource.name.contains("/derived/"),title=derived-only,description=processor writes derivatives only'
gcloud projects add-iam-policy-binding $PROJECT --member=serviceAccount:$SA --role=roles/datastore.user
gcloud iam service-accounts add-iam-policy-binding $SA --member=serviceAccount:$SA --role=roles/iam.serviceAccountTokenCreator

# image: the one verified locally (docker tag feedo-vp:local $IMAGE)
gcloud auth configure-docker $REGION-docker.pkg.dev && docker tag feedo-vp:local $IMAGE && docker push $IMAGE

gcloud run jobs create feedo-video-processor --image $IMAGE --region $REGION --service-account $SA \
  --cpu 4 --memory 8Gi --task-timeout 2h --max-retries 1 --tasks 1 --parallelism 1 \
  --set-env-vars STORAGE_BUCKET=$BUCKET,FFMPEG_THREADS=4
gcloud run jobs add-iam-policy-binding feedo-video-processor --region $REGION \
  --member=serviceAccount:firebase-app-hosting-compute@$PROJECT.iam.gserviceaccount.com --role=roles/run.developer
```
Verify with ONE test file before enabling anything: `gcloud run jobs execute feedo-video-processor --region $REGION --update-env-vars FILE_ID=<a test file id> --wait` → exit 0, `files/<id>.processing.status=ready`, derivatives under `files/<id>/derived/`, original object SHA-256 unchanged. Rollback: `gcloud run jobs delete`; nothing else depends on it while `VIDEO_PROCESSOR_JOB` is unset.

### 7. Turn the flags on (only now), then redeploy
Add to `apphosting.yaml` (or the console env) — `NEXT_PUBLIC_*` is baked at BUILD time, so it needs `availability: [BUILD, RUNTIME]`:
```yaml
env:
  - variable: NEXT_PUBLIC_MULTIPART_UPLOADS
    value: "1"
    availability: [BUILD, RUNTIME]
  - variable: VIDEO_PROCESSOR_JOB
    value: feedo-video-processor
    availability: [RUNTIME]
  - variable: VIDEO_PROCESSOR_REGION
    value: asia-south1
    availability: [RUNTIME]
```
Prerequisite gate (all must be true): step 1 rules live · step 2 signing verified (`direct:true`) · step 3 `verify_cors.cjs` prints "CORS OK" · step 6 test execution passed.
Rollback: remove the three variables and redeploy (classic uploader and no-processing return immediately; existing files are ordinary records). `DIRECT_DOWNLOADS=0` forces proxied downloads.

### 8. Real upload test in the production UI
1 GB first, then 5 GB only if stable. Record per run: source size, start/end timestamps, duration, average MB/s, retries, failed parts, GCS object size, source vs destination SHA-256, processing duration, thumbnail/proxy result, playback result, original download integrity. 10 GB / 30 GB are not claimed unless those exact files are uploaded and verified.

## Commit hygiene
The commit excludes `tsconfig.tsbuildinfo` (generated) and `.claude/settings.local.json` (local). No keys, media or test artifacts are tracked (`.env.local`, `*.log`, `.firebase` are git-ignored).
