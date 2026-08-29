import * as THREE from "three";
import { STRAP } from "./strapSpec";

export type StrapMaterials = {
  rubber: THREE.MeshPhysicalMaterial;
  rubberEdge: THREE.MeshPhysicalMaterial;
  bar: THREE.MeshPhysicalMaterial;
  buckle: THREE.MeshPhysicalMaterial;
  idHorn: THREE.MeshBasicMaterial;
  idBar: THREE.MeshBasicMaterial;
  idHead: THREE.MeshBasicMaterial;
  idFree: THREE.MeshBasicMaterial;
  idBuckle: THREE.MeshBasicMaterial;
};

function grain(size = 256): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n1 = Math.sin(x * 0.41) * Math.sin(y * 0.17);
        const hash = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        const speck = hash - Math.floor(hash) - 0.5;
        const v = 148 + n1 * 6 + speck * 8;
        const i = (y * size + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

export function createStrapMaterials(): StrapMaterials {
  const map = grain();
  return {
    rubber: new THREE.MeshPhysicalMaterial({
      color: STRAP.rubberColor,
      metalness: 0.02,
      roughness: STRAP.rubberRough,
      roughnessMap: map,
      sheen: 0.02,
      sheenColor: STRAP.rubberSheen,
      sheenRoughness: 0.62,
      clearcoat: 0.06,
      clearcoatRoughness: 0.5,
      envMapIntensity: 0.48,
    }),
    rubberEdge: new THREE.MeshPhysicalMaterial({
      color: STRAP.edgeColor,
      metalness: 0.03,
      roughness: 0.56,
      roughnessMap: map,
      sheen: 0.12,
      sheenColor: STRAP.rubberSheen,
      envMapIntensity: 0.42,
    }),
    bar: new THREE.MeshPhysicalMaterial({
      color: STRAP.barColor,
      metalness: 0.94,
      roughness: STRAP.barRough,
      envMapIntensity: 0.78,
    }),
    buckle: new THREE.MeshPhysicalMaterial({
      color: STRAP.buckleColor,
      metalness: 0.92,
      roughness: STRAP.buckleRough,
      envMapIntensity: 0.74,
    }),
    idHorn: new THREE.MeshBasicMaterial({ color: 0xe67e22 }),
    idBar: new THREE.MeshBasicMaterial({ color: 0xf4d03f }),
    idHead: new THREE.MeshBasicMaterial({ color: 0xe74c3c }),
    idFree: new THREE.MeshBasicMaterial({ color: 0x1abc9c }),
    idBuckle: new THREE.MeshBasicMaterial({ color: 0xbdc3c7 }),
  };
}
