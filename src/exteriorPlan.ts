import type { Vec2 } from "./spec";
import type { AccommodationPlan } from "./accommodationPlan";
import type { EnclosurePlan } from "./enclosurePlan";
import { offsetConvexExact, rightmostHorizontalHit } from "./accommodationMath";
import { ENC } from "./enclosureSpec";
import { EXT, type ExteriorConceptId } from "./exteriorSpec";

export type ExteriorBandPlan = {
  id: string;
  role: "bezel" | "chamfer" | "mid" | "waist" | "caseback";
  offset: number;
  z0: number;
  z1: number;
  inner: "frontOpening" | "rearExhibition" | "cavity";
  finish: "satin" | "polish" | "recess";
  crownPocket: boolean;
  fastenerPockets: boolean;
};

export type SpringBarPlan = {
  id: "spring-bar:north" | "spring-bar:south";
  axisY: number;
  axisZ: number;
  x0: number;
  x1: number;
  diameter: number;
  reserveR: number;
};

export type LugSide = {
  side: "north" | "south";
  xLo: number;
  xHi: number;
  wallY: number;
  wallX: number;
  wallA: Vec2;
  wallB: Vec2;
  yRoot: number;
  yTip: number;
  freeLength: number;
  embed: number;
};

export type ExteriorPlan = {
  concept: ExteriorConceptId;
  rejected: { id: ExteriorConceptId; reason: string }[];
  kernel: {
    outerWall: Vec2[];
    cavity: Vec2[];
    midcaseTop: number;
    midcaseBottom: number;
    frontCarrierOuter: Vec2[];
    frontCarrierInner: Vec2[];
    frontGasketOuter: Vec2[];
    frontGasketInner: Vec2[];
    rearCarrierOuter: Vec2[];
    rearCarrierInner: Vec2[];
    rearGasketOuter: Vec2[];
    rearGasketInner: Vec2[];
    frontInnerZ: number;
    rearInnerZ: number;
    frontOuterEnvelopeZ: number;
    rearOuterEnvelopeZ: number;
    fastenerAxes: EnclosurePlan["closure"]["fastenerAxes"];
    corridor: AccommodationPlan["corridor"];
  };
  bands: ExteriorBandPlan[];
  contours: {
    bezelOuter: Vec2[];
    midOuter: Vec2[];
    waistOuter: Vec2[];
    casebackOuter: Vec2[];
    bezelInner: Vec2[];
    casebackInner: Vec2[];
  };
  z: {
    packageTop: number;
    packageBottom: number;
    metalTop: number;
    metalBottom: number;
    frontSapphireOuter: number;
    rearSapphireOuter: number;
    frontSapphireInner: number;
    rearSapphireInner: number;
  };
  lugs: {
    strapWidth: number;
    hornRootThick: number;
    hornTipThick: number;
    intendedFreeLength: number;
    sides: [LugSide, LugSide];
    bars: SpringBarPlan[];
    lugToLug: number;
    caseYCenter: number;
    frameYCenter: number;
    rootZ0: number;
    rootZ1: number;
    tipZ0: number;
    tipZ1: number;
    rootBandId: string;
    tipBandNote: string;
    surround: number;
  };
  crown: {
    axis: { x: number; y: number; z: number };
    dir: { x: number; y: number; z: number };
    bodyR: number;
    neckR: number;
    caseX: number;
    pocketDepth: number;
    pocketYHalf: number;
    pocketZ0: number;
    pocketZ1: number;
    neckX0: number;
    bodyX0: number;
    bodyX1: number;
    engagement: number;
    projection: number;
    flutes: number;
  };
  keepoutAt?: { x: number; y: number; z: number };
  sapphire: {
    frontOuterZ: number;
    rearOuterZ: number;
    frontAllowance: number;
    rearAllowance: number;
    frontConsumed: number;
    rearConsumed: number;
    frontInset: number;
    rearInset: number;
    description: "subtle raised/inset outer caps — not a boxed crystal";
  };
};

type ConceptProfile = {
  bezel: number;
  chamfer: number;
  mid: number;
  waist: number;
  caseback: number;
};

const CONCEPTS: Record<ExteriorConceptId, ConceptProfile> = {
  "tensioned-cushion": { bezel: 1.72, chamfer: 1.38, mid: 1.12, waist: 0.22, caseback: 0.42 },
  "stepped-flank": { bezel: 2.08, chamfer: 1.18, mid: 1.18, waist: 1.18, caseback: 0.52 },
  "soft-pillow": { bezel: 1.88, chamfer: 1.72, mid: 1.62, waist: 1.38, caseback: 1.12 },
};

export function extremumOnXSpan(
  poly: Vec2[],
  xLo: number,
  xHi: number,
  mode: "max" | "min",
): { y: number; x: number; a: Vec2; b: Vec2 } {
  const better = (y: number, best: number) => (mode === "max" ? y > best : y < best);
  let bestY = mode === "max" ? -Infinity : Infinity;
  let bestX = (xLo + xHi) * 0.5;
  let bestA = poly[0];
  let bestB = poly[1] ?? poly[0];
  const consider = (x: number, y: number, a: Vec2, b: Vec2) => {
    if (x < xLo - 1e-9 || x > xHi + 1e-9) return;
    if (!Number.isFinite(y)) return;
    if (better(y, bestY)) {
      bestY = y;
      bestX = x;
      bestA = a;
      bestB = b;
    }
  };
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    consider(a.x, a.y, a, b);
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    if (maxX < xLo || minX > xHi) continue;
    const xs = [Math.max(xLo, minX), Math.min(xHi, maxX)];
    if (xs[0] !== xs[1]) xs.push((xs[0] + xs[1]) * 0.5);
    for (const x of xs) {
      const dx = b.x - a.x;
      const t = Math.abs(dx) < 1e-12 ? 0 : (x - a.x) / dx;
      if (t < -1e-9 || t > 1 + 1e-9) continue;
      consider(x, a.y + t * (b.y - a.y), a, b);
    }
  }
  return { y: bestY, x: bestX, a: bestA, b: bestB };
}

export function growShoulder(poly: Vec2[], xLo: number, xHi: number, dy: number, ySign?: 1 | -1): Vec2[] {
  const fade = 1.35;
  return poly.map((p) => {
    if (ySign !== undefined && p.y * ySign < 0) return p;
    if (p.x < xLo - fade || p.x > xHi + fade) return p;
    const edge = p.x < xLo ? (xLo - p.x) / fade : p.x > xHi ? (p.x - xHi) / fade : 0;
    const w = 1 - Math.min(1, edge);
    return { x: p.x, y: p.y + dy * w };
  });
}

export function applyCrownPocket(poly: Vec2[], caseX: number, depth: number, yHalf: number): Vec2[] {
  const xGate = caseX - 4.2;
  const yLim = yHalf + 1.15;
  return poly.map((p) => {
    if (p.x < xGate || Math.abs(p.y) > yLim) return p;
    const wy = 1 - Math.min(1, Math.abs(p.y) / yLim);
    const wx = Math.max(0, (p.x - xGate) / Math.max(0.2, caseX - xGate));
    const w = wy * wy * wx;
    return { x: p.x - depth * w, y: p.y };
  });
}

/** World-X radius of the rotating crown lathe. 0 outside the body. */
export function crownRadiusAtX(
  c: { neckX0: number; bodyX0: number; bodyX1: number; neckR: number; bodyR: number },
  x: number,
): number {
  if (x < c.neckX0 || x > c.bodyX1) return 0;
  const samples: [number, number][] = [
    [c.neckX0, c.neckR * 0.78],
    [c.bodyX0, c.neckR],
    [c.bodyX0 + 0.22, c.bodyR - 0.2],
    [c.bodyX0 + 0.48, c.bodyR],
    [c.bodyX1 - 0.28, c.bodyR],
    [c.bodyX1 - 0.08, c.bodyR - 0.22],
    [c.bodyX1, c.bodyR * 0.62],
  ];
  for (let i = 0; i < samples.length - 1; i++) {
    const [x0, r0] = samples[i];
    const [x1, r1] = samples[i + 1];
    if (x >= x0 && x <= x1) {
      const t = (x - x0) / Math.max(1e-9, x1 - x0);
      return r0 + t * (r1 - r0);
    }
  }
  return 0;
}

/** Largest X at which the crown is still no fatter than rNeed. */
function crownXAtRadius(
  c: { neckX0: number; bodyX0: number; bodyX1: number; neckR: number; bodyR: number },
  rNeed: number,
): number {
  if (rNeed >= c.bodyR) return Infinity;
  if (rNeed <= c.neckR * 0.78) return c.neckX0;
  const samples: [number, number][] = [
    [c.neckX0, c.neckR * 0.78],
    [c.bodyX0, c.neckR],
    [c.bodyX0 + 0.22, c.bodyR - 0.2],
    [c.bodyX0 + 0.48, c.bodyR],
    [c.bodyX1 - 0.28, c.bodyR],
  ];
  for (let i = 0; i < samples.length - 1; i++) {
    const [x0, r0] = samples[i];
    const [x1, r1] = samples[i + 1];
    if (rNeed >= r0 && rNeed <= r1) {
      const t = (rNeed - r0) / Math.max(1e-9, r1 - r0);
      return x0 + t * (x1 - x0);
    }
  }
  return c.bodyX0;
}

/**
 * Pull the 3-o'clock outer contour behind the rotating crown envelope.
 * Each contour point exists as a vertical edge through [z0, z1].
 */
export function applyCrownRadialKeepout(
  poly: Vec2[],
  c: {
    axis: { y: number; z: number };
    neckX0: number;
    bodyX0: number;
    bodyX1: number;
    neckR: number;
    bodyR: number;
    caseX: number;
  },
  z0: number,
  z1: number,
  gap = 0.12,
): Vec2[] {
  const zLo = Math.min(z0, z1);
  const zHi = Math.max(z0, z1);
  const dense: Vec2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    dense.push(a);
    const near = a.x > c.caseX - 5.5 || b.x > c.caseX - 5.5;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (!near || len < 0.12) continue;
    const n = Math.ceil(len / 0.12);
    for (let k = 1; k < n; k++) {
      const t = k / n;
      dense.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return dense.map((p) => {
    if (p.x < c.caseX - 5.5) return p;
    const dy = p.y - c.axis.y;
    const zClamped = Math.max(zLo, Math.min(zHi, c.axis.z));
    const rho = Math.hypot(dy, zClamped - c.axis.z);
    const need = rho - gap;
    if (need >= c.bodyR) return p;
    const xMax = crownXAtRadius(c, Math.max(0.05, need)) - gap;
    if (p.x <= xMax) return p;
    return { x: xMax, y: p.y };
  });
}

export function createExteriorPlan(acc: AccommodationPlan, enc: EnclosurePlan): ExteriorPlan {
  const concept: ExteriorConceptId = EXT.selectedConcept;
  const profile = CONCEPTS[concept];
  const zTop = acc.z.midcaseTop;
  const zBot = acc.z.midcaseBottom;
  const carrierTop = enc.front.carrierTopZ;
  const corridor = acc.corridor;

  const bezelTop = Math.min(carrierTop + 0.3, zTop - 0.12);
  const bezelBot = carrierTop;
  const chamferBot = Math.max(5.85, enc.front.registerZ0 + 0.05);
  const midBot = 0.95;
  const waistBot = -0.95;
  const metalTop = bezelTop;
  const metalBottom = zBot;

  const bands: ExteriorBandPlan[] = [
    {
      id: "ext:bezel",
      role: "bezel",
      offset: profile.bezel,
      z0: bezelBot,
      z1: bezelTop,
      inner: "frontOpening",
      finish: "satin",
      crownPocket: false,
      fastenerPockets: false,
    },
    {
      id: "ext:bezel-chamfer",
      role: "chamfer",
      offset: profile.chamfer,
      z0: chamferBot,
      z1: bezelBot,
      inner: "cavity",
      finish: "polish",
      crownPocket: false,
      fastenerPockets: false,
    },
    {
      id: "ext:mid",
      role: "mid",
      offset: profile.mid,
      z0: midBot,
      z1: chamferBot,
      inner: "cavity",
      finish: "satin",
      crownPocket: false,
      fastenerPockets: false,
    },
    {
      id: "ext:waist",
      role: "waist",
      offset: profile.waist,
      z0: waistBot,
      z1: midBot,
      inner: "cavity",
      finish: "recess",
      crownPocket: true,
      fastenerPockets: false,
    },
    {
      id: "ext:caseback",
      role: "caseback",
      offset: profile.caseback,
      z0: metalBottom,
      z1: waistBot,
      inner: "rearExhibition",
      finish: "satin",
      crownPocket: false,
      fastenerPockets: true,
    },
  ];

  const bezelOuter = offsetConvexExact(acc.outerWall, profile.bezel);
  let midOuter = offsetConvexExact(acc.outerWall, profile.mid);
  const waistOuterRaw = offsetConvexExact(acc.outerWall, profile.waist);
  const casebackOuter = offsetConvexExact(acc.outerWall, profile.caseback);

  const hornXLo = EXT.strapWidth / 2;
  const hornXHi = hornXLo + EXT.hornRootThick;
  const xEast0 = hornXLo - 0.15;
  const xEast1 = hornXHi + 0.35;
  const xWest0 = -hornXHi - 0.35;
  const xWest1 = -hornXLo + 0.15;
  const midGrow = 0.72;
  // Seed only the historical NE / SW corners before measuring yRoot so lug
  // positions stay frozen. The other two corners are completed after.
  midOuter = growShoulder(midOuter, xEast0, xEast1, midGrow, 1);
  midOuter = growShoulder(midOuter, xWest0, xWest1, -midGrow, -1);

  const northHit = extremumOnXSpan(midOuter, hornXLo, hornXHi, "max");
  const southHit = extremumOnXSpan(midOuter, -hornXHi, -hornXLo, "min");
  const free = EXT.hornFreeLength;
  const north: LugSide = {
    side: "north",
    xLo: hornXLo,
    xHi: hornXHi,
    wallY: northHit.y,
    wallX: northHit.x,
    wallA: northHit.a,
    wallB: northHit.b,
    yRoot: northHit.y,
    yTip: northHit.y + free,
    freeLength: free,
    embed: EXT.hornEmbed,
  };
  const south: LugSide = {
    side: "south",
    xLo: -hornXHi,
    xHi: -hornXLo,
    wallY: southHit.y,
    wallX: southHit.x,
    wallA: southHit.a,
    wallB: southHit.b,
    yRoot: southHit.y,
    yTip: southHit.y - free,
    freeLength: free,
    embed: EXT.hornEmbed,
  };

  const midHit = rightmostHorizontalHit(midOuter, 0);
  const caseX = midHit ? midHit.x : corridor.origin.x + profile.mid;
  // Tight 3-o'clock seat, not a wide cave. yHalf keeps the notch around the
  // crown axis so a compact socket can sit in it without flaring to the bands.
  const seatYHalf = 0.46;
  let waistOuter = applyCrownPocket(waistOuterRaw, caseX, EXT.crownPocketDepth, seatYHalf);

  // After yRoot is frozen: complete NW/SE (they had no pedestal) and bury all
  // four roots under a local mid/waist/caseback swell. Does not move yRoot.
  const bury = 0.5;
  const finish = midGrow + bury;
  midOuter = growShoulder(midOuter, xEast0, xEast1, bury, 1);
  midOuter = growShoulder(midOuter, xWest0, xWest1, finish, 1);
  midOuter = growShoulder(midOuter, xWest0, xWest1, -bury, -1);
  midOuter = growShoulder(midOuter, xEast0, xEast1, -finish, -1);

  const waistMeet = finish + (profile.mid - profile.waist);
  waistOuter = growShoulder(waistOuter, xEast0, xEast1, waistMeet, 1);
  waistOuter = growShoulder(waistOuter, xWest0, xWest1, waistMeet, 1);
  waistOuter = growShoulder(waistOuter, xWest0, xWest1, -waistMeet, -1);
  waistOuter = growShoulder(waistOuter, xEast0, xEast1, -waistMeet, -1);

  const backMeet = finish + (profile.mid - profile.caseback) * 0.7;
  const casebackLocal = growShoulder(
    growShoulder(
      growShoulder(growShoulder(casebackOuter, xEast0, xEast1, backMeet, 1), xWest0, xWest1, backMeet, 1),
      xWest0,
      xWest1,
      -backMeet,
      -1,
    ),
    xEast0,
    xEast1,
    -backMeet,
    -1,
  );

  // Localized 3-o'clock seat only. Lug Y is outside yLim so horn roots stay put.
  // Mid/caseback recede toward a compact socket instead of leaving a mid shelf.
  midOuter = applyCrownPocket(midOuter, caseX, EXT.crownPocketDepth * 0.95, seatYHalf);
  let casebackPocketed = applyCrownPocket(casebackLocal, caseX, EXT.crownPocketDepth * 0.78, seatYHalf);

  const crownKeep = {
    axis: { y: corridor.origin.y, z: corridor.z },
    neckX0: caseX - EXT.crownEngagement,
    bodyX0: caseX - 0.18,
    bodyX1: caseX + EXT.crownProjection,
    neckR: 1.18,
    bodyR: EXT.crownBodyR,
    caseX,
  };
  midOuter = applyCrownRadialKeepout(midOuter, crownKeep, midBot, chamferBot);
  waistOuter = applyCrownRadialKeepout(waistOuter, crownKeep, waistBot, midBot);
  casebackPocketed = applyCrownRadialKeepout(casebackPocketed, crownKeep, metalBottom, waistBot);

  const frontSlabOuter = enc.front.inner.z + enc.front.minThick;
  const rearSlabOuter = enc.rear.inner.z - enc.rear.minThick;
  const frontAllowance = enc.front.outerEnvelopeZ - frontSlabOuter;
  const rearAllowance = rearSlabOuter - enc.rear.outerEnvelopeZ;
  const frontConsumed = Math.min(0.24, Math.max(0.1, frontAllowance - 0.06));
  const rearConsumed = Math.min(0.12, Math.max(0.06, rearAllowance - 0.04));

  const rootZ0 = waistBot;
  const rootZ1 = midBot + 3.15;
  const tipHalf = EXT.springBarReserveR + EXT.hornSurround;
  const tipZ0 = zBot + 0.08;
  const tipZ1 = tipZ0 + 2 * tipHalf;
  const barZ = (tipZ0 + tipZ1) * 0.5;

  const midYs = midOuter.map((p) => p.y);
  const caseYCenter = (Math.max(...midYs) + Math.min(...midYs)) * 0.5;
  const frameYCenter = (north.yTip + south.yTip) * 0.5;

  const barX0 = -hornXHi;
  const barX1 = hornXHi;

  return {
    concept,
    rejected: [
      {
        id: "stepped-flank",
        reason: "Heavier bezel and vertical mid-flank read as a packaging block; weaker movement visibility and less cushion kinship.",
      },
      {
        id: "soft-pillow",
        reason: "Near-uniform offsets soften the movement-derived cushion into a generic rounded tablet.",
      },
    ],
    kernel: {
      outerWall: acc.outerWall,
      cavity: acc.cavityContour,
      midcaseTop: zTop,
      midcaseBottom: zBot,
      frontCarrierOuter: enc.front.carrierOuter,
      frontCarrierInner: enc.front.carrierInner,
      frontGasketOuter: enc.front.gasketOuter,
      frontGasketInner: enc.front.gasketInner,
      rearCarrierOuter: enc.rear.carrierOuter,
      rearCarrierInner: enc.rear.carrierInner,
      rearGasketOuter: enc.rear.gasketOuter,
      rearGasketInner: enc.rear.gasketInner,
      frontInnerZ: enc.front.inner.z,
      rearInnerZ: enc.rear.inner.z,
      frontOuterEnvelopeZ: enc.front.outerEnvelopeZ,
      rearOuterEnvelopeZ: enc.rear.outerEnvelopeZ,
      fastenerAxes: enc.closure.fastenerAxes,
      corridor,
    },
    bands,
    contours: {
      bezelOuter,
      midOuter,
      waistOuter,
      casebackOuter: casebackPocketed,
      bezelInner: enc.front.carrierInner,
      casebackInner: enc.rear.exhibition,
    },
    z: {
      packageTop: zTop,
      packageBottom: zBot,
      metalTop,
      metalBottom,
      frontSapphireOuter: frontSlabOuter + frontConsumed,
      rearSapphireOuter: rearSlabOuter - rearConsumed,
      frontSapphireInner: enc.front.inner.z,
      rearSapphireInner: enc.rear.inner.z,
    },
    lugs: {
      strapWidth: EXT.strapWidth,
      hornRootThick: EXT.hornRootThick,
      hornTipThick: EXT.hornTipThick,
      intendedFreeLength: free,
      sides: [north, south],
      bars: [
        {
          id: "spring-bar:north",
          axisY: north.yRoot + free * 0.55,
          axisZ: barZ,
          x0: barX0,
          x1: barX1,
          diameter: EXT.springBarDiameter,
          reserveR: EXT.springBarReserveR,
        },
        {
          id: "spring-bar:south",
          axisY: south.yRoot - free * 0.55,
          axisZ: barZ,
          x0: barX0,
          x1: barX1,
          diameter: EXT.springBarDiameter,
          reserveR: EXT.springBarReserveR,
        },
      ],
      lugToLug: north.yTip - south.yTip,
      caseYCenter,
      frameYCenter,
      rootZ0,
      rootZ1,
      tipZ0,
      tipZ1,
      rootBandId: "ext:waist.z0 → ext:mid (named)",
      tipBandNote: "tip Z sized by spring-bar reserve + surround; must be ≤ root Z",
      surround: EXT.hornSurround,
    },
    crown: {
      axis: { x: corridor.origin.x, y: corridor.origin.y, z: corridor.z },
      dir: { x: 1, y: 0, z: 0 },
      bodyR: EXT.crownBodyR,
      neckR: 1.18,
      caseX,
      pocketDepth: EXT.crownPocketDepth,
      pocketYHalf: seatYHalf,
      pocketZ0: waistBot,
      pocketZ1: midBot,
      neckX0: caseX - EXT.crownEngagement,
      bodyX0: caseX - 0.18,
      bodyX1: caseX + EXT.crownProjection,
      engagement: EXT.crownEngagement,
      projection: EXT.crownProjection,
      flutes: EXT.crownFlutes,
    },
    sapphire: {
      frontOuterZ: frontSlabOuter + frontConsumed,
      rearOuterZ: rearSlabOuter - rearConsumed,
      frontAllowance,
      rearAllowance,
      frontConsumed,
      rearConsumed,
      frontInset: ENC.frontCapInset - 0.04,
      rearInset: ENC.rearCapInset - 0.04,
      description: "subtle raised/inset outer caps — not a boxed crystal",
    },
  };
}
