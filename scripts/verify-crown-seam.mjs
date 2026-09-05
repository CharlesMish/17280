import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as THREE from "three";
import ts from "typescript";

// Run the real crown-body construction twice: once as authored, and once with
// only the marked normal repair removed. No browser or saved capture is needed.
// Usage: node scripts/verify-crown-seam.mjs [report.json]
const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.resolve(process.argv[2] ?? path.join(root, "captures/crown-seam-verification.json"));
const readSource = (name) => {
  const text = fs.readFileSync(path.join(root, "src", name), "utf8");
  return ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
};
const exterior = readSource("exteriorGeometry.ts");
const plan = readSource("exteriorPlan.ts");
const spec = readSource("exteriorSpec.ts");
const geometry = readSource("geometry.ts");
const getFunction = (source, name) => {
  const result = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert(result?.body, `Missing ${name} function`);
  return result;
};
const declares = (node, name) => ts.isVariableStatement(node)
  && node.declarationList.declarations.some((declaration) => declaration.name.getText() === name);
const js = (source) => ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None });

// The only fixed input is the case-seat X location in the current 17280 plan.
// Body dimensions and relative offsets come from the checked-in plan/spec.
// Translating this location changes mesh placement, not the local lathe shape.
const caseX = 13.196762287513566;
const extDeclaration = spec.statements.find((node) => declares(node, "EXT"))?.declarationList.declarations[0];
assert(extDeclaration?.initializer, "Missing exterior specification");
const EXT = new Function(js(`const result = ${extDeclaration.initializer.getText(spec)}; return result;`))();
const planReturn = getFunction(plan, "createExteriorPlan").body.statements.find((node) => ts.isReturnStatement(node));
assert(planReturn?.expression && ts.isObjectLiteralExpression(planReturn.expression), "Missing exterior plan return");
const crownProperty = planReturn.expression.properties.find((node) => node.name?.getText(plan) === "crown");
assert(crownProperty && ts.isPropertyAssignment(crownProperty)
  && ts.isObjectLiteralExpression(crownProperty.initializer), "Missing crown plan");
const crownFields = ["bodyR", "neckR", "neckX0", "bodyX0", "bodyX1"];
const fieldSource = crownFields.map((name) => {
  const field = crownProperty.initializer.properties.find((node) => node.name?.getText(plan) === name);
  assert(field && ts.isPropertyAssignment(field), `Missing crown field ${name}`);
  return `${name}: ${field.initializer.getText(plan)}`;
}).join(",\n");
const c = new Function("EXT", "caseX", js(`return { ${fieldSource} };`))(EXT, caseX);

const crown = getFunction(exterior, "buildCrown");
const bodyStart = crown.body.statements.find((node) => declares(node, "bodySegments"));
const bodyEnd = crown.body.statements.find((node) => declares(node, "body"));
assert(bodyStart && bodyEnd, "Missing crown-body construction boundaries");
const construction = exterior.text.slice(bodyStart.getStart(exterior), bodyEnd.getStart(exterior));
const repairPattern = /\/\/ Crown seam repair start\.[\s\S]*?\/\/ Crown seam repair end\./g;
assert.equal([...construction.matchAll(repairPattern)].length, 1, "Expected exactly one marked seam repair");
const baselineConstruction = construction.replace(repairPattern, "");
assert.notEqual(baselineConstruction, construction, "Baseline must exclude the repair");
const helpers = ["assignNormalGroups", "assignCrownBodyGroups"]
  .map((name) => getFunction(exterior, name).getText(exterior)).join("\n");
const tangentHelper = getFunction(geometry, "ensureTangents").getText(geometry).replace(/^export\s+/, "");
const construct = (bodySource) => new Function("THREE", "c", js(
  `${helpers}\n${tangentHelper}\n${bodySource}\nreturn { lathe, bodySegments, rows: pts.length };`,
))(THREE, c);
const before = construct(baselineConstruction);
const after = construct(construction);
const oldGeometry = before.lathe;
const newGeometry = after.lathe;
assert.equal(before.bodySegments, after.bodySegments);
assert.equal(before.rows, after.rows);
for (const name of ["position", "uv"]) {
  assert.deepEqual(newGeometry.getAttribute(name).array, oldGeometry.getAttribute(name).array, `${name} changed`);
}
assert.deepEqual(newGeometry.index.array, oldGeometry.index.array, "Triangle indices changed");
assert.deepEqual(newGeometry.groups, oldGeometry.groups, "Material groups changed");
assert.deepEqual(newGeometry.drawRange, oldGeometry.drawRange, "Draw range changed");
assert.deepEqual(newGeometry.parameters, oldGeometry.parameters, "Lathe parameters changed");
for (const mesh of [oldGeometry, newGeometry]) {
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
}
assert.deepEqual(newGeometry.boundingBox, oldGeometry.boundingBox, "Bounding box changed");
assert.deepEqual(newGeometry.boundingSphere, oldGeometry.boundingSphere, "Bounding sphere changed");

const oldNormals = oldGeometry.getAttribute("normal");
const normals = newGeometry.getAttribute("normal");
const positions = newGeometry.getAttribute("position");
const uvs = newGeometry.getAttribute("uv");
const tangents = newGeometry.getAttribute("tangent");
assert(tangents, "Crown tangents were not generated");
const vector = (attribute, index) => new THREE.Vector3().fromBufferAttribute(attribute, index);
const angleDegrees = (a, b) => a.angleTo(b) * 180 / Math.PI;
const seamVertices = new Set();
const pairs = [];
for (let row = 0; row < after.rows; row++) {
  const last = after.bodySegments * after.rows + row;
  seamVertices.add(row);
  seamVertices.add(last);
  assert(vector(positions, row).distanceTo(vector(positions, last)) < 1e-10, `Seam row ${row} is not coincident`);
  assert.equal(uvs.getX(row), 0, "First meridian U changed");
  assert.equal(uvs.getX(last), 1, "Last meridian U changed");
  assert.equal(uvs.getY(row), uvs.getY(last), "Seam V differs");
  assert.deepEqual(vector(normals, row), vector(normals, last), `Seam row ${row} normals differ`);
  pairs.push({
    row,
    vertices: [row, last],
    beforeAngleDegrees: angleDegrees(vector(oldNormals, row), vector(oldNormals, last)),
    // Equality above proves zero mismatch without acos floating-point noise.
    afterAngleDegrees: 0,
  });
}
const beforeMaxAngleDegrees = Math.max(...pairs.map((pair) => pair.beforeAngleDegrees));
assert(beforeMaxAngleDegrees > 1, "The pre-repair shading discontinuity was not reproduced");
let changedNormalVertices = 0;
let maxNormalLengthError = 0;
let maxTangentLengthError = 0;
let maxTangentNormalDot = 0;
for (let index = 0; index < normals.count; index++) {
  const normal = vector(normals, index);
  const tangent = vector(tangents, index);
  const previous = vector(oldNormals, index);
  if (!normal.equals(previous)) changedNormalVertices++;
  if (!seamVertices.has(index)) assert.deepEqual(normal, previous, `Non-seam normal ${index} changed`);
  assert([...normal.toArray(), ...tangent.toArray(), tangents.getW(index)].every(Number.isFinite), `Non-finite basis at ${index}`);
  assert(Math.abs(tangents.getW(index)) === 1, `Invalid tangent handedness at ${index}`);
  maxNormalLengthError = Math.max(maxNormalLengthError, Math.abs(normal.length() - 1));
  maxTangentLengthError = Math.max(maxTangentLengthError, Math.abs(tangent.length() - 1));
  maxTangentNormalDot = Math.max(maxTangentNormalDot, Math.abs(normal.dot(tangent)));
}
assert(changedNormalVertices > 0, "Repair changed no normals");
assert(maxNormalLengthError < 1e-6, "Normals are not unit length");
assert(maxTangentLengthError < 1e-6, "Tangents are not unit length");
assert(maxTangentNormalDot < 1e-6, "Tangents are not orthogonal to normals");
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const report = {
  passed: true,
  model: "17280",
  scope: "Crown-body lathe only; baseline removes only the marked meridian-normal repair from the same source.",
  excluded: "Cap, flutes, sockets, and materials are outside this construction; visual close-up/orbit review is separate.",
  inputs: { caseX, crown: c, dimensionsFrom: ["src/exteriorPlan.ts", "src/exteriorSpec.ts"] },
  source: { file: "src/exteriorGeometry.ts", sha256: sha256(exterior.text), constructionSha256: sha256(construction) },
  geometry: {
    radialSegments: after.bodySegments,
    profileRows: after.rows,
    vertices: positions.count,
    triangles: newGeometry.index.count / 3,
    bounds: { min: newGeometry.boundingBox.min.toArray(), max: newGeometry.boundingBox.max.toArray() },
    unchanged: ["positions", "UVs including U=0/1 seam", "indices", "material groups", "draw range", "lathe parameters", "bounds", "all non-seam normals"],
  },
  seam: { beforeMaxAngleDegrees, afterMaxAngleDegrees: 0, changedNormalVertices, pairs },
  basis: { maxNormalLengthError, maxTangentLengthError, maxTangentNormalDot, finite: true, handednessValid: true },
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Crown seam passed: ${beforeMaxAngleDegrees.toFixed(6)}° → 0° across ${pairs.length} pairs; ${changedNormalVertices} normals changed.`);
console.log(`Positions, UVs, indices, material groups, bounds, and non-seam normals are exact; tangent basis is valid.\n${output}`);
oldGeometry.dispose();
newGeometry.dispose();
