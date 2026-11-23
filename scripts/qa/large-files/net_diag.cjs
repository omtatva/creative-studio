// RAW network/protocol diagnostics, independent of Feedo's upload code: what can this machine's uplink do to GCS (and to a neutral endpoint) with N parallel streams?
// Uses curl (a separate HTTP stack, 1 connection per transfer) uploading to V4-signed URLs of disposable objects (qa-bw/), sequential scenarios only — scenarios never overlap.
//   node net_diag.cjs            -> writes net_diag.json
const { bucket, MB, crypto } = require("./qalib.cjs");
const { spawn } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path");
const OUT = path.join(__dirname, "net_diag.json");

function makeFile(file, bytes) { const fd = fs.openSync(file, "w"); const chunk = Buffer.alloc(8 * MB); for (let w = 0; w < bytes; ) { const n = Math.min(chunk.length, bytes - w); crypto.randomFillSync(chunk, 0, n); fs.writeSync(fd, chunk, 0, n); w += n; } fs.closeSync(fd); }
function curlPut(url, file, extra = []) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const p = spawn("curl", ["-s", "-o", "NUL", "-X", "PUT", "-T", file, "-w", "%{speed_upload} %{time_total} %{http_code} %{time_connect} %{time_appconnect} %{http_version}", ...extra, url], { stdio: ["ignore", "pipe", "ignore"] });
    let out = ""; p.stdout.on("data", (d) => (out += d));
    p.on("close", () => { const [speed, total, code, tcp, tls, ver] = out.trim().split(" "); resolve({ MBps: Number(speed) / MB, sec: Number(total), code: Number(code), tcp: Number(tcp), tls: Number(tls), ver, wall: (Date.now() - t0) / 1000 }); });
  });
}
function curlPost(url, file) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const p = spawn("curl", ["-s", "-o", "NUL", "-X", "POST", "--data-binary", `@${file}`, "-H", "Content-Type: application/octet-stream", "-w", "%{speed_upload} %{time_total} %{http_code}", url], { stdio: ["ignore", "pipe", "ignore"] });
    let out = ""; p.stdout.on("data", (d) => (out += d));
    p.on("close", () => { const [speed, total, code] = out.trim().split(" "); resolve({ MBps: Number(speed) / MB, sec: Number(total), code: Number(code), wall: (Date.now() - t0) / 1000 }); });
  });
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feedo-net-"));
  const results = [];
  const record = (label, streams, mbEach, rs, extra = {}) => {
    const wall = Math.max(...rs.map((r) => r.wall)); const total = streams * mbEach;
    const row = { label, streams, mbEach, totalMB: total, aggregateMBps: +(total / wall).toFixed(2), aggregateMbps: +((total / wall) * 8).toFixed(0), perStreamMBps: rs.map((r) => +r.MBps.toFixed(1)), httpCodes: [...new Set(rs.map((r) => r.code))], ...extra };
    results.push(row); fs.writeFileSync(OUT, JSON.stringify(results, null, 1)); console.log(JSON.stringify(row));
  };
  const files = {};
  for (const mb of [128, 64]) { files[mb] = path.join(dir, `f${mb}.bin`); makeFile(files[mb], mb * MB); }
  const names = []; const signed = async (i) => { const name = `qa-bw/netdiag-${Date.now()}-${i}`; names.push(name); const [u] = await bucket.file(name).getSignedUrl({ version: "v4", action: "write", expires: Date.now() + 3600_000 }); return u; };

  // GCS, HTTP/1.1 (curl here is a Schannel build without HTTP/2): 1, 2, 4, 8 streams x 128 MB
  for (const n of [1, 2, 4, 8, 1, 4]) {
    const urls = await Promise.all(Array.from({ length: n }, (_, i) => signed(i)));
    const rs = await Promise.all(urls.map((u) => curlPut(u, files[128])));
    record("GCS direct (curl, signed PUT, one connection per stream)", n, 128, rs, { tcpConnectMs: Math.round(rs[0].tcp * 1000), tlsMs: Math.round(rs[0].tls * 1000), http: rs[0].ver });
  }
  // neutral endpoint: is the cap the uplink itself or something GCS-specific?
  for (const n of [1, 4, 8]) {
    const rs = await Promise.all(Array.from({ length: n }, () => curlPost("https://speed.cloudflare.com/__up", files[64])));
    record("Cloudflare neutral upload (curl)", n, 64, rs);
  }
  for (const nme of names) await bucket.file(nme).delete({ ignoreNotFound: true }).catch(() => undefined);
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(0);
})().catch((e) => { console.error(String(e.stack || e.message).slice(0, 500)); process.exit(1); });
