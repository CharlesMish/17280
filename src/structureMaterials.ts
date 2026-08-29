import * as THREE from "three";

export type StructureMaterials = {
  plateFace: THREE.MeshPhysicalMaterial;
  plateEdge: THREE.MeshPhysicalMaterial;
  bridgeFace: THREE.MeshPhysicalMaterial;
  bridgeEdge: THREE.MeshPhysicalMaterial;
  silhouette: THREE.MeshBasicMaterial;
  audit: THREE.MeshLambertMaterial;
};

export function createStructureMaterials(): StructureMaterials {
  return {
    plateFace: new THREE.MeshPhysicalMaterial({
      color: 0x3a3d44,
      metalness: 0.92,
      roughness: 0.38,
      envMapIntensity: 0.9,
    }),
    plateEdge: new THREE.MeshPhysicalMaterial({
      color: 0x6a7080,
      metalness: 1,
      roughness: 0.14,
      clearcoat: 0.25,
      clearcoatRoughness: 0.12,
      envMapIntensity: 1.1,
    }),
    bridgeFace: new THREE.MeshPhysicalMaterial({
      color: 0x4e545e,
      metalness: 0.94,
      roughness: 0.3,
      envMapIntensity: 0.95,
    }),
    bridgeEdge: new THREE.MeshPhysicalMaterial({
      color: 0x8b93a1,
      metalness: 1,
      roughness: 0.1,
      clearcoat: 0.35,
      clearcoatRoughness: 0.08,
      envMapIntensity: 1.15,
    }),
    silhouette: new THREE.MeshBasicMaterial({ color: 0x0b0b0d }),
    audit: new THREE.MeshLambertMaterial({ color: 0xc8ccd2 }),
  };
}
