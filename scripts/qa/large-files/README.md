# Large-file transfer QA scripts

Real-Firebase end-to-end checks for direct-to-GCS multipart uploads, direct downloads, and the upload store. They create a **disposable workspace + accounts**
(`qa-ws-*`, `qa-*@example.com`), exercise the real routes on a running dev server (`npm run dev`, with `NEXT_PUBLIC_MULTIPART_UPLOADS=1`), and delete everything
afterwards. `purge_qa.cjs` removes leftovers if a run is killed. They use the service account from `.env.local`; **never point them at production data**.

| Script | What it proves |
|---|---|
| `mp_e2e.cjs` | init/parts/complete auth + permissions, quota reservation/settlement/release, retries, resume, pause, expiry, cancellation, idempotent completion, SHA-256 identity |
| `dl_e2e.cjs` | original-file downloads: status, headers, size, SHA-256, special names, permissions, expiry/regeneration, Range |
| `bench_up.cjs` | classic Firebase SDK vs multipart at several concurrencies (`BENCH_MB`, `BENCH_PART_MB`) |
| `store_build.mjs` + `store_run.ts` | upload store state machine (node store_build.mjs && node store_run.ts) |
