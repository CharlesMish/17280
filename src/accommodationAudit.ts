/**
 * Phase 3A.1 numerical packaging audit.
 * Polygon-boundary distances and finite-cylinder sampled evidence.
 */
import * as THREE from "three";
import type { Vec2 } from "./spec";
import { ACC } from "./accommodationSpec";
import type { AccommodationPlan } from "./accommodationPlan";
import {
  ACC_EPS,
  containsConvex,
  minBoundaryDistance,
  verticesOutside,
} from "./accommodationMath";

export function auditPackaging(plan: AccommodationPlan): {
  requestedRadialClearance: number;
  achievedRadialClearance: number;
  radialMethod: string;
  radialContains: boolean;
  requestedWall: number;
  achievedWall: number;
  wallMethod: string;
  wallContains: boolean;
  epsilon: number;
  radialAccepted: boolean;
  wallAccepted: boolean;
} {
  const achievedRadial = minBoundaryDistance(plan.sampledSweptContour, plan.cavityContour);
  const achievedWall = minBoundaryDistance(plan.cavityContour, plan.outerWall);
  const radialContains = containsConvex(plan.requiredClearanceContour, plan.cavityContour);
  const wallContains = containsConvex(plan.cavityContour, plan.outerWall);
  return {
    requestedRadialClearance: ACC.radialClearance,
    achievedRadialClearance: achievedRadial,
    radialMethod: "min vertex-to-segment distance between sampledSweptContour and cavityContour boundaries",
    radialContains,
    requestedWall: ACC.wall,
    achievedWall,
    wallMethod: "min vertex-to-segment distance between cavityContour and outerWall (unperforated baseline shell)",
    wallContains,
    epsilon: ACC_EPS,
    radialAccepted: radialContains && achievedRadial >= ACC.radialClearance - ACC_EPS,
    wallAccepted: wallContains && achievedWall >= ACC.wall - ACC_EPS,
  };
}

export type CorridorAudit = {
  boundaryHit: Vec2;
  terminalRelationship: "reaches-projected-sampled-movement-boundary-by-construction";
  projectedAuthorityOnly: true;
  noKeylessWorks: true;
  noPhysicalContactClaim: true;
  radius: number;
  exteriorTerminal: { point: { x: number; y: number; z: number }; normal: { x: number; y: number; z: number } };
  movementTerminal: { point: { x: number; y: number; z: number }; normal: { x: number; y: number; z: number } };
  samples: number;
  nearest: string;
  minSideBodyClearance: number;
  intrusionCount: number;
  intrusion: boolean;
  sampleKind: "every-included-frozen-calibre-mesh-vertex-at-each-sampled-phase";
  notExactMeshCollision: true;
  surroundingBelow: number;
  surroundingAbove: number;
  crownTubeWall: "provisional-unimplemented";
  openingNote: string;
};

export function auditFiniteCorridor(
  plan: AccommodationPlan,
  collect: (visitor: (mesh: THREE.Mesh, name: string) => void) => void,
): CorridorAudit {
  const cor = plan.corridor;
  const x0 = cor.origin.x;
  const x1 = cor.endAt.x;
  const y0 = cor.origin.y;
  const z0 = cor.z;
  const r = cor.radius;
  const axisLen = x0 - x1;
  const v = new THREE.Vector3();
  let samples = 0;
  let nearest = "?";
  let minSide = Infinity;
  let intrusionCount = 0;

  collect((mesh, name) => {
    const pos = mesh.geometry.getAttribute("position");
    if (!pos) return;
    mesh.updateWorldMatrix(true, false);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      samples += 1;
      const s = x0 - v.x;
      if (s <= 0 || s >= axisLen) continue;
      const radial = Math.hypot(v.y - y0, v.z - z0);
      const side = radial - r;
      if (side < minSide) {
        minSide = side;
        nearest = name;
      }
      if (radial < r - ACC_EPS) intrusionCount += 1;
    }
  });

  if (!Number.isFinite(minSide)) minSide = Infinity;

  return {
    boundaryHit: { ...cor.boundaryHit },
    terminalRelationship: "reaches-projected-sampled-movement-boundary-by-construction",
    projectedAuthorityOnly: true,
    noKeylessWorks: true,
    noPhysicalContactClaim: true,
    radius: r,
    exteriorTerminal: {
      point: { x: x0, y: y0, z: z0 },
      normal: { x: 1, y: 0, z: 0 },
    },
    movementTerminal: {
      point: { x: x1, y: cor.endAt.y, z: z0 },
      normal: { x: -1, y: 0, z: 0 },
    },
    samples,
    nearest,
    minSideBodyClearance: minSide,
    intrusionCount,
    intrusion: intrusionCount > 0,
    sampleKind: "every-included-frozen-calibre-mesh-vertex-at-each-sampled-phase",
    notExactMeshCollision: true,
    surroundingBelow: cor.window.zLo - plan.z.midcaseBottom,
    surroundingAbove: plan.z.midcaseTop - cor.window.zHi,
    crownTubeWall: "provisional-unimplemented",
    openingNote:
      "Intentional +X window is excluded from baseline wall audit. Residual crown-tube wall thickness is not a 3A.1 authority claim.",
  };
}

export function sweepContainment(points: Vec2[], hull: Vec2[]): { outside: number; total: number } {
  return { outside: verticesOutside(points, hull), total: points.length };
}
