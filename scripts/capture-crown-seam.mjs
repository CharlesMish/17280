import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const [beforeBase='http://127.0.0.1:5185', afterBase='http://127.0.0.1:5184', output='captures/crown-seam-2026-09-05'] = process.argv.slice(2);
if (fs.existsSync(output)) throw new Error(`Refusing to overwrite ${output}`);
fs.mkdirSync(output,{recursive:true});
const report={viewport:{width:640,height:360},captures:[],checks:[],errors:[]};
const snapshots={};
const save=()=>fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
const check=(name,passed)=>{report.checks.push({name,passed});save();assert.ok(passed,name);console.log(`PASS ${name}`);};
const normalizeMaterials=rows=>{
  const ids=new Map();
  return rows.map(row=>({...row,materials:row.materials.map(id=>{if(!ids.has(id))ids.set(id,ids.size);return ids.get(id);})}));
};
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist']});
try {
  report.browser=browser.version();
  for(const [variant,base] of [['before',beforeBase],['after',afterBase]]) {
    const page=await browser.newPage({viewport:report.viewport,deviceScaleFactor:1});
    page.setDefaultTimeout(180000);
    page.on('pageerror',error=>report.errors.push(String(error)));
    page.on('console',message=>{if(message.type()==='error'&&message.text()!=='THREE.BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)')report.errors.push(message.text());});
    page.on('requestfailed',request=>report.errors.push(`${request.url()}: ${request.failure()?.errorText}`));
    page.on('response',response=>{if(response.status()>=400)report.errors.push(`HTTP ${response.status()}: ${response.url()}`);});
    await page.goto(`${base}/?film=crown&static=1`,{waitUntil:'commit'});
    await page.waitForFunction(()=>Boolean(window.__WATCH_FILM__));
    for(const [label,seconds] of [['start',0],['quarter',1.5],['middle',3],['three-quarter',4.5],['end',143/24]]) {
      const {image,...state}=await page.evaluate(({seconds,snapshot})=>{
        window.__WATCH_FILM__.setFrame('crown',seconds);
        const image=window.__WATCH__.capture();
        const report=window.__WATCH__.releasePresentationReport();
        return {image,current:report.current,refinement:report.refinement,views:report.views,profiles:report.profiles,
          physical:snapshot?window.__WATCH__.physicalPresentationSnapshot():null};
      },{seconds,snapshot:seconds===0});
      const file=`${variant}-${label}.png`;
      fs.writeFileSync(path.join(output,file),Buffer.from(image.split(',')[1],'base64'));
      if(state.physical)snapshots[variant]=normalizeMaterials(state.physical);
      delete state.physical;
      report.captures.push({variant,label,seconds,file,...state});save();console.log(file);
    }
    const hero=await page.evaluate(()=>{
      const w=window.__WATCH__;w.setView('r1FinalHero');w.setTime(0.104);w.setReadoutPose('1010');
      const camera=w.releasePresentationReport().views.r1FinalHero;w.setCaptureCamera(camera.position,camera.target);
      return w.capture();
    });
    fs.writeFileSync(path.join(output,`${variant}-hero.png`),Buffer.from(hero.split(',')[1],'base64'));
    await page.close();
  }
  for(const before of report.captures.filter(row=>row.variant==='before')) {
    const after=report.captures.find(row=>row.variant==='after'&&row.label===before.label);
    check(`${before.label}: identical camera, lighting and materials`,JSON.stringify(before.current.camera)===JSON.stringify(after.current.camera)&&before.current.profile===after.current.profile&&JSON.stringify(before.refinement)===JSON.stringify(after.refinement)&&JSON.stringify(before.views)===JSON.stringify(after.views)&&JSON.stringify(before.profiles)===JSON.stringify(after.profiles));
  }
  const changes=[];
  check('Same scene mesh count',snapshots.before.length===snapshots.after.length);
  for(let i=0;i<snapshots.before.length;i++) {
    const before=snapshots.before[i],after=snapshots.after[i];
    if(JSON.stringify(before)===JSON.stringify(after))continue;
    assert.equal(before.path,after.path);
    changes.push(before.path);
    assert.ok(before.path.endsWith('/ext:crown-body'),`Unexpected changed mesh ${before.path}`);
    const clean=row=>({...row,attributes:Object.fromEntries(Object.entries(row.attributes).filter(([name])=>!['normal','tangent'].includes(name)))});
    assert.deepEqual(clean(before),clean(after));
  }
  report.changedMeshes=changes;
  check('Only crown-body normals/tangents change; scene geometry, transforms and material assignments preserved',changes.length===1);
  check('No unexpected browser errors',report.errors.length===0);
} finally {save();await browser.close();}
