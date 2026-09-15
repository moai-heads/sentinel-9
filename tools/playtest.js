console.log("[harness boot]");
// Real-time CDP playtest for SENTINEL-9 // NET CLEANSE
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUTDIR = process.argv[2] || path.join(ROOT, "captures");
const SECONDS = parseInt(process.argv[3] || "60", 10);
const SPEED = process.argv[4] || "4";
const FILE = "file://" + path.join(ROOT, "index.html") + "?autoplay=1&speed=" + SPEED;
fs.mkdirSync(OUTDIR, { recursive: true });

const PORT = 9331;
const get = p => new Promise((res, rej) => http.get({ host: "127.0.0.1", port: PORT, path: p }, r => { let d = ""; r.on("data", c => d += c); r.on("end", () => res(d)); }).on("error", rej));
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const chrome = spawn("chromium", [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--remote-debugging-port=" + PORT, "--window-size=1280,800",
    "--hide-scrollbars", "--force-device-scale-factor=1",
    "--user-data-dir=/tmp/sentinel_pt_" + process.pid, "about:blank"
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
    const r = await send("Runtime.evaluate", { expression: `(()=>{const g=window.__game; if(!g)return null; const s=g.state;
      const unlocked=g.NODES.filter(n=>n.unlocked).length;
      return JSON.stringify({t:+s.t.toFixed(1),compute:Math.floor(s.compute),memory:Math.floor(s.memory),cleaned:+s.cleaned.toFixed(1),
        sector:s.sector,integrity:+s.integrity.toFixed(0),threats:s.threats.length,kills:s.kills,checksums:s.checksums,crashes:s.crashes,
        unlocked,levels:g.NODES.map(n=>n.level),mmods:s.mlv,sel:s.sel,rate:+g.NODES.reduce((a,n)=>a+(n.unlocked?g.nodeRate(n):0),0).toFixed(1)})})()`, returnByValue: true });
    return r && r.result && r.result.value ? JSON.parse(r.result.value) : null;
  };

  const timeline = []; const frames = [];
  for (let t = 0; t < SECONDS; t += 2) {
    const st = await evalState();
    if (st) { timeline.push(st); if (t % 8 === 0) { const nm = "pt_" + String(t).padStart(2, "0") + "s.png"; await shot(nm); frames.push(nm); } }
    await sleep(2000);
  }
  const fin = await evalState();
  await shot("pt_final.png");

  fs.writeFileSync(path.join(OUTDIR, "playtest.json"), JSON.stringify({ timeline, final: fin, problems }, null, 1));
  console.log("=== TIMELINE (speed=" + SPEED + ") ===");
  for (const r of timeline) console.log(`t=${String(r.t).padStart(6)}s  C=${String(r.compute).padStart(8)}  M=${String(r.memory).padStart(8)}  cln=${String(r.cleaned).padStart(5)}%  sec=${r.sector}  int=${String(r.integrity).padStart(3)}  thr=${r.threats}  kills=${String(r.kills).padStart(4)}  nodes=${r.unlocked}/10  rate=${r.rate}/s  sel=${r.sel}  chk=${r.checksums}  crash=${r.crashes}`);
  console.log("=== FINAL ===", JSON.stringify(fin));
  console.log("=== PROBLEMS ===", problems.length ? problems.slice(0,10).join("\n") : "(none)");
  console.log("=== FRAMES ===", frames.join(" "));
  ws.close(); chrome.kill();
})().catch(e => { console.error("HARNESS ERROR", e); process.exit(1); });
