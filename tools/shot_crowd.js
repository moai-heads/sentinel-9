// Crowded-frame capture: spawn many threats, advance a little so they converge, screenshot.
// Usage: node tools/shot_crowd.js OUT.png [count] [steps]
const { spawn } = require("child_process");
const fs=require("fs"),http=require("http"),path=require("path");
const ROOT=path.resolve(__dirname,"..");
const OUT=process.argv[2]||"/tmp/crowd.png";
const COUNT=parseInt(process.argv[3]||"14",10);
const STEPS=parseInt(process.argv[4]||"110",10);
const PORT=9600+Math.floor(Math.random()*40);
const get=p=>new Promise((res,rej)=>http.get({host:"127.0.0.1",port:PORT,path:p},r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>res(d));}).on("error",rej));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const udd="/dev/shm/sc_"+process.pid;
  const chrome=spawn("chromium",["--headless=new","--no-sandbox","--disable-gpu","--remote-debugging-port="+PORT,
    "--window-size=1280,800","--hide-scrollbars","--force-device-scale-factor=1","--user-data-dir="+udd,"about:blank"],
    {stdio:"ignore",env:Object.assign({},process.env,{TMPDIR:"/dev/shm"})});
  let t=null;for(let i=0;i<80&&!t;i++){try{t=JSON.parse(await get("/json/list")).find(x=>x.type==="page");}catch(e){}if(!t)await sleep(250);}
  const ws=new WebSocket(t.webSocketDebuggerUrl);let id=0;const p=new Map();
  const send=(m,par)=>new Promise(res=>{const mid=++id;p.set(mid,res);ws.send(JSON.stringify({id:mid,method:m,params:par||{}}));});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&p.has(m.id)){p.get(m.id)(m.result);p.delete(m.id);}};
  await new Promise(r=>ws.onopen=r);
  await send("Runtime.enable");await send("Page.enable");
  const ev=async(expr)=>{const r=await send("Runtime.evaluate",{expression:expr,returnByValue:true});return r.result&&r.result.value;};
  await send("Emulation.setDeviceMetricsOverride",{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  await send("Page.navigate",{url:"file://"+path.join(ROOT,"index.html")+"?speed=1&seed=11"});
  await sleep(1600);
  const info=await ev(`(()=>{
    const g=window.__game,S=g.state;
    for(let i=0;i<${COUNT};i++) g.spawnThreat();
    // advance the sim so they converge toward the core (spawned at ~24u)
    for(let i=0;i<${STEPS};i++) g.tick(1/60);
    return {alive:S.threats.length,t:+S.t.toFixed(2),radii:S.threats.map(h=>+Math.hypot(h.wx,h.wy,h.wz).toFixed(1))};
  })()`);
  await sleep(300);
  const sc=await send("Page.captureScreenshot",{format:"png"});
  fs.writeFileSync(OUT,Buffer.from(sc.data,"base64"));
  console.log(JSON.stringify(info));
  console.log("saved",OUT);
  ws.close();chrome.kill();
})().catch(e=>{console.error(e);process.exit(1);});
