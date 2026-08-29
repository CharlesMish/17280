import * as THREE from "three";
import type { MaterialSet } from "./materials";
import type { Movement } from "./movement";
import type { MovementStructure } from "./structure";
import type { MovementAssembly } from "./assembly";
import type { StructureMaterials } from "./structureMaterials";
import type { AssemblyMaterials } from "./assemblyMaterials";
import { createFinishMaterials, cloneWithRotation, type FinishMaterials } from "./finishMaterials";
import {
  applyTone,
  createShowcaseEnvironment,
  createShowcaseLights,
  createTruthEnvironment,
  createTruthLights,
  SHOWCASE_EXPOSURE,
  SHOWCASE_TONE,
  PRE5D_SHOWCASE_EXPOSURE,
  TRUTH_EXPOSURE,
  type ToneName,
} from "./finishStudio";
import { FINISH, type FinishViewName } from "./finishSpec";

export type { FinishViewName };

export const FINISH_CAMERAS: Record<
  FinishViewName,
  { position: THREE.Vector3; target: THREE.Vector3 }
> = {
  finishHero: {
    position: new THREE.Vector3(12.4, 9.0, 20.8),
    target: new THREE.Vector3(-1.4, 1.3, 1.1),
  },
  finishTop: {
    position: new THREE.Vector3(-1.5, 1.1, 34),
    target: new THREE.Vector3(-1.5, 1.1, 0.4),
  },
  finishGrazing: {
    position: new THREE.Vector3(11.5, 2.4, 3.2),
    target: new THREE.Vector3(2.4, 0.6, 2.3),
  },
  finishRuby: {
    position: new THREE.Vector3(-2.0, 8.2, 6.4),
    target: new THREE.Vector3(-3.36, 6.65, 3.58),
  },
  finishScrew: {
    position: new THREE.Vector3(11.2, 6.8, 4.8),
    target: new THREE.Vector3(9.24, 5.09, 2.56),
  },
  finishBarrel: {
    position: new THREE.Vector3(-9.6, -7.4, 8.4),
    target: new THREE.Vector3(-6.0, -2.8, 0.4),
  },
  finishBalance: {
    position: new THREE.Vector3(7.0, 12.0, 16.0),
    target: new THREE.Vector3(-1.45, 5.05, 2.25),
  },
  finishTruth: {
    position: new THREE.Vector3(13.0, 8.4, 18.5),
    target: new THREE.Vector3(-1.2, 1.4, 1.1),
  },
  finishUnderside: {
    position: new THREE.Vector3(-1.4, 1.0, -22),
    target: new THREE.Vector3(-1.4, 1.0, -0.6),
  },
  finishUndersideOblique: {
    position: new THREE.Vector3(14.5, -11.0, -12.5),
    target: new THREE.Vector3(0.2, 1.2, 0.1),
  },
  finishWedgeA: {
    position: new THREE.Vector3(6.8, -8.4, 4.2),
    target: new THREE.Vector3(-1.0, 0.4, 1.4),
  },
  finishWedgeB: {
    position: new THREE.Vector3(-8.5, -6.2, 5.8),
    target: new THREE.Vector3(-1.2, 0.8, 1.6),
  },
  finishLowerFlank: {
    position: new THREE.Vector3(17.5, 6.4, 1.6),
    target: new THREE.Vector3(0.4, 1.4, 0.25),
  },
  finishBench: {
    position: new THREE.Vector3(0, -11, 14),
    target: new THREE.Vector3(0, 0.4, 0.2),
  },
  finishDir: {
    position: new THREE.Vector3(8.0, 2.0, 14),
    target: new THREE.Vector3(2.2, 0.6, 1.6),
  },
  finishJointGraze1: {
    position: new THREE.Vector3(3.35, 2.55, 3.45),
    target: new THREE.Vector3(0.04, 0.04, 2.38),
  },
  finishJointGraze2: {
    position: new THREE.Vector3(5.15, -3.35, 2.15),
    target: new THREE.Vector3(0.85, -0.55, 2.38),
  },
};

export type FinishLayer = {
  materials: FinishMaterials;
  apply: () => void;
  revert: () => void;
  setStudio: (mode: "showcase" | "truth" | "off") => void;
  setTone: (name: ToneName, exposure: number) => void;
  setBench: (on: boolean) => void;
  setDirectionDebug: (on: boolean) => void;
  applied: () => boolean;
  report: () => {
    thesis: string;
    hierarchy: { ground: string; drawing: string; mass: string; accents: string };
    barrelJunction: string;
  };
};

type Assign = { mesh: THREE.Mesh; baseline: THREE.Material | THREE.Material[]; finish: THREE.Material | THREE.Material[] };

function ensureTangents(geo: THREE.BufferGeometry, force = false): void {
  if (force) geo.deleteAttribute("tangent");
  if (geo.getAttribute("tangent")) return;
  if (!geo.getAttribute("normal") || !geo.getAttribute("uv") || !geo.getIndex()) return;
  try {
    geo.computeTangents();
  } catch {
    /* some extrusions cannot form a tangent basis */
  }
}

function remapMesh(
  mesh: THREE.Mesh,
  table: Map<THREE.Material, THREE.Material>,
): THREE.Material | THREE.Material[] {
  const cur = mesh.material;
  if (Array.isArray(cur)) {
    return cur.map((m) => table.get(m) ?? m);
  }
  return table.get(cur) ?? cur;
}

function flowAngle(from: { x: number; y: number }, to: { x: number; y: number }): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

function directionMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: `
      attribute vec4 tangent;
      varying vec3 vT;
      void main() {
        vec3 t = tangent.xyz;
        if (length(t) < 0.01) t = vec3(1.0, 0.0, 0.0);
        vT = normalize((modelMatrix * vec4(t, 0.0)).xyz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vT;
      void main() {
        gl_FragColor = vec4(vT.xy * 0.5 + 0.5, 0.25, 1.0);
      }
    `,
  });
}

export function createFinishLayer(opts: {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  movement: Movement;
  materials: MaterialSet;
  structure: MovementStructure | null;
  structureMaterials: StructureMaterials | null;
  assembly: MovementAssembly | null;
  assemblyMaterials: AssemblyMaterials | null;
  pre5dComparison?: boolean;
}): FinishLayer {
  const finish = createFinishMaterials();
  const assignments: Assign[] = [];
  let applied = false;

  const baselineEnv = opts.scene.environment;
  const baselineEnvI = opts.scene.environmentIntensity;
  const baselineBg = opts.scene.background;
  const baselineTone = opts.renderer.toneMapping;
  const baselineExposure = opts.renderer.toneMappingExposure;
  const baselineLights: { light: THREE.Light; intensity: number }[] = [];
  opts.scene.children.forEach((c) => {
    if (c instanceof THREE.Light) baselineLights.push({ light: c, intensity: c.intensity });
  });

  const showcaseEnv = createShowcaseEnvironment(opts.renderer, opts.pre5dComparison);
  const truthEnv = createTruthEnvironment(opts.renderer);
  const showcaseLights = createShowcaseLights(opts.pre5dComparison);
  const truthLights = createTruthLights();
  showcaseLights.visible = false;
  truthLights.visible = false;
  opts.scene.add(showcaseLights, truthLights);

  const machineTable = new Map<THREE.Material, THREE.Material>([
    [opts.materials.wheelFace, finish.wheelFace],
    [opts.materials.wheelEdge, finish.wheelEdge],
    [opts.materials.escapeFace, finish.escapeFace],
    [opts.materials.pinion, finish.pinion],
    [opts.materials.arbor, finish.arbor],
    [opts.materials.barrelFace, finish.barrelFace],
    [opts.materials.barrelEdge, finish.barrelEdge],
    [opts.materials.barrel, finish.barrel],
    [opts.materials.spring, finish.spring],
    [opts.materials.balanceFace, finish.balanceFace],
    [opts.materials.balanceEdge, finish.balanceEdge],
    [opts.materials.balance, finish.balance],
    [opts.materials.hairspring, finish.hairspring],
    [opts.materials.screw, finish.screw],
    [opts.materials.jewel, finish.jewel],
    [opts.materials.stone, finish.stone],
  ]);

  const collect = (root: THREE.Object3D, table: Map<THREE.Material, THREE.Material>): void => {
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      ensureTangents(obj.geometry);
      const next = remapMesh(obj, table);
      assignments.push({ mesh: obj, baseline: obj.material, finish: next });
    });
  };

  collect(opts.movement.root, machineTable);

  if (opts.structure && opts.structureMaterials) {
    const sm = opts.structureMaterials;
    const structTable = new Map<THREE.Material, THREE.Material>([
      [sm.plateFace, finish.plateFace],
      [sm.plateEdge, finish.plateEdge],
      [sm.bridgeFace, finish.bridgeFace],
      [sm.bridgeEdge, finish.bridgeEdge],
    ]);
    collect(opts.structure.pose, structTable);
    applyPlateWorldUv(opts.structure.pose);

    const plan = opts.structure.plan;
    const third = plan.bearings.find((b) => b.pivot === "third" && b.seat === "upper");
    const fourth = plan.bearings.find((b) => b.pivot === "fourth" && b.seat === "upper");
    const escape = plan.bearings.find((b) => b.pivot === "escape" && b.seat === "upper");
    const pallet = plan.bearings.find((b) => b.pivot === "pallet" && b.seat === "upper");
    const balance = plan.bearings.find((b) => b.pivot === "balance" && b.seat === "upper");
    const heel = plan.anchors["anchor:cock:heel"];
    const escAnchor = plan.anchors["anchor:escape"];

    const trainFace = cloneWithRotation(
      finish.bridgeFace,
      third && fourth ? flowAngle(third.xy, fourth.xy) : 0,
    );
    const escapeFace = cloneWithRotation(
      finish.bridgeFace,
      escAnchor && escape && pallet
        ? flowAngle(escAnchor.xy, { x: (escape.xy.x + pallet.xy.x) * 0.5, y: (escape.xy.y + pallet.xy.y) * 0.5 })
        : 0,
    );
    const cockFace = cloneWithRotation(
      finish.cockFace,
      heel && balance ? flowAngle(heel.xy, balance.xy) : 0,
    );

    const patchGroup = (name: string, face: THREE.MeshPhysicalMaterial, angle: number): void => {
      const g = opts.structure?.pose.getObjectByName(name);
      if (!g) return;
      g.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const row = assignments.find((a) => a.mesh === obj);
        if (!row) return;
        const isLand = obj.name.startsWith("struct:boss:") || obj.name.startsWith("struct:foot:");
        if (isLand) {
          row.finish = [finish.bossFace, finish.bridgeEdge];
          return;
        }
        if (obj.name === "struct:trainBridge:centerSupport") {
          // This is a turned annular pendant, not a planar cotes face. Projecting
          // XY over the lathe collapses UV triangles and gives anisotropy an
          // invalid tangent basis around the center axis.
          row.finish = finish.bossFace;
          return;
        }
        applyDirectedUv(obj.geometry, angle, FINISH.coteUvMm);
        ensureTangents(obj.geometry, true);
        if (Array.isArray(row.finish) && (row.finish[0] === finish.bridgeFace || row.finish[0] === finish.cockFace)) {
          row.finish = [face, finish.bridgeEdge];
        }
      });
    };
    patchGroup("trainBridge", trainFace, third && fourth ? flowAngle(third.xy, fourth.xy) : 0);
    patchGroup(
      "escapeFinger",
      escapeFace,
      escAnchor && escape && pallet
        ? flowAngle(escAnchor.xy, { x: (escape.xy.x + pallet.xy.x) * 0.5, y: (escape.xy.y + pallet.xy.y) * 0.5 })
        : 0,
    );
    patchGroup("balanceCock", cockFace, heel && balance ? flowAngle(heel.xy, balance.xy) : 0);
  }

  if (opts.assembly && opts.assemblyMaterials) {
    const am = opts.assemblyMaterials;
    const asmTable = new Map<THREE.Material, THREE.Material>([
      [am.ruby, finish.ruby],
      [am.rubyCap, finish.rubyCap],
      [am.setting, finish.setting],
      [am.chaton, finish.chaton],
      [am.bushing, finish.bushing],
      [am.screw, finish.screw],
      [am.screwEdge, finish.screwEdge],
    ]);
    const hero = opts.assembly.pose.getObjectByName("assembly:bearing:balance:upper");
    collect(opts.assembly.pose, asmTable);
    if (hero) {
      hero.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const row = assignments.find((a) => a.mesh === obj);
        if (!row) return;
        if (row.finish === finish.ruby || row.finish === finish.rubyCap) {
          row.finish = finish.jewelHero;
        }
      });
    }
  }

  const bench = buildBench(finish, opts.movement, opts.structure, opts.assembly);
  bench.visible = false;
  opts.scene.add(bench);

  const dirMats: { mesh: THREE.Mesh; finish: THREE.Material | THREE.Material[] }[] = [];
  const dirMat = directionMaterial();

  const apply = (): void => {
    for (const row of assignments) row.mesh.material = row.finish;
    applied = true;
  };

  const revert = (): void => {
    for (const row of assignments) row.mesh.material = row.baseline;
    applied = false;
    setStudio("off");
    bench.visible = false;
    for (const d of dirMats) d.mesh.material = d.finish;
    dirMats.length = 0;
  };

  const setStudio = (mode: "showcase" | "truth" | "off"): void => {
    showcaseLights.visible = mode === "showcase";
    truthLights.visible = mode === "truth";
    for (const b of baselineLights) {
      b.light.intensity = mode === "off" ? b.intensity : 0;
    }
    if (mode === "showcase") {
      opts.scene.environment = showcaseEnv;
      opts.scene.environmentIntensity = opts.pre5dComparison ? 1.16 : 1.16;
      opts.scene.background = new THREE.Color(opts.pre5dComparison ? 0x0b0c0f : 0x17191d);
      applyTone(
        opts.renderer,
        SHOWCASE_TONE,
        opts.pre5dComparison ? PRE5D_SHOWCASE_EXPOSURE : SHOWCASE_EXPOSURE,
      );
    } else if (mode === "truth") {
      opts.scene.environment = truthEnv;
      opts.scene.environmentIntensity = 1.05;
      opts.scene.background = new THREE.Color(0x9aa0a6);
      applyTone(opts.renderer, "neutral", TRUTH_EXPOSURE);
    } else {
      opts.scene.environment = baselineEnv;
      opts.scene.environmentIntensity = baselineEnvI;
      opts.scene.background = baselineBg;
      opts.renderer.toneMapping = baselineTone;
      opts.renderer.toneMappingExposure = baselineExposure;
    }
  };

  const setTone = (name: ToneName, exposure: number): void => {
    applyTone(opts.renderer, name, exposure);
  };

  const setBench = (on: boolean): void => {
    bench.visible = on;
    opts.movement.root.visible = !on;
    if (opts.structure) opts.structure.root.visible = !on;
    if (opts.assembly) opts.assembly.root.visible = !on;
    if (on) setStudio("truth");
  };

  const setDirectionDebug = (on: boolean): void => {
    if (!on) {
      for (const d of dirMats) d.mesh.material = d.finish;
      dirMats.length = 0;
      return;
    }
    const mark = (obj: THREE.Object3D | undefined): void => {
      if (!obj) return;
      obj.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const row = assignments.find((a) => a.mesh === child);
        if (!row) return;
        dirMats.push({ mesh: child, finish: row.finish });
        child.material = dirMat;
      });
    };
    mark(opts.structure?.pose.getObjectByName("trainBridge"));
    mark(opts.movement.parts.barrel.pose);
    mark(opts.movement.parts.center.pose);
  };

  return {
    materials: finish,
    apply,
    revert,
    setStudio,
    setTone,
    setBench,
    setDirectionDebug,
    applied: () => applied,
    report: () => ({
      thesis: FINISH.thesis,
      hierarchy: {
        ground: "dark perlage plate, hoop, spokes, barrel junction, columns",
        drawing: "cooler côtes bridges and cock, polished anglage",
        mass: "warm circular-grained barrel",
        accents: "blued screws, accepted blue hands, ruby/chaton",
      },
      barrelJunction: "struct:plate:junction:barrel uses plate perlage, not a bridge patch",
    }),
  };
}

function applyWorldXyUv(geo: THREE.BufferGeometry, mmPerRepeat: number): void {
  const pos = geo.getAttribute("position");
  if (!pos) return;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / mmPerRepeat;
    uv[i * 2 + 1] = pos.getY(i) / mmPerRepeat;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

function applyPlateWorldUv(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const n = obj.name;
    if (
      n === "struct:plate:hoop" ||
      n === "struct:plate:junction:barrel" ||
      n.startsWith("struct:plate:spoke:") ||
      (n.startsWith("struct:boss:") && n.endsWith(":lower")) ||
      n.startsWith("struct:column:")
    ) {
      applyWorldXyUv(obj.geometry, FINISH.plateUvMm);
      ensureTangents(obj.geometry, true);
    }
  });
}

function applyDirectedUv(geo: THREE.BufferGeometry, angle: number, mmPerRepeat: number): void {
  const pos = geo.getAttribute("position");
  if (!pos || pos.count < 1) return;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pos.count; i++) {
    cx += pos.getX(i);
    cy += pos.getY(i);
  }
  cx /= pos.count;
  cy /= pos.count;
  const c = Math.cos(-angle);
  const s = Math.sin(-angle);
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i) - cx;
    const dy = pos.getY(i) - cy;
    uv[i * 2] = (dx * c - dy * s) / mmPerRepeat + 0.5;
    uv[i * 2 + 1] = (dx * s + dy * c) / mmPerRepeat + 0.5;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

function firstMesh(root: THREE.Object3D | undefined): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  root?.traverse((o) => {
    if (!found && o instanceof THREE.Mesh) found = o;
  });
  return found;
}

function buildBench(
  mats: FinishMaterials,
  movement: Movement,
  structure: MovementStructure | null,
  assembly: MovementAssembly | null,
): THREE.Group {
  const g = new THREE.Group();
  g.name = "finish:bench";
  g.position.set(0, 0, 0);

  const coupon = (face: THREE.Material, edge: THREE.Material, x: number, y: number): void => {
    const geo = new THREE.BoxGeometry(2.4, 1.6, 0.18);
    const mesh = new THREE.Mesh(geo, [face, face, edge, edge, face, face]);
    mesh.position.set(x, y, 0);
    g.add(mesh);
  };

  coupon(mats.plateFace, mats.plateEdge, -6.2, 3.2);
  coupon(mats.bridgeFace, mats.bridgeEdge, -3.2, 3.2);
  coupon(mats.wheelFace, mats.wheelEdge, -0.2, 3.2);
  coupon(mats.barrelFace, mats.barrelEdge, 2.8, 3.2);
  coupon(mats.screw, mats.screwEdge, 5.8, 3.2);

  const placeClone = (src: THREE.Mesh | null, mat: THREE.Material | THREE.Material[], x: number, y: number, s = 1): void => {
    if (!src) return;
    const mesh = new THREE.Mesh(src.geometry, mat);
    mesh.position.set(x, y, 0.4);
    mesh.scale.setScalar(s);
    g.add(mesh);
  };

  const bridgeMesh = firstMesh(structure?.pose.getObjectByName("trainBridge"));
  const wheelMesh = firstMesh(movement.parts.center.motion);
  const barrelMesh = firstMesh(movement.parts.barrel.motion);
  const jewelMesh = firstMesh(assembly?.pose.getObjectByName("assembly:bearing:balance:upper"));
  const screwMesh = firstMesh(assembly?.pose.getObjectByName("assembly:anchor:train:a:screw"));

  placeClone(bridgeMesh, [mats.bridgeFace, mats.bridgeEdge], -4.5, -1.2, 0.55);
  placeClone(wheelMesh, [mats.wheelFace, mats.wheelEdge], 0.2, -1.4, 1);
  placeClone(barrelMesh, [mats.barrelFace, mats.barrelEdge], 4.6, -1.6, 0.7);
  placeClone(jewelMesh, mats.ruby, -2.2, -4.4, 4);
  placeClone(screwMesh, [mats.screw, mats.screwEdge], 1.6, -4.4, 3.2);

  const spring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.045, 10, 64), mats.hairspring);
  spring.position.set(5.2, -4.2, 0.3);
  g.add(spring);

  return g;
}

export function applyFinishView(
  camera: THREE.PerspectiveCamera,
  controls: { target: THREE.Vector3; update: () => void },
  name: FinishViewName,
): void {
  const view = FINISH_CAMERAS[name];
  camera.position.copy(view.position);
  controls.target.copy(view.target);
  controls.update();
}
