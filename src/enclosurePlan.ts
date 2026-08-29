import type { Vec2 } from "./spec";
import { ACC } from "./accommodationSpec";
import type { AccommodationPlan } from "./accommodationPlan";
import type { DisplayPlan } from "./displayPlan";
import {
  closestOnPolyline,
  isCcw,
  minBoundaryDistance,
  offsetConvexExact,
  outwardNormal,
  pointInConvex,
} from "./accommodationMath";
import { ENC } from "./enclosureSpec";

export type CrystalSurface = {
  type: "planar-z";
  z: number;
  facing: "+Z" | "-Z";
};

export type EnclosurePlan = {
  front: {
    footprint: Vec2[];
    opening: Vec2[];
    inner: CrystalSurface;
    outerEnvelopeZ: number;
    minThick: number;
    maxThick: number;
    provisionalCap: number;
    seatZ: number;
    supportWidth: number;
    gasket: number;
    gasketWidth: number;
    gasketOuter: Vec2[];
    gasketInner: Vec2[];
    carrierOuter: Vec2[];
    carrierInner: Vec2[];
    registerZ0: number;
    carrierTopZ: number;
    closureRange: [number, number];
    minRequiredClearance: number;
    packageLimitZ: number;
  };
  rear: {
    exhibition: Vec2[];
    footprint: Vec2[];
    inner: CrystalSurface;
    outerEnvelopeZ: number;
    minThick: number;
    maxThick: number;
    provisionalCap: number;
    seatZ: number;
    supportWidth: number;
    gasket: number;
    gasketWidth: number;
    gasketOuter: Vec2[];
    gasketInner: Vec2[];
    carrierOuter: Vec2[];
    carrierInner: Vec2[];
    carrierBottomZ: number;
    holderShoulderZ: number;
    holderShoulderInner: Vec2[];
    holderShoulderOuter: Vec2[];
    minRequiredClearance: number;
    packageLimitZ: number;
  };
  closure: {
    frontRegister: "radial-cavity-wall + axial-shoulder-at-frontCloseLo";
    rearRegister: "radial-cavity-wall + axial-shoulder-at-rearClose";
    rearHolderLock: "carrier-shoulder-under-frozen-holder-ring";
    attachment: "fastener-axis-reserve";
    fastenerAxes: FastenerAxis[];
    crystalsRetainMovement: false;
    newMovementContacts: false;
  };
  crown: {
    preserved: true;
    noCrownStemKeyless: true;
    corridor: AccommodationPlan["corridor"];
  };
  gate: {
    frontFits: boolean;
    rearFits: boolean;
    frontInnerInRange: boolean;
    frontOuterInPackage: boolean;
    rearOuterInPackage: boolean;
    notes: string[];
  };
};

export type FastenerAxis = {
  id: string;
  xy: Vec2;
  z0: number;
  z1: number;
  normal: Vec2;
  inset: number;
  segment: { a: Vec2; b: Vec2; t: number; index: number };
};

function polarHints(): { id: string; hint: Vec2 }[] {
  return [
    { id: "enc:fastener:north", hint: { x: 0, y: 12 } },
    { id: "enc:fastener:south", hint: { x: 0, y: -12 } },
    { id: "enc:fastener:west", hint: { x: -12, y: 2 } },
    { id: "enc:fastener:northeast", hint: { x: 6, y: 10 } },
  ];
}

function corridorClearance2d(xy: Vec2, acc: AccommodationPlan): number {
  const a = acc.corridor.origin;
  const b = acc.corridor.endAt;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 < 1e-18 ? 0 : Math.max(0, Math.min(1, ((xy.x - a.x) * dx + (xy.y - a.y) * dy) / len2));
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return Math.hypot(xy.x - px, xy.y - py) - acc.corridor.radius;
}

function placeFasteners(cavity: Vec2[], acc: AccommodationPlan): FastenerAxis[] {
  const ccw = isCcw(cavity);
  const wall = minBoundaryDistance(cavity, acc.outerWall);
  const inset = Math.min(
    Math.max(ENC.fastenerReserveR + 0.18, wall * 0.42),
    wall - ENC.fastenerReserveR - 0.18,
  );
  const out: FastenerAxis[] = [];
  for (const h of polarHints()) {
    const hit = closestOnPolyline(cavity, h.hint);
    const n = outwardNormal(hit.a, hit.b, ccw);
    const xy = { x: hit.point.x + n.x * inset, y: hit.point.y + n.y * inset };
    const ang = Math.atan2(xy.y, xy.x);
    if (Math.abs(ang) < ACC.crownHalfAngle) continue;
    if (corridorClearance2d(xy, acc) < ENC.fastenerReserveR + 0.35) continue;
    out.push({
      id: h.id,
      xy,
      z0: acc.z.midcaseBottom + 0.2,
      z1: acc.z.midcaseTop - 0.2,
      normal: n,
      inset,
      segment: { a: hit.a, b: hit.b, t: hit.t, index: hit.index },
    });
  }
  return out;
}

export function createEnclosurePlan(acc: AccommodationPlan, display: DisplayPlan): EnclosurePlan {
  const cavity = acc.cavityContour;
  const swept = acc.sampledSweptContour;

  const frontCarrierOuter = offsetConvexExact(cavity, -0.03);
  const frontOpening = offsetConvexExact(cavity, -ENC.frontSeatWidth);
  const frontFootprint = offsetConvexExact(cavity, -(ENC.frontSeatWidth - ENC.frontSeatInset));
  const frontInnerZ = acc.z.frontCloseLo;
  const frontOuterEnv = frontInnerZ + ENC.frontSapphireMaxThick;
  const frontRegisterZ0 = frontInnerZ - ENC.frontRegisterDepth;
  const frontCarrierTop = frontInnerZ + ENC.frontCarrierAboveSeat;

  const rearExhibition = offsetConvexExact(swept, -ENC.rearExhibitionInset);
  const rearFootprint = offsetConvexExact(swept, -(ENC.rearExhibitionInset - 0.08));
  const rearInnerZ = acc.z.rearClose;
  const rearOuterEnv = rearInnerZ - ENC.rearSapphireMaxThick;
  const rearCarrierBottom = acc.z.midcaseBottom;

  const notes: string[] = [];
  const frontClear = frontInnerZ - display.envelope.maxZ;
  const frontInnerInRange = frontInnerZ >= acc.z.frontCloseLo - 1e-9 && frontInnerZ <= acc.z.frontCloseHi + 1e-9;
  const frontOuterInPackage = frontOuterEnv <= acc.z.midcaseTop + 1e-9;
  const rearOuterInPackage = rearOuterEnv >= acc.z.midcaseBottom - 1e-9;
  const frontFits = frontClear + 1e-9 >= ENC.minFrontClearance && frontInnerInRange && frontOuterInPackage;
  const rearFits =
    acc.z.moveMin - rearInnerZ + 1e-9 >= ENC.minRearClearance &&
    rearOuterInPackage &&
    rearInnerZ - rearCarrierBottom + 1e-9 >= ENC.rearSapphireMinThick + ENC.rearGasket + ENC.minResidualSeat;

  if (!frontFits) {
    throw new Error(
      `Phase 3C front enclosure cannot fit in frozen 3A package (clear=${frontClear}, inner=${frontInnerZ}, env=${frontOuterEnv}, midTop=${acc.z.midcaseTop})`,
    );
  }
  if (!rearFits) {
    throw new Error(
      `Phase 3C rear enclosure cannot fit in frozen 3A rear reserve (inner=${rearInnerZ}, env=${rearOuterEnv}, midBot=${acc.z.midcaseBottom})`,
    );
  }
  notes.push("Front inner plane consumes acc.z.frontCloseLo; outer envelope stays at or below acc.z.midcaseTop.");
  notes.push("Rear inner plane consumes acc.z.rearClose; outer envelope stays at or above acc.z.midcaseBottom.");
  notes.push("No Phase-3A package growth. FrontStruct/rearStruct reserved bands become functional geometry.");

  const fastenerAxes = placeFasteners(cavity, acc);

  return {
    front: {
      footprint: frontFootprint,
      opening: frontOpening,
      inner: { type: "planar-z", z: frontInnerZ, facing: "-Z" },
      outerEnvelopeZ: frontOuterEnv,
      minThick: ENC.frontSapphireMinThick,
      maxThick: ENC.frontSapphireMaxThick,
      provisionalCap: ENC.frontProvisionalCap,
      seatZ: frontInnerZ,
      supportWidth: ENC.frontSeatWidth,
      gasket: ENC.frontGasket,
      gasketWidth: ENC.frontGasketWidth,
      gasketOuter: frontFootprint,
      gasketInner: frontOpening,
      carrierOuter: frontCarrierOuter,
      carrierInner: frontOpening,
      registerZ0: frontRegisterZ0,
      carrierTopZ: frontCarrierTop,
      closureRange: [acc.z.frontCloseLo, acc.z.frontCloseHi],
      minRequiredClearance: ENC.minFrontClearance,
      packageLimitZ: acc.z.midcaseTop,
    },
    rear: {
      exhibition: rearExhibition,
      footprint: rearFootprint,
      inner: { type: "planar-z", z: rearInnerZ, facing: "+Z" },
      outerEnvelopeZ: rearOuterEnv,
      minThick: ENC.rearSapphireMinThick,
      maxThick: ENC.rearSapphireMaxThick,
      provisionalCap: ENC.rearProvisionalCap,
      seatZ: rearInnerZ,
      supportWidth: ENC.rearSeatWidth,
      gasket: ENC.rearGasket,
      gasketWidth: ENC.rearGasketWidth,
      gasketOuter: rearFootprint,
      gasketInner: rearExhibition,
      carrierOuter: offsetConvexExact(cavity, -0.03),
      carrierInner: rearExhibition,
      carrierBottomZ: rearCarrierBottom,
      holderShoulderZ: acc.z.rearClose,
      holderShoulderInner: swept,
      holderShoulderOuter: cavity,
      minRequiredClearance: ENC.minRearClearance,
      packageLimitZ: acc.z.midcaseBottom,
    },
    closure: {
      frontRegister: "radial-cavity-wall + axial-shoulder-at-frontCloseLo",
      rearRegister: "radial-cavity-wall + axial-shoulder-at-rearClose",
      rearHolderLock: "carrier-shoulder-under-frozen-holder-ring",
      attachment: "fastener-axis-reserve",
      fastenerAxes,
      crystalsRetainMovement: false,
      newMovementContacts: false,
    },
    crown: {
      preserved: true,
      noCrownStemKeyless: true,
      corridor: acc.corridor,
    },
    gate: {
      frontFits,
      rearFits,
      frontInnerInRange,
      frontOuterInPackage,
      rearOuterInPackage,
      notes,
    },
  };
}

export function inFrontFootprint(plan: EnclosurePlan, xy: Vec2): boolean {
  return pointInConvex(xy, plan.front.footprint);
}

export function inRearFootprint(plan: EnclosurePlan, xy: Vec2): boolean {
  return pointInConvex(xy, plan.rear.footprint);
}

export { corridorClearance2d };

export function displayObstacleZ(display: DisplayPlan, xy: Vec2): { z: number; source: string } {
  const ax = display.axis.x;
  const ay = display.axis.y;
  const d2 = (xy.x - ax) ** 2 + (xy.y - ay) ** 2;
  let z = -Infinity;
  let source = "none";
  const consider = (id: string, zz: number): void => {
    if (zz >= z) {
      z = zz;
      source = id;
    }
  };
  if (d2 <= display.minuteSweep.radius ** 2) consider("display:minuteSweep", display.minuteSweep.z1);
  if (d2 <= display.hourSweep.radius ** 2) consider("display:hourSweep", display.hourSweep.z1);
  if (pointInConvex(xy, display.chapter.outer) && !pointInConvex(xy, display.chapter.inner)) {
    consider("display:chapter", display.chapter.z1);
  }
  const pipeR = Math.max(display.interfaceBase.outerR, ...display.pipes.map((p) => p.outerR));
  if (d2 <= pipeR * pipeR) {
    consider("display:interface/pipes", Math.max(display.interfaceBase.z1, ...display.pipes.map((p) => p.z1)));
  }
  return { z, source };
}
