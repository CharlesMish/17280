import type { AccommodationPlan } from "./accommodationPlan";
import type { EnclosurePlan } from "./enclosurePlan";
import { ACC_EPS, containsConvex, pointInConvex } from "./accommodationMath";
import { auditFasteners, auditResidual } from "./enclosureAudit";
import { ENC } from "./enclosureSpec";
import { EXT } from "./exteriorSpec";
import type { ExteriorPlan } from "./exteriorPlan";

function polyKey(pts: { x: number; y: number }[]): string {
  return pts.map((p) => `${p.x.toFixed(8)},${p.y.toFixed(8)}`).join("|");
}

export function auditExterior(plan: ExteriorPlan, acc: AccommodationPlan, enc: EnclosurePlan) {
  const residual = auditResidual(enc);
  const fasteners = auditFasteners(enc, acc);
  const crown = plan.crown;
  const corridor = acc.corridor;
  const crownAxisDrift = Math.hypot(
    crown.axis.x - corridor.origin.x,
    crown.axis.y - corridor.origin.y,
    crown.axis.z - corridor.z,
  );
  const innerFrontDrift = plan.z.frontSapphireInner - enc.front.inner.z;
  const innerRearDrift = plan.z.rearSapphireInner - enc.rear.inner.z;

  const metalTopOk = plan.z.metalTop <= plan.z.packageTop + ACC_EPS;
  const metalBotOk = plan.z.metalBottom >= plan.z.packageBottom - ACC_EPS;
  const frontSapOk = plan.z.frontSapphireOuter <= enc.front.outerEnvelopeZ + ACC_EPS;
  const rearSapOk = plan.z.rearSapphireOuter >= enc.rear.outerEnvelopeZ - ACC_EPS;
  const frontThickOk = plan.z.frontSapphireOuter - plan.z.frontSapphireInner + ACC_EPS >= ENC.frontSapphireMinThick;
  const rearThickOk = plan.z.rearSapphireInner - plan.z.rearSapphireOuter + ACC_EPS >= ENC.rearSapphireMinThick;

  const kernelContained = plan.bands.every((b) => b.offset + ACC_EPS >= 0);
  const widest = plan.contours.bezelOuter;
  const wallInside = containsConvex(acc.outerWall, widest, ACC_EPS);

  const residualOk = residual.frontSeatResidual + ACC_EPS >= EXT.frontResidualKeep;
  const fastenerOk = fasteners.minMaterialMargin + ACC_EPS >= EXT.fastenerMarginKeep;

  const carrierId =
    polyKey(enc.front.carrierOuter) === polyKey(plan.kernel.frontCarrierOuter) &&
    polyKey(enc.front.carrierInner) === polyKey(plan.kernel.frontCarrierInner) &&
    polyKey(enc.front.gasketOuter) === polyKey(plan.kernel.frontGasketOuter) &&
    polyKey(enc.rear.carrierOuter) === polyKey(plan.kernel.rearCarrierOuter) &&
    polyKey(enc.rear.gasketInner) === polyKey(plan.kernel.rearGasketInner);

  const [north, south] = plan.lugs.sides;
  const rootZ = plan.lugs.rootZ1 - plan.lugs.rootZ0;
  const tipZ = plan.lugs.tipZ1 - plan.lugs.tipZ0;
  const rootGteTip = rootZ + ACC_EPS >= tipZ;
  const northOnWall = north.yRoot === north.wallY;
  const southOnWall = south.yRoot === south.wallY;
  const freeDelta = Math.abs(north.freeLength - south.freeLength);
  const bar = plan.lugs.bars[0];
  const tipMaterial = Math.min(
    Math.abs(north.yTip - bar.axisY),
    bar.axisZ - plan.lugs.tipZ0,
    plan.lugs.tipZ1 - bar.axisZ,
  ) - bar.reserveR;
  const hornContainsReserve = tipMaterial + ACC_EPS >= 0 && plan.lugs.hornTipThick * 0.5 + ACC_EPS >= bar.reserveR * 0.5;

  const engagement = crown.caseX - crown.neckX0;
  const pocketCoversAxis =
    crown.pocketZ0 <= corridor.z + ACC_EPS && crown.pocketZ1 >= corridor.z - ACC_EPS;
  const pocketNotFullHeight = crown.pocketZ1 - crown.pocketZ0 < (plan.z.metalTop - plan.z.metalBottom) * 0.45;
  const slottedBands = plan.bands.filter((b) => b.crownPocket).map((b) => b.id);

  const waist = plan.bands.find((b) => b.role === "waist");
  const mid = plan.bands.find((b) => b.role === "mid");
  const caseback = plan.bands.find((b) => b.role === "caseback");
  const waistReentrant =
    !!waist && !!mid && !!caseback && waist.offset + ACC_EPS < mid.offset && waist.offset + ACC_EPS < caseback.offset;

  const accepted =
    metalTopOk &&
    metalBotOk &&
    frontSapOk &&
    rearSapOk &&
    frontThickOk &&
    rearThickOk &&
    kernelContained &&
    wallInside &&
    residualOk &&
    fastenerOk &&
    carrierId &&
    crownAxisDrift < ACC_EPS &&
    Math.abs(innerFrontDrift) < ACC_EPS &&
    Math.abs(innerRearDrift) < ACC_EPS &&
    hornContainsReserve &&
    rootGteTip &&
    northOnWall &&
    southOnWall &&
    pocketCoversAxis &&
    pocketNotFullHeight &&
    waistReentrant &&
    engagement > 0.4 &&
    plan.z.packageTop - plan.z.packageBottom > 0;

  return {
    accepted,
    residual: {
      before: EXT.frontResidualKeep,
      after: residual.frontSeatResidual,
      rearAfter: residual.rearSeatResidual,
      ok: residualOk,
    },
    fasteners: {
      before: EXT.fastenerMarginKeep,
      after: fasteners.minMaterialMargin,
      axes: fasteners.axes.map((a) => ({ id: a.id, xy: a.xy, minMaterialMargin: a.minMaterialMargin })),
      ok: fastenerOk,
    },
    identity: {
      carrierGasket: carrierId,
      frontInnerDrift: innerFrontDrift,
      rearInnerDrift: innerRearDrift,
      crownAxisDrift,
    },
    package: {
      top: plan.z.packageTop,
      bottom: plan.z.packageBottom,
      metalTop: plan.z.metalTop,
      metalBottom: plan.z.metalBottom,
      metalTopOk,
      metalBotOk,
      zGrowth: 0,
      thickness: plan.z.metalTop - plan.z.metalBottom,
    },
    sapphire: {
      description: plan.sapphire.description,
      frontMax: enc.front.outerEnvelopeZ,
      frontAchieved: plan.z.frontSapphireOuter,
      frontAllowance: plan.sapphire.frontAllowance,
      frontConsumed: plan.sapphire.frontConsumed,
      frontRemain: enc.front.outerEnvelopeZ - plan.z.frontSapphireOuter,
      rearMax: enc.rear.outerEnvelopeZ,
      rearAchieved: plan.z.rearSapphireOuter,
      rearAllowance: plan.sapphire.rearAllowance,
      rearConsumed: plan.sapphire.rearConsumed,
      rearRemain: plan.z.rearSapphireOuter - enc.rear.outerEnvelopeZ,
      frontOk: frontSapOk && frontThickOk,
      rearOk: rearSapOk && rearThickOk,
    },
    kernel: {
      contained: kernelContained && wallInside,
      minBandOffset: Math.min(...plan.bands.map((b) => b.offset)),
    },
    lugs: {
      north: {
        wallY: north.wallY,
        wallX: north.wallX,
        yRoot: north.yRoot,
        yTip: north.yTip,
        freeLength: north.freeLength,
        onLocalWall: northOnWall,
      },
      south: {
        wallY: south.wallY,
        wallX: south.wallX,
        yRoot: south.yRoot,
        yTip: south.yTip,
        freeLength: south.freeLength,
        onLocalWall: southOnWall,
      },
      intendedFreeLength: plan.lugs.intendedFreeLength,
      freeLengthDelta: freeDelta,
      caseYCenter: plan.lugs.caseYCenter,
      frameYCenter: plan.lugs.frameYCenter,
      lugToLug: plan.lugs.lugToLug,
      strapWidth: plan.lugs.strapWidth,
      rootZ0: plan.lugs.rootZ0,
      rootZ1: plan.lugs.rootZ1,
      rootZSpan: rootZ,
      tipZ0: plan.lugs.tipZ0,
      tipZ1: plan.lugs.tipZ1,
      tipZSpan: tipZ,
      rootGteTip,
      rootBandId: plan.lugs.rootBandId,
      planRootThick: plan.lugs.hornRootThick,
      planTipThick: plan.lugs.hornTipThick,
      springBarDiameter: bar.diameter,
      reserveR: bar.reserveR,
      surround: plan.lugs.surround,
      minMaterialAroundBar: tipMaterial,
      hornContainsReserve,
    },
    crown: {
      diameter: crown.bodyR * 2,
      projection: crown.projection,
      caseX: crown.caseX,
      neckX0: crown.neckX0,
      bodyX0: crown.bodyX0,
      engagement: engagement,
      pocketDepth: crown.pocketDepth,
      pocketZ0: crown.pocketZ0,
      pocketZ1: crown.pocketZ1,
      pocketHeight: crown.pocketZ1 - crown.pocketZ0,
      pocketCoversAxis,
      pocketNotFullHeight,
      slottedBands,
      axisDrift: crownAxisDrift,
      nearestNorthLugY: north.yRoot,
    },
    profile: {
      bands: plan.bands.map((b) => ({ id: b.id, offset: b.offset, z0: b.z0, z1: b.z1, height: b.z1 - b.z0 })),
      waistReentrant,
    },
    extents: extents(plan),
  };
}

function extents(plan: ExteriorPlan) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const consider = (pts: { x: number; y: number }[]) => {
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  };
  consider(plan.contours.bezelOuter);
  consider(plan.contours.midOuter);
  consider(plan.contours.casebackOuter);
  maxX = Math.max(maxX, plan.crown.bodyX1);
  minY = Math.min(minY, plan.lugs.sides[1].yTip);
  maxY = Math.max(maxY, plan.lugs.sides[0].yTip);
  return {
    caseWidth:
      Math.max(...plan.contours.bezelOuter.map((p) => p.x)) - Math.min(...plan.contours.bezelOuter.map((p) => p.x)),
    caseLength:
      Math.max(...plan.contours.midOuter.map((p) => p.y)) - Math.min(...plan.contours.midOuter.map((p) => p.y)),
    widthWithCrown: maxX - minX,
    lengthWithLugs: maxY - minY,
    minX,
    maxX,
    minY,
    maxY,
  };
}

export function sampleInsideWidest(plan: ExteriorPlan, p: { x: number; y: number }): boolean {
  return pointInConvex(p, plan.contours.bezelOuter);
}
