import * as THREE from "three";
import { hoopShape, finishedStructure } from "./structureGeometry";
import type { DisplayPlan } from "./displayPlan";
import type { AccommodationPlan } from "./accommodationPlan";

export type DisplayMaterials = {
  interface: THREE.MeshPhysicalMaterial;
  hourPipe: THREE.MeshPhysicalMaterial;
  minutePipe: THREE.MeshPhysicalMaterial;
  hourSweep: THREE.MeshBasicMaterial;
  minuteSweep: THREE.MeshBasicMaterial;
  chapter: THREE.MeshBasicMaterial;
  envelope: THREE.MeshBasicMaterial;
  truth: THREE.MeshLambertMaterial;
  lineCavity: THREE.LineBasicMaterial;
  lineChapter: THREE.LineBasicMaterial;
};

export function createDisplayMaterials(): DisplayMaterials {
  return {
    interface: new THREE.MeshPhysicalMaterial({ color: 0x8a9098, metalness: 0.45, roughness: 0.42 }),
    hourPipe: new THREE.MeshPhysicalMaterial({ color: 0x9aa0a8, metalness: 0.5, roughness: 0.4 }),
    minutePipe: new THREE.MeshPhysicalMaterial({ color: 0xb4bac2, metalness: 0.55, roughness: 0.36 }),
    hourSweep: new THREE.MeshBasicMaterial({
      color: 0xe8a04a,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    minuteSweep: new THREE.MeshBasicMaterial({
      color: 0x5aa8e8,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    chapter: new THREE.MeshBasicMaterial({
      color: 0x9b7ed9,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    envelope: new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    truth: new THREE.MeshLambertMaterial({ color: 0xd0d4da }),
    lineCavity: new THREE.LineBasicMaterial({ color: 0x66d0ff }),
    lineChapter: new THREE.LineBasicMaterial({ color: 0xc9a0ff }),
  };
}

function tube(inner: number, outer: number, z0: number, z1: number, mat: THREE.Material): THREE.Mesh {
  const h = Math.max(0.04, z1 - z0);
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, Math.max(0.02, inner), 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 28 });
  geo.translate(0, 0, -h / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.z = (z0 + z1) / 2;
  return mesh;
}

function disc(r: number, z0: number, z1: number, mat: THREE.Material): THREE.Mesh {
  const h = Math.max(0.02, z1 - z0);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 48), mat);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.z = (z0 + z1) / 2;
  return mesh;
}

function loop(pts: { x: number; y: number }[], z: number, mat: THREE.LineBasicMaterial): THREE.LineLoop {
  const v = pts.map((p) => new THREE.Vector3(p.x, p.y, z));
  v.push(v[0].clone());
  return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(v), mat);
}

export function buildDisplayStack(plan: DisplayPlan, mats: DisplayMaterials): THREE.Group {
  const g = new THREE.Group();
  g.name = "display:stack";
  g.position.set(plan.axis.x, plan.axis.y, 0);
  const base = plan.interfaceBase;
  const carrier = tube(base.innerR, base.outerR, base.z0, base.z1, mats.interface);
  carrier.name = "display:interfaceCarrier";
  g.add(carrier);
  // Phase 3B's coaxial cylinders were packaging witnesses only. Phase 4B
  // consumes the same plan envelopes with separately owned rotating members;
  // leaving the witnesses here would create duplicate stationary solids.
  return g;
}

export function buildSweeps(plan: DisplayPlan, mats: DisplayMaterials): THREE.Group {
  const g = new THREE.Group();
  g.name = "display:sweeps";
  const hour = disc(plan.hourSweep.radius, plan.hourSweep.z0, plan.hourSweep.z1, mats.hourSweep);
  hour.position.x = plan.axis.x;
  hour.position.y = plan.axis.y;
  hour.name = plan.hourSweep.id;
  const minute = disc(plan.minuteSweep.radius, plan.minuteSweep.z0, plan.minuteSweep.z1, mats.minuteSweep);
  minute.position.x = plan.axis.x;
  minute.position.y = plan.axis.y;
  minute.name = plan.minuteSweep.id;
  g.add(hour, minute);
  return g;
}

export function buildChapter(plan: DisplayPlan, mats: DisplayMaterials): THREE.Group {
  const g = new THREE.Group();
  g.name = "display:chapter";
  const h = plan.chapter.z1 - plan.chapter.z0;
  const mesh = finishedStructure(
    hoopShape(plan.chapter.outer, plan.chapter.inner),
    h,
    mats.chapter,
    mats.chapter,
    18,
  );
  mesh.position.z = (plan.chapter.z0 + plan.chapter.z1) / 2;
  g.add(mesh);
  return g;
}

export function buildEnvelopeGhost(plan: DisplayPlan, mats: DisplayMaterials): THREE.Group {
  const g = new THREE.Group();
  g.name = "display:envelope";
  const h = plan.envelope.maxZ - plan.chapter.z0;
  const mesh = finishedStructure(hoopShape(plan.chapter.outer, plan.chapter.inner), Math.max(0.08, h), mats.envelope, mats.envelope, 16);
  mesh.position.z = (plan.chapter.z0 + plan.envelope.maxZ) / 2;
  g.add(mesh);
  return g;
}

export function buildDisplayDebug(
  plan: DisplayPlan,
  acc: AccommodationPlan,
  mats: DisplayMaterials,
): THREE.Group {
  const g = new THREE.Group();
  g.name = "display:debug";
  g.add(loop(acc.cavityContour, plan.chapter.z1 + 0.02, mats.lineCavity));
  g.add(loop(plan.chapter.outer, plan.chapter.z1 + 0.04, mats.lineChapter));
  g.add(loop(plan.chapter.inner, plan.chapter.z1 + 0.05, mats.lineChapter));
  const axis = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 10), mats.interface);
  axis.rotation.x = Math.PI / 2;
  axis.position.set(plan.axis.x, plan.axis.y, plan.planes.hourMount);
  g.add(axis);
  return g;
}
