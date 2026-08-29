/**
 * Phase 3C functional enclosure constants.
 * Geometric packaging only. Not water-resistance, strength, or optical authority.
 */

export const ENC = {
  minFrontClearance: 0.28,
  frontSapphireMinThick: 0.8,
  frontSapphireMaxThick: 1.12,
  frontSeatWidth: 0.36,
  frontSeatInset: 0.1,
  frontGasket: 0.06,
  frontGasketWidth: 0.11,
  frontRegisterDepth: 0.16,
  frontCarrierAboveSeat: 0.38,
  frontProvisionalCap: 0.16,
  frontCapInset: 0.42,

  minRearClearance: 0.32,
  rearSapphireMinThick: 0.58,
  rearSapphireMaxThick: 0.76,
  rearSeatWidth: 0.34,
  rearExhibitionInset: 0.2,
  rearGasket: 0.06,
  rearGasketWidth: 0.1,
  rearProvisionalCap: 0.1,
  rearCapInset: 0.38,

  minResidualSeat: 0.22,
  fastenerReserveR: 0.11,
  fastenerKeep: 1.55,
} as const;
