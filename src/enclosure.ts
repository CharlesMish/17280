import * as THREE from "three";
import type { Movement } from "./movement";
import type { MovementAssembly } from "./assembly";
import type { Accommodation } from "./accommodation";
import type { DisplayLayer } from "./display";
import { createEnclosurePlan, type EnclosurePlan } from "./enclosurePlan";
import {
  auditCrownPassThrough,
  auditFasteners,
  auditFrontClearance,
  auditRearClearance,
  auditResidual,
} from "./enclosureAudit";
import {
  buildClosureDebug,
  buildFrontCarrier,
  buildFrontCrystal,
  buildGaskets,
  buildRearCarrier,
  buildRearCrystal,
  createEncMaterials,
  type EncMaterials,
} from "./enclosureGeometry";
import { ENC } from "./enclosureSpec";

export type EncViewName =
  | "encHero"
  | "encFront"
  | "encFrontClear"
  | "encRear"
  | "encRearClear"
  | "encSection"
  | "encSeat"
  | "encRetention"
  | "encCrown";

export type EnclosureLayer = {
  root: THREE.Group;
  plan: EnclosurePlan;
  materials: EncMaterials;
  report: () => EncReport;
  setTruth: (on: boolean) => void;
  setSection: (on: boolean) => void;
};

export type EncReport = ReturnType<typeof makeReport>;

export function createEnclosure(opts: {
  movement: Movement;
  structureRoot: THREE.Object3D;
  accommodation: Accommodation;
  display: DisplayLayer;
  assembly: MovementAssembly | null;
  renderer: THREE.WebGLRenderer;
}): EnclosureLayer {
  opts.renderer.localClippingEnabled = true;
  const acc = opts.accommodation.plan;
  const display = opts.display.plan;
  const plan = createEnclosurePlan(acc, display);
  const materials = createEncMaterials();

  const frontClear = auditFrontClearance(plan, display, acc);
  const rearClear = auditRearClearance(plan, opts.movement, opts.structureRoot, opts.assembly?.root ?? null);
  const crown = auditCrownPassThrough(plan, acc);
  const residual = auditResidual(plan);
  const fasteners = auditFasteners(plan, acc);
  if (!frontClear.accepted) {
    throw new Error(`Phase 3C front clearance ${frontClear.achieved} < required ${frontClear.required}`);
  }
  if (!rearClear.accepted) {
    throw new Error(`Phase 3C rear clearance ${rearClear.achieved} < required ${rearClear.required}`);
  }
  if (!crown.preserved) {
    throw new Error("Phase 3C enclosure overlaps frozen crown corridor window");
  }

  const root = new THREE.Group();
  root.name = "EnclosureRoot";
  const frontCarrier = buildFrontCarrier(plan, materials);
  const frontCrystal = buildFrontCrystal(plan, materials);
  const rearCarrier = buildRearCarrier(plan, materials);
  const rearCrystal = buildRearCrystal(plan, materials);
  const gaskets = buildGaskets(plan, materials);
  const debug = buildClosureDebug(plan, materials);
  debug.visible = false;
  frontCarrier.add(gaskets);
  root.add(frontCarrier, frontCrystal, rearCarrier, rearCrystal, debug);

  const clip = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0.15);
  const clipMeshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) clipMeshes.push(o);
  });
  const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) originals.set(o, o.material);
  });
  const ghosts = new Set<THREE.Material>([
    materials.sapphire,
    materials.ghostFront,
    materials.ghostRear,
    materials.seat,
    materials.fastener,
    materials.lineSeat,
    materials.gasket,
  ]);

  const truthLights = new THREE.Group();
  truthLights.name = "enc:truthLights";
  truthLights.visible = false;
  truthLights.add(new THREE.HemisphereLight(0xf3f5f7, 0x8a8e94, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 0.5);
  key.position.set(7, 6, 12);
  truthLights.add(key);
  root.add(truthLights);

  return {
    root,
    plan,
    materials,
    report: () => makeReport(plan, frontClear, rearClear, crown, residual, fasteners, acc, display),
    setTruth: (on) => {
      truthLights.visible = on;
      debug.visible = on;
      for (const [mesh, mat] of originals) {
        const isGhost = Array.isArray(mat) ? mat.some((m) => ghosts.has(m)) : ghosts.has(mat);
        mesh.material = on && !isGhost ? materials.truth : mat;
      }
    },
    setSection: (on) => {
      for (const m of clipMeshes) {
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) {
          if ("clippingPlanes" in mat) {
            (mat as THREE.Material & { clippingPlanes: THREE.Plane[] | null }).clippingPlanes = on ? [clip] : null;
          }
        }
      }
    },
  };
}

function makeReport(
  plan: EnclosurePlan,
  front: ReturnType<typeof auditFrontClearance>,
  rear: ReturnType<typeof auditRearClearance>,
  crown: ReturnType<typeof auditCrownPassThrough>,
  residual: ReturnType<typeof auditResidual>,
  fasteners: ReturnType<typeof auditFasteners>,
  acc: import("./accommodationPlan").AccommodationPlan,
  display: import("./displayPlan").DisplayPlan,
) {
  return {
    constants: ENC,
    gate: plan.gate,
    front: {
      footprint: "exact inward offset of frozen 3A cavityContour",
      inner: plan.front.inner,
      provisionalOuter: "flat min-thickness slab + inset boxed cap (provisional realization)",
      seatZ: plan.front.seatZ,
      supportWidth: plan.front.supportWidth,
      gasket: plan.front.gasket,
      closureRange: plan.front.closureRange,
      minThick: plan.front.minThick,
      maxOuterEnvelope: plan.front.outerEnvelopeZ,
      packageLimit: plan.front.packageLimitZ,
      packageExpanded: false,
      clearance: front,
    },
    rear: {
      exhibition: "exact inward offset of frozen sampledSweptContour",
      inner: plan.rear.inner,
      provisionalOuter: "flat min-thickness slab + inset boxed cap (provisional realization)",
      seatZ: plan.rear.seatZ,
      supportWidth: plan.rear.supportWidth,
      gasket: plan.rear.gasket,
      minThick: plan.rear.minThick,
      maxOuterEnvelope: plan.rear.outerEnvelopeZ,
      packageLimit: plan.rear.packageLimitZ,
      packageExpanded: false,
      clearance: rear,
    },
    seats: residual,
    fasteners,
    retention: {
      chain: "mainplate hoop → frozen 3A holder → rear-carrier shoulder → midcase register",
      newMovementContacts: false,
      caseSideHolderContact: "rear carrier annular shoulder under frozen holder ring at rearClose",
      frontCrystalRole: "enclosure/sealing only",
      rearCrystalRole: "enclosure/sealing only",
      crystalsRetainMovement: false,
    },
    closure: plan.closure,
    crown: {
      ...crown,
      corridor: {
        origin: acc.corridor.origin,
        endAt: acc.corridor.endAt,
        radius: acc.corridor.radius,
        z: acc.corridor.z,
      },
    },
    package: {
      accMidcaseTop: acc.z.midcaseTop,
      accMidcaseBottom: acc.z.midcaseBottom,
      accThickness: acc.z.midcaseTop - acc.z.midcaseBottom,
      frontFunctionalOuter: plan.front.inner.z + plan.front.minThick + plan.front.provisionalCap,
      rearFunctionalOuter: plan.rear.inner.z - plan.rear.minThick - plan.rear.provisionalCap,
      enclosedThickness:
        plan.front.inner.z +
        plan.front.minThick +
        plan.front.provisionalCap -
        (plan.rear.inner.z - plan.rear.minThick - plan.rear.provisionalCap),
      displayMax: display.envelope.maxZ,
    },
    notClaimed: [
      "water resistance / ATM",
      "gasket compression performance",
      "sapphire strength certification",
      "final outer crystal sculpture",
      "final bezel / caseback sculpture",
      "crown / stem / keyless works",
      "motion works",
    ],
  };
}

export function applyEncView(
  camera: THREE.PerspectiveCamera,
  controls: { target: THREE.Vector3; update: () => void; maxDistance?: number },
  name: EncViewName,
  plan: EnclosurePlan,
  hints: { frontXy: { x: number; y: number }; rearXy: { x: number; y: number } },
): void {
  if (controls.maxDistance !== undefined && controls.maxDistance < 80) controls.maxDistance = 80;
  const mid = (plan.front.inner.z + plan.rear.inner.z) * 0.5;
  const views: Record<EncViewName, { p: THREE.Vector3; t: THREE.Vector3 }> = {
    encHero: { p: new THREE.Vector3(20, 15, 32), t: new THREE.Vector3(-1.0, 1.2, 1.8) },
    encFront: { p: new THREE.Vector3(-1.4, 1.1, 46), t: new THREE.Vector3(-1.4, 1.1, plan.front.inner.z) },
    encFrontClear: {
      p: new THREE.Vector3(hints.frontXy.x + 8, hints.frontXy.y + 6, plan.front.inner.z + 4),
      t: new THREE.Vector3(hints.frontXy.x, hints.frontXy.y, plan.front.inner.z),
    },
    encRear: { p: new THREE.Vector3(-1.4, 1.0, -40), t: new THREE.Vector3(-1.4, 1.0, plan.rear.inner.z) },
    encRearClear: {
      p: new THREE.Vector3(hints.rearXy.x + 7, hints.rearXy.y - 8, plan.rear.inner.z - 6),
      t: new THREE.Vector3(hints.rearXy.x, hints.rearXy.y, plan.rear.inner.z),
    },
    encSection: { p: new THREE.Vector3(30, 1.0, 3.8), t: new THREE.Vector3(1.2, 1.0, mid) },
    encSeat: { p: new THREE.Vector3(8, -18, 18), t: new THREE.Vector3(-1, 1, plan.front.seatZ) },
    encRetention: { p: new THREE.Vector3(10, -20, -8), t: new THREE.Vector3(-2, 0, plan.rear.holderShoulderZ) },
    encCrown: { p: new THREE.Vector3(11.6, 0.2, 18), t: new THREE.Vector3(11.6, 0.2, -0.2) },
  };
  const v = views[name];
  camera.position.copy(v.p);
  controls.target.copy(v.t);
  controls.update();
}
