import {
  DEPTH,
  ESCAPEMENT,
  FROZEN_ARBOR_WORLD_Z,
  type Layout,
  type PartName,
  type Vec2,
} from "./spec";
import {
  FROZEN_STRUCTURAL_ANCHORS,
  FROZEN_STRUCTURAL_INNER,
  FROZEN_STRUCTURAL_OUTER,
} from "./frozenGate0Authority";

/**
 * Phase 2A / 2A.1 structural planes.
 * Frozen movement layout → structural plan → geometry and debug.
 */

export const STRUCT = {
  plateBottom: -1.28,
  plateTop: -0.76,
  plateThick: 0.52,
  rimWidth: 1.52,

  trainBridgeBottom: 2.18,
  trainBridgeThick: 0.36,

  escapeBridgeBottom: 2.42,
  escapeBridgeThick: 0.3,

  cockBottom: 3.3,
  cockThick: 0.36,

  bossSeatClearance: 0.08,
  bearingBore: 0.2,
  columnTaper: 0.08,
  hoopInset: 0.42,
} as const;

/**
 * Local stationary underpass for the escape/pallet upper-support ribbon.
 *
 * The frozen escape anchorage lies inside the balance rim's XY annulus, so an
 * in-plane reroute cannot clear the complete balance beat.  These planes keep
 * the same anchor and bearing loci while carrying only the intervening ribbon
 * beneath the rim: 0.102 mm above the raised fork and 0.104 mm below the
 * rendered balance-rim floor.  The original upper boss slabs remain frozen.
 */
export const ESCAPE_FINGER_UNDERPASS = {
  bottom: 2.392,
  top: 2.49,
  fastenerSeatTop: 2.416,
  fastenerBoreMinimum: 0.208,
} as const;

export type PivotId = PartName;

export type SupportElement = {
  id: string;
  kind: "plate" | "trainBridge" | "escapeFinger" | "balanceCock";
  supports: PivotId[];
  seats: "lower" | "upper";
};

export const SUPPORT_MAP: SupportElement[] = [
  { id: "mainplate", kind: "plate", supports: ["barrel", "center", "third", "fourth", "escape", "pallet", "balance"], seats: "lower" },
  { id: "trainBridge", kind: "trainBridge", supports: ["center", "third", "fourth"], seats: "upper" },
  { id: "escapeFinger", kind: "escapeFinger", supports: ["escape", "pallet"], seats: "upper" },
  { id: "balanceCock", kind: "balanceCock", supports: ["balance"], seats: "upper" },
];

export type Locus = {
  id: string;
  kind: "bearing" | "anchorage";
  pivot?: PivotId;
  element: SupportElement["id"];
  xy: Vec2;
  z: number;
};

export type Anchorage = {
  id: string;
  element: SupportElement["id"];
  xy: Vec2;
  footRadius: number;
  plateTopZ: number;
  /** Physical top surface of the structural seat. Equals `bridgeBottomZ`. */
  seatTopZ: number;
  bridgeBottomZ: number;
  bridgeMidZ: number;
  bridgeTopZ: number;
  postHeight: number;
};

export type BearingSeat = {
  id: string;
  element: SupportElement["id"];
  pivot: PivotId;
  seat: "lower" | "upper";
  xy: Vec2;
  z: number;
  bossRadius: number;
};

export type StructuralPlan = {
  outer: Vec2[];
  inner: Vec2[];
  elements: SupportElement[];
  bearings: BearingSeat[];
  anchors: Record<string, Anchorage>;
  loci: Locus[];
};

export function arborWorldZ(part: PivotId): { zMin: number; zMax: number } {
  switch (part) {
    case "barrel":
      return { zMin: -0.55, zMax: THICK_BARREL_ARBOR_TOP };
    case "center":
      return { zMin: DEPTH.centerPinion - 0.5, zMax: DEPTH.centerWheel + 0.48 };
    case "third":
      return { zMin: DEPTH.thirdPinion - 0.5, zMax: DEPTH.thirdWheel + 0.48 };
    case "fourth":
      return { zMin: FROZEN_ARBOR_WORLD_Z.fourth.min, zMax: FROZEN_ARBOR_WORLD_Z.fourth.max };
    case "escape":
      return { zMin: FROZEN_ARBOR_WORLD_Z.escape.min, zMax: FROZEN_ARBOR_WORLD_Z.escape.max };
    case "pallet":
      return { zMin: DEPTH.pallet - 0.55, zMax: DEPTH.pallet + 0.55 };
    case "balance":
      return { zMin: DEPTH.balance - 0.85, zMax: DEPTH.balance + 0.55 };
    default:
      return { zMin: 0, zMax: 0 };
  }
}

const THICK_BARREL_ARBOR_TOP = 0.9 + 0.28;

export function lowerSeatZ(part: PivotId): number {
  return arborWorldZ(part).zMin - STRUCT.bossSeatClearance;
}

export function upperSeatZ(part: PivotId): number {
  return arborWorldZ(part).zMax + STRUCT.bossSeatClearance;
}

export function bossRadius(part: PivotId): number {
  switch (part) {
    case "barrel":
      return 0.82;
    case "center":
      return 0.64;
    case "third":
      return 0.56;
    case "fourth":
      return 0.54;
    case "escape":
      return 0.5;
    case "pallet":
      return 0.48;
    case "balance":
      return 0.62;
  }
}

export function lowerColumnNeeded(part: PivotId): boolean {
  return lowerSeatZ(part) > STRUCT.plateTop + 0.12;
}

/** Mechanism-derived circles used to build the movement envelope. */
export function envelopeCircles(layout: Layout): { id: string; c: Vec2; r: number }[] {
  const p = layout.positions;
  const r = layout.radii;
  return [
    { id: "barrel", c: p.barrel, r: r.barrel + 2.08 },
    { id: "center", c: p.center, r: r.center + 2.2 },
    { id: "third", c: p.third, r: r.third + 1.98 },
    { id: "fourth", c: p.fourth, r: r.fourth + 1.82 },
    { id: "escape", c: p.escape, r: r.escape + 2.18 },
    { id: "pallet", c: p.pallet, r: 2.58 },
    { id: "balance", c: p.balance, r: ESCAPEMENT.balanceRimRadius + 1.78 },
  ];
}

export function convexHull(points: Vec2[]): Vec2[] {
  const pts = points
    .slice()
    .sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const cross = (o: Vec2, a: Vec2, b: Vec2) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Vec2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

export function sampleCircle(c: Vec2, r: number, n = 28): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
  }
  return out;
}

export function chaikin(points: Vec2[], rounds = 3): Vec2[] {
  let pts = points;
  for (let r = 0; r < rounds; r++) {
    const next: Vec2[] = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    pts = next;
  }
  return pts;
}

export function offsetConvex(points: Vec2[], delta: number): Vec2[] {
  const n = points.length;
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = points[(i + n - 1) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];
    const e1x = curr.x - prev.x;
    const e1y = curr.y - prev.y;
    const e2x = next.x - curr.x;
    const e2y = next.y - curr.y;
    const l1 = Math.hypot(e1x, e1y) || 1;
    const l2 = Math.hypot(e2x, e2y) || 1;
    const n1x = -e1y / l1;
    const n1y = e1x / l1;
    const n2x = -e2y / l2;
    const n2y = e2x / l2;
    const nx = n1x + n2x;
    const ny = n1y + n2y;
    const nl = Math.hypot(nx, ny) || 1;
    out.push({ x: curr.x + (nx / nl) * delta, y: curr.y + (ny / nl) * delta });
  }
  return out;
}

export function computeEnvelope(layout: Layout): Vec2[] {
  const samples: Vec2[] = [];
  for (const c of envelopeCircles(layout)) {
    samples.push(...sampleCircle(c.c, c.r, 36));
  }
  return chaikin(convexHull(samples), 3);
}

export function closestOnRing(ring: Vec2[], p: Vec2): Vec2 {
  let best = ring[0];
  let bestD = Infinity;
  for (const q of ring) {
    const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}

export function extendBack(from: Vec2, to: Vec2, dist: number): Vec2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const l = Math.hypot(dx, dy) || 1;
  return { x: from.x - (dx / l) * dist, y: from.y - (dy / l) * dist };
}

/** seatTopZ is the physical seat top and must equal the bridge underside. */
export function validateSeatSemantics(plan: StructuralPlan): { id: string; delta: number }[] {
  return Object.values(plan.anchors).map((a) => ({
    id: a.id,
    delta: a.bridgeBottomZ - a.seatTopZ,
  }));
}

/**
 * Single authority: frozen layout → plan. Geometry and debug both consume this.
 */
export function createStructuralPlan(layout: Layout): StructuralPlan {
  const p = layout.positions;
  // Gate-0 package authority is executable data. Moved escapement loci may
  // never regenerate the case-driving structural contours or anchor feet.
  const outer = FROZEN_STRUCTURAL_OUTER.map((point) => ({ ...point }));
  const inner = FROZEN_STRUCTURAL_INNER.map((point) => ({ ...point }));
  const anchors = Object.fromEntries(
    Object.entries(FROZEN_STRUCTURAL_ANCHORS).map(([id, anchor]) => [
      id,
      { ...anchor, xy: { ...anchor.xy } },
    ]),
  ) as Record<string, Anchorage>;

  const bearings: BearingSeat[] = (Object.keys(p) as PivotId[]).map((id) => ({
    id: `bearing:${id}:lower`,
    element: "mainplate",
    pivot: id,
    seat: "lower" as const,
    xy: p[id],
    z: lowerSeatZ(id),
    bossRadius: bossRadius(id),
  }));

  for (const id of ["center", "third", "fourth"] as PivotId[]) {
    bearings.push({
      id: `bearing:${id}:upper`,
      element: "trainBridge",
      pivot: id,
      seat: "upper",
      xy: p[id],
      z: upperSeatZ(id),
      bossRadius: bossRadius(id) * 0.92,
    });
  }
  for (const id of ["escape", "pallet"] as PivotId[]) {
    bearings.push({
      id: `bearing:${id}:upper`,
      element: "escapeFinger",
      pivot: id,
      seat: "upper",
      xy: p[id],
      z: upperSeatZ(id),
      bossRadius: bossRadius(id) * 0.88,
    });
  }
  bearings.push({
    id: "bearing:balance:upper",
    element: "balanceCock",
    pivot: "balance",
    seat: "upper",
    xy: p.balance,
    z: upperSeatZ("balance"),
    bossRadius: bossRadius("balance") * 0.9,
  });

  const loci: Locus[] = [
    ...bearings.map((b) => ({
      id: b.id,
      kind: "bearing" as const,
      pivot: b.pivot,
      element: b.element,
      xy: b.xy,
      z: b.z,
    })),
    ...Object.values(anchors).map((a) => ({
      id: a.id,
      kind: "anchorage" as const,
      element: a.element,
      xy: a.xy,
      z: a.bridgeMidZ,
    })),
  ];

  return {
    outer,
    inner,
    elements: SUPPORT_MAP,
    bearings,
    anchors,
    loci,
  };
}

export function validateFootAuthority(
  plan: StructuralPlan,
  rendered: { id: string; xy: Vec2 }[],
): { id: string; delta: number }[] {
  return rendered.map((r) => {
    const a = plan.anchors[r.id];
    const delta = a ? Math.hypot(a.xy.x - r.xy.x, a.xy.y - r.xy.y) : Infinity;
    return { id: r.id, delta };
  });
}

/** @deprecated Use createStructuralPlan().loci */
export function buildLoci(layout: Layout): Locus[] {
  return createStructuralPlan(layout).loci;
}
