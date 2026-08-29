/**
 * Phase 3B display-stack packaging constants.
 * Conservative watch-like millimetres. Phase 4B consumes the frozen coaxial
 * envelopes below; they remain packaging authority, not tolerance claims.
 */

export const DISP = {
  jewelToInterface: 0.16,
  interfaceBaseThick: 0.12,
  interfaceBaseOuterExtra: 0.08,

  minutePipeInner: 0.1,
  minutePipeOuter: 0.2,
  pipeRadialGap: 0.04,
  hourPipeWall: 0.26,

  chapterAboveFrontClear: 0.08,
  chapterThick: 0.16,
  chapterToHourGap: 0.12,
  hourSweepThick: 0.18,
  hourToMinuteGap: 0.14,
  minuteSweepThick: 0.16,

  chapterCavityClearance: 0.42,
  chapterBand: 1.18,
  sweepTipClearance: 0.24,
  /** Packaging maximum: both hands may reach the chapter-limited disk. Not a finished-hand length ratio. */
  hourReachFactor: 1,
} as const;

export const DISP_SECONDS: "deferred" = "deferred";
