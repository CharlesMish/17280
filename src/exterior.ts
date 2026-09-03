import * as THREE from "three";
import type { Movement } from "./movement";
import type { Accommodation } from "./accommodation";
import type { EnclosureLayer } from "./enclosure";
import { createExteriorPlan, type ExteriorPlan } from "./exteriorPlan";
import { auditExterior } from "./exteriorAudit";
import { EXT_FINISH, EXT_VIEWS, type ExtViewName } from "./exteriorSpec";
import {
  createExteriorMaterials,
  finishIdMaterial,
  type ExteriorFinishKind,
  type ExteriorMaterials,
} from "./exteriorMaterials";
import {
  buildBezel,
  buildCaseback,
  buildCrown,
  buildExteriorBands,
  buildLugDiagnostics,
  buildLugs,
  buildOuterCrystals,
  buildSapphireOpticalBodies,
  buildTruthOverlay,
  auditCrownKeepout,
  analyzeCrownBody,
  retractVerticesFromCrown,
  crownJoinLayout,
  type CrownJoinReport,
  type CrownRootCollarReport,
  type CrownCapClosureReport,
  type CrownKeepoutReport,
  type HornMeshReport,
  type SapphireOpticalBodyReport,
} from "./exteriorGeometry";
import { bindIdentity, type IdentityBinding } from "./identity";

export type { ExtViewName };

export type SapphirePresentationMode = "corrected" | "legacy" | "flat" | "id";
export type SapphireStackDiagnosticMode =
  | "full"
  | "front-only"
  | "rear-only"
  | "front-inner"
  | "front-outer"
  | "rear-inner"
  | "rear-outer";
export type SapphireStackDiagnosticState = {
  mode: SapphireStackDiagnosticMode;
  front: { visible: boolean; originalGeometry: boolean; materialGroups: number[] };
  rear: { visible: boolean; originalGeometry: boolean; materialGroups: number[] };
};
export type ExteriorFinishDiagnosticMode = "finished" | "roughnessFlat";

export type ExteriorLayer = {
  root: THREE.Group;
  plan: ExteriorPlan;
  materials: ExteriorMaterials;
  report: () => ReturnType<typeof makeReport>;
  setProduct: (on: boolean) => void;
  setTruth: (on: boolean) => void;
  setKernel: (on: boolean) => void;
  setLugInspect: (mode: "off" | "span" | "section" | "root" | "rootSection" | "crownSection") => void;
  setCrownId: (on: boolean) => void;
  setCrownKeepout: (on: boolean) => void;
  setFinishId: (on: boolean) => void;
  setSapphirePresentation: (mode: SapphirePresentationMode) => void;
  setSapphireStackDiagnostic: (mode: SapphireStackDiagnosticMode) => SapphireStackDiagnosticState;
  setFinishDiagnostic: (mode: ExteriorFinishDiagnosticMode) => void;
};

export function createExterior(opts: {
  movement: Movement;
  accommodation: Accommodation;
  enclosure: EnclosureLayer;
}): ExteriorLayer {
  const acc = opts.accommodation.plan;
  const enc = opts.enclosure.plan;
  const plan = createExteriorPlan(acc, enc);
  const audit = auditExterior(plan, acc, enc);
  if (!audit.accepted) {
    console.warn("Phase 3D exterior audit flags", audit);
  }

  const materials = createExteriorMaterials();
  const root = new THREE.Group();
  root.name = "ExteriorRoot";

  const mid = buildExteriorBands(plan, materials);
  const bezel = buildBezel(plan, materials);
  const back = buildCaseback(plan, materials);
  const lugs = buildLugs(plan, materials);
  const lugDiag = buildLugDiagnostics(plan, materials);
  const hornReports = (lugs.userData.hornReports ?? []) as HornMeshReport[];
  const crown = buildCrown(plan, materials);
  const crystals = buildOuterCrystals(plan, materials);
  const optical = buildSapphireOpticalBodies({
    exterior: plan,
    enclosure: opts.enclosure.plan,
    enclosureRoot: opts.enclosure.root,
    outerRoot: crystals,
    innerMaterial: opts.enclosure.materials.sapphire,
    outerMaterial: materials.sapphire,
  });
  const overlay = buildTruthOverlay(plan, materials);
  overlay.visible = false;

  const body = new THREE.Group();
  body.name = "ext:visible";
  body.add(mid, bezel, back, lugs, crown, crystals, optical.group);
  root.add(body, overlay, lugDiag);
  const frontOptical = optical.group.getObjectByName("ext:frontSapphireOpticalBody") as THREE.Mesh;
  const rearOptical = optical.group.getObjectByName("ext:rearSapphireOpticalBody") as THREE.Mesh;
  const sapphireStackOriginals = {
    front: { geometry: frontOptical.geometry, visible: frontOptical.visible },
    rear: { geometry: rearOptical.geometry, visible: rearOptical.visible },
  };
  const sapphireStackGeometry = new Map<string, THREE.BufferGeometry>();
  const isolatedSapphireGeometry = (
    side: "front" | "rear",
    mesh: THREE.Mesh,
    materialIndex: 0 | 1,
  ): THREE.BufferGeometry => {
    const key = `${side}:${materialIndex}`;
    const existing = sapphireStackGeometry.get(key);
    if (existing) return existing;
    const geometry = mesh.geometry.clone();
    geometry.clearGroups();
    for (const group of mesh.geometry.groups) {
      if (group.materialIndex === materialIndex) {
        geometry.addGroup(group.start, group.count, group.materialIndex);
      }
    }
    sapphireStackGeometry.set(key, geometry);
    return geometry;
  };
  const sapphireStackState = (mode: SapphireStackDiagnosticMode): SapphireStackDiagnosticState => {
    const row = (
      mesh: THREE.Mesh,
      originalGeometry: THREE.BufferGeometry,
    ): SapphireStackDiagnosticState["front"] => ({
      visible: mesh.visible,
      originalGeometry: mesh.geometry === originalGeometry,
      materialGroups: [
        ...new Set(mesh.geometry.groups.flatMap((group) => (
          group.materialIndex === undefined ? [] : [group.materialIndex]
        ))),
      ],
    });
    return {
      mode,
      front: row(frontOptical, sapphireStackOriginals.front.geometry),
      rear: row(rearOptical, sapphireStackOriginals.rear.geometry),
    };
  };
  const setSapphireStackDiagnostic = (
    mode: SapphireStackDiagnosticMode,
  ): SapphireStackDiagnosticState => {
    frontOptical.geometry = sapphireStackOriginals.front.geometry;
    frontOptical.visible = sapphireStackOriginals.front.visible;
    rearOptical.geometry = sapphireStackOriginals.rear.geometry;
    rearOptical.visible = sapphireStackOriginals.rear.visible;
    switch (mode) {
      case "full":
        break;
      case "front-only":
        rearOptical.visible = false;
        break;
      case "rear-only":
        frontOptical.visible = false;
        break;
      case "front-inner":
        rearOptical.visible = false;
        frontOptical.geometry = isolatedSapphireGeometry("front", frontOptical, 0);
        break;
      case "front-outer":
        rearOptical.visible = false;
        frontOptical.geometry = isolatedSapphireGeometry("front", frontOptical, 1);
        break;
      case "rear-inner":
        frontOptical.visible = false;
        rearOptical.geometry = isolatedSapphireGeometry("rear", rearOptical, 0);
        break;
      case "rear-outer":
        frontOptical.visible = false;
        rearOptical.geometry = isolatedSapphireGeometry("rear", rearOptical, 1);
        break;
    }
    return sapphireStackState(mode);
  };
  const sapphireFlat = new THREE.MeshBasicMaterial({
    color: 0xdde7ee,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    depthTest: true,
    side: THREE.FrontSide,
  });
  const sapphireIdFront = new THREE.MeshBasicMaterial({ color: 0x26d9f3, side: THREE.DoubleSide });
  const sapphireIdRear = new THREE.MeshBasicMaterial({ color: 0xf05cc8, side: THREE.DoubleSide });
  let sapphirePresentationMode: SapphirePresentationMode = "corrected";
  let finishDiagnosticMode: ExteriorFinishDiagnosticMode = "finished";
  const finishMapRows: { material: THREE.MeshPhysicalMaterial; roughnessMap: THREE.Texture | null }[] = [
    materials.bezelSatin,
    materials.midSatin,
    materials.casebackSatin,
    materials.lugTop,
    materials.lugSide,
    materials.lugBore,
    materials.waist,
    materials.crown,
    materials.crownFlute,
  ].map((material) => ({ material, roughnessMap: material.roughnessMap }));
  // Pull any leftover 3D chamfer/extrude verts of fixed case-side meshes
  // behind the rotating lathe. Do not move the accepted crown or the socket.
  const retractNames = new Set([
    "ext:mid",
    "ext:waist",
    "ext:caseback",
    "ext:waist-bevel",
    "ext:caseback-step",
    "ext:bezel-lip",
    "ext:bezel-chamfer",
  ]);
  body.updateMatrixWorld(true);
  body.traverse((o) => {
    if (o instanceof THREE.Mesh && retractNames.has(o.name)) {
      retractVerticesFromCrown(o, plan.crown, 0.12);
    }
  });
  const keepoutAudit = auditCrownKeepout(plan, body);
  plan.keepoutAt = keepoutAudit.hits.find((h) => h.mesh !== "ext:crown-socket")?.at ?? keepoutAudit.hits[0]?.at;
  const crownBodyMesh = (crown.userData.crownBodyMesh ?? null) as ReturnType<typeof analyzeCrownBody> | null;
  const crownRootCollar = (crown.userData.crownRootCollar ?? null) as CrownRootCollarReport | null;
  const crownCapClosure = (crown.userData.crownCapClosure ?? null) as CrownCapClosureReport | null;
  const identity: IdentityBinding = bindIdentity(body, plan);
  finishMapRows.push(...identity.finishMaps);
  const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  body.traverse((o) => {
    if (o instanceof THREE.Mesh) originals.set(o, o.material);
  });

  const truthLights = new THREE.Group();
  truthLights.name = "ext:truthLights";
  truthLights.visible = false;
  truthLights.add(new THREE.HemisphereLight(0xf2f4f6, 0x8a8e94, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 0.55);
  key.position.set(10, 8, 14);
  truthLights.add(key);
  root.add(truthLights);

  const inspectLights = new THREE.Group();
  inspectLights.name = "ext:lugInspectLights";
  inspectLights.visible = false;
  inspectLights.add(new THREE.HemisphereLight(0xf4f1ea, 0x6e7380, 1.2));
  const inspectKey = new THREE.DirectionalLight(0xfff6ea, 0.48);
  inspectKey.position.set(14, 16, 18);
  inspectLights.add(inspectKey);
  const inspectFill = new THREE.DirectionalLight(0xdce6f2, 0.55);
  inspectFill.position.set(-8, 10, 10);
  inspectLights.add(inspectFill);
  root.add(inspectLights);

  const setLugInspect = (
    mode: "off" | "span" | "section" | "root" | "rootSection" | "crownSection",
  ): void => {
    inspectLights.visible = mode !== "off";
    lugDiag.visible = mode === "section" || mode === "rootSection" || mode === "crownSection";
    lugDiag.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      if (mode === "rootSection") o.visible = o.userData.diag === "root";
      else if (mode === "crownSection") o.visible = o.userData.diag === "crown";
      else o.visible = o.userData.diag !== "root" && o.userData.diag !== "crown";
    });
    const ghost = mode === "section" || mode === "rootSection" || mode === "crownSection";
    for (const [mesh, mat] of originals) {
      mesh.material = ghost ? materials.ghost : mat;
    }
  };

  const applyKernelPresentation = (mode: "product" | "truth" | "hidden"): void => {
    const product = mode === "product";
    optical.group.visible = product;
    crystals.traverse((o) => {
      if (o.name === "ext:frontSapphireOuter" || o.name === "ext:rearSapphireOuter") {
        o.visible = !product;
      }
    });
    opts.accommodation.root.traverse((o) => {
      if (o.name === "CoarseMidcasePose" || o.name === "acc:midcase") {
        o.visible = mode !== "product";
      }
      if (o.name === "FrontReservePose" || o.name === "RearReservePose" || o.name === "CrownCorridorPose") {
        o.visible = mode === "truth";
      }
    });
    opts.enclosure.root.traverse((o) => {
      if (
        o.name === "enc:frontSapphire" ||
        o.name === "enc:rearSapphire" ||
        o.name === "enc:frontSapphireCap" ||
        o.name === "enc:rearSapphireCap"
      ) {
        o.visible = !product;
      }
      // These occupy the finished caseback volume / exhibition bore. Product
      // owner of that surface is ext:caseback.
      if (o.name === "enc:rearCarrier" || o.name === "enc:holderShoulder" || o.name === "enc:rearGasketReserve") {
        o.visible = mode !== "product";
      }
    });
  };

  const setSapphirePresentation = (mode: SapphirePresentationMode): void => {
    sapphirePresentationMode = mode;
    const corrected = mode !== "legacy";
    optical.group.visible = corrected;
    crystals.traverse((o) => {
      if (o.name === "ext:frontSapphireOuter" || o.name === "ext:rearSapphireOuter") {
        o.visible = !corrected;
      }
    });
    opts.enclosure.root.traverse((o) => {
      if (o.name === "enc:frontSapphire" || o.name === "enc:rearSapphire") o.visible = !corrected;
      if (o.name === "enc:frontSapphireCap" || o.name === "enc:rearSapphireCap") o.visible = false;
    });
    frontOptical.material = mode === "flat"
      ? sapphireFlat
      : mode === "id"
        ? sapphireIdFront
        : originals.get(frontOptical)!;
    rearOptical.material = mode === "flat"
      ? sapphireFlat
      : mode === "id"
        ? sapphireIdRear
        : originals.get(rearOptical)!;
  };

  const setFinishDiagnostic = (mode: ExteriorFinishDiagnosticMode): void => {
    finishDiagnosticMode = mode;
    for (const row of finishMapRows) {
      row.material.roughnessMap = mode === "finished" ? row.roughnessMap : null;
      row.material.needsUpdate = true;
    }
  };

  const setTruthOnlyAxes = (on: boolean): void => {
    lugs.traverse((o) => {
      if (o.userData.truthOnly) o.visible = on;
    });
  };

  return {
    root,
    plan,
    materials,
    report: () => makeReport(
      plan,
      audit,
      hornReports,
      crownJoinLayout(plan),
      crownRootCollar,
      crownCapClosure,
      keepoutAudit,
      crownBodyMesh,
      optical.reports,
      sapphirePresentationMode,
      finishDiagnosticMode,
      identity.report(),
    ),
    setProduct: (on) => {
      root.visible = on;
      body.visible = on;
      overlay.visible = false;
      truthLights.visible = false;
      inspectLights.visible = false;
      lugDiag.visible = false;
      setTruthOnlyAxes(false);
      body.traverse((o) => {
        if (o.userData.keepout) o.visible = false;
        else if (o instanceof THREE.Mesh && !o.userData.truthOnly) o.visible = true;
      });
      for (const [mesh, mat] of originals) mesh.material = mat;
      if (on) applyKernelPresentation("product");
    },
    setTruth: (on) => {
      root.visible = true;
      body.visible = true;
      overlay.visible = on;
      truthLights.visible = on;
      inspectLights.visible = false;
      lugDiag.visible = false;
      setTruthOnlyAxes(on);
      for (const [mesh, mat] of originals) {
        mesh.material = on ? materials.ghost : mat;
      }
      applyKernelPresentation(on ? "truth" : "product");
    },
    setKernel: (on) => {
      root.visible = true;
      body.visible = true;
      overlay.visible = on;
      truthLights.visible = on;
      inspectLights.visible = false;
      lugDiag.visible = false;
      setTruthOnlyAxes(on);
      for (const [mesh, mat] of originals) mesh.material = on ? materials.ghost : mat;
      applyKernelPresentation("truth");
    },
    setLugInspect,
    setCrownId: (on) => {
      inspectLights.visible = on;
      lugDiag.visible = false;
      truthLights.visible = on;
      body.traverse((o) => {
        if (o.userData.keepout) o.visible = false;
        else if (o instanceof THREE.Mesh && !o.userData.truthOnly) o.visible = true;
      });
      if (!on) {
        for (const [mesh, mat] of originals) mesh.material = mat;
        return;
      }
      body.traverse((o) => {
        if (!(o instanceof THREE.Mesh) || o.userData.truthOnly || o.userData.keepout) return;
        if (o.name === "ext:mid") o.material = materials.idMid;
        else if (o.name === "ext:waist") o.material = materials.idWaist;
        else if (o.name === "ext:caseback") o.material = materials.idCaseback;
        else if (o.name === "ext:crown-socket" || o.name === "ext:crown-root-collar") o.material = materials.idSocket;
        else if (o.name === "ext:waist-bevel") o.material = materials.idBevel;
        else if (o.name === "ext:caseback-step") o.material = materials.idStep;
        else if (o.name === "ext:crown-body" || o.name === "ext:crown-cap") o.material = materials.idCrown;
        else o.material = materials.idOther;
      });
    },
    setFinishId: (on) => {
      inspectLights.visible = false;
      truthLights.visible = false;
      lugDiag.visible = false;
      body.traverse((o) => {
        if (o.userData.keepout) o.visible = false;
        else if (o instanceof THREE.Mesh && !o.userData.truthOnly) o.visible = true;
      });
      if (!on) {
        for (const [mesh, mat] of originals) mesh.material = mat;
        return;
      }
      body.traverse((o) => {
        if (!(o instanceof THREE.Mesh) || o.userData.truthOnly || o.userData.keepout) return;
        const slots = o.userData.finishSlots as ExteriorFinishKind[] | undefined;
        const kind = o.userData.finishKind as ExteriorFinishKind | undefined;
        if (slots) {
          o.material = slots.map((s) => finishIdMaterial(s, materials) ?? materials.idOther);
          return;
        }
        if (kind === "sapphire") return;
        const id = kind ? finishIdMaterial(kind, materials) : null;
        o.material = id ?? materials.idOther;
      });
    },
    setCrownKeepout: (on) => {
      inspectLights.visible = on;
      truthLights.visible = on;
      lugDiag.visible = false;
      body.traverse((o) => {
        if (o.userData.keepout) o.visible = on;
        if (
          on &&
          (o.name === "ext:crown-body" ||
            o.name === "ext:crown-cap" ||
            o.name.startsWith("ext:crown-flute"))
        ) {
          o.visible = false;
        } else if (!on && o instanceof THREE.Mesh && !o.userData.keepout && !o.userData.truthOnly) {
          o.visible = true;
        }
      });
      if (!on) {
        for (const [mesh, mat] of originals) mesh.material = mat;
        return;
      }
      body.traverse((o) => {
        if (!(o instanceof THREE.Mesh) || o.userData.truthOnly) return;
        if (o.userData.keepout) return;
        if (
          o.name === "ext:mid" ||
          o.name === "ext:waist" ||
          o.name === "ext:caseback" ||
          o.name === "ext:waist-bevel" ||
          o.name === "ext:crown-socket" ||
          o.name === "ext:crown-root-collar" ||
          o.name === "ext:caseback-step"
        ) {
          o.material = materials.idMid;
        } else {
          o.material = materials.idOther;
        }
      });
    },
    setSapphirePresentation,
    setSapphireStackDiagnostic,
    setFinishDiagnostic,
  };
}

function makeReport(
  plan: ExteriorPlan,
  audit: ReturnType<typeof auditExterior>,
  hornMesh: HornMeshReport[],
  crownJoin: CrownJoinReport,
  crownRootCollar: CrownRootCollarReport | null,
  crownCapClosure: CrownCapClosureReport | null,
  crownKeepout: CrownKeepoutReport,
  crownBodyMesh: ReturnType<typeof analyzeCrownBody> | null,
  opticalBodies: SapphireOpticalBodyReport[],
  sapphirePresentationMode: SapphirePresentationMode,
  finishDiagnosticMode: ExteriorFinishDiagnosticMode,
  identity: ReturnType<IdentityBinding["report"]>,
) {
  return {
    concept: plan.concept,
    rejected: plan.rejected,
    hornMesh,
    crownJoin,
    crownRootCollar,
    crownCapClosure,
    crownKeepout,
    crownBodyMesh,
    fluteNote:
      "Flutes are applied box grooves seated inside the cylindrical band. Crown body is a 36-segment lathe. Remaining edge ragging is low-segment lathe faceting plus square groove ends; boxes stay inside bodyR. Not a topology defect.",
    thesis:
      "Tensioned cushion: restrained bezel-proud lip, re-entrant mid→waist shadow break, local-root case-grown horns, localized crown pocket. Subtle raised/inset outer sapphire caps — not a boxed crystal.",
    audit,
    z: plan.z,
    lugs: plan.lugs,
    crown: plan.crown,
    sapphire: plan.sapphire,
    opticalOwnership: {
      finalProductOwner: "ext:sapphireOpticalOwnership",
      oneBoundaryManifoldPerSide: true,
      authoritativeEngineeringMeshesRetained: true,
      formerInternalMatingFacesContributeToProduct: false,
      mode: sapphirePresentationMode,
      bodies: opticalBodies,
    },
    bands: plan.bands.map((b) => ({ id: b.id, offset: b.offset, z0: b.z0, z1: b.z1, finish: b.finish })),
    finish: {
      thesis: EXT_FINISH.thesis,
      answers: EXT_FINISH.answers,
      hierarchy: {
        envelope: "cool steel case, quieter than movement drawing, no gold",
        waist: "darker frosted re-entrant band separating upper and lower masses",
        edge: "polish only on accepted facets: bezel chamfer/lip/inner, waist-bevel, caseback-step, lug terminal chamfers, crown shoulders/cap",
      },
      surfaces: {
        "ext:bezel": "sunburst satin on top, vertical satin on short outer wall",
        "ext:bezel-chamfer": "polish facet between bezel and mid",
        "ext:bezel-lip": "polish lip at metal top",
        "ext:bezel-inner-polish": "satin facing ring, polish inner wall",
        "ext:mid": "vertical satin upper-case mass",
        "ext:waist": "frosted darker steel, not a decorative stripe",
        "ext:waist-bevel": "polish break mid → waist",
        "ext:caseback": "circular satin lower mass",
        "ext:caseback-step": "polish rear step",
        lugs: "top along-lug satin, inner/outer sides brighter satin, distal chamfers polish, bore frost",
        crown: "circumferential satin cylinder, restrained polish shoulders and cap, frost flutes, satin socket",
        sapphire: "unchanged from 5A; optics not in 5B",
      },
      limitations: [
        "Band extrusion bevels (~0.016 mm) are too small to carry visible anglage; polish lives on dedicated facet meshes already in the plan.",
        "Lug extrude bevel (0.04 mm) is similarly too small; distal 0.36 mm profile chamfers take the terminal polish.",
        "No inner lug-root anglage geometry exists; the case-grown join is articulated by grain direction, not a new chamfer.",
        "Crown flutes remain applied box grooves, not cut-and-polished channels.",
        "36-segment lathe faceting on the crown body is a frozen geometry leftover, not a finish defect.",
        "From the front, the inner opening can pick up barrel warmth through the frozen sapphire; the bezel body is cool steel. Do not compensate with a gold case.",
        "The low-side profile is light-starved under the existing studio. The waist is a shadow break there; 5D should reveal the sandwich without fake shadows.",
      ],
      renderHygiene: {
        roughnessSampling: "mipmapped band-limited procedural response; Phase-5B family and anisotropy ownership retained",
        diagnosticMode: finishDiagnosticMode,
      },
      phase5c: [
        "Strap at the frozen 18 mm gap should not introduce warm buckle or hardware that competes with the barrel.",
        "Lug terminals and frosted bores are the strap interface; keep them cool steel.",
        "Typography must not add a second blue or a gold legend.",
        "Do not start keyless works, sapphire optics, or a lighting redesign from the strap phase.",
      ],
    },
    identity,
  };
}

export function applyExtView(
  camera: THREE.PerspectiveCamera,
  controls: { target: THREE.Vector3; update: () => void; maxDistance?: number },
  name: ExtViewName,
  plan: ExteriorPlan,
): void {
  if (controls.maxDistance !== undefined && controls.maxDistance < 90) controls.maxDistance = 90;
  const midZ = (plan.z.metalTop + plan.z.metalBottom) * 0.5;
  const views: Record<ExtViewName, { p: THREE.Vector3; t: THREE.Vector3 }> = {
    extHero: { p: new THREE.Vector3(28, 22, 36), t: new THREE.Vector3(-0.6, 0.8, 1.4) },
    extFront: { p: new THREE.Vector3(-1.2, 1.0, 58), t: new THREE.Vector3(-1.2, 1.0, plan.z.frontSapphireInner) },
    extProduct: { p: new THREE.Vector3(16, 11, 26), t: new THREE.Vector3(-0.6, 0.8, 1.2) },
    extCrownProfile: { p: new THREE.Vector3(46, 0.2, 3.2), t: new THREE.Vector3(1.4, 0.2, midZ) },
    extOffside: { p: new THREE.Vector3(-46, 0.2, 3.2), t: new THREE.Vector3(-1.4, 0.2, midZ) },
    extWestOblique: { p: new THREE.Vector3(-28, 20, 34), t: new THREE.Vector3(0.4, 0.4, 1.2) },
    extRear: { p: new THREE.Vector3(22, -18, -32), t: new THREE.Vector3(-0.4, 0.6, plan.z.rearSapphireInner) },
    extRearGrazing: {
      p: new THREE.Vector3(14.0, -15.5, plan.z.rearSapphireInner - 11.0),
      t: new THREE.Vector3(0.4, 3.6, plan.z.rearSapphireInner + 0.2),
    },
    extProfile: { p: new THREE.Vector3(0.2, -48, 3.0), t: new THREE.Vector3(-0.8, 0.2, midZ) },
    extUnderside: { p: new THREE.Vector3(12, -24, -22), t: new THREE.Vector3(-0.8, 0.2, plan.z.metalBottom + 1.4) },
    extLugProduct: {
      p: new THREE.Vector3(8, plan.lugs.sides[0].yRoot + 16, 12),
      t: new THREE.Vector3(0, plan.lugs.sides[0].yRoot + 1.4, plan.lugs.bars[0].axisZ),
    },
    extLugFinish: {
      p: new THREE.Vector3(19.0, plan.lugs.sides[0].yRoot + 6.2, 7.4),
      t: new THREE.Vector3(plan.lugs.strapWidth * 0.5 + 0.7, plan.lugs.sides[0].yRoot + 0.35, 1.1),
    },
    extLugClosure: {
      p: new THREE.Vector3(-22, plan.lugs.bars[0].axisY + 2.4, plan.lugs.bars[0].axisZ + 3.2),
      t: new THREE.Vector3(-plan.lugs.strapWidth * 0.5 - 0.8, plan.lugs.bars[0].axisY - 0.2, plan.lugs.bars[0].axisZ),
    },
    extLugSpan: {
      p: new THREE.Vector3(18.5, plan.lugs.sides[0].yRoot + 11.5, 10.5),
      t: new THREE.Vector3(plan.lugs.strapWidth * 0.5 + 0.4, plan.lugs.sides[0].yRoot + 1.6, 0.55),
    },
    extLugSection: {
      p: new THREE.Vector3(21.0, plan.lugs.sides[0].yRoot + 9.8, 6.8),
      t: new THREE.Vector3(plan.lugs.strapWidth * 0.5 + 1.1, plan.lugs.bars[0].axisY - 0.15, 0.4),
    },
    extLugRoot: {
      p: new THREE.Vector3(19.0, plan.lugs.sides[0].yRoot + 6.2, 7.4),
      t: new THREE.Vector3(plan.lugs.strapWidth * 0.5 + 0.7, plan.lugs.sides[0].yRoot + 0.35, 1.1),
    },
    extLugRootSection: {
      p: new THREE.Vector3(26.5, plan.lugs.sides[0].yRoot - 0.2, 1.55),
      t: new THREE.Vector3(plan.lugs.strapWidth * 0.5 + 1.2, plan.lugs.sides[0].yRoot - 0.2, 1.55),
    },
    extLugRootCut: {
      p: new THREE.Vector3(10.2, plan.lugs.sides[0].yRoot + 14.0, 1.4),
      t: new THREE.Vector3(10.2, plan.lugs.sides[0].yRoot - 0.7, 1.4),
    },
    extLugTruth: {
      p: new THREE.Vector3(14, plan.lugs.sides[0].yRoot + 8, 6),
      t: new THREE.Vector3(plan.lugs.sides[0].wallX, plan.lugs.sides[0].yRoot, plan.lugs.bars[0].axisZ),
    },
    extLugSouth: {
      p: new THREE.Vector3(14, plan.lugs.sides[1].yRoot - 8, 6),
      t: new THREE.Vector3(plan.lugs.sides[1].wallX, plan.lugs.sides[1].yRoot, plan.lugs.bars[1].axisZ),
    },
    extCrownProduct: {
      p: new THREE.Vector3(plan.crown.caseX + 8.4, 4.2, plan.crown.axis.z + 5.2),
      t: new THREE.Vector3(plan.crown.caseX + 0.7, 0.15, plan.crown.axis.z + 0.12),
    },
    extCrownUpper: {
      p: new THREE.Vector3(plan.crown.caseX + 10.5, 8.4, plan.crown.axis.z + 7.8),
      t: new THREE.Vector3(plan.crown.caseX + 0.5, 0.2, plan.crown.axis.z + 0.15),
    },
    extCrownUnder: {
      p: new THREE.Vector3(plan.crown.caseX + 8.5, -9.5, plan.crown.axis.z - 7.2),
      t: new THREE.Vector3(plan.crown.caseX + 0.4, 0.1, plan.crown.axis.z + 0.15),
    },
    extCrownId: {
      p: new THREE.Vector3(plan.crown.bodyX1 + 42.0, plan.crown.axis.y, plan.crown.axis.z),
      t: new THREE.Vector3(plan.crown.caseX, plan.crown.axis.y, plan.crown.axis.z),
    },
    extCrownIdUnder: {
      p: new THREE.Vector3(plan.crown.caseX + 9.0, -10.5, plan.crown.axis.z - 7.6),
      t: new THREE.Vector3(plan.crown.caseX + 0.3, 0.05, plan.crown.axis.z + 0.1),
    },
    extCrownKeepout: {
      p: new THREE.Vector3(plan.crown.caseX + 7.5, -7.2, plan.crown.axis.z - 5.8),
      t: new THREE.Vector3(plan.crown.caseX + 0.4, 0.05, plan.crown.axis.z + 0.1),
    },
    extCrownClearSection: (() => {
      const at = plan.keepoutAt ?? {
        x: plan.crown.caseX,
        y: plan.crown.axis.y,
        z: plan.crown.axis.z + 0.9,
      };
      const dy = at.y - plan.crown.axis.y;
      const dz = at.z - plan.crown.axis.z;
      const len = Math.hypot(dy, dz) || 1;
      return {
        p: new THREE.Vector3(at.x + 0.35, at.y - (dz / len) * 14.5, at.z + (dy / len) * 14.5),
        t: new THREE.Vector3(at.x, at.y, at.z),
      };
    })(),
    extCrownRoot: {
      p: new THREE.Vector3(plan.crown.caseX + 6.2, -6.8, plan.crown.axis.z - 5.4),
      t: new THREE.Vector3(plan.crown.caseX + 0.15, 0.04, plan.crown.axis.z + 0.08),
    },
    extCrownSection: {
      p: new THREE.Vector3(plan.crown.caseX + 1.4, 16.5, plan.crown.axis.z + 0.2),
      t: new THREE.Vector3(plan.crown.caseX + 1.4, 0, plan.crown.axis.z + 0.2),
    },
    extCrownTruth: {
      p: new THREE.Vector3(plan.crown.caseX + 12, 5.0, plan.crown.axis.z + 3.2),
      t: new THREE.Vector3(plan.crown.caseX - 0.4, 0, plan.crown.axis.z),
    },
    extKernel: { p: new THREE.Vector3(28, 20, 34), t: new THREE.Vector3(-0.8, 0.8, midZ) },
    extSeatMacro: { p: new THREE.Vector3(8, -14, plan.z.frontSapphireInner + 10), t: new THREE.Vector3(-1.5, 1.6, plan.z.frontSapphireInner) },
    extWaist: { p: new THREE.Vector3(32, -6, 2.2), t: new THREE.Vector3(2, 0.2, (plan.crown.pocketZ0 + plan.bands[2].z0) * 0.5) },
    extFinishId: { p: new THREE.Vector3(34, 12, 22), t: new THREE.Vector3(-0.2, 0.4, 0.4) },
  };
  const v = views[name];
  camera.fov = name === "extCrownId" ? 10 : 32;
  camera.updateProjectionMatrix();
  camera.position.copy(v.p);
  controls.target.copy(v.t);
  controls.update();
}

export { EXT_VIEWS };
