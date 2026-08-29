import * as THREE from "three";
import type { Accommodation } from "./accommodation";
import type { DisplayLayer } from "./display";
import type { EnclosureLayer } from "./enclosure";
import { createReadoutPlan, type ReadoutPlan } from "./readoutPlan";
import { createReadoutMaterials, type ReadoutMaterials } from "./readoutMaterials";
import { buildReadoutGeometry, type ReadoutDrivenParts } from "./readoutGeometry";
import { auditReadout } from "./readoutAudit";
import {
  parseReadoutConcept,
  parseReadoutPose,
  poseRotations,
  READOUT,
  READOUT_PRODUCT_VIEWS,
  READOUT_SUPPORT_VIEW,
  READOUT_TRUTH_VIEWS,
  READOUT_VIEW_POSE,
  READOUT_VIEWS,
  type ReadoutViewName,
} from "./readoutSpec";

export type { ReadoutViewName };
export type { ReadoutDrivenParts };
export { READOUT_PRODUCT_VIEWS, READOUT_SUPPORT_VIEW, READOUT_TRUTH_VIEWS, READOUT_VIEW_POSE, READOUT_VIEWS };

export type ReadoutLayer = {
  root: THREE.Group;
  plan: ReadoutPlan;
  materials: ReadoutMaterials;
  drivenParts: ReadoutDrivenParts;
  report: () => ReadoutReport;
  setPose: (hours: number, minutes: number, id?: string) => void;
  setProduct: (on: boolean) => void;
  setTruth: (on: boolean) => void;
  setSection: (on: boolean) => void;
};

export type ReadoutReport = ReturnType<typeof makeReport>;

export function createReadout(opts: {
  display: DisplayLayer;
  accommodation: Accommodation;
  enclosure: EnclosureLayer | null;
  concept?: string | null;
  pose?: string | null;
}): ReadoutLayer {
  const displayPlan = opts.display.plan;
  const plan = createReadoutPlan(displayPlan, opts.accommodation.plan, opts.enclosure ? opts.enclosure.plan : null, {
    concept: opts.concept ?? READOUT.selectedConcept,
    pose: opts.pose ?? READOUT.defaultPose,
  });
  const materials = createReadoutMaterials(plan.concept.id);
  const built = buildReadoutGeometry(plan, materials);
  const audit = auditReadout(
    plan,
    displayPlan,
    opts.accommodation.plan,
    built.root,
    opts.enclosure ? opts.enclosure.plan : null,
  );
  if (!audit.accepted) {
    console.warn("Phase 4B readout audit flags", audit);
  }

  const clip = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0.15);
  const clipMeshes: THREE.Mesh[] = [];
  built.root.traverse((o) => {
    if (o instanceof THREE.Mesh) clipMeshes.push(o);
  });

  return {
    root: built.root,
    plan,
    materials,
    drivenParts: built.drivenParts,
    report: () => makeReport(plan, audit, displayPlan),
    setPose: (hours, minutes, id) => {
      const rot = poseRotations(hours, minutes);
      plan.pose.hours = hours;
      plan.pose.minutes = minutes;
      plan.pose.hourZ = rot.hourZ;
      plan.pose.minuteZ = rot.minuteZ;
      if (id) plan.pose.id = id;
    },
    setProduct: (on) => {
      built.root.visible = on;
      built.debug.visible = false;
    },
    setTruth: (on) => {
      built.root.visible = true;
      built.debug.visible = on;
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

function makeReport(plan: ReadoutPlan, audit: ReturnType<typeof auditReadout>, display: import("./displayPlan").DisplayPlan) {
  return {
    phase: "4B",
    thesis:
      "Visible two-hand display on frozen 3B/4A planes with explicit hour and minute mechanical mounts. Normal rotation is movement-driven; readoutPose is temporary override metadata only.",
    concept: plan.concept,
    rejected: plan.rejected,
    axis: audit.axis,
    pose: plan.pose,
    ownership: {
      normalRuntime: "movement-driven",
      temporaryOverride: "metadata only; the display-drive owner applies and restores it",
      hour: ["HourHandMount", "HourHand", "readout:hub:hourCollar"],
      minute: [
        "MinuteHandMount",
        "MinuteHand",
        "readout:hub:minuteStem",
        "readout:hub:minuteCollar",
        "readout:hub:cap",
      ],
    },
    hourHand: {
      tipR: plan.hourHand.tipR,
      tailR: plan.hourHand.tailR,
      maxWidthPlanned: plan.hourHand.maxWidth,
      maxWidthMeasured: audit.hour.extent.maxX - audit.hour.extent.minX,
      thick: plan.hourHand.thick,
      z0: plan.hourHand.z0,
      z1: plan.hourHand.z1,
      measuredR: audit.hour.extent.maxR,
      frozenAllowR: plan.frozen.hourSweepR,
      frozenZ: [plan.frozen.hourZ0, plan.frozen.hourZ1],
      mountBoreR: plan.hourHand.mountBoreR,
      contained: audit.hour.ok,
      reasons: audit.hour.reasons,
    },
    minuteHand: {
      tipR: plan.minuteHand.tipR,
      tailR: plan.minuteHand.tailR,
      maxWidthPlanned: plan.minuteHand.maxWidth,
      maxWidthMeasured: audit.minute.extent.maxX - audit.minute.extent.minX,
      thick: plan.minuteHand.thick,
      z0: plan.minuteHand.z0,
      z1: plan.minuteHand.z1,
      measuredR: audit.minute.extent.maxR,
      frozenAllowR: plan.frozen.minuteSweepR,
      frozenZ: [plan.frozen.minuteZ0, plan.frozen.minuteZ1],
      contained: audit.minute.ok,
      reasons: audit.minute.reasons,
    },
    handToChapter: {
      minuteTipToNearestMarker: plan.separations.minuteTipToNearestMarker,
      hourTipToNearestMarker: plan.separations.hourTipToNearestMarker,
    },
    stationRadial: plan.stationRadial,
    handSeparation: audit.handSeparation,
    hub: {
      maxR: plan.hub.maxR,
      measuredR: audit.hub.extent.maxR,
      minZ: audit.hub.extent.minZ,
      maxZ: audit.hub.extent.maxZ,
      frozenInterfaceR: plan.frozen.interfaceOuterR,
      frozenZ: [plan.frozen.interfaceZ0, plan.frozen.displayMaxZ],
      contained: audit.hub.ok,
      reasons: audit.hub.reasons,
      collars: {
        hour: {
          innerR: plan.hub.hourCollarInnerR,
          outerR: plan.hub.hourCollarR,
          z0: plan.hub.hourZ0,
          z1: plan.hub.hourZ1,
        },
        minute: { r: plan.hub.minuteCollarR, z0: plan.hub.minuteZ0, z1: plan.hub.minuteZ1 },
        cap: { r: plan.hub.capR, z0: plan.hub.capZ0, z1: plan.hub.capZ1 },
      },
    },
    chapter: {
      support: plan.chapter.support,
      bandWidth: plan.chapter.bandWidth,
      z0: plan.chapter.z0,
      z1: plan.chapter.z1,
      markerZ: [plan.chapter.markerZ0, plan.chapter.markerZ1],
      markers: audit.markers,
      containment: audit.chapter,
      caseClearance: audit.caseClearance,
      supports: {
        architecture: plan.chapter.support,
        feet: plan.chapter.supports.map((s) => ({
          id: s.id,
          source: s.source,
          angleDeg: (s.angle * 180) / Math.PI,
          rRailInner: s.rRailInner,
          rRailOuter: s.rRailOuter,
          rWall: s.rCarrierInner,
          rContact: s.rContact,
          overlap: s.overlap,
          gapToCarrier: s.gapToCarrier,
          sweepClearance: s.sweepClearance,
          riserZ: [s.riserZ0, s.riserZ1],
        })),
        audit: audit.supports,
      },
    },
    sapphire: audit.sapphire,
    displayPlanes: display.planes,
    seconds: { included: false, disposition: READOUT.seconds },
    notClaimed: plan.notClaimed,
    accepted: audit.accepted,
  };
}

export function applyReadoutView(
  camera: THREE.PerspectiveCamera,
  controls: { target: THREE.Vector3; update: () => void; maxDistance?: number },
  name: ReadoutViewName,
  plan: ReadoutPlan,
): void {
  const damping = "enableDamping" in controls ? (controls as { enableDamping: boolean }).enableDamping : false;
  if ("enableDamping" in controls) (controls as { enableDamping: boolean }).enableDamping = false;
  if (controls.maxDistance !== undefined && controls.maxDistance < 90) controls.maxDistance = 90;
  const a = plan.axis;
  const midZ = (plan.hourHand.z0 + plan.minuteHand.z1) * 0.5;
  const views: Record<ReadoutViewName, { p: THREE.Vector3; t: THREE.Vector3 }> = {
    readoutHero: { p: new THREE.Vector3(26, 20, 34), t: new THREE.Vector3(-0.6, 0.8, 1.6) },
    readoutFront: { p: new THREE.Vector3(-1.2, 1.0, 58), t: new THREE.Vector3(-1.2, 1.0, midZ) },
    readoutFrontHard: { p: new THREE.Vector3(-1.2, 1.0, 58), t: new THREE.Vector3(-1.2, 1.0, midZ) },
    readoutFront840: { p: new THREE.Vector3(-1.2, 1.0, 58), t: new THREE.Vector3(-1.2, 1.0, midZ) },
    readoutFront945: { p: new THREE.Vector3(-1.2, 1.0, 58), t: new THREE.Vector3(-1.2, 1.0, midZ) },
    readoutThreeQuarter: { p: new THREE.Vector3(20, 15, 30), t: new THREE.Vector3(-0.6, 0.8, 2.4) },
    readoutCrown: { p: new THREE.Vector3(32, 11, 18), t: new THREE.Vector3(1.4, 0.3, 2.6) },
    readoutProfile: { p: new THREE.Vector3(0.4, -24, 11.5), t: new THREE.Vector3(-0.4, 0.4, midZ) },
    readoutHubMacro: { p: new THREE.Vector3(0.95, 0.7, 6.15), t: new THREE.Vector3(a.x, a.y, midZ) },
    readoutChapterMacro: { p: new THREE.Vector3(0.15, 7.15, 8.6), t: new THREE.Vector3(a.x, 10.85, plan.chapter.markerZ1) },
    readoutSweep: { p: new THREE.Vector3(a.x + 4, a.y + 6, 28), t: new THREE.Vector3(a.x, a.y, midZ) },
    readoutChapterContain: { p: new THREE.Vector3(a.x - 1.2, a.y + 1.0, 52), t: new THREE.Vector3(a.x - 1.2, a.y + 1.0, plan.chapter.z1) },
    readoutSection: { p: new THREE.Vector3(9.6, a.y + 0.12, 5.45), t: new THREE.Vector3(a.x, a.y + 0.05, midZ) },
    readoutSupport: { p: new THREE.Vector3(-6.2, 4.1, 5.85), t: new THREE.Vector3(-12.15, 2.45, 4.52) },
  };
  const v = views[name];
  camera.position.copy(v.p);
  controls.target.copy(v.t);
  controls.update();
  if ("enableDamping" in controls) (controls as { enableDamping: boolean }).enableDamping = damping;
}

export function applyReadoutPoseFromQuery(layer: ReadoutLayer, raw: string | null): void {
  const parsed = parseReadoutPose(raw);
  layer.setPose(parsed.hours, parsed.minutes, parsed.id);
}

export { parseReadoutConcept, parseReadoutPose };
