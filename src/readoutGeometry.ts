import * as THREE from "three";
import type { Vec2 } from "./spec";
import { assignCapAndSideGroups, applyPlanarUV, extrudeCentered } from "./geometry";
import { hoopShape, strokeOpen, vecToShape } from "./structureGeometry";
import { DISPLAY_DRIVE } from "./displayDriveSpec";
import { rayConvexExit } from "./readoutPlan";
import type { MarkerStation, ReadoutPlan } from "./readoutPlan";
import type { ReadoutMaterials } from "./readoutMaterials";

export type ReadoutDrivenParts = {
  hourHandMount: THREE.Group;
  minuteHandMount: THREE.Group;
  hourCollar: THREE.Mesh;
  minuteStem: THREE.Group;
  minuteCollar: THREE.Mesh;
  cap: THREE.Mesh;
};

function mirrorY(half: Vec2[]): THREE.Shape {
  const left = half
    .slice(0, -1)
    .reverse()
    .map((p) => ({ x: -p.x, y: p.y }));
  return vecToShape([...half, ...left]);
}

type HandBore = {
  targetR: number;
  profileR: number;
};

/**
 * Three's positive extrusion bevel contracts an internal circular path. Keep
 * the accepted hand exterior and bevel untouched, and compensate only the
 * hidden mounting-hole profile so its narrowest rendered ring equals targetR.
 */
function handBore(
  targetR: number,
  thickness: number,
  curveSegments = 10,
): HandBore {
  const bevelSize = Math.min(0.016, Math.max(0.05, thickness) * 0.2);
  const polygonOffset = bevelSize / Math.cos(Math.PI / (curveSegments * 2));
  return {
    targetR,
    profileR: targetR + polygonOffset + 0.000002,
  };
}

function addCircularBore(shape: THREE.Shape, bore: HandBore): THREE.Shape {
  const path = new THREE.Path();
  path.absarc(0, 0, bore.profileR, 0, Math.PI * 2, true);
  shape.holes.push(path);
  return shape;
}

function plate(
  shape: THREE.Shape,
  z0: number,
  z1: number,
  face: THREE.Material,
  edge: THREE.Material,
  hint: number,
): THREE.Mesh {
  const thick = Math.max(0.04, z1 - z0);
  const geo = extrudeCentered(shape, thick, false, 10);
  applyPlanarUV(geo, hint);
  assignCapAndSideGroups(geo);
  const mesh = new THREE.Mesh(geo, [face, edge]);
  mesh.position.z = (z0 + z1) / 2;
  return mesh;
}

function ring(inner: number, outer: number, z0: number, z1: number, mat: THREE.Material): THREE.Mesh {
  const h = Math.max(0.03, z1 - z0);
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, Math.max(0.02, inner), 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 36 });
  geo.translate(0, 0, -h / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.z = (z0 + z1) / 2;
  return mesh;
}

function disc(r: number, z0: number, z1: number, mat: THREE.Material, segs = 36): THREE.Mesh {
  const h = Math.max(0.03, z1 - z0);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segs), mat);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.z = (z0 + z1) / 2;
  return mesh;
}

function coneCap(r0: number, r1: number, z0: number, z1: number, mat: THREE.Material): THREE.Mesh {
  const h = Math.max(0.03, z1 - z0);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, h, 32), mat);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.z = (z0 + z1) / 2;
  return mesh;
}

function radialSlab(r0: number, r1: number, halfW0: number, halfW1: number): THREE.Shape {
  return vecToShape([
    { x: -halfW0, y: r0 },
    { x: halfW0, y: r0 },
    { x: halfW1, y: r1 },
    { x: -halfW1, y: r1 },
  ]);
}

function pearShape(r0: number, r1: number, halfW: number): THREE.Shape {
  const mid = r0 + (r1 - r0) * 0.38;
  const fat = r0 + (r1 - r0) * 0.68;
  return vecToShape([
    { x: 0, y: r0 },
    { x: halfW * 0.45, y: mid },
    { x: halfW, y: fat },
    { x: 0, y: r1 },
    { x: -halfW, y: fat },
    { x: -halfW * 0.45, y: mid },
  ]);
}

function bladeHour(plan: ReadoutPlan): THREE.Shape {
  const tip = plan.hourHand.tipR;
  const tail = plan.hourHand.tailR;
  const w = plan.hourHand.maxWidth * 0.5;
  return mirrorY([
    { x: w * 0.42, y: -tail },
    { x: w * 0.62, y: -tail * 0.28 },
    { x: w * 0.7, y: 0.42 },
    { x: w * 0.96, y: 1.02 },
    { x: w, y: 1.48 },
    { x: w * 0.9, y: 2.35 },
    { x: w * 0.52, y: tip - 1.28 },
    { x: w * 0.26, y: tip - 0.42 },
    { x: 0, y: tip },
  ]);
}

function bladeMinute(plan: ReadoutPlan): THREE.Shape {
  const tip = plan.minuteHand.tipR;
  const tail = plan.minuteHand.tailR;
  const w = plan.minuteHand.maxWidth * 0.5;
  return mirrorY([
    { x: 0.09, y: -tail },
    { x: 0.1, y: 0.18 },
    { x: 0.105, y: tip - 1.32 },
    { x: w, y: tip - 0.68 },
    { x: w * 0.42, y: tip - 0.2 },
    { x: 0, y: tip },
  ]);
}

function lancetHour(plan: ReadoutPlan): THREE.Shape {
  const tip = plan.hourHand.tipR;
  const tail = plan.hourHand.tailR;
  const w = plan.hourHand.maxWidth * 0.5;
  const shape = mirrorY([
    { x: w * 0.38, y: -tail },
    { x: w * 0.7, y: 0.55 },
    { x: w, y: 1.55 },
    { x: w * 0.62, y: tip - 1.15 },
    { x: w * 0.22, y: tip - 0.32 },
    { x: 0, y: tip },
  ]);
  const hole = new THREE.Path();
  const inner: Vec2[] = [
    { x: 0, y: 0.92 },
    { x: w * 0.42, y: 1.7 },
    { x: w * 0.28, y: tip - 1.55 },
    { x: 0, y: tip - 1.05 },
    { x: -w * 0.28, y: tip - 1.55 },
    { x: -w * 0.42, y: 1.7 },
  ];
  hole.moveTo(inner[0].x, inner[0].y);
  for (let i = 1; i < inner.length; i++) hole.lineTo(inner[i].x, inner[i].y);
  hole.closePath();
  shape.holes.push(hole);
  return shape;
}

function lancetMinute(plan: ReadoutPlan): THREE.Shape {
  const tip = plan.minuteHand.tipR;
  const tail = plan.minuteHand.tailR;
  const shape = new THREE.Shape();
  const outer = mirrorY([
    { x: 0.11, y: -tail },
    { x: 0.12, y: tip - 0.95 },
    { x: 0.16, y: tip - 0.42 },
    { x: 0, y: tip },
  ]);
  const hole = new THREE.Path();
  hole.moveTo(-0.045, 0.55);
  hole.lineTo(0.045, 0.55);
  hole.lineTo(0.045, tip - 1.15);
  hole.lineTo(-0.045, tip - 1.15);
  hole.closePath();
  // Recreate as a single shape with hole using the outer points.
  const pts = outer.getPoints(24);
  shape.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i].x, pts[i].y);
  shape.closePath();
  shape.holes.push(hole);
  return shape;
}

function chevronHour(plan: ReadoutPlan): THREE.Shape {
  const tip = plan.hourHand.tipR;
  const tail = plan.hourHand.tailR;
  const w = plan.hourHand.maxWidth * 0.5;
  return vecToShape([
    { x: -w * 0.55, y: -tail },
    { x: -w, y: 0.55 },
    { x: -w, y: 2.05 },
    { x: 0, y: tip },
    { x: w, y: 2.05 },
    { x: w, y: 0.55 },
    { x: w * 0.55, y: -tail },
  ]);
}

function barMinute(plan: ReadoutPlan): THREE.Shape {
  const tip = plan.minuteHand.tipR;
  const tail = plan.minuteHand.tailR;
  const w = 0.13;
  return vecToShape([
    { x: -w, y: -tail },
    { x: -w, y: tip - 0.55 },
    { x: 0, y: tip },
    { x: w, y: tip - 0.55 },
    { x: w, y: -tail },
  ]);
}

function handMesh(
  shape: THREE.Shape,
  z0: number,
  z1: number,
  face: THREE.Material,
  edge: THREE.Material,
  hint: number,
  bore: HandBore,
): THREE.Mesh {
  const thick = Math.max(0.05, z1 - z0);
  const geo = extrudeCentered(shape, thick, true, 10);
  applyPlanarUV(geo, hint);
  assignCapAndSideGroups(geo);
  const mesh = new THREE.Mesh(geo, [face, edge]);
  mesh.position.z = (z0 + z1) / 2;
  const position = geo.getAttribute("position");
  let measuredMinimumR = Infinity;
  for (let index = 0; index < position.count; index += 1) {
    measuredMinimumR = Math.min(
      measuredMinimumR,
      Math.hypot(position.getX(index), position.getY(index)),
    );
  }
  if (measuredMinimumR + 1e-9 < bore.targetR) {
    throw new Error(
      `Phase 4B hand bore ${measuredMinimumR} is smaller than target ${bore.targetR}`,
    );
  }
  mesh.userData.phase4bMountBore = {
    targetR: bore.targetR,
    profileR: bore.profileR,
    measuredMinimumR,
  };
  return mesh;
}

function placeRadial(mesh: THREE.Object3D, angle: number, axis: { x: number; y: number }): void {
  mesh.position.x = axis.x;
  mesh.position.y = axis.y;
  mesh.rotation.z = angle - Math.PI / 2;
}

function buildMarkers(
  plan: ReadoutPlan,
  mats: ReadoutMaterials,
  kind: "baton" | "pear" | "block",
): THREE.Group {
  const g = new THREE.Group();
  g.name = "readout:indices";
  for (const m of plan.markers) {
    const cardinal = m.kind !== "subordinate";
    const face = cardinal ? mats.cardinalFace : mats.indexFace;
    const edge = cardinal ? mats.cardinalEdge : mats.indexEdge;
    let shape: THREE.Shape;
    if (kind === "pear") {
      shape = pearShape(m.r0, m.r1, m.width * 0.5);
    } else if (kind === "block") {
      const half = m.width * 0.5;
      // Contour-responsive: long axis is tangential, short axis is radial.
      const radial = (m.r1 - m.r0) * 0.5;
      const rMid = (m.r0 + m.r1) * 0.5;
      const tang = cardinal ? half * 2.15 : half * 1.15;
      shape = vecToShape([
        { x: -tang, y: rMid - radial },
        { x: tang, y: rMid - radial },
        { x: tang, y: rMid + radial },
        { x: -tang, y: rMid + radial },
      ]);
    } else if (m.kind === "cardinal12") {
      const half = m.width * 0.5;
      shape = vecToShape([
        { x: -half * 0.72, y: m.r0 },
        { x: half * 0.72, y: m.r0 },
        { x: half, y: m.r1 - 0.22 },
        { x: 0, y: m.r1 },
        { x: -half, y: m.r1 - 0.22 },
      ]);
    } else {
      const innerW = cardinal ? m.width * 0.42 : m.width * 0.4;
      const outerW = m.width * 0.5;
      shape = radialSlab(m.r0, m.r1, innerW, outerW);
    }
    const mesh = plate(shape, plan.chapter.markerZ0, plan.chapter.markerZ1, face, edge, 9);
    mesh.name = `readout:index:${m.hour}`;
    placeRadial(mesh, m.angle, plan.axis);
    g.add(mesh);
  }
  return g;
}

function buildCarrier(plan: ReadoutPlan, mats: ReadoutMaterials): THREE.Group {
  const g = new THREE.Group();
  g.name = "readout:carrier";
  const mesh = plate(
    hoopShape(plan.chapter.carrierOuter, plan.chapter.carrierInner),
    plan.chapter.z0,
    plan.chapter.z1,
    mats.carrier,
    mats.carrierEdge,
    16,
  );
  mesh.name = "readout:carrierRing";
  g.add(mesh);
  return g;
}

function buildSegmentedRails(plan: ReadoutPlan, mats: ReadoutMaterials): THREE.Group {
  const g = new THREE.Group();
  g.name = "readout:carrier";
  const cardinals = plan.markers.filter((m) => m.kind !== "subordinate");
  for (const c of cardinals) {
    const pts: Vec2[] = [];
    for (let i = 0; i <= 8; i++) {
      const a = c.angle - 0.34 + (0.68 * i) / 8;
      pts.push(rayConvexExit(plan.axis, a, plan.chapter.carrierOuter));
    }
    const shape = strokeOpen(pts, () => 0.11);
    const mesh = plate(shape, plan.chapter.z0, plan.chapter.z1, mats.carrier, mats.carrierEdge, 14);
    mesh.name = `readout:rail:${c.hour}`;
    g.add(mesh);
  }
  return g;
}

function buildIndexTabs(plan: ReadoutPlan, mats: ReadoutMaterials): THREE.Group {
  const g = new THREE.Group();
  g.name = "readout:carrier";
  for (const m of plan.markers) {
    const r0 = m.r1 - 0.22;
    const r1 = m.r1 + 0.02;
    const shape = radialSlab(r0, r1, m.width * 0.28, m.width * 0.32);
    const mesh = plate(shape, plan.chapter.z0, plan.chapter.z1, mats.carrier, mats.carrierEdge, 8);
    mesh.name = `readout:tab:${m.hour}`;
    placeRadial(mesh, m.angle, plan.axis);
    g.add(mesh);
  }
  return g;
}

function polar(axis: { x: number; y: number }, angle: number, r: number): { x: number; y: number } {
  return { x: axis.x + Math.cos(angle) * r, y: axis.y + Math.sin(angle) * r };
}

function buildSupports(plan: ReadoutPlan, mats: ReadoutMaterials): THREE.Group {
  const g = new THREE.Group();
  g.name = "readout:supports";
  for (const s of plan.chapter.supports) {
    const innerR = s.rRailInner + 0.01;
    const innerHalfA = (s.halfW * 0.85) / Math.max(innerR, 0.2);
    const shape = vecToShape([
      polar(plan.axis, s.angle - innerHalfA, innerR),
      polar(plan.axis, s.angle + innerHalfA, innerR),
      ...s.wallHits.slice().reverse(),
    ]);
    const foot = plate(shape, s.railZ0, s.railZ1, mats.attachment, mats.carrierEdge, 6);
    foot.name = s.id;
    g.add(foot);
  }
  return g;
}

function buildDrivenParts(
  plan: ReadoutPlan,
  mats: ReadoutMaterials,
  hourShape: THREE.Shape,
  minuteShape: THREE.Shape,
  hourBore: HandBore,
  minuteBore: HandBore,
): ReadoutDrivenParts {
  const hourHandMount = new THREE.Group();
  hourHandMount.name = "HourHandMount";
  hourHandMount.position.set(plan.axis.x, plan.axis.y, 0);
  const hour = handMesh(
    hourShape,
    plan.hourHand.z0,
    plan.hourHand.z1,
    mats.hourFace,
    mats.hourEdge,
    8,
    hourBore,
  );
  hour.name = "HourHand";

  const minuteHandMount = new THREE.Group();
  minuteHandMount.name = "MinuteHandMount";
  minuteHandMount.position.set(plan.axis.x, plan.axis.y, 0);
  const minute = handMesh(
    minuteShape,
    plan.minuteHand.z0,
    plan.minuteHand.z1,
    mats.minuteFace,
    mats.minuteEdge,
    8,
    minuteBore,
  );
  minute.name = "MinuteHand";

  const h = plan.hub;
  const hourCollar = ring(h.hourCollarInnerR, h.hourCollarR, h.hourZ0, h.hourZ1, mats.hub);
  hourCollar.name = "readout:hub:hourCollar";
  hourCollar.userData.phase4bMountBore = {
    targetR: h.hourCollarInnerR,
    profileR: h.hourCollarInnerR,
    measuredMinimumR: h.hourCollarInnerR,
  };
  hourCollar.userData.phase4bMountBore = {
    targetR: h.hourCollarInnerR,
    profileR: h.hourCollarInnerR,
    measuredMinimumR: h.hourCollarInnerR,
  };
  // The visible stem is now the upper section of the single, continuous
  // minute-drive member. Retain this named ownership node without carrying
  // forward the old overlapping placeholder solid.
  const minuteStem = new THREE.Group();
  minuteStem.name = "readout:hub:minuteStem";
  const minuteCollar = ring(
    DISPLAY_DRIVE.minuteTenon.outerR,
    h.minuteCollarR,
    h.minuteZ0,
    h.minuteZ1,
    mats.hubPolish,
  );
  minuteCollar.name = "readout:hub:minuteCollar";
  minuteCollar.userData.phase4bMountBore = {
    targetR: DISPLAY_DRIVE.minuteTenon.outerR,
    profileR: DISPLAY_DRIVE.minuteTenon.outerR,
    measuredMinimumR: DISPLAY_DRIVE.minuteTenon.outerR,
  };
  const cap = coneCap(h.capR, h.capR * 0.62, h.capZ0, h.capZ1, mats.hubCap);
  cap.name = "readout:hub:cap";

  hourHandMount.add(hour, hourCollar);
  minuteHandMount.add(minute, minuteStem, minuteCollar, cap);
  return { hourHandMount, minuteHandMount, hourCollar, minuteStem, minuteCollar, cap };
}

export function buildReadoutGeometry(plan: ReadoutPlan, mats: ReadoutMaterials): {
  root: THREE.Group;
  drivenParts: ReadoutDrivenParts;
  chapterPose: THREE.Group;
  debug: THREE.Group;
} {
  const root = new THREE.Group();
  root.name = "ReadoutRoot";

  const chapterPose = new THREE.Group();
  chapterPose.name = "ChapterPose";

  let hourShape: THREE.Shape;
  let minuteShape: THREE.Shape;
  const id = plan.concept.id;
  if (id === "open-lancet") {
    hourShape = lancetHour(plan);
    minuteShape = lancetMinute(plan);
    chapterPose.add(buildIndexTabs(plan, mats), buildMarkers(plan, mats, "pear"), buildSupports(plan, mats));
  } else if (id === "facet-block") {
    hourShape = chevronHour(plan);
    minuteShape = barMinute(plan);
    chapterPose.add(buildSegmentedRails(plan, mats), buildMarkers(plan, mats, "block"), buildSupports(plan, mats));
  } else {
    hourShape = bladeHour(plan);
    minuteShape = bladeMinute(plan);
    chapterPose.add(buildCarrier(plan, mats), buildMarkers(plan, mats, "baton"), buildSupports(plan, mats));
  }
  const hourBore = handBore(
    plan.hourHand.mountBoreR,
    plan.hourHand.thick,
  );
  const minuteBore = handBore(
    DISPLAY_DRIVE.minuteTenon.outerR,
    plan.minuteHand.thick,
  );
  addCircularBore(hourShape, hourBore);
  addCircularBore(minuteShape, minuteBore);

  const drivenParts = buildDrivenParts(
    plan,
    mats,
    hourShape,
    minuteShape,
    hourBore,
    minuteBore,
  );
  const debug = buildReadoutDebug(plan, mats);
  debug.visible = false;

  root.add(drivenParts.hourHandMount, drivenParts.minuteHandMount, chapterPose, debug);
  return { root, drivenParts, chapterPose, debug };
}

export function buildReadoutDebug(plan: ReadoutPlan, mats: ReadoutMaterials): THREE.Group {
  const g = new THREE.Group();
  g.name = "readout:debug";
  for (const m of plan.markers) {
    const pts = [
      new THREE.Vector3(plan.axis.x, plan.axis.y, plan.chapter.markerZ1 + 0.02),
      new THREE.Vector3(m.outerHit.x, m.outerHit.y, plan.chapter.markerZ1 + 0.02),
    ];
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mats.debugLine);
    line.name = `readout:debug:ray:${m.hour}`;
    g.add(line);
  }
  const axis = disc(0.035, plan.hourHand.z0 - 0.1, plan.hub.capZ1 + 0.08, mats.debugFill);
  axis.position.set(plan.axis.x, plan.axis.y, (plan.hourHand.z0 + plan.hub.capZ1) / 2);
  axis.name = "readout:debug:axis";
  g.add(axis);
  return g;
}

export function markerStationsForAudit(plan: ReadoutPlan): MarkerStation[] {
  return plan.markers;
}
