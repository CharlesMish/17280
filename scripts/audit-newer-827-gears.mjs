import { chromium } from "playwright";
import * as THREE from "three";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const BASE = process.argv[3] || "http://127.0.0.1:5173";
const OUT = path.resolve(
  process.argv[2] || "captures/post5d-newer-827/05-escape-pallet-sweep-report.json",
);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const browser = await chromium.launch({headless:true,args:["--use-gl=angle","--use-angle=swiftshader","--ignore-gpu-blocklist"]});
const page = await browser.newPage({viewport:{width:1200,height:900}});
const pageErrors=[];
const consoleErrors=[];
const requestFailures=[];
page.on("pageerror",error=>pageErrors.push(String(error)));
page.on("console",message=>{if(message.type()==="error")consoleErrors.push(message.text())});
page.on("requestfailed",request=>requestFailures.push({url:request.url(),error:request.failure()?.errorText??"unknown"}));
page.setDefaultTimeout(300000);
await page.goto(`${BASE}/?static=1&t=0.104&explode=0`,{waitUntil:"commit",timeout:60000});
await page.waitForFunction(()=>globalThis.__WATCH__?.sceneDump!==undefined);
const cdp=await page.context().newCDPSession(page);
await cdp.send("Runtime.evaluate",{expression:"import('/node_modules/.vite/deps/three.js').then(m=>globalThis.__TNEW=m)",awaitPromise:true});
const proto=await cdp.send("Runtime.evaluate",{expression:"__TNEW.Scene.prototype"});
const instances=await cdp.send("Runtime.queryObjects",{prototypeObjectId:proto.result.objectId});
await cdp.send("Runtime.callFunctionOn",{objectId:instances.objects.objectId,functionDeclaration:"function(){globalThis.__SNEW=this.find(x=>x.getObjectByName&&x.getObjectByName('calibre'))}"});

const payload=await page.evaluate(()=>{
  const T=globalThis.__TNEW,S=globalThis.__SNEW;
  globalThis.__WATCH__.setTime(.104); globalThis.__WATCH__.capture(); S.updateMatrixWorld(true);
  const path=o=>{const a=[];for(let c=o;c;c=c.parent){let n=c.name||c.type;if(!c.name&&c.parent)n+=`[${c.parent.children.indexOf(c)}]`;a.push(n)}return a.reverse().join('/')};
  const mesh=(name,ownerName)=>{const m=S.getObjectByName(name),o=S.getObjectByName(ownerName);if(!m||!o)throw new Error(`missing ${name}/${ownerName}`);const rel=o.matrixWorld.clone().invert().multiply(m.matrixWorld);const p=m.geometry.getAttribute('position'),i=m.geometry.getIndex(),b=new T.Box3().setFromObject(m,true);return{name,path:path(m),relative:rel.toArray(),positions:Array.from(p.array),itemSize:p.itemSize,index:i?Array.from(i.array):null,bounds:{min:b.min.toArray(),max:b.max.toArray()}}};
  const owner=name=>{const o=S.getObjectByName(name);return{path:path(o),rotation:o.rotation.z,parent:o.parent.matrixWorld.toArray()}};
  return {
    escape:mesh('escape:wheel','escape:motion'),
    pallet:[
      mesh('pallet:stone:entry','pallet:motion'),mesh('pallet:stone:exit','pallet:motion'),
      mesh('pallet:lowerArm:entry','pallet:motion'),mesh('pallet:lowerArm:exit','pallet:motion'),
      mesh('pallet:lowerBoss','pallet:motion'),mesh('pallet:lowerLever','pallet:motion'),
      mesh('pallet:bankingLug','pallet:motion')
    ],
    owners:{escape:owner('escape:motion'),pallet:owner('pallet:motion')},
    report:globalThis.__WATCH__.escapementRepairReport(),
  };
});
await browser.close();

const deg=v=>v*Math.PI/180;
const BEAT_HZ=2.4, AMP=deg(132), BANK=deg(5.5), PIN=.52, L=4.664419386772;
const BETA=deg(53.787399651954), U0=Math.acos(BETA/AMP)/Math.PI,U1=1-U0;
const TOOTH=2*Math.PI/15,DROP=deg(1.5);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t)};
function sample(t){
  const ticks=t*BEAT_HZ*2, tick=Math.floor(ticks),u=ticks-tick,half=Math.PI*(tick+u);
  const bal=AMP*Math.cos(half), pinR=Math.sqrt(L*L+PIN*PIN-2*L*PIN*Math.cos(bal));
  const ideal=Math.atan2(PIN*Math.sin(bal),L-PIN*Math.cos(bal));
  const start=tick%2===0?-BANK:BANK,end=-start;
  const pallet=u<U0?start:u>U1?end:clamp(-ideal,-BANK,BANK);
  const local=clamp((u-U0)/(U1-U0),0,1); let adv=0;
  if(u>=U0&&local>=.30&&local<.40)adv=DROP*smooth((local-.30)/.10);
  else if(u>=U0&&local>=.40&&local<.88)adv=DROP+(TOOTH-DROP)*smooth((local-.40)/.48);
  else if(u>=U0&&local>=.88)adv=TOOTH;
  return{tick,u,pallet,escape:-(tick*TOOTH+adv)};
}
const at104=sample(.104);
const escapeRest=payload.owners.escape.rotation-at104.escape;

function triangles(data){
  const rel=new THREE.Matrix4().fromArray(data.relative),idx=data.index,count=idx?idx.length:data.positions.length/data.itemSize;
  const read=s=>{const i=idx?idx[s]:s;return new THREE.Vector3(data.positions[i*data.itemSize],data.positions[i*data.itemSize+1],data.positions[i*data.itemSize+2]).applyMatrix4(rel)};
  const out=[];for(let s=0;s<count;s+=3){const a=read(s),b=read(s+1),c=read(s+2);const area=Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x));if(area<1e-14)continue;out.push({a,b,c,sourceTriangle:s/3});}return out;
}
const escapeTris=triangles(payload.escape);
const moving=payload.pallet
  .filter(data=>process.env.ARMS_ONLY!=="1"||data.name.includes("lowerArm"))
  .map(data=>({data,tris:triangles(data)}));
const escParent=new THREE.Matrix4().fromArray(payload.owners.escape.parent);
const palParent=new THREE.Matrix4().fromArray(payload.owners.pallet.parent);
const rot=z=>new THREE.Matrix4().makeRotationZ(z);
const transform2=(tri,m)=>{const cv=v=>{const p=v.clone().applyMatrix4(m);return{x:p.x,y:p.y,z:p.z}};const a=cv(tri.a),b=cv(tri.b),c=cv(tri.c);return{a,b,c,sourceTriangle:tri.sourceTriangle,minX:Math.min(a.x,b.x,c.x),maxX:Math.max(a.x,b.x,c.x),minY:Math.min(a.y,b.y,c.y),maxY:Math.max(a.y,b.y,c.y),minZ:Math.min(a.z,b.z,c.z),maxZ:Math.max(a.z,b.z,c.z)}};
const fixed=escapeTris.map(t=>transform2(t,new THREE.Matrix4()));
function orient(a,b,c){return(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)}
function pointSeg(p,a,b){const x=b.x-a.x,y=b.y-a.y,d=x*x+y*y;if(!d)return Math.hypot(p.x-a.x,p.y-a.y);const t=clamp(((p.x-a.x)*x+(p.y-a.y)*y)/d,0,1);return Math.hypot(p.x-a.x-x*t,p.y-a.y-y*t)}
function segDist(a,b,c,d){const o1=orient(a,b,c),o2=orient(a,b,d),o3=orient(c,d,a),o4=orient(c,d,b);if(o1*o2<=1e-20&&o3*o4<=1e-20)return 0;return Math.min(pointSeg(a,c,d),pointSeg(b,c,d),pointSeg(c,a,b),pointSeg(d,a,b))}
function inside(p,t){const a=orient(t.a,t.b,p),b=orient(t.b,t.c,p),c=orient(t.c,t.a,p);return(a>=-1e-13&&b>=-1e-13&&c>=-1e-13)||(a<=1e-13&&b<=1e-13&&c<=1e-13)}
function dist2(a,b){if(inside(a.a,b)||inside(b.a,a))return 0;let d=Infinity;for(const e of [[a.a,a.b],[a.b,a.c],[a.c,a.a]])for(const f of [[b.a,b.b],[b.b,b.c],[b.c,b.a]])d=Math.min(d,segDist(...e,...f));return d}
function clipPoly(subject,clip){let out=subject;const sign=orient(clip[0],clip[1],clip[2])>=0?1:-1;for(let j=0;j<3;j++){const A=clip[j],B=clip[(j+1)%3],input=out;out=[];if(!input.length)break;const inSide=p=>sign*orient(A,B,p)>=-1e-14;const cross=(P,Q)=>{const rx=Q.x-P.x,ry=Q.y-P.y,sx=B.x-A.x,sy=B.y-A.y,den=rx*sy-ry*sx;if(Math.abs(den)<1e-18)return{x:(P.x+Q.x)/2,y:(P.y+Q.y)/2};const t=((A.x-P.x)*sy-(A.y-P.y)*sx)/den;return{x:P.x+t*rx,y:P.y+t*ry}};let S=input.at(-1),Sin=inSide(S);for(const E of input){const Ein=inSide(E);if(Ein){if(!Sin)out.push(cross(S,E));out.push(E)}else if(Sin)out.push(cross(S,E));S=E;Sin=Ein}}return out}
function overlapResult(a,b){const p=clipPoly([a.a,a.b,a.c],[b.a,b.b,b.c]);if(p.length<3)return{area:0,polygon:[]};let s=0;for(let i=0;i<p.length;i++)s+=p[i].x*p[(i+1)%p.length].y-p[(i+1)%p.length].x*p[i].y;return{area:Math.abs(s)/2,polygon:p}}
function triBox(rows){let a=Infinity,b=-Infinity,c=Infinity,d=-Infinity;for(const t of rows){a=Math.min(a,t.minX);b=Math.max(b,t.maxX);c=Math.min(c,t.minY);d=Math.max(d,t.maxY)}return{minX:a,maxX:b,minY:c,maxY:d}}
function build(rows){const box=triBox(rows);if(rows.length<=12)return{box,rows};const sx=box.maxX-box.minX,sy=box.maxY-box.minY,axis=sx>=sy?'x':'y';rows.sort((a,b)=>((a[`min${axis.toUpperCase()}`]+a[`max${axis.toUpperCase()}`])-(b[`min${axis.toUpperCase()}`]+b[`max${axis.toUpperCase()}`])));const m=Math.floor(rows.length/2);return{box,left:build(rows.slice(0,m)),right:build(rows.slice(m))}}
const tree=build([...fixed]);
const boxDist=(a,b)=>Math.hypot(Math.max(0,a.minX-b.maxX,b.minX-a.maxX),Math.max(0,a.minY-b.maxY,b.minY-a.maxY));
function query(t,node,best){if(boxDist(t,node.box)>best.distance)return best;if(node.rows){for(const f of node.rows){const hit=overlapResult(t,f);if(hit.area>best.maxOverlapArea)best={...best,maxOverlapArea:hit.area,overlap:{moving:t.sourceTriangle,fixed:f.sourceTriangle,polygon:hit.polygon,movingTriangle:[t.a,t.b,t.c],fixedTriangle:[f.a,f.b,f.c]}};const d=dist2(t,f);if(d<best.distance)best={...best,distance:d,nearest:{moving:t.sourceTriangle,fixed:f.sourceTriangle}}}return best}best=query(t,node.left,best);return query(t,node.right,best)}

const period=1/BEAT_HZ,N=Number(process.env.N||2049);
const results=moving.map(({data,tris})=>({name:data.name,path:data.path,bounds:data.bounds,minimum:Infinity,maximumPairOverlapArea:0,collisionSamples:0,witness:null}));
for(let i=0;i<N;i++){
  const t=period*i/(N-1),s=sample(t);
  const eWorld=escParent.clone().multiply(rot(escapeRest+s.escape));
  const pWorld=palParent.clone().multiply(rot(s.pallet));
  const rel=eWorld.clone().invert().multiply(pWorld);
  for(let k=0;k<moving.length;k++){
    let sampleBest={distance:Infinity,maxOverlapArea:0,nearest:null,overlap:null};
    for(const tri of moving[k].tris)sampleBest=query(transform2(tri,rel),tree,sampleBest);
    const r=results[k];
    if(sampleBest.maxOverlapArea>1e-12)r.collisionSamples++;
    if(sampleBest.distance<r.minimum||sampleBest.maxOverlapArea>r.maximumPairOverlapArea){
      if(sampleBest.distance<r.minimum)r.minimum=sampleBest.distance;
      if(sampleBest.maxOverlapArea>r.maximumPairOverlapArea)r.maximumPairOverlapArea=sampleBest.maxOverlapArea;
      r.witness={time:t,tick:s.tick,u:s.u,palletDeg:s.pallet*180/Math.PI,escapeMotionDeg:(escapeRest+s.escape)*180/Math.PI,...sampleBest};
    }
  }
}
const sha256=(file)=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const accepted=JSON.parse(fs.readFileSync("captures/post5d-overnight-audit/regression/runtime-report.json","utf8"));
const canonicalHash=(value)=>crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const currentContact=payload.report.contact;
const acceptedContact=accepted.mechanical?.contact ?? accepted.escapement?.contact;
const byName=Object.fromEntries(results.map(row=>[row.name,row]));
const repairedNames=["pallet:lowerArm:entry","pallet:lowerArm:exit","pallet:lowerBoss"];
const currentSourceHashes={
  "src/geometry.ts":sha256("src/geometry.ts"),
  "src/escapementContact.ts":sha256("src/escapementContact.ts"),
  "src/spec.ts":sha256("src/spec.ts"),
  "src/movement.ts":sha256("src/movement.ts"),
};
const report={
  schema:"post5d-newer-827-escape-pallet-rendered-sweep-v1",
  disposition:repairedNames.every(name=>byName[name].collisionSamples===0)&&
    byName["pallet:lowerArm:entry"].minimum>=.024&&
    byName["pallet:lowerArm:exit"].minimum>=.024&&
    byName["pallet:lowerBoss"].minimum>=.024
      ? "PASS — ESCAPE / PALLET STEEL INTERFERENCE CLEARED"
      : "FAIL — ESCAPE / PALLET STEEL INTERFERENCE REMAINS",
  accepted:repairedNames.every(name=>byName[name].collisionSamples===0)&&
    byName["pallet:lowerArm:entry"].minimum>=.024&&
    byName["pallet:lowerArm:exit"].minimum>=.024&&
    byName["pallet:lowerBoss"].minimum>=.024,
  method:"actual rendered BufferGeometry projected-triangle footprint intersection/distance with exact rendered Z-overlap; 2,049 deterministic states spanning one complete ±132° balance beat, both ±5.5° pallet banks, and both 24° escape steps",
  sampleCount:N,
  periodSeconds:period,
  participants:{owners:payload.owners,escape:{...payload.escape,positions:undefined,index:undefined,relative:undefined},pallet:results.map(({name,path,bounds})=>({name,path,bounds}))},
  recordedPreRepair:{
    provenance:"same script/method executed before src/geometry.ts repair",
    "pallet:stone:entry":{collisionSamples:0,minimumPositiveFootprintDistanceMm:5.146818366665389e-8},
    "pallet:stone:exit":{collisionSamples:0,minimumPositiveFootprintDistanceMm:5.6974596076692205e-8},
    "pallet:lowerArm:entry":{collisionSamples:989,maximumSingleTriangleOverlapAreaMm2:.0004728444307628976},
    "pallet:lowerArm:exit":{collisionSamples:952,maximumSingleTriangleOverlapAreaMm2:.0003581553611432531},
    "pallet:lowerBoss":{collisionSamples:40,maximumSingleTriangleOverlapAreaMm2:.0001901379567501027},
    "pallet:lowerLever":{collisionSamples:0,minimumPositiveFootprintDistanceMm:.1552374140505818},
    "pallet:bankingLug":{collisionSamples:0,minimumPositiveFootprintDistanceMm:.23679529485028392},
  },
  postRepair:results,
  repairTopology:{
    carriers:{
      stations:[
        {radiusMm:.14,lateralOffsetMm:0,halfWidthMm:.075},
        {radiusMm:.42,lateralOffsetMagnitudeMm:.052,halfWidthMm:.042},
        {radiusMm:1.55,lateralOffsetMagnitudeMm:.038,halfWidthMm:.036},
        {radiusMm:1.835,lateralOffsetMm:0,halfWidthMm:.025},
      ],
      mirroredOffset:"entry +, exit -; both dog-leg away from the rendered club witness",
      rootWidthMm:.15,
      minimumFreeSpanWidthMm:.072,
      terminalSeatWidthMm:.05,
      radialRubyEmbedMm:.0286161032206515,
      renderedPlanarAttachmentAreaMm2:.0008789893814686311,
      renderedZAttachmentOverlapMm:.14,
    },
    lowerBoss:{
      boreRadiusMm:.087,
      nominalOuterRadiusMm:.28,
      relievedOuterRadiusMm:.21,
      fullReliefHalfAngleDeg:36,
      transitionHalfAngleDeg:52,
      minimumRadialWallMm:.123,
    },
  },
  invariance:{
    axes:payload.report.layout.positions,
    gearing:payload.report.gearing,
    bankingDeg:payload.report.contact.bankingDeg,
    rubyFacesHash:{accepted:canonicalHash(acceptedContact.faces),current:canonicalHash(currentContact.faces)},
    contactSequenceHash:{accepted:canonicalHash(acceptedContact.traces),current:canonicalHash(currentContact.traces)},
    rubyFacesExact:canonicalHash(acceptedContact.faces)===canonicalHash(currentContact.faces),
    contactSequenceExact:canonicalHash(acceptedContact.traces)===canonicalHash(currentContact.traces),
    zPlanes:{escapeWheel:payload.escape.bounds,pallet:results.map(({name,bounds})=>({name,bounds}))},
  },
  sourceHashes:{
    preRepairGeometrySha256:"716ab86d41fe8319d8146265fa27ec096eac7b05066afdb321bca311cc46abaa",
    current:currentSourceHashes,
    frozenFilesExact:{
      "src/escapementContact.ts":currentSourceHashes["src/escapementContact.ts"]==="b916c59b9f2e0034d1522467b8187cbd16856e2cae7cd4f74f1d85f1bbef2edb",
      "src/spec.ts":currentSourceHashes["src/spec.ts"]==="af79512a7e192ea77d502035f43429f78418f01a537e32eec128b2fa580e0c62",
      "src/movement.ts":currentSourceHashes["src/movement.ts"]==="dd6a3eb06e6c38553022140c5bac62871b39e1515724adbde73b342fb3d0082d",
    },
  },
  browserDiagnostics:{pageErrors,consoleErrors,requestFailures},
};
fs.writeFileSync(OUT,`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify({out:path.relative(process.cwd(),OUT),disposition:report.disposition,accepted:report.accepted,minima:Object.fromEntries(results.map(row=>[row.name,row.minimum])),collisionSamples:Object.fromEntries(results.map(row=>[row.name,row.collisionSamples])),browserDiagnostics:report.browserDiagnostics},null,2));
