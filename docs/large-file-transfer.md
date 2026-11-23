# Large-file transfer: uploads, downloads, quota (Feedo)

Status of each part is stated honestly in the final section ("What is implemented / tested").

## 1. What exists (audited, before this work)

| Fact | Finding |
|---|---|
| Bucket | `creative-studio-176c0.firebasestorage.app`, **asia-south1**, regional, uniform bucket-level access, no versioning, 7-day soft delete, **no CORS configured**, no lifecycle rules |
| Firebase Storage vs GCS | Same bucket (a Firebase Storage bucket *is* a GCS bucket). The Admin SDK (`adminStorage()`) and the web SDK address the same objects |
| Upload (before) | Browser → `firebasestorage.googleapis.com` via Firebase web SDK `uploadBytesResumable` (sequential chunks, 256 KB doubling to 16 MB, **one request in flight**). **No bytes through Next.js.** Then `POST /api/files/finalize` verifies the real object size, quota, policy and creates the Firestore record |
| Download (before) | `POST /api/files/download` authorizes and issues a 60 s single-use ticket; `GET ?t=` **streams the object through Next.js** (`Readable.toWeb(createReadStream())`). Serves the **original** `storagePath`; no Range support. Server proxy: **YES** |
| Preview / playback | `/api/files/preview` also streams through Next.js (with Range). There are no generated proxies/derivatives yet; playback serves the original |
| Records | `files/{id}`: `storagePath` = the ORIGINAL object; `thumbnailUrl` = separate thumbnail object; `url` = legacy permanent token URL (classic uploads only) |
| Quota | Counted at **finalize** (`reserveStorageBytes`): nothing is reserved while bytes are in flight |
| Task attachments / covers / branding | Client-side Firebase SDK uploads, **not counted** in workspace storage; fixed per-class ceilings in `storage.rules` |

## 2. Upload mechanism chosen: GCS XML API multipart + V4 signed part URLs

| | XML multipart (chosen) | JSON resumable | Parallel Composite Upload |
|---|---|---|---|
| Parallel parts | **Yes, natively** (parts upload independently, up to 10,000) | No (one sequential stream per session) | Yes, but N separate objects + `compose` |
| Max size | 5 TiB | 5 TiB | 5 TiB (compose limit 32 components per call → chained) |
| Browser-safe signed URL per unit | **Yes** (V4 `PUT ?partNumber&uploadId`) | Session URI is a credential-ish capability | Per-object |
| Server can verify what GCS holds | **Yes** (`ListParts` with sizes + ETags) | Query offset only | Must list N objects |
| Completion | One `POST ?uploadId` (atomic assembly) | Implicit on last byte | Compose + delete temp objects (cleanup + cost) |
| Cleanup of abandoned work | `DELETE ?uploadId` (we do it) | Session expires | Temp objects must be deleted by us |
| CORS | Needed for the PUT (see §6) | Needed | Needed |

Verified against the real bucket (not assumed): initiate / V4-signed part PUT / ListParts (returns `Size`) / complete / byte-identical object all work; an expired signature is answered with **HTTP 400 `ExpiredToken`** (not 403) — the engine maps that to "request a fresh URL".

### Flow (feature flag `NEXT_PUBLIC_MULTIPART_UPLOADS=1`)

1. `POST /api/uploads/init` — verifies token, project belongs to workspace, `canWrite` (project role), not a disabled member, Feature Access (`files.upload` / `files.uploadVersion`), supported type, the **effective per-file policy** (fails closed), reserves quota, creates the GCS multipart upload, stores a **server-only** `upload_sessions/{id}`. Idempotent per user+project+file identity (same file again → same session, no second reservation).
2. Browser slices with `File.slice()` and asks `POST /api/uploads/parts` for signed URLs (session owner only), then `PUT`s parts **directly to `storage.googleapis.com`** with bounded concurrency, per-part retry (exponential backoff + full jitter), 403/ExpiredToken → fresh URL, finished parts never re-sent.
3. `POST /api/uploads/complete` — the server lists what GCS holds (client claims are never trusted), requires every part with the exact expected size, assembles, verifies the object exists, carries our session tag, and has exactly the declared size; re-checks the live file policy and the caller's access; then **settles** (reservation → real usage + file record) in ONE transaction guarded by session state, so it happens exactly once. Repeated/concurrent completes return the same file.
4. Cancel/abort → GCS upload aborted, reservation released. Abandoned sessions are swept lazily (before the next reservation in that workspace).

File bytes never touch Next.js, Cloud Run or any app server.

### Quota model (reserve → settle → release)
`available = limit − storageBytesUsed − Σ reservedBytes(active|completing sessions)` is evaluated **inside the transaction that creates the session**, so concurrent inits cannot over-claim. A session's reservation disappears when it leaves `active|completing` (completed/aborted/expired/failed) — there is no counter that can drift or go negative. Declared size must equal the final object size.

### Chunk size / concurrency
Defaults are **provisional**: 64 MB parts, 4 concurrent (`NEXT_PUBLIC_UPLOAD_PART_MB`, `NEXT_PUBLIC_UPLOAD_CONCURRENCY`). The server accepts 5 MiB–5 GiB (and enforces ≥ ceil(size/10 000) so 100 GB fits in 10 000 parts). They must be tuned from benchmarks on a fast network; see the final report for what could and could not be measured.

## 3. Downloads (original-quality, direct)

`POST /api/files/download` authorizes (token, project access, Feature Access `files.download`), resolves the **original** `storagePath` from the record (never from the client), and returns a **2-minute V4 signed GET URL** for that one object with `response-content-disposition: attachment; filename=…; filename*=UTF-8''…` and the stored content type baked into the signature. The browser downloads straight from GCS: no app-server proxy, GCS handles HTTP Range (verified 206), and a download can continue after the URL's TTL because the TTL only governs the request start. A new URL is issued only after re-authorization. Falls back to the ticketed proxy if signing is unavailable; kill switch `DIRECT_DOWNLOADS=0`.
Thumbnails and any future proxies are separate objects; the default download is always the original. External-reviewer tickets still use the proxied stream (unchanged).
Browsers can resume a *paused* download in-session; resuming after a browser restart is not guaranteed and is not claimed.

## 4. Persistence & recovery
IndexedDB (`feedo-uploads`) stores identifiers only: session id, file/workspace/project ids, name, size, mtime, part layout, completed part numbers, hashes of the file's first/last MiB, expiry. **No tokens, no signed URLs, no bytes.** After a refresh the upload returns as *paused — select the same file*; the file is checked against the stored identity (a different file is refused), the server is asked which parts it holds, and only missing parts are sent. If the session expired, the user is told and starts again (never a silent restart).

## 5. Schema changes
- New server-only collection `upload_sessions/{sessionId}` (no client access — Firestore default-deny; add an explicit `allow read, write: if false` rule when you next deploy rules).
- `files/{id}.uploadMethod: "resumable" | "multipart"` (new records). Multipart records have `url: ""` (no permanent URL). `storagePath` layout unchanged: `workspaces/{ws}/projects/{project}/files/{fileId}/{name}`.
- Workspace usage is still `workspaces/{id}.storageBytesUsed`; reservations live only in sessions.

## 6. Infrastructure changes you must make (not applied by the code)

**Bucket CORS** (required for browser PUT to signed URLs; the bucket has none today):
```json
[{ "origin": ["https://otdfeedo.omtatvadigitals.com"],
   "method": ["PUT", "GET", "HEAD"],
   "responseHeader": ["Content-Type", "ETag"],
   "maxAgeSeconds": 3600 }]
```
`gcloud storage buckets update gs://creative-studio-176c0.firebasestorage.app --cors-file=cors.json`

**IAM**: the App Hosting / Cloud Run runtime service account needs (a) object admin on the bucket (already used by the Admin SDK), and (b) **`roles/iam.serviceAccountTokenCreator` on itself** so `getSignedUrl` can sign via IAM `signBlob` (no key file in production). Without (b) signing fails: downloads fall back to the proxy, multipart init fails with a clear error.

**Lifecycle** (recommended): add a rule to abort incomplete multipart uploads after N days as a safety net behind the app's own lazy cleanup (verify the exact lifecycle condition supported for your bucket before relying on it).

## 7. Rollback
Set `NEXT_PUBLIC_MULTIPART_UPLOADS` to anything but `1` (client AND `/api/uploads/*` stop; the classic Firebase uploader + `/api/files/finalize` take over) and `DIRECT_DOWNLOADS=0` (proxied downloads). Nothing was removed. Files uploaded by either path are ordinary `files` records. Active multipart sessions simply expire.

## 8. Not implemented (explicit)
Background video processing (thumbnail/proxy/codec metadata worker, `Processing` / `Ready` states): needs a Cloud Run job / Pub-Sub trigger and ffmpeg infrastructure that does not exist and must not be improvised. Preview/playback still streams the original through Next.js. Task-attachment/cover/branding quota accounting is unchanged (gap reported). Part-size/concurrency defaults are not benchmark-tuned.
