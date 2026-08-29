/**
 * Phase 5C — wrist integration.
 * Additive. Frozen 5B exterior / 5A movement are not reopened.
 *
 * Thesis: "sculpted charcoal loop, inherited 18 mm."
 * A slim FKM strap is molded to the frozen horn gap and loops the
 * accepted spring-bar axis. Horns stay visible. No gold, no second blue.
 */

export const STRAP = {
  thesis: "sculpted charcoal loop, inherited 18 mm",
  answers: "cool envelope, useful waist, inherited edge",
  /** Lateral clearance from each inner horn face (mm). */
  hornGap: 0.28,
  /** Attachment width is frozen gap minus 2·hornGap. */
  headThick: 2.72,
  freeThick: 2.18,
  headLen: 7.2,
  /** How far the head reaches toward the case from the bar, before clearance. */
  headTowardCase: 1.52,
  seatClearance: 0.08,
  /** Reduced telescoping-tip radius on the 1.8 mm spring-bar barrel. */
  springBarPinRadius: 0.52,
  /** Bury each barrel-to-pin shoulder inside the molded head face (mm). */
  springBarShoulderCapture: 0.12,
  edgeR: 0.38,
  taperEndWidth: 15.4,
  freeLen: 68,
  /** Straight run after the bar before the wrist arc (mm). */
  straightLen: 9.5,
  /** Wrist-arc radius of the free strap in local YZ (mm). */
  arcR: 54,
  keeperS: [20, 31],
  buckleAt: 64,
  /** Product poses. Rotation about the frozen bar, radians, downward. */
  poseStraight: 0.04,
  poseNeutral: 0.18,
  poseBent: 0.5,
  rubberColor: 0x23262a,
  rubberRough: 0.56,
  rubberSheen: 0x2a3036,
  edgeColor: 0x14171b,
  barColor: 0x8a929c,
  barRough: 0.22,
  buckleColor: 0x868e98,
  buckleRough: 0.2,
} as const;

export const STRAP_VIEWS = [
  "strapHero",
  "strapFront",
  "strapProduct",
  "strapCrown",
  "strapWest",
  "strapProfile",
  "strapRear",
  "strapUnderside",
  "strapMacro",
  "strapId",
  "strapBent",
] as const;

export type StrapViewName = (typeof STRAP_VIEWS)[number];
export type StrapPoseName = "straight" | "neutral" | "bent";
