/**
 * Phase 3D exterior architecture constants.
 * Styling only. Frozen 3A/3C numbers remain the engineering authority.
 */

/**
 * Phase 5B — exterior metal finishing. Geometry remains frozen.
 * Answers the 5A thesis ("warm mass, cool drawing, one blue") with a
 * quieter cool envelope. Gold stays inside the sapphire.
 */
export const EXT_FINISH = {
  thesis: "cool envelope, useful waist, inherited edge",
  answers: "warm mass, cool drawing, one blue",
  bezelColor: 0x9aa2aa,
  bezelRough: 0.24,
  midColor: 0x868e98,
  midRough: 0.28,
  waistColor: 0x5c646e,
  waistRough: 0.44,
  casebackColor: 0x7e868e,
  casebackRough: 0.3,
  polishColor: 0xb8c2cc,
  polishRough: 0.1,
  lugTopColor: 0x868e98,
  lugTopRough: 0.27,
  lugSideColor: 0x949ca4,
  lugSideRough: 0.18,
  lugTermColor: 0xb8c2cc,
  lugBoreColor: 0x4a525a,
  lugBoreRough: 0.5,
  crownColor: 0x868e98,
  crownRough: 0.26,
  crownShoulderColor: 0xa8b0b8,
  crownShoulderRough: 0.18,
  crownCapColor: 0xa8b0b8,
  crownCapRough: 0.22,
  fluteColor: 0x3e464e,
  fluteRough: 0.48,
  anisotropy: 0.36,
  brushMm: 2.6,
  sunburstMm: 9.2,
  circularMm: 6.4,
} as const;

export const EXT = {
  selectedConcept: "tensioned-cushion" as ExteriorConceptId,
  frontResidualKeep: 0.23,
  fastenerMarginKeep: 0.385,
  fastenerAccessR: 0.62,
  chamfer: 0.2,
  strapWidth: 18,
  springBarDiameter: 1.8,
  springBarReserveR: 1.02,
  hornRootThick: 2.42,
  hornTipThick: 1.48,
  hornSurround: 0.88,
  hornEmbed: 2.25,
  hornFreeLength: 4.45,
  crownBodyR: 2.62,
  crownFlutes: 18,
  crownProjection: 2.38,
  crownPocketDepth: 0.82,
  crownEngagement: 0.88,
} as const;

export type ExteriorConceptId = "tensioned-cushion" | "stepped-flank" | "soft-pillow";

export const EXT_VIEWS = [
  "extHero",
  "extFront",
  "extProduct",
  "extCrownProfile",
  "extOffside",
  "extWestOblique",
  "extRear",
  "extRearGrazing",
  "extProfile",
  "extUnderside",
  "extLugProduct",
  "extLugFinish",
  "extLugClosure",
  "extLugSpan",
  "extLugSection",
  "extLugRoot",
  "extLugRootSection",
  "extLugRootCut",
  "extLugTruth",
  "extLugSouth",
  "extCrownProduct",
  "extCrownUpper",
  "extCrownUnder",
  "extCrownRoot",
  "extCrownSection",
  "extCrownId",
  "extCrownIdUnder",
  "extCrownKeepout",
  "extCrownClearSection",
  "extCrownTruth",
  "extKernel",
  "extSeatMacro",
  "extWaist",
  "extFinishId",
] as const;

export type ExtViewName = (typeof EXT_VIEWS)[number];
