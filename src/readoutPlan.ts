import type { Vec2 } from "./spec";
import type { DisplayPlan } from "./displayPlan";
import type { EnclosurePlan } from "./enclosurePlan";
import type { AccommodationPlan } from "./accommodationPlan";
import { minBoundaryDistance, offsetConvexExact } from "./accommodationMath";
import {
  hourRayAngle,
  parseReadoutConcept,
  parseReadoutPose,
  poseRotations,
  READOUT,
  READOUT_CONCEPTS,
  type ReadoutConceptId,
} from "./readoutSpec";

export type MarkerKind = "cardinal12" | "cardinal" | "subordinate";

export type ChapterSupport = {
  id: string;
  source: string;
  angle: number;
  fastenerXy: Vec2;
  rRailInner: number;
  rRailOuter: number;
  rCarrierInner: number;
  rContact: number;
  wallHits: Vec2[];
  halfW: number;
  railZ0: number;
  railZ1: number;
  riserZ0: number;
  riserZ1: number;
  overlap: number;
  gapToCarrier: number;
  sweepClearance: number;
};

export type StationRadial = {
  n: number;
  hour: number;
  markerInnerTipR: number;
  minuteTipR: number;
  radialDifference: number;
};

export type MarkerStation = {
  n: number;
  hour: number;
  angle: number;
  dir: Vec2;
  innerHit: Vec2;
  outerHit: Vec2;
  innerR: number;
  outerR: number;
  kind: MarkerKind;
  r0: number;
  r1: number;
  width: number;
};

export type ReadoutPlan = {
  concept: (typeof READOUT_CONCEPTS)[ReadoutConceptId];
  rejected: { id: ReadoutConceptId; reason: string }[];
  axis: Vec2;
  sourcePivotXy: Vec2;
  axisDrift: number;
  pose: {
    id: string;
    hours: number;
    minutes: number;
    hourZ: number;
    minuteZ: number;
    mode: "temporary-override";
    normalRuntime: "movement-driven";
  };
  frozen: {
    hourSweepR: number;
    minuteSweepR: number;
    hourZ0: number;
    hourZ1: number;
    minuteZ0: number;
    minuteZ1: number;
    chapterZ0: number;
    chapterZ1: number;
    displayMaxZ: number;
    interfaceOuterR: number;
    interfaceZ0: number;
    sapphireInnerZ: number;
    authorizedSapphireClearance: number;
  };
  hourHand: {
    tipR: number;
    tailR: number;
    maxWidth: number;
    thick: number;
    z0: number;
    z1: number;
    rootR: number;
    mountBoreR: number;
  };
  minuteHand: {
    tipR: number;
    tailR: number;
    maxWidth: number;
    thick: number;
    z0: number;
    z1: number;
    rootR: number;
  };
  hub: {
    hourCollarR: number;
    hourCollarInnerR: number;
    minuteCollarR: number;
    capR: number;
    stemR: number;
    hourZ0: number;
    hourZ1: number;
    stemZ0: number;
    stemZ1: number;
    minuteZ0: number;
    minuteZ1: number;
    capZ0: number;
    capZ1: number;
    maxR: number;
  };
  chapter: {
    carrierInner: Vec2[];
    carrierOuter: Vec2[];
    z0: number;
    z1: number;
    markerZ0: number;
    markerZ1: number;
    bandWidth: number;
    support: string;
    supports: ChapterSupport[];
    attachment: {
      angle: number;
      r0: number;
      r1: number;
      halfW: number;
      z0: number;
      z1: number;
    }[];
  };
  markers: MarkerStation[];
  stationRadial: {
    stations: StationRadial[];
    minDifference: number;
    maxDifference: number;
    minStation: number;
    maxStation: number;
  };
  separations: {
    minuteTipToNearestMarker: number;
    hourTipToNearestMarker: number;
    interHandZ: number;
    visibleMaxZ: number;
    sapphireInnerZ: number;
    remainingToSapphire: number;
    authorizedRemaining: number;
    carrierToCavity: number;
    carrierToOuterWall: number;
    supportMinOverlap: number;
    supportMaxGap: number;
    supportMinSweepClearance: number;
  };
  notClaimed: string[];
};

export function raySegmentT(origin: Vec2, dir: Vec2, a: Vec2, b: Vec2): number | null {
  const sx = b.x - a.x;
  const sy = b.y - a.y;
  const den = dir.x * sy - dir.y * sx;
  if (Math.abs(den) < 1e-14) return null;
  const t = ((a.x - origin.x) * sy - (a.y - origin.y) * sx) / den;
  const u = ((a.x - origin.x) * dir.y - (a.y - origin.y) * dir.x) / den;
  if (t <= 1e-12) return null;
  if (u < -1e-12 || u > 1 + 1e-12) return null;
  return t;
}

/** First forward intersection of a ray with a convex polygon boundary. */
export function rayConvexExit(origin: Vec2, angle: number, poly: Vec2[]): Vec2 {
  const dir = { x: Math.cos(angle), y: Math.sin(angle) };
  let best = Infinity;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const t = raySegmentT(origin, dir, poly[i], poly[(i + 1) % n]);
    if (t !== null && t < best) best = t;
  }
  if (!Number.isFinite(best)) {
    throw new Error(`Phase 4A ray missed convex contour at angle ${angle}`);
  }
  return { x: origin.x + dir.x * best, y: origin.y + dir.y * best };
}

export function hypot2(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function markerKind(n: number): MarkerKind {
  if (n === 0) return "cardinal12";
  if (n === 3 || n === 6 || n === 9) return "cardinal";
  return "subordinate";
}

export function createReadoutPlan(
  display: DisplayPlan,
  acc: AccommodationPlan,
  enclosure: EnclosurePlan | null,
  opts?: { concept?: string | null; pose?: string | null },
): ReadoutPlan {
  const conceptId = parseReadoutConcept(opts?.concept);
  const poseIn = parseReadoutPose(opts?.pose);
  const rot = poseRotations(poseIn.hours, poseIn.minutes);
  const axis = { x: display.axis.x, y: display.axis.y };
  const axisDrift = Math.hypot(axis.x - display.sourcePivotXy.x, axis.y - display.sourcePivotXy.y);

  const stations: MarkerStation[] = [];
  for (let n = 0; n < 12; n++) {
    const angle = hourRayAngle(n);
    const dir = { x: Math.cos(angle), y: Math.sin(angle) };
    const innerHit = rayConvexExit(axis, angle, display.chapter.inner);
    const outerHit = rayConvexExit(axis, angle, display.chapter.outer);
    const innerR = hypot2(axis, innerHit);
    const outerR = hypot2(axis, outerHit);
    const kind = markerKind(n);
    const width =
      kind === "cardinal12" ? READOUT.cardinal12Width : kind === "cardinal" ? READOUT.cardinalWidth : READOUT.subWidth;
    const r0 = innerR + READOUT.markerInnerPad;
    let r1 = outerR - READOUT.markerOuterPad;
    if (kind === "cardinal12") r1 = outerR - (READOUT.markerOuterPad - 0.04);
    if (kind === "subordinate") r1 = Math.min(r1, r0 + 0.58);
    if (r1 <= r0) {
      throw new Error(`Phase 4A marker ${n} has no radial span (r0=${r0} r1=${r1})`);
    }
    stations.push({
      n,
      hour: n === 0 ? 12 : n,
      angle,
      dir,
      innerHit,
      outerHit,
      innerR,
      outerR,
      kind,
      r0,
      r1,
      width,
    });
  }

  const nearestMarkerInner = Math.min(...stations.map((s) => s.r0));
  const minuteTipR = Math.min(
    nearestMarkerInner - READOUT.minuteTipClearance,
    display.minuteSweep.radius - READOUT.minuteSweepInset,
  );
  const hourTipR = minuteTipR * READOUT.hourLengthRatio;
  if (minuteTipR <= 0 || hourTipR <= 0) {
    throw new Error(`Phase 4A hand lengths invalid: hour=${hourTipR} minute=${minuteTipR}`);
  }
  if (minuteTipR > display.minuteSweep.radius + 1e-12 || hourTipR > display.hourSweep.radius + 1e-12) {
    throw new Error("Phase 4A hand tip exceeds frozen sweep radius");
  }

  const hourZ0 = display.hourSweep.z0 + READOUT.hourZPad;
  const hourZ1 = hourZ0 + READOUT.hourThick;
  const minuteZ0 = display.minuteSweep.z0 + READOUT.minuteZPad;
  const minuteZ1 = minuteZ0 + READOUT.minuteThick;
  if (hourZ1 > display.hourSweep.z1 + 1e-12 || minuteZ1 > display.minuteSweep.z1 + 1e-12) {
    throw new Error("Phase 4A hand Z leaves frozen sweep envelope");
  }

  const hubHourZ0 = hourZ0 + 0.006;
  const hubHourZ1 = hubHourZ0 + READOUT.hubHourThick;
  const hubMinuteZ0 = minuteZ0 + 0.004;
  const hubMinuteZ1 = hubMinuteZ0 + READOUT.hubMinuteThick;
  const hubCapZ0 = hubMinuteZ1;
  const hubCapZ1 = hubCapZ0 + READOUT.hubCapThick;
  if (hubCapZ1 > display.planes.displayMax + 1e-12) {
    throw new Error(`Phase 4A hub cap ${hubCapZ1} exceeds displayMax ${display.planes.displayMax}`);
  }
  if (READOUT.hubHourR > display.interfaceBase.outerR + 1e-12) {
    throw new Error("Phase 4A hub radius exceeds frozen interface envelope");
  }

  const carrierOuter = offsetConvexExact(display.chapter.outer, -READOUT.carrierOuterInset);
  const carrierInner = offsetConvexExact(display.chapter.outer, -(READOUT.carrierOuterInset + READOUT.carrierBand));
  const chapterZ0 = display.chapter.z0 + 0.03;
  const chapterZ1 = chapterZ0 + READOUT.carrierThick;
  const markerZ0 = display.chapter.z0 + 0.014;
  const markerZ1 = markerZ0 + READOUT.markerThick;
  if (chapterZ1 > display.chapter.z1 + 1e-12 || markerZ1 > display.chapter.z1 + 1e-12) {
    throw new Error("Phase 4A chapter Z leaves frozen chapter reserve");
  }

  const attachment: ReadoutPlan["chapter"]["attachment"] = [];

  const supportSources: { id: string; xy: Vec2; source: string }[] = enclosure
    ? enclosure.closure.fastenerAxes.map((ax) => ({
        id: ax.id.replace("enc:fastener:", "readout:support:"),
        xy: ax.xy,
        source: "enclosure.closure.fastenerAxes → display-axis ray → acc.cavityContour at chapter Z",
      }))
    : [0, 3, 6, 9].map((n) => {
        const angle = hourRayAngle(n);
        const hit = rayConvexExit(axis, angle, acc.cavityContour);
        return {
          id: `readout:support:cardinal${n === 0 ? 12 : n}`,
          xy: hit,
          source: "fallback cardinal ray ∩ acc.cavityContour at chapter Z",
        };
      });

  const supports: ChapterSupport[] = supportSources.map((src) => {
    const angle = Math.atan2(src.xy.y - axis.y, src.xy.x - axis.x);
    const railIn = rayConvexExit(axis, angle, carrierInner);
    const railOut = rayConvexExit(axis, angle, carrierOuter);
    const wall = rayConvexExit(axis, angle, acc.cavityContour);
    const rRailInner = hypot2(axis, railIn);
    const rRailOuter = hypot2(axis, railOut);
    const rWall = hypot2(axis, wall);
    const rContact = rWall;
    const wallHalfA = 0.05 / Math.max(rWall, 0.2);
    const wallHits = [
      rayConvexExit(axis, angle - wallHalfA, acc.cavityContour),
      wall,
      rayConvexExit(axis, angle + wallHalfA, acc.cavityContour),
    ];
    return {
      id: src.id,
      source: src.source,
      angle,
      fastenerXy: src.xy,
      rRailInner,
      rRailOuter,
      rCarrierInner: rWall,
      rContact,
      wallHits,
      halfW: READOUT.supportHalfW,
      railZ0: chapterZ0,
      railZ1: chapterZ1,
      riserZ0: chapterZ0,
      riserZ1: chapterZ1,
      overlap: READOUT.supportOverlap,
      gapToCarrier: Math.max(0, rWall - rContact),
      sweepClearance: rRailOuter - display.minuteSweep.radius,
    };
  });
  if (supports.length < 3) {
    throw new Error(`Phase 4A.1 needs at least 3 chapter supports, got ${supports.length}`);
  }

  const sapphireInnerZ = enclosure ? enclosure.front.inner.z : display.fit.accFrontCloseLo;
  const authorizedRemaining = sapphireInnerZ - display.planes.displayMax;
  const visibleMaxZ = Math.max(hubCapZ1, chapterZ1, markerZ1, ...supports.map((s) => s.riserZ1));
  const remainingToSapphire = sapphireInnerZ - visibleMaxZ;

  const minuteToMarker = nearestMarkerInner - minuteTipR;
  const hourToMarker = nearestMarkerInner - hourTipR;
  const carrierToCavity = minBoundaryDistance(carrierOuter, acc.cavityContour);
  const carrierToOuterWall = minBoundaryDistance(carrierOuter, acc.outerWall);
  const stationRows: StationRadial[] = stations.map((s) => ({
    n: s.n,
    hour: s.hour,
    markerInnerTipR: s.r0,
    minuteTipR,
    radialDifference: s.r0 - minuteTipR,
  }));
  const minDifference = Math.min(...stationRows.map((s) => s.radialDifference));
  const maxDifference = Math.max(...stationRows.map((s) => s.radialDifference));
  const minStation = stationRows.find((s) => s.radialDifference === minDifference)?.hour ?? 0;
  const maxStation = stationRows.find((s) => s.radialDifference === maxDifference)?.hour ?? 0;
  const supportMinOverlap = Math.min(...supports.map((s) => s.overlap));
  const supportMaxGap = Math.max(...supports.map((s) => s.gapToCarrier));
  const supportMinSweepClearance = Math.min(...supports.map((s) => s.sweepClearance));

  return {
    concept: READOUT_CONCEPTS[conceptId],
    rejected: (Object.keys(READOUT_CONCEPTS) as ReadoutConceptId[])
      .filter((id) => id !== conceptId)
      .map((id) => ({ id, reason: READOUT_CONCEPTS[id].rejectReason ?? "not selected" })),
    axis,
    sourcePivotXy: { x: display.sourcePivotXy.x, y: display.sourcePivotXy.y },
    axisDrift,
    pose: {
      id: poseIn.id,
      hours: poseIn.hours,
      minutes: poseIn.minutes,
      hourZ: rot.hourZ,
      minuteZ: rot.minuteZ,
      mode: "temporary-override",
      normalRuntime: "movement-driven",
    },
    frozen: {
      hourSweepR: display.hourSweep.radius,
      minuteSweepR: display.minuteSweep.radius,
      hourZ0: display.hourSweep.z0,
      hourZ1: display.hourSweep.z1,
      minuteZ0: display.minuteSweep.z0,
      minuteZ1: display.minuteSweep.z1,
      chapterZ0: display.chapter.z0,
      chapterZ1: display.chapter.z1,
      displayMaxZ: display.planes.displayMax,
      interfaceOuterR: display.interfaceBase.outerR,
      interfaceZ0: display.interfaceBase.z0,
      sapphireInnerZ,
      authorizedSapphireClearance: authorizedRemaining,
    },
    hourHand: {
      tipR: hourTipR,
      tailR: READOUT.hourTail,
      maxWidth: READOUT.hourMaxWidth,
      thick: READOUT.hourThick,
      z0: hourZ0,
      z1: hourZ1,
      rootR: READOUT.hubHourR + 0.02,
      mountBoreR: READOUT.hubHourInnerR,
    },
    minuteHand: {
      tipR: minuteTipR,
      tailR: READOUT.minuteTail,
      maxWidth: READOUT.minuteMaxWidth,
      thick: READOUT.minuteThick,
      z0: minuteZ0,
      z1: minuteZ1,
      rootR: READOUT.hubMinuteR + 0.02,
    },
    hub: {
      hourCollarR: READOUT.hubHourR,
      hourCollarInnerR: READOUT.hubHourInnerR,
      minuteCollarR: READOUT.hubMinuteR,
      capR: READOUT.hubCapR,
      stemR: READOUT.hubStemR,
      hourZ0: hubHourZ0,
      hourZ1: hubHourZ1,
      stemZ0: hubHourZ1,
      stemZ1: hubMinuteZ0,
      minuteZ0: hubMinuteZ0,
      minuteZ1: hubMinuteZ1,
      capZ0: hubCapZ0,
      capZ1: hubCapZ1,
      maxR: READOUT.hubHourR,
    },
    chapter: {
      carrierInner,
      carrierOuter,
      z0: chapterZ0,
      z1: chapterZ1,
      markerZ0,
      markerZ1,
      bandWidth: READOUT.carrierBand,
      support:
        "thin cushion chapter rail + short radial feet on frozen 3C fastener-axis rays, landing on the midcase cavity inner wall at chapter Z",
      supports,
      attachment,
    },
    markers: stations,
    stationRadial: {
      stations: stationRows,
      minDifference,
      maxDifference,
      minStation,
      maxStation,
    },
    separations: {
      minuteTipToNearestMarker: minuteToMarker,
      hourTipToNearestMarker: hourToMarker,
      interHandZ: minuteZ0 - hourZ1,
      visibleMaxZ,
      sapphireInnerZ,
      remainingToSapphire,
      authorizedRemaining,
      carrierToCavity,
      carrierToOuterWall,
      supportMinOverlap,
      supportMaxGap,
      supportMinSweepClearance,
    },
    notClaimed: [
      "seconds display",
      "hand-setting mechanism",
      "setting clutch / slip-torque validation",
      "winding",
      "keyless works",
      "typography / branding",
      "final lume",
      "final display micro-finish",
      "strap / bracelet",
    ],
  };
}
