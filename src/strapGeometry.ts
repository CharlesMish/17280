import * as THREE from "three";
import { STRAP } from "./strapSpec";
import type { StrapMaterials } from "./strapMaterials";
import type { StrapPlan, StrapSidePlan } from "./strapPlan";

export type HeadSeatGeometryAudit = {
  targetRadius: number;
  preRepairMinRadius: number;
  preRepairMinSurfaceRadius: number;
  actualMinRadius: number;
  actualMinVertexRadius: number;
  actualMaxRadius: number;
  maxAngularStepRad: number;
  barrelRadius: number;
  radialClearance: number;
  adjustedVertices: number;
  outerBoundsDrift: number;
  headX0: number;
  headX1: number;
  method: "facet-compensated minimum-clearance throat inside retained outer bevel";
};

export type SpringBarGeometryAudit = {
  x0: number;
  x1: number;
  actualX0: number;
  actualX1: number;
  barrelX0: number;
  barrelX1: number;
  barrelRadius: number;
  actualMaxRadius: number;
  pinRadius: number;
  actualPinMaxRadius: number;
  shoulderCapturePerSide: number;
  endpointsPreserved: boolean;
  maxEnvelopePreserved: boolean;
  reducedPins: boolean;
  singleMergedMesh: true;
};

function roundedRectPath(x0: number, y0: number, x1: number, y1: number, r: number): THREE.Shape {
  const rr = Math.min(r, (x1 - x0) * 0.45, (y1 - y0) * 0.45);
  const s = new THREE.Shape();
  s.moveTo(x0 + rr, y0);
  s.lineTo(x1 - rr, y0);
  s.absarc(x1 - rr, y0 + rr, rr, -Math.PI / 2, 0, false);
  s.lineTo(x1, y1 - rr);
  s.absarc(x1 - rr, y1 - rr, rr, 0, Math.PI / 2, false);
  s.lineTo(x0 + rr, y1);
  s.absarc(x0 + rr, y1 - rr, rr, Math.PI / 2, Math.PI, false);
  s.lineTo(x0, y0 + rr);
  s.absarc(x0 + rr, y0 + rr, rr, Math.PI, Math.PI * 1.5, false);
  s.closePath();
  return s;
}

function profilePts(hw: number, hh: number, r: number, corner = 5): THREE.Vector2[] {
  const rr = Math.min(r, hw * 0.9, hh * 0.9);
  const pts: THREE.Vector2[] = [];
  const corners: [number, number, number, number][] = [
    [hw - rr, hh - rr, 0, Math.PI / 2],
    [-hw + rr, hh - rr, Math.PI / 2, Math.PI],
    [-hw + rr, -hh + rr, Math.PI, Math.PI * 1.5],
    [hw - rr, -hh + rr, Math.PI * 1.5, Math.PI * 2],
  ];
  for (const [cx, cy, a0, a1] of corners) {
    for (let i = 0; i <= corner; i++) {
      const a = a0 + ((a1 - a0) * i) / corner;
      pts.push(new THREE.Vector2(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr));
    }
  }
  return pts;
}

function stationAt(s: number, plan: StrapPlan): { y: number; z: number; ay: number; az: number } {
  const straight = plan.straightLen;
  if (s <= straight) return { y: s, z: 0, ay: 1, az: 0 };
  const ds = s - straight;
  const r = plan.arcR;
  const phi = ds / r;
  return {
    y: straight + r * Math.sin(phi),
    z: -r * (1 - Math.cos(phi)),
    ay: Math.cos(phi),
    az: -Math.sin(phi),
  };
}

function widthAt(s: number, plan: StrapPlan): number {
  const t = Math.max(0, Math.min(1, (s - 4) / (plan.freeLen - 4)));
  const e = t * t * (3 - 2 * t);
  return plan.headWidth + (plan.freeEndWidth - plan.headWidth) * e;
}

function thickAt(s: number, plan: StrapPlan): number {
  if (s < plan.headLen) return plan.headThick;
  const t = Math.max(0, Math.min(1, (s - plan.headLen) / (plan.freeLen - plan.headLen)));
  const e = t * t * (3 - 2 * t);
  return plan.headThick + (plan.freeThick - plan.headThick) * e;
}

function sweepStrap(plan: StrapPlan, s0: number, s1: number, segs = 36): THREE.BufferGeometry {
  const nS = segs;
  const prof = profilePts(1, 1, 0.45, 4);
  const nP = prof.length;
  const pos = new Float32Array((nS + 1) * nP * 3);
  const nrm = new Float32Array((nS + 1) * nP * 3);
  const uv = new Float32Array((nS + 1) * nP * 2);
  const idx: number[] = [];
  for (let i = 0; i <= nS; i++) {
    const s = s0 + ((s1 - s0) * i) / nS;
    const st = stationAt(s, plan);
    const hw = widthAt(s, plan) * 0.5;
    const hh = thickAt(s, plan) * 0.5;
    const r = Math.min(STRAP.edgeR, hw * 0.35, hh * 0.55);
    const up = new THREE.Vector3(0, -st.az, st.ay);
    const right = new THREE.Vector3(1, 0, 0);
    const origin = new THREE.Vector3(0, st.y, st.z);
    const ring = profilePts(hw, hh, r, 4);
    for (let j = 0; j < nP; j++) {
      const q = ring[j];
      const p = origin.clone().addScaledVector(right, q.x).addScaledVector(up, q.y);
      const n = right.clone().multiplyScalar(q.x).addScaledVector(up, q.y).normalize();
      const o = (i * nP + j) * 3;
      pos[o] = p.x;
      pos[o + 1] = p.y;
      pos[o + 2] = p.z;
      nrm[o] = n.x;
      nrm[o + 1] = n.y;
      nrm[o + 2] = n.z;
      uv[(i * nP + j) * 2] = j / nP;
      uv[(i * nP + j) * 2 + 1] = i / nS;
    }
    if (i === 0) continue;
    for (let j = 0; j < nP; j++) {
      const a = (i - 1) * nP + j;
      const b = (i - 1) * nP + ((j + 1) % nP);
      const c = i * nP + j;
      const d = i * nP + ((j + 1) % nP);
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function regularizeHeadSeatThroat(
  geo: THREE.BufferGeometry,
  targetRadius: number,
): Omit<HeadSeatGeometryAudit, "barrelRadius" | "radialClearance" | "headX0" | "headX1"> {
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  geo.computeBoundingBox();
  const before = geo.boundingBox?.clone();
  let preRepairMinRadius = Infinity;
  let adjustedVertices = 0;
  const holeVertices: number[] = [];
  const angleKeys = new Set<number>();

  // At this point the head lies in Shape XY and extrudes along Z. Its nearest
  // exterior outline is >1.3 mm from the origin, so the vertices at or inside
  // the requested seat radius unambiguously belong to the circular hole.
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const r = Math.hypot(x, y);
    if (r > targetRadius + 1e-5 || r < targetRadius * 0.5) continue;
    preRepairMinRadius = Math.min(preRepairMinRadius, r);
    holeVertices.push(i);
    const angle = (Math.atan2(y, x) + Math.PI * 2) % (Math.PI * 2);
    angleKeys.add(Math.round(angle * 1e9) / 1e9);
  }
  const angles = [...angleKeys].sort((a, b) => a - b);
  let maxAngularStepRad = 0;
  for (let i = 0; i < angles.length; i++) {
    const next = angles[(i + 1) % angles.length];
    const step = (next - angles[i] + Math.PI * 2) % (Math.PI * 2);
    maxAngularStepRad = Math.max(maxAngularStepRad, step);
  }
  // Three renders each circular interval as a straight chord. Set the vertex
  // radius to the circumscribed value so the chord apothem—not merely its
  // endpoints—is the requested mechanical throat radius.
  const throatVertexRadius = targetRadius / Math.cos(maxAngularStepRad * 0.5);
  for (const i of holeVertices) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const r = Math.hypot(x, y);
    const scale = throatVertexRadius / r;
    pos.setXY(i, x * scale, y * scale);
    adjustedVertices++;
  }
  pos.needsUpdate = true;
  geo.computeBoundingBox();
  const after = geo.boundingBox?.clone();

  let actualMinVertexRadius = Infinity;
  let actualMaxRadius = -Infinity;
  for (const i of holeVertices) {
    const r = Math.hypot(pos.getX(i), pos.getY(i));
    actualMinVertexRadius = Math.min(actualMinVertexRadius, r);
    actualMaxRadius = Math.max(actualMaxRadius, r);
  }
  const actualMinRadius = actualMinVertexRadius * Math.cos(maxAngularStepRad * 0.5);
  const preRepairMinSurfaceRadius = preRepairMinRadius * Math.cos(maxAngularStepRad * 0.5);

  const outerBoundsDrift = before && after
    ? Math.max(
        before.min.distanceTo(after.min),
        before.max.distanceTo(after.max),
      )
    : NaN;
  return {
    targetRadius,
    preRepairMinRadius,
    preRepairMinSurfaceRadius,
    actualMinRadius,
    actualMinVertexRadius,
    actualMaxRadius,
    maxAngularStepRad,
    adjustedVertices,
    outerBoundsDrift,
    method: "facet-compensated minimum-clearance throat inside retained outer bevel",
  };
}

function buildHead(plan: StrapPlan, side: StrapSidePlan): THREE.Mesh {
  const y0 = side.sMin;
  const y1 = plan.headLen;
  const hh = plan.headThick * 0.5;
  const shape = roundedRectPath(y0, -hh, y1, hh, STRAP.edgeR);
  const hole = new THREE.Path();
  hole.absarc(0, 0, plan.seatRadius, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: plan.headWidth,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.06,
    bevelSegments: 2,
    curveSegments: 16,
    steps: 1,
  });
  const seat = regularizeHeadSeatThroat(geo, plan.seatRadius);
  geo.translate(0, 0, -plan.headWidth / 2);
  geo.rotateY(-Math.PI / 2);
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  const mesh = new THREE.Mesh(geo, undefined);
  mesh.userData.seatGeometry = {
    ...seat,
    barrelRadius: plan.barRadius,
    radialClearance: seat.actualMinRadius - plan.barRadius,
    headX0: geo.boundingBox?.min.x ?? NaN,
    headX1: geo.boundingBox?.max.x ?? NaN,
  } satisfies HeadSeatGeometryAudit;
  return mesh;
}

function buildBar(plan: StrapPlan): THREE.Mesh {
  const xMid = (plan.barX0 + plan.barX1) * 0.5;
  const axial = (x: number) => x - plan.barX0;
  const profile = [
    new THREE.Vector2(0, axial(plan.barX0)),
    new THREE.Vector2(plan.barPinRadius, axial(plan.barX0)),
    new THREE.Vector2(plan.barPinRadius, axial(plan.barBarrelX0)),
    new THREE.Vector2(plan.barRadius, axial(plan.barBarrelX0)),
    new THREE.Vector2(plan.barRadius, axial(xMid)),
    new THREE.Vector2(plan.barRadius, axial(plan.barBarrelX1)),
    new THREE.Vector2(plan.barPinRadius, axial(plan.barBarrelX1)),
    new THREE.Vector2(plan.barPinRadius, axial(plan.barX1)),
    new THREE.Vector2(0, axial(plan.barX1)),
  ];
  const geo = new THREE.LatheGeometry(profile, 32);
  geo.rotateZ(-Math.PI / 2);
  geo.translate(plan.barX0, 0, 0);
  geo.computeVertexNormals();
  geo.computeBoundingBox();

  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  let actualMaxRadius = 0;
  let actualPinMaxRadius = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const r = Math.hypot(pos.getY(i), pos.getZ(i));
    actualMaxRadius = Math.max(actualMaxRadius, r);
    if (x < plan.barBarrelX0 - 1e-5 || x > plan.barBarrelX1 + 1e-5) {
      actualPinMaxRadius = Math.max(actualPinMaxRadius, r);
    }
  }
  const actualX0 = geo.boundingBox?.min.x ?? NaN;
  const actualX1 = geo.boundingBox?.max.x ?? NaN;
  const audit: SpringBarGeometryAudit = {
    x0: plan.barX0,
    x1: plan.barX1,
    actualX0,
    actualX1,
    barrelX0: plan.barBarrelX0,
    barrelX1: plan.barBarrelX1,
    barrelRadius: plan.barRadius,
    actualMaxRadius,
    pinRadius: plan.barPinRadius,
    actualPinMaxRadius,
    shoulderCapturePerSide: plan.headWidth / 2 - plan.barBarrelX1,
    endpointsPreserved: Math.abs(actualX0 - plan.barX0) < 1e-5 && Math.abs(actualX1 - plan.barX1) < 1e-5,
    maxEnvelopePreserved: actualMaxRadius <= plan.barRadius + 1e-5,
    reducedPins: actualPinMaxRadius < actualMaxRadius - 1e-5,
    singleMergedMesh: true,
  };
  const mesh = new THREE.Mesh(geo);
  mesh.userData.springBarGeometry = audit;
  return mesh;
}

function buildBuckle(plan: StrapPlan): THREE.Group {
  const g = new THREE.Group();
  g.name = "strap:buckle";
  const w = plan.freeEndWidth + 0.45;
  const t = plan.freeThick + 0.55;
  const frame = 0.55;
  const along = 3.6;
  const shape = roundedRectPath(-w / 2, -t / 2, w / 2, t / 2, 0.35);
  const inner = roundedRectPath(-w / 2 + frame, -t / 2 + frame, w / 2 - frame, t / 2 - frame, 0.22);
  shape.holes.push(inner);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: along,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.08,
    bevelSegments: 1,
    curveSegments: 10,
  });
  geo.translate(0, 0, -along / 2);
  const hoop = new THREE.Mesh(geo);
  hoop.name = "strap:buckle-frame";
  g.add(hoop);
  const chape = new THREE.Mesh(new THREE.BoxGeometry(w - 0.3, 0.42, 1.1));
  chape.position.set(0, 0, -along * 0.15);
  chape.name = "strap:buckle-chape";
  g.add(chape);
  const tang = new THREE.Mesh(new THREE.BoxGeometry(0.28, t + 0.15, 2.6));
  tang.position.set(0, 0.05, 0.4);
  tang.name = "strap:buckle-tang";
  g.add(tang);
  return g;
}

function buildKeeper(plan: StrapPlan): THREE.Mesh {
  const w = widthAt(STRAP.keeperS[0], plan);
  const t = thickAt(STRAP.keeperS[0], plan);
  const shape = roundedRectPath(-w / 2 - 0.22, -t / 2 - 0.22, w / 2 + 0.22, t / 2 + 0.22, 0.28);
  const inner = roundedRectPath(-w / 2 - 0.02, -t / 2 - 0.02, w / 2 + 0.02, t / 2 + 0.02, 0.24);
  shape.holes.push(inner);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 1.15,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.06,
    bevelSegments: 1,
    curveSegments: 8,
  });
  geo.translate(0, 0, -0.575);
  const mesh = new THREE.Mesh(geo);
  mesh.name = "strap:keeper";
  return mesh;
}

function placeOnCenterline(obj: THREE.Object3D, s: number, plan: StrapPlan, extraX = 0): void {
  const st = stationAt(s, plan);
  obj.position.set(0, st.y, st.z);
  const ang = Math.atan2(-st.az, st.ay);
  obj.rotation.x = ang + extraX;
}

export function buildStrapSide(
  plan: StrapPlan,
  side: StrapSidePlan,
  mats: StrapMaterials,
  withBuckle: boolean,
  withKeepers: boolean,
): THREE.Group {
  const g = new THREE.Group();
  g.name = `strap:${side.side}`;

  const head = buildHead(plan, side);
  head.material = mats.rubber;
  head.name = `strap:head:${side.side}`;
  head.userData.kind = "head";
  g.userData.seatGeometry = head.userData.seatGeometry as HeadSeatGeometryAudit;
  g.add(head);

  const free = new THREE.Mesh(sweepStrap(plan, plan.headLen - 0.35, plan.freeLen, 40), mats.rubber);
  free.name = `strap:free:${side.side}`;
  free.userData.kind = "free";
  g.add(free);

  if (withBuckle) {
    const buckle = buildBuckle(plan);
    buckle.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.material = mats.buckle;
        o.userData.kind = "buckle";
      }
    });
    placeOnCenterline(buckle, STRAP.buckleAt, plan, -Math.PI / 2);
    g.add(buckle);
  }

  if (withKeepers) {
    for (const s of STRAP.keeperS) {
      const k = buildKeeper(plan);
      k.material = mats.rubberEdge;
      k.userData.kind = "keeper";
      placeOnCenterline(k, s, plan, -Math.PI / 2);
      g.add(k);
    }
  }

  g.position.set(0, side.barY, side.barZ);
  if (side.sign < 0) g.rotation.z = Math.PI;
  return g;
}

export function buildSpringBars(plan: StrapPlan, mats: StrapMaterials): THREE.Group {
  const g = new THREE.Group();
  g.name = "strap:bars";
  const audits: Record<"north" | "south", SpringBarGeometryAudit> = {} as Record<
    "north" | "south",
    SpringBarGeometryAudit
  >;
  for (const side of [plan.north, plan.south]) {
    const bar = buildBar(plan);
    bar.material = mats.bar;
    bar.position.set(0, side.barY, side.barZ);
    bar.name = `strap:bar:${side.side}`;
    bar.userData.kind = "bar";
    audits[side.side] = bar.userData.springBarGeometry as SpringBarGeometryAudit;
    g.add(bar);
  }
  g.userData.springBarGeometry = audits;
  return g;
}
