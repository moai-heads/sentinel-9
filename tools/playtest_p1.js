// Phase 1 verification: threat approach->contact->destroy, particles, shield states, breach
const { spawn } = require("child_process");
const fs = require("fs"), http = require("http"), path = require("path");
const ROOT = path.resolve(__dirname, "..");
const SECONDS = parseInt(process.argv[2] || "30", 10);
const SPEED = process.argv[3] || "4";
const OUT = process.argv[4] || "/tmp/p1cap";
fs.mkdirSync(OUT, { recursive: true });
const PORT = 9342;
const get = p => new Promise((res, rej) => http.get({ host: "127.0.0.1", port: PORT, path: p }, r => { let d = ""; r.on("data", c => d += c); r.on("end", () => res(d)); }).on("error", rej));
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const udd = "/dev/shm/pt_p1_" + process.pid;
  const chrome = spawn("chromium", ["--headless=new","--no-sandbox","--disable-gpu",
    "--remote-debugging-port="+PORT,"--window-size=1280,800","--hide-scrollbars",
    "--force-device-scale-factor=1","--user-data-dir="+udd,"about:blank"],
    { stdio: "ignore", env: Object.assign({}, process.env, { TMPDIR: "/dev/shm" }) });
  let target=null;
  for (let i=0;i<80&&!target;i++){ try{ target=JSON.parse(await get("/json/list")).find(t=>t.type==="page"); }catch(e){} if(!target) await sleep(250); }
  if(!target){ console.error("no target"); chrome.kill(); process.exit(1); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id=0; const pending=new Map(); const problems=[]; const events=[];
  const send=(m,p)=>new Promise(res=>{const mid=++id;pending.set(mid,res);ws.send(JSON.stringify({id:mid,method:m,params:p||{}}));});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.id&&pending.has(m.id)){pending.get(m.id)(m.result);pending.delete(m.id);}
    if(m.method==="Runtime.exceptionThrown")problems.push("EXC: "+(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text));
    if(m.method==="Log.entryAdded"&&m.params.entry.level==="error")problems.push("ERR: "+m.params.entry.text);};
  await new Promise(r=>ws.onopen=r);
  await send("Runtime.enable"); await send("Log.enable"); await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride",{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  const FILE="file://"+path.join(ROOT,"index.html")+"?autoplay=1&speed="+SPEED+"&seed=7";
  await send("Page.navigate",{url:FILE});
  await sleep(1500);
  const probe = async () => {
    const r = await send("Runtime.evaluate",{expression:`(()=>{const g=window.__game;if(!g)return null;const s=g.state;
      return JSON.stringify({t:+s.t.toFixed(1),thr:s.threats.length,phases:g.phases(),contact:g.contact(),
        parts:g.fx.particles,dmg:g.fx.dmg,tier:g.fx.shieldTier,breachT:+g.fx.breachT.toFixed(2),
        int:+s.integrity.toFixed(0),kills:s.kills,sec:s.sector,cln:+s.cleaned.toFixed(1)})})()`,returnByValue:true});
    return r&&r.result&&r.result.value?JSON.parse(r.result.value):null;
  };
  const shot=async n=>{const s=await send("Page.captureScreenshot",{format:"png"});if(s&&s.data)fs.writeFileSync(path.join(OUT,n),Buffer.from(s.data,"base64"));};
  const log=[]; let shotContact=false, shotBreach=false, sawApproach=false, sawContact=false, sawDying=false, sawTier1=false, sawTier2=false, maxParts=0;
  for(let i=0;i<SECONDS*2;i++){
    const st=await probe();
    if(st){ log.push(st);
      if(st.phases.includes("approach"))sawApproach=true;
      if(st.contact>0){sawContact=true; if(!shotContact){await shot("contact.png");shotContact=true;}}
      if(st.phases.includes("dying"))sawDying=true;
      if(st.tier>=1)sawTier1=true;
      if(st.tier===2){sawTier2=true; if(!shotBreach){await shot("breach.png");shotBreach=true;}}
      if(st.parts>maxParts)maxParts=st.parts;
    }
    await sleep(500);
  }
  await shot("final.png");
  // ---- Phase B: force low integrity to exercise shield states + breach ----
  let breachFired=false, tierAfter=0, breachDOM=false, shotB=false;
  const domState = async () => {
    const r = await send("Runtime.evaluate",{expression:`(()=>{const b=document.getElementById("breach"),s=document.getElementById("shield"),p=document.getElementById("pc");
      return JSON.stringify({breachOn:b.classList.contains("on"),shield:s.className,pc:p.className,opacity:getComputedStyle(b).opacity})})()`,returnByValue:true});
    return r&&r.result&&r.result.value?JSON.parse(r.result.value):null;
  };
  for (const forced of [55, 30]) {
    await send("Runtime.evaluate",{expression:`(()=>{window.__game.state.integrity=${forced};return 1;})()`,returnByValue:true});
    // poll fast to catch the short breach flash (0.55s)
    for (let k=0;k<24;k++){
      const st=await probe(), dm=await domState();
      if(st){ tierAfter=st.tier; if(st.breachT>0)breachFired=true; }
      if(dm){ if(dm.breachOn){breachDOM=true; if(!shotB){await shot("breach.png");shotB=true;}}
        if(forced===55 && dm.shield.includes("strained") && !fs.existsSync(path.join(OUT,"strained.png"))) await shot("strained.png");
        if(forced===30 && dm.shield.includes("crit") && !fs.existsSync(path.join(OUT,"crit.png"))) await shot("crit.png");
      }
      await sleep(50);
    }
  }
  const domFinal = await domState();
  const report={seconds:SECONDS,speed:SPEED,breachFired,tierAfter,breachDOM,domFinal,problems,
    sawApproach,sawContact,sawDying,sawTier1,sawTier2,maxParticles:maxParts,
    final:log[log.length-1],sample:log.filter((_,i)=>i%4===0).slice(0,14)};
  fs.writeFileSync(path.join(OUT,"report.json"),JSON.stringify(report,null,1));
  console.log("=== PHASE1 REPORT ===");
  console.log("approach:",sawApproach," contact:",sawContact," dying:",sawDying," shieldTier>=1:",sawTier1," tier2:",sawTier2," maxParticles:",maxParts);
  console.log("sample:"); report.sample.forEach(s=>console.log(`  t=${String(s.t).padStart(6)} thr=${s.thr} contact=${s.contact} parts=${String(s.parts).padStart(3)} dmg=${s.dmg} tier=${s.tier} int=${String(s.int).padStart(3)} phases=[${s.phases.join(",")}]`));
  console.log("FINAL:",JSON.stringify(report.final));
  console.log("PHASE B: breachFired="+breachFired+" breachDOM="+breachDOM+" tierAfter="+tierAfter);
  console.log("DOM:",JSON.stringify(domFinal));
  console.log("PROBLEMS:",problems.length?problems.slice(0,8).join("\n"):"(none)");
  console.log("SHOTS:",fs.readdirSync(OUT).join(" "));
  ws.close(); chrome.kill();
})().catch(e=>{console.error("HARNESS ERROR",e);process.exit(1);});
