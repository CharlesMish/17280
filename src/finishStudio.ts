import * as THREE from "three";

export type ToneName = "aces" | "agx" | "neutral";

export const TONE_OPS: Record<ToneName, THREE.ToneMapping> = {
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  neutral: THREE.NeutralToneMapping,
};

export const SHOWCASE_TONE: ToneName = "neutral";
export const SHOWCASE_EXPOSURE = 1.314;
export const ENGINEERING_5DB2_EXPOSURE = 1.12;
export const PRE5D_SHOWCASE_EXPOSURE = 1.08;
export const TRUTH_EXPOSURE = 1.05;

/** Three.js PMREM fromScene clips (and warns) above ~0.041 rad at the default 256 cube. */
const PMREM_FROM_SCENE_SIGMA_MAX = 0.04;

function bakeEnv(
  renderer: THREE.WebGLRenderer,
  build: (scene: THREE.Scene) => void,
  sigma = 0.035,
): THREE.Texture {
  const envScene = new THREE.Scene();
  build(envScene);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const { texture } = pmrem.fromScene(envScene, Math.min(sigma, PMREM_FROM_SCENE_SIGMA_MAX));
  pmrem.dispose();
  return texture;
}

function card(
  scene: THREE.Scene,
  w: number,
  h: number,
  color: number,
  pos: THREE.Vector3,
  look: THREE.Vector3,
): void {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ color }),
  );
  mesh.position.copy(pos);
  mesh.lookAt(look);
  scene.add(mesh);
}

/** Soft, honest lighting for material evaluation. */
export function createTruthEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  return bakeEnv(renderer, (s) => {
    s.background = new THREE.Color(0x8a8e94);
    const o = new THREE.Vector3(0, 0, 0);
    card(s, 40, 24, 0xe8eaee, new THREE.Vector3(0, 22, 8), o);
    card(s, 18, 22, 0xf2f4f6, new THREE.Vector3(18, 6, 10), o);
    card(s, 16, 18, 0xd8dce2, new THREE.Vector3(-16, 5, 8), o);
    card(s, 20, 12, 0xc8ccd2, new THREE.Vector3(0, -14, 6), o);
    card(s, 8, 20, 0xffffff, new THREE.Vector3(12, 8, 16), o);
    card(s, 22, 16, 0xe6e8ec, new THREE.Vector3(0, 2, -20), o);
  }, 0.04);
}

/** Showcase: dark space, soft fill, narrow highlight strips, black cards. */
export function createShowcaseEnvironment(
  renderer: THREE.WebGLRenderer,
  pre5dComparison = false,
): THREE.Texture {
  if (pre5dComparison) {
    return bakeEnv(renderer, (s) => {
      s.background = new THREE.Color(0x101114);
      const o = new THREE.Vector3(0, 0, 0);
      card(s, 42, 20, 0xf6f1e8, new THREE.Vector3(0, 18, 10), o);
      card(s, 3.0, 28, 0xffffff, new THREE.Vector3(15, 7, 11), o);
      card(s, 2.0, 20, 0xe8eef6, new THREE.Vector3(-15, 8, 7), o);
      card(s, 1.4, 14, 0xffffff, new THREE.Vector3(6, 12, 14), o);
      card(s, 8, 5, 0xffe2b8, new THREE.Vector3(-6, 2, 15), o);
      card(s, 14, 9, 0xd0d5dc, new THREE.Vector3(8, 4, 16), o);
      card(s, 18, 12, 0x070709, new THREE.Vector3(-11, 0, -13), o);
      card(s, 16, 10, 0x09090c, new THREE.Vector3(9, -14, 2), o);
      card(s, 10, 8, 0x121318, new THREE.Vector3(0, 8, -16), o);
    }, 0.032);
  }
  return bakeEnv(renderer, (s) => {
    s.background = new THREE.Color(0x17191d);
    const o = new THREE.Vector3(0, 0, 0);
    card(s, 42, 20, 0xe9e6df, new THREE.Vector3(0, 18, 10), o);
    card(s, 3.0, 28, 0xdfe6ed, new THREE.Vector3(15, 7, 11), o);
    card(s, 2.0, 20, 0xcbd3dc, new THREE.Vector3(-15, 8, 7), o);
    card(s, 1.4, 14, 0xdde3e8, new THREE.Vector3(6, 12, 14), o);
    card(s, 8, 5, 0xd6bea0, new THREE.Vector3(-6, 2, 15), o);
    card(s, 14, 9, 0xc4c9cf, new THREE.Vector3(8, 4, 16), o);
    card(s, 18, 12, 0x24262b, new THREE.Vector3(-11, 0, -13), o);
    card(s, 16, 10, 0x1d1f24, new THREE.Vector3(9, -14, 2), o);
    card(s, 10, 8, 0x252831, new THREE.Vector3(0, 8, -16), o);
  }, 0.04);
}

export function createShowcaseLights(pre5dComparison = false): THREE.Group {
  const g = new THREE.Group();
  g.name = "finish:showcaseLights";
  const hemi = new THREE.HemisphereLight(
    pre5dComparison ? 0xd7dde6 : 0xdde2e8,
    pre5dComparison ? 0x141418 : 0x292c32,
    pre5dComparison ? 0.38 : 0.61,
  );
  hemi.name = "finish:showcase:hemisphere";
  const key = new THREE.DirectionalLight(0xfff4ea, pre5dComparison ? 0.62 : 0.507);
  key.name = "finish:showcase:key";
  key.position.set(10, 14, 11);
  const fill = new THREE.DirectionalLight(pre5dComparison ? 0xc5d0dc : 0xcbd5df, pre5dComparison ? 0.2 : 0.514);
  fill.name = "finish:showcase:fill";
  fill.position.set(-12, 6, 7);
  const rim = new THREE.DirectionalLight(0xe8eef6, pre5dComparison ? 0.16 : 0.187);
  rim.name = "finish:showcase:rim";
  rim.position.set(-3, 8, -12);
  g.add(hemi, key, fill, rim);
  if (!pre5dComparison) {
    const under = new THREE.DirectionalLight(0xd6dbe2, 0.155);
    under.name = "finish:showcase:under";
    under.position.set(2, -6, -12);
    g.add(under);
  }
  return g;
}

export function createTruthLights(): THREE.Group {
  const g = new THREE.Group();
  g.name = "finish:truthLights";
  const hemi = new THREE.HemisphereLight(0xf0f2f4, 0x6a6e74, 0.7);
  const key = new THREE.DirectionalLight(0xffffff, 0.55);
  key.position.set(8, 10, 12);
  const fill = new THREE.DirectionalLight(0xffffff, 0.28);
  fill.position.set(-10, 4, 6);
  const under = new THREE.DirectionalLight(0xffffff, 0.5);
  under.position.set(3, -5, -14);
  g.add(hemi, key, fill, under);
  return g;
}

export function applyTone(renderer: THREE.WebGLRenderer, name: ToneName, exposure: number): void {
  renderer.toneMapping = TONE_OPS[name];
  renderer.toneMappingExposure = exposure;
}
