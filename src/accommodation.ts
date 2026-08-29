import * as THREE from "three";
import type { Movement } from "./movement";
import type { MovementStructure } from "./structure";
import type { MovementAssembly } from "./assembly";
import { ACC } from "./accommodationSpec";
import { ACC_EPS } from "./accommodationMath";
import { createAccommodationPlan, forEachCalibreMesh, measureCalibre, type AccommodationPlan } from "./accommodationPlan";
import { auditFiniteCorridor, auditPackaging, sweepContainment } from "./accommodationAudit";
import {
  buildDebug,
  buildHolder,
  buildMidcase,
  buildReserves,
  createAccMaterials,
  type AccMaterials,
} from "./accommodationGeometry";

export type AccViewName =
  | "accHero"
  | "accTop"
  | "accBack"
  | "accBackOblique"
  | "accFlank"
  | "accLeft"
  | "accGrazing"
  | "accSection"
  | "accHolder"
  | "accCrown"
  | "accAuthority";

export const ACC_VIEWS: Record<AccViewName, { position: THREE.Vector3; target: THREE.Vector3 }> = {
  accHero: {
    position: new THREE.Vector3(22, 16, 34),
    target: new THREE.Vector3(-1.2, 1.4, 1.6),
  },
  accTop: {
    position: new THREE.Vector3(-1.4, 1.1, 46),
    target: new THREE.Vector3(-1.4, 1.1, 0.4),
  },
  accBack: {
    position: new THREE.Vector3(-1.4, 1.0, -40),
    target: new THREE.Vector3(-1.4, 1.0, -0.4),
  },
  accBackOblique: {
    position: new THREE.Vector3(18, -16, -22),
    target: new THREE.Vector3(-1.0, 0.6, -0.4),
  },
  accFlank: {
    position: new THREE.Vector3(-1.4, -38, 6.5),
    target: new THREE.Vector3(-1.4, 1.1, 2.4),
  },
  accLeft: {
    position: new THREE.Vector3(-40, 1.2, 5.5),
    target: new THREE.Vector3(-1.4, 1.2, 2.4),
  },
  accGrazing: {
    position: new THREE.Vector3(28, 18, 3.2),
    target: new THREE.Vector3(-1.0, 1.2, 2.0),
  },
  accSection: {
    position: new THREE.Vector3(30, 1.2, 4.4),
    target: new THREE.Vector3(1.6, 1.2, 2.2),
  },
  accHolder: {
    position: new THREE.Vector3(5, -14, 28),
    target: new THREE.Vector3(-2.0, 1.2, -0.2),
  },
  accCrown: {
    position: new THREE.Vector3(11.6, 0.2, 18),
    target: new THREE.Vector3(11.6, 0.2, -0.2),
  },
  accAuthority: {
    position: new THREE.Vector3(-1.4, 1.1, 46),
    target: new THREE.Vector3(-1.4, 1.1, 0.4),
  },
};

export type AccReport = ReturnType<typeof makeReport>;

export type Accommodation = {
  root: THREE.Group;
  plan: AccommodationPlan;
  materials: AccMaterials;
  report: () => AccReport;
  setTruth: (on: boolean) => void;
  setSection: (on: boolean) => void;
  setReserves: (on: boolean) => void;
  setHolderAudit: (on: boolean) => void;
};

export function createAccommodation(opts: {
  movement: Movement;
  structure: MovementStructure;
  assembly: MovementAssembly | null;
  renderer: THREE.WebGLRenderer;
}): Accommodation {
  opts.renderer.localClippingEnabled = true;
  const measure = measureCalibre(opts.movement, opts.structure.root, opts.assembly ? opts.assembly.root : null);
  const plan = createAccommodationPlan(opts.movement.layout, opts.structure.plan, measure);
  const materials = createAccMaterials();

  const packAudit = auditPackaging(plan);
  const pointContain = sweepContainment(measure.xySamples, plan.sampledSweptContour);
  const corridorAudit = auditFiniteCorridor(plan, (visitor) => {
    forEachCalibreMesh(opts.movement, opts.structure.root, opts.assembly ? opts.assembly.root : null, visitor);
  });

  const root = new THREE.Group();
  root.name = "accommodation:root";
  const holder = new THREE.Group();
  holder.name = "HolderPose";
  const midcase = new THREE.Group();
  midcase.name = "CoarseMidcasePose";
  const reserves = buildReserves(plan, materials);
  holder.add(buildHolder(plan, materials));
  midcase.add(buildMidcase(plan, materials));
  const debug = buildDebug(plan, materials);
  debug.visible = false;

  const clip = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0.15);
  const clipMeshes: THREE.Mesh[] = [];
  midcase.traverse((o) => {
    if (o instanceof THREE.Mesh) clipMeshes.push(o);
  });
  holder.traverse((o) => {
    if (o instanceof THREE.Mesh) clipMeshes.push(o);
  });

  const truthLights = new THREE.Group();
  truthLights.name = "acc:truthLights";
  truthLights.visible = false;
  truthLights.add(new THREE.HemisphereLight(0xf2f4f6, 0x8a8e94, 1.2));
  const k = new THREE.DirectionalLight(0xffffff, 0.7);
  k.position.set(8, 6, 12);
  const u = new THREE.DirectionalLight(0xffffff, 0.45);
  u.position.set(2, -8, -10);
  truthLights.add(k, u);

  const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  root.add(holder, midcase, reserves.front, reserves.rear, reserves.crown, debug, truthLights);
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) originals.set(o, o.material);
  });

  const setSection = (on: boolean): void => {
    for (const m of clipMeshes) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        if ("clippingPlanes" in mat) {
          (mat as THREE.Material & { clippingPlanes: THREE.Plane[] | null }).clippingPlanes = on ? [clip] : null;
          (mat as THREE.Material & { clipShadows?: boolean }).clipShadows = on;
        }
      }
    }
  };

  const ghosts = new Set<THREE.Material>([
    materials.ghostFront,
    materials.ghostRear,
    materials.ghostDial,
    materials.ghostCorridor,
    materials.contact,
    materials.lineSweep,
    materials.lineRequired,
    materials.lineCavity,
    materials.lineOuter,
    materials.boundary,
  ]);
  const setTruth = (on: boolean): void => {
    truthLights.visible = on;
    debug.visible = on;
    for (const [mesh, mat] of originals) {
      const isGhost = Array.isArray(mat) ? mat.some((m) => ghosts.has(m)) : ghosts.has(mat);
      mesh.material = on && !isGhost ? materials.truth : mat;
    }
  };

  return {
    root,
    plan,
    materials,
    report: () => makeReport(plan, packAudit, corridorAudit, pointContain),
    setTruth,
    setSection,
    setReserves: (on: boolean) => {
      reserves.front.visible = on;
      reserves.rear.visible = on;
      reserves.crown.visible = on;
    },
    setHolderAudit: (on: boolean) => {
      midcase.visible = !on;
      if (on) debug.visible = true;
    },
  };
}

function contourStats(pts: { x: number; y: number }[]): { width: number; height: number; area: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    minX = Math.min(minX, a.x);
    maxX = Math.max(maxX, a.x);
    minY = Math.min(minY, a.y);
    maxY = Math.max(maxY, a.y);
    area += a.x * b.y - b.x * a.y;
  }
  return { width: maxX - minX, height: maxY - minY, area: Math.abs(area) * 0.5 };
}

function makeReport(
  plan: AccommodationPlan,
  pack: ReturnType<typeof auditPackaging>,
  corridorAudit: ReturnType<typeof auditFiniteCorridor>,
  pointContain: { outside: number; total: number },
) {
  const radial = plan.contacts.filter((c) => c.purposes.includes("radial")).length;
  const axial = plan.contacts.filter((c) => c.purposes.includes("axial-up") || c.purposes.includes("axial-down")).length;
  const swept = contourStats(plan.sampledSweptContour);
  const required = contourStats(plan.requiredClearanceContour);
  const cavity = contourStats(plan.cavityContour);
  const outer = contourStats(plan.outerWall);
  return {
    method: plan.method,
    sweep: {
      ...plan.sweep,
      phases: plan.phases,
      exactTimes: plan.phases.map((p) => p.t),
      verticesOutsideHull: pointContain.outside,
      verticesEvaluated: pointContain.total,
      honesty:
        "conservative with respect to the sampled phases, not a continuous-time exact sweep",
    },
    staticBox: plan.staticBox,
    sweptBox: plan.sweptBox,
    contours: {
      sampledSwept: swept,
      requiredClearance: required,
      cavity,
      outer,
      cavityIsRequiredClearance: true,
      presentationContour: "none — built cavity is the required clearance contour",
    },
    radialPackaging: {
      requested: pack.requestedRadialClearance,
      achieved: pack.achievedRadialClearance,
      method: pack.radialMethod,
      contains: pack.radialContains,
      epsilon: pack.epsilon,
      accepted: pack.radialAccepted,
    },
    baselineWall: {
      requested: pack.requestedWall,
      achieved: pack.achievedWall,
      method: pack.wallMethod,
      contains: pack.wallContains,
      epsilon: pack.epsilon,
      accepted: pack.wallAccepted,
      separatedFromCrownOpening: true,
    },
    constantsLedger: {
      radialClearance: { value: ACC.radialClearance, role: "requested-and-validated" },
      wall: { value: ACC.wall, role: "requested-and-validated-baseline-shell" },
      corridorR: { value: ACC.corridorR, role: "requested-finite-cylinder-radius" },
      radialContact: { value: ACC.radialContact, role: "reserved-unimplemented" },
      corridorKeep: { value: ACC.corridorKeep, role: "reserved-unimplemented" },
      frontMoveClear: { value: ACC.frontMoveClear, role: "used-front-reserve" },
      rearMoveClear: { value: ACC.rearMoveClear, role: "used-rear-reserve" },
      dialStack: { value: ACC.dialStack, role: "used-front-reserve" },
      enclosureClear: { value: ACC.enclosureClear, role: "used-front-reserve" },
      frontClosureBand: { value: ACC.frontClosureBand, role: "used-front-reserve-range" },
      holderShelf: { value: ACC.holderShelf, role: "used-holder-geometry" },
      holderLip: { value: ACC.holderLip, role: "used-holder-geometry" },
      holderLipWidth: { value: ACC.holderLipWidth, role: "used-holder-geometry" },
      holderPadR: { value: ACC.holderPadR, role: "used-holder-geometry" },
      holderAvoidAnchor: { value: ACC.holderAvoidAnchor, role: "used-contact-filter" },
      crownHalfAngle: { value: ACC.crownHalfAngle, role: "used-contact-filter" },
      frontStruct: { value: ACC.frontStruct, role: "used-coarse-case-z" },
      rearStruct: { value: ACC.rearStruct, role: "used-coarse-case-z" },
      lugReserve: { value: ACC.lugReserve, role: "used-coarse-lug-boxes" },
      numericalEpsilon: { value: ACC_EPS, role: "numerical-tolerance" },
    },
    contacts: plan.contacts,
    radialContacts: radial,
    axialContacts: axial,
    radialStrategy: "cushion-matching holder ring outside mainplate hoop + 4 hoop pads",
    antiRotation: "asymmetric-cushion-nest + barrel/west/north-flank pads",
    axialChain: "plate-hoop → holder shelf/lip → midcase rear/front structural reserves (not crystal)",
    z: plan.z,
    frontReserve: {
      highestSweptZ: plan.z.moveMax,
      movementClearance: ACC.frontMoveClear,
      frontClearPlane: plan.z.frontClear,
      dialStackHeight: ACC.dialStack,
      dialTop: plan.z.dialTop,
      enclosureClearance: ACC.enclosureClear,
      frontClosureRange: [plan.z.frontCloseLo, plan.z.frontCloseHi],
      note: "no final front crystal plane",
    },
    rearReserve: {
      lowestSweptZ: plan.z.moveMin,
      movementClearance: ACC.rearMoveClear,
      rearClearPlane: plan.z.rearClear,
      provisionalRearClosure: plan.z.rearClose,
      note: "no finished rear sapphire or caseback",
    },
    corridor: corridorAudit,
    corridorSpec: plan.corridor,
    closureSemantics: plan.closureSemantics,
    package: {
      internalW: cavity.width,
      internalH: cavity.height,
      externalW: outer.width,
      externalH: outer.height,
      thickness: plan.z.midcaseTop - plan.z.midcaseBottom,
      requestedWall: ACC.wall,
      achievedWall: pack.achievedWall,
    },
  };
}

export function applyAccView(
  camera: THREE.PerspectiveCamera,
  controls: { target: THREE.Vector3; update: () => void; maxDistance?: number },
  name: AccViewName,
): void {
  const v = ACC_VIEWS[name];
  if (controls.maxDistance !== undefined && controls.maxDistance < 80) {
    controls.maxDistance = 80;
  }
  camera.position.copy(v.position);
  controls.target.copy(v.target);
  controls.update();
}
