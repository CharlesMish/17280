/**
 * Phase 3A clearance budget.
 * Conservative watch-like millimetres. Not manufacturing-tolerance authority.
 */

export const ACC = {
  radialClearance: 0.48,
  radialContact: 0.04,
  frontMoveClear: 0.58,
  rearMoveClear: 0.44,
  dialStack: 1.42,
  enclosureClear: 0.28,
  frontClosureBand: 0.48,
  holderShelf: 0.34,
  holderLip: 0.26,
  holderLipWidth: 0.34,
  holderPadR: 0.92,
  holderAvoidAnchor: 1.4,
  wall: 1.18,
  frontStruct: 0.92,
  rearStruct: 0.86,
  corridorR: 0.52,
  corridorKeep: 0.88,
  crownHalfAngle: 0.48,
  lugReserve: 2.4,
} as const;

export const ACC_PHASES: { t: number; label: string }[] = [
  { t: 0, label: "esc-zero" },
  { t: 0.029, label: "esc-flip" },
  { t: 0.052, label: "balance-mid-a" },
  { t: 0.104, label: "esc-max" },
  { t: 0.156, label: "balance-mid-b" },
  { t: 0.208, label: "esc-tick" },
  { t: 0.26, label: "balance-mid-c" },
  { t: 0.312, label: "esc-max2" },
  { t: 0.364, label: "balance-mid-d" },
  { t: 1 / 2.4, label: "beat-period" },
];

export type BoxExtent = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  limit: Record<"minX" | "maxX" | "minY" | "maxY" | "minZ" | "maxZ", string>;
};

export type ContactPurpose = "radial" | "axial-up" | "axial-down" | "anti-rotation";

export type HolderContact = {
  id: string;
  source: string;
  xy: { x: number; y: number };
  normal: { x: number; y: number };
  area: number;
  purposes: ContactPurpose[];
  previousXy: { x: number; y: number };
  displacement: number;
  segment: { a: { x: number; y: number }; b: { x: number; y: number }; t: number; index: number };
};
