import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';

const [base='http://127.0.0.1:5173/',output='captures/exploded-hd']=process.argv.slice(2);
if(fs.existsSync(output))throw new Error(`Refusing to overwrite ${output}`);
fs.mkdirSync(output,{recursive:true});
const report={sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),captures:[],errors:[]};
const save=()=>fs.writeFileSync(path.join(output,'capture.json'),JSON.stringify(report,null,2)+'\n');
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist']});
try{
 const page=await browser.newPage({viewport:{width:960,height:540},deviceScaleFactor:1});page.setDefaultTimeout(300000);
 page.on('pageerror',e=>report.errors.push(String(e)));
 page.on('console',m=>{if(m.type()==='error'&&m.text()!=='THREE.BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)')report.errors.push(m.text());});
 const url=new URL(base);url.search='?film=balance&static=1';
 await page.goto(url.href,{waitUntil:'commit'});await page.waitForFunction(()=>Boolean(window.__WATCH_FILM__));
 for(const [width,height,file]of [[960,540,'17280-exploded-preview.png'],[2560,1440,'17280-exploded-2560.png']]){
  await page.setViewportSize({width,height});
  await page.waitForFunction(({width,height})=>{
    const canvas=document.querySelector('#app canvas');
    return canvas?.width===width&&canvas?.height===height;
  },{width,height});
  const data=await page.evaluate(()=>{
   const w=window.__WATCH__;w.setView('r1E1Hero');w.setExplode(1);w.selectLayer(null);w.setReadoutPose('1010');w.setTime(0.104);w.setOpticsMode('translucent');
   const camera=w.releasePresentationReport().views.r1E1Hero;
   // Leave room for both separated crystals and the full strap in a 16:9 image.
   const position=camera.position.map((v,i)=>camera.target[i]+(v-camera.target[i])*1.22);
   w.setCaptureCamera(position,camera.target);
   const image=w.capture(),r=w.releasePresentationReport(),exploded=w.explodedAssemblyReport();
   if(r.current.exploded!==1||r.current.view!=='r1E1Hero'||r.refinement.stage!=='graphite-finish'||r.optics.mode!=='translucent')throw new Error('Unexpected render state');
   return {image,camera:r.current.camera,view:r.current.view,exploded:r.current.exploded,refinement:r.refinement.stage,optics:r.optics.mode,layers:exploded.layers?.length};
  });
  const bytes=Buffer.from(data.image.split(',')[1],'base64');delete data.image;
  if(bytes.readUInt32BE(16)!==width||bytes.readUInt32BE(20)!==height)throw new Error('Unexpected image size');
  fs.writeFileSync(path.join(output,file),bytes);
  report.captures.push({file,width,height,sha256:createHash('sha256').update(bytes).digest('hex'),...data});save();console.log(file);
 }
 if(report.errors.length)throw new Error(JSON.stringify(report.errors));
}finally{save();await browser.close();}
