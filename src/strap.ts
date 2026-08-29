import * as THREE from "three";
import type { ExteriorPlan } from "./exteriorPlan";
import { STRAP, STRAP_VIEWS, type StrapPoseName, type StrapViewName } from "./strapSpec";
import { createStrapMaterials, type StrapMaterials } from "./strapMaterials";
import { createStrapPlan, frozenInterfaceOk, type StrapPlan } from "./strapPlan";
import {
  buildSpringBars,
  buildStrapSide,
  type HeadSeatGeometryAudit,
  type SpringBarGeometryAudit,
} from "./strapGeometry";

export type { StrapViewName, StrapPoseName };

export type StrapHit = {
  mesh: string;
  against: string;
  x: number;
  y: number;
  z: number;
};

export type StrapLayer = {
  root: THREE.Group;
  plan: StrapPlan;
  materials: StrapMaterials;
  setProduct: (on: boolean) => void;
  setPose: (name: StrapPoseName) => void;
  setId: (on: boolean) => void;
  pose: () => StrapPoseName;
  report: () => ReturnType<typeof makeReport>;
};

function insidePoly(p: { x: number; y: number }, poly: { x: number; y: number }[]): boolean {
  let n = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const cond = a.y > p.y !== b.y > p.y;
    if (!cond) continue;
    const x = ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y + 1e-16) + a.x;
    if (p.x < x) n++;
  }
  return n % 2 === 1;
}

function poseAngle(name: StrapPoseName): number {
  if (name === "straight") return STRAP.poseStraight;
  if (name === "bent") return STRAP.poseBent;
  return STRAP.poseNeutral;
}

export function createStrap(opts: { exteriorPlan: ExteriorPlan }): StrapLayer {
  const plan = createStrapPlan(opts.exteriorPlan);
  const materials = createStrapMaterials();
  const root = new THREE.Group();
  root.name = "StrapRoot";

  const north = buildStrapSide(plan, plan.north, materials, false, true);
  const south = buildStrapSide(plan, plan.south, materials, true, false);
  const bars = buildSpringBars(plan, materials);
  const attachmentGeometry = {
    headSeats: {
      north: north.userData.seatGeometry as HeadSeatGeometryAudit,
      south: south.userData.seatGeometry as HeadSeatGeometryAudit,
    },
    springBars: bars.userData.springBarGeometry as Record<"north" | "south", SpringBarGeometryAudit>,
  };
  const visible = new THREE.Group();
  visible.name = "strap:visible";
  visible.add(north, south, bars);
  root.add(visible);

  const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  visible.traverse((o) => {
    if (o instanceof THREE.Mesh) originals.set(o, o.material);
  });

  let current: StrapPoseName = "neutral";

  const applyPose = (name: StrapPoseName): void => {
    current = name;
    const a = poseAngle(name);
    north.rotation.x = -a;
    south.rotation.x = -a;
    north.updateMatrixWorld(true);
    south.updateMatrixWorld(true);
  };
  applyPose("neutral");

  const sampleHits = (): { caseHits: StrapHit[]; lugHits: StrapHit[]; minCase: number; minLug: number } => {
    const ext = opts.exteriorPlan;
    const mid = ext.contours.midOuter;
    const back = ext.contours.casebackOuter;
    const zLo = ext.z.metalBottom - 0.02;
    const zHi = ext.z.metalTop + 0.02;
    const inner = plan.innerX - 0.04;
    const caseHits: StrapHit[] = [];
    const lugHits: StrapHit[] = [];
    let minCase = Infinity;
    let minLug = Infinity;
    const v = new THREE.Vector3();
    visible.updateMatrixWorld(true);
    visible.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || o.userData.kind === "bar" || o.userData.kind === "buckle") return;
      if (!o.name.startsWith("strap:head") && !o.name.startsWith("strap:free")) return;
      const pos = o.geometry.getAttribute("position");
      if (!pos) return;
      const step = Math.max(1, Math.floor(pos.count / 180));
      for (let i = 0; i < pos.count; i += step) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        const lugClear = inner - Math.abs(v.x);
        if (lugClear < minLug) minLug = lugClear;
        if (lugClear < -0.02) {
          lugHits.push({ mesh: o.name, against: "horn-inner", x: v.x, y: v.y, z: v.z });
        }
        const inMid = insidePoly(v, mid);
        const inBack = insidePoly(v, back);
        const inZ = v.z >= zLo && v.z <= zHi;
        if ((inMid || inBack) && inZ && Math.abs(v.x) < plan.innerX - 0.7) {
          caseHits.push({ mesh: o.name, against: inMid ? "ext:mid" : "ext:caseback", x: v.x, y: v.y, z: v.z });
        }
        const toward =
          v.y > 0 ? v.y - plan.north.caseY : plan.south.caseY - v.y;
        if (toward < minCase) minCase = toward;
      }
    });
    return { caseHits, lugHits, minCase, minLug };
  };

  const auditPose = (name: StrapPoseName) => {
    const prev = current;
    applyPose(name);
    const hits = sampleHits();
    applyPose(prev);
    return {
      pose: name,
      angleRad: poseAngle(name),
      angleDeg: (poseAngle(name) * 180) / Math.PI,
      caseIntersections: hits.caseHits.length,
      lugIntersections: hits.lugHits.length,
      minLugInnerClearance: hits.minLug,
      nearestCaseY: hits.minCase,
      sampleCase: hits.caseHits.slice(0, 3),
      sampleLug: hits.lugHits.slice(0, 3),
    };
  };

  return {
    root,
    plan,
    materials,
    setProduct: (on) => {
      root.visible = on;
      visible.visible = on;
      if (on) {
        for (const [mesh, mat] of originals) mesh.material = mat;
      }
    },
    setPose: applyPose,
    setId: (on) => {
      if (!on) {
        for (const [mesh, mat] of originals) mesh.material = mat;
        return;
      }
      visible.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const k = o.userData.kind as string;
        if (k === "bar") o.material = materials.idBar;
        else if (k === "head") o.material = materials.idHead;
        else if (k === "free" || k === "keeper") o.material = materials.idFree;
        else if (k === "buckle") o.material = materials.idBuckle;
      });
    },
    pose: () => current,
    report: () => makeReport(plan, opts.exteriorPlan, auditPose, attachmentGeometry),
  };
}

type PoseAudit = {
  pose: StrapPoseName;
  angleRad: number;
  angleDeg: number;
  caseIntersections: number;
  lugIntersections: number;
  minLugInnerClearance: number;
  nearestCaseY: number;
  sampleCase: StrapHit[];
  sampleLug: StrapHit[];
};

function makeReport(
  plan: StrapPlan,
  ext: ExteriorPlan,
  auditPose: (name: StrapPoseName) => PoseAudit,
  geometry: {
    headSeats: Record<"north" | "south", HeadSeatGeometryAudit>;
    springBars: Record<"north" | "south", SpringBarGeometryAudit>;
  },
) {
  const straight = auditPose("straight");
  const neutral = auditPose("neutral");
  const bent = auditPose("bent");
  return {
    thesis: plan.thesis,
    chosen: {
      material: "charcoal FKM",
      why: "The frozen horns are short, tall, bored slabs around an 18 mm gap. A slim molded loop sits between them, leaves the terminals visible, and does not add a second metal mass or a warm family.",
      rejected: [
        {
          id: "tailored-leather",
          reason: "Believable, but a thin dress end would look lost in the tall bored terminals, and any tan/brown would challenge the barrel.",
        },
        {
          id: "steel-bracelet",
          reason: "The 18 mm gap is too narrow for a bracelet that matches the cushion's visual mass; first links would read as undersized blocks and compete with the skeleton.",
        },
      ],
    },
    proportions: {
      gap: plan.strapWidth,
      headWidth: plan.headWidth,
      freeEndWidth: plan.freeEndWidth,
      headThick: plan.headThick,
      freeThick: plan.freeThick,
      headLen: plan.headLen,
      freeLen: plan.freeLen,
      hornGapEach: plan.hornGap,
      arcR: plan.arcR,
      wearerLength: "provisional product length; not a sized wrist",
    },
    frozen: plan.frozen,
    frozenDrift: frozenInterfaceOk(plan) ? "none" : "STRAP WIDTH / BAR / HORN CONSTANTS DIVERGED",
    attachment: {
      north: plan.north,
      south: plan.south,
      barX0: plan.barX0,
      barX1: plan.barX1,
      geometry,
      geometryChecks: {
        headSeatTargetReached: Object.values(geometry.headSeats).every(
          (seat) => Math.abs(seat.actualMinRadius - seat.targetRadius) < 1e-5,
        ),
        intendedSeatClearanceReached: Object.values(geometry.headSeats).every(
          (seat) => Math.abs(seat.radialClearance - STRAP.seatClearance) < 1e-5,
        ),
        headOuterBoundsUnchanged: Object.values(geometry.headSeats).every(
          (seat) => seat.outerBoundsDrift < 1e-9,
        ),
        springBarEndpointsPreserved: Object.values(geometry.springBars).every((bar) => bar.endpointsPreserved),
        springBarMaxEnvelopePreserved: Object.values(geometry.springBars).every(
          (bar) => bar.maxEnvelopePreserved,
        ),
        reducedEndPinsPresent: Object.values(geometry.springBars).every((bar) => bar.reducedPins),
        axes: "unchanged frozen north/south barY + barZ",
      },
      ownership: {
        horn: "ext:lug-* (frozen)",
        bore: "frozen reserveR on horn solids",
        bar: "strap:bar:* product hardware through frozen axis",
        head: "strap:head:* molded loop",
        free: "strap:free:*",
        buckle: "strap:buckle cool-steel tang, south only",
      },
      asymmetry:
        "North/south yRoot and caseY follow the tensioned-cushion, not a copy error. Each loop is built from its own frozen bar.",
    },
    poses: { straight, neutral, bent },
    z: {
      metalTop: ext.z.metalTop,
      metalBottom: ext.z.metalBottom,
      barZ: plan.frozen.barZ,
    },
  };
}

export function applyStrapView(
  camera: THREE.PerspectiveCamera,
  controls: { target: THREE.Vector3; update: () => void; maxDistance?: number },
  name: StrapViewName,
  plan: StrapPlan,
): void {
  if (controls.maxDistance !== undefined && controls.maxDistance < 120) controls.maxDistance = 120;
  const barZ = plan.frozen.barZ;
  const northY = plan.north.barY;
  const views: Record<StrapViewName, { p: THREE.Vector3; t: THREE.Vector3; fov?: number }> = {
    strapHero: { p: new THREE.Vector3(38, 32, 52), t: new THREE.Vector3(0, 0.2, -1.2) },
    strapFront: { p: new THREE.Vector3(-1.2, 1.0, 78), t: new THREE.Vector3(-1.2, 1.0, 1.2) },
    strapProduct: { p: new THREE.Vector3(22, 16, 36), t: new THREE.Vector3(-0.2, 0.4, 0.2) },
    strapCrown: { p: new THREE.Vector3(36, 20, 38), t: new THREE.Vector3(0.2, 0.1, -0.4) },
    strapWest: { p: new THREE.Vector3(-36, 24, 40), t: new THREE.Vector3(0.2, 0.1, -0.4) },
    strapProfile: { p: new THREE.Vector3(54, 0.4, 2.2), t: new THREE.Vector3(0, 0.2, -0.8) },
    strapRear: { p: new THREE.Vector3(28, -24, -40), t: new THREE.Vector3(0, 0.2, barZ) },
    strapUnderside: { p: new THREE.Vector3(6, 1, -52), t: new THREE.Vector3(0, -0.4, barZ) },
    strapMacro: {
      p: new THREE.Vector3(plan.innerX + 5.4, northY + 0.15, barZ + 0.4),
      t: new THREE.Vector3(1.0, northY, barZ),
    },
    strapId: { p: new THREE.Vector3(16, northY + 3.5, barZ + 8), t: new THREE.Vector3(1.2, northY, barZ) },
    strapBent: { p: new THREE.Vector3(42, 4, 12), t: new THREE.Vector3(0, 0.2, -4) },
  };
  const v = views[name];
  camera.fov = v.fov ?? 32;
  camera.updateProjectionMatrix();
  camera.position.copy(v.p);
  controls.target.copy(v.t);
  controls.update();
}

export { STRAP_VIEWS };
