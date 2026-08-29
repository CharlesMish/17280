import * as THREE from "three";
import { DEPTH, ESCAPEMENT, TEETH, type PartName } from "./spec";
import type { Movement } from "./movement";

const PART_DEPTH: Record<PartName, number> = {
  barrel: DEPTH.barrelWheel,
  center: DEPTH.centerWheel,
  third: DEPTH.thirdWheel,
  fourth: DEPTH.fourthWheel,
  escape: DEPTH.escapeWheel,
  pallet: DEPTH.pallet,
  balance: DEPTH.balance,
};

const TOOTH_LABEL: Partial<Record<PartName, number>> = {
  barrel: TEETH.barrel,
  center: TEETH.center,
  third: TEETH.third,
  fourth: TEETH.fourth,
  escape: TEETH.escape,
};

export function createDebugOverlay(movement: Movement): THREE.Group {
  const group = new THREE.Group();
  group.name = "debug";
  group.visible = false;

  const { layout } = movement;
  const ringMat = new THREE.LineBasicMaterial({ color: 0xf0c14b, transparent: true, opacity: 0.85 });
  const axisMat = new THREE.LineBasicMaterial({ color: 0x7ec8ff });
  const linkMat = new THREE.LineBasicMaterial({ color: 0xff6b8a });

  for (const name of Object.keys(layout.positions) as PartName[]) {
    const p = layout.positions[name];
    const z = PART_DEPTH[name];
    const radius =
      name === "pallet"
        ? 1.35
        : name === "balance"
          ? ESCAPEMENT.balanceRimRadius
          : name === "barrel"
            ? layout.radii.barrel
            : name === "center"
              ? layout.radii.center
              : name === "third"
                ? layout.radii.third
                : name === "fourth"
                  ? layout.radii.fourth
                  : layout.radii.escape;

    group.add(makeCircle(p.x, p.y, z + 0.4, radius, ringMat));
    group.add(makeAxis(p.x, p.y, z));

    const label = TOOTH_LABEL[name];
    if (label) {
      group.add(makeSprite(`${name} ${label}`, p.x, p.y, z + 1.1));
    } else {
      group.add(makeSprite(name, p.x, p.y, z + 1.1));
    }
  }

  group.add(makeCircle(
    layout.positions.center.x,
    layout.positions.center.y,
    DEPTH.centerPinion + 0.35,
    layout.radii.centerPinion,
    axisMat,
  ));

  for (const pair of layout.pairs) {
    const a = layout.positions[pair.from];
    const b = layout.positions[pair.to];
    const za = PART_DEPTH[pair.from] + 0.35;
    const zb = PART_DEPTH[pair.to] + 0.35;
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(a.x, a.y, za),
      new THREE.Vector3(b.x, b.y, zb),
    ]);
    group.add(new THREE.Line(geo, linkMat));
  }

  return group;
}

function makeCircle(
  x: number,
  y: number,
  z: number,
  radius: number,
  material: THREE.LineBasicMaterial,
): THREE.LineLoop {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    pts.push(new THREE.Vector3(x + Math.cos(a) * radius, y + Math.sin(a) * radius, z));
  }
  return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), material);
}

function makeAxis(x: number, y: number, z: number): THREE.LineSegments {
  const pts = [
    new THREE.Vector3(x, y, z - 1.4),
    new THREE.Vector3(x, y, z + 1.6),
    new THREE.Vector3(x - 0.6, y, z),
    new THREE.Vector3(x + 0.6, y, z),
    new THREE.Vector3(x, y - 0.6, z),
    new THREE.Vector3(x, y + 0.6, z),
  ];
  return new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0x9ad1ff }),
  );
}

function makeSprite(text: string, x: number, y: number, z: number): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "rgba(8, 8, 10, 0.55)";
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = "#f4f1ea";
    ctx.font = "28px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 128, 32);
  }
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }),
  );
  sprite.position.set(x, y, z);
  sprite.scale.set(2.6, 0.65, 1);
  return sprite;
}
