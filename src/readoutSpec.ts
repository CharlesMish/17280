/**
 * Phase 4B-ready visible two-hand display.
 * Preserves the frozen Phase-3B/4A silhouettes and planes while exposing
 * explicit mechanical mounts for the driven hour and minute owners.
 */

export type ReadoutConceptId = "blade-baton" | "open-lancet" | "facet-block";

export type ReadoutPoseId = "1010" | "1200" | "300" | "630" | "105" | "1155" | "840" | "945";

export type ReadoutViewName =
  | "readoutHero"
  | "readoutFront"
  | "readoutFrontHard"
  | "readoutFront840"
  | "readoutFront945"
  | "readoutThreeQuarter"
  | "readoutCrown"
  | "readoutProfile"
  | "readoutHubMacro"
  | "readoutChapterMacro"
  | "readoutSweep"
  | "readoutChapterContain"
  | "readoutSection"
  | "readoutSupport";

export const READOUT_VIEWS = [
  "readoutHero",
  "readoutFront",
  "readoutFrontHard",
  "readoutFront840",
  "readoutFront945",
  "readoutThreeQuarter",
  "readoutCrown",
  "readoutProfile",
  "readoutHubMacro",
  "readoutChapterMacro",
  "readoutSweep",
  "readoutChapterContain",
  "readoutSection",
  "readoutSupport",
] as const;

export const READOUT_PRODUCT_VIEWS = new Set<ReadoutViewName>([
  "readoutHero",
  "readoutFront",
  "readoutFrontHard",
  "readoutFront840",
  "readoutFront945",
  "readoutThreeQuarter",
  "readoutCrown",
  "readoutProfile",
  "readoutHubMacro",
  "readoutChapterMacro",
]);

export const READOUT_TRUTH_VIEWS = new Set<ReadoutViewName>([
  "readoutSweep",
  "readoutChapterContain",
  "readoutSection",
]);

/** Dedicated support inspection — not a packaging-ghost view. */
export const READOUT_SUPPORT_VIEW: ReadoutViewName = "readoutSupport";

export const READOUT_POSES: Record<ReadoutPoseId, { hours: number; minutes: number; label: string }> = {
  "1010": { hours: 10, minutes: 10, label: "10:10" },
  "1200": { hours: 12, minutes: 0, label: "12:00" },
  "300": { hours: 3, minutes: 0, label: "3:00" },
  "630": { hours: 6, minutes: 30, label: "6:30" },
  "105": { hours: 1, minutes: 5, label: "1:05 overlap" },
  "1155": { hours: 11, minutes: 55, label: "11:55 overlap" },
  "840": { hours: 8, minutes: 40, label: "8:40 long-radius" },
  "945": { hours: 9, minutes: 45, label: "9:45 long-radius" },
};

/** Forced poses apply only while that view is active. */
export const READOUT_VIEW_POSE: Partial<Record<ReadoutViewName, string>> = {
  readoutFrontHard: "105",
  readoutFront840: "840",
  readoutFront945: "945",
};

/** Shared metric authority. Concept styling may not change these. */
export const READOUT = {
  selectedConcept: "blade-baton" as ReadoutConceptId,
  defaultPose: "1010" as ReadoutPoseId,

  /** Radial gap from nearest marker inner tip to the minute tip. */
  minuteTipClearance: 0.36,
  /** Extra inset so the minute tip does not sit on the frozen sweep disk. */
  minuteSweepInset: 0.06,
  hourLengthRatio: 0.7,

  hourThick: 0.148,
  minuteThick: 0.118,
  hourZPad: 0.016,
  minuteZPad: 0.018,

  hourMaxWidth: 0.78,
  minuteMaxWidth: 0.34,
  hourTail: 0.8,
  minuteTail: 0.66,

  hubHourR: 0.5,
  /** Running clearance shared by the hour-hand mount bore and hour collar. */
  hubHourInnerR: 0.22,
  hubMinuteR: 0.255,
  hubCapR: 0.152,
  hubHourThick: 0.132,
  hubMinuteThick: 0.088,
  hubCapThick: 0.048,
  hubStemR: 0.11,

  carrierOuterInset: 0.14,
  carrierBand: 0.24,
  carrierThick: 0.1,

  markerThick: 0.12,
  markerInnerPad: 0.1,
  markerOuterPad: 0.16,
  cardinalWidth: 0.38,
  cardinal12Width: 0.52,
  subWidth: 0.2,
  subOuterExtra: 0.22,

  attachmentHalfW: 0.14,
  attachmentLen: 0.22,
  attachmentAngles: [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4],

  /** Flush radial meet against the frozen midcase cavity inner wall. No case cut. */
  supportOverlap: 0,
  supportHalfW: 0.15,

  seconds: "not-authorized" as const,
} as const;

export const READOUT_CONCEPTS: Record<
  ReadoutConceptId,
  { id: ReadoutConceptId; title: string; thesis: string; selected: boolean; rejectReason: string | null }
> = {
  "blade-baton": {
    id: "blade-baton",
    title: "Shouldered blade + cushion batons",
    thesis:
      "Solid hour blade and slender leaf-tipped minute sit on a vanishing cushion rail. Radial hour batons with cardinal emphasis. Blued hands / rhodium indices. Mass first, then openness.",
    selected: true,
    rejectReason: null,
  },
  "open-lancet": {
    id: "open-lancet",
    title: "Open lancet + applied pears",
    thesis:
      "Pierced lancet hour and open needle minute. Twelve pear appliques on isolated tabs, no continuous ring. Warmer metal against the gold barrel.",
    selected: false,
    rejectReason:
      "Openworked hands lose silhouette over the gold barrel and silver wheels; isolated pears read as jewellery rather than a time scale.",
  },
  "facet-block": {
    id: "facet-block",
    title: "Facet chevron + segmented rails",
    thesis:
      "Short architectural chevron hour and long facet-bar minute. Four contour-following cardinal rails plus eight subordinate blocks. Cool dark steel.",
    selected: false,
    rejectReason:
      "Chevron/bar pair reads as a graphic device more than a watch display; segmented rails compete with the cushion case rather than disappearing behind the indices.",
  },
};

export function hourRayAngle(n: number): number {
  return Math.PI / 2 - n * (Math.PI / 6);
}

/** Temporary product/audit override metadata; normal rotation is movement-driven. */
export function poseRotations(hours: number, minutes: number): { hourZ: number; minuteZ: number } {
  const h = ((hours % 12) + minutes / 60) * (Math.PI / 6);
  const m = (minutes / 60) * Math.PI * 2;
  return { hourZ: -h, minuteZ: -m };
}

export function parseReadoutPose(raw: string | null | undefined): { id: string; hours: number; minutes: number } {
  const fallback = READOUT_POSES[READOUT.defaultPose];
  if (!raw) return { id: READOUT.defaultPose, hours: fallback.hours, minutes: fallback.minutes };
  const key = raw.trim().toLowerCase();
  if (key === "overlap" || key === "hard") {
    const p = READOUT_POSES["105"];
    return { id: "105", hours: p.hours, minutes: p.minutes };
  }
  const named = READOUT_POSES[key as ReadoutPoseId];
  if (named) return { id: key, hours: named.hours, minutes: named.minutes };
  const colon = key.match(/^(\d{1,2}):(\d{1,2})$/);
  if (colon) {
    return { id: key, hours: Number(colon[1]) % 12, minutes: Math.min(59, Number(colon[2])) };
  }
  const digits = key.replace(/\D/g, "");
  if (digits.length === 4) {
    return { id: digits, hours: Number(digits.slice(0, 2)) % 12, minutes: Math.min(59, Number(digits.slice(2))) };
  }
  if (digits.length === 3) {
    return { id: digits, hours: Number(digits[0]) % 12, minutes: Math.min(59, Number(digits.slice(1))) };
  }
  return { id: READOUT.defaultPose, hours: fallback.hours, minutes: fallback.minutes };
}

export function parseReadoutConcept(raw: string | null | undefined): ReadoutConceptId {
  if (raw === "open-lancet" || raw === "facet-block" || raw === "blade-baton") return raw;
  return READOUT.selectedConcept;
}
