import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../src");
fs.mkdirSync("store_h", { recursive: true });
const conv = (rel, out) => {
  let s = fs.readFileSync(`${SRC}/${rel}`, "utf8").replace(/\r\n/g, "\n");
  s = s.replace('from "@/services/fileService"', 'from "./fileServiceStub.ts"');
  s = s.replace(/from "@\/lib\/uploads\/(\w+)"/g, 'from "./$1.ts"');
  s = s.replace(/import type \{[^}]*\} from "@\/types\/[^"]+";\n/g, "");
  s = s.replace(/import type \{ ([^}]*) \} from "\.\/(\w+)\.ts"/g, 'import type { $1 } from "./$2.ts"');
  fs.writeFileSync(`store_h/${out}`, s);
};
conv("lib/uploads/uploadStore.ts", "uploadStore.ts");
conv("lib/uploads/uploadMetrics.ts", "uploadMetrics.ts");
conv("lib/uploads/multipartEngine.ts", "multipartEngine.ts");
conv("lib/uploads/uploadPersistence.ts", "uploadPersistence.ts");
fs.writeFileSync("store_h/fileServiceStub.ts", `
export const calls: any[] = [];
export const controls: Record<string, any> = {};
export let multipart = true;
export const setMultipart = (v: boolean) => { multipart = v; };
export const isMultipartEnabled = () => multipart;
export async function uploadProjectFile(workspaceId: string, projectId: string, file: any, actor: any, options: any) {
  return new Promise<string>((resolve, reject) => {
    const c: any = { workspaceId, projectId, file, options, cancelled: false, paused: false };
    c.progress = (b: number) => options.onProgress(Math.round((b / file.size) * 100), b, file.size);
    c.finalize = () => options.onPhase?.("finalizing");
    c.engine = (s: any) => options.onEngine?.(s);
    c.resolve = resolve; c.reject = reject;
    options.onCancelReady?.(() => { c.cancelled = true; reject(Object.assign(new Error("canceled"), { code: "storage/canceled" })); });
    options.onControlsReady?.({ pause: () => { c.paused = true; }, resume: () => { c.paused = false; c.resumed = (c.resumed || 0) + 1; } });
    calls.push(c); controls[file.name] = c;
  });
}
`);
console.log("built store_h");
