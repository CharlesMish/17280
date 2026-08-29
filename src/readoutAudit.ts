import * as THREE from "three";
import { pointInConvex, pointToPolygonBoundary } from "./accommodationMath";
import type { AccommodationPlan } from "./accommodationPlan";
import type { DisplayPlan } from "./displayPlan";
import type { EnclosurePlan } from "./enclosurePlan";
import type { ReadoutPlan } from "./readoutPlan";

export type MeshExtent = {
  name: string;
  count: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  maxR: number;
  maxWidth: number;
};

const EPS = 1e-4;

function family(obj: THREE.Object3D, fallback: string): string {
  let p: THREE.Object3D | null = obj;
  while (p) {
    if (p.name && (p.name.startsWith("readout:") || p.name.endsWith("Hand") || p.name.endsWith("Mount"))) {
      return p.name;
    }
    p = p.parent;
  }
  return obj.name || fallback;
}

export function measureNamed(
  root: THREE.Object3D,
  test: (name: string) => boolean,
  axis: { x: number; y: number } = { x: 0, y: 0 },
): MeshExtent {
  const v = new THREE.Vector3();
  let count = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let maxR = 0;
  let name = "?";
  const axisX = axis.x;
  const axisY = axis.y;
  root.updateWorldMatrix(true, true);
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const label = family(obj, obj.name);
    if (!test(label) && !test(obj.name)) return;
    const pos = obj.geometry.getAttribute("position");
    if (!pos) return;
    obj.updateWorldMatrix(true, false);
    name = label;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
      count += 1;
      minX = Math.min(minX, v.x);
      maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y);
      maxY = Math.max(maxY, v.y);
      minZ = Math.min(minZ, v.z);
      maxZ = Math.max(maxZ, v.z);
      maxR = Math.max(maxR, Math.hypot(v.x - axisX, v.y - axisY));
    }
  });
  return {
    name,
    count,
    minX,
    maxX,
    minY,
    maxY,
    minZ,
    maxZ,
    maxR,
    maxWidth: Math.max(maxX - minX, maxY - minY),
  };
}

function containsSweep(ext: MeshExtent, r: number, z0: number, z1: number): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (ext.count === 0) reasons.push("no vertices");
  if (ext.maxR > r + EPS) reasons.push(`radius ${ext.maxR} > ${r}`);
  if (ext.minZ < z0 - EPS) reasons.push(`z0 ${ext.minZ} < ${z0}`);
  if (ext.maxZ > z1 + EPS) reasons.push(`z1 ${ext.maxZ} > ${z1}`);
  return { ok: reasons.length === 0, reasons };
}

function isChapterSystemMesh(obj: THREE.Object3D): boolean {
  const n = obj.name;
  const parent = obj.parent?.name ?? "";
  return (
    n.startsWith("readout:index") ||
    n.startsWith("readout:carrier") ||
    n.startsWith("readout:tab") ||
    n.startsWith("readout:rail") ||
    n.startsWith("readout:attach") ||
    n.startsWith("readout:support") ||
    parent === "readout:carrier" ||
    parent === "readout:indices" ||
    parent === "readout:supports" ||
    parent === "readout:carrierRing"
  );
}

function chapterContainment(
  root: THREE.Object3D,
  display: DisplayPlan,
  acc: AccommodationPlan,
  z0: number,
  z1: number,
): {
  ok: boolean;
  outside: number;
  insideHole: number;
  zFail: number;
  supportOutsideCavity: number;
  count: number;
  minToOuter: number;
  minToCavity: number;
  minToWall: number;
} {
  const v = new THREE.Vector3();
  let outside = 0;
  let insideHole = 0;
  let zFail = 0;
  let supportOutsideCavity = 0;
  let count = 0;
  let minToOuter = Infinity;
  let minToCavity = Infinity;
  let minToWall = Infinity;
  root.updateWorldMatrix(true, true);
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (!isChapterSystemMesh(obj)) return;
    const isSupport = obj.name.startsWith("readout:support");
    const pos = obj.geometry.getAttribute("position");
    if (!pos) return;
    obj.updateWorldMatrix(true, false);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
      count += 1;
      const p = { x: v.x, y: v.y };
      if (v.z < z0 - EPS || v.z > z1 + EPS) zFail += 1;
      if (pointInConvex(p, display.chapter.inner, 0) && pointToPolygonBoundary(p, display.chapter.inner) > 0.045) {
        insideHole += 1;
      }
      if (isSupport) {
        if (!pointInConvex(p, acc.cavityContour, EPS)) supportOutsideCavity += 1;
      } else if (!pointInConvex(p, display.chapter.outer, EPS)) {
        outside += 1;
      }
      minToOuter = Math.min(minToOuter, pointToPolygonBoundary(p, display.chapter.outer));
      minToCavity = Math.min(minToCavity, pointToPolygonBoundary(p, acc.cavityContour));
      minToWall = Math.min(minToWall, pointToPolygonBoundary(p, acc.outerWall));
    }
  });
  return {
    ok: outside === 0 && insideHole === 0 && zFail === 0 && supportOutsideCavity === 0 && count > 0,
    outside,
    insideHole,
    zFail,
    supportOutsideCavity,
    count,
    minToOuter,
    minToCavity,
    minToWall,
  };
}

function auditSupports(
  plan: ReadoutPlan,
  display: DisplayPlan,
): {
  count: number;
  minOverlap: number;
  maxGap: number;
  minSweepClearance: number;
  outsideSweep: boolean;
  meetsWall: boolean;
  zInChapter: boolean;
  sources: string[];
} {
  const minOverlap = plan.separations.supportMinOverlap;
  const maxGap = plan.separations.supportMaxGap;
  const minSweepClearance = Math.min(
    plan.separations.supportMinSweepClearance,
    ...plan.chapter.supports.map((s) => s.rRailOuter - display.minuteSweep.radius),
  );
  const meetsWall = plan.chapter.supports.every((s) => s.rContact + 1e-9 >= s.rCarrierInner && s.gapToCarrier <= EPS);
  const zInChapter = plan.chapter.supports.every(
    (s) => s.riserZ0 + EPS >= display.chapter.z0 && s.riserZ1 <= display.chapter.z1 + EPS,
  );
  return {
    count: plan.chapter.supports.length,
    minOverlap,
    maxGap,
    minSweepClearance,
    outsideSweep: minSweepClearance > 0,
    meetsWall,
    zInChapter,
    sources: [...new Set(plan.chapter.supports.map((s) => s.source))],
  };
}

export function auditReadout(
  plan: ReadoutPlan,
  display: DisplayPlan,
  acc: AccommodationPlan,
  root: THREE.Object3D,
  enclosure: EnclosurePlan | null = null,
): {
  accepted: boolean;
  axis: { source: { x: number; y: number }; actual: { x: number; y: number }; drift: number; ok: boolean };
  hour: ReturnType<typeof containsSweep> & { extent: MeshExtent };
  minute: ReturnType<typeof containsSweep> & { extent: MeshExtent };
  hub: ReturnType<typeof containsSweep> & { extent: MeshExtent };
  chapter: ReturnType<typeof chapterContainment>;
  handSeparation: { hourTop: number; minuteBottom: number; gap: number; ok: boolean };
  sapphire: {
    visibleMaxZ: number;
    plannedMaxZ: number;
    innerZ: number;
    remaining: number;
    authorized: number;
    ok: boolean;
  };
  caseClearance: { carrierToCavity: number; carrierToOuterWall: number };
  markers: { n: number; hour: number; angleDeg: number; r0: number; r1: number; kind: string }[];
  stationRadial: ReadoutPlan["stationRadial"];
  supports: ReturnType<typeof auditSupports>;
  secondsPresent: boolean;
} {
  const hourMount = root.getObjectByName("HourHandMount");
  const minuteMount = root.getObjectByName("MinuteHandMount");
  const savedH = hourMount?.rotation.z ?? 0;
  const savedM = minuteMount?.rotation.z ?? 0;
  if (hourMount) hourMount.rotation.z = 0;
  if (minuteMount) minuteMount.rotation.z = 0;
  const hourExt = measureNamed(root, (n) => n === "HourHand" || n === "HourHandMount", plan.axis);
  const minuteExt = measureNamed(root, (n) => n === "MinuteHand" || n === "MinuteHandMount", plan.axis);
  if (hourMount) hourMount.rotation.z = savedH;
  if (minuteMount) minuteMount.rotation.z = savedM;
  const hubExt = measureNamed(root, (n) => n.startsWith("readout:hub"), plan.axis);
  const hour = { ...containsSweep(hourExt, display.hourSweep.radius, display.hourSweep.z0, display.hourSweep.z1), extent: hourExt };
  const minute = {
    ...containsSweep(minuteExt, display.minuteSweep.radius, display.minuteSweep.z0, display.minuteSweep.z1),
    extent: minuteExt,
  };
  const hub = {
    ...containsSweep(hubExt, display.interfaceBase.outerR, display.interfaceBase.z0, display.planes.displayMax),
    extent: hubExt,
  };
  const chapter = chapterContainment(root, display, acc, display.chapter.z0, display.chapter.z1);
  const supports = auditSupports(plan, display);
  const allReadout = measureNamed(
    root,
    (n) => ((n.startsWith("readout:") || n === "HourHand" || n === "MinuteHand") && !n.includes("debug")),
    plan.axis,
  );
  const gap = plan.minuteHand.z0 - plan.hourHand.z1;
  const measuredMaxZ = allReadout.maxZ;
  const sapphireInner = enclosure ? enclosure.front.inner.z : plan.separations.sapphireInnerZ;
  const remaining = sapphireInner - measuredMaxZ;
  const sapphireOk =
    measuredMaxZ <= display.planes.displayMax + EPS && remaining + EPS >= plan.separations.authorizedRemaining;
  let secondsPresent = false;
  root.traverse((o) => {
    if (o.name.toLowerCase().includes("second")) secondsPresent = true;
  });
  const axisOk = plan.axisDrift <= EPS;
  const accepted =
    axisOk &&
    hour.ok &&
    minute.ok &&
    hub.ok &&
    chapter.ok &&
    gap > 0 &&
    sapphireOk &&
    !secondsPresent &&
    supports.count >= 3 &&
    supports.meetsWall &&
    supports.zInChapter &&
    supports.outsideSweep &&
    supports.maxGap <= EPS;
  return {
    accepted,
    axis: { source: plan.sourcePivotXy, actual: plan.axis, drift: plan.axisDrift, ok: axisOk },
    hour,
    minute,
    hub,
    chapter,
    handSeparation: { hourTop: plan.hourHand.z1, minuteBottom: plan.minuteHand.z0, gap, ok: gap > 0 },
    sapphire: {
      visibleMaxZ: measuredMaxZ,
      plannedMaxZ: plan.separations.visibleMaxZ,
      innerZ: sapphireInner,
      remaining,
      authorized: plan.separations.authorizedRemaining,
      ok: sapphireOk,
    },
    caseClearance: {
      carrierToCavity: plan.separations.carrierToCavity,
      carrierToOuterWall: plan.separations.carrierToOuterWall,
    },
    markers: plan.markers.map((m) => ({
      n: m.n,
      hour: m.hour,
      angleDeg: (m.angle * 180) / Math.PI,
      r0: m.r0,
      r1: m.r1,
      kind: m.kind,
    })),
    stationRadial: plan.stationRadial,
    supports,
    secondsPresent,
  };
}
