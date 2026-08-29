import * as THREE from "three";
import type { ReadoutConceptId } from "./readoutSpec";

export type ReadoutMaterials = {
  hourFace: THREE.MeshPhysicalMaterial;
  hourEdge: THREE.MeshPhysicalMaterial;
  minuteFace: THREE.MeshPhysicalMaterial;
  minuteEdge: THREE.MeshPhysicalMaterial;
  hub: THREE.MeshPhysicalMaterial;
  hubPolish: THREE.MeshPhysicalMaterial;
  hubCap: THREE.MeshPhysicalMaterial;
  indexFace: THREE.MeshPhysicalMaterial;
  indexEdge: THREE.MeshPhysicalMaterial;
  cardinalFace: THREE.MeshPhysicalMaterial;
  cardinalEdge: THREE.MeshPhysicalMaterial;
  carrier: THREE.MeshPhysicalMaterial;
  carrierEdge: THREE.MeshPhysicalMaterial;
  attachment: THREE.MeshPhysicalMaterial;
  debugLine: THREE.LineBasicMaterial;
  debugFill: THREE.MeshBasicMaterial;
};

function metal(opts: THREE.MeshPhysicalMaterialParameters): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    metalness: 0.92,
    envMapIntensity: 1.08,
    ...opts,
  });
}

export function createReadoutMaterials(concept: ReadoutConceptId): ReadoutMaterials {
  if (concept === "open-lancet") {
    return {
      hourFace: metal({ color: 0xb08a48, roughness: 0.28 }),
      hourEdge: metal({ color: 0xd4b06a, roughness: 0.1 }),
      minuteFace: metal({ color: 0xc4a05a, roughness: 0.24 }),
      minuteEdge: metal({ color: 0xe0c47a, roughness: 0.09 }),
      hub: metal({ color: 0x9a8a6a, roughness: 0.22 }),
      hubPolish: metal({ color: 0xd0c4a4, roughness: 0.1 }),
      hubCap: metal({ color: 0x8a7048, roughness: 0.16 }),
      indexFace: metal({ color: 0x2c3036, roughness: 0.34 }),
      indexEdge: metal({ color: 0x6a7078, roughness: 0.12 }),
      cardinalFace: metal({ color: 0x32363c, roughness: 0.3 }),
      cardinalEdge: metal({ color: 0x8a9098, roughness: 0.1 }),
      carrier: metal({ color: 0x24282e, metalness: 0.7, roughness: 0.48 }),
      carrierEdge: metal({ color: 0x3a4048, metalness: 0.74, roughness: 0.3 }),
      attachment: metal({ color: 0x2a2e34, metalness: 0.68, roughness: 0.46 }),
      debugLine: new THREE.LineBasicMaterial({ color: 0x88d8ff }),
      debugFill: new THREE.MeshBasicMaterial({
        color: 0x44c8a0,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    };
  }
  if (concept === "facet-block") {
    return {
      hourFace: metal({ color: 0x2a3038, roughness: 0.22 }),
      hourEdge: metal({ color: 0x9aa4b0, roughness: 0.08 }),
      minuteFace: metal({ color: 0x323840, roughness: 0.2 }),
      minuteEdge: metal({ color: 0xb0b8c2, roughness: 0.08 }),
      hub: metal({ color: 0x6a727c, roughness: 0.2 }),
      hubPolish: metal({ color: 0xc4cad2, roughness: 0.09 }),
      hubCap: metal({ color: 0x3a424c, roughness: 0.16 }),
      indexFace: metal({ color: 0xc8ced6, roughness: 0.26 }),
      indexEdge: metal({ color: 0xe8ecf2, roughness: 0.08 }),
      cardinalFace: metal({ color: 0xd4dae2, roughness: 0.22 }),
      cardinalEdge: metal({ color: 0xf0f4f8, roughness: 0.07 }),
      carrier: metal({ color: 0x3a4048, metalness: 0.78, roughness: 0.4 }),
      carrierEdge: metal({ color: 0x5a626c, metalness: 0.82, roughness: 0.22 }),
      attachment: metal({ color: 0x343a42, metalness: 0.76, roughness: 0.42 }),
      debugLine: new THREE.LineBasicMaterial({ color: 0x88d8ff }),
      debugFill: new THREE.MeshBasicMaterial({
        color: 0x44c8a0,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    };
  }
  return {
    hourFace: metal({ color: 0x1c4e96, roughness: 0.16 }),
    hourEdge: metal({ color: 0x6aa4e6, roughness: 0.06 }),
    minuteFace: metal({ color: 0x2258a4, roughness: 0.14 }),
    minuteEdge: metal({ color: 0x7ab4f0, roughness: 0.06 }),
    hub: metal({ color: 0xa8aeb6, roughness: 0.18 }),
    hubPolish: metal({ color: 0xd6dbe2, roughness: 0.08 }),
    hubCap: metal({ color: 0x3a5a88, roughness: 0.14 }),
    indexFace: metal({ color: 0xd2d7de, roughness: 0.22 }),
    indexEdge: metal({ color: 0xf0f3f7, roughness: 0.07 }),
    cardinalFace: metal({ color: 0xe4e8ee, roughness: 0.16 }),
    cardinalEdge: metal({ color: 0xf7f9fc, roughness: 0.06 }),
    carrier: metal({ color: 0x262a30, metalness: 0.72, roughness: 0.46 }),
    carrierEdge: metal({ color: 0x3e444c, metalness: 0.76, roughness: 0.28 }),
    attachment: metal({ color: 0x2a2e34, metalness: 0.7, roughness: 0.44 }),
    debugLine: new THREE.LineBasicMaterial({ color: 0x88d8ff }),
    debugFill: new THREE.MeshBasicMaterial({
      color: 0x44c8a0,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  };
}
