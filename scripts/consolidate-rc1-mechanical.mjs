import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = process.argv[2] || "captures/rc1/mechanical/consolidated-train-matrix.json";

const refs = {
  gate0Runtime: "captures/post5d-newer-827-followup/runtime-regression.json",
  finalRuntime: "captures/rc1/mechanical/a2-runtime-regression.json",
  escapePalletSweep: "captures/rc1/mechanical/a2-escape-pallet-sweep-report.json",
  pairReports: {
    "barrel80-center12": "captures/rc1/mechanical/a1-barrel80-center12-mesh-report.json",
    "center64-third10": "captures/rc1/mechanical/center64-third10-mesh-report.json",
    "third60-fourth8": "captures/rc1/mechanical/third60-fourth8-mesh-report.json",
    "fourth56-escape7": "captures/rc1/mechanical/a2-fourth56-escape7-mesh-report.json",
  },
};

const absolute = (file) => path.resolve(ROOT, file);
const read = (file) => JSON.parse(fs.readFileSync(absolute(file), "utf8"));
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(absolute(file))).digest("hex");
const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
};
const shaNode = (value) => crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
const sourceHash = (file) => shaFile(file);

const gate0 = read(refs.gate0Runtime);
const finalRuntime = read(refs.finalRuntime);
const palletSweep = read(refs.escapePalletSweep);
const pairReports = Object.fromEntries(Object.entries(refs.pairReports).map(([id, file]) => [id, read(file)]));

const currentSourceHashes = {
  movement: sourceHash("src/movement.ts"),
  geometry: sourceHash("src/geometry.ts"),
  spec: sourceHash("src/spec.ts"),
  escapementContact: sourceHash("src/escapementContact.ts"),
};

const pairRows = Object.entries(pairReports).map(([id, report]) => {
  const result = report.result;
  const refined = report.localRefinement;
  const sourceExact = report.sourceHashes?.movement === currentSourceHashes.movement
    && report.sourceHashes?.geometry === currentSourceHashes.geometry
    && report.sourceHashes?.spec === currentSourceHashes.spec;
  const accepted = report.pairId === id
    && result?.sampleCount >= 8193
    && result?.collisionSamples === 0
    && result?.maximumIntersectionAreaMm2 === 0
    && result?.minimumPositiveClearanceMm > 0
    && refined?.sampleCount >= 2049
    && refined?.collisionSamples === 0
    && refined?.maximumIntersectionAreaMm2 === 0
    && refined?.minimumPositiveClearanceMm > 0
    && report.geometry?.axialOverlapMm > 0
    && Math.abs(report.geometry.centerDistanceMm - report.geometry.requiredPitchSumMm) <= 1e-9
    && report.invariance?.moduleMm === 0.145
    && sourceExact;
  return {
    pairId: id,
    accepted,
    report: { path: refs.pairReports[id], sha256: shaFile(refs.pairReports[id]) },
    primary: report.participants?.primary?.name,
    secondary: report.participants?.secondary?.name,
    toothCounts: report.invariance?.toothCounts,
    moduleMm: report.invariance?.moduleMm,
    ratio: report.invariance?.ratio,
    axes: report.invariance?.axes,
    centerDistanceMm: report.geometry?.centerDistanceMm,
    requiredPitchSumMm: report.geometry?.requiredPitchSumMm,
    axialOverlapMm: report.geometry?.axialOverlapMm,
    sampleCount: result?.sampleCount,
    collisionSamples: result?.collisionSamples,
    maximumIntersectionAreaMm2: result?.maximumIntersectionAreaMm2,
    minimumPositiveClearanceMm: result?.minimumPositiveClearanceMm,
    localRefinement: refined && {
      sampleCount: refined.sampleCount,
      collisionSamples: refined.collisionSamples,
      maximumIntersectionAreaMm2: refined.maximumIntersectionAreaMm2,
      minimumPositiveClearanceMm: refined.minimumPositiveClearanceMm,
      rangeDeg: refined.rangeDeg,
    },
    localClockingDeg: {
      primary: report.geometry?.profile?.primaryLocalClockingDeg,
      secondary: report.geometry?.profile?.secondaryLocalClockingDeg,
    },
    radialEnvelope: report.geometry?.radialEnvelope,
    sourceHashes: report.sourceHashes,
    sourceExact,
  };
});

const gate0Contact = gate0.escapement?.contact;
const finalContact = finalRuntime.escapement?.contact;
const contactLaw = {
  accepted: shaNode(gate0Contact) === shaNode(finalContact),
  gate0: {
    runtime: { path: refs.gate0Runtime, sha256: shaFile(refs.gate0Runtime) },
    canonicalContactSha256: shaNode(gate0Contact),
  },
  final: {
    runtime: { path: refs.finalRuntime, sha256: shaFile(refs.finalRuntime) },
    canonicalContactSha256: shaNode(finalContact),
  },
  renderedClub: finalContact?.renderedClub,
  tracesExact: shaNode(gate0Contact?.traces) === shaNode(finalContact?.traces),
  facesExact: shaNode(gate0Contact?.faces) === shaNode(finalContact?.faces),
};

const foreignKey = (row) => `${row.a}\u241f${row.b}`;
const gate0Foreign = new Map((gate0.escapement?.generalForeignSolids || []).map((row) => [foreignKey(row), row]));
const finalForeign = new Map((finalRuntime.escapement?.generalForeignSolids || []).map((row) => [foreignKey(row), row]));
const foreignRows = [...gate0Foreign.entries()].map(([key, before]) => {
  const after = finalForeign.get(key);
  const deltaMm = after ? after.minimumClearance - before.minimumClearance : null;
  return {
    a: before.a,
    b: before.b,
    gateMm: before.gate,
    gate0MinimumClearanceMm: before.minimumClearance,
    finalMinimumClearanceMm: after?.minimumClearance ?? null,
    deltaMm,
    accepted: Boolean(after?.accepted)
      && after.minimumClearance >= after.gate
      && deltaMm >= -1e-12,
  };
});
const foreignSolidRegression = {
  accepted: foreignRows.length === gate0Foreign.size
    && finalForeign.size === gate0Foreign.size
    && foreignRows.every((row) => row.accepted),
  gate0: {
    runtime: { path: refs.gate0Runtime, sha256: shaFile(refs.gate0Runtime) },
    canonicalForeignSolidsSha256: shaNode(gate0.escapement?.generalForeignSolids),
  },
  final: {
    runtime: { path: refs.finalRuntime, sha256: shaFile(refs.finalRuntime) },
    canonicalForeignSolidsSha256: shaNode(finalRuntime.escapement?.generalForeignSolids),
  },
  rows: foreignRows,
};

const escapePalletSweep = {
  accepted: palletSweep.accepted === true
    && palletSweep.sampleCount >= 2049
    && palletSweep.postRepair?.every((row) => row.collisionSamples === 0 && row.maximumPairOverlapArea === 0)
    && palletSweep.invariance?.rubyFacesExact === true
    && palletSweep.invariance?.contactSequenceExact === true,
  report: { path: refs.escapePalletSweep, sha256: shaFile(refs.escapePalletSweep) },
  sampleCount: palletSweep.sampleCount,
  collisionSamples: Object.fromEntries((palletSweep.postRepair || []).map((row) => [row.name, row.collisionSamples])),
  rubyFacesHash: palletSweep.invariance?.rubyFacesHash,
  contactSequenceHash: palletSweep.invariance?.contactSequenceHash,
};

const goingTrain = {
  accepted: shaNode(gate0.goingTrain) === shaNode(finalRuntime.goingTrain),
  gate0Sha256: shaNode(gate0.goingTrain),
  finalSha256: shaNode(finalRuntime.goingTrain),
};
const packageZ = {
  gate0: {
    top: gate0.authority?.enclosure?.package?.accMidcaseTop,
    bottom: gate0.authority?.enclosure?.package?.accMidcaseBottom,
  },
  final: {
    top: finalRuntime.authority?.enclosure?.package?.accMidcaseTop,
    bottom: finalRuntime.authority?.enclosure?.package?.accMidcaseBottom,
  },
};
packageZ.accepted = packageZ.gate0.top === packageZ.final.top && packageZ.gate0.bottom === packageZ.final.bottom;

const a2 = pairRows.find((row) => row.pairId === "fourth56-escape7");
const escapePhaseSeparation = {
  accepted: Math.abs((a2?.localClockingDeg.secondary ?? NaN) - 17.785714285714285) <= 1e-12
    && contactLaw.accepted
    && goingTrain.accepted,
  pinionLocalClockingDeg: a2?.localClockingDeg.secondary,
  scope: "escape:pinion local rendered clocking only",
  escapeClubMotion: "unchanged; independently owned by escape:motion plus the frozen club index",
  evidence: {
    contactLawExact: contactLaw.accepted,
    goingTrainExact: goingTrain.accepted,
  },
};

const report = {
  schema: "rc1-consolidated-going-train-mechanical-v1",
  accepted: pairRows.length === 4
    && pairRows.every((row) => row.accepted)
    && contactLaw.accepted
    && foreignSolidRegression.accepted
    && escapePalletSweep.accepted
    && goingTrain.accepted
    && packageZ.accepted
    && escapePhaseSeparation.accepted,
  disposition: "RC1 mechanical closure: all four rendered going-train meshes clear; escapement contact law, motion, package, and foreign-solid gates preserved",
  policy: "Nominal analytic pitch/root/tip radii stay frozen. Pair-specific prismatic tooth slabs remove only legacy expanding-bevel rendered excess; no rendered radial growth is permitted.",
  pairRows,
  escapement: {
    contactLaw,
    escapePalletSweep,
    escapePhaseSeparation,
  },
  regressions: {
    goingTrain,
    packageZ,
    foreignSolidRegression,
  },
  sourceHashes: currentSourceHashes,
};

fs.mkdirSync(path.dirname(absolute(OUT)), { recursive: true });
fs.writeFileSync(absolute(OUT), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ out: OUT, accepted: report.accepted, pairs: pairRows.map(({ pairId, accepted, collisionSamples }) => ({ pairId, accepted, collisionSamples })) }, null, 2));
