// Verify wave -> compile(progress bar) -> choose(3 upgrades) -> pick -> next wave,
// and capture the in-world monitor + the screen canvas at each phase.
const { spawn } = require("child_process");
const fs=require("fs"),http=require("http"),path=require("path");
const ROOT=path.resolve(__dirname,"..");
const PORT=9600+Math.floor(Math.random()*40);
const get=p=>new Promise((res,rej)=>http.get({host:"127.0.0.1",port:PORT,path:p},r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>res(d));}).on("error",rej));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const udd="/dev/shm/vu_"+process.pid;
  const chrome=spawn("chromium",["--headless=new","--no-sandbox","--use-gl=swiftshader","--enable-unsafe-swiftshader",
    "--remote-debugging-port="+PORT,"--window-size=1280,800","--hide-scrollbars","--force-device-scale-factor=1",
    "--user-data-dir="+udd,"about:blank"],{stdio:"ignore",env:Object.assign({},process.env,{TMPDIR:"/dev/shm"})});
  let t=null;for(let i=0;i<80&&!t;i++){try{t=JSON.parse(await get("/json/list")).find(x=>x.type==="page");}catch(e){}if(!t)await sleep(250);}
  const ws=new WebSocket(t.webSocketDebuggerUrl);let id=0;const p=new Map();
  const logs=[];
  const send=(m,par)=>new Promise(res=>{const mid=++id;p.set(mid,res);ws.send(JSON.stringify({id:mid,method:m,params:par||{}}));});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.method==="Runtime.exceptionThrown")logs.push("EXC: "+(m.params.exceptionDetails.exception&&m.params.exceptionDetails.exception.description));
    if(m.method==="Runtime.consoleAPICalled"&&m.params.type==="error")logs.push("ERR: "+(m.params.args||[]).map(a=>a.value||a.description).join(" "));
    if(m.id&&p.has(m.id)){p.get(m.id)(m.result);p.delete(m.id);}};
  await new Promise(r=>ws.onopen=r);
  await send("Runtime.enable");await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride",{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  await send("Page.navigate",{url:"file://"+path.join(ROOT,"index.html")+"?probe=1&seed=3&compile=3.0"});
  await sleep(2000);
  const ev=async(x)=>{const r=await send("Runtime.evaluate",{expression:x,returnByValue:true});if(r.exceptionDetails)return {err:JSON.stringify(r.exceptionDetails)};return r.result?r.result.value:null;};
  const shot=async n=>{const s=await send("Page.captureScreenshot",{format:"png"});fs.writeFileSync("/tmp/"+n,Buffer.from(s.data,"base64"));};
  const park=`(()=>{const P=window.__game.fps.P;P.x=0;P.y=1.18;P.z=2.05;P.yaw=0;P.pitch=-0.36;return 1;})()`;
  const out={};

  out.start=await ev("(()=>{const s=window.__game.state;return{phase:s.phase,wave:s.wave,quota:s.quota,spawned:s.spawned};})()");
  await ev(park); await sleep(350); await shot("vu_wave.png");

  // clear wave 1
  await ev(`(()=>{const g=window.__game,s=g.state;while(s.spawned<s.quota){g.spawnThreat();s.spawned++;}for(const th of s.threats.slice())g.damageThreat(th,1e9);return 1;})()`);
  await sleep(1400);
  out.afterClear=await ev("(()=>{const s=window.__game.state;return{phase:s.phase,threats:s.threats.length};})()");
  // compile mid-bar
  await ev("window.__game.state.compileT=1.4");
  await ev(park); await sleep(250); await shot("vu_compile.png");
  out.compileBar=await ev(`(()=>{const s=window.__game.state;const c=window.__game.screen.canvas;const g=c.getContext('2d');
    return {phase:s.phase,compileT:+s.compileT.toFixed(2),pct:+(Math.min(1,s.compileT/window.__game.compileTime)).toFixed(2)};})()`);
  // let it finish -> choose
  await sleep(2200);
  out.choose=await ev("(()=>{const s=window.__game.state;return{phase:s.phase,choices:(s.choices||[]).map(c=>c.id)};})()");
  await ev(park); await sleep(250); await shot("vu_choose.png");
  // export the raw screen canvas as png (base64) to prove black+green content
  out.canv=await ev("(()=>{const c=window.__game.screen.canvas;return c.toDataURL('image/png').length;})()");
  const d=await ev("(()=>{const c=window.__game.screen.canvas;const g=c.getContext('2d');const im=g.getImageData(0,0,c.width,c.height).data;let green=0,nonblack=0;for(let i=0;i<im.length;i+=4){const r=im[i],gg=im[i+1],b=im[i+2];if(r+gg+b>40)nonblack++;if(gg>90&&gg>r+30&&gg>b+20)green++;}return{w:c.width,h:c.height,green,nonblack};})()");
  out.screenCanvas=d;

  // press key 2 -> pick upgrade #2
  const before=await ev("(()=>{const s=window.__game.state;return{wave:s.wave,phase:s.phase,upg:JSON.parse(JSON.stringify(window.__game.upg))};})()");
  await send("Input.dispatchKeyEvent",{type:"keyDown",code:"Digit2",key:"2",windowsVirtualKeyCode:50,nativeVirtualKeyCode:50});
  await send("Input.dispatchKeyEvent",{type:"keyUp",code:"Digit2",key:"2",windowsVirtualKeyCode:50,nativeVirtualKeyCode:50});
  await sleep(400);
  const after=await ev("(()=>{const s=window.__game.state;return{wave:s.wave,phase:s.phase,quota:s.quota,spawned:s.spawned,upg:JSON.parse(JSON.stringify(window.__game.upg))};})()");
  out.pick={choicePressed:before.choices?null:null,before,after};
  await ev(park); await sleep(300); await shot("vu_nextwave.png");
  out.logs=logs;
  console.log(JSON.stringify(out,null,2));
  ws.close();chrome.kill();
})().catch(e=>{console.error(e);process.exit(1);});
