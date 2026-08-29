/**
 * Phase 4B driven-display authority.
 *
 * These dimensions are deliberately local to the late-authorized motion
 * works.  They do not alter the frozen going-train module, tooth counts,
 * pivots, or rates in spec.ts.
 */

export type DisplayDriveGearStyle = "wheel" | "pinion";

export type DisplayDriveGearSpec = {
  id: "cannonPinion" | "minuteWheel" | "minutePinion" | "hourWheel";
  teeth: number;
  module: number;
  style: DisplayDriveGearStyle;
  boreR: number;
  pitchR: number;
  rootR: number;
  outerR: number;
  z0: number;
  z1: number;
  localPhase: number;
};

export type DisplayDriveMeshSpec = {
  id: "minuteReduction" | "hourReduction";
  driver: DisplayDriveGearSpec["id"];
  driven: DisplayDriveGearSpec["id"];
  driverTeeth: number;
  drivenTeeth: number;
  module: number;
  driverPitchR: number;
  drivenPitchR: number;
  expectedCenterDistance: number;
  signedRatio: number;
};

const pitchR = (teeth: number, module: number): number => (teeth * module) / 2;

const radii = (
  teeth: number,
  module: number,
  style: DisplayDriveGearStyle,
): { pitchR: number; rootR: number; outerR: number } => {
  const pitch = pitchR(teeth, module);
  const addendum = module * (style === "pinion" ? 1.1 : 0.9);
  const dedendum = module * (style === "pinion" ? 1.25 : 1.12);
  return {
    pitchR: pitch,
    rootR: Math.max(pitch - dedendum, pitch * 0.52),
    outerR: pitch + addendum,
  };
};

const gear = (
  id: DisplayDriveGearSpec["id"],
  teeth: number,
  module: number,
  style: DisplayDriveGearStyle,
  boreR: number,
  z0: number,
  z1: number,
  localPhase: number,
): DisplayDriveGearSpec => ({
  id,
  teeth,
  module,
  style,
  boreR,
  ...radii(teeth, module, style),
  z0,
  z1,
  localPhase,
});

export const DISPLAY_DRIVE = {
  axis: { x: 0, y: 0 },
  offAxis: { x: 0, y: -0.52 },
  centerDistance: 0.52,

  lowerFace: { z0: 2.94, z1: 3.06 },
  upperFace: { z0: 3.16, z1: 3.28 },

  minuteTube: {
    innerR: 0.1,
    outerR: 0.14,
    z0: 2.884,
    z1: 4.8756,
  },
  minuteStem: {
    outerR: 0.11,
    z0: 4.8756,
    // The accepted slender minute blade is only about r=0.098 at its center.
    // Keep the visible r=0.11 stem below that blade, then hand off to the
    // smaller integral tenon rather than forcing the visible stem through it.
    z1: 5.0436,
  },
  minuteTenon: {
    outerR: 0.08,
    z0: 5.0436,
    z1: 5.1516,
  },
  minuteCouplingShoulder: {
    r: 0.14,
    z0: 2.884,
    z1: 2.96,
  },
  hourPipe: {
    innerR: 0.24,
    outerR: 0.3,
    z0: 3.16,
    z1: 4.7216,
  },
  // A short annular neck bridges the accepted pipe top to the already-frozen
  // hour collar. It overlaps both solids, remains inside the collar's radial
  // silhouette, and is not a claim of a hand-setting/slip interface.
  hourHubCoupling: {
    innerR: 0.18,
    shoulderOuterR: 0.3,
    neckOuterR: 0.22,
    z0: 4.7016,
    shoulderZ1: 4.7216,
    z1: 4.8,
  },
  staff: {
    lowerCouplingR: 0.052,
    lowerCouplingZ0: 1.82,
    lowerCouplingZ1: 1.94,
    journalR: 0.075,
    journalZ0: 1.9,
    journalZ1: 2.64,
    upperCoreR: 0.085,
    upperCoreZ0: 2.6,
    upperCoreZ1: 2.94,
    requiredStationaryBoreR: 0.082,
    existingJewelApertureR: 0.136,
  },
  compoundBearing: {
    studR: 0.02,
    gearBoreR: 0.026,
    sleeveOuterR: 0.04,
    footR: 0.04,
    footZ0: 2.864,
    footZ1: 2.93,
    studZ0: 2.884,
    studZ1: 3.32,
    capR: 0.046,
    capZ0: 3.292,
    capZ1: 3.316,
  },

  frozen: {
    minuteReserveInnerR: 0.1,
    minuteReserveOuterR: 0.2,
    minuteReserveZ0: 2.884,
    minuteReserveZ1: 5.0416,
    hourReserveInnerR: 0.24,
    hourReserveOuterR: 0.5,
    hourReserveZ0: 2.884,
    hourReserveZ1: 4.7216,
    interfaceOuterR: 0.58,
    interfaceTopZ: 2.884,
    nearestFrozenCentralTopZ: 2.814,
    chapterGeometryBottomZ: 4.4416,
    hourHandBottomZ: 4.7376,
    sapphireInnerZ: 6.0616,
    visibleMaxZ: 5.1996,
  },
} as const;

const lineToCompound = -Math.PI / 2;
const lineToCenter = lineToCompound + Math.PI;

export const DISPLAY_DRIVE_GEARS = {
  cannonPinion: gear(
    "cannonPinion",
    16,
    0.0216666666667,
    "pinion",
    DISPLAY_DRIVE.minuteTube.innerR,
    DISPLAY_DRIVE.lowerFace.z0,
    DISPLAY_DRIVE.lowerFace.z1,
    lineToCompound - Math.PI / 16,
  ),
  minuteWheel: gear(
    "minuteWheel",
    32,
    0.0216666666667,
    "wheel",
    DISPLAY_DRIVE.compoundBearing.gearBoreR,
    DISPLAY_DRIVE.lowerFace.z0,
    DISPLAY_DRIVE.lowerFace.z1,
    lineToCenter,
  ),
  minutePinion: gear(
    "minutePinion",
    8,
    0.0185714285714,
    "pinion",
    DISPLAY_DRIVE.compoundBearing.gearBoreR,
    DISPLAY_DRIVE.upperFace.z0,
    DISPLAY_DRIVE.upperFace.z1,
    lineToCenter - Math.PI / 8,
  ),
  hourWheel: gear(
    "hourWheel",
    48,
    0.0185714285714,
    "wheel",
    DISPLAY_DRIVE.hourPipe.innerR,
    DISPLAY_DRIVE.upperFace.z0,
    DISPLAY_DRIVE.upperFace.z1,
    lineToCompound,
  ),
} as const satisfies Record<DisplayDriveGearSpec["id"], DisplayDriveGearSpec>;

export const DISPLAY_DRIVE_MESHES = {
  minuteReduction: {
    id: "minuteReduction",
    driver: "cannonPinion",
    driven: "minuteWheel",
    driverTeeth: DISPLAY_DRIVE_GEARS.cannonPinion.teeth,
    drivenTeeth: DISPLAY_DRIVE_GEARS.minuteWheel.teeth,
    module: DISPLAY_DRIVE_GEARS.cannonPinion.module,
    driverPitchR: DISPLAY_DRIVE_GEARS.cannonPinion.pitchR,
    drivenPitchR: DISPLAY_DRIVE_GEARS.minuteWheel.pitchR,
    expectedCenterDistance: DISPLAY_DRIVE.centerDistance,
    signedRatio:
      -DISPLAY_DRIVE_GEARS.cannonPinion.teeth /
      DISPLAY_DRIVE_GEARS.minuteWheel.teeth,
  },
  hourReduction: {
    id: "hourReduction",
    driver: "minutePinion",
    driven: "hourWheel",
    driverTeeth: DISPLAY_DRIVE_GEARS.minutePinion.teeth,
    drivenTeeth: DISPLAY_DRIVE_GEARS.hourWheel.teeth,
    module: DISPLAY_DRIVE_GEARS.minutePinion.module,
    driverPitchR: DISPLAY_DRIVE_GEARS.minutePinion.pitchR,
    drivenPitchR: DISPLAY_DRIVE_GEARS.hourWheel.pitchR,
    expectedCenterDistance: DISPLAY_DRIVE.centerDistance,
    signedRatio:
      -DISPLAY_DRIVE_GEARS.minutePinion.teeth /
      DISPLAY_DRIVE_GEARS.hourWheel.teeth,
  },
} as const satisfies Record<DisplayDriveMeshSpec["id"], DisplayDriveMeshSpec>;

/** Derived for reporting only. Runtime code must walk both mesh rows. */
export const DISPLAY_DRIVE_NET_RATIO =
  DISPLAY_DRIVE_MESHES.minuteReduction.signedRatio *
  DISPLAY_DRIVE_MESHES.hourReduction.signedRatio;

export const DISPLAY_DRIVE_NOT_CLAIMED = [
  "hand-setting or setting clutch",
  "cannon-pinion slip torque",
  "winding or keyless works",
  "crown stem",
  "seconds display",
] as const;
