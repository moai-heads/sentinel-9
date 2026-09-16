// Verify the city level renders in a real browser: capture console errors, check GLWorld, screenshot.
// usage: node tools/verify_city.js OUT.png
const { spawn } = require("child_process");
const fs=require("fs"),http=require("http"),path=require("path");
const ROOT=path.resolve(__dirname,"..");
const OUT=process.argv[2]||"/tmp/verify_city.png";
const PORT=9500+Math.floor(Math.random()*40);
const get=p=>new Promise((res,rej)=>http.get({host:"127.0.0.1",port:PORT,path:p},r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>res(d));}).on("error",rej));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const udd="/dev/shm/vc_"+process.pid;
  const chrome=spawn("chromium",["--headless=new","--no-sandbox","--disable-gpu","--remote-debugging-port="+PORT,
    "--window-size=1280,800","--hide-scrollbars","--force-device-scale-factor=1","--user-data-dir="+udd,"about:blank"],
    {stdio:"ignore",env:Object.assign({},process.env,{TMPDIR:"/dev/shm"})});
  let t=null;for(let i=0;i<80&&!t;i++){try{t=JSON.parse(await get("/json/list")).find(x=>x.type==="page");}catch(e){}if(!t)await sleep(250);}
  const ws=new WebSocket(t.webSocketDebuggerUrl);let id=0;const p=new Map();const errs=[];
  const send=(m,par)=>new Promise(res=>{const mid=++id;p.set(mid,res);ws.send(JSON.stringify({id:mid,method:m,params:par||{}}));});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&p.has(m.id)){p.get(m.id)(m.result);p.delete(m.id);}
    if(m.method==="Runtime.exceptionThrown")errs.push(JSON.stringify(m.params.exceptionDetails.exception&&m.params.exceptionDetails.exception.description||m.params.exceptionDetails.text));
    if(m.method==="Runtime.consoleAPICalled"&&m.params.type==="error")errs.push(m.params.args.map(a=>a.value||a.description).join(" "));};
  await new Promise(r=>ws.onopen=r);
  await send("Runtime.enable");await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride",{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  await send("Page.navigate",{url:"file://"+path.join(ROOT,"index.html")+"?fps=1"});
  await sleep(2500);
  const probe=await send("Runtime.evaluate",{expression:`(()=>{
    const f=document.querySelector("#fps");
    const gl=document.querySelector("#glCanvas");
    return {title:document.title, fpsOn:f?f.classList.contains("on"):false,
            glCanvas:gl?gl.width+"x"+gl.height:null,
            hasCtx: gl? !!(gl.getContext("webgl")||gl.getContext("webgl2")) : false};})()`,returnByValue:true});
  await sleep(1200);
  const s=await send("Page.captureScreenshot",{format:"png"});
  fs.writeFileSync(OUT,Buffer.from(s.data,"base64"));
  console.log("probe:",JSON.stringify(probe.result&&probe.result.value));
  console.log("errors:",errs.length?errs.join("\n"):"none");
  console.log("saved",OUT);
  ws.close();chrome.kill();
  process.exit(errs.length?2:0);
})().catch(e=>{console.error("FATAL",e);process.exit(1);});
