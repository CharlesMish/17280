import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
const [base='http://127.0.0.1:5210',output='/tmp/train-design-visuals']=process.argv.slice(2);
const experiments=(process.env.EXPERIMENTS??'none,train-bridge,center-web').split(',');
if(experiments.some(name=>!['none','train-bridge','center-web'].includes(name)))throw new Error('Unknown train experiment');
if(fs.existsSync(output)) throw new Error(`Refusing overwrite ${output}`);
fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist']});
const report={browser:browser.version(),captures:[],errors:[],softwareRendering:true};
try {
 const page=await browser.newPage({viewport:{width:960,height:760},deviceScaleFactor:1});page.setDefaultTimeout(240000);
 page.on('pageerror',e=>report.errors.push(String(e)));
 page.on('console',m=>{if(m.type()==='error'&&!m.text().startsWith('THREE.BufferGeometry: .computeTangents() failed.'))report.errors.push(m.text())});
 for(const experiment of experiments) {
  await page.goto(`${base}/?static=1&view=r1FinalHero&t=0.104&readoutPose=1010&refinement=graphite-finish&experiment=${experiment}`,{waitUntil:'commit'});
  await page.waitForFunction(()=>typeof window.__WATCH__?.experimentReport==='function');
  for(const [view,name] of Object.entries({hero:'r1FinalHero',front:'r1FrontElevation',rear:'r1RearExhibition',exploded:'r1E1Hero',close:'r1FinalHero'})){
   const result=await page.evaluate(({name,view})=>{
    const w=window.__WATCH__;w.setView(name);w.setReadoutPose('1010');w.setTime(.104);if(view==='exploded')w.setExplode(1);
    const p=w.releasePresentationReport().views[name];
    w.setCaptureCamera(view==='close'?[7,-5,21]:p.position,view==='close'?[0,0,1.8]:p.target);
    return {image:w.capture(),presentation:w.releasePresentationReport(),experiment:w.experimentReport(),exploded:w.explodedAssemblyReport()};
   },{name,view});
   const {image,...metadata}=result;const file=`${view}-${experiment}.png`;
   fs.writeFileSync(path.join(output,file),Buffer.from(image.split(',')[1],'base64'));report.captures.push({file,view,...metadata});
   fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(file);
  }
 }
 if(report.errors.length)throw new Error(JSON.stringify(report.errors));
}finally{fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();}
