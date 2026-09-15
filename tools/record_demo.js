// Headless CDP recorder for SENTINEL-9 -> mp4, real-time accurate.
// Captures timestamped frames, then encodes with the measured average fps
// (and writes a .frames.json sidecar so timing can be re-derived).
// Usage: node tools/record_demo.js <seconds> <speed> <outfile> [seed]
const { spawn } = require("child_process");
const fs = require("fs"), http = require("http"), path = require("path");
const ROOT = path.resolve(__dirname, "..");
const SECONDS = parseFloat(process.argv[2] || "40");
const SPEED = process.argv[3] || "3";
const OUT = process.argv[4] || "/root/shots/demo.mp4";
const SEED = process.argv[5] || "7";
const PORT = 9344;
const get = p => new Promise((res, rej) => http.get({ host: "127.0.0.1", port: PORT, path: p }, r => { let d = ""; r.on("data", c => d += c); r.on("end", () => res(d)); }).on("error", rej));
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const udd = "/dev/shm/demo_" + process.pid;
  const tmp = "/dev/shm/demoframes_" + process.pid;
  fs.mkdirSync(tmp, { recursive: true });
  const chrome = spawn("chromium", ["--headless=new","--no-sandbox","--disable-gpu",
    "--remote-debugging-port="+PORT,"--window-size=1280,800","--hide-scrollbars",
    "--force-device-scale-factor=1","--user-data-dir="+udd,"about:blank"],
    { stdio: "ignore", env: Object.assign({}, process.env, { TMPDIR: "/dev/shm" }) });
  let target=null;
  for (let i=0;i<80&&!target;i++){ try{ target=JSON.parse(await get("/json/list")).find(t=>t.type==="page"); }catch(e){} if(!target) await sleep(250); }
  if(!target){ console.error("no target"); chrome.kill(); process.exit(1); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id=0; const pending=new Map();
  const send=(m,p)=>new Promise(res=>{const mid=++id;pending.set(mid,res);ws.send(JSON.stringify({id:mid,method:m,params:p||{}}));});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m.result);pending.delete(m.id);}};
  await new Promise(r=>ws.onopen=r);
  await send("Runtime.enable"); await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride",{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  const FILE="file://"+path.join(ROOT,"index.html")+"?autoplay=1&speed="+SPEED+"&seed="+SEED;
  await send("Page.navigate",{url:FILE});
  await sleep(1600);
  // capture loop: keep as fast as we can; store frames + wall-clock timestamps
  const t0 = Date.now();
  const deadline = t0 + SECONDS*1000;
  const stamps = [];
  while (Date.now() < deadline) {
    const shot = await send("Page.captureScreenshot",{format:"jpeg",quality:88});
    if (shot && shot.data) {
      const idx = stamps.length;
      fs.writeFileSync(path.join(tmp, String(idx).padStart(5,"0")+".jpg"), Buffer.from(shot.data,"base64"));
      stamps.push(Date.now()-t0);
    }
  }
  const elapsed = (Date.now()-t0)/1000;
  const n = stamps.length;
  const fps = Math.max(1, n/elapsed);
  // encode real-time: fps = frames / wall-seconds
  const ff = spawn("ffmpeg", ["-hide_banner","-loglevel","error","-y",
    "-framerate", fps.toFixed(4), "-i", path.join(tmp,"%05d.jpg"),
    "-vf","scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos",
    "-c:v","libx264","-pix_fmt","yuv420p","-crf","23","-preset","veryfast",
    "-r","30","-movflags","+faststart", OUT], { stdio:["ignore","ignore","inherit"] });
  await new Promise(r => ff.on("close", r));
  ws.close(); chrome.kill();
  fs.writeFileSync(OUT.replace(/\.mp4$/,".frames.json"), JSON.stringify({seconds:SECONDS,speed:+SPEED,seed:SEED,frames:n,wall:elapsed,fps:+fps.toFixed(3),stamps},null,1));
  fs.rmSync(tmp,{recursive:true,force:true});
  const kb = (fs.statSync(OUT).size/1024).toFixed(0);
  console.log("recorded "+n+" frames over "+elapsed.toFixed(1)+"s wall ("+fps.toFixed(1)+"fps) -> "+OUT+" ("+kb+" KB)");
})().catch(e=>{console.error("REC ERROR",e);process.exit(1);});
