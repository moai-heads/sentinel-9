// Deterministic "virtual clock" recorder for SENTINEL-9.
// Overrides rAF + performance.now so the game advances by an exact fixed dt per
// captured frame -> no capture-rate jitter, perfectly smooth output.
// Usage: node tools/record_smooth.js <frames> <speed> <out.mp4> [seed] [fps]
const { spawn } = require("child_process");
const fs = require("fs"), http = require("http"), path = require("path");
const ROOT = path.resolve(__dirname, "..");
const FRAMES = parseInt(process.argv[2] || "900", 10);
const SPEED  = process.argv[3] || "2";
const OUT    = process.argv[4] || "/dev/shm/gv/smooth.mp4";
const SEED   = process.argv[5] || "7";
const FPS    = parseInt(process.argv[6] || "30", 10);
const PORT = 9411;
const get = p => new Promise((res, rej) => http.get({ host: "127.0.0.1", port: PORT, path: p }, r => { let d = ""; r.on("data", c => d += c); r.on("end", () => res(d)); }).on("error", rej));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SHIM = `
window.__rafReal = window.requestAnimationFrame.bind(window);
window.__rafQ = [];
window.requestAnimationFrame = cb => { window.__rafQ.push(cb); return window.__rafQ.length; };
window.__vt = performance.now();
try { Object.defineProperty(performance, "now", { value: () => window.__vt, configurable: true, writable: true }); } catch(e) {}
window.__vtSet = v => { window.__vt = v; };
window.__rafStep = () => { const cb = window.__rafQ.shift(); if (cb) { cb(window.__vt); return 1; } return 0; };
window.__painted = () => new Promise(r => window.__rafReal(() => window.__rafReal(() => r(1))));
`;

(async () => {
  const udd = "/dev/shm/rs_" + process.pid;
  const tmp = "/dev/shm/rsframes_" + process.pid;
  fs.mkdirSync(tmp, { recursive: true });
  const chrome = spawn("chromium", ["--headless=new","--no-sandbox","--disable-gpu",
    "--remote-debugging-port="+PORT,"--window-size=1280,800","--hide-scrollbars",
    "--force-device-scale-factor=1","--user-data-dir="+udd,"about:blank"],
    { stdio: "ignore", env: Object.assign({}, process.env, { TMPDIR: "/dev/shm" }) });
  let target=null;
  for (let i=0;i<100&&!target;i++){ try{ target=JSON.parse(await get("/json/list")).find(t=>t.type==="page"); }catch(e){} if(!target) await sleep(200); }
  if(!target){ console.error("no target"); chrome.kill(); process.exit(1); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id=0; const pending=new Map();
  const send=(m,p)=>new Promise(res=>{const mid=++id;pending.set(mid,res);ws.send(JSON.stringify({id:mid,method:m,params:p||{}}));});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m.result);pending.delete(m.id);}};
  await new Promise(r=>ws.onopen=r);
  await send("Runtime.enable"); await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: SHIM });
  await send("Emulation.setDeviceMetricsOverride", { width:1280, height:800, deviceScaleFactor:1, mobile:false });
  const FILE = "file://"+path.join(ROOT,"index.html")+"?autoplay=1&speed="+SPEED+"&seed="+SEED;
  await send("Page.navigate", { url: FILE });
  await sleep(1800);

  // sanity: is the game loop wired to our queue?
  const probe = await send("Runtime.evaluate", { expression: "({q:window.__rafQ.length, hasGame:!!window.__game, vt:window.__vt})", returnByValue: true });
  console.log("probe:", JSON.stringify(probe.result && probe.result.value));

  const dt = 1000 / FPS;
  const t0 = Date.now();
  for (let i = 0; i < FRAMES; i++) {
    await send("Runtime.evaluate", { expression:
      `(()=>{ window.__vt += ${dt}; const n = window.__rafStep(); return n; })()`, returnByValue: true });
    await send("Runtime.evaluate", { expression: "window.__painted()", awaitPromise: true, returnByValue: true });
    const shot = await send("Page.captureScreenshot", { format: "jpeg", quality: 88 });
    if (shot && shot.data) fs.writeFileSync(path.join(tmp, String(i).padStart(5,"0")+".jpg"), Buffer.from(shot.data,"base64"));
    if (i % 120 === 0) console.log("frame", i, "/", FRAMES, "~"+((Date.now()-t0)/1000).toFixed(0)+"s");
  }
  const elapsed = (Date.now()-t0)/1000;
  const ff = spawn("ffmpeg", ["-hide_banner","-loglevel","error","-y",
    "-framerate", String(FPS), "-i", path.join(tmp,"%05d.jpg"),
    "-vf","scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos",
    "-c:v","libx264","-pix_fmt","yuv420p","-crf","20","-preset","medium",
    "-r","30","-movflags","+faststart", OUT], { stdio:["ignore","ignore","inherit"] });
  await new Promise(r => ff.on("close", r));
  ws.close(); chrome.kill();
  fs.rmSync(tmp,{recursive:true,force:true});
  const kb = (fs.statSync(OUT).size/1024).toFixed(0);
  console.log("recorded "+FRAMES+" frames in "+elapsed.toFixed(0)+"s wall -> "+OUT+" ("+kb+" KB)");
})().catch(e=>{console.error("ERR",e);process.exit(1);});
