# Workspace storage accounting — audit and proposed policy

**Authoritative counter:** `workspaces/{id}.storageBytesUsed` (Admin-SDK-write-only). It is **settled** at upload completion and **re-derived** (absolute resync = Σ `files.sizeBytes` of the workspace) after deletes — it can't drift or go negative. In-flight uploads are *reservations* in `upload_sessions` (never in the counter).

## Today (audited) — nothing below was changed in this pass

| Category | Counted today? | How | Notes |
|---|---|---|---|
| Project media — original | **Yes** | settled once at completion (`/api/uploads/complete`, `/api/files/finalize`) | real object size, never the client's |
| New file versions | **Yes** (each version separately) | same path; deleting a version resyncs | intended: every stored version costs storage |
| Temporary upload objects (multipart parts) | **No** (reserved, not used) | reservation = declared size, released on abort/expiry/fail; GCS multipart aborted | abandoned parts are a *platform* cost until aborted; lazy cleanup + recommended bucket lifecycle |
| Generated thumbnails (client `thumb.jpg` + server `derived/thumb.jpg`) | **No** | — | tens of KB |
| Generated playback proxies (`derived/proxy-720p.mp4`) | **No** | — | ≤ 3 Mbps ⇒ ≈ 1.35 GB per hour of video; typically 3–15 % of the original |
| Task attachments (client SDK, ≤ 500 MB, rules) | **No** | never reach `storageBytesUsed` | **gap**: unlimited *number* of 500 MB files per workspace is possible |
| Project cover images (≤ 10 MB) / branding images (≤ 5 MB) | **No** | — | small, fixed ceilings |
| Deleting a file | releases | `/api/files/delete` removes the whole `files/{id}/` folder (original, thumbnail, **derived/**) then resyncs | verified by test |

## Proposed policy (needs your approval before any billing-affecting change)

1. **Originals + every version: counted** (unchanged).
2. **Derivatives (thumbnails, proxies): NOT counted** against the customer's quota; they are a platform cost, bounded (≈ ≤ 15 % of originals), always deleted with their file. *Alternative:* count proxies — then `countReal("storage")` must sum them too, otherwise the absolute resync would erase them from the counter.
3. **Task attachments: recommend counting** (new: upload through a server init/finalize like media, or sweep-count on write). This **changes what customers are billed/limited on** → not applied. Until then the 500 MB-per-file ceiling is the only bound.
4. **Covers / branding: not counted** (fixed small ceilings, one per project/workspace).
5. **Temporary objects: never counted**; always reserved-then-released; add the bucket lifecycle rule for abandoned multipart uploads.
6. **Invariants to keep:** counter changes only at settlement or by absolute resync; settlement is guarded by session state (exactly once); resync sums exactly the categories that are counted.
