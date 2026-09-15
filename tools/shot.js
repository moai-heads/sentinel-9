// Capture a 1280x800 still. Usage: node tools/shot.js OUT.png [presimS] [spawns] [waitMs]
const { spawn } = require("child_process");
const fs=require("fs"),http=require("http"),path=require("path");
const ROOT=path.resolve(__dirname,"..");
const OUT=process.argv[2]||"/tmp/shot.png";
const PRESIM=parseFloat(process.argv[3]||"0");
const SPAWNS=parseInt(process.argv[4]||"0",10);
const WAIT=parseInt(process.argv[5]||"1200",10);
const PORT=9350+Math.floor(Math.random()*40);
const get=p=>new Promise((res,rej)=>http.get({host:"127.0.0.1",port:PORT,path:p},r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>res(d));}).on("error",rej));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const udd="/dev/shm/shot_"+process.pid;
  const chrome=spawn("chromium",["--headless=new","--no-sandbox","--disable-gpu","--remote-debugging-port="+PORT,
    "--window-size=1280,800","--hide-scrollbars","--force-device-scale-factor=1","--user-data-dir="+udd,"about:blank"],
    {stdio:"ignore",env:Object.assign({},process.env,{TMPDIR:"/dev/shm"})});
  let t=null;for(let i=0;i<80&&!t;i++){try{t=JSON.parse(await get("/json/list")).find(x=>x.type==="page");}catch(e){}if(!t)await sleep(250);}
  const ws=new WebSocket(t.webSocketDebuggerUrl);let id=0;const p=new Map();
  const send=(m,par)=>new Promise(res=>{const mid=++id;p.set(mid,res);ws.send(JSON.stringify({id:mid,method:m,params:par||{}}));});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&p.has(m.id)){p.get(m.id)(m.result);p.delete(m.id);}};
  await new Promise(r=>ws.onopen=r);
  await send("Runtime.enable");await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride",{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  await send("Page.navigate",{url:"file://"+path.join(ROOT,"index.html")+"?speed=1&seed=7"});
  await sleep(1400);
  await send("Runtime.evaluate",{expression:`(()=>{const g=window.__game;if(${PRESIM}>0){g.selectNode(0);g.simulate(${PRESIM},1/60);}for(let i=0;i<${SPAWNS};i++)g.spawnThreat();g.renderAll();return 1;})()`,returnByValue:true});
  await sleep(WAIT);
  const s=await send("Page.captureScreenshot",{format:"png"});
  fs.writeFileSync(OUT,Buffer.from(s.data,"base64"));
  console.log("saved",OUT);
  ws.close();chrome.kill();
})().catch(e=>{console.error(e);process.exit(1);});
