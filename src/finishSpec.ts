/**
 * Phase 5A — movement finishing / colour hierarchy.
 * Geometry remains frozen. This is surface language only.
 *
 * Thesis: "warm mass, cool drawing, one blue."
 * The gold barrel is the only warm body. Steel plate recedes;
 * steel bridges draw. Blued screws and the accepted blade-baton
 * hands share one cool accent. Rubies are the last small fire.
 */

export const FINISH = {
  thesis: "warm mass, cool drawing, one blue",
  plateColor: 0x2a2e34,
  plateRough: 0.52,
  plateEdgeColor: 0x8a929e,
  plateEdgeRough: 0.1,
  bridgeColor: 0x5a616c,
  bridgeRough: 0.34,
  cockColor: 0x646c78,
  cockRough: 0.3,
  bevelColor: 0xd0d5de,
  bevelRough: 0.055,
  wheelColor: 0x7a828c,
  wheelRough: 0.28,
  wheelEdgeColor: 0xc8ced6,
  barrelColor: 0xb8893a,
  barrelFaceColor: 0xc49642,
  barrelEdgeColor: 0xe0c078,
  barrelRough: 0.3,
  hairspringColor: 0x3a5878,
  screwColor: 0x163056,
  screwEdgeColor: 0x5a7aa0,
  rubyColor: 0x6e1226,
  rubyAtten: 0x8c1630,
  settingColor: 0xb8bec6,
  chatonColor: 0xa07a38,
  bushingColor: 0x7a5c30,
  balanceColor: 0x9aa0a8,
  anisotropy: 0.82,
  plateUvMm: 6.2,
  coteUvMm: 5.2,
  seatJoinNote: "geometry frozen; finish only",
} as const;

export const FINISH_VIEWS = [
  "finishHero",
  "finishTop",
  "finishGrazing",
  "finishRuby",
  "finishScrew",
  "finishBarrel",
  "finishBalance",
  "finishTruth",
  "finishUnderside",
  "finishUndersideOblique",
  "finishWedgeA",
  "finishWedgeB",
  "finishLowerFlank",
  "finishBench",
  "finishDir",
  "finishJointGraze1",
  "finishJointGraze2",
] as const;

export type FinishViewName = (typeof FINISH_VIEWS)[number];
