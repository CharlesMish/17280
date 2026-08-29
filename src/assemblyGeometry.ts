import * as THREE from "three";
import type { Vec2 } from "./spec";
import type { AssemblyMaterials } from "./assemblyMaterials";

function ringShape(cx: number, cy: number, outer: number, inner: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.absarc(cx, cy, outer, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(cx, cy, inner, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return shape;
}

function extrudeFlat(shape: THREE.Shape, thick: number, segments = 28): THREE.ExtrudeGeometry {
  const bevel = Math.min(0.008, thick * 0.18);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.016, thick - 2 * bevel),
    bevelEnabled: bevel > 0.002,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: segments,
    steps: 1,
  });
  geo.translate(0, 0, -thick / 2);
  geo.computeVertexNormals();
  return geo;
}

function name(obj: THREE.Object3D, id: string): void {
  obj.name = id;
}

export function holeJewelMesh(
  xy: Vec2,
  z: number,
  outer: number,
  hole: number,
  thick: number,
  mats: AssemblyMaterials,
  id: string,
  opts: { openAperture?: boolean } = {},
): THREE.Group {
  const g = new THREE.Group();
  name(g, id);
  const body = new THREE.Mesh(extrudeFlat(ringShape(xy.x, xy.y, outer, hole), thick, 32), mats.ruby);
  body.position.z = z;
  g.add(body);
  const cup = new THREE.Mesh(
    extrudeFlat(ringShape(xy.x, xy.y, outer * 0.82, hole + 0.012), thick * 0.28, 24),
    mats.rubyCap,
  );
  cup.position.z = z + thick * 0.28;
  g.add(cup);
  if (!opts.openAperture) {
    const well = new THREE.Mesh(new THREE.CircleGeometry(hole * 0.92, 20), mats.aperture);
    well.position.set(xy.x, xy.y, z);
    g.add(well);
  } else {
    g.userData.openAperture = true;
    g.userData.throughBoreRadius = hole;
  }
  return g;
}

export function endstoneMesh(
  xy: Vec2,
  z: number,
  radius: number,
  thick: number,
  mats: AssemblyMaterials,
  id: string,
): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.absarc(xy.x, xy.y, radius, 0, Math.PI * 2, false);
  const mesh = new THREE.Mesh(extrudeFlat(shape, thick, 28), mats.rubyCap);
  mesh.position.z = z;
  name(mesh, id);
  return mesh;
}

export function settingRing(
  xy: Vec2,
  z: number,
  outer: number,
  inner: number,
  thick: number,
  material: THREE.Material,
  id: string,
): THREE.Mesh {
  const mesh = new THREE.Mesh(extrudeFlat(ringShape(xy.x, xy.y, outer, inner), thick, 30), material);
  mesh.position.z = z;
  name(mesh, id);
  return mesh;
}

export function bushingMesh(
  xy: Vec2,
  z: number,
  outer: number,
  hole: number,
  thick: number,
  mats: AssemblyMaterials,
  id: string,
): THREE.Group {
  const g = new THREE.Group();
  name(g, id);
  const body = new THREE.Mesh(extrudeFlat(ringShape(xy.x, xy.y, outer, hole), thick, 28), mats.bushing);
  body.position.z = z;
  g.add(body);
  const well = new THREE.Mesh(new THREE.CircleGeometry(hole * 0.9, 18), mats.aperture);
  well.position.set(xy.x, xy.y, z);
  g.add(well);
  return g;
}

export function retainerClip(
  xy: Vec2,
  z: number,
  radius: number,
  thick: number,
  mats: AssemblyMaterials,
  id: string,
): THREE.Group {
  const g = new THREE.Group();
  name(g, id);
  const ring = new THREE.Mesh(
    extrudeFlat(ringShape(xy.x, xy.y, radius, radius * 0.78), thick, 24),
    mats.screwEdge,
  );
  ring.position.z = z;
  g.add(ring);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.35;
    const tab = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.22, radius * 0.1, thick * 0.7), mats.screw);
    tab.position.set(xy.x + Math.cos(a) * radius * 0.86, xy.y + Math.sin(a) * radius * 0.86, z);
    tab.rotation.z = a;
    g.add(tab);
  }
  return g;
}

export function slottedScrew(
  xy: Vec2,
  headMidZ: number,
  headR: number,
  headH: number,
  shaftR: number,
  shaftBottomZ: number,
  slotAngle: number,
  mats: AssemblyMaterials,
  id: string,
): THREE.Group {
  const g = new THREE.Group();
  name(g, id);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(headR * 0.96, headR, headH, 28), mats.screw);
  head.rotation.x = Math.PI / 2;
  head.position.set(xy.x, xy.y, headMidZ);
  g.add(head);
  const bevel = new THREE.Mesh(
    new THREE.CylinderGeometry(headR * 0.78, headR * 0.96, headH * 0.22, 28),
    mats.screwEdge,
  );
  bevel.rotation.x = Math.PI / 2;
  bevel.position.set(xy.x, xy.y, headMidZ + headH * 0.38);
  g.add(bevel);
  const shaftH = Math.max(0.12, headMidZ - headH * 0.5 - shaftBottomZ);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(shaftR, shaftR * 0.92, shaftH, 16), mats.screw);
  shaft.rotation.x = Math.PI / 2;
  shaft.position.set(xy.x, xy.y, shaftBottomZ + shaftH * 0.5);
  g.add(shaft);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(headR * 1.55, headR * 0.11, headH * 0.38), mats.aperture);
  slot.position.set(xy.x, xy.y, headMidZ + headH * 0.34);
  slot.rotation.z = slotAngle;
  g.add(slot);
  return g;
}

export function fastenerSeat(
  xy: Vec2,
  z: number,
  outer: number,
  inner: number,
  thick: number,
  mats: AssemblyMaterials,
  id: string,
): THREE.Mesh {
  const mesh = new THREE.Mesh(extrudeFlat(ringShape(xy.x, xy.y, outer, inner), thick, 24), mats.setting);
  mesh.position.z = z;
  name(mesh, id);
  return mesh;
}
