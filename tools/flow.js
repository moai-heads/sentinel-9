const { spawn } = require("child_process");
const fs=require("fs"),http=require("http"),path=require("path");
const ROOT=path.resolve(__dirname,"..");
const PORT=9860+Math.floor(Math.random()*40);
const get=p=>new Promise((res,rej)=>http.get({host:"127.0.0.1",port:PORT,path:p},r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>res(d));}).on("error",rej));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const udd="/dev/shm/flow_"+process.pid;
  fs.mkdirSync("/root/shots",{recursive:true});
  const chrome=spawn("chromium",["--headless=new","--no-sandbox","--use-gl=swiftshader","--enable-unsafe-swiftshader",
    "--remote-debugging-port="+PORT,"--window-size=1200,700","--hide-scrollbars","--force-device-scale-factor=1",
    "--user-data-dir="+udd,"about:blank"],{stdio:"ignore",env:Object.assign({},process.env,{TMPDIR:"/dev/shm"})});
  let t=null;for(let i=0;i<80&&!t;i++){try{t=JSON.parse(await get("/json/list")).find(x=>x.type==="page");}catch(e){}if(!t)await sleep(250);}
  const ws=new WebSocket(t.webSocketDebuggerUrl);let id=0;const p=new Map();
  const send=(m,par)=>new Promise(res=>{const mid=++id;p.set(mid,res);ws.send(JSON.stringify({id:mid,method:m,params:par||{}}));});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&p.has(m.id)){p.get(m.id)(m.result);p.delete(m.id);}};
  await new Promise(r=>ws.onopen=r);
  await send("Runtime.enable");await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride",{width:1200,height:700,deviceScaleFactor:1,mobile:false});
  await send("Page.navigate",{url:"file://"+path.join(ROOT,"index.html")+"?seed=3&compile=3"});
  await sleep(2500);
  const ev=async(x)=>{const r=await send("Runtime.evaluate",{expression:x,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)return "ERR:"+(r.exceptionDetails.exception&&r.exceptionDetails.exception.description);return r.result?r.result.value:null;};
  const shot=async(name)=>{const r=await send("Page.captureScreenshot",{format:"png"});fs.writeFileSync("/root/shots/"+name,Buffer.from(r.data,"base64"));};
  const st=async()=>await ev("(function(){const g=window.__game,s=g.state;return {wave:s.wave,phase:s.phase,compileT:+s.compileT.toFixed(2),choices:(s.choices||[]).map(c=>c.name),upg:g.upg,gl:g.glOK};})()");
  const key=async(c)=>{await send("Input.dispatchKeyEvent",{type:"keyDown",code:c,key:c,windowsVirtualKeyCode:0});await send("Input.dispatchKeyEvent",{type:"keyUp",code:c,key:c});};

  const tex=async()=>await ev(`(function(){
    const gl=GLWorld._gl(),t=GLWorld._screenTex();
    if(!gl.isTexture(t))return {valid:false};
    const fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);
    const ok=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
    const px=new Uint8Array(256*160*4);
    if(ok)gl.readPixels(0,0,256,160,gl.RGBA,gl.UNSIGNED_BYTE,px);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.deleteFramebuffer(fb);
    let nb=0,gr=0;for(let i=0;i<px.length;i+=4){if(px[i]+px[i+1]+px[i+2]>40)nb++;if(px[i+1]>90&&px[i+1]>px[i]+30)gr++;}
    return {valid:true,ok,nb,gr};
  })()`);

  console.log("start",JSON.stringify(await st()), "tex", JSON.stringify(await tex()));
  // fast forward wave
  console.log("ff",await ev("for(let i=0;i<240000;i++){if(window.__game.state.phase!=='wave')break;window.__game.tick(1/60);} 'done'"));
  console.log("phase",JSON.stringify(await st()));
  await sleep(200); 
  // let compile run a bit for partial bar
  await ev("for(let i=0;i<90;i++){window.__game.tick(1/60);}"); await ev("window.__game.screen.render();"); await sleep(150);
  console.log("mid-compile",JSON.stringify(await st())); await shot("02-midbar.png");
  console.log("tex mid", JSON.stringify(await tex()));
  // finish compile
  await ev("for(let i=0;i<6000;i++){if(window.__game.state.phase!=='compile')break;window.__game.tick(1/60);} window.__game.screen.render();");
  await sleep(200);
  console.log("choose",JSON.stringify(await st())); await shot("03-upgrade.png");
  console.log("tex choose", JSON.stringify(await tex()));
  await key("Digit2");
  await sleep(300);
  console.log("after pick",JSON.stringify(await st()));
  await shot("04-nextwave.png");
  await sleep(1200); await shot("05-play.png");
  ws.close();chrome.kill();
})().catch(e=>{console.error(e);process.exit(1);});
