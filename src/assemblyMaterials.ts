import * as THREE from "three";

export type AssemblyMaterials = {
  ruby: THREE.MeshPhysicalMaterial;
  rubyCap: THREE.MeshPhysicalMaterial;
  setting: THREE.MeshPhysicalMaterial;
  chaton: THREE.MeshPhysicalMaterial;
  bushing: THREE.MeshPhysicalMaterial;
  screw: THREE.MeshPhysicalMaterial;
  screwEdge: THREE.MeshPhysicalMaterial;
  aperture: THREE.MeshBasicMaterial;
  audit: THREE.MeshLambertMaterial;
  silhouette: THREE.MeshBasicMaterial;
};

export function createAssemblyMaterials(): AssemblyMaterials {
  return {
    ruby: new THREE.MeshPhysicalMaterial({
      color: 0x7a2032,
      metalness: 0.04,
      roughness: 0.16,
      transmission: 0.14,
      thickness: 0.28,
      ior: 1.76,
      transparent: true,
      opacity: 0.94,
      envMapIntensity: 0.85,
    }),
    rubyCap: new THREE.MeshPhysicalMaterial({
      color: 0x6e1c2c,
      metalness: 0.04,
      roughness: 0.14,
      transmission: 0.22,
      thickness: 0.28,
      ior: 1.76,
      transparent: true,
      opacity: 0.95,
      envMapIntensity: 0.8,
    }),
    setting: new THREE.MeshPhysicalMaterial({
      color: 0xc5c9d0,
      metalness: 1,
      roughness: 0.2,
      envMapIntensity: 1.05,
    }),
    chaton: new THREE.MeshPhysicalMaterial({
      color: 0xb08a42,
      metalness: 0.94,
      roughness: 0.24,
      envMapIntensity: 1.0,
    }),
    bushing: new THREE.MeshPhysicalMaterial({
      color: 0x8a6736,
      metalness: 0.82,
      roughness: 0.32,
      envMapIntensity: 0.85,
    }),
    screw: new THREE.MeshPhysicalMaterial({
      color: 0x1a2744,
      metalness: 0.96,
      roughness: 0.24,
      envMapIntensity: 0.95,
    }),
    screwEdge: new THREE.MeshPhysicalMaterial({
      color: 0x42567a,
      metalness: 1,
      roughness: 0.12,
      envMapIntensity: 1.1,
    }),
    aperture: new THREE.MeshBasicMaterial({ color: 0x0c0d10 }),
    audit: new THREE.MeshLambertMaterial({ color: 0xd4c7b0 }),
    silhouette: new THREE.MeshBasicMaterial({ color: 0x0b0b0d }),
  };
}
