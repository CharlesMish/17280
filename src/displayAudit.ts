import * as THREE from "three";
import type { Movement } from "./movement";
import { isCalibreAuthorityMesh } from "./accommodationPlan";
import { ACC_PHASES } from "./accommodationSpec";
import { pointToPolygonBoundary } from "./accommodationMath";
import type { DisplayPlan, SweepEnvelope } from "./displayPlan";
import type { AccommodationPlan } from "./accommodationPlan";

export type SweepClearance = {
  id: string;
  method: "sampled-frozen-calibre-vertices-in-sweep-disk-all-ACC-phases";
  notExactTriangle: true;
  samplesInDisk: number;
  nearest: string;
  nearestXy: { x: number; y: number };
  nearestZ: number;
  minClearance: number;
};

function familyName(obj: THREE.Object3D): string {
  let p: THREE.Object3D | null = obj;
  while (p) {
    if (
      p.name &&
      (p.name.includes(":") ||
        p.name === "mainplate" ||
        p.name.endsWith("Bridge") ||
        p.name.endsWith("Cock") ||
        p.name.endsWith("Finger") ||
        p.name.startsWith("assembly:") ||
        p.name === "calibre")
    ) {
      return p.name;
    }
    p = p.parent;
  }
  return obj.name || "mesh";
}

export function auditSweepClearance(
  sweep: SweepEnvelope,
  movement: Movement,
  structureRoot: THREE.Object3D,
  assemblyRoot: THREE.Object3D | null,
): SweepClearance {
  const roots = [movement.root, structureRoot];
  if (assemblyRoot) roots.push(assemblyRoot);
  const v = new THREE.Vector3();
  let samplesInDisk = 0;
  let maxZ = -Infinity;
  let nearest = "?";
  let nearestXy = { x: sweep.axis.x, y: sweep.axis.y };
  const r2 = sweep.radius * sweep.radius;
  const saved = 0;
  for (const phase of ACC_PHASES) {
    movement.update(phase.t);
    for (const root of roots) {
      root.updateWorldMatrix(true, true);
      root.traverse((obj) => {
        if (!isCalibreAuthorityMesh(obj)) return;
        const pos = obj.geometry.getAttribute("position");
        if (!pos) return;
        obj.updateWorldMatrix(true, false);
        const name = familyName(obj);
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
          const dx = v.x - sweep.axis.x;
          const dy = v.y - sweep.axis.y;
          if (dx * dx + dy * dy > r2) continue;
          samplesInDisk += 1;
          if (v.z > maxZ) {
            maxZ = v.z;
            nearest = name;
            nearestXy = { x: v.x, y: v.y };
          }
        }
      });
    }
  }
  movement.update(saved);
  for (const root of roots) root.updateWorldMatrix(true, true);
  const minClearance = Number.isFinite(maxZ) ? sweep.z0 - maxZ : Infinity;
  return {
    id: sweep.id,
    method: "sampled-frozen-calibre-vertices-in-sweep-disk-all-ACC-phases",
    notExactTriangle: true,
    samplesInDisk,
    nearest,
    nearestXy,
    nearestZ: maxZ,
    minClearance,
  };
}

export function auditChapter(plan: DisplayPlan, acc: AccommodationPlan): {
  cavityClearance: number;
  handSweepClearanceZ: number;
  minCavityToChapterOuter: number;
  minChapterInnerToMinute: number;
} {
  const cavityToOuter = pointToPolygonBoundary({ x: plan.axis.x, y: plan.axis.y }, acc.cavityContour) -
    pointToPolygonBoundary({ x: plan.axis.x, y: plan.axis.y }, plan.chapter.outer);
  return {
    cavityClearance: plan.chapter.cavityClearance,
    handSweepClearanceZ: plan.separations.chapterToHour,
    minCavityToChapterOuter: cavityToOuter,
    minChapterInnerToMinute:
      pointToPolygonBoundary(plan.axis, plan.chapter.inner) - plan.minuteSweep.radius,
  };
}
