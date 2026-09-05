import * as THREE from "three";
import { createCenterWebExperiment } from "./centerWebExperiment";
import type { MaterialSet } from "./materials";
import { createMovement, type AnimatedPart, type Movement } from "./movement";

export const GOING_TRAIN_PART_NAMES = ["barrel", "center", "third", "fourth", "escape"] as const;
export type GoingTrainPartName = (typeof GOING_TRAIN_PART_NAMES)[number];
export type GoingTrainCore = {
  root: THREE.Group;
  parts: Record<GoingTrainPartName, AnimatedPart>;
};

/** Detach the five arbors; the original Movement still drives their motion pivots. */
export function extractGoingTrainCore(movement: Movement): GoingTrainCore {
  const root = new THREE.Group();
  root.name = "going-train-core-center-web-preview";
  const parts = Object.fromEntries(GOING_TRAIN_PART_NAMES.map((name) => {
    const part = movement.parts[name];
    root.add(part.pose);
    return [name, part];
  })) as Record<GoingTrainPartName, AnimatedPart>;
  return { root, parts };
}

/** Explicit opt-in constructor: changed center web, with the original pivot interface. */
export function createGoingTrainPreview(materials: MaterialSet) {
  const movement = createMovement(materials);
  const experiment = createCenterWebExperiment(movement.root);
  experiment.apply(true);
  movement.update(0);
  const core = extractGoingTrainCore(movement);
  return { movement, core, experiment };
}
