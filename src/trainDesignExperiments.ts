import * as THREE from "three";
import type { Movement } from "./movement";
import { createTrainBridgeStudyGeometry, type MovementStructure } from "./structure";
import { createCenterWebExperiment } from "./centerWebExperiment";

export const TRAIN_EXPERIMENTS = ["none", "train-bridge", "center-web"] as const;
export type TrainExperiment = typeof TRAIN_EXPERIMENTS[number];

/** Recover the frozen planar projection, including its existing texture phase. */
function preserveBridgeUv(source: THREE.BufferGeometry, target: THREE.BufferGeometry) {
  const p = source.getAttribute("position"), uv = source.getAttribute("uv");
  if (!p || !uv || p.count !== uv.count || p.count < 3) throw new Error("Bridge UV authority missing");
  const x = p.getX(0), y = p.getY(0);
  let b = 0, c = 0, distance = 0, determinant = 0;
  for (let i = 1; i < p.count; i++) {
    const d = (p.getX(i) - x) ** 2 + (p.getY(i) - y) ** 2;
    if (d > distance) { distance = d; b = i; }
  }
  const bx = p.getX(b) - x, by = p.getY(b) - y;
  for (let i = 1; i < p.count; i++) {
    const d = bx * (p.getY(i) - y) - by * (p.getX(i) - x);
    if (Math.abs(d) > Math.abs(determinant)) { determinant = d; c = i; }
  }
  if (Math.abs(determinant) < 1e-8) throw new Error("Bridge UV authority is degenerate");
  const cx = p.getX(c) - x, cy = p.getY(c) - y;
  const row = (axis: number) => {
    const v = uv.getComponent(0, axis);
    const d1 = uv.getComponent(b, axis) - v, d2 = uv.getComponent(c, axis) - v;
    const a = (d1 * cy - d2 * by) / determinant;
    const beta = (bx * d2 - cx * d1) / determinant;
    return [a, beta, v - a * x - beta * y] as const;
  };
  const projection = [row(0), row(1)] as const;
  const sample = (axis: number, x: number, y: number) =>
    projection[axis][0] * x + projection[axis][1] * y + projection[axis][2];
  let maximumAuthoredFitError = 0;
  for (let i = 0; i < p.count; i++) for (let axis = 0; axis < 2; axis++) {
    maximumAuthoredFitError = Math.max(maximumAuthoredFitError,
      Math.abs(sample(axis, p.getX(i), p.getY(i)) - uv.getComponent(i, axis)));
  }
  if (maximumAuthoredFitError > 1e-6) throw new Error("Bridge UV authority is not affine");
  const next = target.getAttribute("position"), values = new Float32Array(next.count * 2);
  for (let i = 0; i < next.count; i++) for (let axis = 0; axis < 2; axis++) {
    values[i * 2 + axis] = sample(axis, next.getX(i), next.getY(i));
  }
  target.setAttribute("uv", new THREE.BufferAttribute(values, 2));
  target.deleteAttribute("tangent");
  if (target.index) target.computeTangents();
  return { source: "frozen bridge affine UV projection", maximumAuthoredFitError, projection };
}

export function createTrainDesignExperiments(movement: Movement, structure: MovementStructure | null) {
  const center = createCenterWebExperiment(movement.root);
  const bridge = structure?.root.getObjectByName("struct:trainBridge:body") as THREE.Mesh | undefined;
  const originalBridge = bridge?.geometry;
  let candidateBridge: THREE.BufferGeometry | null = null;
  let bridgeUvProjection: ReturnType<typeof preserveBridgeUv> | null = null;
  let name: TrainExperiment = "none";
  const apply = (next: TrainExperiment) => {
    if (!TRAIN_EXPERIMENTS.includes(next)) throw new Error(`Unknown train experiment: ${next}`);
    if (next === "train-bridge" && (!structure || !bridge)) throw new Error("Train-bridge study requires structure");
    if (bridge && originalBridge) bridge.geometry = originalBridge;
    center.apply(false);
    if (next === "center-web") center.apply(true);
    if (next === "train-bridge" && structure && bridge) {
      if (!candidateBridge) {
        candidateBridge = createTrainBridgeStudyGeometry(movement.layout, structure.plan, structure.materials);
        bridgeUvProjection = preserveBridgeUv(originalBridge!, candidateBridge);
      }
      bridge.geometry = candidateBridge;
    }
    name = next;
  };
  return { apply, report: () => ({
    name,
    default: "none",
    comparisonBase: "graphite-finish",
    changedMeshes: name === "none" ? [] : [{ name: name === "train-bridge" ? "struct:trainBridge:body" : "center:wheel" }],
    centerWeb: center.report(),
    bridge: { maxAddedHalfWidth: 0.09, protectedBearingLandMargin: 0.32, boreAndStubUnionPreserved: true, uvProjection: bridgeUvProjection },
    geometryAuthority: "Page-initial variant; use fresh pages for exploded equivalence after diagnostic switching",
  }) };
}
