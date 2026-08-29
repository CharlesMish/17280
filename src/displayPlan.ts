import type { Layout, Vec2 } from "./spec";
import { STRUCT } from "./structureSpec";
import { ASM, type AssemblyPlan } from "./assemblySpec";
import type { AccommodationPlan } from "./accommodationPlan";
import { offsetConvexExact, pointToPolygonBoundary } from "./accommodationMath";
import { DISP, DISP_SECONDS } from "./displaySpec";

export type PipeReserve = {
  id: string;
  role: string;
  innerR: number;
  outerR: number;
  z0: number;
  z1: number;
};

export type SweepEnvelope = {
  id: string;
  axis: Vec2;
  radius: number;
  z0: number;
  z1: number;
  mountZ: number;
};

export type DisplayPlan = {
  topology: {
    centralAxisSource: "layout.positions.center";
    sourcePivotId: "center";
    seconds: typeof DISP_SECONDS;
    secondsReason: string;
    notClaimed: string[];
  };
  axis: Vec2;
  sourcePivotXy: Vec2;
  axisDrift: number;
  jewelTopZ: number;
  jewelTopSource: string;
  planes: {
    interfaceBase: number;
    chapterReference: number;
    chapterTop: number;
    hourMount: number;
    minuteMount: number;
    displayMax: number;
  };
  interfaceBase: { innerR: number; outerR: number; z0: number; z1: number };
  pipes: PipeReserve[];
  hourSweep: SweepEnvelope;
  minuteSweep: SweepEnvelope;
  chapter: {
    inner: Vec2[];
    outer: Vec2[];
    z0: number;
    z1: number;
    cavityClearance: number;
    bandWidth: number;
  };
  envelope: {
    minZ: number;
    maxZ: number;
    limiting: string;
    xyInnerR: number;
    xyOuterR: number;
  };
  separations: {
    chapterToHour: number;
    hourToMinute: number;
    hourVsMinuteZ: number;
  };
  fit: {
    accFrontClear: number;
    accDialTop: number;
    accFrontCloseLo: number;
    accFrontCloseHi: number;
    displayMinZ: number;
    displayMaxZ: number;
    remainingToDialTop: number;
    remainingToFrontCloseLo: number;
    fits: boolean;
  };
};

function centerJewelTop(assembly: AssemblyPlan | null): { z: number; source: string } {
  if (assembly) {
    const b = assembly.bearings.find((row) => row.pivot === "center" && row.side === "upper");
    if (b) {
      return { z: b.jewelMidZ + b.jewelThick * 0.5, source: "assembly:bearing:center:upper jewel top" };
    }
  }
  const bridgeTop = STRUCT.trainBridgeBottom + STRUCT.trainBridgeThick;
  return {
    z: bridgeTop - ASM.seatJoinOverlap + ASM.jewelThick,
    source: "STRUCT.trainBridgeTop + ASM.jewelThick (assembly absent)",
  };
}

export function createDisplayPlan(
  layout: Layout,
  acc: AccommodationPlan,
  assembly: AssemblyPlan | null,
): DisplayPlan {
  const sourcePivotXy = { x: layout.positions.center.x, y: layout.positions.center.y };
  const axis = { x: sourcePivotXy.x, y: sourcePivotXy.y };
  const axisDrift = Math.hypot(axis.x - sourcePivotXy.x, axis.y - sourcePivotXy.y);

  const jewel = centerJewelTop(assembly);
  const interfaceZ0 = jewel.z + DISP.jewelToInterface;
  const interfaceZ1 = interfaceZ0 + DISP.interfaceBaseThick;

  const minuteInner = DISP.minutePipeInner;
  const minuteOuter = DISP.minutePipeOuter;
  const hourInner = minuteOuter + DISP.pipeRadialGap;
  const hourOuter = hourInner + DISP.hourPipeWall;

  const chapterZ0 = acc.z.frontClear + DISP.chapterAboveFrontClear;
  const chapterZ1 = chapterZ0 + DISP.chapterThick;
  const hourMount = chapterZ1 + DISP.chapterToHourGap;
  const hourSweepZ1 = hourMount + DISP.hourSweepThick;
  const minuteMount = hourSweepZ1 + DISP.hourToMinuteGap;
  const minuteSweepZ1 = minuteMount + DISP.minuteSweepThick;

  const chapterOuter = offsetConvexExact(acc.cavityContour, -DISP.chapterCavityClearance);
  const chapterInner = offsetConvexExact(acc.cavityContour, -(DISP.chapterCavityClearance + DISP.chapterBand));
  const rToChapterInner = pointToPolygonBoundary(axis, chapterInner);
  const minuteR = rToChapterInner - DISP.sweepTipClearance;
  const hourR = minuteR * DISP.hourReachFactor;
  if (hourR <= 0 || minuteR + 1e-12 < hourR) {
    throw new Error(`Phase 3B sweep radii invalid: hour=${hourR} minute=${minuteR}`);
  }

  const envelopeMin = interfaceZ0;
  const envelopeMax = minuteSweepZ1;
  const remainingToDialTop = acc.z.dialTop - envelopeMax;
  const remainingToFrontCloseLo = acc.z.frontCloseLo - envelopeMax;
  if (envelopeMax > acc.z.dialTop + 1e-9) {
    throw new Error(
      `Phase 3B display envelope maxZ ${envelopeMax} exceeds frozen 3A dialTop ${acc.z.dialTop}`,
    );
  }

  const hourSweep: SweepEnvelope = {
    id: "sweep:hour",
    axis,
    radius: hourR,
    z0: hourMount,
    z1: hourSweepZ1,
    mountZ: hourMount,
  };
  const minuteSweep: SweepEnvelope = {
    id: "sweep:minute",
    axis,
    radius: minuteR,
    z0: minuteMount,
    z1: minuteSweepZ1,
    mountZ: minuteMount,
  };

  return {
    topology: {
      centralAxisSource: "layout.positions.center",
      sourcePivotId: "center",
      seconds: DISP_SECONDS,
      secondsReason:
        "No frozen seconds arbor above the train, no motion works, and no proven seconds ratio. Small-seconds at fourth would invent a display staff the frozen calibre does not provide.",
      notClaimed: [
        "seconds ratio or seconds display",
        "winding or hand-setting",
        "keyless works",
        "final hand shapes",
        "final dial / indices",
        "front sapphire / bezel",
      ],
    },
    axis,
    sourcePivotXy,
    axisDrift,
    jewelTopZ: jewel.z,
    jewelTopSource: jewel.source,
    planes: {
      interfaceBase: interfaceZ0,
      chapterReference: chapterZ0,
      chapterTop: chapterZ1,
      hourMount,
      minuteMount,
      displayMax: envelopeMax,
    },
    interfaceBase: {
      innerR: minuteInner,
      outerR: hourOuter + DISP.interfaceBaseOuterExtra,
      z0: interfaceZ0,
      z1: interfaceZ1,
    },
    pipes: [
      {
        id: "hourPipeReserve",
        role: "frozen Phase-3B hour-pipe authority consumed by the Phase-4B driven hour member",
        innerR: hourInner,
        outerR: hourOuter,
        z0: interfaceZ1,
        z1: hourMount,
      },
      {
        id: "minutePipeReserve",
        role: "frozen Phase-3B minute-pipe authority consumed by the Phase-4B driven minute member",
        innerR: minuteInner,
        outerR: minuteOuter,
        z0: interfaceZ1,
        z1: minuteMount,
      },
    ],
    hourSweep,
    minuteSweep,
    chapter: {
      inner: chapterInner,
      outer: chapterOuter,
      z0: chapterZ0,
      z1: chapterZ1,
      cavityClearance: DISP.chapterCavityClearance,
      bandWidth: DISP.chapterBand,
    },
    envelope: {
      minZ: envelopeMin,
      maxZ: envelopeMax,
      limiting: "minute-hand sweep envelope upper Z",
      xyInnerR: hourR,
      xyOuterR: pointToPolygonBoundary(axis, chapterOuter) + DISP.chapterCavityClearance,
    },
    separations: {
      chapterToHour: hourMount - chapterZ1,
      hourToMinute: minuteMount - hourSweepZ1,
      hourVsMinuteZ: minuteSweep.z0 - hourSweep.z1,
    },
    fit: {
      accFrontClear: acc.z.frontClear,
      accDialTop: acc.z.dialTop,
      accFrontCloseLo: acc.z.frontCloseLo,
      accFrontCloseHi: acc.z.frontCloseHi,
      displayMinZ: envelopeMin,
      displayMaxZ: envelopeMax,
      remainingToDialTop,
      remainingToFrontCloseLo,
      fits: remainingToDialTop >= -1e-9,
    },
  };
}
