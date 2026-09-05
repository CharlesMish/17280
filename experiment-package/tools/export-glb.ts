import fs from "node:fs";
import crypto from "node:crypto";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import type { MaterialSet } from "../source/materials";
import { createGoingTrainPreview, GOING_TRAIN_PART_NAMES } from "../source/goingTrainPreview";

class NodeFileReader {
  result: string | ArrayBuffer | null = null;
  error: unknown = null;
  onloadend: ((event: { target: NodeFileReader }) => void) | null = null;

  readAsArrayBuffer(blob: Blob): void {
    blob.arrayBuffer()
      .then((result) => {
        this.result = result;
      })
      .catch((error) => {
        this.error = error;
      })
      .finally(() => this.onloadend?.({ target: this }));
  }

  readAsDataURL(blob: Blob): void {
    blob.arrayBuffer()
      .then((result) => {
        const mime = blob.type || "application/octet-stream";
        this.result = `data:${mime};base64,${Buffer.from(result).toString("base64")}`;
      })
      .catch((error) => {
        this.error = error;
      })
      .finally(() => this.onloadend?.({ target: this }));
  }
}

Object.assign(globalThis, { FileReader: NodeFileReader });

const metal = (color: number, roughness: number): THREE.MeshPhysicalMaterial =>
  new THREE.MeshPhysicalMaterial({ color, roughness, metalness: 1 });

// Geometry generation depends only on the MaterialSet slots, not the browser
// canvas textures used by the public renderer. Keep this preview GLB portable
// with texture-free materials; current browser material source is included too.
const createExportMaterials = (): MaterialSet => ({
  wheelFace: metal(0xc0c4cb, 0.34),
  wheelEdge: metal(0xdfe3e8, 0.1),
  escapeFace: metal(0xb2b7c0, 0.32),
  pinion: metal(0xd5dae0, 0.1),
  arbor: metal(0xe6e9ee, 0.07),
  barrelFace: metal(0xc09a52, 0.33),
  barrelEdge: metal(0xddc078, 0.14),
  barrel: metal(0xb8924c, 0.28),
  spring: metal(0xa47d38, 0.42),
  balanceFace: metal(0xccc2b0, 0.3),
  balanceEdge: metal(0xddd4c4, 0.12),
  balance: metal(0xc9bdaa, 0.2),
  hairspring: metal(0x8aa3bc, 0.12),
  screw: metal(0xb08d4c, 0.16),
  jewel: new THREE.MeshPhysicalMaterial({ color: 0x6e1028, roughness: 0.08 }),
  stone: new THREE.MeshPhysicalMaterial({ color: 0x8f1434, roughness: 0.07 }),
});

const output = process.argv[2];
const reportOutput = process.argv[3];
if (!output || !reportOutput) throw new Error("usage: export-glb <asset.glb> <report.json> <audited-center-geometry-sha256>");

const materials = createExportMaterials();
const { core, experiment } = createGoingTrainPreview(materials);
const centerWheel = core.root.getObjectByName("center:wheel");
if (!(centerWheel instanceof THREE.Mesh)) throw new Error("missing preview center wheel");
const candidateGeometrySha256 = crypto.createHash("sha256").update(JSON.stringify({
  positions: Array.from(centerWheel.geometry.getAttribute("position").array),
  index: centerWheel.geometry.index ? Array.from(centerWheel.geometry.index.array) : null,
})).digest("hex");
const expectedGeometrySha256 = process.argv[4];
if (!expectedGeometrySha256 || candidateGeometrySha256 !== expectedGeometrySha256) {
  throw new Error(`exported center geometry is not the audited candidate: ${candidateGeometrySha256}`);
}
const pivots = GOING_TRAIN_PART_NAMES.map(name => ({
  part: name,
  sourcePoseName: core.parts[name].pose.name,
  sourceMotionName: core.parts[name].motion.name,
  glbPoseName: core.parts[name].pose.name.replaceAll(":", "_"),
  glbMotionName: core.parts[name].motion.name.replaceAll(":", "_"),
  positionMm: core.parts[name].pose.position.toArray(),
  restMotionRadians: core.parts[name].motion.rotation.z,
}));

// Colons are meaningful in Three.js animation track paths and GLTFLoader
// strips them on import. Use stable DCC-friendly asset names while retaining
// the original names in the procedural source.
core.root.traverse((object) => {
  object.name = object.name.replaceAll(":", "_");
});

// glTF uses metres. The procedural source and authority reports use mm.
core.root.scale.setScalar(0.001);
core.root.userData = {
  package: "watch-going-train-core-center-web-preview",
  authority: "experimental preview; fresh evidence only; not RC1",
  experiment: "center-web",
  candidateGeometrySha256,
  sourceUnit: "millimetre",
  worldUnit: "metre",
  includedParts: [...GOING_TRAIN_PART_NAMES],
};
core.root.updateMatrixWorld(true);

let nodes = 0;
let meshes = 0;
let vertices = 0;
let triangles = 0;
core.root.traverse((object) => {
  nodes += 1;
  if (!(object instanceof THREE.Mesh)) return;
  meshes += 1;
  const position = object.geometry.getAttribute("position");
  vertices += position?.count ?? 0;
  triangles += object.geometry.index
    ? object.geometry.index.count / 3
    : (position?.count ?? 0) / 3;
});

const box = new THREE.Box3().setFromObject(core.root);
const exporter = new GLTFExporter();
const exported = await exporter.parseAsync(core.root, {
  binary: true,
  trs: true,
  onlyVisible: true,
  includeCustomExtensions: false,
});
if (!(exported instanceof ArrayBuffer)) throw new Error("GLTFExporter did not return binary output");

const buffer = Buffer.from(exported);
fs.writeFileSync(output, buffer);
fs.writeFileSync(reportOutput, `${JSON.stringify({
  schema: "watch.going-train-core-preview-asset.v1",
  experiment: "center-web",
  authority: "experimental preview; not RC1",
  candidateGeometrySha256,
  experimentReport: experiment.report(),
  pivots,
  accepted: true,
  poseTimeSeconds: 0,
  sourceUnit: "millimetre",
  assetWorldUnit: "metre",
  rootScale: 0.001,
  materialMode: "portable texture-free PBR; current browser material source is included separately",
  includedParts: [...GOING_TRAIN_PART_NAMES],
  nodes,
  meshes,
  vertices,
  triangles,
  boundsMetres: {
    min: box.min.toArray(),
    max: box.max.toArray(),
  },
  bytes: buffer.length,
  sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
}, null, 2)}\n`);
