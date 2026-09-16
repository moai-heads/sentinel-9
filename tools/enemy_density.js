// Measure enemy density: avg/max concurrent threats + kills over a fixed GAME-time window.
// Usage: node tools/enemy_density.js <index.html path> [gameSeconds] [speed] [seed]
const { spawn } = require("child_process");
const path=require("path"),http=require("http");
const FILE=path.resolve(process.argv[2]);
const GAMET=parseFloat(process.argv[3]||"90");
const SPEED=parseFloat(process.argv[4]||"3");
const SEED=process.argv[5]||"7";
const PORT=9500+Math.floor(Math.random()*40);
const get=p=>new Promise((res,rej)=>http.get({host:"127.0.0.1",port:PORT,path:p},r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>res(d));}).on("error",rej));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const udd="/dev/shm/ed_"+process.pid;
  const chrome=spawn("chromium",["--headless=new","--no-sandbox","--disable-gpu","--remote-debugging-port="+PORT,
    "--window-size=800,600","--user-data-dir="+udd,"about:blank"],{stdio:"ignore",env:Object.assign({},process.env,{TMPDIR:"/dev/shm"})});
  let t=null;for(let i=0;i<80&&!t;i++){try{t=JSON.parse(await get("/json/list")).find(x=>x.type==="page");}catch(e){}if(!t)await sleep(250);}
  const ws=new WebSocket(t.webSocketDebuggerUrl);let id=0;const p=new Map();
  const send=(m,par)=>new Promise(res=>{const mid=++id;p.set(mid,res);ws.send(JSON.stringify({id:mid,method:m,params:par||{}}));});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&p.has(m.id)){p.get(m.id)(m.result);p.delete(m.id);}};
  await new Promise(r=>ws.onopen=r);
  await send("Runtime.enable");
  const ev=async(expr)=>{const r=await send("Runtime.evaluate",{expression:expr,returnByValue:true});return r.result&&r.result.value;};
  await send("Page.navigate",{url:"file://"+FILE+"?speed="+SPEED+"&seed="+SEED+"&autoplay=1"});
  await sleep(1400);
  const samples=[];let last=0;
  const t0=Date.now();
  while(Date.now()-t0<200000){
    const s=await ev(`(()=>{const S=window.__game.state;return {t:+S.t.toFixed(2),n:S.threats.length,kills:S.kills,wave:S.wave,integrity:+S.integrity.toFixed(1)};})()`);
    if(s) samples.push(s);
    if(s&&s.t>=GAMET)break;
    await sleep(250);
  }
  const ns=samples.map(s=>s.n);
  const avg=(ns.reduce((a,b)=>a+b,0)/ns.length);
  const out={file:path.basename(path.dirname(FILE))+"/"+path.basename(FILE),gameT:samples.length?samples[samples.length-1].t:0,
    samples:samples.length, avgConcurrent:+avg.toFixed(2), maxConcurrent:Math.max(...ns),
    finalKills:samples.length?samples[samples.length-1].kills:0, finalWave:samples.length?samples[samples.length-1].wave:0};
  console.log(JSON.stringify(out));
  ws.close();chrome.kill();
})().catch(e=>{console.error(e);process.exit(1);});
