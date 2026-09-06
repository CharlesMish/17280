import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { chromium } from 'playwright';

const [base='http://127.0.0.1:5301/',output='captures/optics-2026-09-06',part='all']=process.argv.slice(2);
if(fs.existsSync(output))throw new Error(`Refusing to overwrite ${output}`);
fs.mkdirSync(output,{recursive:true});
const report={checks:[],captures:[],errors:[]};
const save=()=>fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
const check=(name,passed)=>{report.checks.push({name,passed:Boolean(passed)});save();assert.ok(passed,name);console.log(`PASS ${name}`);};
const cameraKey=value=>JSON.stringify(value,(_,v)=>typeof v==='number'?Math.round(v*1e9)/1e9:v);
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist']});
const attach=page=>{
 page.setDefaultTimeout(180000);
 page.on('pageerror',e=>{report.errors.push(String(e));save();});
 page.on('console',m=>{if(m.type()==='error'&&m.text()!=='THREE.BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)'){report.errors.push(m.text());save();}});
 page.on('response',r=>{if(r.status()>=400)report.errors.push(`${r.status()} ${r.url()}`);});
};
try{
 let page;
 if(part!=='ui'){
 page=await browser.newPage({viewport:{width:640,height:506},deviceScaleFactor:1});attach(page);
 await page.goto(new URL('?film=balance&static=1',base).href,{waitUntil:'commit'});
 await page.waitForFunction(()=>Boolean(window.__WATCH_FILM__));
 check('Corrected translucent rendering is the default',await page.evaluate(()=>window.__WATCH__.getOpticsMode()==='translucent'));
 for(const elevation of [80,64,63,62,61,50]){
  await page.evaluate(elevation=>{
   const w=window.__WATCH__;window.__WATCH_FILM__.setFrame('balance',0);
   const target=[-1.45,5.05,2.25],r=22,a=elevation*Math.PI/180;
   w.setCaptureCamera([target[0]+r*Math.cos(a)*0.75,target[1]+r*Math.cos(a)*Math.sqrt(1-0.75**2),target[2]+r*Math.sin(a)],target);
  },elevation);
  let original;
  for(const mode of ['translucent','opaque','hidden','translucent']){
   const data=await page.evaluate(mode=>{
    const w=window.__WATCH__;w.setOpticsMode(mode);const started=performance.now();const image=w.capture();
    return {image,ms:performance.now()-started,presentation:w.releasePresentationReport(),physical:JSON.stringify(w.physicalPresentationSnapshot()),
     jewel:w.sceneDump().find(o=>o.name==='assembly:bearing:balance:upper:endstone')};
   },mode);
   if(!original)original={...data};
   else{
    const invariant={camera:cameraKey(original.presentation.current)===cameraKey(data.presentation.current),materials:JSON.stringify(original.presentation.refinement)===JSON.stringify(data.presentation.refinement),physical:original.physical===data.physical};
    if(!Object.values(invariant).every(Boolean)){
     const a=JSON.parse(original.physical),b=JSON.parse(data.physical);
     report.invariantFailure={invariant,beforeCamera:original.presentation.current,afterCamera:data.presentation.current,
      materials:data.presentation.refinement.materials.filter((m,i)=>JSON.stringify(m)!==JSON.stringify(original.presentation.refinement.materials[i])),
      physical:b.filter((m,i)=>JSON.stringify(m)!==JSON.stringify(a[i])).slice(0,3)};save();console.log(JSON.stringify(report.invariantFailure));
    }
    check(`${elevation}/${mode}: camera, materials and geometry preserved`,Object.values(invariant).every(Boolean));
    if(mode==='translucent'){check(`${elevation}: switching back restores exact pixels`,original.image===data.image);continue;}
   }
   const camera=new THREE.PerspectiveCamera(data.presentation.current.camera.fov,640/506,0.25,160);
   camera.position.fromArray(data.presentation.current.camera.position);camera.up.fromArray(data.presentation.current.camera.up);camera.lookAt(new THREE.Vector3().fromArray(data.presentation.current.camera.target));camera.updateMatrixWorld();
   const p=new THREE.Vector3(data.jewel.x,data.jewel.y,data.jewel.z).project(camera);
   const point={x:Math.round((p.x+1)*320),y:Math.round((1-p.y)*253)};
   const ruby=await page.evaluate(async({image,point})=>{
    const bitmap=await createImageBitmap(await (await fetch(image)).blob());const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;
    const ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();const pixels=ctx.getImageData(point.x-5,point.y-5,11,11).data;
    let redPixels=0,red=0;for(let i=0;i<pixels.length;i+=4){red+=pixels[i];if(pixels[i]>pixels[i+1]*1.35&&pixels[i]>pixels[i+2]*1.12&&pixels[i]>30)redPixels++;}
    return {redPixels,meanRed:red/121};
   },{image:data.image,point});
   check(`${elevation}/${mode}: balance ruby remains visible`,ruby.redPixels>15);
   const file=`balance-${elevation}-${mode}.png`;fs.writeFileSync(path.join(output,file),Buffer.from(data.image.split(',')[1],'base64'));
   delete data.image;delete data.physical;report.captures.push({file,elevation,mode,point,ruby,...data});save();
  }
 }
 for(const mode of ['translucent','opaque','hidden']){
  const samples=report.captures.filter(c=>c.mode===mode&&[64,63,62,61].includes(c.elevation));
  check(`${mode}: no ruby disappearance across the old sort transition`,Math.max(...samples.map(c=>c.ruby.meanRed))-Math.min(...samples.map(c=>c.ruby.meanRed))<25);
 }
 for(const view of ['r1FinalHero','r1RearExhibition','r1E1Hero'])for(const mode of ['translucent','opaque','hidden']){
  const data=await page.evaluate(({view,mode})=>{const w=window.__WATCH__;w.setView(view);w.setTime(0.104);w.setOpticsMode(mode);const image=w.capture();return {image,presentation:w.releasePresentationReport()};},{view,mode});
  const file=`${view}-${mode}.png`;fs.writeFileSync(path.join(output,file),Buffer.from(data.image.split(',')[1],'base64'));delete data.image;report.captures.push({file,view,mode,...data});save();console.log(file);
 }
 await page.close();
 }
 page=await browser.newPage({viewport:{width:800,height:600},deviceScaleFactor:1});attach(page);
 await page.goto(new URL('?film=balance',base).href,{waitUntil:'commit'});await page.waitForFunction(()=>Boolean(window.__WATCH_FILM__));
 console.log('Studio loaded; checking selectors');
 const initial=await page.evaluate(()=>window.__WATCH__.releasePresentationReport().current.camera);
 for(const mode of ['hidden','opaque','translucent']){
  await page.getByLabel('Crystal & rubies',{exact:true}).selectOption(mode);
  const current=await page.evaluate(()=>({mode:window.__WATCH__.getOpticsMode(),camera:window.__WATCH__.releasePresentationReport().current.camera}));
  check(`Live selector chooses ${mode} without moving the camera`,current.mode===mode&&cameraKey(current.camera)===cameraKey(initial));
 }
 await page.getByLabel('Crystal & rubies',{exact:true}).selectOption('opaque');
 check('Choice is shareable in the URL',new URL(page.url()).searchParams.get('optics')==='opaque');
 await page.getByRole('button',{name:'Crown',exact:true}).click();
 check('Choice survives changing film cameras',await page.evaluate(()=>window.__WATCH__.getOpticsMode()==='opaque'));
 await page.setViewportSize({width:390,height:844});
 check('Studio selector fits mobile width',await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth));
 await page.screenshot({path:path.join(output,'studio-phone.png')});await page.close();
 page=await browser.newPage({viewport:{width:900,height:700},reducedMotion:'reduce'});attach(page);
 await page.goto(new URL('?optics=opaque',base).href,{waitUntil:'commit'});await page.waitForFunction(()=>Boolean(window.__WATCH__));
 check('Public watch restores choice from URL',await page.getByLabel('Crystal & rubies',{exact:true}).inputValue()==='opaque');
 await page.getByLabel('Crystal & rubies',{exact:true}).selectOption('hidden');
 await page.getByRole('button',{name:'Rear',exact:true}).click();
 check('Choice survives public camera changes',await page.evaluate(()=>window.__WATCH__.getOpticsMode()==='hidden'));
 await page.getByLabel('Crystal & rubies',{exact:true}).selectOption('translucent');
 await page.screenshot({path:path.join(output,'watch-desktop.png')});
 check('No unexpected browser errors',report.errors.length===0);
}finally{save();await browser.close();}
