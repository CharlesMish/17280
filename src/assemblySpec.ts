import type { Vec2 } from "./spec";
import {
  ESCAPE_FINGER_UNDERPASS,
  STRUCT,
  type Anchorage,
  type BearingSeat,
  type StructuralPlan,
} from "./structureSpec";

/**
 * Phase 2B assembly plan.
 * Frozen structural plan → assembly plan → geometry.
 * No independent XY reconstruction.
 */

export const ASM = {
  minBossMargin: 0.055,
  minFootMargin: 0.07,
  seatJoinOverlap: 0.008,
  jewelThick: 0.072,
  escapeJewelThick: 0.076,
  settingThick: 0.056,
  endstoneThick: 0.046,
  bushingThick: 0.1,
  retainerThick: 0.028,
  seatThick: 0.024,
  headThick: 0.068,
  shaftEmbed: 0.62,
} as const;

export type BearingKind = "hole-jewel" | "bushing";
export type SettingKind = "collar" | "chaton" | "none";
export type Importance = "utility" | "train" | "escapement" | "hero";

export type BearingAssemblySpec = {
  id: string;
  sourceId: string;
  pivot: BearingSeat["pivot"];
  side: "lower" | "upper";
  element: string;
  kind: BearingKind;
  setting: SettingKind;
  hasEndstone: boolean;
  hasRetainer: boolean;
  xy: Vec2;
  locusZ: number;
  bossRadius: number;
  jewelRadius: number;
  apertureRadius: number;
  settingRadius: number;
  endstoneRadius: number;
  retainerRadius: number;
  jewelThick: number;
  /** Jewel-bottom Z used by geometry. Upper: `seatFaceZ - seatJoinOverlap`. Lower: locus midplane. */
  contactZ: number;
  /** Frozen structural top plane for upper seats (`bridgeTopZ`). Null for lower: no exported surface. */
  seatFaceZ: number | null;
  jewelMidZ: number;
  settingMidZ: number;
  endstoneMidZ: number | null;
  retainerMidZ: number | null;
  slabBottom: number;
  slabTop: number;
  importance: Importance;
};

export type FastenerAssemblySpec = {
  id: string;
  sourceId: string;
  element: string;
  xy: Vec2;
  headRadius: number;
  seatRadius: number;
  shaftRadius: number;
  footRadius: number;
  slotAngle: number;
  bridgeTopZ: number;
  bridgeBottomZ: number;
  seatTopZ: number;
  headUndersideZ: number;
  headMidZ: number;
  shaftBottomZ: number;
};

export type AssemblyPlan = {
  bearings: BearingAssemblySpec[];
  fasteners: FastenerAssemblySpec[];
};

function angleOf(from: Vec2, to: Vec2): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

function slabFor(plan: StructuralPlan, element: string): { bottom: number; top: number; mid: number } {
  if (element === "mainplate") {
    return {
      bottom: STRUCT.plateBottom,
      top: STRUCT.plateTop,
      mid: (STRUCT.plateBottom + STRUCT.plateTop) / 2,
    };
  }
  const a = Object.values(plan.anchors).find((x) => x.element === element);
  if (!a) {
    throw new Error(`no frozen slab for element ${element}`);
  }
  return { bottom: a.bridgeBottomZ, top: a.bridgeTopZ, mid: a.bridgeMidZ };
}

function bearingBy(plan: StructuralPlan, pivot: BearingSeat["pivot"], side: "lower" | "upper"): BearingSeat {
  const b = plan.bearings.find((x) => x.pivot === pivot && x.seat === side);
  if (!b) throw new Error(`missing frozen bearing ${pivot}:${side}`);
  return b;
}

function classifyBearing(b: BearingSeat, plan: StructuralPlan): BearingAssemblySpec {
  const slab = slabFor(plan, b.element);
  const isBarrel = b.pivot === "barrel";
  const isBalance = b.pivot === "balance";
  const isEscape = b.pivot === "escape" || b.pivot === "pallet";
  const upper = b.seat === "upper";

  const kind: BearingKind = isBarrel ? "bushing" : "hole-jewel";
  const setting: SettingKind = isBalance && upper ? "chaton" : isBarrel ? "none" : "collar";
  const hasEndstone = isBalance;
  const hasRetainer = isBalance && upper;
  const importance: Importance = isBarrel
    ? "utility"
    : isBalance
      ? "hero"
      : isEscape
        ? "escapement"
        : "train";

  const jewelThick = isBarrel ? ASM.bushingThick : isEscape ? ASM.escapeJewelThick : ASM.jewelThick;
  const jewelHalf = jewelThick * 0.5;

  let jewelRadius: number;
  let apertureRadius: number;
  let settingRadius: number;
  let endstoneRadius: number;
  let retainerRadius: number;
  if (isBarrel) {
    jewelRadius = 0.4;
    apertureRadius = 0.18;
    settingRadius = 0.4;
    endstoneRadius = 0;
    retainerRadius = 0;
  } else if (isBalance && upper) {
    jewelRadius = 0.3;
    apertureRadius = 0.118;
    settingRadius = 0.42;
    endstoneRadius = 0.236;
    retainerRadius = 0.455;
  } else if (isBalance) {
    jewelRadius = 0.275;
    apertureRadius = 0.118;
    settingRadius = 0.355;
    endstoneRadius = 0.215;
    retainerRadius = 0;
  } else if (isEscape) {
    jewelRadius = 0.255;
    apertureRadius = 0.122;
    settingRadius = 0.33;
    endstoneRadius = 0;
    retainerRadius = 0;
  } else {
    jewelRadius = 0.248;
    apertureRadius = 0.136;
    settingRadius = 0.325;
    endstoneRadius = 0;
    retainerRadius = 0;
  }

  let contactZ: number;
  let jewelMidZ: number;
  let seatFaceZ: number | null;
  if (upper) {
    // Jewel bottom is 0.008 mm inside the frozen element top (intentional seating overlap).
    seatFaceZ = slab.top;
    contactZ = slab.top - ASM.seatJoinOverlap;
    jewelMidZ = contactZ + jewelHalf;
  } else {
    // Lower: only the frozen locus Z is authoritative. No exported boss-top seat plane.
    seatFaceZ = null;
    contactZ = b.z;
    jewelMidZ = b.z;
  }

  const settingMidZ = jewelMidZ;
  const endstoneMidZ = hasEndstone
    ? jewelMidZ + (upper ? jewelHalf + ASM.endstoneThick * 0.5 - ASM.seatJoinOverlap : -(jewelHalf + ASM.endstoneThick * 0.5 - ASM.seatJoinOverlap))
    : null;
  const retainerMidZ =
    hasRetainer && endstoneMidZ !== null ? endstoneMidZ + ASM.endstoneThick * 0.5 + ASM.retainerThick * 0.35 : null;

  return {
    id: `assembly:bearing:${b.pivot}:${b.seat}`,
    sourceId: b.id,
    pivot: b.pivot,
    side: b.seat,
    element: b.element,
    kind,
    setting,
    hasEndstone,
    hasRetainer,
    xy: b.xy,
    locusZ: b.z,
    bossRadius: b.bossRadius,
    jewelRadius,
    apertureRadius,
    settingRadius,
    endstoneRadius,
    retainerRadius,
    jewelThick,
    contactZ,
    seatFaceZ,
    jewelMidZ,
    settingMidZ,
    endstoneMidZ,
    retainerMidZ,
    slabBottom: slab.bottom,
    slabTop: slab.top,
    importance,
  };
}

function classifyFastener(a: Anchorage, plan: StructuralPlan): FastenerAssemblySpec {
  const trainA = plan.anchors["anchor:train:a"];
  const trainB = plan.anchors["anchor:train:b"];
  const cockA = plan.anchors["anchor:cock:a"];
  const cockB = plan.anchors["anchor:cock:b"];
  const third = bearingBy(plan, "third", "upper").xy;
  const fourth = bearingBy(plan, "fourth", "upper").xy;
  const escape = bearingBy(plan, "escape", "upper").xy;
  const pallet = bearingBy(plan, "pallet", "upper").xy;

  let slotAngle: number;
  if (a.id === "anchor:train:a") slotAngle = angleOf(trainA.xy, third);
  else if (a.id === "anchor:train:b") slotAngle = angleOf(trainB.xy, fourth);
  else if (a.id === "anchor:escape") {
    slotAngle = angleOf(a.xy, { x: (escape.x + pallet.x) * 0.5, y: (escape.y + pallet.y) * 0.5 });
  } else {
    slotAngle = angleOf(cockA.xy, cockB.xy);
  }

  const headRadius = a.element === "trainBridge" ? 0.2 : a.element === "escapeFinger" ? 0.175 : 0.168;
  const seatRadius = headRadius + 0.028;
  const shaftRadius = 0.08;
  // The escape anchorage remains at its frozen XY, but its local support ribbon
  // now passes beneath the balance rim. Recess the existing screw into that
  // underpass; every other fastener retains the original bridge-top stack.
  const seatTopZ =
    a.id === "anchor:escape"
      ? ESCAPE_FINGER_UNDERPASS.fastenerSeatTop
      : a.bridgeTopZ + ASM.seatThick;
  const headUndersideZ = seatTopZ;
  const headMidZ = headUndersideZ + ASM.headThick * 0.5;
  const shaftBottomZ = a.bridgeBottomZ - ASM.shaftEmbed;

  return {
    id: `assembly:anchor:${a.id.replace("anchor:", "")}:screw`,
    sourceId: a.id,
    element: a.element,
    xy: a.xy,
    headRadius,
    seatRadius,
    shaftRadius,
    footRadius: a.footRadius,
    slotAngle,
    bridgeTopZ: a.bridgeTopZ,
    bridgeBottomZ: a.bridgeBottomZ,
    seatTopZ,
    headUndersideZ,
    headMidZ,
    shaftBottomZ,
  };
}

export function validateAssemblyPlan(plan: AssemblyPlan, structure: StructuralPlan): string[] {
  const errors: string[] = [];
  if (plan.bearings.length !== 13) errors.push(`expected 13 bearings, got ${plan.bearings.length}`);
  if (plan.fasteners.length !== 6) errors.push(`expected 6 fasteners, got ${plan.fasteners.length}`);
  if (structure.bearings.length !== 13) errors.push(`frozen plan has ${structure.bearings.length} bearings`);
  if (Object.keys(structure.anchors).length !== 6) {
    errors.push(`frozen plan has ${Object.keys(structure.anchors).length} anchors`);
  }

  const sourceB = new Set(plan.bearings.map((b) => b.sourceId));
  const sourceA = new Set(plan.fasteners.map((f) => f.sourceId));
  if (sourceB.size !== plan.bearings.length) errors.push("duplicate bearing assignments");
  if (sourceA.size !== plan.fasteners.length) errors.push("duplicate fastener assignments");

  for (const b of structure.bearings) {
    if (!sourceB.has(b.id)) errors.push(`missing bearing ${b.id}`);
  }
  for (const id of Object.keys(structure.anchors)) {
    if (!sourceA.has(id)) errors.push(`missing anchor ${id}`);
  }
  for (const b of plan.bearings) {
    if (!structure.bearings.some((s) => s.id === b.sourceId)) errors.push(`invented bearing ${b.id}`);
    const margin = b.bossRadius - Math.max(b.settingRadius, b.retainerRadius, b.jewelRadius);
    if (margin < ASM.minBossMargin) errors.push(`${b.id} boss margin ${margin.toFixed(3)}`);
  }
  for (const f of plan.fasteners) {
    if (!structure.anchors[f.sourceId]) errors.push(`invented fastener ${f.id}`);
    const margin = f.footRadius - f.seatRadius;
    if (margin < ASM.minFootMargin) errors.push(`${f.id} foot margin ${margin.toFixed(3)}`);
  }
  return errors;
}

export function createAssemblyPlan(structure: StructuralPlan): AssemblyPlan {
  const bearings = structure.bearings.map((b) => classifyBearing(b, structure));
  const fasteners = Object.values(structure.anchors).map((a) => classifyFastener(a, structure));
  const errors = validateAssemblyPlan({ bearings, fasteners }, structure);
  if (errors.length) {
    throw new Error(`assembly plan invalid: ${errors.join("; ")}`);
  }
  return { bearings, fasteners };
}

export function validateAssemblyAlignment(
  plan: AssemblyPlan,
  rendered: { id: string; xy: Vec2 }[],
): { id: string; delta: number }[] {
  const byId = new Map(rendered.map((r) => [r.id, r.xy]));
  return [...plan.bearings, ...plan.fasteners].map((item) => {
    const xy = byId.get(item.id);
    const delta = xy ? Math.hypot(item.xy.x - xy.x, item.xy.y - xy.y) : Infinity;
    return { id: item.id, delta };
  });
}
