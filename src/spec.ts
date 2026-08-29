import * as THREE from "three";

/**
 * Coordinate convention (watch space)
 * -----------------------------------
 * Units are millimetres.
 * XY is the movement plane.
 * +X = 3 o'clock, +Y = 12 o'clock, +Z = dial direction (assembly / depth).
 * The preferred camera view is from +Z, slightly toward +X/+Y.
 *
 * Going-train centers are placed by pitch-radius sums:
 *   distance(wheel, next pinion) = R_pitch(wheel) + R_pitch(pinion)
 * Adjacent arbors therefore mesh by construction. Do not place wheels by eye.
 */

export const MODULE = 0.145;

export const TEETH = {
  barrel: 80,
  centerPinion: 12,
  center: 64,
  thirdPinion: 10,
  third: 60,
  fourthPinion: 8,
  fourth: 56,
  escapePinion: 7,
  escape: 15,
} as const;

/** Escape uses a larger effective module so the club teeth read at macro scale. */
export const ESCAPE_PITCH_RADIUS = 2.22;

export const ANGLES = {
  barrel: deg(205),
  third: deg(32),
  fourthFromThird: deg(153.3475),
  escapeFromFourth: deg(203.7886),
  balanceFromEscape: deg(30.3983),
  palletFromEscape: deg(82.9015),
} as const;

export const ESCAPEMENT = {
  escapeToBalance: 5.85,
  escapeToPallet: 3.09732,
  palletStoneRadius: 1.866093306395,
  palletIncludedAngle: deg(144.366310317788),
  palletLockPhase: deg(8.5),
  activeContactSeedRadius: 2.915502824512,
  palletNeutralReference: ANGLES.palletFromEscape - Math.PI / 2,
  palletLowerBodyZ: { min: 1.98, max: 2.14 },
  palletStoneZ: { min: 2.0, max: 2.16 },
  palletForkZ: { min: 2.23, max: 2.29 },
  forkSlot: {
    seedRadialMin: 4.05,
    radialMin: 4.139419386772,
    radialMax: 4.47,
    width: 0.18,
  },
  rollerJewel: {
    radius: 0.07,
    height: 0.2,
    radialOffset: 0.52,
    worldCenterZ: 2.31,
    neutralAzimuth: deg(178.606514148051),
    seatDepth: 0.052,
  },
  balanceRimRadius: 4.05,
  balanceArmCount: 3,
  hairspringTurns: 8.6,
  hairspringInner: 0.46,
  hairspringOuter: 3.35,
  hairspringTube: 0.042,
} as const;

/** Mid-plane Z of each rotating member. */
export const DEPTH = {
  barrelWheel: 0.0,
  centerPinion: 0.0,
  centerWheel: 1.24,
  thirdPinion: 1.24,
  thirdWheel: 1.66,
  fourthPinion: 1.66,
  /** Bounded pre-5D repair: clears the barrel drum below and third pinion above. */
  fourthWheel: 1.003,
  /** Thick pinion face overlaps the lifted fourth wheel while clearing the center wheel. */
  escapePinion: 0.97,
  escapeWheel: 2.08,
  pallet: 2.08,
  roller: 2.42,
  balance: 2.72,
  hairspring: 3.08,
} as const;

/** Visual beat: readable, watch-like, not a physics simulation. */
export const MOTION = {
  beatHz: 2.4,
  balanceAmplitude: deg(132),
  palletAmplitude: deg(5.5),
  flipBlend: 0.14,
} as const;

export const THICK = {
  trainWheel: 0.145,
  fourthWheel: 0.1,
  barrelTeeth: 0.26,
  barrelDrum: 0.9,
  escape: 0.165,
  pallet: 0.28,
  balanceRim: 0.22,
  pinionFace: 0.3,
} as const;

/** Bearing/support authority remains on the accepted pre-repair arbor endpoints. */
export const FROZEN_ARBOR_WORLD_Z = {
  fourth: { min: 0.4 - 0.5, max: 1.66 + 0.48 },
  escape: { min: 0.4 - 0.48, max: 2.08 + 0.46 },
} as const;

export type PartName =
  | "barrel"
  | "center"
  | "third"
  | "fourth"
  | "escape"
  | "pallet"
  | "balance";

export type Vec2 = { x: number; y: number };

export type MeshPair = {
  from: PartName;
  to: PartName;
  fromRadius: number;
  toRadius: number;
};

export type Layout = {
  radii: {
    barrel: number;
    centerPinion: number;
    center: number;
    thirdPinion: number;
    third: number;
    fourthPinion: number;
    fourth: number;
    escapePinion: number;
    escape: number;
  };
  positions: Record<PartName, Vec2>;
  pairs: MeshPair[];
};

export function pitchRadius(teeth: number, module = MODULE): number {
  return (module * teeth) / 2;
}

export function deg(value: number): number {
  return (value * Math.PI) / 180;
}

export function polar(angle: number, radius: number): Vec2 {
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

export function addVec(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function computeLayout(): Layout {
  const radii = {
    barrel: pitchRadius(TEETH.barrel),
    centerPinion: pitchRadius(TEETH.centerPinion),
    center: pitchRadius(TEETH.center),
    thirdPinion: pitchRadius(TEETH.thirdPinion),
    third: pitchRadius(TEETH.third),
    fourthPinion: pitchRadius(TEETH.fourthPinion),
    fourth: pitchRadius(TEETH.fourth),
    escapePinion: pitchRadius(TEETH.escapePinion),
    escape: ESCAPE_PITCH_RADIUS,
  };

  const center = { x: 0, y: 0 };
  const barrel = polar(ANGLES.barrel, radii.barrel + radii.centerPinion);
  const third = polar(ANGLES.third, radii.center + radii.thirdPinion);
  const fourth = addVec(
    third,
    polar(ANGLES.fourthFromThird, radii.third + radii.fourthPinion),
  );
  const escape = addVec(
    fourth,
    polar(ANGLES.escapeFromFourth, radii.fourth + radii.escapePinion),
  );
  const balance = addVec(
    escape,
    polar(ANGLES.balanceFromEscape, ESCAPEMENT.escapeToBalance),
  );
  const palletDir = polar(ANGLES.palletFromEscape, 1);
  const pallet = addVec(escape, {
    x: palletDir.x * ESCAPEMENT.escapeToPallet,
    y: palletDir.y * ESCAPEMENT.escapeToPallet,
  });

  return {
    radii,
    positions: { barrel, center, third, fourth, escape, pallet, balance },
    pairs: [
      {
        from: "barrel",
        to: "center",
        fromRadius: radii.barrel,
        toRadius: radii.centerPinion,
      },
      {
        from: "center",
        to: "third",
        fromRadius: radii.center,
        toRadius: radii.thirdPinion,
      },
      {
        from: "third",
        to: "fourth",
        fromRadius: radii.third,
        toRadius: radii.fourthPinion,
      },
      {
        from: "fourth",
        to: "escape",
        fromRadius: radii.fourth,
        toRadius: radii.escapePinion,
      },
      {
        from: "escape",
        to: "pallet",
        fromRadius: radii.escape,
        toRadius: ESCAPEMENT.palletStoneRadius,
      },
      {
        from: "pallet",
        to: "balance",
        fromRadius: 1.35,
        toRadius: 1.05,
      },
    ],
  };
}

export function toVec3(p: Vec2, z = 0): THREE.Vector3 {
  return new THREE.Vector3(p.x, p.y, z);
}
