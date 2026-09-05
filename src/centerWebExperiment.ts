import * as THREE from "three";
import { createTrainWheel } from "./geometry";
import { MODULE, TEETH, THICK } from "./spec";

/** These dimensions belong to the accepted center wheel, not a new train layout. */
export const CENTER_WEB_EXPERIMENT = {
  mesh: "center:wheel",
  style: "tapered-five-spoke",
  spokes: 5,
  minimumSpokeWidthMm: 0.34,
  designedThroatWidthMm: 0.36,
  hubAttachmentWidthMm: 0.68,
  rimAttachmentWidthMm: 0.58,
  hubRadiusMm: 0.72,
  boreRadiusMm: 0.14,
  sweepRad: 0.055,
} as const;

function sameGeometry(a: THREE.BufferGeometry, b: THREE.BufferGeometry): boolean {
  const names = Object.keys(a.attributes).sort();
  if (names.join() !== Object.keys(b.attributes).sort().join()) return false;
  for (const name of names) {
    const aa = a.getAttribute(name);
    const bb = b.getAttribute(name);
    if (aa.itemSize !== bb.itemSize || aa.array.length !== bb.array.length) return false;
    for (let i = 0; i < aa.array.length; i++) if (aa.array[i] !== bb.array[i]) return false;
  }
  if (JSON.stringify(a.groups) !== JSON.stringify(b.groups)) return false;
  const ai = a.getIndex();
  const bi = b.getIndex();
  if (!ai || !bi) return ai === bi;
  if (ai.count !== bi.count) return false;
  for (let i = 0; i < ai.count; i++) if (ai.array[i] !== bi.array[i]) return false;
  return true;
}

function geometrySummary(geometry: THREE.BufferGeometry) {
  // A fast synchronous diagnostic fingerprint; the acceptance/export tooling
  // additionally binds exact position/index arrays with SHA-256.
  let hash = 0x811c9dc5;
  const mix = (array: ArrayBufferView) => {
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  };
  for (const name of Object.keys(geometry.attributes).sort()) mix(geometry.getAttribute(name).array);
  const index = geometry.getIndex();
  if (index) mix(index.array);
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const positions = geometry.getAttribute("position");
  return {
    geometryHash: { algorithm: "fnv1a32-attribute-bytes", value: hash.toString(16).padStart(8, "0") },
    vertices: positions.count,
    triangles: (index?.count ?? positions.count) / 3,
    boundsMm: { min: bounds.min.toArray(), max: bounds.max.toArray() },
  };
}

function extrusionShape(geometry: THREE.BufferGeometry): THREE.Shape {
  if (!(geometry instanceof THREE.ExtrudeGeometry)) throw new Error("center web requires the authored extrusion");
  const shape = geometry.parameters.shapes;
  if (!(shape instanceof THREE.Shape)) throw new Error("center web requires a single wheel shape");
  return shape;
}

/** Swap only center:wheel.geometry; the original object is retained for exact restoration. */
export function createCenterWebExperiment(root: THREE.Object3D) {
  const object = root.getObjectByName(CENTER_WEB_EXPERIMENT.mesh);
  if (!(object instanceof THREE.Mesh)) throw new Error("center:wheel missing from experiment root");
  const wheel = object;
  const baseline = wheel.geometry;
  const material = wheel.material;
  if (!Array.isArray(material) || material.length !== 2) throw new Error("center wheel face/edge material contract changed");
  const baselineShape = extrusionShape(baseline);
  if (baselineShape.holes.length !== 6) throw new Error("center wheel must have its bore and five windows");
  const options = {
    teeth: TEETH.center,
    module: MODULE,
    thickness: THICK.trainWheel,
    spokeCount: CENTER_WEB_EXPERIMENT.spokes,
    spokeWidth: CENTER_WEB_EXPERIMENT.minimumSpokeWidthMm,
    hubRadius: CENTER_WEB_EXPERIMENT.hubRadiusMm,
    bore: CENTER_WEB_EXPERIMENT.boreRadiusMm,
    face: material[0],
    edge: material[1],
    bevel: false,
    toothProfile: "involute" as const,
    meshBacklash: 0.02,
    renderedZInterval: { min: -0.0885000005364418, max: 0.056499991565942764 },
  };
  const reference = createTrainWheel(options).geometry;
  const sourceMatches = sameGeometry(baseline, reference);
  reference.dispose();
  if (!sourceMatches) throw new Error("center wheel changed since the frozen base; refusing to replace it");
  const candidate = createTrainWheel({ ...options, webStyle: CENTER_WEB_EXPERIMENT.style }).geometry;
  const candidateShape = extrusionShape(candidate);
  const points = (shape: THREE.Path) => JSON.stringify(shape.getPoints(8).map(p => p.toArray()));
  const contourPreserved = points(baselineShape) === points(candidateShape);
  const borePreserved = points(baselineShape.holes[0]) === points(candidateShape.holes[0]);
  const baselineSummary = geometrySummary(baseline);
  const candidateSummary = geometrySummary(candidate);
  const boundsPreserved = JSON.stringify(baselineSummary.boundsMm) === JSON.stringify(candidateSummary.boundsMm);
  if (!contourPreserved || !borePreserved || !boundsPreserved) {
    candidate.dispose();
    throw new Error("center web changed its protected tooth contour, bore, or Z slab");
  }
  const parent = wheel.parent;
  const initialPosition = wheel.position.clone();
  const initialQuaternion = wheel.quaternion.clone();
  const initialScale = wheel.scale.clone();
  let enabled = false;
  let disposed = false;
  const apply = (next: boolean) => {
    if (disposed) throw new Error("center web experiment is disposed");
    wheel.geometry = next ? candidate : baseline;
    enabled = next;
  };
  return {
    apply,
    report: () => ({
      id: "center-web",
      enabled,
      changedMesh: CENTER_WEB_EXPERIMENT.mesh,
      dimensions: CENTER_WEB_EXPERIMENT,
      baseline: baselineSummary,
      candidate: candidateSummary,
      active: enabled ? candidateSummary : baselineSummary,
      invariants: {
        frozenSourceMatched: sourceMatches,
        workingToothContourPreserved: contourPreserved,
        borePreserved,
        exactBoundsAndZSlabPreserved: boundsPreserved,
        materialIdentityPreserved: wheel.material === material,
        parentIdentityPreserved: wheel.parent === parent,
        localTransformPreserved: wheel.position.equals(initialPosition)
          && wheel.quaternion.equals(initialQuaternion) && wheel.scale.equals(initialScale),
        expectedGeometryAttached: wheel.geometry === (enabled ? candidate : baseline),
      },
    }),
    dispose: () => {
      if (disposed) return;
      wheel.geometry = baseline;
      enabled = false;
      candidate.dispose();
      disposed = true;
    },
  };
}
