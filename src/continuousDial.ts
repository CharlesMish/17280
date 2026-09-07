import * as T from "three";
import type { ReadoutLayer } from "./readout";

export const DIAL_MODES = ["mist", "hidden"] as const;
export type DialMode = typeof DIAL_MODES[number];

/** Selected continuous dial: cool mist, restrained radial brushing, 65% opacity. */
export function createContinuousDial(readout: ReadoutLayer, renderer: T.WebGLRenderer, initialMode: DialMode) {
 const p=readout.plan;
 const root=new T.Group();root.name="dial:continuous";
 const shape=new T.Shape(p.chapter.carrierOuter.map(v=>new T.Vector2(v.x,v.y)));
 const bore=new T.Path();bore.absarc(0,0,.55,0,Math.PI*2,true);shape.holes.push(bore);
 const geometry=new T.ExtrudeGeometry(shape,{depth:.15,bevelEnabled:false,curveSegments:64});
 const pos=geometry.attributes.position,uv=geometry.attributes.uv;
 for(let i=0;i<uv.count;i++)uv.setXY(i,(pos.getX(i)+16)/32,(pos.getY(i)+16)/32);
 uv.needsUpdate=true;
 const size=1024,washBytes=new Uint8Array(size*size*4),roughBytes=new Uint8Array(size*size*4),directionBytes=new Uint8Array(size*size*4);
 const center=new T.Color('#c6d2df'),edge=new T.Color('#b2c1d0'),color=new T.Color();
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const px=(x+.5)/size*32-16,py=(y+.5)/size*32-16,r=Math.hypot(px,py),theta=Math.atan2(py,px),i=(y*size+x)*4;
  color.copy(center).lerp(edge,T.MathUtils.smoothstep(r,1,14)).convertLinearToSRGB();
  washBytes.set([Math.round(color.r*255),Math.round(color.g*255),Math.round(color.b*255),255],i);
  const fade=T.MathUtils.smoothstep(r,.8,3);
  const grain=(Math.sin(theta*256)+.35*Math.sin(theta*391+.8))/1.35;
  const rough=Math.round((.96+.018*grain*fade)*255);
  roughBytes.set([rough,rough,rough,255],i);
  directionBytes.set([Math.round((Math.cos(theta)*.5+.5)*255),Math.round((Math.sin(theta)*.5+.5)*255),Math.round(fade*255),255],i);
 }
 const texture=(bytes: Uint8Array,srgb=false)=>{
  const tex=new T.DataTexture(bytes,size,size,T.RGBAFormat);tex.colorSpace=srgb?T.SRGBColorSpace:T.NoColorSpace;
  tex.minFilter=T.LinearMipmapLinearFilter;tex.magFilter=T.LinearFilter;tex.generateMipmaps=true;tex.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());tex.needsUpdate=true;return tex;
 };
 const wash=texture(washBytes,true),rough=texture(roughBytes),direction=texture(directionBytes);
 const face=new T.MeshPhysicalMaterial({color:0xffffff,map:wash,metalness:.6,roughness:.5,roughnessMap:rough,anisotropy:.32,anisotropyMap:direction,envMapIntensity:1.1,transparent:true,opacity:.65,depthWrite:false});
 const side=new T.MeshPhysicalMaterial({color:0xbcc9d6,metalness:.6,roughness:.48,envMapIntensity:1.1,transparent:true,opacity:.65,depthWrite:false});
 const surface=new T.Mesh(geometry,[face,side]);surface.name="dial:surface";surface.position.z=4.25;root.add(surface);
 const tickMaterial=new T.MeshPhysicalMaterial({color:0x28303c,metalness:.2,roughness:.65});
 const contour=p.chapter.carrierInner;
 for(let i=0;i<60;i++){
  if(i%5===0)continue;
  const angle=i*Math.PI/30,dx=Math.sin(angle),dy=Math.cos(angle);
  let radius=Infinity;
  for(let j=0;j<contour.length;j++){
   const a=contour[j],b=contour[(j+1)%contour.length],ex=b.x-a.x,ey=b.y-a.y;
   const cross=dx*ey-dy*ex;if(Math.abs(cross)<1e-9)continue;
   const t=(a.x*ey-a.y*ex)/cross,u=(a.x*dy-a.y*dx)/cross;
   if(t>0&&u>=0&&u<=1)radius=Math.min(radius,t);
  }
  if(!Number.isFinite(radius))throw new Error("Dial graduation misses chapter contour");
  const tick=new T.Mesh(new T.PlaneGeometry(.045,.23),tickMaterial);tick.name=`dial:minute:${i}`;
  tick.position.set(dx*(radius-.30),dy*(radius-.30),4.406);tick.rotation.z=-angle;root.add(tick);
 }
 readout.root.add(root);
 let mode=initialMode,product=true;
 const sync=()=>{root.visible=product&&mode==="mist";};
 const applyReadoutFinish=()=>{
  const m=readout.materials;
  for(const key of ["hourFace","minuteFace","hubCap"] as const){m[key].color.setHex(0x163c78);m[key].metalness=.92;m[key].roughness=.23;}
  for(const key of ["hourEdge","minuteEdge"] as const){m[key].color.setHex(0x7890b1);m[key].metalness=.95;m[key].roughness=.12;}
  for(const key of ["indexFace","cardinalFace"] as const){m[key].color.setHex(0x202b3a);m[key].metalness=.5;m[key].roughness=.3;}
 };
 sync();
 return {root,surface,applyReadoutFinish,mode:()=>mode,
  setMode(next:DialMode){if(!DIAL_MODES.includes(next))throw new Error(`Unknown dial mode: ${next}`);mode=next;sync();},
  setProduct(on:boolean){product=on;sync();},
  report:()=>({mode,visible:root.visible&&readout.root.visible,opacity:.65,finish:"restrained cool-mist sunburst",viewingApertures:0,spindleBoreRadius:.55,z:[4.25,4.4],minuteGraduations:48,anisotropy:.32,assembly:"Moves with the motion-works/readout layer; dial attachment is illustrative."}),
 };
}
