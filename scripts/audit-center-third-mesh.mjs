import { chromium } from "playwright";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve(process.argv[2] || "captures/post5d-newer-827-correction/05-center-third-mesh-report.json");
const BASE = process.argv[3] || "http://127.0.0.1:5173";
const phaseOverrideDeg = Number(process.env.MESH_PHASE_DEG || process.env.THIRD_PINION_PHASE_DEG || 0);
const scan = process.env.SCAN_PHASE === "1";
const exactSamples = Number(process.env.MESH_SAMPLES || 2049);
const pairId = process.env.MESH_PAIR || "center64-third10";
const phaseScanSteps = Number(process.env.SCAN_PHASE_STEPS || 360);
const phaseScanSamples = Number(process.env.SCAN_PHASE_SAMPLES || 513);
const skipAdjacent = process.env.SKIP_ADJACENT === "1";
fs.mkdirSync(path.dirname(OUT), { recursive: true });

const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
page.setDefaultTimeout(300000);
await page.goto(`${BASE}/?static=1&t=0&explode=0`, { waitUntil: "commit", timeout: 60000 });
await page.waitForFunction(() => globalThis.__WATCH__?.sceneDump !== undefined);
const cdp = await page.context().newCDPSession(page);
await cdp.send("Runtime.evaluate", { expression: "import('/node_modules/.vite/deps/three.js').then(m=>globalThis.__T_C3=m)", awaitPromise: true });
const proto = await cdp.send("Runtime.evaluate", { expression: "__T_C3.Scene.prototype" });
const instances = await cdp.send("Runtime.queryObjects", { prototypeObjectId: proto.result.objectId });
await cdp.send("Runtime.callFunctionOn", { objectId: instances.objects.objectId, functionDeclaration: "function(){globalThis.__S_C3=this.find(x=>x.getObjectByName&&x.getObjectByName('calibre'))}" });
const payload = await page.evaluate(() => {
  const T=globalThis.__T_C3,S=globalThis.__S_C3,W=globalThis.__WATCH__;
  W.setTime(0); W.capture(); S.updateMatrixWorld(true);
  const opath=o=>{const a=[];for(let c=o;c;c=c.parent)a.push(c.name||c.type);return a.reverse().join('/')};
  const mesh=name=>{const o=S.getObjectByName(name),p=o.geometry.getAttribute('position'),i=o.geometry.getIndex();o.geometry.computeBoundingBox();const b=o.geometry.boundingBox,wb=b.clone().applyMatrix4(o.matrixWorld);return{name,path:opath(o),motionPath:opath(o.parent.parent),positions:Array.from(p.array),itemSize:p.itemSize,index:i?Array.from(i.array):null,localRotation:o.rotation.z,matrix:o.matrixWorld.toArray(),localBounds:{min:b.min.toArray(),max:b.max.toArray()},worldBounds:{min:wb.min.toArray(),max:wb.max.toArray()}}};
  const owner=name=>{const o=S.getObjectByName(name);return{path:opath(o),rotation:o.rotation.z,worldPosition:o.getWorldPosition(new T.Vector3()).toArray()}};
  return {
    center:mesh('center:wheel'), thirdPinion:mesh('third:pinion'), thirdWheel:mesh('third:wheel'),
    barrelWheel:mesh('barrel:wheel'), centerPinion:mesh('center:pinion'),
    fourthPinion:mesh('fourth:pinion'), fourthWheel:mesh('fourth:wheel'), escapePinion:mesh('escape:pinion'),
    owners:{barrel:owner('barrel:motion'),center:owner('center:motion'),third:owner('third:motion'),fourth:owner('fourth:motion'),escape:owner('escape:motion')},
    goingTrain:W.kinematicReport([0,10,60]), phase4b:W.displayDriveReport([0,60]), package:{structure:W.structureReport(),accommodation:W.accommodationReport(),enclosure:W.enclosureReport(),exterior:W.exteriorReport()}
  };
});
await browser.close();

const pairs = {
  "barrel80-center12": {
    id: "barrel80-center12",
    label: "BARREL WHEEL / CENTER PINION",
    primary: payload.barrelWheel,
    secondary: payload.centerPinion,
    primaryOwner: payload.owners.barrel,
    secondaryOwner: payload.owners.center,
    primaryTeeth: 80,
    secondaryTeeth: 12,
    primaryCut: 5.35,
    secondaryCut: 0.52,
    gate0RenderedOuter: { primary: 5.946525840584782, secondary: 1.0457883713900649 },
    profileLabel: "pair-specific 20 degree involute barrel wheel / center pinion",
  },
  "center64-third10": {
    id: "center64-third10",
    label: "CENTER WHEEL / THIRD PINION",
    primary: payload.center,
    secondary: payload.thirdPinion,
    primaryOwner: payload.owners.center,
    secondaryOwner: payload.owners.third,
    primaryTeeth: 64,
    secondaryTeeth: 10,
    primaryCut: 4.25,
    secondaryCut: 0.42,
    gate0RenderedOuter: null,
    profileLabel: "pair-specific 20 degree involute center wheel / third pinion",
  },
  "third60-fourth8": {
    id: "third60-fourth8",
    label: "THIRD WHEEL / FOURTH PINION",
    primary: payload.thirdWheel,
    secondary: payload.fourthPinion,
    primaryOwner: payload.owners.third,
    secondaryOwner: payload.owners.fourth,
    primaryTeeth: 60,
    secondaryTeeth: 8,
    primaryCut: 3.95,
    secondaryCut: 0.28,
    gate0RenderedOuter: null,
    profileLabel: "pair-specific 20 degree involute third wheel / fourth pinion",
  },
  "fourth56-escape7": {
    id: "fourth56-escape7",
    label: "FOURTH WHEEL / ESCAPE PINION",
    primary: payload.fourthWheel,
    secondary: payload.escapePinion,
    primaryOwner: payload.owners.fourth,
    secondaryOwner: payload.owners.escape,
    primaryTeeth: 56,
    secondaryTeeth: 7,
    primaryCut: 3.68,
    secondaryCut: 0.22,
    gate0RenderedOuter: { primary: 4.206536598765909, secondary: 0.683470902471993 },
    profileLabel: "pair-specific 20 degree involute fourth wheel / escape pinion",
  },
};
const pair = pairs[pairId];
if (!pair) throw new Error(`unsupported MESH_PAIR ${pairId}`);

const TAU=Math.PI*2,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const normalize=a=>{a%=TAU;if(a<0)a+=TAU;return a};
function contour(data, innerCut) {
  const layers=new Map();
  for(let n=0;n<data.positions.length;n+=data.itemSize){const x=data.positions[n],y=data.positions[n+1],z=data.positions[n+2],r=Math.hypot(x,y);if(r<innerCut)continue;const k=z.toFixed(8);let row=layers.get(k);if(!row)layers.set(k,row=[]);row.push({x,y,r,z});}
  let selected=null;
  for(const [z,rows] of layers){const maxR=Math.max(...rows.map(p=>p.r));if(!selected||maxR>selected.maxR)selected={z:Number(z),rows,maxR};}
  const byAngle=new Map();
  for(const p of selected.rows){const a=normalize(Math.atan2(p.y,p.x)),k=a.toFixed(11),old=byAngle.get(k);if(!old||p.r>old.r)byAngle.set(k,{x:p.x,y:p.y,r:p.r,a});}
  const points=[...byAngle.values()].sort((a,b)=>a.a-b.a);
  return {points,z:selected.z,maxRadius:selected.maxR,layerVertexCount:selected.rows.length};
}
const centerContour=contour(pair.primary,pair.primaryCut);
const pinionContour=contour(pair.secondary,pair.secondaryCut);

const orient=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const bbox=t=>({minX:Math.min(t.a.x,t.b.x,t.c.x),maxX:Math.max(t.a.x,t.b.x,t.c.x),minY:Math.min(t.a.y,t.b.y,t.c.y),maxY:Math.max(t.a.y,t.b.y,t.c.y)});
const overlapBox=(a,b)=>a.minX<=b.maxX&&a.maxX>=b.minX&&a.minY<=b.maxY&&a.maxY>=b.minY;
function clip(subject,triangle){let out=subject;const sign=orient(triangle[0],triangle[1],triangle[2])>=0?1:-1;for(let j=0;j<3;j++){const A=triangle[j],B=triangle[(j+1)%3],input=out;out=[];if(!input.length)break;const inside=p=>sign*orient(A,B,p)>=-1e-13;const cross=(P,Q)=>{const rx=Q.x-P.x,ry=Q.y-P.y,sx=B.x-A.x,sy=B.y-A.y,d=rx*sy-ry*sx;if(Math.abs(d)<1e-20)return{x:(P.x+Q.x)/2,y:(P.y+Q.y)/2};const t=((A.x-P.x)*sy-(A.y-P.y)*sx)/d;return{x:P.x+t*rx,y:P.y+t*ry}};let S=input.at(-1),sin=inside(S);for(const E of input){const ein=inside(E);if(ein){if(!sin)out.push(cross(S,E));out.push(E)}else if(sin)out.push(cross(S,E));S=E;sin=ein}}return out}
const area=p=>{let s=0;for(let i=0;i<p.length;i++)s+=p[i].x*p[(i+1)%p.length].y-p[(i+1)%p.length].x*p[i].y;return Math.abs(s)*.5};
function tree(rows){let box={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity};for(const r of rows){box.minX=Math.min(box.minX,r.box.minX);box.maxX=Math.max(box.maxX,r.box.maxX);box.minY=Math.min(box.minY,r.box.minY);box.maxY=Math.max(box.maxY,r.box.maxY)}if(rows.length<=12)return{box,rows};const axis=box.maxX-box.minX>=box.maxY-box.minY?'x':'y';rows.sort((a,b)=>(a.box[`min${axis.toUpperCase()}`]+a.box[`max${axis.toUpperCase()}`])-(b.box[`min${axis.toUpperCase()}`]+b.box[`max${axis.toUpperCase()}`]));const m=Math.floor(rows.length/2);return{box,left:tree(rows.slice(0,m)),right:tree(rows.slice(m))}}
function fan(points,center={x:0,y:0}){return points.map((p,i)=>{const t={a:center,b:p,c:points[(i+1)%points.length],edge:i};return{...t,box:bbox(t)}})}
const centerFan=fan(centerContour.points),centerTree=tree([...centerFan]);
function intersectTri(t,node,state){if(!overlapBox(t.box,node.box))return;if(node.rows){for(const f of node.rows){if(!overlapBox(t.box,f.box))continue;const poly=clip([t.a,t.b,t.c],[f.a,f.b,f.c]);if(poly.length<3)continue;const a=area(poly);if(a>1e-14){state.area+=a;if(a>state.maxPairArea)state.maxPairArea=a,state.pair={centerEdge:f.edge,pinionEdge:t.edge,polygon:poly,centerTriangle:[f.a,f.b,f.c],pinionTriangle:[t.a,t.b,t.c]};}}return}intersectTri(t,node.left,state);intersectTri(t,node.right,state)}
const pointSeg=(p,a,b)=>{const x=b.x-a.x,y=b.y-a.y,d=x*x+y*y;if(d===0)return{distance:Math.hypot(p.x-a.x,p.y-a.y),point:{...a}};const t=clamp(((p.x-a.x)*x+(p.y-a.y)*y)/d,0,1),q={x:a.x+x*t,y:a.y+y*t};return{distance:Math.hypot(p.x-q.x,p.y-q.y),point:q}};
function segSeg(a,b,c,d){const r={x:b.x-a.x,y:b.y-a.y},s={x:d.x-c.x,y:d.y-c.y},den=r.x*s.y-r.y*s.x;if(Math.abs(den)>1e-16){const t=((c.x-a.x)*s.y-(c.y-a.y)*s.x)/den,u=((c.x-a.x)*r.y-(c.y-a.y)*r.x)/den;if(t>=0&&t<=1&&u>=0&&u<=1){const p={x:a.x+t*r.x,y:a.y+t*r.y};return{distance:0,a:p,b:p}}}const rows=[[pointSeg(a,c,d),a],[pointSeg(b,c,d),b],[pointSeg(c,a,b),c],[pointSeg(d,a,b),d]];let best={distance:Infinity};for(let i=0;i<4;i++){const [v,p]=rows[i];const candidate=i<2?{distance:v.distance,a:p,b:v.point}:{distance:v.distance,a:v.point,b:p};if(candidate.distance<best.distance)best=candidate}return best}
const centerEdges=centerContour.points.map((a,i)=>{const b=centerContour.points[(i+1)%centerContour.points.length];return{a,b,edge:i,box:{minX:Math.min(a.x,b.x),maxX:Math.max(a.x,b.x),minY:Math.min(a.y,b.y),maxY:Math.max(a.y,b.y)}}});
const centerEdgeTree=tree([...centerEdges]);
const boxDistance=(a,b)=>Math.hypot(Math.max(0,a.minX-b.maxX,b.minX-a.maxX),Math.max(0,a.minY-b.maxY,b.minY-a.maxY));
function nearestEdge(row,node,best){if(boxDistance(row.box,node.box)>=best.distance)return best;if(node.rows){for(const fixed of node.rows){if(boxDistance(row.box,fixed.box)>=best.distance)continue;const r=segSeg(fixed.a,fixed.b,row.a,row.b);if(r.distance<best.distance)best={...r,edgeA:fixed.edge,edgeB:row.edge};}return best}const dl=boxDistance(row.box,node.left.box),dr=boxDistance(row.box,node.right.box);if(dl<=dr){best=nearestEdge(row,node.left,best);best=nearestEdge(row,node.right,best)}else{best=nearestEdge(row,node.right,best);best=nearestEdge(row,node.left,best)}return best}
function boundaryDistance(_a,b){let best={distance:Infinity};for(let j=0;j<b.length;j++){const a=b[j],c=b[(j+1)%b.length],row={a,b:c,edge:j,box:{minX:Math.min(a.x,c.x),maxX:Math.max(a.x,c.x),minY:Math.min(a.y,c.y),maxY:Math.max(a.y,c.y)}};best=nearestEdge(row,centerEdgeTree,best);if(best.distance===0)return best}return best}

const centerRest=pair.primaryOwner.rotation,thirdRest=pair.secondaryOwner.rotation;
const centerAxis=pair.primaryOwner.worldPosition,thirdAxis=pair.secondaryOwner.worldPosition;
const dx=thirdAxis[0]-centerAxis[0],dy=thirdAxis[1]-centerAxis[1];
function transformPinion(centerDelta,phase){const centerAngle=centerRest+pair.primary.localRotation+centerDelta,thirdAngle=thirdRest-centerDelta*(pair.primaryTeeth/pair.secondaryTeeth)+pair.secondary.localRotation+phase;const ca=Math.cos(-centerAngle),sa=Math.sin(-centerAngle),tx=ca*dx-sa*dy,ty=sa*dx+ca*dy,rel=thirdAngle-centerAngle,c=Math.cos(rel),s=Math.sin(rel);return pinionContour.points.map(p=>({x:tx+c*p.x-s*p.y,y:ty+s*p.x+c*p.y}))}
function stateAt(centerDelta,phase,withDistance=false){const points=transformPinion(centerDelta,phase),rows=fan(points,{x:points.reduce((s,p)=>s+p.x,0)/points.length,y:points.reduce((s,p)=>s+p.y,0)/points.length});const state={area:0,maxPairArea:0,pair:null};for(const t of rows)intersectTri(t,centerTree,state);const dist=withDistance&&state.area<=1e-12?boundaryDistance(centerContour.points,points):null;return{...state,distance:dist?.distance??null,nearest:dist};}
function sweep(phase,N=1025,withDistance=true){let maximumArea=0,collisionSamples=0,minClearance=Infinity,witness=null;for(let i=0;i<N;i++){const d=(TAU/pair.primaryTeeth)*i/(N-1),r=stateAt(d,phase,withDistance);if(r.area>1e-12)collisionSamples++;if(r.area>maximumArea||(!witness&&r.distance<minClearance))witness={sample:i,centerDeltaRad:d,centerDeltaDeg:d*180/Math.PI,...r};maximumArea=Math.max(maximumArea,r.area);if(r.area<=1e-12&&r.distance!==null&&r.distance<minClearance){minClearance=r.distance;if(maximumArea<=1e-12)witness={sample:i,centerDeltaRad:d,centerDeltaDeg:d*180/Math.PI,...r};}}return{phaseRad:phase,phaseDeg:phase*180/Math.PI,sampleCount:N,collisionSamples,maximumIntersectionAreaMm2:maximumArea,minimumPositiveClearanceMm:Number.isFinite(minClearance)?minClearance:null,witness};}
function refineMinimum(phase,coarse,N=2049){
  if(!coarse.witness||coarse.collisionSamples)return null;
  const period=TAU/pair.primaryTeeth,coarseStep=period/(coarse.sampleCount-1),center=coarse.witness.centerDeltaRad;
  const start=center-coarseStep,end=center+coarseStep;
  let collisionSamples=0,maximumArea=0,minClearance=Infinity,witness=null;
  for(let i=0;i<N;i++){
    const d=start+(end-start)*i/(N-1),r=stateAt(d,phase,true);
    if(r.area>1e-12)collisionSamples++;
    maximumArea=Math.max(maximumArea,r.area);
    if(r.area<=1e-12&&r.distance!==null&&r.distance<minClearance){minClearance=r.distance;witness={sample:i,centerDeltaRad:d,centerDeltaDeg:d*180/Math.PI,...r};}
  }
  return{sampleCount:N,rangeRad:[start,end],rangeDeg:[start*180/Math.PI,end*180/Math.PI],collisionSamples,maximumIntersectionAreaMm2:maximumArea,minimumPositiveClearanceMm:Number.isFinite(minClearance)?minClearance:null,witness};
}

let phaseScan=null;
if(scan){const candidates=[];const halfPitch=Math.PI/pair.secondaryTeeth;for(let i=0;i<=phaseScanSteps;i++){const phase=-halfPitch+(2*halfPitch)*i/phaseScanSteps,c=sweep(phase,phaseScanSamples,false);candidates.push(c)}candidates.sort((a,b)=>a.collisionSamples-b.collisionSamples||a.maximumIntersectionAreaMm2-b.maximumIntersectionAreaMm2);phaseScan={candidateCount:phaseScanSteps+1,samplesPerCandidate:phaseScanSamples,rangeDeg:[-halfPitch*180/Math.PI,halfPitch*180/Math.PI],best:candidates.slice(0,16)};}
const result=sweep(phaseOverrideDeg*Math.PI/180,exactSamples,true);
const localRefinement=refineMinimum(phaseOverrideDeg*Math.PI/180,result);
function screenPair({id,primary,secondary,primaryOwner,secondaryOwner,primaryTeeth,secondaryTeeth,primaryCut,secondaryCut,N=2049}){
  const aContour=contour(primary,primaryCut),bContour=contour(secondary,secondaryCut),aTree=tree(fan(aContour.points));
  const ax=primaryOwner.worldPosition,bx=secondaryOwner.worldPosition,dx=bx[0]-ax[0],dy=bx[1]-ax[1];
  let collisionSamples=0,maximumIntersectionAreaMm2=0,witness=null;
  for(let i=0;i<N;i++){
    const d=(TAU/primaryTeeth)*i/(N-1),aAngle=primaryOwner.rotation+primary.localRotation+d,bAngle=secondaryOwner.rotation+secondary.localRotation-d*(primaryTeeth/secondaryTeeth);
    const ca=Math.cos(-aAngle),sa=Math.sin(-aAngle),tx=ca*dx-sa*dy,ty=sa*dx+ca*dy,rel=bAngle-aAngle,c=Math.cos(rel),s=Math.sin(rel);
    const points=bContour.points.map(p=>({x:tx+c*p.x-s*p.y,y:ty+s*p.x+c*p.y})),rows=fan(points,{x:tx,y:ty}),state={area:0,maxPairArea:0,pair:null};
    for(const tri of rows)intersectTri(tri,aTree,state);
    if(state.area>1e-12)collisionSamples++;
    if(state.area>maximumIntersectionAreaMm2){maximumIntersectionAreaMm2=state.area;witness={sample:i,primaryDeltaDeg:d*180/Math.PI,...state};}
  }
  const zOverlap=Math.min(primary.worldBounds.max[2],secondary.worldBounds.max[2])-Math.max(primary.worldBounds.min[2],secondary.worldBounds.min[2]);
  return{id,participants:{primary:{name:primary.name,path:primary.path,motionPath:primary.motionPath,teeth:primaryTeeth},secondary:{name:secondary.name,path:secondary.path,motionPath:secondary.motionPath,teeth:secondaryTeeth}},sampleCount:N,axialOverlapMm:zOverlap,centerDistanceMm:Math.hypot(dx,dy),collisionSamples,maximumIntersectionAreaMm2,witness,classification:zOverlap<=0?'AXIALLY SEPARATED':collisionSamples?'RENDERED VOLUMETRIC PENETRATION':'NO RENDERED INTERSECTION'};
}
const otherPairScreens=skipAdjacent ? [] : [
  screenPair({id:'barrel80-center12',primary:payload.barrelWheel,secondary:payload.centerPinion,primaryOwner:payload.owners.barrel,secondaryOwner:payload.owners.center,primaryTeeth:80,secondaryTeeth:12,primaryCut:5.35,secondaryCut:.52}),
  screenPair({id:'center64-third10',primary:payload.center,secondary:payload.thirdPinion,primaryOwner:payload.owners.center,secondaryOwner:payload.owners.third,primaryTeeth:64,secondaryTeeth:10,primaryCut:4.25,secondaryCut:.42}),
  screenPair({id:'third60-fourth8',primary:payload.thirdWheel,secondary:payload.fourthPinion,primaryOwner:payload.owners.third,secondaryOwner:payload.owners.fourth,primaryTeeth:60,secondaryTeeth:8,primaryCut:3.95,secondaryCut:.28}),
  screenPair({id:'fourth56-escape7',primary:payload.fourthWheel,secondary:payload.escapePinion,primaryOwner:payload.owners.fourth,secondaryOwner:payload.owners.escape,primaryTeeth:56,secondaryTeeth:7,primaryCut:3.68,secondaryCut:.22}),
];
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const zOverlap=Math.min(pair.primary.worldBounds.max[2],pair.secondary.worldBounds.max[2])-Math.max(pair.primary.worldBounds.min[2],pair.secondary.worldBounds.min[2]);
const nominalPitchToothThickness=Math.PI*.145/2;
const analytic=(teeth,style)=>{const pitch=.145*teeth/2,root=Math.max(pitch-.145*(style==='pinion'?1.25:1.12),pitch*.52),tip=pitch+.145*(style==='pinion'?1.1:.9);return{pitchRadiusMm:pitch,rootRadiusMm:root,tipRadiusMm:tip}};
const radialEnvelope={
  policy:"frozen analytic pitch/root/tip radii preserved; the authorized rendered contraction removes only the legacy expanding-bevel overshoot",
  primary:{...analytic(pair.primaryTeeth,'wheel'),gate0RenderedMaxRadiusMm:pair.gate0RenderedOuter?.primary??null,currentRenderedMaxRadiusMm:centerContour.maxRadius,renderedDeltaFromGate0Mm:pair.gate0RenderedOuter?centerContour.maxRadius-pair.gate0RenderedOuter.primary:null,noRenderedGrowth:pair.gate0RenderedOuter?centerContour.maxRadius<=pair.gate0RenderedOuter.primary:true},
  secondary:{...analytic(pair.secondaryTeeth,'pinion'),gate0RenderedMaxRadiusMm:pair.gate0RenderedOuter?.secondary??null,currentRenderedMaxRadiusMm:pinionContour.maxRadius,renderedDeltaFromGate0Mm:pair.gate0RenderedOuter?pinionContour.maxRadius-pair.gate0RenderedOuter.secondary:null,noRenderedGrowth:pair.gate0RenderedOuter?pinionContour.maxRadius<=pair.gate0RenderedOuter.secondary:true},
};
const report={schema:'post5d-rendered-train-mesh-v2',pairId:pair.id,classification:result.collisionSamples?`DEFECT — ${pair.label} VOLUMETRIC PENETRATION`:`VALID — ${pair.label} POSITIVE CLEARANCE`,participants:{primary:{...pair.primary,positions:undefined,index:undefined,teeth:pair.primaryTeeth},secondary:{...pair.secondary,positions:undefined,index:undefined,teeth:pair.secondaryTeeth}},geometry:{primaryContour:{points:centerContour.points.length,z:centerContour.z,maxRadius:centerContour.maxRadius},secondaryContour:{points:pinionContour.points.length,z:pinionContour.z,maxRadius:pinionContour.maxRadius},centerDistanceMm:Math.hypot(dx,dy),requiredPitchSumMm:.145*pair.primaryTeeth/2+.145*pair.secondaryTeeth/2,axialOverlapMm:zOverlap,radialEnvelope,profile:{type:pair.profileLabel,pressureAngleDeg:20,totalPitchCircleBacklashMm:.02,nominalToothThicknessMm:nominalPitchToothThickness,finishedToothThicknessEachMm:nominalPitchToothThickness-.01,primaryMotionPhaseDeg:centerRest*180/Math.PI,primaryLocalClockingDeg:pair.primary.localRotation*180/Math.PI,secondaryMotionPhaseDeg:thirdRest*180/Math.PI,secondaryLocalClockingDeg:pair.secondary.localRotation*180/Math.PI}},method:`actual rendered BufferGeometry maximum-section contours; exact star-polygon fan triangle clipping over ${exactSamples.toLocaleString('en-US')} states spanning one complete ${pair.primaryTeeth}T/${pair.secondaryTeeth}T repeating mesh cycle; ${localRefinement?.sampleCount??0}-state local refinement around the coarse minimum; boundary-segment BVH nearest points for positive clearance`,phaseOverrideDeg,result,localRefinement,phaseScan,otherPairScreens,invariance:{axes:{primary:centerAxis,secondary:thirdAxis},toothCounts:{primary:pair.primaryTeeth,secondary:pair.secondaryTeeth},moduleMm:.145,ratio:`secondaryDelta = -primaryDelta * ${pair.primaryTeeth}/${pair.secondaryTeeth}`,goingTrain:payload.goingTrain,phase4b:payload.phase4b,packageReportHashes:{structure:crypto.createHash('sha256').update(JSON.stringify(payload.package.structure)).digest('hex'),accommodation:crypto.createHash('sha256').update(JSON.stringify(payload.package.accommodation)).digest('hex'),enclosure:crypto.createHash('sha256').update(JSON.stringify(payload.package.enclosure)).digest('hex'),exterior:crypto.createHash('sha256').update(JSON.stringify(payload.package.exterior)).digest('hex')}},sourceHashes:{movement:sha('src/movement.ts'),geometry:sha('src/geometry.ts'),spec:sha('src/spec.ts')}};
fs.writeFileSync(OUT,`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify({out:path.relative(process.cwd(),OUT),classification:report.classification,result,phaseScan},null,2));
