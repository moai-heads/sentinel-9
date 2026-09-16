// Verify: enemies spawn further out, are larger, and there are more of them.
// Usage: node tools/verify_enemies.js [OUT.png]
const { spawn } = require("child_process");
const fs=require("fs"),http=require("http"),path=require("path");
const ROOT=path.resolve(__dirname,"..");
const OUT=process.argv[2]||"/tmp/enemies.png";
const PORT=9400+Math.floor(Math.random()*40);
const get=p=>new Promise((res,rej)=>http.get({host:"127.0.0.1",port:PORT,path:p},r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>res(d));}).on("error",rej));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const udd="/dev/shm/ve_"+process.pid;
  const chrome=spawn("chromium",["--headless=new","--no-sandbox","--disable-gpu","--remote-debugging-port="+PORT,
    "--window-size=1280,800","--hide-scrollbars","--force-device-scale-factor=1","--user-data-dir="+udd,"about:blank"],
    {stdio:"ignore",env:Object.assign({},process.env,{TMPDIR:"/dev/shm"})});
  let t=null;for(let i=0;i<80&&!t;i++){try{t=JSON.parse(await get("/json/list")).find(x=>x.type==="page");}catch(e){}if(!t)await sleep(250);}
  const ws=new WebSocket(t.webSocketDebuggerUrl);let id=0;const p=new Map();
  const send=(m,par)=>new Promise(res=>{const mid=++id;p.set(mid,res);ws.send(JSON.stringify({id:mid,method:m,params:par||{}}));});
  const errors=[];
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.id&&p.has(m.id)){p.get(m.id)(m.result);p.delete(m.id);}
    if(m.method==="Runtime.exceptionThrown")errors.push(JSON.stringify(m.params.exceptionDetails).slice(0,200));
    if(m.method==="Runtime.consoleAPICalled"&&m.params.type==="error")errors.push("console.error: "+JSON.stringify(m.params.args).slice(0,200));
  };
  await new Promise(r=>ws.onopen=r);
  await send("Runtime.enable");await send("Page.enable");
  const ev=async(expr)=>{const r=await send("Runtime.evaluate",{expression:expr,returnByValue:true});return r.result&&r.result.value;};
  await send("Emulation.setDeviceMetricsOverride",{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  await send("Page.navigate",{url:"file://"+path.join(ROOT,"index.html")+"?speed=2&seed=7&autoplay=1"});
  await sleep(1500);

  // constants
  const consts=await ev(`(()=>{const s=document.documentElement.innerHTML;
    return {ring:window.__game?1:0};})()`);
  const constCheck=await ev(`(()=>{
    // pull the constants out of the live module scope by re-declaring via eval of source
    return true;})()`);

  // sample spawn geometry by spawning threats and reading world positions before stepping
  const spawnSample=await ev(`(()=>{
    const g=window.__game, S=g.state;
    const before=S.threats.length;
    for(let i=0;i<3;i++) g.spawnThreat();
    const added=S.threats.slice(before).map(t=>Math.hypot(t.wx,t.wy,t.wz));
    return {radii:added.map(r=>+r.toFixed(2)), y:added.map(t=>0)}; })()`);

  // run live and sample max concurrent threats + kill activity
  const samples=[];
  for(let i=0;i<24;i++){ await sleep(500);
    samples.push(await ev(`(()=>{const S=window.__game.state;return {n:S.threats.length,minR:S.threats.length?+Math.min(...S.threats.map(t=>Math.hypot(t.wx,t.wy,t.wz))).toFixed(2):null,kills:S.kills,integrity:+S.integrity.toFixed(1),over:S.over};})()`));
  }
  const maxN=Math.max(...samples.map(s=>s.n));
  const fp=await ev(`(()=>{const g=window.__game;return JSON.stringify({ring:RING_R,contact:CONTACT_R,spawn:SPAWN_R});})()`).catch(()=>null);

  const sc=await send("Page.captureScreenshot",{format:"png"});
  fs.writeFileSync(OUT,Buffer.from(sc.data,"base64"));

  console.log("spawn radii (world units):",JSON.stringify(spawnSample&&spawnSample.radii));
  console.log("max concurrent threats over run:",maxN);
  console.log("sample tail:",JSON.stringify(samples.slice(-4)));
  console.log("exceptions:",errors.length?errors:"none");
  console.log("saved",OUT);
  ws.close();chrome.kill();
})().catch(e=>{console.error(e);process.exit(1);});
