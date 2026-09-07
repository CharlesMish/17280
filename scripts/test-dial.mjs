import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';

const [base='http://127.0.0.1:5301/',out='captures/dial-implementation',part='render']=process.argv.slice(2);
fs.mkdirSync(out,{recursive:true});
const report={checks:[],errors:[]};
const stable=value=>JSON.stringify(value,(_,v)=>typeof v==='number'?Math.round(v*1e9)/1e9:v);
const check=(label,passed)=>{report.checks.push({label,passed:Boolean(passed)});assert.ok(passed,label);console.log('PASS '+label);};
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist']});
try{
 const page=await browser.newPage({viewport:part==='render'?{width:960,height:760}:{width:900,height:700},deviceScaleFactor:1,reducedMotion:'reduce'});page.setDefaultTimeout(300000);
 page.on('pageerror',e=>report.errors.push(String(e)));
 page.on('console',m=>{if(m.type()==='error'&&/Shader Error|VALIDATE_STATUS|WebGLProgram/.test(m.text()))report.errors.push(m.text());});
 const url=new URL(base);url.search=part==='render'?'?film=balance&static=1':part==='film'?'?film=hands&dial=hidden':'?dial=hidden';
 await page.goto(url.href,{waitUntil:'commit'});await page.waitForFunction(()=>!!window.__WATCH__,null,{polling:100});
 if(part==='render'){
  await page.waitForFunction(()=>!!window.__WATCH_FILM__);
  const summary=await page.evaluate(()=>{const w=window.__WATCH__;w.setView('r1FinalHero');w.setCaptureCamera([18.35,13.4,74.01],[-.9,.55,1.6]);w.setReadoutPose('1010');w.setTime(.104);return {dial:w.releasePresentationReport().dial,readout:w.readoutReport()};});
  fs.writeFileSync(path.join(out,'readout.json'),JSON.stringify(summary,null,2));
  check('Chosen dial is default',summary.dial.mode==='mist'&&summary.dial.opacity===.65&&summary.dial.viewingApertures===0);
  check('Updated hand geometry stays in its allowed sweep',summary.readout.hourHand.contained&&summary.readout.minuteHand.contained);
  check('Complete readout audit passes',summary.readout.accepted);
  let original;
  for(const mode of ['mist','hidden','mist']){
   const data=await page.evaluate(mode=>{const w=window.__WATCH__;w.setDialMode(mode);return {image:w.capture(),current:w.releasePresentationReport().current,optics:w.getOpticsMode(),physical:w.physicalPresentationSnapshot(),dial:w.releasePresentationReport().dial};},mode);
   if(!original)original=data;
   else{if(stable(data.current)!==stable(original.current))report.cameraDifference={before:original.current,after:data.current};check(`${mode}: camera and playback unchanged`,stable(data.current)===stable(original.current));check(`${mode}: optics unchanged`,data.optics===original.optics);}
   if(mode==='hidden')check('Hiding changes pixels and visibility',data.image!==original.image&&!data.dial.visible);
   else if(data!==original)check('Showing again restores exact pixels',data.image===original.image);
   fs.writeFileSync(path.join(out,`hero-${mode}.png`),Buffer.from(data.image.split(',')[1],'base64'));
  }
  for(const optics of ['translucent','opaque','hidden'])for(const mode of ['mist','hidden']){
   const data=await page.evaluate(({optics,mode})=>{const w=window.__WATCH__;w.setOpticsMode(optics);w.setDialMode(mode);w.setReadoutPose('1200');const before=JSON.stringify(w.physicalPresentationSnapshot()),image=w.capture();return {image,restored:before===JSON.stringify(w.physicalPresentationSnapshot()),dial:w.getDialMode(),optics:w.getOpticsMode()};},{optics,mode});
   check(`${optics}/${mode}: render state restored`,data.restored&&data.dial===mode&&data.optics===optics);
   fs.writeFileSync(path.join(out,`noon-${optics}-${mode}.png`),Buffer.from(data.image.split(',')[1],'base64'));
  }
  for(const view of ['r1RearExhibition','r1E1Hero']){
   const data=await page.evaluate(view=>{const w=window.__WATCH__;w.setOpticsMode('translucent');w.setDialMode('mist');w.setView(view);if(view==='r1E1Hero')w.setExplode(1);const c=w.releasePresentationReport().views[view];w.setCaptureCamera(c.position,c.target);return {image:w.capture(),exploded:w.explodedAssemblyReport(),dial:w.releasePresentationReport().dial};},view);
   check(`${view}: dial stays selected`,data.dial.mode==='mist');
   fs.writeFileSync(path.join(out,`${view}.png`),Buffer.from(data.image.split(',')[1],'base64'));fs.writeFileSync(path.join(out,`${view}.json`),JSON.stringify(data.exploded,null,2));
  }
  const restored=await page.evaluate(()=>{const w=window.__WATCH__;w.setView('r1FinalHero');w.setCaptureCamera([18.35,13.4,74.01],[-.9,.55,1.6]);w.setReadoutPose('1010');return w.capture();});
  check('Explode/reassemble restores exact hero pixels',restored===original.image);
  check('Invalid dial input rejected',await page.evaluate(()=>{try{window.__WATCH__.setDialMode('unknown');return false;}catch{return true;}}));
 }else{
  await page.waitForSelector('select[aria-label="Dial"]');
  await page.evaluate(()=>{window.__WATCH__.setPlaybackPaused(true);window.__WATCH__.setTime(.104);window.__WATCH_FILM__?.pause();});
  check('Hidden URL initializes API and control',await page.inputValue('select[aria-label="Dial"]')==='hidden'&&await page.evaluate(()=>window.__WATCH__.getDialMode()==='hidden'));
  await page.selectOption('select[aria-label="Dial"]','mist');
  check('Control shows dial and cleans default URL',await page.evaluate(()=>window.__WATCH__.getDialMode()==='mist'&&!new URL(location.href).searchParams.has('dial')));
  await page.evaluate(()=>window.__WATCH__.setDialMode('hidden'));
  check('API updates control and shareable URL',await page.inputValue('select[aria-label="Dial"]')==='hidden'&&new URL(page.url()).searchParams.get('dial')==='hidden');
  await page.selectOption('select[aria-label="Crystal & rubies"]','hidden');
  await page.selectOption('select[aria-label="Dial"]','mist');
  check('Crystal and dial selectors are independent',await page.evaluate(()=>window.__WATCH__.getOpticsMode()==='hidden'&&window.__WATCH__.getDialMode()==='mist'));
  await page.setViewportSize({width:390,height:844});
  check('Controls fit mobile width',await page.locator('select[aria-label="Dial"]').evaluate(el=>{const b=el.getBoundingClientRect();return b.x>=0&&b.right<=innerWidth;}));
  await page.screenshot({path:path.join(out,`${part}-mobile.png`),fullPage:true});
 }
 check('No browser/shader errors',report.errors.length===0);
}finally{fs.writeFileSync(path.join(out,`${part}-report.json`),JSON.stringify(report,null,2));await browser.close();}
