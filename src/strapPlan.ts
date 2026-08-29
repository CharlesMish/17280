import type { ExteriorPlan } from "./exteriorPlan";
import { extremumOnXSpan } from "./exteriorPlan";
import { EXT } from "./exteriorSpec";
import { STRAP } from "./strapSpec";

export type StrapSidePlan = {
  side: "north" | "south";
  sign: 1 | -1;
  barY: number;
  barZ: number;
  yRoot: number;
  yTip: number;
  caseY: number;
  caseGap: number;
  sMin: number;
  towardCaseClearance: number;
};

export type StrapPlan = {
  thesis: string;
  strapWidth: number;
  headWidth: number;
  freeEndWidth: number;
  hornGap: number;
  barDiameter: number;
  barRadius: number;
  barPinRadius: number;
  barBarrelX0: number;
  barBarrelX1: number;
  seatRadius: number;
  barX0: number;
  barX1: number;
  innerX: number;
  tipThick: number;
  headThick: number;
  freeThick: number;
  headLen: number;
  freeLen: number;
  straightLen: number;
  arcR: number;
  north: StrapSidePlan;
  south: StrapSidePlan;
  frozen: {
    strapWidth: number;
    springBarDiameter: number;
    hornRootThick: number;
    hornTipThick: number;
    reserveR: number;
    northBarY: number;
    southBarY: number;
    barZ: number;
  };
};

export function createStrapPlan(ext: ExteriorPlan): StrapPlan {
  const l = ext.lugs;
  const innerX = l.strapWidth / 2;
  const headWidth = l.strapWidth - 2 * STRAP.hornGap;
  const barR = l.bars[0].diameter / 2;
  const seatR = barR + STRAP.seatClearance;
  const barEmbed = Math.min(1.15, l.hornTipThick - 0.22);
  const barBarrelHalf = headWidth / 2 - STRAP.springBarShoulderCapture;
  const north = sidePlan(ext, 0, 1);
  const south = sidePlan(ext, 1, -1);
  return {
    thesis: STRAP.thesis,
    strapWidth: l.strapWidth,
    headWidth,
    freeEndWidth: STRAP.taperEndWidth,
    hornGap: STRAP.hornGap,
    barDiameter: l.bars[0].diameter,
    barRadius: barR,
    barPinRadius: Math.min(STRAP.springBarPinRadius, barR - 0.08),
    barBarrelX0: -barBarrelHalf,
    barBarrelX1: barBarrelHalf,
    seatRadius: seatR,
    barX0: -(innerX + barEmbed),
    barX1: innerX + barEmbed,
    innerX,
    tipThick: l.hornTipThick,
    headThick: STRAP.headThick,
    freeThick: STRAP.freeThick,
    headLen: STRAP.headLen,
    freeLen: STRAP.freeLen,
    straightLen: STRAP.straightLen,
    arcR: STRAP.arcR,
    north,
    south,
    frozen: {
      strapWidth: l.strapWidth,
      springBarDiameter: l.bars[0].diameter,
      hornRootThick: l.hornRootThick,
      hornTipThick: l.hornTipThick,
      reserveR: l.bars[0].reserveR,
      northBarY: l.bars[0].axisY,
      southBarY: l.bars[1].axisY,
      barZ: l.bars[0].axisZ,
    },
  };
}

function sidePlan(ext: ExteriorPlan, barIndex: 0 | 1, sign: 1 | -1): StrapSidePlan {
  const l = ext.lugs;
  const side = l.sides[barIndex];
  const bar = l.bars[barIndex];
  const hit = extremumOnXSpan(ext.contours.waistOuter, -2.5, 2.5, sign > 0 ? "max" : "min");
  const caseY = hit.y;
  const hornGap = sign > 0 ? bar.axisY - side.yRoot : side.yRoot - bar.axisY;
  const caseGap = Math.max(0.2, sign > 0 ? bar.axisY - caseY : caseY - bar.axisY);
  const desired = STRAP.headTowardCase;
  const sMin = -Math.min(desired, Math.max(0.85, hornGap - 0.62));
  return {
    side: side.side,
    sign,
    barY: bar.axisY,
    barZ: bar.axisZ,
    yRoot: side.yRoot,
    yTip: side.yTip,
    caseY,
    caseGap,
    sMin,
    towardCaseClearance: caseGap + sMin,
  };
}

export function frozenInterfaceOk(plan: StrapPlan): boolean {
  return (
    Math.abs(plan.frozen.strapWidth - EXT.strapWidth) < 1e-9 &&
    Math.abs(plan.frozen.springBarDiameter - EXT.springBarDiameter) < 1e-9 &&
    Math.abs(plan.frozen.hornRootThick - EXT.hornRootThick) < 1e-9 &&
    Math.abs(plan.frozen.hornTipThick - EXT.hornTipThick) < 1e-9
  );
}
