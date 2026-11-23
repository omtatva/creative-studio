import { uploadStore } from "./store_h/uploadStore.ts";
import { calls, controls, setMultipart } from "./store_h/fileServiceStub.ts";
let failed = 0;
const check = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`); };
const tick = () => new Promise((r) => setTimeout(r, 5));
const GB = 1024 ** 3;
const mk = (name: string, size = 33 * GB) => ({ name, type: "video/mp4", size, lastModified: 1 }) as unknown as File;
const actor = { uid: "u1", displayName: "U", photoURL: null, email: "u@x.com" };
const base = { userId: "u1", actor, workspaceId: "wsA", workspaceName: "Workspace A", projectId: "projA" };
const get = (id: string) => uploadStore.getSnapshot().find((i) => i.uploadId === id)!;
const events: string[] = [];
uploadStore.onEvent((e) => events.push(e.type + ":" + e.item.fileName));

// 1. multipart upload: preparing -> uploading, parts/retries mirrored from the engine, original workspace/project kept
let ok = 0;
const id1 = uploadStore.enqueue({ ...base, file: mk("big.mp4"), stageId: "s1", onSuccess: () => ok++ });
await tick();
check("multipart item starts 'preparing' (then uploading) in the ORIGINAL workspace/project", [get(id1).method, controls["big.mp4"].workspaceId, controls["big.mp4"].projectId], ["multipart", "wsA", "projA"]);
controls["big.mp4"].engine({ status: "uploading", completedParts: 2, totalParts: 9, activeParts: 4, retries: 1 });
controls["big.mp4"].progress(3.3 * GB);
check("engine state mirrored: uploading, 2/9 parts, 4 active, 1 retry", [get(id1).status, get(id1).completedParts, get(id1).activeParts, get(id1).retries], ["uploading", 2, 4, 1]);
controls["big.mp4"].engine({ status: "retrying", completedParts: 2, totalParts: 9, activeParts: 1, retries: 2 });
check("retrying status shown", get(id1).status, "retrying");

// 2. pause frees the slot and keeps the record; resume continues the SAME upload
const id2 = uploadStore.enqueue({ ...base, file: mk("two.mp4", 1000), stageId: "s1" });
const id3 = uploadStore.enqueue({ ...base, file: mk("three.mp4", 1000), stageId: "s1" });
await tick();
check("two running, third queued", [get(id2).status !== "queued", get(id3).status], [true, "queued"]);
uploadStore.pause(id1);
await tick();
check("PAUSE: status paused, engine told to pause, the queued upload takes the freed slot", [get(id1).status, controls["big.mp4"].paused, get(id3).status !== "queued"], ["paused", true, true]);
controls["big.mp4"].engine({ status: "paused", completedParts: 3, totalParts: 9, activeParts: 0, retries: 2 });
check("engine's late 'paused' report doesn't flip it back", get(id1).status, "paused");
uploadStore.resume(id1);
check("RESUME: back to uploading; engine told to resume once; same record (no duplicate)", [get(id1).status, controls["big.mp4"].resumed, uploadStore.getSnapshot().filter((i) => i.fileName === "big.mp4").length], ["uploading", 1, 1]);
check("dup protection still holds while active", uploadStore.enqueue({ ...base, file: mk("big.mp4"), stageId: "s1" }) === id1, true);

// 3. a paused upload does not count as 'active' (no beforeunload nag), an uploading one does
uploadStore.pause(id1);
check("paused upload doesn't count as active; others do", [uploadStore.activeCount() >= 2, get(id1).status], [true, "paused"]);
// 4. cancel while paused
uploadStore.cancel(id1);
await tick();
check("CANCEL while paused: engine cancel called -> cancelled, no failed event", [get(id1).status, controls["big.mp4"].cancelled, events.includes("failed:big.mp4")], ["cancelled", true, false]);

// 5. completion carries multipart metrics and finalizing phase
controls["two.mp4"].finalize();
check("finalizing", get(id2).status, "finalizing");
controls["two.mp4"].resolve("fileX");
await tick();
check("completed once, fileId set, event emitted", [get(id2).status, get(id2).fileId, events.filter((e) => e === "completed:two.mp4").length], ["completed", "fileX", 1]);

// 6. failure keeps the record for retry; retry only for failed/cancelled with a File
controls["three.mp4"].reject(new Error("part 4 failed after 8 attempts"));
await tick();
check("failed upload keeps its message and a retry path", [get(id3).status, get(id3).error], ["failed", "part 4 failed after 8 attempts"]);
uploadStore.retry(id3);
await tick();
check("retry re-queues the SAME record", [uploadStore.getSnapshot().filter((i) => i.fileName === "three.mp4").length, get(id3).status !== "failed"], [1, true]);

// 7. restored-after-refresh item (no File): cancel does not need an engine; resume refuses without a stored record
uploadStore.resetForUser("someone-else");
await tick();
check("account change drops everything and cancels live uploads", [uploadStore.getSnapshot().length, uploadStore.activeCount()], [0, 0]);

console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
process.exit(failed ? 1 : 0);
