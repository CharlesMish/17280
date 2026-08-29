import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export type ViewName = "threeQuarter" | "top" | "escape" | "profile" | "barrel";

export const VIEWS: Record<ViewName, { position: THREE.Vector3; target: THREE.Vector3 }> = {
  threeQuarter: {
    position: new THREE.Vector3(11.4, 8.2, 21.6),
    target: new THREE.Vector3(-1.2, 1.4, 1.15),
  },
  top: {
    position: new THREE.Vector3(-1.4, 1.0, 32),
    target: new THREE.Vector3(-1.4, 1.0, 0.6),
  },
  escape: {
    position: new THREE.Vector3(4.8, 6.4, 9.2),
    target: new THREE.Vector3(-1.4, 4.2, 2.2),
  },
  profile: {
    position: new THREE.Vector3(15.5, 1.0, 3.6),
    target: new THREE.Vector3(-1.2, 1.0, 1.2),
  },
  barrel: {
    position: new THREE.Vector3(-10.5, -8.2, 11),
    target: new THREE.Vector3(-5.2, -2.8, 0.45),
  },
};

export type Studio = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  applyView: (name: ViewName) => void;
};

export function createStudio(renderer: THREE.WebGLRenderer): Studio {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0c);

  const env = createStudioEnvironment(renderer);
  scene.environment = env;
  scene.environmentIntensity = 1.16;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.25, 160);
  camera.up.set(0, 1, 0);

  const hemi = new THREE.HemisphereLight(0xd5dbe6, 0x121214, 0.3);
  scene.add(hemi);

  const bounce = new THREE.DirectionalLight(0xf2efe8, 0.16);
  bounce.position.set(1, 3, 20);
  scene.add(bounce);

  const key = new THREE.DirectionalLight(0xfff4ea, 0.82);
  key.position.set(11, 16, 13);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xc8d2de, 0.24);
  fill.position.set(-14, 5, 8);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xe8eef6, 0.18);
  rim.position.set(-4, 9, -14);
  scene.add(rim);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 5;
  controls.maxDistance = 48;
  controls.maxPolarAngle = Math.PI * 0.9;
  controls.zoomSpeed = 0.7;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.32;
  controls.enablePan = true;

  const applyView = (name: ViewName): void => {
    const view = VIEWS[name];
    camera.position.copy(view.position);
    controls.target.copy(view.target);
    controls.update();
  };

  applyView("threeQuarter");

  return { scene, camera, controls, applyView };
}

/**
 * Intentionally mixed bright strips and black cards so polished bevels
 * get long highlights while satin faces keep dark structure.
 */
function createStudioEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x141418);

  const panel = (
    width: number,
    height: number,
    color: number,
    position: THREE.Vector3,
    lookAt: THREE.Vector3,
  ): void => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ color }),
    );
    mesh.position.copy(position);
    mesh.lookAt(lookAt);
    envScene.add(mesh);
  };

  const origin = new THREE.Vector3(0, 0, 0);
  panel(34, 14, 0xf6f3ec, new THREE.Vector3(0, 21, 10), origin);
  panel(3.4, 28, 0xffffff, new THREE.Vector3(17, 5, 11), origin);
  panel(2.2, 16, 0xe7edf4, new THREE.Vector3(-15, 7, 7), origin);
  panel(10, 5, 0xffe7c4, new THREE.Vector3(4, 1, 16), origin);
  panel(14, 9, 0xc5cad2, new THREE.Vector3(8, 6, 18), origin);
  panel(16, 12, 0x08080a, new THREE.Vector3(-12, 1, -14), origin);
  panel(14, 10, 0x0a0a0c, new THREE.Vector3(8, -15, 3), origin);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const { texture } = pmrem.fromScene(envScene, 0.04);
  pmrem.dispose();
  return texture;
}

export function resizeRenderer(
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const pixelRatio = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
