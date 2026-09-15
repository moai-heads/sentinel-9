// Real-time CDP playtest: boots the game headless, autoplays, logs state, saves screenshots.
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const FILE = "file://" + path.join(ROOT, "index.html") + "?autoplay=1";
const OUTDIR = process.argv[2] || path.join(ROOT, "captures");
const SECONDS = parseInt(process.argv[3] || "50", 10);
fs.mkdirSync(OUTDIR, { recursive: true });

const PORT = 9331;
const get = p => new Promise((res, rej) => http.get({ host: "127.0.0.1", port: PORT, path: p }, r => { let d = ""; r.on("data", c => d += c); r.on("end", () => res(d)); }).on("error", rej));
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const chrome = spawn("chromium", [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--remote-debugging-port=" + PORT, "--window-size=1280,800",
    "--hide-scrollbars", "--force-device-scale-factor=1",
    "--user-data-dir=/tmp/nexus_pt_" + process.pid,
    "about:blank"
  ], { stdio: "ignore" });

  let target = null;
  for (let i = 0; i < 80 && !target; i++) { try { target = JSON.parse(await get("/json/list")).find(t => t.type === "page"); } catch (e) {} if (!target) await sleep(250); }
  if (!target) { console.error("no target"); chrome.kill(); process.exit(1); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0; const pending = new Map(); const problems = [];
  const send = (m, p) => new Promise(res => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method: m, params: p || {} })); });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
    if (m.method === "Runtime.exceptionThrown") problems.push("EXC: " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    if (m.method === "Log.entryAdded" && m.params.entry.level === "error") problems.push("ERR: " + m.params.entry.text);
  };
  await new Promise(r => ws.onopen = r);
  await send("Runtime.enable"); await send("Log.enable"); await send("Page.enable");
  await send("Page.navigate", { url: FILE });
  await sleep(1200);

  const shot = async name => { const s = await send("Page.captureScreenshot", { format: "png" }); if (s && s.data) fs.writeFileSync(path.join(OUTDIR, name), Buffer.from(s.data, "base64")); };
  const evalState = async () => {
    const r = await send("Runtime.evaluate", { expression: `(()=>{const g=window.__game; if(!g)return null; const s=g.state; return JSON.stringify({cy:s.cycles,k:s.kernels,trace:+s.trace.toFixed(1),idx:s.targetIdx,deep:s.deepest,killed:s.killed,hp:+s.hp.toFixed(0),dps:+g.dps().toFixed(1),t:+s.t.toFixed(1),lv:s.lv})})()`, returnByValue: true });
    return r && r.result && r.result.value ? JSON.parse(r.result.value) : null;
  };

  const timeline = [];
  const frames = [];
  for (let t = 0; t < SECONDS; t += 2) {
    const st = await evalState();
    if (st) { timeline.push(st); if (t % 6 === 0) { const nm = "pt_" + String(t).padStart(2, "0") + "s.png"; await shot(nm); frames.push(nm); } }
    await sleep(2000);
  }
  const fin = await evalState();
  await shot("pt_final.png");

  fs.writeFileSync(path.join(OUTDIR, "playtest.json"), JSON.stringify({ timeline, final: fin, problems }, null, 1));
  console.log("=== TIMELINE ===");
  for (const r of timeline) console.log(`t=${String(r.t).padStart(5)}s  cy=${String(Math.floor(r.cy)).padStart(9)}  dps=${String(r.dps).padStart(8)}  trace=${String(r.trace).padStart(5)}  target=${r.idx}(${r.deep})  kills=${r.killed}  lv=${JSON.stringify(r.lv)}`);
  console.log("=== FINAL ===", JSON.stringify(fin));
  console.log("=== PROBLEMS ===", problems.length ? problems.join("\n") : "(none)");
  console.log("=== FRAMES ===", frames.join(" "));
  ws.close(); chrome.kill();
})().catch(e => { console.error("HARNESS ERROR", e); process.exit(1); });
