import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const evidence = path.join(root, "captures/phase5d-ab");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const hash = (data) => crypto.createHash("sha256").update(data).digest("hex");
const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
};
const canonical = (value) => JSON.stringify(stable(value));
const exact = (a, b) => canonical(a) === canonical(b);

const before = readJson(path.join(evidence, "before/report.json"));
const after = readJson(path.join(evidence, "after/report.json"));
const packageReference = readJson(
  path.join(root, "captures/pre5d-escapement-repair/current-runtime-package.json"),
);
const sourceReference = readJson(path.join(evidence, "pre-edit-source-manifest.json"));

const sourceFiles = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else sourceFiles.push(path.relative(root, full));
  }
};
walk(path.join(root, "src"));
sourceFiles.sort();
const currentSource = Object.fromEntries(
  sourceFiles.map((file) => {
    const data = fs.readFileSync(path.join(root, file));
    return [file, { bytes: data.byteLength, sha256: hash(data) }];
  }),
);
const changedSourceFiles = sourceFiles.filter(
  (file) => sourceReference.files[file]?.sha256 !== currentSource[file].sha256,
);
const addedOrRemovedSourceFiles = [
  ...sourceFiles.filter((file) => !sourceReference.files[file]),
  ...Object.keys(sourceReference.files).filter((file) => !currentSource[file]),
];
const allowedSourceFiles = [
  "src/enclosureGeometry.ts",
  "src/exteriorMaterials.ts",
  "src/finish.ts",
  "src/finishStudio.ts",
  "src/main.ts",
];

const images = [
  "front.png",
  "front-three-quarter.png",
  "opposite-three-quarter.png",
  "edge-profile.png",
  "sapphire-oblique.png",
  "balance-escapement-macro.png",
  "rear-exhibition.png",
];
const pngSize = (data) => ({ width: data.readUInt32BE(16), height: data.readUInt32BE(20) });
const imageRows = images.map((name) => {
  const beforeData = fs.readFileSync(path.join(evidence, "before", name));
  const afterData = fs.readFileSync(path.join(evidence, "after", name));
  return {
    name,
    beforeBytes: beforeData.byteLength,
    afterBytes: afterData.byteLength,
    beforeSha256: hash(beforeData),
    afterSha256: hash(afterData),
    dimensionsBefore: pngSize(beforeData),
    dimensionsAfter: pngSize(afterData),
    matchedCameraFrame: exact(pngSize(beforeData), pngSize(afterData)),
    pixelsChanged: hash(beforeData) !== hash(afterData),
  };
});

const packageActual = after.phase5d?.geometryAuthority?.packageSnapshot;
const packageRows = Object.keys(packageReference).map((name) => ({
  name,
  referenceSha256: hash(canonical(packageReference[name])),
  actualSha256: hash(canonical(packageActual?.[name])),
  exact: exact(packageReference[name], packageActual?.[name]),
}));
const phase4b = after.phase4b;
const escapement = after.escapement;
const gates = {
  buildPassed: fs.existsSync(path.join(evidence, "build-result.json"))
    ? readJson(path.join(evidence, "build-result.json")).passed === true
    : false,
  noBrowserErrors: (before.browserErrors?.length ?? -1) === 0 && (after.browserErrors?.length ?? -1) === 0,
  mechanicalReportsExact: exact(before.escapement, after.escapement) &&
    exact(before.phase4b, after.phase4b) && exact(before.goingTrain, after.goingTrain),
  authorityReportsExact: exact(before.authority, after.authority),
  frozenPackageExact: packageRows.every((row) => row.exact),
  sourceScopeBounded: addedOrRemovedSourceFiles.length === 0 &&
    exact(changedSourceFiles, allowedSourceFiles),
  escapementStillCertified: escapement?.accepted === true &&
    escapement?.disposition === "PRE-5D ESCAPEMENT REPAIR — CLOSED & MECHANICALLY CERTIFIED",
  phase4bStillAccepted: phase4b?.accepted === true &&
    Math.abs(phase4b?.sixtySecondProof?.minuteToCenter - 1) < 1e-12 &&
    Math.abs(phase4b?.sixtySecondProof?.hourToMinute - 1 / 12) < 1e-12 &&
    phase4b?.axis?.drift === 0 && phase4b?.centerPassage?.noStationaryIntersection === true,
  allEvidencePresent: imageRows.every((row) => row.beforeBytes > 0 && row.afterBytes > 0),
  matchedCaptureDimensions: imageRows.every((row) => row.matchedCameraFrame),
  visualDifferenceRecorded: imageRows.every((row) => row.pixelsChanged),
  sapphireOwnersReported: (after.phase5d?.sapphire?.owners?.length ?? 0) >= 4,
  renderHygieneAccepted: after.phase5d?.hygiene?.shadowsDisabledSoNoShadowAcnePath === true &&
    after.phase5d?.hygiene?.noSapphireDepthWrites === true &&
    after.phase5d?.hygiene?.noSapphirePolygonOffset === true &&
    after.phase5d?.hygiene?.screenDoorAlphaCoverageDisabled === true &&
    after.phase5d?.hygiene?.materialDitheringDisabled === true &&
    after.phase5d?.renderer?.transparentObjectSorting === true &&
    after.phase5d?.hygiene?.typographyOrBrandingStarted === false,
};
const passed = Object.values(gates).every(Boolean);
const report = {
  phase: "5D-A/B",
  disposition: passed ? "PHASE 5D-A/B — OPTICS & LIGHTING CLOSED" : "STOP — PRESENTATION BLOCKER",
  passed,
  gates,
  changedSourceFiles: changedSourceFiles.map((file) => ({
    file,
    before: sourceReference.files[file],
    after: currentSource[file],
  })),
  addedOrRemovedSourceFiles,
  packageRows,
  imageRows,
  presentation: after.phase5d,
};
fs.writeFileSync(path.join(evidence, "comparison-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(report.disposition);
for (const [gate, value] of Object.entries(gates)) console.log(`${value ? "PASS" : "FAIL"} ${gate}`);
if (!passed) process.exitCode = 1;
