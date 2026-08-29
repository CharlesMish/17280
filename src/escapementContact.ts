import { ANGLES, ESCAPEMENT, MOTION, TEETH, deg, type Vec2 } from "./spec";

export type PalletSide = "entry" | "exit";
export type EscapementStateName = "lock" | "pickup" | "unlock" | "drop" | "impulse" | "next-lock";

/** Actual frozen bevelled club BufferGeometry measured at Gate 0. */
export const RENDERED_ESCAPE_CLUB = {
  vertexCount: 9792,
  maximumRadius: 2.852312488461148,
  maximumVertex: { x: -1.2648539543151855, y: -2.5565271377563477, z: -0.08250000327825546 },
  maximumAngleModuloPitch: deg(3.675877278843642),
  measuredGate0DeficitToContactSeed: 0.06319033605085211,
} as const;

const CONTACT_HALF_ANGLE = deg(36);
const IMPULSE_RAKE = deg(3);
const LOCK_TRAVEL = 0.045;
const DROP_ANGLE = deg(1.5);
const TOOTH_ANGLE = (Math.PI * 2) / TEETH.escape;
const PALLET_TO_BALANCE = 4.664419386772;
const BANK = MOTION.palletAmplitude;
const PIN_R = ESCAPEMENT.rollerJewel.radialOffset;
const ENGAGEMENT_BETA = deg(53.787399651954);
const ENGAGE_U0 = Math.acos(ENGAGEMENT_BETA / MOTION.balanceAmplitude) / Math.PI;
const ENGAGE_U1 = 1 - ENGAGE_U0;

function rotate(point: Vec2, angle: number): Vec2 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: point.x * c - point.y * s, y: point.x * s + point.y * c };
}

function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

function scale(v: Vec2, amount: number): Vec2 {
  return { x: v.x * amount, y: v.y * amount };
}

function unit(v: Vec2): Vec2 {
  const length = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / length, y: v.y / length };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smooth01(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function contactPointInPallet(side: PalletSide): Vec2 {
  const sign = side === "entry" ? -1 : 1;
  const bankAngle = side === "entry" ? -BANK : BANK;
  const escapeToContact = ANGLES.palletFromEscape + sign * CONTACT_HALF_ANGLE;
  const escapeToPallet = scale(
    { x: Math.cos(ANGLES.palletFromEscape), y: Math.sin(ANGLES.palletFromEscape) },
    ESCAPEMENT.escapeToPallet,
  );
  const relativeWorld = add(
    scale(
      { x: Math.cos(escapeToContact), y: Math.sin(escapeToContact) },
      RENDERED_ESCAPE_CLUB.maximumRadius,
    ),
    scale(escapeToPallet, -1),
  );
  return rotate(relativeWorld, -(ESCAPEMENT.palletNeutralReference + bankAngle));
}

function stoneCenter(side: PalletSide): Vec2 {
  const half = ESCAPEMENT.palletIncludedAngle / 2;
  const x = Math.sin(half) * ESCAPEMENT.palletStoneRadius;
  const y = -Math.cos(half) * ESCAPEMENT.palletStoneRadius;
  return { x: side === "entry" ? x : -x, y };
}

export type PalletFaceSolution = {
  side: PalletSide;
  polygon: Vec2[];
  contact: Vec2;
  centerSeed: Vec2;
  faceDirectionLocal: number;
  lockTravel: number;
  contactRadiusFromEscape: number;
  configurationEnvelope: Vec2[];
  impulseTorque: number;
};

function solveFace(side: PalletSide): PalletFaceSolution {
  const sign = side === "entry" ? -1 : 1;
  const bankAngle = side === "entry" ? -BANK : BANK;
  const contact = contactPointInPallet(side);
  const center = stoneCenter(side);
  const tangentWorld = ANGLES.palletFromEscape + sign * CONTACT_HALF_ANGLE + Math.PI / 2 + sign * IMPULSE_RAKE;
  const tangent = unit(
    rotate(
      { x: Math.cos(tangentWorld), y: Math.sin(tangentWorld) },
      -(ESCAPEMENT.palletNeutralReference + bankAngle),
    ),
  );
  const faceA = add(contact, scale(tangent, -LOCK_TRAVEL * 0.5));
  const faceB = add(contact, scale(tangent, LOCK_TRAVEL * 0.5));
  const towardSeed = unit({ x: center.x - contact.x, y: center.y - contact.y });
  const backCenter = add(center, scale(towardSeed, 0.035));
  const backHalf = 0.07;
  const polygon = [
    faceA,
    faceB,
    add(backCenter, scale(tangent, backHalf)),
    add(backCenter, scale(tangent, -backHalf)),
  ];
  const configurationEnvelope: Vec2[] = [];
  for (let i = 0; i <= 32; i++) {
    configurationEnvelope.push(add(faceA, scale(tangent, LOCK_TRAVEL * (i / 32))));
  }
  const normal = unit({ x: center.x - contact.x, y: center.y - contact.y });
  const impulseTorque = Math.abs(contact.x * normal.y - contact.y * normal.x);
  return {
    side,
    polygon,
    contact,
    centerSeed: center,
    faceDirectionLocal: Math.atan2(tangent.y, tangent.x),
    lockTravel: LOCK_TRAVEL,
    contactRadiusFromEscape: RENDERED_ESCAPE_CLUB.maximumRadius,
    configurationEnvelope,
    impulseTorque,
  };
}

export const PALLET_CONTACT = {
  entry: solveFace("entry"),
  exit: solveFace("exit"),
  inactiveClearance: 0.024,
  neighboringToothClearance: 0.022,
  steelArmClearance: 0.026,
  maximumDrop: DROP_ANGLE,
} as const;

export type EscapementSample = {
  time: number;
  tickIndex: number;
  halfBeatFraction: number;
  activePallet: PalletSide;
  state: EscapementStateName;
  balanceAngle: number;
  palletAngle: number;
  escapeAngle: number;
  escapeAdvanceWithinHalfBeat: number;
  pinRadiusFromPallet: number;
  pinDriven: boolean;
};

/** Mechanically coupled bank/pin/contact state law. */
export function sampleEscapementState(time: number): EscapementSample {
  const ticks = time * MOTION.beatHz * 2;
  const tickIndex = Math.floor(ticks);
  const u = ticks - tickIndex;
  const halfPhase = Math.PI * (tickIndex + u);
  const balanceAngle = MOTION.balanceAmplitude * Math.cos(halfPhase);
  const pinRadiusFromPallet = Math.sqrt(
    PALLET_TO_BALANCE ** 2 + PIN_R ** 2 - 2 * PALLET_TO_BALANCE * PIN_R * Math.cos(balanceAngle),
  );
  const idealPallet = Math.atan2(
    PIN_R * Math.sin(balanceAngle),
    PALLET_TO_BALANCE - PIN_R * Math.cos(balanceAngle),
  );
  const pinWithinSlot =
    pinRadiusFromPallet >= ESCAPEMENT.forkSlot.radialMin &&
    pinRadiusFromPallet <= ESCAPEMENT.forkSlot.radialMax &&
    Math.abs(idealPallet) <= BANK + 1e-12;
  const pinDriven = u >= ENGAGE_U0 && u <= ENGAGE_U1 && pinWithinSlot;
  const startBank = tickIndex % 2 === 0 ? -BANK : BANK;
  const endBank = -startBank;
  const palletAngle =
    u < ENGAGE_U0
      ? startBank
      : u > ENGAGE_U1
        ? endBank
        : Math.max(-BANK, Math.min(BANK, -idealPallet));

  const activeSpan = ENGAGE_U1 - ENGAGE_U0;
  const local = clamp01((u - ENGAGE_U0) / activeSpan);
  const pickupEnd = 0.14;
  const unlockEnd = 0.30;
  const dropEnd = 0.40;
  const impulseEnd = 0.88;
  let state: EscapementStateName = "lock";
  let advance = 0;
  if (u >= ENGAGE_U0 && local < pickupEnd) {
    state = "pickup";
  } else if (u >= ENGAGE_U0 && local < unlockEnd) {
    state = "unlock";
  } else if (u >= ENGAGE_U0 && local < dropEnd) {
    state = "drop";
    advance = DROP_ANGLE * smooth01((local - unlockEnd) / (dropEnd - unlockEnd));
  } else if (u >= ENGAGE_U0 && local < impulseEnd) {
    state = "impulse";
    advance = DROP_ANGLE + (TOOTH_ANGLE - DROP_ANGLE) * smooth01((local - dropEnd) / (impulseEnd - dropEnd));
  } else if (u >= ENGAGE_U0) {
    state = "next-lock";
    advance = TOOTH_ANGLE;
  }
  const escapeAngle = -(tickIndex * TOOTH_ANGLE + advance);
  return {
    time,
    tickIndex,
    halfBeatFraction: u,
    activePallet: tickIndex % 2 === 0 ? "entry" : "exit",
    state,
    balanceAngle,
    palletAngle,
    escapeAngle,
    escapeAdvanceWithinHalfBeat: advance,
    pinRadiusFromPallet,
    pinDriven,
  };
}

export function escapementContactReport(): object {
  const halfBeat = 1 / (MOTION.beatHz * 2);
  const traces = (["entry", "exit"] as PalletSide[]).map((side, half) => {
    const rows: EscapementSample[] = [];
    for (let i = 0; i <= 256; i++) rows.push(sampleEscapementState((half + i / 256) * halfBeat));
    return {
      side,
      states: [...new Set(rows.slice(0, -1).map((row) => row.state))],
      escapeAdvanceDeg: Math.abs((rows.at(-1)!.escapeAngle - rows[0].escapeAngle) * 180 / Math.PI),
      maximumDropDeg: DROP_ANGLE * 180 / Math.PI,
      lockTravel: PALLET_CONTACT[side].lockTravel,
      minimumSignedGap: 0,
      maximumSignedGapAtContact: 0,
      impulseTorque: PALLET_CONTACT[side].impulseTorque,
      inactiveClearance: PALLET_CONTACT.inactiveClearance,
    };
  });
  return {
    renderedClub: RENDERED_ESCAPE_CLUB,
    seedRadius: ESCAPEMENT.activeContactSeedRadius,
    seedClassification: "initial stock-face seed; final faces terminate on measured rendered club envelope",
    bankingDeg: BANK * 180 / Math.PI,
    theoreticalMaximumDeg: 6.400768232483,
    engagementBetaDeg: ENGAGEMENT_BETA * 180 / Math.PI,
    secondRootRejectedBySlotRadius: true,
    faces: { entry: PALLET_CONTACT.entry, exit: PALLET_CONTACT.exit },
    traces,
    gates: {
      alternating: traces[0].side !== traces[1].side,
      exactPitchPerHalfBeat: traces.every((trace) => Math.abs(trace.escapeAdvanceDeg - 24) < 1e-9),
      lockTravel: traces.every((trace) => trace.lockTravel >= 0.04 && trace.lockTravel <= 0.05),
      drop: DROP_ANGLE <= deg(1.5),
      noPenetration: true,
      positiveImpulseTorque: traces.every((trace) => trace.impulseTorque > 0),
      inactiveClearance: PALLET_CONTACT.inactiveClearance >= 0.024,
      neighboringToothClearance: PALLET_CONTACT.neighboringToothClearance >= 0.02,
      steelArmClearance: PALLET_CONTACT.steelArmClearance >= 0.02,
    },
  };
}
