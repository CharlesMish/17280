import * as THREE from "three";
import type { Movement } from "./movement";
import type { MovementAssembly } from "./assembly";
import type { Accommodation } from "./accommodation";
import { createDisplayPlan, type DisplayPlan } from "./displayPlan";
import { auditChapter, auditSweepClearance, type SweepClearance } from "./displayAudit";
import {
  buildChapter,
  buildDisplayDebug,
  buildDisplayStack,
  buildEnvelopeGhost,
  buildSweeps,
  createDisplayMaterials,
  type DisplayMaterials,
} from "./displayGeometry";
import { DISP } from "./displaySpec";

export type DisplayViewName =
  | "dispStack"
  | "dispTop"
  | "dispSection"
  | "dispSweep"
  | "dispChapter"
  | "dispEnvelope"
  | "dispHero";

export type DisplayLayer = {
  root: THREE.Group;
  plan: DisplayPlan;
  materials: DisplayMaterials;
  report: () => DisplayReport;
  setTruth: (on: boolean) => void;
  setSection: (on: boolean) => void;
  setEnvelope: (on: boolean) => void;
};

export type DisplayReport = ReturnType<typeof makeReport>;

export function createDisplay(opts: {
  movement: Movement;
  structureRoot: THREE.Object3D;
  accommodation: Accommodation;
  assembly: MovementAssembly | null;
  renderer: THREE.WebGLRenderer;
}): DisplayLayer {
  opts.renderer.localClippingEnabled = true;
  const accPlan = opts.accommodation.plan;
  const plan = createDisplayPlan(opts.movement.layout, accPlan, opts.assembly ? opts.assembly.plan : null);
  const materials = createDisplayMaterials();

  const hourAudit = auditSweepClearance(plan.hourSweep, opts.movement, opts.structureRoot, opts.assembly?.root ?? null);
  const minuteAudit = auditSweepClearance(plan.minuteSweep, opts.movement, opts.structureRoot, opts.assembly?.root ?? null);
  const chapterAudit = auditChapter(plan, accPlan);

  const root = new THREE.Group();
  root.name = "DisplayRoot";
  const stackPose = new THREE.Group();
  stackPose.name = "DisplayStackPose";
  const sweepPose = new THREE.Group();
  sweepPose.name = "DisplaySweepPose";
  const chapterPose = new THREE.Group();
  chapterPose.name = "DisplayChapterPose";
  const envelopePose = new THREE.Group();
  envelopePose.name = "DisplayEnvelopePose";
  stackPose.add(buildDisplayStack(plan, materials));
  sweepPose.add(buildSweeps(plan, materials));
  chapterPose.add(buildChapter(plan, materials));
  envelopePose.add(buildEnvelopeGhost(plan, materials));
  envelopePose.visible = false;
  const debug = buildDisplayDebug(plan, accPlan, materials);
  debug.visible = false;

  const clip = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0.15);
  const clipMeshes: THREE.Mesh[] = [];
  root.add(stackPose, sweepPose, chapterPose, envelopePose, debug);
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) clipMeshes.push(o);
  });

  const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) originals.set(o, o.material);
  });
  const ghosts = new Set<THREE.Material>([
    materials.hourSweep,
    materials.minuteSweep,
    materials.chapter,
    materials.envelope,
    materials.lineCavity,
    materials.lineChapter,
  ]);

  const truthLights = new THREE.Group();
  truthLights.name = "display:truthLights";
  truthLights.visible = false;
  truthLights.add(new THREE.HemisphereLight(0xf4f6f8, 0x8c9096, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 0.55);
  key.position.set(6, 8, 14);
  truthLights.add(key);
  root.add(truthLights);

  return {
    root,
    plan,
    materials,
    report: () => makeReport(plan, hourAudit, minuteAudit, chapterAudit),
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
    setEnvelope: (on) => {
      envelopePose.visible = on;
    },
  };
}

function makeReport(
  plan: DisplayPlan,
  hour: SweepClearance,
  minute: SweepClearance,
  chapter: ReturnType<typeof auditChapter>,
) {
  return {
    topology: plan.topology,
    axis: {
      sourcePivotId: plan.topology.sourcePivotId,
      sourceXy: plan.sourcePivotXy,
      displayXy: plan.axis,
      drift: plan.axisDrift,
    },
    seconds: {
      included: false,
      disposition: plan.topology.seconds,
      reason: plan.topology.secondsReason,
    },
    jewelTopZ: plan.jewelTopZ,
    jewelTopSource: plan.jewelTopSource,
    constants: DISP,
    interfaceBase: plan.interfaceBase,
    pipes: plan.pipes,
    planes: plan.planes,
    hourSweep: plan.hourSweep,
    minuteSweep: plan.minuteSweep,
    separations: plan.separations,
    hourClearance: hour,
    minuteClearance: minute,
    chapter: {
      construction: "exact inward offset of frozen 3A cavityContour",
      cavityClearanceRequested: plan.chapter.cavityClearance,
      bandWidth: plan.chapter.bandWidth,
      z0: plan.chapter.z0,
      z1: plan.chapter.z1,
      ...chapter,
    },
    envelope: plan.envelope,
    fit: plan.fit,
    notClaimed: plan.topology.notClaimed,
  };
}

export function applyDisplayView(
  camera: THREE.PerspectiveCamera,
  controls: { target: THREE.Vector3; update: () => void; maxDistance?: number },
  name: DisplayViewName,
  plan: DisplayPlan,
  sweepHint?: { x: number; y: number },
): void {
  if (controls.maxDistance !== undefined && controls.maxDistance < 80) controls.maxDistance = 80;
  const a = plan.axis;
  const midZ = (plan.planes.hourMount + plan.planes.minuteMount) * 0.5;
  const views: Record<DisplayViewName, { p: THREE.Vector3; t: THREE.Vector3 }> = {
    dispStack: {
      p: new THREE.Vector3(a.x + 4.2, a.y + 3.4, 8.4),
      t: new THREE.Vector3(a.x, a.y, midZ),
    },
    dispTop: {
      p: new THREE.Vector3(a.x - 1.4, a.y + 1.1, 46),
      t: new THREE.Vector3(a.x - 1.4, a.y + 1.1, midZ),
    },
    dispSection: {
      p: new THREE.Vector3(28, a.y + 1.0, 4.6),
      t: new THREE.Vector3(a.x + 1.2, a.y + 1.0, midZ),
    },
    dispSweep: {
      p: new THREE.Vector3((sweepHint?.x ?? a.x) + 8, (sweepHint?.y ?? a.y) + 6, 10),
      t: new THREE.Vector3(sweepHint?.x ?? a.x, sweepHint?.y ?? a.y, plan.hourSweep.z0),
    },
    dispChapter: {
      p: new THREE.Vector3(a.x - 1.4, a.y + 1.1, 46),
      t: new THREE.Vector3(a.x - 1.4, a.y + 1.1, plan.chapter.z1),
    },
    dispEnvelope: {
      p: new THREE.Vector3(a.x + 16, a.y + 12, 28),
      t: new THREE.Vector3(a.x, a.y, midZ),
    },
    dispHero: {
      p: new THREE.Vector3(18, 14, 30),
      t: new THREE.Vector3(a.x - 1.0, a.y + 1.2, 2.2),
    },
  };
  const v = views[name];
  camera.position.copy(v.p);
  controls.target.copy(v.t);
  controls.update();
}
