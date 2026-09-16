// Verify the first upgrade arms the core and that its shot is actually drawn
// as a visible 3D bolt in the WebGL scene. Usage: node tools/verify_turret_shots.js
const { spawn } = require("child_process");
const fs=require("fs"),http=require("http"),path=require("path");
const ROOT=path.resolve(__dirname,"..");
const PORT=9800+Math.floor(Math.random()*40);
const get=p=>new Promise((res,rej)=>http.get({host:"127.0.0.1",port:PORT,path:p},r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>res(d));}).on("error",rej));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const udd="/dev/shm/turret_"+process.pid;
  const chrome=spawn("chromium",["--headless=new","--no-sandbox","--use-gl=swiftshader","--enable-unsafe-swiftshader",
    "--remote-debugging-port="+PORT,"--window-size=1280,800","--hide-scrollbars","--force-device-scale-factor=1",
    "--user-data-dir="+udd,"about:blank"],{stdio:"ignore",env:Object.assign({},process.env,{TMPDIR:"/dev/shm"})});
  let t=null;for(let i=0;i<100&&!t;i++){try{t=JSON.parse(await get("/json/list")).find(x=>x.type==="page");}catch(e){}if(!t)await sleep(100);}
  if(!t)throw new Error("Chromium page did not start");
  const ws=new WebSocket(t.webSocketDebuggerUrl);let id=0;const p=new Map();const logs=[];
  const send=(m,par)=>new Promise(res=>{const mid=++id;p.set(mid,res);ws.send(JSON.stringify({id:mid,method:m,params:par||{}}));});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.method==="Runtime.exceptionThrown")logs.push("EXC: "+(m.params.exceptionDetails.exception&&m.params.exceptionDetails.exception.description||m.params.exceptionDetails.text));
    if(m.method==="Runtime.consoleAPICalled"&&m.params.type==="error")logs.push("ERR: "+(m.params.args||[]).map(a=>a.value||a.description).join(" "));
    if(m.id&&p.has(m.id)){p.get(m.id)(m.result);p.delete(m.id);}
  };
  await new Promise(r=>ws.onopen=r);
  await send("Runtime.enable");await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride",{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  await send("Page.navigate",{url:"file://"+path.join(ROOT,"index.html")+"?seed=13"});
  const ev=async expression=>{const r=await send("Runtime.evaluate",{expression,returnByValue:true});
    if(r.exceptionDetails)return {error:JSON.stringify(r.exceptionDetails)};return r.result?r.result.value:null;};
  await sleep(1700); // allow SwiftShader's initial context restore to settle

  const out={};
  out.initial=await ev("(()=>{const g=window.__game,s=g.state;return{phase:s.phase,upgTurret:g.upg.turret,gl:g.glDebug}})()");
  await ev(`(()=>{const g=window.__game,s=g.state;
    while(s.spawned<s.quota){g.spawnThreat();s.spawned++;}
    for(const th of s.threats.slice())g.damageThreat(th,1e9);
    return 1;})()`);
  await sleep(1000);
  out.choose=await ev("(()=>{const s=window.__game.state;return{phase:s.phase,choices:(s.choices||[]).map(c=>c.id)};})()");
  out.install=await ev("(()=>{const g=window.__game,c=g.pickUpgrade(0);return{picked:c&&c.id,phase:g.state.phase,upgTurret:g.upg.turret};})()");

  out.fire=await ev(`(()=>{const g=window.__game,s=g.state;
    const th={id:"probe",hpKind:"virus",hp:22,maxHp:22,dps:0,lx:0,ly:0,r:8,wx:0,wy:1.25,wz:-8,
      phase:"approach",hitT:0,dieT:0,spin:0,spinSpd:0,bobPh:0, color:"#ff4d6a"};
    s.threats.push(th);
    const P=g.fps.P;P.x=0;P.y=1.2;P.z=3;P.yaw=0;P.pitch=0;
    let fired=false;
    for(let i=0;i<12&&!fired;i++){g.stepWeapons(0.12);fired=g.coreTracers.length>0;}
    g.fps.render(0);
    const d=g.glDebug;
    return{fired,coreTracers:g.coreTracers.length,lastTracerDraw:d.lastTracerDraw,ctxLost:d.ctxLost,frames:d.frames,hp:th.hp};
  })()`);
  const shot=await send("Page.captureScreenshot",{format:"png"});
  const outPath="/tmp/sentinel9_turret_shot.png";
  fs.writeFileSync(outPath,Buffer.from(shot.data,"base64"));
  out.screenshot=outPath;out.logs=logs;
  console.log(JSON.stringify(out,null,2));
  if(!out.install||out.install.picked!=="turret")throw new Error("CORE TURRET was not installed");
  if(!out.fire||!out.fire.fired||out.fire.lastTracerDraw<1)throw new Error("Core turret shot was not drawn");
  if(logs.length)throw new Error("Browser errors: "+logs.join(" | "));
  ws.close();chrome.kill();
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
