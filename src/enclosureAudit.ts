import * as THREE from "three";
import type { Movement } from "./movement";
import type { DisplayPlan } from "./displayPlan";
import type { AccommodationPlan } from "./accommodationPlan";
import { isCalibreAuthorityMesh } from "./accommodationPlan";
import { ACC_PHASES } from "./accommodationSpec";
import { ACC_EPS, containsConvex, minBoundaryDistance, pointInConvex, pointToPolygonBoundary } from "./accommodationMath";
import {
  corridorClearance2d,
  displayObstacleZ,
  inFrontFootprint,
  inRearFootprint,
  type EnclosurePlan,
} from "./enclosurePlan";
import { ENC } from "./enclosureSpec";
import { ACC } from "./accommodationSpec";

export type FrontClearance = {
  method: "planar-inner-minus-local-authority-obstacle";
  innerType: "planar-z";
  innerZ: number;
  required: number;
  achieved: number;
  xy: { x: number; y: number };
  limiting: string;
  gridSamples: number;
  calibreSamples: number;
  accepted: boolean;
};

export type RearClearance = {
  method: "planar-inner-to-sampled-frozen-vertices-in-exhibition";
  innerType: "planar-z";
  innerZ: number;
  required: number;
  achieved: number;
  xy: { x: number; y: number };
  limiting: string;
  samples: number;
  accepted: boolean;
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
        p.name.startsWith("assembly:") ||
        p.name === "calibre")
    ) {
      return p.name;
    }
    p = p.parent;
  }
  return obj.name || "mesh";
}

function bounds(poly: { x: number; y: number }[]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, maxX, minY, maxY };
}

export function auditFrontClearance(enc: EnclosurePlan, display: DisplayPlan, acc: AccommodationPlan): FrontClearance {
  const b = bounds(enc.front.footprint);
  const nx = 36;
  const ny = 36;
  let minClear = Infinity;
  let xy = { x: display.axis.x, y: display.axis.y };
  let limiting = "display:minuteSweep";
  let gridSamples = 0;
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= ny; j++) {
      const p = {
        x: b.minX + ((b.maxX - b.minX) * i) / nx,
        y: b.minY + ((b.maxY - b.minY) * j) / ny,
      };
      if (!inFrontFootprint(enc, p)) continue;
      gridSamples += 1;
      const obs = displayObstacleZ(display, p);
      const z = Number.isFinite(obs.z) ? obs.z : acc.sweptBox.maxZ;
      const src = Number.isFinite(obs.z) ? obs.source : acc.sweptBox.limit.maxZ;
      const clear = enc.front.inner.z - z;
      if (clear < minClear) {
        minClear = clear;
        xy = p;
        limiting = src;
      }
    }
  }
  return {
    method: "planar-inner-minus-local-authority-obstacle",
    innerType: "planar-z",
    innerZ: enc.front.inner.z,
    required: enc.front.minRequiredClearance,
    achieved: minClear,
    xy,
    limiting,
    gridSamples,
    calibreSamples: 0,
    accepted: minClear + ACC_EPS >= enc.front.minRequiredClearance,
  };
}

export function auditRearClearance(
  enc: EnclosurePlan,
  movement: Movement,
  structureRoot: THREE.Object3D,
  assemblyRoot: THREE.Object3D | null,
): RearClearance {
  const roots = [movement.root, structureRoot];
  if (assemblyRoot) roots.push(assemblyRoot);
  const v = new THREE.Vector3();
  let minObs = Infinity;
  let xy = { x: 0, y: 0 };
  let limiting = "?";
  let samples = 0;
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
          if (!inRearFootprint(enc, { x: v.x, y: v.y })) continue;
          samples += 1;
          if (v.z < minObs) {
            minObs = v.z;
            xy = { x: v.x, y: v.y };
            limiting = name;
          }
        }
      });
    }
  }
  movement.update(saved);
  for (const r of roots) r.updateWorldMatrix(true, true);
  const achieved = Number.isFinite(minObs) ? minObs - enc.rear.inner.z : Infinity;
  return {
    method: "planar-inner-to-sampled-frozen-vertices-in-exhibition",
    innerType: "planar-z",
    innerZ: enc.rear.inner.z,
    required: enc.rear.minRequiredClearance,
    achieved,
    xy,
    limiting,
    samples,
    accepted: achieved + ACC_EPS >= enc.rear.minRequiredClearance,
  };
}

export function auditCrownPassThrough(enc: EnclosurePlan, acc: AccommodationPlan): {
  preserved: boolean;
  method: "enclosure-z-bands-disjoint-from-frozen-corridor-window";
  frontBand: [number, number];
  rearBand: [number, number];
  corridorWindow: [number, number];
  overlapsCorridor: boolean;
  noCrownStemKeyless: true;
} {
  const w = acc.corridor.window;
  const frontLo = enc.front.registerZ0;
  const frontHi = Math.max(enc.front.carrierTopZ, enc.front.inner.z + enc.front.minThick + enc.front.provisionalCap);
  const rearLo = enc.rear.outerEnvelopeZ;
  const rearHi = enc.rear.holderShoulderZ;
  const overlaps = !(frontHi < w.zLo || frontLo > w.zHi) || !(rearHi < w.zLo || rearLo > w.zHi);
  return {
    preserved: !overlaps,
    method: "enclosure-z-bands-disjoint-from-frozen-corridor-window",
    frontBand: [frontLo, frontHi],
    rearBand: [rearLo, rearHi],
    corridorWindow: [w.zLo, w.zHi],
    overlapsCorridor: overlaps,
    noCrownStemKeyless: true,
  };
}

function measureSeat(gasketOuter: { x: number; y: number }[], gasketInner: { x: number; y: number }[], carrierOuter: { x: number; y: number }[], carrierInner: { x: number; y: number }[]) {
  const actualCarrierWidth = minBoundaryDistance(carrierInner, carrierOuter);
  const actualGasketWidth = minBoundaryDistance(gasketInner, gasketOuter);
  const inboardLand = minBoundaryDistance(gasketInner, carrierInner);
  const outboardLand = minBoundaryDistance(gasketOuter, carrierOuter);
  const supported =
    containsConvex(gasketOuter, carrierOuter) && containsConvex(carrierInner, gasketInner);
  return {
    method: "min vertex-to-segment distance between built gasket/carrier contours",
    actualCarrierWidth,
    actualGasketWidth,
    inboardLand,
    outboardLand,
    residualAfterGasket: actualCarrierWidth - actualGasketWidth,
    gasketFullySupported: supported && inboardLand >= -ACC_EPS,
  };
}

export function auditResidual(enc: EnclosurePlan): {
  method: string;
  baselineWall: number;
  front: ReturnType<typeof measureSeat>;
  rear: ReturnType<typeof measureSeat>;
  frontSeatResidual: number;
  rearSeatResidual: number;
  rearRingThickness: number;
  rearUnderCrystal: number;
  distinction: string;
} {
  const front = measureSeat(enc.front.gasketOuter, enc.front.gasketInner, enc.front.carrierOuter, enc.front.carrierInner);
  const rear = measureSeat(enc.rear.gasketOuter, enc.rear.gasketInner, enc.rear.carrierOuter, enc.rear.carrierInner);
  return {
    method: "measured from EnclosurePlan gasket/carrier polygons, not supportWidth-gasketWidth",
    baselineWall: ACC.wall,
    front,
    rear,
    frontSeatResidual: front.residualAfterGasket,
    rearSeatResidual: rear.residualAfterGasket,
    rearRingThickness: enc.rear.holderShoulderZ - enc.rear.carrierBottomZ,
    rearUnderCrystal: enc.rear.inner.z - ENC.rearSapphireMinThick - enc.rear.carrierBottomZ,
    distinction:
      "baselineWall is frozen 3A unperforated shell. Seat residuals are measured contour distances after the gasket band. Crown opening is excluded.",
  };
}

export function auditFasteners(enc: EnclosurePlan, acc: AccommodationPlan): {
  method: string;
  count: number;
  crownSectorExcluded: true;
  axes: {
    id: string;
    xy: { x: number; y: number };
    normal: { x: number; y: number };
    inset: number;
    marginToCavity: number;
    marginToOuterWall: number;
    marginToFrontCarrierInner: number;
    clearanceToCrownCorridor: number;
    minMaterialMargin: number;
    approachesCrown: boolean;
  }[];
  minMaterialMargin: number;
  minCrownClearance: number;
  anyApproachesCrown: boolean;
} {
  const r = ENC.fastenerReserveR;
  const axes = enc.closure.fastenerAxes.map((a) => {
    const marginToCavity = pointToPolygonBoundary(a.xy, acc.cavityContour) - r;
    const marginToOuterWall = pointToPolygonBoundary(a.xy, acc.outerWall) - r;
    const marginToFrontCarrierInner = pointToPolygonBoundary(a.xy, enc.front.carrierInner) - r;
    const clearanceToCrownCorridor = corridorClearance2d(a.xy, acc);
    const approachesCrown =
      Math.abs(Math.atan2(a.xy.y, a.xy.x)) < ACC.crownHalfAngle ||
      clearanceToCrownCorridor < r + 0.35;
    const minMaterialMargin = Math.min(marginToCavity, marginToOuterWall, marginToFrontCarrierInner);
    return {
      id: a.id,
      xy: a.xy,
      normal: a.normal,
      inset: a.inset,
      marginToCavity,
      marginToOuterWall,
      marginToFrontCarrierInner,
      clearanceToCrownCorridor,
      minMaterialMargin,
      approachesCrown,
    };
  });
  return {
    method: "closest cavity-segment point + local outward normal into midcase wall; margins are point-to-contour minus reserve radius",
    count: axes.length,
    crownSectorExcluded: true,
    axes,
    minMaterialMargin: Math.min(...axes.map((a) => a.minMaterialMargin)),
    minCrownClearance: Math.min(...axes.map((a) => a.clearanceToCrownCorridor)),
    anyApproachesCrown: axes.some((a) => a.approachesCrown),
  };
}

export function pointInExhibition(enc: EnclosurePlan, xy: { x: number; y: number }): boolean {
  return pointInConvex(xy, enc.rear.exhibition);
}
