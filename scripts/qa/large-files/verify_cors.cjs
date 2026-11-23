// READ-ONLY CORS verification for browser multipart uploads: sends the exact preflight a browser sends (OPTIONS with Origin + Access-Control-Request-Method: PUT) to a V4-signed part URL
// for a throwaway, never-created object path, and checks what the bucket answers for each origin. Creates/modifies nothing.
//   node verify_cors.cjs https://otdfeedo.omtatvadigitals.com [more allowed origins...]       (env DENIED_ORIGIN overrides the origin that must be refused)
const { bucket, check, state } = require("./qalib.cjs");
const allowed = process.argv.slice(2);
if (!allowed.length) { console.error("Pass the origin(s) that must be allowed."); process.exit(2); }
const denied = process.env.DENIED_ORIGIN || "https://evil.example.com";

(async () => {
  const [url] = await bucket.file(`qa-bw/cors-probe-${Date.now()}`).getSignedUrl({ version: "v4", action: "write", expires: Date.now() + 120_000, queryParams: { partNumber: "1", uploadId: "probe" } });
  const preflight = async (origin, method = "PUT") => {
    const r = await fetch(url, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": method } });
    await r.arrayBuffer().catch(() => undefined);
    return { status: r.status, allowOrigin: r.headers.get("access-control-allow-origin"), allowMethods: r.headers.get("access-control-allow-methods"), vary: r.headers.get("vary") };
  };
  for (const o of allowed) {
    const p = await preflight(o);
    check(`preflight PUT from ${o} is allowed (Access-Control-Allow-Origin echoes the origin, PUT in allowed methods)`, [p.status < 300, p.allowOrigin === o, /PUT/.test(p.allowMethods || "")], [true, true, true]);
  }
  const d = await preflight(denied);
  check(`preflight from a NON-listed origin (${denied}) is refused (no Access-Control-Allow-Origin)`, [d.allowOrigin === null || d.allowOrigin === undefined, d.allowOrigin === "*"], [true, false]);
  const star = await preflight(allowed[0]);
  check("no wildcard: Access-Control-Allow-Origin is never *", star.allowOrigin !== "*", true);
  console.log(state.failed ? `\n${state.failed} FAILED — CORS is NOT (correctly) configured for browser multipart upload` : "\nCORS OK for the listed origins");
  process.exit(state.failed ? 1 : 0);
})().catch((e) => { console.error(String(e.message).slice(0, 300)); process.exit(1); });
