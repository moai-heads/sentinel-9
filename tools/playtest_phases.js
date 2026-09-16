// Headless verification of the wave -> compile -> choose -> next-wave flow
// and the live core monitor screen. Usage: node tools/playtest_phases.js
const { spawn } = require("child_process");
const fs=require("fs"),http=require("http"),path=require("path");
const ROOT=path.resolve(__dirname,"..");
const PORT=9500+Math.floor(Math.random()*40);
const OUT=process.argv[2]||"/tmp/phases.png";
const get=p=>new Promise((res,rej)=>http.get({host:"127.0.0.1",port:PORT,path:p},r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>res(d));}).on("error",rej));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const udd="/dev/shm/ptp_"+process.pid;
  const chrome=spawn("chromium",["--headless=new","--no-sandbox","--use-gl=swiftshader","--enable-unsafe-swiftshader",
    "--remote-debugging-port="+PORT,"--window-size=1280,800,".slice(0,-1),"--hide-scrollbars",
    "--force-device-scale-factor=1","--user-data-dir="+udd,"about:blank"],{stdio:"ignore",env:Object.assign({},process.env,{TMPDIR:"/dev/shm"})});
  let t=null;for(let i=0;i<80&&!t;i++){try{t=JSON.parse(await get("/json/list")).find(x=>x.type==="page");}catch(e){}if(!t)await sleep(250);}
  if(!t){console.error("no chrome");process.exit(1);}
  const ws=new WebSocket(t.webSocketDebuggerUrl);let id=0;const p=new Map();
  const logs=[];
  const send=(m,par)=>new Promise(res=>{const mid=++id;p.set(mid,res);ws.send(JSON.stringify({id:mid,method:m,params:par||{}}));});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.method==="Runtime.exceptionThrown")logs.push("EXCEPTION: "+JSON.stringify(m.params.exceptionDetails.exception&&m.params.exceptionDetails.exception.description||m.params.exceptionDetails.text));
    if(m.method==="Runtime.consoleAPICalled"&&m.params.type==="error")logs.push("CONSOLE.ERROR: "+(m.params.args||[]).map(a=>a.value||a.description).join(" "));
    if(m.id&&p.has(m.id)){p.get(m.id)(m.result);p.delete(m.id);}};
  await new Promise(r=>ws.onopen=r);
  await send("Runtime.enable");await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride",{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  await send("Page.navigate",{url:"file://"+path.join(ROOT,"index.html")+"?probe=1&seed=7&autoplay=1&compile=1.0"});
  await sleep(2200);

  const ev=async(expr)=>{const r=await send("Runtime.evaluate",{expression:expr,returnByValue:true,awaitPromise:true});
    if(r.exceptionDetails)return {err:JSON.stringify(r.exceptionDetails)};
    return r.result?r.result.value:null;};

  const out={};
  out.initial=await ev("(()=>{const s=window.__game.state;return {phase:s.phase,wave:s.wave,quota:s.quota,spawned:s.spawned,threats:s.threats.length};})()");

  // force the wave to complete quickly: spawn the whole quota and kill everything
  out.forced=await ev(`(()=>{const g=window.__game,s=g.state;
    while(s.spawned<s.quota){g.spawnThreat();s.spawned++;}
    for(const th of s.threats){th.hp=0;}
    return {spawned:s.spawned,quota:s.quota,threats:s.threats.length};})()`);

  // let stepThreats run -> all die -> wave ends -> compile
  await sleep(1600);
  out.afterClear=await ev("(()=>{const s=window.__game.state;return {phase:s.phase,threats:s.threats.length,compileT:+s.compileT.toFixed(2)};})()");

  // wait for compile (1.0s) -> choose
  await sleep(1600);
  out.choose=await ev("(()=>{const s=window.__game.state;return {phase:s.phase,choices:s.choices?s.choices.map(c=>c.id):null,chooseT:+s.chooseT.toFixed(2)};})()");

  // inspect the rendered core-monitor canvas: is it black with green content?
  out.screen=await ev(`(()=>{const c=window.__game.screen.canvas;const g=c.getContext('2d');
    const d=g.getImageData(0,0,c.width,c.height).data;let green=0,bright=0,nonblack=0;
    for(let i=0;i<d.length;i+=4){const r=d[i],gg=d[i+1],b=d[i+2];
      if(r+gg+b>40)nonblack++; if(gg>90&&gg>r+30&&gg>b+20)green++; if(r+gg+b>600)bright++;}
    return {w:c.width,h:c.height,nonblack,green,bright};})()`);

  // screenshot the choose phase, camera parked right in front of the monitor
  await ev(`(()=>{const P=window.__game.fps.P;P.x=0;P.y=1.20;P.z=2.0;P.yaw=0;P.pitch=-0.358;return 1;})()`);
  await sleep(700);
  const s1=await send("Page.captureScreenshot",{format:"png"});
  fs.writeFileSync(OUT.replace(/\.png$/,"_choose.png"),Buffer.from(s1.data,"base64"));

  // pick upgrade #2 via a real key press
  const before=await ev("(()=>{const s=window.__game.state;return {wave:s.wave,upg:Object.assign({},window.__game.upg)};})()");
  await send("Input.dispatchKeyEvent",{type:"keyDown",code:"Digit2",key:"2",windowsVirtualKeyCode:50,nativeVirtualKeyCode:50});
  await send("Input.dispatchKeyEvent",{type:"keyUp",code:"Digit2",key:"2",windowsVirtualKeyCode:50,nativeVirtualKeyCode:50});
  await sleep(500);
  const after=await ev("(()=>{const s=window.__game.state;return {wave:s.wave,phase:s.phase,quota:s.quota,spawned:s.spawned,upg:Object.assign({},window.__game.upg)};})()");
  out.pick={before,after};

  // force game over -> redeploy resets everything
  out.reset=await ev(`(()=>{const g=window.__game;g.gameOver();g.redeploy();
    const s=g.state;return {phase:s.phase,wave:s.wave,upg:Object.assign({},g.upg),integrity:s.integrity};})()`);

  // second shot: the compile bar, mid-fill
  await ev(`(()=>{const g=window.__game;g.state.spawned=g.state.quota;for(const th of g.state.threats)th.hp=0;return 1;})()`);
  await sleep(1500);
  await ev(`(()=>{const g=window.__game;if(g.state.phase==='compile'){g.state.compileT=0.6;}
    const P=g.fps.P;P.x=0;P.y=1.20;P.z=2.0;P.yaw=0;P.pitch=-0.358;return g.state.phase;})()`);
  await sleep(500);
  const s2=await send("Page.captureScreenshot",{format:"png"});
  fs.writeFileSync(OUT.replace(/\.png$/,"_compile.png"),Buffer.from(s2.data,"base64"));

  out.logs=logs;
  console.log(JSON.stringify(out,null,2));
  ws.close();chrome.kill();
})().catch(e=>{console.error(e);process.exit(1);});
