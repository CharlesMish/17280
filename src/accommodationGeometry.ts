import * as THREE from "three";
import { ACC } from "./accommodationSpec";
import type { AccommodationPlan } from "./accommodationPlan";
import { finishedStructure, vecToShape, hoopShape } from "./structureGeometry";

export type AccMaterials = {
  holder: THREE.MeshPhysicalMaterial;
  midcase: THREE.MeshPhysicalMaterial;
  pad: THREE.MeshPhysicalMaterial;
  ghostFront: THREE.MeshBasicMaterial;
  ghostRear: THREE.MeshBasicMaterial;
  ghostDial: THREE.MeshBasicMaterial;
  ghostCorridor: THREE.MeshBasicMaterial;
  contact: THREE.MeshBasicMaterial;
  lineSweep: THREE.LineBasicMaterial;
  lineRequired: THREE.LineBasicMaterial;
  lineCavity: THREE.LineBasicMaterial;
  lineOuter: THREE.LineBasicMaterial;
  boundary: THREE.MeshBasicMaterial;
  truth: THREE.MeshLambertMaterial;
};

export function createAccMaterials(): AccMaterials {
  return {
    holder: new THREE.MeshPhysicalMaterial({ color: 0x6a717c, metalness: 0.55, roughness: 0.45 }),
    midcase: new THREE.MeshPhysicalMaterial({ color: 0x3d424a, metalness: 0.4, roughness: 0.55 }),
    pad: new THREE.MeshPhysicalMaterial({ color: 0x8a909a, metalness: 0.5, roughness: 0.4 }),
    ghostFront: new THREE.MeshBasicMaterial({ color: 0x7ec8ff, transparent: true, opacity: 0.18, depthWrite: false }),
    ghostRear: new THREE.MeshBasicMaterial({ color: 0xf0c14b, transparent: true, opacity: 0.16, depthWrite: false }),
    ghostDial: new THREE.MeshBasicMaterial({ color: 0xb8a0ff, transparent: true, opacity: 0.16, depthWrite: false }),
    ghostCorridor: new THREE.MeshBasicMaterial({ color: 0x6ee0a8, transparent: true, opacity: 0.28, depthWrite: false }),
    contact: new THREE.MeshBasicMaterial({ color: 0xffcc66 }),
    lineSweep: new THREE.LineBasicMaterial({ color: 0xff5555 }),
    lineRequired: new THREE.LineBasicMaterial({ color: 0xffaa33 }),
    lineCavity: new THREE.LineBasicMaterial({ color: 0x55ccff }),
    lineOuter: new THREE.LineBasicMaterial({ color: 0xdddddd }),
    boundary: new THREE.MeshBasicMaterial({ color: 0x44ff88 }),
    truth: new THREE.MeshLambertMaterial({ color: 0xc8ccd2 }),
  };
}

function loop(points: { x: number; y: number }[], z: number, mat: THREE.LineBasicMaterial): THREE.LineLoop {
  const pts = points.map((p) => new THREE.Vector3(p.x, p.y, z));
  pts.push(pts[0].clone());
  return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), mat);
}

export function buildHolder(plan: AccommodationPlan, mats: AccMaterials): THREE.Group {
  const g = new THREE.Group();
  g.name = "acc:holder";
  const z = plan.z;
  const mid = (z.plateBottom + z.rearClear) * 0.5;
  const thick = z.plateBottom - z.rearClear;
  const carrier = finishedStructure(
    hoopShape(plan.cavityContour, plan.sampledSweptContour),
    Math.max(0.35, thick * 0.85),
    mats.holder,
    mats.holder,
    16,
  );
  carrier.position.z = mid;
  g.add(carrier);

  const shelfH = ACC.holderShelf;
  for (const c of plan.contacts) {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(ACC.holderPadR, ACC.holderPadR * 1.05, shelfH, 20), mats.pad);
    pad.rotation.x = Math.PI / 2;
    pad.position.set(c.xy.x, c.xy.y, z.plateBottom - shelfH * 0.5);
    pad.name = c.id;
    g.add(pad);
    const lip = new THREE.Mesh(
      new THREE.CylinderGeometry(ACC.holderPadR * 0.72, ACC.holderPadR * 0.78, ACC.holderLip, 16),
      mats.pad,
    );
    lip.rotation.x = Math.PI / 2;
    const inset = ACC.holderLipWidth;
    lip.position.set(c.xy.x - c.normal.x * inset, c.xy.y - c.normal.y * inset, z.plateTop + ACC.holderLip * 0.45);
    g.add(lip);
  }
  return g;
}

function corridorSlotPath(plan: AccommodationPlan): THREE.Path {
  const w = plan.corridor.window;
  const path = new THREE.Path();
  path.moveTo(w.xInner, -w.yHalf);
  path.lineTo(w.xInner, w.yHalf);
  path.lineTo(w.xOuter, w.yHalf);
  path.lineTo(w.xOuter, -w.yHalf);
  path.closePath();
  return path;
}

function hoopBand(
  plan: AccommodationPlan,
  z0: number,
  z1: number,
  mats: AccMaterials,
  slotted: boolean,
): THREE.Mesh {
  const shape = hoopShape(plan.outerWall, plan.cavityContour);
  if (slotted) shape.holes.push(corridorSlotPath(plan));
  const h = Math.max(0.08, z1 - z0);
  const mesh = finishedStructure(shape, h, mats.midcase, mats.midcase, 18);
  mesh.position.z = (z0 + z1) / 2;
  return mesh;
}

export function buildMidcase(plan: AccommodationPlan, mats: AccMaterials): THREE.Group {
  const g = new THREE.Group();
  g.name = "acc:midcase";
  const zLo = plan.corridor.window.zLo;
  const zHi = plan.corridor.window.zHi;
  g.add(hoopBand(plan, plan.z.midcaseBottom, zLo, mats, false));
  g.add(hoopBand(plan, zLo, zHi, mats, true));
  g.add(hoopBand(plan, zHi, plan.z.midcaseTop, mats, false));

  const h = plan.z.midcaseTop - plan.z.midcaseBottom;
  const north = plan.outerWall.reduce((b, p) => (p.y > b.y ? p : b), plan.outerWall[0]);
  const south = plan.outerWall.reduce((b, p) => (p.y < b.y ? p : b), plan.outerWall[0]);
  for (const p of [north, south]) {
    const lug = new THREE.Mesh(new THREE.BoxGeometry(ACC.lugReserve, 1.2, h * 0.5), mats.midcase);
    lug.position.set(p.x * 0.22, p.y + Math.sign(p.y) * 0.15, (plan.z.midcaseTop + plan.z.midcaseBottom) / 2);
    g.add(lug);
  }
  return g;
}

export function buildReserves(plan: AccommodationPlan, mats: AccMaterials): {
  front: THREE.Group;
  rear: THREE.Group;
  crown: THREE.Group;
} {
  const front = new THREE.Group();
  front.name = "FrontReservePose";
  const rear = new THREE.Group();
  rear.name = "RearReservePose";
  const crown = new THREE.Group();
  crown.name = "CrownCorridorPose";
  const cavityShape = vecToShape(plan.cavityContour);

  const dialH = plan.z.dialTop - plan.z.frontClear;
  const dial = finishedStructure(cavityShape, dialH, mats.ghostDial, mats.ghostDial, 16);
  dial.position.z = (plan.z.dialTop + plan.z.frontClear) / 2;
  front.add(dial);

  const frontH = plan.z.frontCloseHi - plan.z.frontCloseLo;
  const frontBand = finishedStructure(cavityShape, frontH, mats.ghostFront, mats.ghostFront, 16);
  frontBand.position.z = (plan.z.frontCloseHi + plan.z.frontCloseLo) / 2;
  front.add(frontBand);

  const rearBand = finishedStructure(cavityShape, 0.14, mats.ghostRear, mats.ghostRear, 16);
  rearBand.position.z = plan.z.rearClose;
  rear.add(rearBand);

  const cor = plan.corridor;
  const cyl = new THREE.Mesh(
    new THREE.CylinderGeometry(cor.radius, cor.radius, cor.length, 24, 1, true),
    mats.ghostCorridor,
  );
  cyl.rotation.z = Math.PI / 2;
  cyl.position.set((cor.origin.x + cor.endAt.x) / 2, cor.origin.y, cor.z);
  crown.add(cyl);
  const disc = (x: number): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(cor.radius, 24), mats.ghostCorridor);
    m.rotation.y = Math.PI / 2;
    m.position.set(x, cor.origin.y, cor.z);
    return m;
  };
  crown.add(disc(cor.origin.x), disc(cor.endAt.x));
  return { front, rear, crown };
}

export function buildDebug(plan: AccommodationPlan, mats: AccMaterials): THREE.Group {
  const g = new THREE.Group();
  g.name = "acc:debug";
  g.add(loop(plan.sampledSweptContour, plan.z.plateTop + 0.03, mats.lineSweep));
  g.add(loop(plan.requiredClearanceContour, plan.z.frontClear + 0.03, mats.lineRequired));
  g.add(loop(plan.cavityContour, plan.z.frontClear + 0.06, mats.lineCavity));
  g.add(loop(plan.outerWall, plan.z.frontClear + 0.09, mats.lineOuter));
  const hit = new THREE.Mesh(new THREE.CircleGeometry(0.28, 20), mats.boundary);
  hit.position.set(plan.corridor.boundaryHit.x, plan.corridor.boundaryHit.y, plan.z.frontClear + 0.12);
  g.add(hit);
  const axis = [
    new THREE.Vector3(plan.corridor.origin.x, 0, plan.corridor.z),
    new THREE.Vector3(plan.corridor.endAt.x, plan.corridor.endAt.y, plan.corridor.z),
  ];
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(axis), mats.lineRequired));
  for (const c of plan.contacts) {
    const top = new THREE.Mesh(new THREE.CircleGeometry(ACC.holderPadR * 0.55, 16), mats.contact);
    top.position.set(c.xy.x, c.xy.y, plan.z.plateTop + 0.03);
    g.add(top);
    const bot = new THREE.Mesh(new THREE.CircleGeometry(ACC.holderPadR * 0.5, 16), mats.contact);
    bot.position.set(c.xy.x, c.xy.y, plan.z.plateBottom - 0.03);
    bot.rotation.x = Math.PI;
    g.add(bot);
  }
  return g;
}
