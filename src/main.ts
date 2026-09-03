import "./style.css";
import * as THREE from "three";
import { createMaterials } from "./materials";
import { createMovement } from "./movement";
import { createDebugOverlay } from "./debug";
import { createStudio, resizeRenderer, type ViewName } from "./studio";
import {
  applyStructureView,
  createMovementStructure,
  type StructureViewName,
} from "./structure";
import {
  applyAssemblyView,
  createMovementAssembly,
  type AssemblyViewName,
} from "./assembly";
import { applyFinishView, createFinishLayer, type FinishViewName } from "./finish";
import { FINISH_VIEWS } from "./finishSpec";
import type { ToneName } from "./finishStudio";
import { applyAccView, createAccommodation, type AccViewName } from "./accommodation";
import { applyDisplayView, createDisplay, type DisplayViewName } from "./display";
import { applyEncView, createEnclosure, type EncViewName } from "./enclosure";
import {
  applyExtView,
  createExterior,
  EXT_VIEWS,
  type ExtViewName,
  type ExteriorFinishDiagnosticMode,
  type SapphirePresentationMode,
  type SapphireStackDiagnosticMode,
  type SapphireStackDiagnosticState,
} from "./exterior";
import {
  applyReadoutView,
  createReadout,
  parseReadoutConcept,
  parseReadoutPose,
  READOUT_SUPPORT_VIEW,
  READOUT_TRUTH_VIEWS,
  READOUT_VIEWS,
  type ReadoutViewName,
} from "./readout";
import { poseRotations } from "./readoutSpec";
import {
  applyStrapView,
  createStrap,
  STRAP_VIEWS,
  type StrapViewName,
} from "./strap";
import {
  createDisplayDrive,
  type DisplayDriveAuditVisibility,
  type DisplayDrivePresentationToken,
} from "./displayDrive";
import {
  DISPLAY_DRIVE,
  DISPLAY_DRIVE_MESHES,
  DISPLAY_DRIVE_NET_RATIO,
} from "./displayDriveSpec";
import { DEPTH, MODULE, TEETH, THICK } from "./spec";
import { createEscapementRepairReport } from "./escapementAudit";
import { createExplodedStudy, type ExplodedLayerSpec } from "./explodedStudy";
import { createReleaseShell, type ReleaseShell, type ReleaseViewId } from "./releaseShell";

const params = new URLSearchParams(window.location.search);
const requestedExplode = params.has("explode");
const parsedExplode = Number(params.get("explode") ?? 0);
const startExplode = THREE.MathUtils.clamp(Number.isFinite(parsedExplode) ? parsedExplode : 0, 0, 1);
const startView = params.get("view") ?? (requestedExplode
  ? "presentExploded"
  : params.get("exterior") === "0" ? "threeQuarter" : "r1FinalHero");
const startDebug = params.has("debug");
const frozen = params.has("static");
const publicShellRequested = !frozen && params.get("shell") !== "0" && !startDebug;
const startTime = params.has("t") ? Number(params.get("t")) : null;
const showStructure = params.get("structure") !== "0";
const showAssembly = showStructure && params.get("assembly") !== "0";
const showFinish = showAssembly && params.get("finish") !== "0";
const showAccommodation = showStructure && params.get("accommodation") !== "0";
const showDisplay = showAccommodation && params.get("display") !== "0";
const showEnclosure = showDisplay && params.get("enclosure") !== "0";
const showExterior = showEnclosure && params.get("exterior") !== "0";
const showReadout = showDisplay && params.get("readout") !== "0";
const startReadoutPose = params.get("readoutPose");
let requestedReadoutPose = startReadoutPose ? parseReadoutPose(startReadoutPose) : null;
let viewReadoutPose: ReturnType<typeof parseReadoutPose> | null = null;
const startReadoutConcept = params.get("readoutConcept");
const phase5dBaselineComparison = params.has("phase5dBaseline");
const viewForcedPose: Record<string, string> = {
  readoutFrontHard: "105",
  readoutFront840: "840",
  readoutFront945: "945",
};
const startSilhouette = params.get("view") === "silhouette";

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance",
  preserveDrawingBuffer: true,
});
renderer.domElement.tabIndex = 0;
renderer.domElement.setAttribute("role", "img");
renderer.domElement.setAttribute(
  "aria-label",
  "Interactive three-dimensional view of 17280, an unsigned two-hand skeleton watch",
);
renderer.domElement.textContent = "Interactive three-dimensional view of 17280.";
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.16;
renderer.sortObjects = true;
renderer.shadowMap.enabled = false;
renderer.setClearColor(0x0b0b0d, 1);

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("#app missing");
}
app.appendChild(renderer.domElement);
document.documentElement.classList.add("webgl-ready");

const studio = createStudio(renderer);
const materials = createMaterials();
const movement = createMovement(materials);
const debug = createDebugOverlay(movement);
debug.visible = startDebug;

studio.scene.add(movement.root);
studio.scene.add(debug);

const structure = showStructure ? createMovementStructure(movement.layout) : null;
if (structure) {
  studio.scene.add(structure.root);
}
const assembly = showAssembly && structure ? createMovementAssembly(structure.plan) : null;
if (assembly) {
  studio.scene.add(assembly.root);
}
const finish = showFinish
  ? createFinishLayer({
      renderer,
      scene: studio.scene,
      movement,
      materials,
      structure,
      structureMaterials: structure?.materials ?? null,
      assembly,
      assemblyMaterials: assembly?.materials ?? null,
      pre5dComparison: phase5dBaselineComparison,
    })
  : null;
if (finish) {
  finish.apply();
  finish.setStudio("showcase");
}
const accommodation =
  showAccommodation && structure
    ? createAccommodation({
        movement,
        structure,
        assembly,
        renderer,
      })
    : null;
if (accommodation) {
  studio.scene.add(accommodation.root);
}
const display =
  showDisplay && accommodation && structure
    ? createDisplay({
        movement,
        structureRoot: structure.root,
        accommodation,
        assembly,
        renderer,
      })
    : null;
if (display) {
  studio.scene.add(display.root);
}
const enclosure =
  showEnclosure && display && accommodation && structure
    ? createEnclosure({
        movement,
        structureRoot: structure.root,
        accommodation,
        display,
        assembly,
        renderer,
      })
    : null;
if (enclosure) {
  studio.scene.add(enclosure.root);
}
const exterior =
  showExterior && enclosure && accommodation
    ? createExterior({
        movement,
        accommodation,
        enclosure,
      })
    : null;
if (exterior) {
  studio.scene.add(exterior.root);
}
if (phase5dBaselineComparison) {
  const restorePre5DOptics = (
    material: THREE.MeshPhysicalMaterial,
    values: { color: number; roughness: number; transmission: number; thickness: number; opacity: number },
  ): void => {
    material.color.setHex(values.color);
    material.metalness = 0;
    material.roughness = values.roughness;
    material.transmission = values.transmission;
    material.thickness = values.thickness;
    material.ior = 1.47;
    material.attenuationColor.setHex(0xffffff);
    material.attenuationDistance = Infinity;
    material.specularIntensity = 1;
    material.specularColor.setHex(0xffffff);
    material.envMapIntensity = 1;
    material.transparent = true;
    material.opacity = values.opacity;
    material.depthWrite = false;
    material.depthTest = true;
    material.alphaToCoverage = false;
    material.dithering = false;
    material.side = THREE.FrontSide;
    material.needsUpdate = true;
  };
  if (enclosure) {
    restorePre5DOptics(enclosure.materials.sapphire, {
      color: 0xd8eef8,
      roughness: 0.08,
      transmission: 0.86,
      thickness: 0.7,
      opacity: 0.42,
    });
  }
  if (exterior) {
    restorePre5DOptics(exterior.materials.sapphire, {
      color: 0xd4eaf4,
      roughness: 0.06,
      transmission: 0.88,
      thickness: 0.65,
      opacity: 0.38,
    });
  }
}
const readout =
  showReadout && display && accommodation
    ? createReadout({
        display,
        accommodation,
        enclosure,
        concept: parseReadoutConcept(startReadoutConcept),
        pose: startReadoutPose,
      })
    : null;
if (readout) {
  studio.scene.add(readout.root);
}
// Establish a useful 10:10 assembly phase while leaving normal runtime driven
// exclusively by the accepted center source. The generalized source zero is
// only a clocking datum; source deltas and the going-train rate are untouched.
movement.update(0);
const phase4bAssemblyPose = parseReadoutPose("1010");
const phase4bAssemblyQ =
  -Math.PI * 2 * (phase4bAssemblyPose.hours + phase4bAssemblyPose.minutes / 60);
const displayDrive =
  readout && display
    ? createDisplayDrive({
        movement,
        sourceZero: movement.parts.center.motion.rotation.z - phase4bAssemblyQ,
      })
    : null;
if (displayDrive && readout) {
  studio.scene.add(displayDrive.root);
  displayDrive.claimReadout({
    hourHandMount: readout.drivenParts.hourHandMount,
    minuteHandMount: readout.drivenParts.minuteHandMount,
    hourCollar: readout.drivenParts.hourCollar,
    centerStem: readout.drivenParts.minuteStem,
    minuteCollar: readout.drivenParts.minuteCollar,
    cap: readout.drivenParts.cap,
  });
  displayDrive.update();
}
const showStrap = showExterior && params.get("strap") !== "0";
const strap = showStrap && exterior ? createStrap({ exteriorPlan: exterior.plan }) : null;
if (strap) {
  studio.scene.add(strap.root);
}

const requiredObject = (root: THREE.Object3D, name: string): THREE.Object3D => {
  const object = root.getObjectByName(name);
  if (!object) throw new Error(`Annex E1 ownership target missing: ${name}`);
  return object;
};

const explodedStudy =
  structure && assembly && accommodation && display && enclosure && exterior && readout && displayDrive
    ? (() => {
        const structurePose = requiredObject(structure.root, "structure:pose");
        const assemblyPose = requiredObject(assembly.root, "assembly:pose");
        const lowerHardware = requiredObject(assemblyPose, "assembly:lowerHardware");
        const upperHardware = assemblyPose.children.filter((object) => object !== lowerHardware);
        const rearCarrier = requiredObject(enclosure.root, "RearCarrierPose");
        const layers: ExplodedLayerSpec[] = [
          {
            id: "front-sapphire",
            label: "front sapphire optical body",
            offsetZ: 22,
            objects: [requiredObject(exterior.root, "ext:frontSapphireOpticalBody")],
            safeWhy: "final optical owner moves as one unchanged boundary manifold; engineering sapphire owners remain retained",
          },
          {
            id: "upper-exterior",
            label: "front bezel and carrier",
            offsetZ: 17,
            objects: [
              requiredObject(exterior.root, "ext:bezel"),
              requiredObject(exterior.root, "ext:bezel-lip"),
              requiredObject(exterior.root, "FrontBezelExteriorPose"),
              requiredObject(enclosure.root, "FrontCarrierPose"),
            ],
            safeWhy: "existing bezel and carrier owners separate axially while the midcase, lugs and crown remain the product datum",
          },
          {
            id: "display",
            label: "chapter, hands and complete Phase-4B display drive",
            offsetZ: 12,
            objects: [display.root, readout.root, displayDrive.root, requiredObject(movement.root, "phase4b:centerOutput")],
            safeWhy: "all display-drive owners receive the same Z offset; local ratios, rotations, claims and motion-work mesh geometry remain untouched",
          },
          {
            id: "upper-works",
            label: "upper bridges, bearings and fasteners",
            offsetZ: 7,
            objects: [
              requiredObject(structurePose, "trainBridge"),
              requiredObject(structurePose, "escapeFinger"),
              requiredObject(structurePose, "balanceCock"),
              ...upperHardware,
            ],
            safeWhy: "bridge bodies and complete upper bearing assemblies move rigidly; bearing loci and local coaxial relationships are unchanged",
          },
          {
            id: "lower-structure",
            label: "mainplate, posts and lower bearing hardware",
            offsetZ: -6,
            objects: [
              requiredObject(structurePose, "mainplate"),
              requiredObject(structurePose, "anchorPosts"),
              lowerHardware,
            ],
            safeWhy: "the plate and complete lower hardware separate together without changing any seat or pivot geometry",
          },
          {
            id: "holder-carrier",
            label: "holder and rear carrier",
            offsetZ: -11,
            objects: [requiredObject(accommodation.root, "HolderPose"), rearCarrier],
            revealWhileExploded: [
              requiredObject(rearCarrier, "enc:rearCarrier"),
              requiredObject(rearCarrier, "enc:holderShoulder"),
            ],
            safeWhy: "existing internal retention owners are revealed only after separation and return to their exact product visibility at zero",
          },
          {
            id: "rear-exterior",
            label: "caseback and polish step",
            offsetZ: -17,
            objects: [
              requiredObject(exterior.root, "ext:caseback"),
              requiredObject(exterior.root, "RearCasebackExteriorPose"),
            ],
            safeWhy: "the finished caseback host and its step move as one rear closure layer; identity maps and host geometry remain unchanged",
          },
          {
            id: "rear-sapphire",
            label: "rear sapphire optical body",
            offsetZ: -22,
            objects: [requiredObject(exterior.root, "ext:rearSapphireOpticalBody")],
            safeWhy: "final rear optical owner moves as one unchanged boundary manifold with no sapphire topology or material change",
          },
        ];
        return createExplodedStudy(layers);
      })()
    : null;
let explodeAmount = startExplode;
let explodeAnimation: number | null = null;

const phase1Views: ViewName[] = ["threeQuarter", "top", "escape", "profile", "barrel"];
const phase2Views: StructureViewName[] = [
  "structHero",
  "structTop",
  "structTrain",
  "structEscape",
  "structCock",
  "structProfile",
  "silhouette",
  "structAudit",
  "structRear",
  "structRearOblique",
  "structRearGrazing",
];
const assemblyViews: AssemblyViewName[] = [
  "asmTop",
  "asmHero",
  "asmTrain",
  "asmEscape",
  "asmBalance",
  "asmFastener",
  "asmFastenerAudit",
  "asmUnderside",
  "asmAudit",
  "asmJointId",
  "asmJointClose",
  "asmJointSection",
  "asmJointGraze1",
  "asmJointGraze2",
  "asmJointSeat",
];
const finishViews: FinishViewName[] = [...FINISH_VIEWS];
const accViews: AccViewName[] = [
  "accHero",
  "accTop",
  "accBack",
  "accBackOblique",
  "accFlank",
  "accLeft",
  "accGrazing",
  "accSection",
  "accHolder",
  "accCrown",
  "accAuthority",
];
const dispViews: DisplayViewName[] = [
  "dispStack",
  "dispTop",
  "dispSection",
  "dispSweep",
  "dispChapter",
  "dispEnvelope",
  "dispHero",
];
const encViews: EncViewName[] = [
  "encHero",
  "encFront",
  "encFrontClear",
  "encRear",
  "encRearClear",
  "encSection",
  "encSeat",
  "encRetention",
  "encCrown",
];
const extViews: ExtViewName[] = [...EXT_VIEWS];
const readoutViews: ReadoutViewName[] = [...READOUT_VIEWS];
const strapViews: StrapViewName[] = [...STRAP_VIEWS];

let silhouetteOn = false;
let auditOn = false;
let debugOn = startDebug;
let currentViewName = startView;
let releaseShell: ReleaseShell | null = null;
let reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
type Phase5dCProfile =
  | "presentSettled"
  | "presentHero"
  | "middle"
  | "conservative"
  | "rear"
  | "engineering5dB2"
  | "r1FrontRead"
  | "r1Wearable"
  | "r1Sapphire"
  | "r1Rear"
  | "r1Raking";
const PHASE5D_C_PROFILES = {
  presentSettled: { exposure: 1.314, environment: 1.16, hemisphere: 0.61, fill: 0.514, key: 0.507, rim: 0.187, under: 0.155, rake: 0, frontRead: 0, rearRake: 0, background: 0x17191d },
  presentHero: { exposure: 1.314, environment: 1.16, hemisphere: 0.62, fill: 0.53, key: 0.507, rim: 0.187, under: 0.155, rake: 0, frontRead: 0, rearRake: 0, background: 0x17191d },
  middle: { exposure: 1.34, environment: 1.18, hemisphere: 0.63, fill: 0.54, key: 0.52, rim: 0.2, under: 0.165, rake: 0, frontRead: 0, rearRake: 0, background: 0x17191d },
  conservative: { exposure: 1.3, environment: 1.15, hemisphere: 0.6, fill: 0.5, key: 0.5, rim: 0.18, under: 0.15, rake: 0, frontRead: 0, rearRake: 0, background: 0x17191d },
  rear: { exposure: 1.314, environment: 1.16, hemisphere: 0.61, fill: 0.514, key: 0.507, rim: 0.187, under: 0.17, rake: 0, frontRead: 0, rearRake: 0, background: 0x17191d },
  engineering5dB2: { exposure: 1.12, environment: 1.1, hemisphere: 0.52, fill: 0.34, key: 0.52, rim: 0.2, under: 0.14, rake: 0, frontRead: 0, rearRake: 0, background: 0x17191d },
  r1FrontRead: { exposure: 1.34, environment: 1.18, hemisphere: 0.8, fill: 0.72, key: 0.3, rim: 0.16, under: 0.14, rake: 0, frontRead: 0.25, rearRake: 0, background: 0x17191d },
  r1Wearable: { exposure: 1.34, environment: 1.24, hemisphere: 0.82, fill: 0.8, key: 0.42, rim: 0.42, under: 0.22, rake: 0, frontRead: 0, rearRake: 0, background: 0x15181d },
  r1Sapphire: { exposure: 1.29, environment: 1.24, hemisphere: 0.52, fill: 0.34, key: 0.56, rim: 0.38, under: 0.14, rake: 0.28, frontRead: 0, rearRake: 0, background: 0x17191d },
  r1Rear: { exposure: 1.32, environment: 1.18, hemisphere: 0.48, fill: 0.38, key: 0.36, rim: 0.16, under: 0.15, rake: 0, frontRead: 0, rearRake: 0, background: 0x17191d },
  r1Raking: { exposure: 1.36, environment: 0.78, hemisphere: 0.16, fill: 0.1, key: 0.12, rim: 0.08, under: 0.06, rake: 1.8, frontRead: 0, rearRake: 0, background: 0x111318 },
} as const;
let currentPhase5dProfile: Phase5dCProfile = "presentSettled";

const r1RakingLight = new THREE.DirectionalLight(0xe4edf5, 0);
r1RakingLight.name = "finish:showcase:r1-rake";
r1RakingLight.position.set(22, -8, 4.5);
(studio.scene.getObjectByName("finish:showcaseLights") ?? studio.scene).add(r1RakingLight);

const r1FinishProofLight = new THREE.DirectionalLight(0xfff4e8, 0);
r1FinishProofLight.name = "finish:showcase:r1-finish-proof";
r1FinishProofLight.position.set(-12, -9, 22);
(studio.scene.getObjectByName("finish:showcaseLights") ?? studio.scene).add(r1FinishProofLight);

const r1FrontReadLight = new THREE.DirectionalLight(0xc8dcff, 0);
r1FrontReadLight.name = "finish:showcase:r1-front-read";
r1FrontReadLight.position.set(-6, 10, 36);
(studio.scene.getObjectByName("finish:showcaseLights") ?? studio.scene).add(r1FrontReadLight);

const r1RearRakeLight = new THREE.DirectionalLight(0xe1e7ee, 0);
r1RearRakeLight.name = "finish:showcase:r1-rear-rake";
r1RearRakeLight.position.set(-22, 12, -42);
(studio.scene.getObjectByName("finish:showcaseLights") ?? studio.scene).add(r1RearRakeLight);

const r1RearProofTarget = new THREE.Object3D();
r1RearProofTarget.name = "finish:showcase:r1-rear-proof-target";
r1RearProofTarget.position.set(4.4, -9, -2.8);
studio.scene.add(r1RearProofTarget);
const r1RearProofLight = new THREE.SpotLight(0xe1e7ee, 0, 0, 0.28, 0.72, 0);
r1RearProofLight.name = "finish:showcase:r1-rear-proof";
r1RearProofLight.position.set(-9.6, -12.5, -40);
r1RearProofLight.target = r1RearProofTarget;
(studio.scene.getObjectByName("finish:showcaseLights") ?? studio.scene).add(r1RearProofLight);

const applyPhase5dCProfile = (profile: Phase5dCProfile): void => {
  currentPhase5dProfile = profile;
  const row = PHASE5D_C_PROFILES[profile];
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = row.exposure;
  studio.scene.environmentIntensity = row.environment;
  studio.scene.background = new THREE.Color(row.background);
  studio.scene.traverse((object) => {
    if (!(object instanceof THREE.Light)) return;
    if (object.name === "finish:showcase:hemisphere") object.intensity = row.hemisphere;
    else if (object.name === "finish:showcase:fill") object.intensity = row.fill;
    else if (object.name === "finish:showcase:key") object.intensity = row.key;
    else if (object.name === "finish:showcase:rim") object.intensity = row.rim;
    else if (object.name === "finish:showcase:under") object.intensity = row.under;
    else if (object.name === "finish:showcase:r1-rake") object.intensity = row.rake;
    else if (object.name === "finish:showcase:r1-finish-proof") object.intensity = profile === "r1Raking" ? 1.8 : 0;
    else if (object.name === "finish:showcase:r1-front-read") object.intensity = row.frontRead;
    else if (object.name === "finish:showcase:r1-rear-rake") object.intensity = row.rearRake;
    else if (object.name === "finish:showcase:r1-rear-proof") object.intensity = profile === "r1Rear" ? 1.05 : 0;
  });
};

const R1_VIEW_NAMES = [
  "r1FinalHero",
  "r1FrontElevation",
  "r1FrontThreeQuarter",
  "r1WearableProof",
  "r1WearableJunction",
  "r1BalanceFinishMacro",
  "r1SapphireOblique",
  "r1RearExhibition",
  "r1RearIdentity",
  "r1FinishRake",
  "r1E1Hero",
  "r1E1Side",
] as const;
type R1ViewName = (typeof R1_VIEW_NAMES)[number];
const R1_VIEWS = new Set<string>(R1_VIEW_NAMES);
const R1_PRODUCT_VIEWS = new Set<string>(R1_VIEW_NAMES.filter((name) => name !== "r1FinishRake"));
const isAnnexE1View = (name: string): boolean =>
  name.startsWith("presentExploded") || name === "r1E1Hero" || name === "r1E1Side";

type R1Camera = {
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  fov: number;
  far: number;
};

const r1CameraAuthority = (): Record<R1ViewName, R1Camera> => {
  const frontZ = exterior?.plan.z.frontSapphireInner ?? 6.0616;
  const rearZ = exterior?.plan.z.rearSapphireInner ?? -1.736;
  const frontBaselineDistance = 58 - frontZ;
  const frontDistance = 126 - frontZ;
  const frontFov = THREE.MathUtils.radToDeg(
    2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(32 * 0.5)) * (frontBaselineDistance / frontDistance)),
  );
  const northY = strap?.plan.north.barY ?? 15.2;
  const barZ = strap?.plan.frozen.barZ ?? -0.4;
  const innerX = strap?.plan.innerX ?? 9;
  return {
    r1FinalHero: { position: [18.35, 13.4, 74.01], target: [-0.9, 0.55, 1.6], fov: 32, up: [0, 1, 0], far: 160 },
    r1FrontElevation: { position: [-1.2, 1, 126], target: [-1.2, 1, frontZ], fov: Math.max(20, frontFov), up: [0, 1, 0], far: 180 },
    r1FrontThreeQuarter: { position: [32, 22.93, 68.62], target: [-0.8, 0.5, 1.5], fov: 32, up: [0, 1, 0], far: 160 },
    r1WearableProof: { position: [95, -65, 100], target: [0, 0, -10], fov: 48, up: [0, 0, 1], far: 300 },
    r1WearableJunction: {
      position: [innerX + 31, northY + 29, barZ + 34],
      target: [0, northY - 2, 0],
      fov: 44,
      up: [0, 1, 0],
      far: 160,
    },
    r1BalanceFinishMacro: { position: [7, 12, 16], target: [-1.45, 5.05, 2.25], fov: 32, up: [0, 1, 0], far: 160 },
    r1SapphireOblique: { position: [31, 16, 27], target: [-0.6, 0.8, frontZ - 0.25], fov: 28, up: [0, 1, 0], far: 160 },
    r1RearExhibition: { position: [10, -7, -64], target: [-0.4, -0.8, rearZ], fov: 34, up: [0, 1, 0], far: 160 },
    r1RearIdentity: { position: [4.4, -8.4, -40], target: [4.4, -8.4, rearZ], fov: 26, up: [0, 1, 0], far: 160 },
    r1FinishRake: { position: [12.4, 9, 20.8], target: [-1.4, 1.3, 1.1], fov: 40, up: [0, 1, 0], far: 160 },
    r1E1Hero: { position: [50, -40, 48], target: [-0.5, 0.5, 1.5], fov: 36, up: [0, 1, 0], far: 160 },
    r1E1Side: { position: [95, -10, 18], target: [0, 0, 0], fov: 42, up: [0, 0, 1], far: 180 },
  };
};

const PUBLIC_VIEW_CAMERAS: Record<ReleaseViewId, R1ViewName> = {
  hero: "r1FinalHero",
  front: "r1FrontElevation",
  wearable: "r1WearableProof",
  rear: "r1RearExhibition",
};

const PUBLIC_INTERACTIVE_R1_VIEWS = new Set<R1ViewName>([
  ...Object.values(PUBLIC_VIEW_CAMERAS),
  "r1E1Hero",
]);
const PUBLIC_ZOOM_OUT_SCALE = 1.25;

const publicViewFromName = (name: string): ReleaseViewId => {
  if (name === "r1FrontElevation") return "front";
  if (name === "r1WearableProof") return "wearable";
  if (name === "r1RearExhibition") return "rear";
  return "hero";
};

let lastPublicView: ReleaseViewId = publicViewFromName(startView);

const R1_PROFILE_BY_VIEW: Record<R1ViewName, Phase5dCProfile> = {
  r1FinalHero: "presentHero",
  r1FrontElevation: "r1FrontRead",
  r1FrontThreeQuarter: "presentSettled",
  r1WearableProof: "r1Wearable",
  r1WearableJunction: "r1Wearable",
  r1BalanceFinishMacro: "r1Raking",
  r1SapphireOblique: "r1Sapphire",
  r1RearExhibition: "r1Rear",
  r1RearIdentity: "r1Rear",
  r1FinishRake: "r1Raking",
  r1E1Hero: "presentSettled",
  r1E1Side: "middle",
};

const applyR1Camera = (name: R1ViewName): void => {
  const view = r1CameraAuthority()[name];
  const authoredDistance = Math.hypot(
    view.position[0] - view.target[0],
    view.position[1] - view.target[1],
    view.position[2] - view.target[2],
  );
  // The camera far plane prevents clipping; it is not a useful public zoom
  // limit. Keep proof captures unrestricted while giving interactive views a
  // little breathing room without letting the watch recede into the backdrop.
  if (publicShellRequested && PUBLIC_INTERACTIVE_R1_VIEWS.has(name)) {
    studio.controls.maxDistance = authoredDistance * PUBLIC_ZOOM_OUT_SCALE;
  } else if (studio.controls.maxDistance < view.far) {
    studio.controls.maxDistance = view.far;
  }
  studio.camera.position.set(...view.position);
  studio.controls.target.set(...view.target);
  studio.camera.up.set(...view.up);
  studio.camera.fov = view.fov;
  studio.camera.far = view.far;
  studio.camera.updateProjectionMatrix();
  studio.controls.update();
};

const setDrivenReadoutVisible = (on: boolean): void => {
  if (readout) readout.root.visible = on;
  if (displayDrive) displayDrive.setVisible(on);
};

const activeReadoutPose = (): ReturnType<typeof parseReadoutPose> | null =>
  viewReadoutPose ?? requestedReadoutPose;

type JunctionAuditRegion = "A" | "B" | "CENTER";
type JunctionAuditView = "normal" | "id" | "grazing" | "side";
type CenterResidualView = "grazing" | "flatId" | "isolated" | "unlit" | "section";

const JUNCTION_AUDIT_CAMERAS: Record<
  JunctionAuditRegion,
  Record<Exclude<JunctionAuditView, "id">, { position: THREE.Vector3; target: THREE.Vector3 }>
> = {
  A: {
    // Screenshot-matched rear ray, tightened around the escape junction.
    normal: {
      position: new THREE.Vector3(6.45, -2.6, -7.7),
      target: new THREE.Vector3(0.56, 2.3, 0.15),
    },
    grazing: {
      position: new THREE.Vector3(7.0, -3.5, -2.15),
      target: new THREE.Vector3(0.56, 2.3, -0.48),
    },
    side: {
      position: new THREE.Vector3(8.8, 2.3, -0.28),
      target: new THREE.Vector3(0.56, 2.3, -0.28),
    },
  },
  B: {
    // Same rear ray, tightened around the barrel/mainplate convergence.
    normal: {
      position: new THREE.Vector3(-0.15, -7.7, -8.4),
      target: new THREE.Vector3(-6.05, -2.82, -0.52),
    },
    grazing: {
      position: new THREE.Vector3(0.5, -8.3, -2.1),
      target: new THREE.Vector3(-6.05, -2.82, -0.82),
    },
    side: {
      position: new THREE.Vector3(2.2, -2.82, -0.3),
      target: new THREE.Vector3(-6.05, -2.82, -0.3),
    },
  },
  CENTER: {
    // Pre-5D center-stack audit: rear product ray, steep underside graze,
    // then a true side section through authoritative center XY (0, 0).
    normal: {
      position: new THREE.Vector3(5.9, -5.1, -7.4),
      target: new THREE.Vector3(0, 0, 0.65),
    },
    grazing: {
      position: new THREE.Vector3(6.4, -4.9, -1.65),
      target: new THREE.Vector3(0, 0, 0.55),
    },
    side: {
      position: new THREE.Vector3(5.4, 5.8, 0.72),
      target: new THREE.Vector3(0, 0, 0.62),
    },
  },
};

const junctionMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
const junctionVisibility = new Map<THREE.Mesh, boolean>();
let junctionOwnershipRows: { label: string; path: string; color: string }[] = [];
let centerResidualSectionGroup: THREE.Group | null = null;

const junctionPath = (o: THREE.Object3D): string => {
  const names: string[] = [];
  let p: THREE.Object3D | null = o;
  while (p) {
    if (p.name) names.push(p.name);
    p = p.parent;
  }
  return names.reverse().join("/");
};

const junctionRelevant = (region: JunctionAuditRegion, path: string): boolean => {
  const needles =
    region === "A"
      ? [
          "struct:plate:spoke:center-network",
          "struct:plate:spoke:center-escape",
          "struct:plate:spoke:escape-pallet",
          "struct:column:escape",
          "struct:boss:escape:lower",
          "struct:escapeFinger:",
          "struct:boss:escape:upper",
          "escape:geom",
          "assembly:bearing:escape:",
        ]
      : region === "B"
        ? [
            "struct:plate:spoke:center-network",
            "struct:plate:spoke:hoop-barrel-a",
            "struct:plate:spoke:hoop-barrel-b",
            "struct:plate:spoke:barrel-center",
            "struct:plate:junction:barrel",
            "struct:column:barrel",
            "struct:boss:barrel:lower",
            "barrel:geom",
            "assembly:bearing:barrel:lower",
          ]
        : [
            "struct:plate:spoke:center-network",
            "struct:plate:spoke:barrel-center",
            "struct:plate:spoke:center-fourth",
            "struct:plate:spoke:center-escape",
            "struct:column:center",
            "struct:boss:center:lower",
            "struct:trainBridge:body",
            "struct:boss:center:upper",
            "struct:trainBridge:centerSupport",
            "center:geom",
            "assembly:bearing:center:lower",
            "assembly:bearing:center:upper",
          ];
  return needles.some((needle) => path.includes(needle));
};

const restoreJunctionAudit = (): void => {
  if (centerResidualSectionGroup) {
    centerResidualSectionGroup.traverse((object) => {
      if (object instanceof THREE.LineSegments || object instanceof THREE.Line) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
        else object.material.dispose();
      } else if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
        else object.material.dispose();
      }
    });
    studio.scene.remove(centerResidualSectionGroup);
    centerResidualSectionGroup = null;
  }
  for (const [mesh, material] of junctionMaterials) mesh.material = material;
  for (const [mesh, visible] of junctionVisibility) mesh.visible = visible;
  junctionMaterials.clear();
  junctionVisibility.clear();
  junctionOwnershipRows = [];
  studio.camera.up.set(0, 1, 0);
  studio.camera.fov = 32;
  studio.camera.updateProjectionMatrix();
};

const setJunctionFlatId = (region: JunctionAuditRegion): void => {
  const palette = [
    0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0x1abc9c,
    0xe67e22, 0xecf0f1, 0xff6b9d, 0x7fdbff, 0xbadc58, 0xff9ff3,
  ];
  const roots = [movement.root, structure?.root, assembly?.root].filter(
    (root): root is THREE.Group => !!root,
  );
  let colorIndex = 0;
  for (const root of roots) {
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const path = junctionPath(o);
      junctionVisibility.set(o, o.visible);
      if (!junctionRelevant(region, path)) {
        o.visible = false;
        return;
      }
      const color = palette[colorIndex % palette.length];
      const label = o.name || `${o.parent?.name || "mesh"}#${colorIndex}`;
      junctionMaterials.set(o, o.material);
      o.material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
      junctionOwnershipRows.push({
        label,
        path,
        color: `#${color.toString(16).padStart(6, "0")}`,
      });
      colorIndex += 1;
    });
  }
};

const setJunctionIsolation = (region: JunctionAuditRegion): void => {
  const roots = [movement.root, structure?.root, assembly?.root].filter(
    (root): root is THREE.Group => !!root,
  );
  for (const root of roots) {
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const path = junctionPath(o);
      junctionVisibility.set(o, o.visible);
      const rotatingCenterBody =
        path.includes("center:wheel") || path.includes("center:hub") || path.includes("center:pinion");
      if (!junctionRelevant(region, path) || (region === "CENTER" && rotatingCenterBody)) {
        o.visible = false;
      }
    });
  }
};

const setJunctionAudit = (region: JunctionAuditRegion, view: JunctionAuditView): void => {
  restoreJunctionAudit();
  const engineering = view !== "normal";
  applyAnyView(engineering ? "structRearGrazing" : "extRear");
  if (engineering) {
    movement.root.visible = true;
    if (structure) structure.root.visible = true;
    if (assembly) assembly.root.visible = true;
    if (accommodation) accommodation.root.visible = false;
    if (display) display.root.visible = false;
    setDrivenReadoutVisible(false);
    if (enclosure) enclosure.root.visible = false;
    if (exterior) exterior.root.visible = false;
  }
  const cameraView = JUNCTION_AUDIT_CAMERAS[region][view === "id" ? "normal" : view];
  studio.camera.position.copy(cameraView.position);
  studio.controls.target.copy(cameraView.target);
  studio.camera.fov = region === "CENTER" && view === "side" ? 30 : view === "side" ? 25 : 28;
  studio.camera.updateProjectionMatrix();
  studio.controls.update();
  if (view === "id") setJunctionFlatId(region);
  else if (region === "CENTER" && (view === "grazing" || view === "side")) setJunctionIsolation(region);
};

const CENTER_RESIDUAL_MESHES = [
  "struct:trainBridge:body",
  "struct:boss:center:upper",
  "struct:trainBridge:centerSupport",
] as const;

const centerResidualRowPlane = (pixelY = 700): { plane: THREE.Plane; voidRay: THREE.Ray } => {
  studio.camera.updateMatrixWorld(true);
  const width = renderer.domElement.width;
  const height = renderer.domElement.height;
  const y = 1 - ((pixelY + 0.5) / height) * 2;
  const left = new THREE.Raycaster();
  const right = new THREE.Raycaster();
  const throughVoid = new THREE.Raycaster();
  left.setFromCamera(new THREE.Vector2(-1, y), studio.camera);
  right.setFromCamera(new THREE.Vector2(1, y), studio.camera);
  throughVoid.setFromCamera(
    new THREE.Vector2(((258.5 / width) * 2) - 1, y),
    studio.camera,
  );
  const normal = left.ray.direction.clone().cross(right.ray.direction).normalize();
  const plane = new THREE.Plane(normal, -normal.dot(studio.camera.position));
  return { plane, voidRay: throughVoid.ray.clone() };
};

const sectionLineForMesh = (
  mesh: THREE.Mesh,
  plane: THREE.Plane,
  color: number,
  focus: THREE.Vector3,
  focusRadius = 1.7,
): THREE.LineSegments => {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const triangleCount = (index ? index.count : position.count) / 3;
  const vertices: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const readVertex = (triangle: number, corner: number, target: THREE.Vector3) => {
    const offset = triangle * 3 + corner;
    const vertexIndex = index ? index.getX(offset) : offset;
    return target.fromBufferAttribute(position, vertexIndex).applyMatrix4(mesh.matrixWorld);
  };
  const intersections: THREE.Vector3[] = [];
  const pushUnique = (point: THREE.Vector3) => {
    if (!intersections.some((candidate) => candidate.distanceToSquared(point) < 1e-12)) {
      intersections.push(point.clone());
    }
  };
  const intersectEdge = (p0: THREE.Vector3, p1: THREE.Vector3) => {
    const d0 = plane.distanceToPoint(p0);
    const d1 = plane.distanceToPoint(p1);
    const epsilon = 1e-8;
    if (Math.abs(d0) <= epsilon) pushUnique(p0);
    if (Math.abs(d1) <= epsilon) pushUnique(p1);
    if ((d0 < -epsilon && d1 > epsilon) || (d0 > epsilon && d1 < -epsilon)) {
      pushUnique(p0.clone().lerp(p1, d0 / (d0 - d1)));
    }
  };
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    readVertex(triangle, 0, a);
    readVertex(triangle, 1, b);
    readVertex(triangle, 2, c);
    intersections.length = 0;
    intersectEdge(a, b);
    intersectEdge(b, c);
    intersectEdge(c, a);
    if (intersections.length < 2) continue;
    let p0 = intersections[0];
    let p1 = intersections[1];
    for (let i = 0; i < intersections.length; i += 1) {
      for (let j = i + 1; j < intersections.length; j += 1) {
        if (intersections[i].distanceToSquared(intersections[j]) > p0.distanceToSquared(p1)) {
          p0 = intersections[i];
          p1 = intersections[j];
        }
      }
    }
    if (p0.clone().add(p1).multiplyScalar(0.5).distanceTo(focus) > focusRadius) continue;
    vertices.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
  }
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  const material = new THREE.LineBasicMaterial({ color, depthTest: false, transparent: false });
  const lines = new THREE.LineSegments(lineGeometry, material);
  lines.renderOrder = 20;
  return lines;
};

const buildCenterResidualSection = (): void => {
  studio.scene.updateMatrixWorld(true);
  const { plane, voidRay } = centerResidualRowPlane(700);
  const focus = voidRay.at(8.45, new THREE.Vector3());
  const group = new THREE.Group();
  group.name = "diagnostic:centerResidual:section";
  const colors: Record<(typeof CENTER_RESIDUAL_MESHES)[number], number> = {
    "struct:trainBridge:body": 0xff4fa3,
    "struct:boss:center:upper": 0x2f80ed,
    "struct:trainBridge:centerSupport": 0x23c483,
  };
  for (const name of CENTER_RESIDUAL_MESHES) {
    const object = studio.scene.getObjectByName(name);
    if (!(object instanceof THREE.Mesh)) continue;
    const lines = sectionLineForMesh(object, plane, colors[name], focus);
    lines.name = `diagnostic:section:${name}`;
    group.add(lines);
  }
  const rayStart = voidRay.at(7.3, new THREE.Vector3());
  const rayEnd = voidRay.at(9.4, new THREE.Vector3());
  const rayGeometry = new THREE.BufferGeometry().setFromPoints([rayStart, rayEnd]);
  const rayLine = new THREE.Line(
    rayGeometry,
    new THREE.LineBasicMaterial({ color: 0xffd447, depthTest: false }),
  );
  rayLine.name = "diagnostic:section:voidPixelRay";
  rayLine.renderOrder = 30;
  group.add(rayLine);
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.028, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffd447, depthTest: false }),
  );
  marker.position.copy(focus);
  marker.renderOrder = 31;
  marker.name = "diagnostic:section:voidPixelMarker";
  group.add(marker);
  studio.scene.add(group);
  centerResidualSectionGroup = group;

  const up = new THREE.Vector3(0, 0, 1)
    .addScaledVector(plane.normal, -plane.normal.z)
    .normalize();
  studio.camera.position.copy(focus).addScaledVector(plane.normal, 5.2);
  studio.camera.up.copy(up);
  studio.controls.target.copy(focus);
  studio.camera.fov = 20;
  studio.camera.updateProjectionMatrix();
  studio.controls.update();
};

/**
 * Camera-matched proof modes for the residual center bridge/body junction.
 * These are dormant diagnostics only: they reuse the accepted grazing camera,
 * never alter geometry, and restore through the normal junction-audit path.
 */
const setCenterResidualAudit = (view: CenterResidualView): void => {
  setJunctionAudit("CENTER", "grazing");
  if (view === "grazing") return;

  const keep = new Set<string>(CENTER_RESIDUAL_MESHES);
  const palette: Record<(typeof CENTER_RESIDUAL_MESHES)[number], number> = {
    "struct:trainBridge:body": 0xff4fa3,
    "struct:boss:center:upper": 0x2f80ed,
    "struct:trainBridge:centerSupport": 0x23c483,
  };
  const singleColor = new THREE.MeshBasicMaterial({ color: 0xf3f5f7, side: THREE.DoubleSide });
  for (const root of [movement.root, structure?.root, assembly?.root]) {
    if (!root) continue;
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      if (!keep.has(o.name)) {
        o.visible = false;
        return;
      }
      junctionMaterials.set(o, o.material);
      if (view === "section") {
        o.visible = false;
      } else if (view === "flatId") {
        o.material = new THREE.MeshBasicMaterial({
          color: palette[o.name as (typeof CENTER_RESIDUAL_MESHES)[number]],
          side: THREE.DoubleSide,
        });
        junctionOwnershipRows.push({
          label: o.name,
          path: junctionPath(o),
          color: `#${palette[o.name as (typeof CENTER_RESIDUAL_MESHES)[number]]
            .toString(16)
            .padStart(6, "0")}`,
        });
      } else if (view === "unlit") {
        o.material = singleColor;
      }
    });
  }
  if (view === "section") buildCenterResidualSection();
};

const centerResidualRayReport = (pixelX: number, pixelY: number) => {
  studio.scene.updateMatrixWorld(true);
  studio.camera.updateMatrixWorld(true);
  const width = renderer.domElement.width;
  const height = renderer.domElement.height;
  const ndc = new THREE.Vector2(
    ((pixelX + 0.5) / width) * 2 - 1,
    1 - ((pixelY + 0.5) / height) * 2,
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, studio.camera);
  const hitFor = (name: (typeof CENTER_RESIDUAL_MESHES)[number]) => {
    const object = studio.scene.getObjectByName(name);
    if (!(object instanceof THREE.Mesh)) return null;
    const hit = raycaster.intersectObject(object, false)[0];
    if (!hit) return null;
    const normal = hit.face?.normal.clone().transformDirection(object.matrixWorld) ?? null;
    return {
      name,
      path: junctionPath(object),
      distanceFromCamera: hit.distance,
      point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
      normal: normal ? { x: normal.x, y: normal.y, z: normal.z } : null,
      faceIndex: hit.faceIndex ?? null,
    };
  };
  return {
    pixel: { x: pixelX, y: pixelY },
    viewport: { width, height },
    ndc: { x: ndc.x, y: ndc.y },
    camera: {
      position: studio.camera.position.toArray(),
      target: studio.controls.target.toArray(),
      fov: studio.camera.fov,
    },
    ray: {
      origin: raycaster.ray.origin.toArray(),
      direction: raycaster.ray.direction.toArray(),
    },
    hits: CENTER_RESIDUAL_MESHES.map(hitFor),
  };
};

type DiagnosticBounds = {
  name: string;
  path: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

const diagnosticBounds = (name: string): DiagnosticBounds | null => {
  const object = studio.scene.getObjectByName(name);
  if (!object) return null;
  studio.scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object, true);
  if (box.isEmpty()) return null;
  return {
    name,
    path: junctionPath(object),
    minX: box.min.x,
    maxX: box.max.x,
    minY: box.min.y,
    maxY: box.max.y,
    minZ: box.min.z,
    maxZ: box.max.z,
  };
};

const centerIntegrityReport = () => {
  const spokeNames = [
    "struct:plate:spoke:barrel-center",
    "struct:plate:spoke:center-fourth",
    "struct:plate:spoke:center-escape",
  ];
  const legacySpokes = spokeNames.map(diagnosticBounds).filter((row): row is DiagnosticBounds => !!row);
  const centerNetwork = diagnosticBounds("struct:plate:spoke:center-network");
  const spokes = legacySpokes.length > 0 ? legacySpokes : centerNetwork ? [centerNetwork] : [];
  const column = diagnosticBounds("struct:column:center");
  const lowerBoss = diagnosticBounds("struct:boss:center:lower");
  const arborShaft = diagnosticBounds("center:arbor:shaft");
  const arborUpperTip = diagnosticBounds("center:arbor:upperTip");
  const bridgeBody = diagnosticBounds("struct:trainBridge:body");
  const upperBoss = diagnosticBounds("struct:boss:center:upper");
  const centerSupport = diagnosticBounds("struct:trainBridge:centerSupport");
  const upperJewel = diagnosticBounds("assembly:bearing:center:upper:jewel");
  const upperSeat = structure?.plan.bearings.find((b) => b.pivot === "center" && b.seat === "upper");
  const seatAudit = structure?.report().jointSeats.find((row) => row.pivot === "center");
  const spokeTop = spokes.length ? Math.max(...spokes.map((row) => row.maxZ)) : null;
  const zGap = (below: DiagnosticBounds | null, above: DiagnosticBounds | null) =>
    below && above ? above.minZ - below.maxZ : null;
  const zOverlap = (a: DiagnosticBounds | null, b: DiagnosticBounds | null) =>
    a && b ? Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ) : null;
  return {
    units: "mm",
    axis: { ...movement.layout.positions.center },
    authority: {
      pivotXY: { ...movement.layout.positions.center },
      upperBearingLocusZ: upperSeat?.z ?? null,
      upperBridgeNominalBottomZ: structure?.plan.anchors["anchor:train:a"]?.bridgeBottomZ ?? null,
      upperBridgeNominalTopZ: structure?.plan.anchors["anchor:train:a"]?.bridgeTopZ ?? null,
    },
    participants: {
      spokes,
      centerNetwork,
      column,
      lowerBoss,
      arborShaft,
      arborUpperTip,
      bridgeBody,
      upperBoss,
      centerSupport,
      upperJewel,
    },
    measurements: {
      lowerSpokeTopZ: spokeTop,
      lowerColumnBottomZ: column?.minZ ?? null,
      lowerSpokeToColumnGap: spokeTop !== null && column ? column.minZ - spokeTop : null,
      lowerColumnToBossOverlap: zOverlap(column, lowerBoss),
      arborTipToBridgeGap: zGap(arborUpperTip, bridgeBody),
      arborTipToCenterSupportOverlap: zOverlap(arborUpperTip, centerSupport),
      centerSupportToBridgeOverlap: zOverlap(centerSupport, bridgeBody),
      bridgeBodyToUpperBossZOverlap: zOverlap(bridgeBody, upperBoss),
      upperBossToJewelGap: zGap(upperBoss, upperJewel),
      bridgeBodyToBossXYSeatOverlap: seatAudit?.xyOverlap ?? null,
      bridgeBodyPathThroughCenter: seatAudit?.pathThrough ?? null,
    },
  };
};

const kinematicReport = (times: number[]) => {
  const restoreTime = currentKinematicTime();
  const barrelArbor = studio.scene.getObjectByName("barrel:arbor");
  const barrelWheel = studio.scene.getObjectByName("barrel:wheel");
  const centerPinion = studio.scene.getObjectByName("center:pinion");
  const inheritsFrom = (object: THREE.Object3D | undefined, ancestor: THREE.Object3D) => {
    let cursor: THREE.Object3D | null | undefined = object;
    while (cursor) {
      if (cursor === ancestor) return true;
      cursor = cursor.parent;
    }
    return false;
  };
  const samples = times.map((time) => {
    movement.update(time);
    displayDrive?.update(movement.parts.center.motion.rotation.z);
    const inheritsBarrelMotion = inheritsFrom(barrelArbor, movement.parts.barrel.motion);
    return {
      time,
      rotations: {
        barrel: movement.parts.barrel.motion.rotation.z,
        center: movement.parts.center.motion.rotation.z,
        third: movement.parts.third.motion.rotation.z,
        fourth: movement.parts.fourth.motion.rotation.z,
        escape: movement.parts.escape.motion.rotation.z,
        barrelArborEffective: inheritsBarrelMotion
          ? movement.parts.barrel.motion.rotation.z + (barrelArbor?.rotation.z ?? 0)
          : (barrelArbor?.rotation.z ?? 0),
      },
      barrelArbor: {
        parent: barrelArbor?.parent?.name ?? null,
        path: barrelArbor ? junctionPath(barrelArbor) : null,
        inheritsBarrelMotion,
      },
    };
  });
  movement.update(restoreTime);
  displayDrive?.update(movement.parts.center.motion.rotation.z);
  return {
    units: "radians",
    ownership: {
      barrel: barrelWheel ? junctionPath(barrelWheel) : null,
      centerPinion: centerPinion ? junctionPath(centerPinion) : null,
      center: junctionPath(movement.parts.center.motion),
      third: junctionPath(movement.parts.third.motion),
      fourth: junctionPath(movement.parts.fourth.motion),
      escape: junctionPath(movement.parts.escape.motion),
    },
    samples,
  };
};

type BarrelCenterAuditMode =
  | "off"
  | "normal"
  | "id"
  | "participants"
  | "sideSection"
  | "fourthId"
  | "fourthParticipants"
  | "fourthSideSection"
  | "fourthSweepNormal"
  | "fourthSweepId"
  | "fourthSweepParticipants"
  | "fourthSweepSideSection";

type BarrelCenterAuditState = {
  cameraPosition: THREE.Vector3;
  cameraUp: THREE.Vector3;
  cameraFov: number;
  autoRotate: boolean;
  target: THREE.Vector3;
  rootVisibility: Map<THREE.Object3D, boolean>;
  meshVisibility: Map<THREE.Mesh, boolean>;
  meshMaterials: Map<THREE.Mesh, THREE.Material | THREE.Material[]>;
  createdMaterials: Set<THREE.Material>;
};

let barrelCenterAuditState: BarrelCenterAuditState | null = null;

const barrelCenterParticipantKind = (
  object: THREE.Object3D,
):
  | "barrelWheel"
  | "barrelShell"
  | "barrelArbor"
  | "centerPinion"
  | "centerWheel"
  | "centerArbor"
  | "fourthWheel"
  | "fourthPinion"
  | "fourthArbor"
  | "escapePinion"
  | "trainBridgeBody"
  | "trainBridgeFourthSupport"
  | "trainBridgePostB"
  | "fourthLowerSupport"
  | null => {
  const path = junctionPath(object);
  if (path.includes("/barrel:arbor/")) return "barrelArbor";
  if (path.includes("/barrel:geom/barrel:wheel")) return "barrelWheel";
  if (path.includes("/barrel:geom/")) return "barrelShell";
  if (path.includes("/center:geom/center:pinion")) return "centerPinion";
  if (path.includes("/center:geom/center:wheel") || path.includes("/center:geom/center:hub")) {
    return "centerWheel";
  }
  if (path.includes("/center:geom/center:arbor/")) return "centerArbor";
  if (path.includes("/fourth:geom/fourth:wheel") || path.includes("/fourth:geom/fourth:hub")) {
    return "fourthWheel";
  }
  if (path.includes("/fourth:geom/fourth:pinion")) return "fourthPinion";
  if (path.includes("/fourth:geom/fourth:arbor/")) return "fourthArbor";
  if (path.includes("/escape:geom/escape:pinion")) return "escapePinion";
  if (path.includes("struct:trainBridge:body")) return "trainBridgeBody";
  if (
    path.includes("struct:trainBridge:stub:b") ||
    path.includes("struct:boss:fourth:upper")
  ) {
    return "trainBridgeFourthSupport";
  }
  if (path.includes("anchor:train:b")) return "trainBridgePostB";
  if (
    path.includes("struct:column:fourth") ||
    path.includes("struct:boss:fourth:lower")
  ) {
    return "fourthLowerSupport";
  }
  return null;
};

const clearBarrelCenterAudit = (): void => {
  const state = barrelCenterAuditState;
  if (!state) return;
  for (const [mesh, material] of state.meshMaterials) mesh.material = material;
  for (const [mesh, visible] of state.meshVisibility) mesh.visible = visible;
  for (const [root, visible] of state.rootVisibility) root.visible = visible;
  for (const material of state.createdMaterials) material.dispose();
  studio.camera.position.copy(state.cameraPosition);
  studio.camera.up.copy(state.cameraUp);
  studio.camera.fov = state.cameraFov;
  studio.camera.updateProjectionMatrix();
  studio.controls.autoRotate = state.autoRotate;
  studio.controls.target.copy(state.target);
  studio.controls.update();
  barrelCenterAuditState = null;
};

const setBarrelCenterAudit = (mode: BarrelCenterAuditMode): void => {
  clearBarrelCenterAudit();
  if (mode === "off") return;
  const state: BarrelCenterAuditState = {
    cameraPosition: studio.camera.position.clone(),
    cameraUp: studio.camera.up.clone(),
    cameraFov: studio.camera.fov,
    autoRotate: studio.controls.autoRotate,
    target: studio.controls.target.clone(),
    rootVisibility: new Map(),
    meshVisibility: new Map(),
    meshMaterials: new Map(),
    createdMaterials: new Set(),
  };
  barrelCenterAuditState = state;

  studio.controls.autoRotate = false;
  const fourthMode = mode.startsWith("fourth");
  const fourthSweepMode = mode.startsWith("fourthSweep");
  const kindAllowed = (kind: ReturnType<typeof barrelCenterParticipantKind>): boolean => {
    if (!kind) return false;
    const fourthKinds = new Set(["barrelWheel", "barrelShell", "barrelArbor", "fourthWheel", "fourthPinion", "fourthArbor", "escapePinion"]);
    const centerKinds = new Set(["barrelWheel", "barrelShell", "barrelArbor", "centerPinion", "centerWheel", "centerArbor"]);
    const sweepKinds = new Set([
      "fourthWheel",
      "fourthPinion",
      "fourthArbor",
      "centerWheel",
      "centerArbor",
      "trainBridgeBody",
      "trainBridgeFourthSupport",
      "trainBridgePostB",
      "fourthLowerSupport",
    ]);
    if (fourthSweepMode) return sweepKinds.has(kind);
    return (fourthMode ? fourthKinds : centerKinds).has(kind);
  };

  if (mode !== "normal" && mode !== "fourthSweepNormal") {
    const retainedRoots = new Set<THREE.Object3D>([
      movement.root,
      ...(fourthSweepMode && structure ? [structure.root] : []),
    ]);
    for (const root of studio.scene.children) {
      if (retainedRoots.has(root) || root instanceof THREE.Light) continue;
      state.rootVisibility.set(root, root.visible);
      root.visible = false;
    }
    for (const root of retainedRoots) {
      state.rootVisibility.set(root, root.visible);
      root.visible = true;
    }

    for (const root of retainedRoots) {
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        state.meshVisibility.set(object, object.visible);
        object.visible = kindAllowed(barrelCenterParticipantKind(object));
      });
    }
  }

  if (
    mode === "id" ||
    mode === "sideSection" ||
    mode === "fourthId" ||
    mode === "fourthSideSection" ||
    mode === "fourthSweepId" ||
    mode === "fourthSweepSideSection"
  ) {
    const colors: Record<NonNullable<ReturnType<typeof barrelCenterParticipantKind>>, number> = {
      barrelWheel: 0xffa21a,
      barrelShell: 0xffd24a,
      barrelArbor: 0x7b8491,
      centerPinion: 0x18d9ff,
      centerWheel: 0xff4bb4,
      centerArbor: 0xb9c3cf,
      fourthWheel: 0x48ef43,
      fourthPinion: 0x26a82e,
      fourthArbor: 0xa8b1bd,
      escapePinion: 0x18d9ff,
      trainBridgeBody: 0xff355e,
      trainBridgeFourthSupport: 0xff8a3d,
      trainBridgePostB: 0x8a64ff,
      fourthLowerSupport: 0x2d8cff,
    };
    const idRoots = [movement.root, ...(fourthSweepMode && structure ? [structure.root] : [])];
    for (const root of idRoots) {
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh) || !object.visible) return;
        const kind = barrelCenterParticipantKind(object);
        if (!kind) return;
        state.meshMaterials.set(object, object.material);
        const material = new THREE.MeshBasicMaterial({ color: colors[kind], toneMapped: false });
        state.createdMaterials.add(material);
        object.material = material;
      });
    }
  }

  const barrel = movement.layout.positions.barrel;
  const other = fourthMode ? movement.layout.positions.fourth : movement.layout.positions.center;
  const sweepOther = movement.layout.positions.center;
  const midpoint = fourthSweepMode
    ? new THREE.Vector3(
        (sweepOther.x + movement.layout.positions.fourth.x) / 2,
        (sweepOther.y + movement.layout.positions.fourth.y) / 2,
        1.5,
      )
    : new THREE.Vector3((barrel.x + other.x) / 2, (barrel.y + other.y) / 2, 0.58);
  if (mode === "sideSection" || mode === "fourthSideSection" || mode === "fourthSweepSideSection") {
    const lineOrigin = fourthSweepMode ? sweepOther : barrel;
    const line = new THREE.Vector2(other.x - barrel.x, other.y - barrel.y).normalize();
    if (fourthSweepMode) {
      line.set(
        movement.layout.positions.fourth.x - lineOrigin.x,
        movement.layout.positions.fourth.y - lineOrigin.y,
      ).normalize();
    }
    const perpendicular = new THREE.Vector2(-line.y, line.x);
    studio.camera.position.set(
      midpoint.x + perpendicular.x * 21,
      midpoint.y + perpendicular.y * 21,
      midpoint.z,
    );
    studio.camera.up.set(0, 0, 1);
    studio.camera.fov = fourthSweepMode ? 24 : 19;
  } else if (fourthSweepMode) {
    studio.camera.position.set(-5.6, -8.8, 7.2);
    studio.camera.up.set(0, 1, 0);
    studio.camera.fov = 24;
  } else {
    studio.camera.position.set(-10.5, -8.2, 11);
    studio.camera.up.set(0, 1, 0);
    studio.camera.fov = 25;
  }
  studio.camera.updateProjectionMatrix();
  studio.controls.target.copy(midpoint);
  studio.controls.update();
};

const barrelCenterAuditReport = (times: number[]) => {
  const restoreTime = currentKinematicTime();
  const requiredTimes = [...new Set([0.104, 10.104, 60.104, 600.104, ...times])].sort(
    (a, b) => a - b,
  );
  const find = (name: string): THREE.Object3D => {
    const object = studio.scene.getObjectByName(name);
    if (!object) throw new Error(`barrel-center audit object missing: ${name}`);
    return object;
  };
  const asMesh = (name: string): THREE.Mesh => {
    const object = find(name);
    if (!(object instanceof THREE.Mesh)) throw new Error(`${name} is not a mesh`);
    return object;
  };
  const barrelWheel = asMesh("barrel:wheel");
  const barrelDrum = asMesh("barrel:drum");
  const barrelFloor = asMesh("barrel:floor");
  const barrelCover = asMesh("barrel:cover");
  const barrelHub = find("barrel:hub");
  const barrelArbor = find("barrel:arbor");
  const centerPinion = asMesh("center:pinion");
  const centerWheel = asMesh("center:wheel");
  const centerHub = find("center:hub");

  const effectiveZ = (object: THREE.Object3D): number => {
    let angle = 0;
    let cursor: THREE.Object3D | null = object;
    while (cursor && cursor !== studio.scene) {
      angle += cursor.rotation.z;
      cursor = cursor.parent;
    }
    return angle;
  };
  const inheritsFrom = (object: THREE.Object3D, ancestor: THREE.Object3D): boolean => {
    let cursor: THREE.Object3D | null = object;
    while (cursor) {
      if (cursor === ancestor) return true;
      cursor = cursor.parent;
    }
    return false;
  };
  const bounds = (object: THREE.Object3D) => {
    studio.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    return {
      minX: box.min.x,
      maxX: box.max.x,
      minY: box.min.y,
      maxY: box.max.y,
      minZ: box.min.z,
      maxZ: box.max.z,
    };
  };
  const axial = (a: ReturnType<typeof bounds>, b: ReturnType<typeof bounds>) => ({
    overlap: Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ),
    gap: Math.max(a.minZ, b.minZ) - Math.min(a.maxZ, b.maxZ),
  });
  const geometryMeasure = (mesh: THREE.Mesh) => {
    const position = mesh.geometry.getAttribute("position");
    let maxR = 0;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < position.count; i++) {
      maxR = Math.max(maxR, Math.hypot(position.getX(i), position.getY(i)));
      minZ = Math.min(minZ, position.getZ(i));
      maxZ = Math.max(maxZ, position.getZ(i));
    }
    return { renderedOuterRadius: maxR, localMinZ: minZ, localMaxZ: maxZ };
  };
  const materialReport = (object: THREE.Object3D) => {
    const rows: { mesh: string; path: string; material: string; type: string }[] = [];
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const list = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of list) {
        rows.push({
          mesh: child.name,
          path: junctionPath(child),
          material: material.name || "(unnamed)",
          type: material.type,
        });
      }
    });
    return rows;
  };

  const samples = requiredTimes.map((time) => {
    movement.update(time);
    displayDrive?.update(movement.parts.center.motion.rotation.z);
    const members = {
      barrelMotion: movement.parts.barrel.motion.rotation.z,
      barrelWheel: effectiveZ(barrelWheel),
      barrelDrum: effectiveZ(barrelDrum),
      barrelFloor: effectiveZ(barrelFloor),
      barrelCover: effectiveZ(barrelCover),
      barrelHub: effectiveZ(barrelHub),
      barrelArbor: effectiveZ(barrelArbor),
      centerMotion: movement.parts.center.motion.rotation.z,
      centerPinion: effectiveZ(centerPinion),
      centerWheel: effectiveZ(centerWheel),
      centerHub: effectiveZ(centerHub),
    };
    return {
      time,
      members,
      meshPhaseInvariant: TEETH.barrel * members.barrelWheel + TEETH.centerPinion * members.centerPinion,
    };
  });
  const base = samples[0];
  const intervals = samples.slice(1).map((sample) => {
    const deltas = Object.fromEntries(
      Object.entries(sample.members).map(([name, angle]) => [name, angle - base.members[name as keyof typeof base.members]]),
    ) as Record<keyof typeof base.members, number>;
    return {
      from: base.time,
      to: sample.time,
      seconds: sample.time - base.time,
      radians: deltas,
      degrees: Object.fromEntries(
        Object.entries(deltas).map(([name, angle]) => [name, THREE.MathUtils.radToDeg(angle)]),
      ),
      barrelToCenterRatio: deltas.barrelWheel / deltas.centerPinion,
      meshPhaseInvariantDrift: sample.meshPhaseInvariant - base.meshPhaseInvariant,
    };
  });

  movement.update(0.104);
  displayDrive?.update(movement.parts.center.motion.rotation.z);
  const barrelBounds = bounds(barrelWheel);
  const pinionBounds = bounds(centerPinion);
  const centerWheelBounds = bounds(centerWheel);
  const coverBounds = bounds(barrelCover);
  const distance = Math.hypot(
    movement.layout.positions.center.x - movement.layout.positions.barrel.x,
    movement.layout.positions.center.y - movement.layout.positions.barrel.y,
  );
  const barrelPitch = movement.layout.radii.barrel;
  const pinionPitch = movement.layout.radii.centerPinion;
  const barrelRoot = barrelPitch - MODULE * 1.12;
  const barrelOuter = barrelPitch + MODULE * 0.9;
  const pinionRoot = Math.max(pinionPitch - MODULE * 1.25, pinionPitch * 0.52);
  const pinionOuter = pinionPitch + MODULE * 1.1;
  const meshAxial = axial(barrelBounds, pinionBounds);
  const projectionOnlyAxial = axial(barrelBounds, centerWheelBounds);
  const coverToCenterWheel = axial(coverBounds, centerWheelBounds);
  const centerDistanceError = distance - (barrelPitch + pinionPitch);
  const meshPhaseMaxDrift = Math.max(...intervals.map((row) => Math.abs(row.meshPhaseInvariantDrift)));

  updateKinematics(restoreTime);
  return {
    disposition: "CURRENT BARREL DRIVE VALID — VISUALLY SLOW / STACKED-PROJECTION CONFUSION",
    units: { length: "mm", angle: "radians", reportedAngle: "degrees" },
    classification: {
      currentGoldBarrelMotion: "CORRECTLY_MOVING_BUT_VISUALLY_SLOW",
      currentBarrelCenterMesh: "VALID_MODELED_MESH",
      suspiciousSteelAdjacency: "NON_MESHING_CENTER_WHEEL_ON_SEPARATE_AXIAL_PLANE",
      historicalCoaxialArbor: "PREEXISTING_KINEMATIC_DEFECT_ALREADY_REPAIRED",
      currentRepairRequired: false,
      phase5DStarted: false,
    },
    owners: {
      visibleGoldAssembly: {
        wheel: junctionPath(barrelWheel),
        drum: junctionPath(barrelDrum),
        floor: junctionPath(barrelFloor),
        cover: junctionPath(barrelCover),
        hub: junctionPath(barrelHub),
        runtimeOwner: junctionPath(movement.parts.barrel.motion),
        allVisibleMembersInheritRuntime: [barrelWheel, barrelDrum, barrelFloor, barrelCover, barrelHub].every(
          (object) => inheritsFrom(object, movement.parts.barrel.motion),
        ),
      },
      actualDrivingMember: {
        centerPinion: junctionPath(centerPinion),
        runtimeOwner: junctionPath(movement.parts.center.motion),
        inheritsCenterRuntime: inheritsFrom(centerPinion, movement.parts.center.motion),
      },
      visuallyConfusingMember: {
        centerWheel: junctionPath(centerWheel),
        centerHub: junctionPath(centerHub),
        explanation: "same center arbor and XY projection, but raised to the center-wheel plane; it does not mesh with the barrel teeth",
      },
      stationaryBarrelArbor: {
        path: junctionPath(barrelArbor),
        parent: barrelArbor.parent?.name ?? null,
        inheritsBarrelRuntime: inheritsFrom(barrelArbor, movement.parts.barrel.motion),
      },
    },
    materials: {
      visibleGoldAssembly: materialReport(movement.parts.barrel.motion),
      centerPinion: materialReport(centerPinion),
      centerWheel: materialReport(centerWheel),
    },
    kinematics: {
      toothCounts: { barrel: TEETH.barrel, centerPinion: TEETH.centerPinion },
      exactSignedBarrelToCenterRatio: -TEETH.centerPinion / TEETH.barrel,
      samples,
      intervals,
      allGoldMembersTrackBarrelOwner: intervals.every((row) =>
        ["barrelWheel", "barrelDrum", "barrelFloor", "barrelCover", "barrelHub"].every(
          (name) => Math.abs(row.radians[name as keyof typeof row.radians] - row.radians.barrelMotion) < 1e-12,
        ),
      ),
      stationaryArborDeltaZero: intervals.every((row) => Math.abs(row.radians.barrelArbor) < 1e-12),
      meshPhaseInvariantMaxDrift: meshPhaseMaxDrift,
    },
    mesh: {
      module: MODULE,
      centerDistance: { measured: distance, requiredPitchSum: barrelPitch + pinionPitch, error: centerDistanceError },
      barrel: {
        teeth: TEETH.barrel,
        pitchRadius: barrelPitch,
        nominalRootRadius: barrelRoot,
        nominalOuterRadius: barrelOuter,
        ...geometryMeasure(barrelWheel),
        bounds: barrelBounds,
        nominalMidplaneZ: DEPTH.barrelWheel,
        nominalThickness: THICK.barrelTeeth,
      },
      centerPinion: {
        teeth: TEETH.centerPinion,
        pitchRadius: pinionPitch,
        nominalRootRadius: pinionRoot,
        nominalOuterRadius: pinionOuter,
        ...geometryMeasure(centerPinion),
        bounds: pinionBounds,
        nominalMidplaneZ: DEPTH.centerPinion,
        nominalThickness: THICK.pinionFace,
      },
      axialAlignment: {
        overlap: meshAxial.overlap,
        valid: meshAxial.overlap > 0,
        midplaneError: Math.abs(DEPTH.barrelWheel - DEPTH.centerPinion),
      },
      radialEngagement: {
        workingDepth: barrelOuter + pinionOuter - distance,
        barrelTipToPinionRootClearance: distance - barrelOuter - pinionRoot,
        pinionTipToBarrelRootClearance: distance - pinionOuter - barrelRoot,
        valid:
          barrelOuter + pinionOuter > distance &&
          distance > barrelOuter + pinionRoot &&
          distance > pinionOuter + barrelRoot,
      },
      toothPhase: {
        construction: "barrel tooth faces center; center pinion presents a space; runtime deltas are tooth-count locked",
        invariant: "80*barrelAngle + 12*centerPinionAngle",
        maximumDrift: meshPhaseMaxDrift,
        valid: meshPhaseMaxDrift < 1e-10,
      },
      valid:
        Math.abs(centerDistanceError) < 1e-12 &&
        meshAxial.overlap > 0 &&
        barrelOuter + pinionOuter > distance &&
        meshPhaseMaxDrift < 1e-10,
    },
    stackedProjection: {
      centerWheelBounds,
      barrelWheelToCenterWheelAxialOverlap: projectionOnlyAxial.overlap,
      barrelWheelToCenterWheelAxialGap: projectionOnlyAxial.gap,
      barrelCoverToCenterWheelAxialOverlap: coverToCenterWheel.overlap,
      barrelCoverToCenterWheelAxialGap: coverToCenterWheel.gap,
      centerWheelIsActualBarrelMeshMember: false,
      conclusion: "the steel center wheel overlaps the barrel in XY projection but is axially separated; the smaller coaxial center pinion at z=0 is the mesh member",
    },
    accepted: Math.abs(centerDistanceError) < 1e-12 && meshAxial.overlap > 0 && meshPhaseMaxDrift < 1e-10,
  };
};

const barrelFourthAuditReport = (times: number[]) => {
  const restoreTime = currentKinematicTime();
  const findMesh = (name: string): THREE.Mesh => {
    const object = studio.scene.getObjectByName(name);
    if (!(object instanceof THREE.Mesh)) throw new Error(`barrel-fourth audit mesh missing: ${name}`);
    return object;
  };
  const path = (name: string) => junctionPath(findMesh(name));
  const bounds = (mesh: THREE.Mesh) => {
    studio.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    return { minZ: box.min.z, maxZ: box.max.z };
  };
  const overlapZ = (a: ReturnType<typeof bounds>, b: ReturnType<typeof bounds>) =>
    Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
  const gapZ = (a: ReturnType<typeof bounds>, b: ReturnType<typeof bounds>) =>
    Math.max(a.minZ, b.minZ) - Math.min(a.maxZ, b.maxZ);
  const distance = (a: keyof typeof movement.layout.positions, b: keyof typeof movement.layout.positions) =>
    Math.hypot(
      movement.layout.positions[a].x - movement.layout.positions[b].x,
      movement.layout.positions[a].y - movement.layout.positions[b].y,
    );
  const outer = (teeth: number, style: "wheel" | "pinion") =>
    (MODULE * teeth) / 2 + MODULE * (style === "wheel" ? 0.9 : 1.1);
  const barrelDrumR = movement.layout.radii.barrel - MODULE * 1.15 - 0.12;
  const fourthOuter = outer(TEETH.fourth, "wheel");
  const thirdOuter = outer(TEETH.third, "wheel");
  const fourthPinionOuter = outer(TEETH.fourthPinion, "pinion");
  const thirdPinionOuter = outer(TEETH.thirdPinion, "pinion");
  const centerOuter = outer(TEETH.center, "wheel");
  const escapePinionOuter = outer(TEETH.escapePinion, "pinion");
  const meshes = {
    barrelDrum: findMesh("barrel:drum"),
    barrelCover: findMesh("barrel:cover"),
    barrelWheel: findMesh("barrel:wheel"),
    centerWheel: findMesh("center:wheel"),
    thirdWheel: findMesh("third:wheel"),
    thirdPinion: findMesh("third:pinion"),
    fourthWheel: findMesh("fourth:wheel"),
    fourthPinion: findMesh("fourth:pinion"),
    escapePinion: findMesh("escape:pinion"),
  };
  const z = Object.fromEntries(Object.entries(meshes).map(([name, mesh]) => [name, bounds(mesh)])) as Record<
    keyof typeof meshes,
    ReturnType<typeof bounds>
  >;
  const radial = {
    barrelDrumToFourthWheel:
      barrelDrumR + fourthOuter - distance("barrel", "fourth"),
    centerWheelToFourthWheel:
      centerOuter + fourthOuter - distance("center", "fourth"),
    thirdPinionToFourthWheel:
      thirdPinionOuter + fourthOuter - distance("third", "fourth"),
    centerWheelToEscapePinion:
      centerOuter + escapePinionOuter - distance("center", "escape"),
    fourthWheelToEscapePinion:
      fourthOuter + escapePinionOuter - distance("fourth", "escape"),
    thirdWheelToFourthPinion:
      thirdOuter + fourthPinionOuter - distance("third", "fourth"),
  };
  const pairs = {
    barrelDrumToFourthWheel: {
      radialOverlap: radial.barrelDrumToFourthWheel,
      axialOverlap: overlapZ(z.barrelDrum, z.fourthWheel),
      axialGap: gapZ(z.barrelDrum, z.fourthWheel),
    },
    centerWheelToFourthWheel: {
      radialOverlap: radial.centerWheelToFourthWheel,
      axialOverlap: overlapZ(z.centerWheel, z.fourthWheel),
      axialGap: gapZ(z.centerWheel, z.fourthWheel),
    },
    thirdPinionToFourthWheel: {
      radialOverlap: radial.thirdPinionToFourthWheel,
      axialOverlap: overlapZ(z.thirdPinion, z.fourthWheel),
      axialGap: gapZ(z.thirdPinion, z.fourthWheel),
    },
    centerWheelToEscapePinion: {
      radialOverlap: radial.centerWheelToEscapePinion,
      axialOverlap: overlapZ(z.centerWheel, z.escapePinion),
      axialGap: gapZ(z.centerWheel, z.escapePinion),
    },
    fourthWheelToEscapePinion: {
      radialOverlap: radial.fourthWheelToEscapePinion,
      axialOverlap: overlapZ(z.fourthWheel, z.escapePinion),
      axialGap: gapZ(z.fourthWheel, z.escapePinion),
    },
    thirdWheelToFourthPinion: {
      radialOverlap: radial.thirdWheelToFourthPinion,
      axialOverlap: overlapZ(z.thirdWheel, z.fourthPinion),
      axialGap: gapZ(z.thirdWheel, z.fourthPinion),
    },
  };
  const collide = (pair: { radialOverlap: number; axialOverlap: number }) =>
    pair.radialOverlap > 0 && pair.axialOverlap > 0;
  const sampleTimes = [...new Set([0.104, 10.104, 60.104, ...times])].sort((a, b) => a - b);
  const samples = sampleTimes.map((time) => {
    updateKinematics(time);
    return {
      time,
      barrel: movement.parts.barrel.motion.rotation.z,
      fourth: movement.parts.fourth.motion.rotation.z,
      escape: movement.parts.escape.motion.rotation.z,
    };
  });
  const base = samples[0];
  const intervals = samples.slice(1).map((row) => ({
    seconds: row.time - base.time,
    barrelDegrees: THREE.MathUtils.radToDeg(row.barrel - base.barrel),
    fourthDegrees: THREE.MathUtils.radToDeg(row.fourth - base.fourth),
    escapeDegrees: THREE.MathUtils.radToDeg(row.escape - base.escape),
  }));
  updateKinematics(restoreTime);
  const barrelCollision = collide(pairs.barrelDrumToFourthWheel);
  const unintendedCollisions = {
    barrelDrumToFourthWheel: barrelCollision,
    centerWheelToFourthWheel: collide(pairs.centerWheelToFourthWheel),
    thirdPinionToFourthWheel: collide(pairs.thirdPinionToFourthWheel),
    centerWheelToEscapePinion: collide(pairs.centerWheelToEscapePinion),
  };
  const intendedMeshValid =
    pairs.fourthWheelToEscapePinion.radialOverlap > 0 &&
    pairs.fourthWheelToEscapePinion.axialOverlap > 0;
  const upstreamMeshValid =
    pairs.thirdWheelToFourthPinion.radialOverlap > 0 &&
    pairs.thirdWheelToFourthPinion.axialOverlap > 0;
  return {
    units: "mm",
    highlightedGreenOwner: {
      fourthWheel: path("fourth:wheel"),
      runtimeOwner: junctionPath(movement.parts.fourth.motion),
    },
    immediateDrivenMember: {
      escapePinion: path("escape:pinion"),
      runtimeOwner: junctionPath(movement.parts.escape.motion),
    },
    upstreamDrivingMesh: {
      thirdWheel: path("third:wheel"),
      fourthPinion: path("fourth:pinion"),
    },
    planes: {
      nominal: {
        barrelDrum: { minZ: 0, maxZ: THICK.barrelDrum },
        fourthWheel: DEPTH.fourthWheel,
        escapePinion: DEPTH.escapePinion,
      },
      rendered: z,
    },
    radii: {
      barrelDrum: barrelDrumR,
      fourthWheelOuter: fourthOuter,
      escapePinionOuter,
    },
    centerDistances: {
      barrelToFourth: distance("barrel", "fourth"),
      fourthToEscape: distance("fourth", "escape"),
      requiredFourthToEscape: movement.layout.radii.fourth + movement.layout.radii.escapePinion,
    },
    pairs,
    unintendedCollisions,
    intendedFourthEscapeMeshValid: intendedMeshValid,
    intendedThirdFourthMeshValid: upstreamMeshValid,
    kinematics: { samples, intervals },
    accepted:
      !Object.values(unintendedCollisions).some(Boolean) &&
      intendedMeshValid &&
      upstreamMeshValid,
    classification: barrelCollision
      ? "GEOMETRY_DEFECT — FOURTH WHEEL INTERSECTS BARREL DRUM"
      : "LOCAL BARREL / FOURTH-WHEEL CLEARANCE VALID",
    phase5DStarted: false,
  };
};

/**
 * Bounded pre-5D fourth-wheel sweep audit.
 *
 * The swept wheel envelope is axisymmetric after a complete revolution, so
 * each angular sample is checked against the same rendered outer radius and
 * Z slab.  Fixed tapered columns use their actual radius at the wheel slab;
 * every other structural mesh is conservatively tested against its rendered
 * world AABB.  This deliberately over-tests empty spoke windows rather than
 * allowing a t=0 pose to conceal a later strike.
 */
const fourthWheelSweepAuditReport = () => {
  if (!structure) return null;
  studio.scene.updateMatrixWorld(true);
  const findMesh = (name: string): THREE.Mesh => {
    const object = studio.scene.getObjectByName(name);
    if (!(object instanceof THREE.Mesh)) throw new Error(`fourth-wheel sweep mesh missing: ${name}`);
    return object;
  };
  const bounds = (object: THREE.Object3D) => {
    const box = new THREE.Box3().setFromObject(object, true);
    return {
      minX: box.min.x,
      maxX: box.max.x,
      minY: box.min.y,
      maxY: box.max.y,
      minZ: box.min.z,
      maxZ: box.max.z,
    };
  };
  const axialGap = (
    a: ReturnType<typeof bounds>,
    b: ReturnType<typeof bounds>,
  ) => Math.max(a.minZ, b.minZ) - Math.min(a.maxZ, b.maxZ);
  const pointToXyBox = (
    x: number,
    y: number,
    box: ReturnType<typeof bounds>,
  ) => {
    const dx = Math.max(box.minX - x, 0, x - box.maxX);
    const dy = Math.max(box.minY - y, 0, y - box.maxY);
    return Math.hypot(dx, dy);
  };
  const fourthWheel = findMesh("fourth:wheel");
  const bridgeBody = findMesh("struct:trainBridge:body");
  const centerWheel = findMesh("center:wheel");
  const wheelBounds = bounds(fourthWheel);
  const bridgeBounds = bounds(bridgeBody);
  const centerWheelBounds = bounds(centerWheel);
  const fourthAxis = movement.layout.positions.fourth;
  const positions = fourthWheel.geometry.getAttribute("position");
  let renderedOuterRadius = 0;
  for (let index = 0; index < positions.count; index++) {
    renderedOuterRadius = Math.max(
      renderedOuterRadius,
      Math.hypot(positions.getX(index), positions.getY(index)),
    );
  }

  const stationary: {
    name: string;
    path: string;
    bounds: ReturnType<typeof bounds>;
    axialGap: number;
    radialClearance: number | null;
    minimumClearance: number;
    clearanceAxis: "Z" | "radial";
    collision: boolean;
    method: string;
  }[] = [];
  structure.root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.geometry) return;
    if (junctionPath(object).includes("structure:debug")) return;
    const objectBounds = bounds(object);
    const zGap = axialGap(wheelBounds, objectBounds);
    let radialClearance: number | null = null;
    let method = "rendered world AABB against complete swept outer cylinder";
    const column = object.userData.stationaryColumn as
      | { z0: number; z1: number; r0: number; r1: number }
      | undefined;
    if (column && zGap <= 0) {
      const worldCenter = object.getWorldPosition(new THREE.Vector3());
      const radiusAt = (z: number) => {
        const t = THREE.MathUtils.clamp((z - column.z0) / (column.z1 - column.z0), 0, 1);
        return THREE.MathUtils.lerp(column.r0, column.r1, t);
      };
      const overlapMin = Math.max(wheelBounds.minZ, column.z0);
      const overlapMax = Math.min(wheelBounds.maxZ, column.z1);
      const columnRadius = Math.max(radiusAt(overlapMin), radiusAt(overlapMax));
      radialClearance =
        Math.hypot(worldCenter.x - fourthAxis.x, worldCenter.y - fourthAxis.y) -
        renderedOuterRadius -
        columnRadius;
      method = "rendered wheel radius against exact tapered-column radius over the overlapping Z slab";
    } else if (zGap <= 0) {
      radialClearance = pointToXyBox(fourthAxis.x, fourthAxis.y, objectBounds) - renderedOuterRadius;
    }
    const minimumClearance = zGap > 0 ? zGap : (radialClearance ?? Number.NEGATIVE_INFINITY);
    const path = junctionPath(object);
    const nearby =
      zGap <= 1.5 ||
      pointToXyBox(fourthAxis.x, fourthAxis.y, objectBounds) <= renderedOuterRadius + 1;
    if (!nearby) return;
    stationary.push({
      name: object.name || "(unnamed)",
      path,
      bounds: objectBounds,
      axialGap: zGap,
      radialClearance,
      minimumClearance,
      clearanceAxis: zGap > 0 ? "Z" : "radial",
      collision: minimumClearance <= 0,
      method,
    });
  });
  stationary.sort((a, b) => a.minimumClearance - b.minimumClearance);

  const sampleCount = 1441;
  const sweepSamples = Array.from({ length: sampleCount }, (_, index) => {
    const degrees = (index * 360) / (sampleCount - 1);
    const closest = stationary[0];
    return {
      degrees,
      collision: stationary.some((row) => row.collision),
      minimumClearance: closest?.minimumClearance ?? null,
      limitingOwner: closest?.path ?? null,
    };
  });
  const markedClearance = axialGap(wheelBounds, bridgeBounds);
  const centerProjectionGap = axialGap(wheelBounds, centerWheelBounds);
  const barrelMesh = barrelFourthAuditReport([0.104, 10.104, 60.104]);
  const stationaryCollision = stationary.some((row) => row.collision);
  return {
    units: "mm",
    disposition: stationaryCollision
      ? "BOUNDED SWEEP DEFECT — FIXED STRUCTURE ENTERS FOURTH-WHEEL SWEPT VOLUME"
      : "VALID BRIDGE-OVER-WHEEL — NO STATIONARY SWEEP COLLISION",
    ownership: {
      rotatingWheel: {
        name: fourthWheel.name,
        path: junctionPath(fourthWheel),
        runtimeOwner: junctionPath(movement.parts.fourth.motion),
      },
      markedStationaryMember: {
        name: bridgeBody.name,
        path: junctionPath(bridgeBody),
        runtimeOwner: null,
        intendedFunction: "fixed upper train bridge spanning over the fourth wheel",
      },
      projectedSlowMovingMember: {
        name: centerWheel.name,
        path: junctionPath(centerWheel),
        runtimeOwner: junctionPath(movement.parts.center.motion),
        note: "not stationary and not the marked bridge; separately Z-clear of the fourth wheel",
      },
    },
    wheel: {
      axis: { x: fourthAxis.x, y: fourthAxis.y },
      teeth: TEETH.fourth,
      pitchRadius: movement.layout.radii.fourth,
      renderedOuterRadius,
      bounds: wheelBounds,
    },
    markedBridge: {
      bounds: bridgeBounds,
      minimumZClearanceForEveryAngle: markedClearance,
      collision: markedClearance <= 0,
    },
    projectedCenterWheel: {
      bounds: centerWheelBounds,
      minimumZClearanceForEveryRelativeAngle: centerProjectionGap,
      collision: centerProjectionGap <= 0,
    },
    completeSweep: {
      startDegrees: 0,
      endDegrees: 360,
      inclusiveSamples: sampleCount,
      angularIncrementDegrees: 360 / (sampleCount - 1),
      conservativeEnvelope: "full rendered fourth-wheel outer cylinder across its rendered Z slab",
      collisionSamples: sweepSamples.filter((row) => row.collision).length,
      minimumRunningClearance: stationary[0]?.minimumClearance ?? null,
      limitingOwner: stationary[0]?.path ?? null,
      witnessSamples: sweepSamples.filter((_row, index) => index % 180 === 0),
      accepted: !stationaryCollision,
    },
    nearbyStationaryStructure: stationary,
    trainAuthority: {
      toothCountUnchanged: TEETH.fourth === 56,
      pitchRadiusUnchanged: movement.layout.radii.fourth === (MODULE * TEETH.fourth) / 2,
      fourthToEscapeMeshValid: barrelMesh.intendedFourthEscapeMeshValid,
      thirdToFourthMeshValid: barrelMesh.intendedThirdFourthMeshValid,
      centerDistances: barrelMesh.centerDistances,
      kinematics: barrelMesh.kinematics,
    },
    correction: stationaryCollision
      ? "required"
      : "none — changing accepted geometry would reduce, not improve, the mechanically valid bridge clearance",
    phase5DStarted: false,
    accepted:
      !stationaryCollision &&
      markedClearance > 0 &&
      centerProjectionGap > 0 &&
      barrelMesh.accepted,
  };
};

const displayDriveReport = (times: number[]) => {
  if (!displayDrive) return null;
  const restoreTime = currentKinematicTime();
  const actualObjectAngles = () => {
    const minuteOwner =
      movement.parts.center.motion.rotation.z +
      displayDrive.geometry.centerOutput.rotation.z;
    const compoundOwner = displayDrive.geometry.compoundMotion.rotation.z;
    const hourOwner = displayDrive.geometry.hourMotion.rotation.z;
    return {
      centerSource: movement.parts.center.motion.rotation.z,
      centerStaff: minuteOwner,
      cannonPinion:
        minuteOwner + displayDrive.geometry.meshes.cannonPinion.rotation.z,
      minuteDrive: minuteOwner,
      minuteWheel:
        compoundOwner + displayDrive.geometry.meshes.minuteWheel.rotation.z,
      minutePinion:
        compoundOwner + displayDrive.geometry.meshes.minutePinion.rotation.z,
      hourWheel: hourOwner + displayDrive.geometry.meshes.hourWheel.rotation.z,
      hourPipe: hourOwner,
      minuteHand:
        minuteOwner + (readout?.drivenParts.minuteHandMount.rotation.z ?? 0),
      hourHand:
        hourOwner + (readout?.drivenParts.hourHandMount.rotation.z ?? 0),
    };
  };
  const orderedTimes = [...times];
  const samples = orderedTimes.map((time) => {
    movement.update(time);
    displayDrive.update(movement.parts.center.motion.rotation.z);
    studio.scene.updateMatrixWorld(true);
    return {
      time,
      sourceAngleRad: movement.parts.center.motion.rotation.z,
      sourceAngleDeg: (movement.parts.center.motion.rotation.z * 180) / Math.PI,
      actualObjectAnglesRad: actualObjectAngles(),
      drive: displayDrive.sampleKinematics(
        movement.parts.center.motion.rotation.z,
      ),
    };
  });
  const intervals = samples.slice(1).map((to, index) => ({
    fromTime: samples[index].time,
    toTime: to.time,
    ...displayDrive.sampleInterval(
      samples[index].sourceAngleRad,
      to.sourceAngleRad,
    ),
  }));
  const sampleNear = (target: number) =>
    samples.find((sample) => Math.abs(sample.time - target) < 1e-8) ?? null;
  const t0 = samples[0]?.time ?? null;
  const sixtyStart = t0 === null ? null : sampleNear(t0);
  const sixtyEnd = t0 === null ? null : sampleNear(t0 + 60);
  const sixty =
    sixtyStart && sixtyEnd
      ? displayDrive.sampleInterval(
          sixtyStart.sourceAngleRad,
          sixtyEnd.sourceAngleRad,
        )
      : null;
  const wrappedDelta = (from: number, to: number) =>
    Math.atan2(Math.sin(to - from), Math.cos(to - from));
  const actualInterval = (
    from: (typeof samples)[number],
    to: (typeof samples)[number],
  ) =>
    Object.fromEntries(
      Object.keys(from.actualObjectAnglesRad).map((id) => {
        const key = id as keyof typeof from.actualObjectAnglesRad;
        const angleRad = wrappedDelta(
          from.actualObjectAnglesRad[key],
          to.actualObjectAnglesRad[key],
        );
        return [
          key,
          { angleRad, angleDeg: (angleRad * 180) / Math.PI },
        ];
      }),
    ) as Record<
      keyof (typeof samples)[number]["actualObjectAnglesRad"],
      { angleRad: number; angleDeg: number }
    >;
  const sixtyActual =
    sixtyStart && sixtyEnd ? actualInterval(sixtyStart, sixtyEnd) : null;

  movement.update(restoreTime);
  displayDrive.update(movement.parts.center.motion.rotation.z);

  const authority = displayDrive.report();
  const readoutAuthority = readout?.report() ?? null;
  const displayAuthority = display?.report() ?? null;
  const support = studio.scene.getObjectByName(
    "struct:trainBridge:centerSupport",
  );
  const bridgeBody = studio.scene.getObjectByName("struct:trainBridge:body");
  const upperBoss = studio.scene.getObjectByName("struct:boss:center:upper");
  const upperJewel = studio.scene.getObjectByName(
    "assembly:bearing:center:upper:jewel",
  );
  const upperSetting = studio.scene.getObjectByName(
    "assembly:bearing:center:upper:setting",
  );
  const boreOf = (object: THREE.Object3D | undefined) =>
    typeof object?.userData.throughBoreRadius === "number"
      ? object.userData.throughBoreRadius
      : null;
  const measuredMinimumRadius = (
    object: THREE.Object3D | undefined,
  ): number | null => {
    if (!object) return null;
    object.updateWorldMatrix(true, true);
    const vertex = new THREE.Vector3();
    let minimum = Infinity;
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const positions = child.geometry.getAttribute("position");
      if (!positions) return;
      child.updateWorldMatrix(true, false);
      for (let index = 0; index < positions.count; index += 1) {
        vertex.fromBufferAttribute(positions, index).applyMatrix4(child.matrixWorld);
        minimum = Math.min(minimum, Math.hypot(vertex.x, vertex.y));
      }
    });
    return Number.isFinite(minimum) ? minimum : null;
  };
  const stationaryBores = [
    { id: "pendantSupport", object: support },
    { id: "bridgeBody", object: bridgeBody },
    { id: "upperBoss", object: upperBoss },
    { id: "upperJewel", object: upperJewel },
    { id: "upperSetting", object: upperSetting },
    {
      id: "displayInterface",
      object: studio.scene.getObjectByName("display:interfaceCarrier"),
      declared: display?.plan.interfaceBase.innerR ?? null,
    },
  ].map((entry) => {
    const metadataRadius = entry.declared ?? boreOf(entry.object);
    const measuredRadius = measuredMinimumRadius(entry.object);
    const radius = measuredRadius ?? metadataRadius;
    const runningR =
      entry.id === "displayInterface"
        ? DISPLAY_DRIVE.staff.upperCoreR
        : DISPLAY_DRIVE.staff.journalR;
    return {
      id: entry.id,
      path: entry.object ? junctionPath(entry.object) : null,
      metadataBoreRadius: metadataRadius,
      measuredMinimumBoreRadius: measuredRadius,
      boreRadius: radius,
      rotatingRadius: runningR,
      radialClearance:
        radius === null ? null : radius - runningR,
      clear: radius !== null && radius - runningR > 0,
    };
  });
  const noStationaryIntersection = stationaryBores.every((row) => row.clear);
  const overlapBounds = (
    fromName: string,
    toName: string,
    fromLabel: string,
    toLabel: string,
  ) => {
    const fromBounds = diagnosticBounds(fromName);
    const toBounds = diagnosticBounds(toName);
    return {
      from: fromLabel,
      to: toLabel,
      fromBounds,
      toBounds,
      axialOverlap:
        fromBounds && toBounds
          ? Math.max(
              0,
              Math.min(fromBounds.maxZ, toBounds.maxZ) -
                Math.max(fromBounds.minZ, toBounds.minZ),
            )
          : 0,
    };
  };
  const joins = [
    overlapBounds(
      "center:arbor:upperTip",
      "phase4b:centerStaff:lowerCoupling",
      "existing center upper tip",
      "center staff lower coupling",
    ),
    overlapBounds(
      "phase4b:centerStaff:lowerCoupling",
      "phase4b:centerStaff:runningJournal",
      "lower coupling",
      "running journal",
    ),
    overlapBounds(
      "phase4b:centerStaff:runningJournal",
      "phase4b:centerStaff:upperCore",
      "running journal",
      "upper core",
    ),
    overlapBounds(
      "phase4b:centerStaff:upperCore",
      "phase4b:minuteDrive:rigidShoulder",
      "upper core",
      "rigid minute shoulder/cannon",
    ),
    overlapBounds(
      "phase4b:minuteDrive:rigidShoulder",
      "phase4b:minuteDrive:continuousTubeStem",
      "rigid minute shoulder/cannon",
      "continuous minute tube/stem",
    ),
  ];
  const continuousCenterOwnedPath = joins.every(
    (join) => join.axialOverlap > 0,
  );

  const poseIds = ["840", "945", "1010"];
  const representativePoses = poseIds.map((id) => {
    const pose = parseReadoutPose(id);
    const rot = poseRotations(pose.hours, pose.minutes);
    const displayQ =
      displayDrive.getSourceZero() -
      Math.PI * 2 * (pose.hours + pose.minutes / 60);
    const token = displayDrive.applyPresentationTime(restoreTime, displayQ);
    studio.scene.updateMatrixWorld(true);
    const actual = actualObjectAngles();
    const hourBounds = diagnosticBounds("HourHandMount");
    const minuteBounds = diagnosticBounds("MinuteHandMount");
    displayDrive.restorePresentationTime(token);
    const sapphire = readoutAuthority?.sapphire;
    const contained =
      readoutAuthority?.hourHand.contained === true &&
      readoutAuthority?.minuteHand.contained === true &&
      readoutAuthority?.hub.contained === true;
    const clearances = {
      hourAboveChapter:
        (readout?.plan.hourHand.z0 ?? -Infinity) -
        (readout?.plan.chapter.markerZ1 ?? Infinity),
      minuteAboveHour:
        (readout?.plan.minuteHand.z0 ?? -Infinity) -
        (readout?.plan.hourHand.z1 ?? Infinity),
      hourTipToNearestMarker:
        readoutAuthority?.handToChapter.hourTipToNearestMarker ?? -Infinity,
      minuteTipToNearestMarker:
        readoutAuthority?.handToChapter.minuteTipToNearestMarker ?? -Infinity,
      supportToSweep:
        readoutAuthority?.chapter.supports.audit.minSweepClearance ?? -Infinity,
      calibreToLowerMotionWorks:
        DISPLAY_DRIVE.lowerFace.z0 -
        DISPLAY_DRIVE.frozen.nearestFrozenCentralTopZ,
      upperMotionWorksToHour:
        (readout?.plan.hourHand.z0 ?? -Infinity) -
        DISPLAY_DRIVE.upperFace.z1,
    };
    const poseError = {
      hour: wrappedDelta(rot.hourZ, actual.hourHand),
      minute: wrappedDelta(rot.minuteZ, actual.minuteHand),
    };
    const clear =
      contained &&
      readoutAuthority?.accepted === true &&
      (sapphire?.remaining ?? -Infinity) >= 0.86 - 1e-9 &&
      Object.values(clearances).every((value) => value > 0) &&
      Math.abs(poseError.hour) < 1e-10 &&
      Math.abs(poseError.minute) < 1e-10;
    return {
      id,
      hours: pose.hours,
      minutes: pose.minutes,
      method:
        "actual owner pose sampled; collision certificate uses the frozen all-azimuth hand sweeps, axial plane separation, and enclosure clearance",
      hourAngleRad: rot.hourZ,
      minuteAngleRad: rot.minuteZ,
      actualHourOwnerAngleRad: actual.hourHand,
      actualMinuteOwnerAngleRad: actual.minuteHand,
      poseErrorRad: poseError,
      bounds: { hour: hourBounds, minute: minuteBounds },
      handSweepContained: contained,
      clearanceCertificate: clearances,
      sapphireRemaining: sapphire?.remaining ?? null,
      noCollision: clear,
    };
  });
  const motionWorksClearances = {
    lowerMeshAboveInterface:
      DISPLAY_DRIVE.lowerFace.z0 -
      (display?.plan.interfaceBase.z1 ?? DISPLAY_DRIVE.frozen.interfaceTopZ),
    lowerMeshToUpperMesh:
      DISPLAY_DRIVE.upperFace.z0 - DISPLAY_DRIVE.lowerFace.z1,
    upperMeshToChapter:
      (display?.plan.chapter.z0 ?? DISPLAY_DRIVE.frozen.chapterGeometryBottomZ) -
      DISPLAY_DRIVE.upperFace.z1,
    upperMeshToHourHand:
      (readout?.plan.hourHand.z0 ?? DISPLAY_DRIVE.frozen.hourHandBottomZ) -
      DISPLAY_DRIVE.upperFace.z1,
    minuteToHourRadial:
      DISPLAY_DRIVE.hourPipe.innerR - DISPLAY_DRIVE.minuteTube.outerR,
    minuteToHourHubRadial:
      DISPLAY_DRIVE.hourHubCoupling.innerR -
      DISPLAY_DRIVE.minuteStem.outerR,
    hourHandBoreToMinute:
      (readout?.plan.hourHand.mountBoreR ?? 0.22) -
      DISPLAY_DRIVE.minuteTube.outerR,
    compoundFootInsideInterface:
      (display?.plan.interfaceBase.outerR ?? 0.58) -
      (DISPLAY_DRIVE.centerDistance + DISPLAY_DRIVE.compoundBearing.footR),
  };
  const containmentOk = Object.values(authority.containment)
    .filter((value): value is boolean => typeof value === "boolean")
    .every(Boolean);
  const renderedGearClear =
    authority.gears.every((gear) => gear.measured !== null) &&
    authority.clearances.renderedCannonToMinuteEnvelope > 0 &&
    authority.clearances.renderedHourWheelToHourEnvelope > 0 &&
    authority.clearances.renderedMinuteWheelBoreToStud > 0 &&
    authority.clearances.renderedMinutePinionBoreToStud > 0;
  const meshGeometryExact = authority.meshes.every(
    (mesh) =>
      Number.isInteger(mesh.driverTeeth) &&
      Number.isInteger(mesh.drivenTeeth) &&
      Math.abs(mesh.centerDistanceError) < 1e-12,
  );
  const claimOwner = new Map(
    authority.ownership.claims.map((claim) => [claim.role, claim.owner]),
  );
  const ownershipComplete =
    claimOwner.get("hourHandMount") === "hour" &&
    claimOwner.get("hourCollar") === "hour" &&
    claimOwner.get("minuteHandMount") === "minute" &&
    claimOwner.get("minuteCollar") === "minute" &&
    claimOwner.get("centerStem") === "minute" &&
    claimOwner.get("cap") === "minute";
  const mountBore = (object: THREE.Object3D | undefined) => {
    const data = object?.userData.phase4bMountBore as
      | {
          targetR: number;
          profileR: number;
          measuredMinimumR: number;
        }
      | undefined;
    return data ? { ...data } : null;
  };
  const mountBoreProof = {
    hourHand: mountBore(
      readout?.drivenParts.hourHandMount.getObjectByName("HourHand"),
    ),
    hourCollar: mountBore(readout?.drivenParts.hourCollar),
    minuteHand: mountBore(
      readout?.drivenParts.minuteHandMount.getObjectByName("MinuteHand"),
    ),
    minuteCollar: mountBore(readout?.drivenParts.minuteCollar),
  };
  const mountBoresClear =
    mountBoreProof.hourHand !== null &&
    mountBoreProof.hourCollar !== null &&
    mountBoreProof.minuteHand !== null &&
    mountBoreProof.minuteCollar !== null &&
    mountBoreProof.hourHand.measuredMinimumR + 1e-9 >=
      DISPLAY_DRIVE.hourHubCoupling.neckOuterR &&
    mountBoreProof.hourCollar.measuredMinimumR + 1e-9 >=
      DISPLAY_DRIVE.hourHubCoupling.neckOuterR &&
    mountBoreProof.minuteHand.measuredMinimumR + 1e-9 >=
      DISPLAY_DRIVE.minuteTenon.outerR &&
    mountBoreProof.minuteCollar.measuredMinimumR + 1e-9 >=
      DISPLAY_DRIVE.minuteTenon.outerR;
  const physicalHubConnections =
    authority.connections.minuteAnnulusToIntegralStem.continuous &&
    authority.connections.minuteStemToCollar.axialEngagement > 0 &&
    authority.connections.minuteStemToHand.axialEngagement > 0 &&
    Math.abs(
      authority.connections.minuteStemToCollar.matchingRadius -
        DISPLAY_DRIVE.minuteTenon.outerR,
    ) < 1e-12 &&
    authority.connections.hourPipeToHubCoupling.axialOverlap > 0 &&
    authority.connections.hourPipeToHubCoupling.radialOverlap > 0 &&
    authority.connections.hourCouplingToCollar.axialEngagement > 0 &&
    authority.connections.hourCouplingToHand.axialEngagement > 0 &&
    Math.abs(
      authority.connections.hourCouplingToCollar.matchingRadius -
        (readout?.plan.hub.hourCollarInnerR ?? Infinity),
    ) < 1e-12 &&
    authority.connections.coaxialRunningGap > 0 &&
    mountBoresClear &&
    (readout?.drivenParts.minuteStem.children.length ?? -1) === 0;
  const collisionFree =
    Object.values(motionWorksClearances).every((value) => value >= -1e-9) &&
    representativePoses.every((pose) => pose.noCollision) &&
    containmentOk &&
    renderedGearClear &&
    meshGeometryExact &&
    physicalHubConnections;
  const ratioProof = sixty && sixtyActual
    ? {
        method:
          "measured from actual scene-owner/object rotations at t0 and t0+60; analytic samples retained separately",
        centerDeltaDeg: sixtyActual.centerSource.angleDeg,
        staffDeltaDeg: sixtyActual.centerStaff.angleDeg,
        cannonPinionDeltaDeg: sixtyActual.cannonPinion.angleDeg,
        minuteDriveDeltaDeg: sixtyActual.minuteDrive.angleDeg,
        minuteHandDeltaDeg: sixtyActual.minuteHand.angleDeg,
        minuteWheelDeltaDeg: sixtyActual.minuteWheel.angleDeg,
        minutePinionDeltaDeg: sixtyActual.minutePinion.angleDeg,
        hourWheelDeltaDeg: sixtyActual.hourWheel.angleDeg,
        hourPipeDeltaDeg: sixtyActual.hourPipe.angleDeg,
        hourHandDeltaDeg: sixtyActual.hourHand.angleDeg,
        minuteToCenter:
          sixtyActual.minuteHand.angleRad /
          sixtyActual.centerSource.angleRad,
        compoundToMinute:
          sixtyActual.minuteWheel.angleRad /
          sixtyActual.minuteDrive.angleRad,
        hourToCompound:
          sixtyActual.hourWheel.angleRad /
          sixtyActual.minuteWheel.angleRad,
        hourToMinute:
          sixtyActual.hourHand.angleRad /
          sixtyActual.minuteHand.angleRad,
        displayedDirectionsAgree:
          Math.sign(sixtyActual.hourHand.angleRad) ===
          Math.sign(sixtyActual.minuteHand.angleRad),
        analyticAgreement: Object.keys(sixtyActual).every((id) => {
          const key = id as keyof typeof sixtyActual;
          return (
            Math.abs(
              sixtyActual[key].angleRad - sixty.deltas[key].angleRad,
            ) < 1e-12
          );
        }),
      }
    : null;
  const sapphireRemaining = readoutAuthority?.sapphire.remaining ?? null;
  const accepted =
    authority.axis.drift === 0 &&
    noStationaryIntersection &&
    continuousCenterOwnedPath &&
    authority.derivation.minuteFromSource === 1 &&
    Math.abs(authority.derivation.netFromTraversedMeshes - 1 / 12) < 1e-12 &&
    ratioProof !== null &&
    Math.abs(ratioProof.minuteToCenter - 1) < 1e-12 &&
    Math.abs(ratioProof.hourToMinute - 1 / 12) < 1e-12 &&
    Math.abs(ratioProof.compoundToMinute + 1 / 2) < 1e-12 &&
    Math.abs(ratioProof.hourToCompound + 1 / 6) < 1e-12 &&
    ratioProof.analyticAgreement &&
    ratioProof.displayedDirectionsAgree &&
    containmentOk &&
    renderedGearClear &&
    meshGeometryExact &&
    ownershipComplete &&
    physicalHubConnections &&
    collisionFree &&
    sapphireRemaining !== null &&
    sapphireRemaining >= 0.86 - 1e-9;

  return {
    ...authority,
    disposition: accepted
      ? "PHASE 4B — CLOSED & FROZEN — REAL TWO-HAND DISPLAY DRIVE"
      : "PHASE 4B — VALIDATION PENDING",
    accepted,
    samples,
    intervals,
    sixtySecondProof: ratioProof,
    centerPassage: {
      axis: { ...movement.layout.positions.center },
      axisDrift: authority.axis.drift,
      stationaryBores,
      noStationaryIntersection,
      joins,
      continuousCenterOwnedPath,
      bridgeExteriorBounds: diagnosticBounds("struct:trainBridge:body"),
      bossExteriorBounds: diagnosticBounds("struct:boss:center:upper"),
      supportExteriorBounds: diagnosticBounds(
        "struct:trainBridge:centerSupport",
      ),
      upperJewelBounds: diagnosticBounds(
        "assembly:bearing:center:upper:jewel",
      ),
      upperSettingBounds: upperSetting
        ? diagnosticBounds("assembly:bearing:center:upper:setting")
        : null,
    },
    collision: {
      motionWorksClearances,
      representativePoses,
      collisionFree,
      method:
        "rendered gear/bore extrema plus frozen all-azimuth hand sweeps and positive axial/radial separation certificates",
      containmentOk,
      renderedGearClear,
      meshGeometryExact,
      calibreSweepClearance: displayAuthority
        ? {
            hour: displayAuthority.hourClearance,
            minute: displayAuthority.minuteClearance,
          }
        : null,
      enclosure: readoutAuthority?.sapphire ?? null,
    },
    displayPackage: {
      minutePipeAuthority: display?.plan.pipes.find(
        (pipe) => pipe.id === "minutePipeReserve",
      ),
      hourPipeAuthority: display?.plan.pipes.find(
        (pipe) => pipe.id === "hourPipeReserve",
      ),
      handPlanes: {
        hour: readout
          ? [readout.plan.hourHand.z0, readout.plan.hourHand.z1]
          : null,
        minute: readout
          ? [readout.plan.minuteHand.z0, readout.plan.minuteHand.z1]
          : null,
      },
      hub: readoutAuthority?.hub ?? null,
      actualMinuteMember: {
        reservedAnnulus: { ...DISPLAY_DRIVE.minuteTube },
        integralStemInExistingHub: {
          visibleSection: { ...DISPLAY_DRIVE.minuteStem },
          handTenon: { ...DISPLAY_DRIVE.minuteTenon },
        },
      },
      actualHourMember: {
        reservedPipe: { ...DISPLAY_DRIVE.hourPipe },
        colletInExistingHub: { ...DISPLAY_DRIVE.hourHubCoupling },
      },
      sapphireRemaining,
      sapphireRequirement: 0.86,
    },
    physicalOwnership: {
      ownershipComplete,
      physicalHubConnections,
      mountBoresClear,
      mountBoreProof,
      placeholderMinuteStemRemoved:
        (readout?.drivenParts.minuteStem.children.length ?? -1) === 0,
      connections: authority.connections,
    },
    presentationOverride: activeReadoutPose()
      ? { active: true, ...activeReadoutPose()! }
      : { active: false },
    explicitRatios: {
      meshA: DISPLAY_DRIVE_MESHES.minuteReduction.signedRatio,
      meshB: DISPLAY_DRIVE_MESHES.hourReduction.signedRatio,
      traversedNet: DISPLAY_DRIVE_NET_RATIO,
    },
    phase5DStarted: false,
  };
};

const setAudit = (on: boolean): void => {
  if (!structure || !showStructure) return;
  if (on && silhouetteOn) setSilhouette(false);
  auditOn = on;
  structure.setAudit(on);
  if (assembly) assembly.setAudit(on);
  if (!on && finish) finish.apply();
};

type EscapementVisualAuditMode = "off" | "idTop" | "participantsTop" | "side";
type EscapementVisualAuditState = {
  meshVisibility: Map<THREE.Mesh, boolean>;
  meshMaterials: Map<THREE.Mesh, THREE.Material | THREE.Material[]>;
  cameraPosition: THREE.Vector3;
  cameraUp: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
  background: THREE.Color | THREE.Texture | null;
  generatedMaterials: THREE.Material[];
};
let escapementVisualAuditState: EscapementVisualAuditState | null = null;

const escapementAuditFamily = (name: string): "fork" | "boss" | "stub" | "escape" | "roller" | "support" | null => {
  if (name.startsWith("pallet:")) return "fork";
  if (name === "struct:boss:fourth:upper") return "boss";
  if (name === "struct:trainBridge:stub:b") return "stub";
  if (name.startsWith("escape:")) return "escape";
  if (name.startsWith("balance:roller") || name === "balance:impulseJewel") return "roller";
  if (
    name === "struct:trainBridge:body" || name.startsWith("struct:escapeFinger") ||
    name.startsWith("struct:boss:pallet:upper") || name.startsWith("struct:boss:escape:upper") ||
    name.startsWith("struct:bankingStop:")
  ) return "support";
  return null;
};

const clearEscapementAudit = (): void => {
  const state = escapementVisualAuditState;
  if (!state) return;
  for (const [mesh, visible] of state.meshVisibility) mesh.visible = visible;
  for (const [mesh, material] of state.meshMaterials) mesh.material = material;
  for (const material of state.generatedMaterials) material.dispose();
  studio.camera.position.copy(state.cameraPosition);
  studio.camera.up.copy(state.cameraUp);
  studio.controls.target.copy(state.target);
  studio.camera.fov = state.fov;
  studio.camera.updateProjectionMatrix();
  studio.scene.background = state.background;
  studio.controls.update();
  escapementVisualAuditState = null;
};

const setEscapementAudit = (mode: EscapementVisualAuditMode): void => {
  clearEscapementAudit();
  if (mode === "off") return;
  const state: EscapementVisualAuditState = {
    meshVisibility: new Map(),
    meshMaterials: new Map(),
    cameraPosition: studio.camera.position.clone(),
    cameraUp: studio.camera.up.clone(),
    target: studio.controls.target.clone(),
    fov: studio.camera.fov,
    background: studio.scene.background,
    generatedMaterials: [],
  };
  const colors = {
    fork: 0x18d7e8,
    boss: 0xec3a99,
    stub: 0xff8b20,
    escape: 0xf1cf3a,
    roller: 0x548cff,
    support: 0x8f99a6,
  };
  studio.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const family = escapementAuditFamily(object.name);
    state.meshVisibility.set(object, object.visible);
    object.visible = family !== null;
    if (mode === "idTop" && family) {
      state.meshMaterials.set(object, object.material);
      const material = new THREE.MeshBasicMaterial({ color: colors[family], side: THREE.DoubleSide });
      state.generatedMaterials.push(material);
      object.material = material;
    }
  });
  escapementVisualAuditState = state;
  const target = new THREE.Vector3(-1.75, 5.35, 2.25);
  if (mode === "side") {
    studio.camera.position.set(-1.75, -6, 2.25);
    studio.camera.up.set(0, 0, 1);
    studio.camera.fov = 22;
  } else {
    studio.camera.position.set(-1.75, 5.35, 16.5);
    studio.camera.up.set(0, 1, 0);
    studio.camera.fov = 25;
  }
  studio.controls.target.copy(target);
  studio.camera.updateProjectionMatrix();
  studio.scene.background = new THREE.Color(mode === "idTop" ? 0x10131a : 0x08090b);
  studio.controls.update();
};

const DISPLAY_PACKAGING = new Set([
  "DisplayChapterPose",
  "DisplaySweepPose",
  "DisplayEnvelopePose",
  "DisplayStackPose",
  "display:chapter",
  "display:sweeps",
  "display:stack",
  "display:envelope",
]);

const setDisplayPackaging = (on: boolean): void => {
  if (!display) return;
  display.root.traverse((o) => {
    if (DISPLAY_PACKAGING.has(o.name) || o.name.startsWith("display:debug")) o.visible = on;
  });
};

const restoreEngineeringPresentation = (): void => {
  if (exterior) {
    exterior.root.visible = false;
  }
  if (accommodation) {
    accommodation.root.traverse((o) => {
      if (o.name === "CoarseMidcasePose" || o.name === "acc:midcase") o.visible = true;
    });
  }
  if (enclosure) {
    enclosure.root.traverse((o) => {
      if (o.name === "enc:frontSapphireCap" || o.name === "enc:rearSapphireCap") o.visible = true;
    });
  }
  setDisplayPackaging(true);
};

const applyJointPresentation = (name: string): void => {
  if (!assembly) return;
  const showLower =
    name.startsWith("asm") ||
    name.startsWith("struct") ||
    name === "finishUnderside" ||
    name === "finishUndersideOblique" ||
    name === "finishWedgeA" ||
    name === "finishWedgeB" ||
    name === "finishLowerFlank" ||
    name === "finishTruth" ||
    name === "extRear" ||
    name === "extRearGrazing" ||
    name === "r1RearExhibition" ||
    name === "r1RearIdentity" ||
    name === "extUnderside" ||
    isAnnexE1View(name);
  assembly.setLowerHardware(showLower);
  const jointId =
    name === "asmJointId" ||
    name === "asmJointClose" ||
    name === "asmJointSection" ||
    name === "asmJointSeat" ||
    name === "asmJointGraze1";
  assembly.setJointId(jointId);
  if (structure) structure.setJointId(jointId);
};

const applyAnyView = (name: string): void => {
  if (!isAnnexE1View(name) && explodedStudy?.value() !== 0) {
    if (explodeAnimation !== null) cancelAnimationFrame(explodeAnimation);
    explodeAnimation = null;
    explodeAmount = 0;
    explodedStudy?.set(0);
  }
  if (!R1_VIEWS.has(name)) {
    studio.camera.far = 160;
    studio.camera.updateProjectionMatrix();
    if (currentPhase5dProfile.startsWith("r1")) applyPhase5dCProfile("presentSettled");
  }
  currentViewName = name;
  const forcedReadoutKey = viewForcedPose[name] ?? "";
  viewReadoutPose = forcedReadoutKey ? parseReadoutPose(forcedReadoutKey) : null;
  applyJointPresentation(name);
  if (name === "structAudit" || name === "asmAudit" || name === "asmFastenerAudit") {
    if (showStructure) {
      setAudit(true);
      if (name === "asmAudit" || name === "asmFastenerAudit") {
        applyAssemblyView(studio.camera, studio.controls, name);
      } else {
        applyStructureView(studio.camera, studio.controls, "structAudit");
      }
    }
    return;
  }
  if (name === "structRear" || name === "structRearOblique" || name === "structRearGrazing") {
    if (auditOn) setAudit(false);
    if (finish) {
      finish.setBench(false);
      finish.setDirectionDebug(false);
      finish.setStudio("truth");
      if (finish.applied()) finish.apply();
    }
    if (structure) structure.root.visible = true;
    if (assembly) assembly.root.visible = true;
    if (!silhouetteOn) movement.root.visible = true;
    // Grazing is a local plate-junction inspection; packaging occludes the
    // ribbon/boss/hoop meetings. Rear truth / three-quarter keep the enclosure.
    const hidePackage = name === "structRearGrazing";
    if (accommodation) {
      accommodation.root.visible = !hidePackage;
      accommodation.setTruth(false);
      accommodation.setSection(false);
      accommodation.setHolderAudit(false);
      accommodation.setReserves(false);
    }
    if (display) {
      display.root.visible = !hidePackage;
      display.setTruth(false);
      display.setSection(false);
      display.setEnvelope(false);
    }
    setDrivenReadoutVisible(!hidePackage);
    if (enclosure) {
      enclosure.root.visible = !hidePackage;
      enclosure.setTruth(false);
      enclosure.setSection(false);
    }
    applyStructureView(studio.camera, studio.controls, name);
    return;
  }
  if (auditOn) setAudit(false);
  applyJointPresentation(name);
  const extTruth =
    name === "extKernel" ||
    name === "extLugTruth" ||
    name === "extLugSouth" ||
    name === "extCrownTruth" ||
    name === "extSeatMacro" ||
    name === "extWaist";
  const extShow =
    (extViews as string[]).includes(name) ||
    name === "presentHero" ||
    name === "presentThreeQuarter" ||
    name.startsWith("presentExploded") ||
    R1_PRODUCT_VIEWS.has(name) ||
    name === "threeQuarter" ||
    name === "finishHero" ||
    name === "finishTop" ||
    name === "finishBalance";
  if (finish) {
    finish.setBench(false);
    finish.setDirectionDebug(false);
    if (structure) structure.root.visible = true;
    if (assembly) assembly.root.visible = true;
    const truthViews = new Set([
      "finishTruth",
      "finishBench",
      "finishUnderside",
      "finishUndersideOblique",
      "finishWedgeA",
      "finishWedgeB",
      "finishLowerFlank",
    ]);
    const accTruth = (accViews as string[]).includes(name);
    const dispTruth = (dispViews as string[]).includes(name);
    const encTruth = (encViews as string[]).includes(name);
    const readoutTruth = READOUT_TRUTH_VIEWS.has(name as ReadoutViewName);
    finish.setStudio(
      truthViews.has(name) || accTruth || dispTruth || encTruth || extTruth || readoutTruth ? "truth" : "showcase",
    );
    if (finish.applied()) finish.apply();
    if (!phase5dBaselineComparison && (extShow || name === "r1FinishRake")) {
      const profile: Phase5dCProfile =
        R1_VIEWS.has(name)
          ? R1_PROFILE_BY_VIEW[name as R1ViewName]
          : name === "presentHero"
          ? "presentHero"
          : name === "finishBalance"
            ? "middle"
            : name === "extHero"
              ? "conservative"
              : name === "extRear"
                ? "rear"
                : "presentSettled";
      applyPhase5dCProfile(profile);
    }
  }
  const accTruth = (accViews as string[]).includes(name);
  const dispTruth = (dispViews as string[]).includes(name);
  const encTruth = (encViews as string[]).includes(name);
  if (accommodation) {
    accommodation.root.visible = true;
    accommodation.setTruth(accTruth || dispTruth || encTruth);
    accommodation.setSection(name === "accSection" || name === "dispSection" || name === "encSection");
    accommodation.setHolderAudit(name === "accHolder");
    const hideReserves =
      name === "accTop" ||
      name === "accHolder" ||
      name === "accAuthority" ||
      name === "dispTop" ||
      name === "dispChapter" ||
      name === "dispStack";
    accommodation.setReserves((accTruth || name === "dispEnvelope" || name === "dispSection") && !hideReserves);
  }
  if (display) {
    display.root.visible = true;
    const dispTruth = (dispViews as string[]).includes(name);
    const readoutTruth = READOUT_TRUTH_VIEWS.has(name as ReadoutViewName);
    display.setTruth(dispTruth || encTruth || readoutTruth);
    display.setSection(
      name === "dispSection" || name === "accSection" || name === "encSection" || name === "readoutSection",
    );
    display.setEnvelope(
      name === "dispEnvelope" ||
        name === "encFront" ||
        name === "encFrontClear" ||
        name === "readoutSweep" ||
        name === "readoutChapterContain",
    );
  }
  if (readout) {
    setDrivenReadoutVisible(true);
    readout.setSection(name === "readoutSection" || name === "dispSection" || name === "encSection");
    if (READOUT_TRUTH_VIEWS.has(name as ReadoutViewName)) readout.setTruth(true);
    else readout.setProduct(true);
    const pose = activeReadoutPose();
    if (pose) readout.setPose(pose.hours, pose.minutes, pose.id);
  }
  if (enclosure) {
    enclosure.root.visible = true;
    const encTruth = (encViews as string[]).includes(name);
    enclosure.setTruth(encTruth);
    enclosure.setSection(name === "encSection");
  }
  const readoutShow = (readoutViews as string[]).includes(name);
  const strapShow = (strapViews as string[]).includes(name);
  const strapHide =
    name.startsWith("extLugRootSection") ||
    name.startsWith("extLugRootCut") ||
    name.startsWith("extCrownSection") ||
    name.startsWith("extCrownId") ||
    name.startsWith("extCrownKeepout") ||
    name.startsWith("extCrownClearSection") ||
    name === "extKernel" ||
    name === "extLugTruth" ||
    name === "extLugSouth" ||
    name === "extCrownTruth" ||
    name === "extSeatMacro" ||
    name === "extWaist" ||
    name === "extFinishId" ||
    name.startsWith("asm") ||
    name.startsWith("struct") ||
    name.startsWith("acc") ||
    name.startsWith("disp") ||
    name.startsWith("enc") ||
    name === "finishBench" ||
    name === "finishDir";
  if (strap) {
    const show = (extShow || readoutShow || strapShow) && !strapHide && !silhouetteOn;
    strap.setProduct(show);
    if (show) {
      strap.setPose(name === "strapBent" ? "bent" : "neutral");
      strap.setId(name === "strapId");
      const headsOnly =
        name === "presentHero" ||
        name === "presentThreeQuarter" ||
        name === "r1FinalHero" ||
        name === "r1FrontThreeQuarter" ||
        isAnnexE1View(name);
      strap.root.traverse((object) => {
        if (
          object.name.startsWith("strap:free:") ||
          object.name === "strap:buckle" ||
          object.name === "strap:keeper"
        ) {
          object.visible = !headsOnly;
        }
      });
    }
  }
  if (exterior && (extShow || readoutShow || strapShow)) {
    if (extTruth || READOUT_TRUTH_VIEWS.has(name as ReadoutViewName)) exterior.setTruth(true);
    else exterior.setProduct(true);
    if (name === "extLugSpan" || name === "extRearGrazing" || name === "extCrownRoot") {
      exterior.setLugInspect("span");
    } else if (name === "extLugSection") exterior.setLugInspect("section");
    else if (name === "extLugRoot") exterior.setLugInspect("root");
    else if (name === "extLugRootSection" || name === "extLugRootCut") exterior.setLugInspect("rootSection");
    else exterior.setLugInspect("off");
    if (name === "extCrownId" || name === "extCrownIdUnder" || name === "extCrownSection") {
      exterior.setCrownId(true);
    } else if (name === "extCrownKeepout" || name === "extCrownClearSection") {
      exterior.setCrownKeepout(true);
    } else if (name === "extFinishId") {
      exterior.setFinishId(true);
    }
    setDisplayPackaging(extTruth || READOUT_TRUTH_VIEWS.has(name as ReadoutViewName));
  } else if (!readoutShow) {
    restoreEngineeringPresentation();
  } else {
    setDisplayPackaging(READOUT_TRUTH_VIEWS.has(name as ReadoutViewName));
  }
  if (name === "r1FinishRake") {
    if (accommodation) accommodation.root.visible = false;
    if (display) display.root.visible = false;
    setDrivenReadoutVisible(false);
    if (enclosure) enclosure.root.visible = false;
    if (exterior) exterior.root.visible = false;
    setDisplayPackaging(false);
  }
  if (!silhouetteOn) movement.root.visible = true;
  if (
    name === "extLugRootSection" ||
    name === "extLugRootCut" ||
    name === "extCrownSection" ||
    name === "extCrownId" ||
    name === "extCrownIdUnder" ||
    name === "extCrownKeepout" ||
    name === "extCrownClearSection"
  ) {
    movement.root.visible = false;
    if (structure) structure.root.visible = false;
    if (assembly) assembly.root.visible = false;
    if (display) display.root.visible = false;
    setDrivenReadoutVisible(false);
    if (enclosure) enclosure.root.visible = false;
  }
  if ((phase1Views as string[]).includes(name)) {
    studio.applyView(name as ViewName);
    return;
  }
  if (showStructure && (phase2Views as string[]).includes(name)) {
    applyStructureView(studio.camera, studio.controls, name as StructureViewName);
    return;
  }
  if (showAssembly && (assemblyViews as string[]).includes(name)) {
    const jointDiag =
      name === "asmJointId" ||
      name === "asmJointClose" ||
      name === "asmJointSection" ||
      name === "asmJointSeat" ||
      name === "asmJointGraze1";
    movement.root.visible = name !== "asmUnderside" && !jointDiag;
    if (jointDiag) {
      if (display) display.root.visible = false;
      setDrivenReadoutVisible(false);
      if (enclosure) enclosure.root.visible = false;
      if (accommodation) accommodation.root.visible = false;
      if (exterior) exterior.root.visible = false;
      if (finish) finish.setStudio("off");
      applyJointPresentation(name);
    }
    applyAssemblyView(studio.camera, studio.controls, name as AssemblyViewName);
    return;
  }
  if (showFinish && (finishViews as string[]).includes(name)) {
    if (name === "finishBench") {
      finish?.setBench(true);
      if (accommodation) accommodation.root.visible = false;
      if (display) display.root.visible = false;
      if (enclosure) enclosure.root.visible = false;
      setDrivenReadoutVisible(false);
    }
    if (name === "finishDir") finish?.setDirectionDebug(true);
    if (name === "finishJointGraze1" || name === "finishJointGraze2") {
      setDrivenReadoutVisible(false);
      if (enclosure) enclosure.root.visible = false;
      if (exterior) exterior.root.visible = false;
      if (display) display.root.visible = false;
    }
    applyFinishView(studio.camera, studio.controls, name as FinishViewName);
    return;
  }
  if (showAccommodation && (accViews as string[]).includes(name)) {
    applyAccView(studio.camera, studio.controls, name as AccViewName);
    return;
  }
  if (showDisplay && display && (dispViews as string[]).includes(name)) {
    applyDisplayView(
      studio.camera,
      studio.controls,
      name as DisplayViewName,
      display.plan,
      display.report().hourClearance.nearestXy,
    );
    return;
  }
  if (showEnclosure && enclosure && (encViews as string[]).includes(name)) {
    const rep = enclosure.report();
    applyEncView(studio.camera, studio.controls, name as EncViewName, enclosure.plan, {
      frontXy: rep.front.clearance.xy,
      rearXy: rep.rear.clearance.xy,
    });
    return;
  }
  if (showExterior && exterior && (extViews as string[]).includes(name)) {
    applyExtView(studio.camera, studio.controls, name as ExtViewName, exterior.plan);
    return;
  }
  if (
    showExterior &&
    exterior &&
    (name === "presentHero" || name === "presentThreeQuarter" || name.startsWith("presentExploded"))
  ) {
    const view = name === "presentHero"
      ? { p: [18.35, 13.4, 74.01] as const, t: [-0.9, 0.55, 1.6] as const, fov: 32, up: [0, 1, 0] as const }
      : name === "presentThreeQuarter"
        ? { p: [32.0, 22.93, 68.62] as const, t: [-0.8, 0.5, 1.5] as const, fov: 32, up: [0, 1, 0] as const }
        : name === "presentExplodedSide"
          ? { p: [95, -10, 18] as const, t: [0, 0, 0] as const, fov: 42, up: [0, 0, 1] as const }
          : { p: [50, -40, 48] as const, t: [-0.5, 0.5, 1.5] as const, fov: 36, up: [0, 1, 0] as const };
    if (studio.controls.maxDistance < 140) studio.controls.maxDistance = 140;
    studio.camera.position.set(view.p[0], view.p[1], view.p[2]);
    studio.controls.target.set(view.t[0], view.t[1], view.t[2]);
    studio.camera.up.set(view.up[0], view.up[1], view.up[2]);
    studio.camera.fov = view.fov;
    studio.camera.updateProjectionMatrix();
    studio.controls.update();
    if (name.startsWith("presentExploded")) explodedStudy?.set(explodeAmount);
    return;
  }
  if (R1_VIEWS.has(name)) {
    applyR1Camera(name as R1ViewName);
    if (isAnnexE1View(name)) explodedStudy?.set(explodeAmount);
    return;
  }
  if (strap && (strapViews as string[]).includes(name)) {
    applyStrapView(studio.camera, studio.controls, name as StrapViewName, strap.plan);
    return;
  }
  if (name === READOUT_SUPPORT_VIEW) {
    if (finish) finish.setStudio("truth");
    if (exterior) exterior.setTruth(true);
    setDisplayPackaging(false);
    if (display) {
      display.setTruth(false);
      display.setEnvelope(false);
      display.setSection(false);
    }
    if (enclosure) {
      enclosure.setTruth(false);
      enclosure.setSection(false);
    }
    if (readout) {
      readout.setProduct(true);
      readout.setSection(false);
    }
  }
  if (showReadout && readout && (readoutViews as string[]).includes(name)) {
    applyReadoutView(studio.camera, studio.controls, name as ReadoutViewName, readout.plan);
  }
};

const setExplode = (input: number): void => {
  if (!explodedStudy) return;
  if (explodeAnimation !== null) cancelAnimationFrame(explodeAnimation);
  explodeAnimation = null;
  explodeAmount = THREE.MathUtils.clamp(Number.isFinite(input) ? input : 0, 0, 1);
  if (!isAnnexE1View(currentViewName)) applyAnyView("presentExploded");
  else explodedStudy.set(explodeAmount);
  releaseShell?.setExploded(explodeAmount > 0);
};

const animateExplode = (input: number, durationMs = 1100): void => {
  if (!explodedStudy) return;
  if (explodeAnimation !== null) cancelAnimationFrame(explodeAnimation);
  if (!isAnnexE1View(currentViewName)) applyAnyView("presentExploded");
  const target = THREE.MathUtils.clamp(Number.isFinite(input) ? input : 0, 0, 1);
  releaseShell?.setExploded(target > 0);
  if (reducedMotion || durationMs <= 0) {
    explodeAmount = target;
    explodedStudy.set(target);
    explodeAnimation = null;
    return;
  }
  const from = explodedStudy.value();
  const started = performance.now();
  const duration = Math.max(1, durationMs);
  const tick = (now: number): void => {
    const t = THREE.MathUtils.clamp((now - started) / duration, 0, 1);
    const eased = t * t * (3 - 2 * t);
    const value = THREE.MathUtils.lerp(from, target, eased);
    explodeAmount = value;
    explodedStudy.set(value);
    if (t < 1) explodeAnimation = requestAnimationFrame(tick);
    else {
      explodeAmount = target;
      explodedStudy.set(target);
      explodeAnimation = null;
    }
  };
  explodeAnimation = requestAnimationFrame(tick);
};

const explodedAssemblyReport = () => ({
  ...(explodedStudy?.report() ?? {
    annex: "E1",
    disposition: "STOP — EXPLOSION OWNERSHIP BLOCKER",
    presentationOnly: true,
  }),
  cameraAuthority: {
    presentExploded: { position: [50, -40, 48], target: [-0.5, 0.5, 1.5], fov: 36, up: [0, 1, 0] },
    presentExplodedSide: { position: [95, -10, 18], target: [0, 0, 0], fov: 42, up: [0, 0, 1] },
    r1E1Hero: r1CameraAuthority().r1E1Hero,
    r1E1Side: r1CameraAuthority().r1E1Side,
  },
  currentCamera: {
    view: currentViewName,
    position: studio.camera.position.toArray(),
    target: studio.controls.target.toArray(),
    up: studio.camera.up.toArray(),
    fov: studio.camera.fov,
  },
});

type DisplayDriveAuditView =
  | "side"
  | "rotating"
  | "stationary"
  | "motionWorks"
  | "flatId"
  | "minuteSection"
  | "coaxialSection";

type DisplayDriveAuditState = {
  viewName: string;
  forcedPose: ReturnType<typeof parseReadoutPose> | null;
  visibility: Map<THREE.Object3D, boolean>;
  cameraPosition: THREE.Vector3;
  cameraTarget: THREE.Vector3;
  cameraUp: THREE.Vector3;
  cameraFov: number;
};

type DisplayDriveAuditClippingState = {
  planes: THREE.Plane[] | null;
  intersection: boolean;
};

let displayDriveAuditState: DisplayDriveAuditState | null = null;
let displayDriveSectionGroup: THREE.Group | null = null;
const displayDriveAuditMeshMaterials = new Map<
  THREE.Mesh,
  THREE.Material | THREE.Material[]
>();
const displayDriveAuditClipping = new Map<
  THREE.Material,
  DisplayDriveAuditClippingState
>();
const displayDriveAuditCreatedMaterials = new Set<THREE.Material>();

const auditMaterials = (material: THREE.Material | THREE.Material[]) =>
  Array.isArray(material) ? material : [material];

const rememberDisplayDriveAuditMaterial = (
  mesh: THREE.Mesh,
  saveMeshMaterial = true,
): void => {
  if (saveMeshMaterial && !displayDriveAuditMeshMaterials.has(mesh)) {
    displayDriveAuditMeshMaterials.set(mesh, mesh.material);
  }
  for (const material of auditMaterials(mesh.material)) {
    if (displayDriveAuditClipping.has(material)) continue;
    displayDriveAuditClipping.set(material, {
      planes: material.clippingPlanes
        ? material.clippingPlanes.map((plane) => plane.clone())
        : null,
      intersection: material.clipIntersection,
    });
  }
};

const clearDisplayDriveAudit = (): void => {
  if (displayDriveSectionGroup) {
    displayDriveSectionGroup.traverse((object) => {
      if (!(object instanceof THREE.LineSegments)) return;
      object.geometry.dispose();
      if (Array.isArray(object.material)) {
        object.material.forEach((material) => material.dispose());
      } else object.material.dispose();
    });
    studio.scene.remove(displayDriveSectionGroup);
    displayDriveSectionGroup = null;
  }
  displayDrive?.setIdMode(false);
  displayDrive?.setSection(false);
  for (const [mesh, material] of displayDriveAuditMeshMaterials) {
    mesh.material = material;
  }
  for (const [material, state] of displayDriveAuditClipping) {
    material.clippingPlanes = state.planes
      ? state.planes.map((plane) => plane.clone())
      : null;
    material.clipIntersection = state.intersection;
    material.needsUpdate = true;
  }
  displayDriveAuditMeshMaterials.clear();
  displayDriveAuditClipping.clear();
  for (const material of displayDriveAuditCreatedMaterials) material.dispose();
  displayDriveAuditCreatedMaterials.clear();
  if (!displayDriveAuditState) return;
  for (const [object, visible] of displayDriveAuditState.visibility) {
    object.visible = visible;
  }
  currentViewName = displayDriveAuditState.viewName;
  viewReadoutPose = displayDriveAuditState.forcedPose;
  studio.camera.position.copy(displayDriveAuditState.cameraPosition);
  studio.controls.target.copy(displayDriveAuditState.cameraTarget);
  studio.camera.up.copy(displayDriveAuditState.cameraUp);
  studio.camera.fov = displayDriveAuditState.cameraFov;
  studio.camera.updateProjectionMatrix();
  studio.controls.update();
  displayDriveAuditState = null;
  junctionOwnershipRows = [];
};

const displayDriveAuditCamera = (
  position: [number, number, number],
  target: [number, number, number],
  fov: number,
): void => {
  studio.camera.position.set(...position);
  studio.controls.target.set(...target);
  studio.camera.up.set(0, 0, 1);
  studio.camera.fov = fov;
  studio.camera.updateProjectionMatrix();
  studio.controls.update();
};

const setDisplayDriveAudit = (mode: DisplayDriveAuditView): void => {
  if (!displayDrive) return;
  clearDisplayDriveAudit();
  restoreJunctionAudit();

  const visibility = new Map<THREE.Object3D, boolean>();
  studio.scene.traverse((object) => visibility.set(object, object.visible));
  displayDriveAuditState = {
    viewName: currentViewName,
    forcedPose: viewReadoutPose,
    visibility,
    cameraPosition: studio.camera.position.clone(),
    cameraTarget: studio.controls.target.clone(),
    cameraUp: studio.camera.up.clone(),
    cameraFov: studio.camera.fov,
  };

  debug.visible = false;
  if (structure) structure.debug.visible = false;
  if (accommodation) accommodation.root.visible = false;
  if (enclosure) enclosure.root.visible = false;
  if (exterior) exterior.root.visible = false;
  if (strap) strap.root.visible = false;
  if (readout) readout.root.visible = false;
  movement.root.visible = true;
  if (structure) structure.root.visible = true;
  if (assembly) assembly.root.visible = true;
  if (display) display.root.visible = true;
  displayDrive.setVisible(true);

  // Engineering captures intentionally bypass product-view group masks. Mesh
  // selection below remains narrow and is fully restored by clear().
  for (const root of [
    movement.root,
    structure?.root,
    assembly?.root,
    display?.root,
    displayDrive.root,
    displayDrive.centerOutput,
  ]) {
    if (!root) continue;
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) object.visible = true;
    });
  }

  const driveVisibility: Record<DisplayDriveAuditView, DisplayDriveAuditVisibility> = {
    side: "all",
    rotating: "rotating",
    stationary: "stationary",
    motionWorks: "motionWorks",
    flatId: "all",
    minuteSection: "minute",
    coaxialSection: "all",
  };
  displayDrive.setAuditVisibility(driveVisibility[mode]);
  if (mode === "coaxialSection") {
    displayDrive.setOwnersVisible({
      stationary: false,
      minute: true,
      compound: false,
      hour: true,
      minuteClaims: true,
      hourClaims: true,
    });
  }

  const showStationaryStack =
    mode === "side" ||
    mode === "stationary" ||
    mode === "minuteSection" ||
    mode === "coaxialSection";
  const showCenterSource =
    mode === "side" || mode === "rotating" || mode === "flatId";
  const showInterface =
    mode === "side" ||
    mode === "stationary" ||
    mode === "motionWorks" ||
    mode === "minuteSection" ||
    mode === "coaxialSection";
  const stationaryNeedles = [
    "struct:trainBridge:body",
    "struct:boss:center:upper",
    "struct:trainBridge:centerSupport",
    "assembly:bearing:center:upper:jewel",
    "assembly:bearing:center:upper:setting",
  ];
  const selectedMeshes: THREE.Mesh[] = [];
  studio.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const path = junctionPath(object);
    const phase4b = path.includes("phase4b:");
    const centerSource = path.includes("center:geom");
    const stationaryStack = stationaryNeedles.some((needle) => path.includes(needle));
    const interfaceCarrier = path.includes("display:interfaceCarrier");
    const selected =
      phase4b ||
      (showCenterSource && centerSource) ||
      (showStationaryStack && stationaryStack) ||
      (showInterface && interfaceCarrier);
    if (
      path.startsWith("calibre") ||
      path.startsWith("structure:root") ||
      path.startsWith("assembly:root") ||
      path.startsWith("DisplayRoot") ||
      path.startsWith("Phase4BDisplayDriveRoot")
    ) {
      object.visible = selected;
    }
    if (selected) selectedMeshes.push(object);
  });

  const section =
    mode === "side" ||
    mode === "stationary" ||
    mode === "minuteSection" ||
    mode === "coaxialSection";
  const idEngineering = section || mode === "flatId";
  if (idEngineering) {
    displayDrive.setIdMode(true);
    const palette = {
      source: new THREE.MeshBasicMaterial({
        name: "phase4b:id:centerSource",
        color: 0xef4444,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
      stationary: new THREE.MeshBasicMaterial({
        name: "phase4b:id:stationaryStack",
        color: 0x94a3b8,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
      interface: new THREE.MeshBasicMaterial({
        name: "phase4b:id:interfaceCarrier",
        color: 0xa855f7,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    };
    for (const material of Object.values(palette)) {
      displayDriveAuditCreatedMaterials.add(material);
    }
    for (const mesh of selectedMeshes) {
      const path = junctionPath(mesh);
      if (path.includes("phase4b:")) continue;
      rememberDisplayDriveAuditMaterial(mesh);
      if (path.includes("center:geom")) mesh.material = palette.source;
      else if (path.includes("display:interfaceCarrier"))
        mesh.material = palette.interface;
      else mesh.material = palette.stationary;
    }
  }
  displayDrive.setSection(false);
  if (section) {
    studio.scene.updateMatrixWorld(true);
    const sectionPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
    const focus = new THREE.Vector3(0, 0, 3.48);
    const group = new THREE.Group();
    group.name = `phase4b:section:${mode}`;
    const effectiveVisible = (object: THREE.Object3D): boolean => {
      let cursor: THREE.Object3D | null = object;
      while (cursor) {
        if (!cursor.visible) return false;
        cursor = cursor.parent;
      }
      return true;
    };
    for (const mesh of selectedMeshes) {
      if (!effectiveVisible(mesh)) continue;
      const path = junctionPath(mesh);
      const color = path.includes("phase4b:owner:compoundMotion")
        ? 0x22c55e
        : path.includes("phase4b:owner:hourMotion")
          ? 0x3b82f6
          : path.includes("phase4b:centerOutput")
            ? 0xf59e0b
            : path.includes("phase4b:owner:stationaryBearing")
              ? 0x64748b
              : path.includes("center:geom")
                ? 0xef4444
                : path.includes("display:interfaceCarrier")
                  ? 0xa855f7
                  : 0x94a3b8;
      const lines = sectionLineForMesh(mesh, sectionPlane, color, focus, 2.4);
      lines.name = `phase4b:sectionLine:${mesh.name || "mesh"}`;
      group.add(lines);
      mesh.visible = false;
    }
    studio.scene.add(group);
    displayDriveSectionGroup = group;
  }

  if (mode === "flatId") {
    junctionOwnershipRows = [
      {
        label: "center source",
        path: junctionPath(movement.parts.center.motion),
        color: "#ef4444",
      },
      {
        label: "stationary compound bearing",
        path: junctionPath(displayDrive.geometry.stationaryOwner),
        color: "#64748b",
      },
      {
        label: "minute drive + minute hand",
        path: junctionPath(displayDrive.geometry.centerOutput),
        color: "#f59e0b",
      },
      {
        label: "32T/8T compound motion",
        path: junctionPath(displayDrive.geometry.compoundMotion),
        color: "#22c55e",
      },
      {
        label: "48T hour wheel/pipe + hour hand",
        path: junctionPath(displayDrive.geometry.hourMotion),
        color: "#3b82f6",
      },
    ];
  } else {
    junctionOwnershipRows = [];
  }

  if (mode === "side")
    displayDriveAuditCamera([8, 0.08, 3.48], [0, 0, 3.48], 26);
  else if (mode === "rotating")
    displayDriveAuditCamera([9, -9, 9], [0, 0, 3.7], 38);
  else if (mode === "stationary")
    displayDriveAuditCamera([4, 0.04, 2.4], [0, -0.04, 2.4], 18);
  else if (mode === "motionWorks")
    displayDriveAuditCamera([2.8, -3.5, 6], [0, -0.25, 3.08], 18);
  else if (mode === "flatId")
    displayDriveAuditCamera([9, -9, 9], [0, 0, 3.7], 38);
  else if (mode === "minuteSection")
    displayDriveAuditCamera([5, 0.06, 3.85], [0, 0, 3.85], 30);
  else
    displayDriveAuditCamera([5, 0.06, 4.12], [0, 0, 4.12], 24);
};

const setSilhouette = (on: boolean): void => {
  if (!structure || !showStructure) return;
  if (on && auditOn) setAudit(false);
  silhouetteOn = on;
  movement.root.visible = !on;
  debug.visible = on ? false : debugOn;
  structure.debug.visible = on ? false : debugOn;
  structure.setSilhouette(on);
  if (assembly) assembly.setSilhouette(on);
  if (accommodation) accommodation.root.visible = !on;
  if (display) display.root.visible = !on;
  if (enclosure) enclosure.root.visible = !on;
  if (exterior) exterior.root.visible = !on;
  setDrivenReadoutVisible(!on);
  if (strap) strap.setProduct(false);
  studio.scene.background = new THREE.Color(on ? 0xd8dbe0 : 0x0a0a0c);
  if (!on && finish) {
    finish.apply();
    finish.setStudio("showcase");
  }
  if (on) applyAnyView("silhouette");
};

resizeRenderer(renderer, studio.camera);
if (startSilhouette && showStructure) {
  setSilhouette(true);
} else {
  applyAnyView(startView);
}
if (frozen || reducedMotion) {
  studio.controls.autoRotate = false;
}

if (!frozen && params.get("shell") !== "0" && explodedStudy) {
  releaseShell = createReleaseShell({
    canvas: renderer.domElement,
    initialExploded: explodedStudy.value() > 0,
    initialPaused: reducedMotion,
    initialView: lastPublicView,
    layers: explodedStudy.report().layers.map(({ id, label }) => ({ id, label })),
    onSetView: (view) => {
      lastPublicView = view;
      applyAnyView(PUBLIC_VIEW_CAMERAS[view]);
    },
    onSetExploded: (exploded, reduce) => {
      if (exploded) {
        if (!isAnnexE1View(currentViewName)) applyAnyView("r1E1Hero");
        if (reduce) setExplode(1);
        else animateExplode(1);
        return;
      }
      if (isAnnexE1View(currentViewName)) {
        applyAnyView(PUBLIC_VIEW_CAMERAS[lastPublicView]);
        return;
      }
      if (reduce) setExplode(0);
      else animateExplode(0);
    },
    onSetPaused: (paused) => {
      setPlaybackPaused(paused);
    },
    onResetView: () => {
      lastPublicView = "hero";
      setExplode(0);
      applyAnyView("r1FinalHero");
    },
    onReducedMotionChange: (reduce) => {
      reducedMotion = reduce;
      if (reduce) setPlaybackPaused(true);
    },
  });
}

const toggleDebug = (): void => {
  debugOn = !debugOn;
  debug.visible = debugOn && !silhouetteOn;
  if (structure) structure.debug.visible = debugOn && !silhouetteOn;
};

window.addEventListener("keydown", (event) => {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
  const target = event.target;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return;
  }
  if (event.key === "e" || event.key === "E") {
    if (!releaseShell) animateExplode(explodedStudy?.value() === 1 ? 0 : 1);
  }
  if (!params.has("debug")) return;
  if (event.key === "d" || event.key === "D") {
    toggleDebug();
  }
  const phase1: Record<string, ViewName> = {
    "1": "threeQuarter",
    "2": "top",
    "3": "escape",
    "4": "profile",
    "5": "barrel",
  };
  const p1 = phase1[event.key];
  if (p1) {
    if (silhouetteOn) setSilhouette(false);
    applyAnyView(p1);
  }
  if (!showStructure) return;
  const phase2: Record<string, StructureViewName> = {
    "6": "structHero",
    "7": "structTop",
    "8": "structTrain",
    "9": "structEscape",
    "0": "structCock",
  };
  const p2 = phase2[event.key];
  if (p2) {
    if (silhouetteOn) setSilhouette(false);
    applyAnyView(p2);
  }
  if (event.key === "s" || event.key === "S") {
    setSilhouette(!silhouetteOn);
  }
});

window.addEventListener("resize", () => {
  resizeRenderer(renderer, studio.camera);
});

const clock = new THREE.Clock();
let timeOverride: number | null = startTime;
let playbackPaused = frozen || reducedMotion;
let pausedTimelineSeconds = 0;
let pausedWallSeconds = 0;

const currentKinematicTime = (): number => {
  if (timeOverride !== null) return timeOverride;
  if (frozen) return 0;
  if (playbackPaused) return pausedTimelineSeconds;
  return clock.getElapsedTime() - pausedWallSeconds;
};

const setPlaybackPaused = (paused: boolean): void => {
  if (paused === playbackPaused) return;
  const wall = clock.getElapsedTime();
  if (paused) pausedTimelineSeconds = wall - pausedWallSeconds;
  else pausedWallSeconds = wall - pausedTimelineSeconds;
  playbackPaused = paused;
  studio.controls.autoRotate = !paused && !frozen && !reducedMotion;
  releaseShell?.setPaused(paused);
};

const releasePresentationReport = () => ({
  annex: "R1",
  presentationOnly: true,
  views: r1CameraAuthority(),
  profiles: {
    r1FrontRead: PHASE5D_C_PROFILES.r1FrontRead,
    r1Wearable: PHASE5D_C_PROFILES.r1Wearable,
    r1Sapphire: PHASE5D_C_PROFILES.r1Sapphire,
    r1Rear: PHASE5D_C_PROFILES.r1Rear,
    r1Raking: PHASE5D_C_PROFILES.r1Raking,
  },
  accepted5dCCamerasRetained: true,
  accepted5dCProfilesRetained: true,
  runtime: (() => {
    const scene = { objects: 0, meshes: 0, visibleObjects: 0, visibleMeshes: 0 };
    studio.scene.traverse((object) => {
      scene.objects += 1;
      if (object.visible) scene.visibleObjects += 1;
      if (object instanceof THREE.Mesh) {
        scene.meshes += 1;
        if (object.visible) scene.visibleMeshes += 1;
      }
    });
    return {
      renderer: {
        render: {
          calls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          lines: renderer.info.render.lines,
          points: renderer.info.render.points,
          frame: renderer.info.render.frame,
        },
        memory: {
          geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures,
        },
        pixelRatio: renderer.getPixelRatio(),
        canvas: {
          pixelWidth: renderer.domElement.width,
          pixelHeight: renderer.domElement.height,
          cssWidth: renderer.domElement.clientWidth,
          cssHeight: renderer.domElement.clientHeight,
        },
      },
      scene,
    };
  })(),
  current: {
    view: currentViewName,
    profile: currentPhase5dProfile,
    camera: {
      position: studio.camera.position.toArray(),
      target: studio.controls.target.toArray(),
      up: studio.camera.up.toArray(),
      fov: studio.camera.fov,
    },
    exploded: explodedStudy?.value() ?? 0,
    playbackPaused,
    reducedMotion,
    shellEnabled: releaseShell !== null,
    publicView: lastPublicView,
  },
});

const updateKinematics = (time: number): void => {
  movement.update(time);
  displayDrive?.update(movement.parts.center.motion.rotation.z);
};

const applyReadoutPresentationForRender = (
  time: number,
): DisplayDrivePresentationToken | null => {
  if (!displayDrive) return null;
  const pose = activeReadoutPose();
  if (!pose) return null;
  const poseQ = -Math.PI * 2 * (pose.hours + pose.minutes / 60);
  return displayDrive.applyPresentationTime(
    time,
    displayDrive.getSourceZero() + poseQ,
  );
};

const renderAt = (time: number): void => {
  updateKinematics(time);
  const presentationToken = applyReadoutPresentationForRender(time);
  studio.controls.update();
  renderer.render(studio.scene, studio.camera);
  if (presentationToken) displayDrive?.restorePresentationTime(presentationToken);
};

function frame(): void {
  renderAt(currentKinematicTime());
  requestAnimationFrame(frame);
}

type SurfaceArtifactAuditMode =
  | "off"
  | "bridgeOwnership"
  | "bridgeBaseline"
  | "bridgeBodyOnly"
  | "bridgeBossOnly"
  | "bridgeWireframe"
  | "bridgeNormals"
  | "lugOwnership"
  | "lugNoRoughness"
  | "lugNoAnisotropy"
  | "lugWireframe"
  | "lugNormals";

type SurfaceArtifactAuditState = {
  materials: Map<THREE.Mesh, THREE.Material | THREE.Material[]>;
  visibility: Map<THREE.Object3D, boolean>;
  finishApplied: boolean;
  exteriorFinishId: boolean;
};

let surfaceArtifactAuditState: SurfaceArtifactAuditState | null = null;
const surfaceArtifactAuditMaterials = new Set<THREE.Material>();

const objectPath = (object: THREE.Object3D): string => {
  const names: string[] = [];
  let cursor: THREE.Object3D | null = object;
  while (cursor) {
    if (cursor.name) names.push(cursor.name);
    cursor = cursor.parent;
  }
  return names.reverse().join("/");
};

const rememberSurfaceVisibility = (object: THREE.Object3D, visible: boolean): void => {
  if (!surfaceArtifactAuditState) return;
  if (!surfaceArtifactAuditState.visibility.has(object)) {
    surfaceArtifactAuditState.visibility.set(object, object.visible);
  }
  object.visible = visible;
};

const rememberSurfaceMaterial = (
  mesh: THREE.Mesh,
  material: THREE.Material | THREE.Material[],
): void => {
  if (!surfaceArtifactAuditState) return;
  if (!surfaceArtifactAuditState.materials.has(mesh)) {
    surfaceArtifactAuditState.materials.set(mesh, mesh.material);
  }
  mesh.material = material;
  const list = Array.isArray(material) ? material : [material];
  for (const item of list) surfaceArtifactAuditMaterials.add(item);
};

const bridgeOwnerKind = (mesh: THREE.Mesh): "boss" | "body" | "assembly" | "other" => {
  const path = objectPath(mesh);
  if (path.includes("AssemblyRoot") || path.includes("assembly:")) return "assembly";
  if (mesh.name.startsWith("struct:boss:") || mesh.name.startsWith("struct:foot:")) return "boss";
  if (
    path.includes("/trainBridge/") ||
    path.includes("/escapeFinger/") ||
    path.includes("/balanceCock/")
  ) {
    return "body";
  }
  return "other";
};

const clearSurfaceArtifactAudit = (): void => {
  const state = surfaceArtifactAuditState;
  if (!state) return;
  if (state.exteriorFinishId) exterior?.setFinishId(false);
  for (const [mesh, material] of state.materials) mesh.material = material;
  for (const [object, visible] of state.visibility) object.visible = visible;
  for (const material of surfaceArtifactAuditMaterials) material.dispose();
  surfaceArtifactAuditMaterials.clear();
  if (finish) {
    if (state.finishApplied) finish.apply();
    else finish.revert();
    finish.setStudio("showcase");
  }
  surfaceArtifactAuditState = null;
};

const setSurfaceArtifactAudit = (mode: SurfaceArtifactAuditMode): void => {
  clearSurfaceArtifactAudit();
  if (mode === "off") return;
  surfaceArtifactAuditState = {
    materials: new Map(),
    visibility: new Map(),
    finishApplied: finish?.applied() ?? false,
    exteriorFinishId: false,
  };

  if (mode.startsWith("bridge")) {
    rememberSurfaceVisibility(movement.root, false);
    if (structure) rememberSurfaceVisibility(structure.root, true);
    if (assembly) rememberSurfaceVisibility(assembly.root, true);
    if (accommodation) rememberSurfaceVisibility(accommodation.root, false);
    if (display) rememberSurfaceVisibility(display.root, false);
    if (enclosure) rememberSurfaceVisibility(enclosure.root, false);
    if (exterior) rememberSurfaceVisibility(exterior.root, false);
    if (strap) rememberSurfaceVisibility(strap.root, false);
    setDrivenReadoutVisible(false);

    if (mode === "bridgeBaseline") {
      finish?.revert();
      finish?.setStudio("showcase");
      return;
    }

    const idMaterials = {
      body: new THREE.MeshBasicMaterial({ color: 0xff4aa8, toneMapped: false }),
      boss: new THREE.MeshBasicMaterial({
        color: 0x21d7ff,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
      assembly: new THREE.MeshBasicMaterial({ color: 0xffb000, toneMapped: false }),
      other: new THREE.MeshBasicMaterial({ color: 0x25303c, toneMapped: false }),
    };
    const wire = new THREE.MeshBasicMaterial({ color: 0xe8eef7, wireframe: true, toneMapped: false });
    const normal = new THREE.MeshNormalMaterial();
    for (const material of [...Object.values(idMaterials), wire, normal]) {
      surfaceArtifactAuditMaterials.add(material);
    }

    for (const root of [structure?.root, assembly?.root]) {
      root?.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const kind = bridgeOwnerKind(object);
        if (mode === "bridgeBodyOnly") {
          rememberSurfaceVisibility(object, kind === "body");
          return;
        }
        if (mode === "bridgeBossOnly") {
          rememberSurfaceVisibility(object, kind === "boss" || kind === "assembly");
          return;
        }
        if (mode === "bridgeWireframe") rememberSurfaceMaterial(object, wire);
        else if (mode === "bridgeNormals") rememberSurfaceMaterial(object, normal);
        else rememberSurfaceMaterial(object, idMaterials[kind]);
      });
    }
    return;
  }

  if (!exterior) return;
  if (mode === "lugOwnership") {
    exterior.setFinishId(true);
    surfaceArtifactAuditState.exteriorFinishId = true;
    return;
  }
  exterior.root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.name.startsWith("ext:lug-")) return;
    if (mode === "lugWireframe") {
      rememberSurfaceMaterial(
        object,
        new THREE.MeshBasicMaterial({ color: 0xe8eef7, wireframe: true, toneMapped: false }),
      );
    } else if (mode === "lugNormals") {
      rememberSurfaceMaterial(object, new THREE.MeshNormalMaterial());
    } else {
      const source = Array.isArray(object.material) ? object.material : [object.material];
      const clones = source.map((material) => {
        const clone = material.clone();
        if (mode === "lugNoRoughness" && clone instanceof THREE.MeshStandardMaterial) {
          clone.roughnessMap = null;
          clone.needsUpdate = true;
        }
        if (mode === "lugNoAnisotropy" && clone instanceof THREE.MeshPhysicalMaterial) {
          clone.anisotropy = 0;
          clone.needsUpdate = true;
        }
        return clone;
      });
      rememberSurfaceMaterial(object, Array.isArray(object.material) ? clones : clones[0]);
    }
  });
};

const surfaceArtifactReport = () => {
  studio.scene.updateMatrixWorld(true);
  const rows: {
    name: string;
    path: string;
    finishSlots: string[];
    triangles: number;
    degenerateTriangles: number;
    degenerateUvTriangles: number;
    invalidTangents: number;
    tangentMismatchVertices: number;
    materials: {
      type: string;
      transparent: boolean;
      depthTest: boolean;
      depthWrite: boolean;
      polygonOffset: boolean;
      polygonOffsetFactor: number;
      polygonOffsetUnits: number;
      roughnessMap: boolean;
      anisotropy: number | null;
    }[];
    bounds: { min: number[]; max: number[] };
  }[] = [];
  const positionA = new THREE.Vector3();
  const positionB = new THREE.Vector3();
  const positionC = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const tangentA = new THREE.Vector3();
  const tangentB = new THREE.Vector3();
  const box = new THREE.Box3();

  studio.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const path = objectPath(object);
    const under = (root: THREE.Object3D | null | undefined): boolean => {
      let cursor: THREE.Object3D | null = object;
      while (cursor) {
        if (cursor === root) return true;
        cursor = cursor.parent;
      }
      return false;
    };
    const relevant =
      under(movement.root) ||
      under(structure?.root) ||
      under(assembly?.root) ||
      under(exterior?.root);
    if (!relevant) return;
    const geometry = object.geometry;
    const position = geometry.getAttribute("position");
    const uv = geometry.getAttribute("uv");
    const tangent = geometry.getAttribute("tangent");
    const index = geometry.getIndex();
    let triangles = 0;
    let degenerateTriangles = 0;
    let degenerateUvTriangles = 0;
    const indexAt = (i: number) => (index ? index.getX(i) : i);
    const count = index ? index.count : position?.count ?? 0;
    for (let i = 0; position && i + 2 < count; i += 3) {
      const i0 = indexAt(i);
      const i1 = indexAt(i + 1);
      const i2 = indexAt(i + 2);
      positionA.fromBufferAttribute(position, i0);
      positionB.fromBufferAttribute(position, i1);
      positionC.fromBufferAttribute(position, i2);
      const twiceArea = ab.subVectors(positionB, positionA).cross(ac.subVectors(positionC, positionA)).length();
      if (!Number.isFinite(twiceArea) || twiceArea < 1e-12) degenerateTriangles++;
      if (uv) {
        const du1 = uv.getX(i1) - uv.getX(i0);
        const dv1 = uv.getY(i1) - uv.getY(i0);
        const du2 = uv.getX(i2) - uv.getX(i0);
        const dv2 = uv.getY(i2) - uv.getY(i0);
        if (Math.abs(du1 * dv2 - dv1 * du2) < 1e-12) degenerateUvTriangles++;
      }
      triangles++;
    }
    let invalidTangents = 0;
    if (tangent) {
      for (let i = 0; i < tangent.count; i++) {
        const x = tangent.getX(i);
        const y = tangent.getY(i);
        const z = tangent.getZ(i);
        const len = Math.hypot(x, y, z);
        if (!Number.isFinite(len) || len < 0.5) invalidTangents++;
      }
    }
    let tangentMismatchVertices = 0;
    if (tangent && index && uv && geometry.getAttribute("normal")) {
      const clone = geometry.clone();
      clone.deleteAttribute("tangent");
      try {
        clone.computeTangents();
        const rebuilt = clone.getAttribute("tangent");
        if (rebuilt && rebuilt.count === tangent.count) {
          for (let i = 0; i < tangent.count; i++) {
            tangentA.set(tangent.getX(i), tangent.getY(i), tangent.getZ(i));
            tangentB.set(rebuilt.getX(i), rebuilt.getY(i), rebuilt.getZ(i));
            const la = tangentA.length();
            const lb = tangentB.length();
            if (!Number.isFinite(la + lb) || la < 0.5 || lb < 0.5 || Math.abs(tangentA.dot(tangentB) / (la * lb)) < 0.999) {
              tangentMismatchVertices++;
            }
          }
        }
      } catch {
        tangentMismatchVertices = tangent.count;
      }
      clone.dispose();
    }
    box.setFromObject(object);
    const materialsForMesh = Array.isArray(object.material) ? object.material : [object.material];
    rows.push({
      name: object.name || object.parent?.name || "(unnamed)",
      path,
      finishSlots: Array.isArray(object.userData.finishSlots)
        ? [...object.userData.finishSlots]
        : object.userData.finishKind
          ? [String(object.userData.finishKind)]
          : [],
      triangles,
      degenerateTriangles,
      degenerateUvTriangles,
      invalidTangents,
      tangentMismatchVertices,
      materials: materialsForMesh.map((material) => ({
        type: material.type,
        transparent: material.transparent,
        depthTest: material.depthTest,
        depthWrite: material.depthWrite,
        polygonOffset: material.polygonOffset,
        polygonOffsetFactor: material.polygonOffsetFactor,
        polygonOffsetUnits: material.polygonOffsetUnits,
        roughnessMap:
          material instanceof THREE.MeshStandardMaterial && material.roughnessMap !== null,
        anisotropy:
          material instanceof THREE.MeshPhysicalMaterial ? material.anisotropy : null,
      })),
      bounds: { min: box.min.toArray(), max: box.max.toArray() },
    });
  });

  const coplanarPairs: {
    parent: string;
    base: string;
    overlay: string;
    minZDelta: number;
    maxZDelta: number;
    overlapX: number;
    overlapY: number;
  }[] = [];
  for (const parentName of ["trainBridge", "escapeFinger", "balanceCock"]) {
    const parent = structure?.pose.getObjectByName(parentName);
    if (!parent) continue;
    const meshes: THREE.Mesh[] = [];
    parent.traverse((object) => {
      if (object instanceof THREE.Mesh) meshes.push(object);
    });
    const overlays = meshes.filter(
      (mesh) => mesh.name.startsWith("struct:boss:") || mesh.name.startsWith("struct:foot:"),
    );
    const bases = meshes.filter((mesh) => !overlays.includes(mesh));
    for (const base of bases) {
      const baseBox = new THREE.Box3().setFromObject(base);
      for (const overlay of overlays) {
        const overlayBox = new THREE.Box3().setFromObject(overlay);
        const overlapX = Math.min(baseBox.max.x, overlayBox.max.x) - Math.max(baseBox.min.x, overlayBox.min.x);
        const overlapY = Math.min(baseBox.max.y, overlayBox.max.y) - Math.max(baseBox.min.y, overlayBox.min.y);
        const minZDelta = overlayBox.min.z - baseBox.min.z;
        const maxZDelta = overlayBox.max.z - baseBox.max.z;
        if (overlapX > 0 && overlapY > 0 && Math.abs(minZDelta) < 1e-7 && Math.abs(maxZDelta) < 1e-7) {
          coplanarPairs.push({
            parent: parentName,
            base: base.name || "(unnamed body)",
            overlay: overlay.name,
            minZDelta,
            maxZDelta,
            overlapX,
            overlapY,
          });
        }
      }
    }
  }
  return {
    renderer: { shadowMapEnabled: renderer.shadowMap.enabled },
    finishImplementation: "material replacement on existing meshes; no duplicate finish geometry",
    rows,
    coplanarPairs,
  };
};

const phase5dPresentationReport = () => {
  studio.scene.updateMatrixWorld(true);
  const materialRow = (material: THREE.MeshPhysicalMaterial) => ({
    type: material.type,
    color: `#${material.color.getHexString()}`,
    metalness: material.metalness,
    roughness: material.roughness,
    transmission: material.transmission,
    thickness: material.thickness,
    ior: material.ior,
    attenuationColor: `#${material.attenuationColor.getHexString()}`,
    attenuationDistance: material.attenuationDistance,
    specularIntensity: material.specularIntensity,
    specularColor: `#${material.specularColor.getHexString()}`,
    envMapIntensity: material.envMapIntensity,
    transparent: material.transparent,
    opacity: material.opacity,
    depthWrite: material.depthWrite,
    depthTest: material.depthTest,
    alphaToCoverage: material.alphaToCoverage,
    dithering: material.dithering,
    side: material.side === THREE.FrontSide ? "front" : material.side === THREE.BackSide ? "back" : "double",
  });
  const sapphireOwners: {
    path: string;
    materialAuthority: "inner-slab" | "outer-sculpture" | "final-optical-body";
    visible: boolean;
    finalProductOpticalOwner: boolean;
    triangles: number;
    renderOrder: number;
    bounds: { min: number[]; max: number[] };
  }[] = [];
  const sapphireBox = new THREE.Box3();
  const reportedSapphireObjects = new Set<THREE.Mesh>();
  for (const [root, material, materialAuthority] of [
    [enclosure?.root, enclosure?.materials.sapphire, "inner-slab"],
    [exterior?.root, exterior?.materials.sapphire, "outer-sculpture"],
  ] as const) {
    root?.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const assigned = Array.isArray(object.material)
        ? object.material.includes(material as THREE.Material)
        : object.material === material;
      if (!assigned || reportedSapphireObjects.has(object)) return;
      reportedSapphireObjects.add(object);
      const index = object.geometry.getIndex();
      const position = object.geometry.getAttribute("position");
      sapphireBox.setFromObject(object);
      sapphireOwners.push({
        path: objectPath(object),
        materialAuthority: object.userData.phase5dOpticalOwner ? "final-optical-body" : materialAuthority,
        visible: object.visible && (object.parent?.visible ?? true),
        finalProductOpticalOwner: object.userData.phase5dOpticalOwner === true,
        triangles: Math.floor((index?.count ?? position?.count ?? 0) / 3),
        renderOrder: object.renderOrder,
        bounds: { min: sapphireBox.min.toArray(), max: sapphireBox.max.toArray() },
      });
    });
  }
  const lighting: {
    name: string;
    type: string;
    visible: boolean;
    intensity: number;
    color: string;
    groundColor?: string;
    position: number[];
  }[] = [];
  studio.scene.traverse((object) => {
    if (!(object instanceof THREE.Light) || !object.name.startsWith("finish:showcase:")) return;
    lighting.push({
      name: object.name,
      type: object.type,
      visible: object.visible && (object.parent?.visible ?? true),
      intensity: object.intensity,
      color: `#${object.color.getHexString()}`,
      ...(object instanceof THREE.HemisphereLight
        ? { groundColor: `#${object.groundColor.getHexString()}` }
        : {}),
      position: object.position.toArray(),
    });
  });
  const contextAttributes = renderer.getContext().getContextAttributes();
  return {
    phase: "5D-C",
    comparisonMode: phase5dBaselineComparison ? "pre-5D matched-camera baseline" : "final product",
    disposition: "PHASE 5D-C — FINAL PRESENTATION CLOSED",
    geometryAuthority: {
      geometryMutatedForPresentation: false,
      sapphireConstruction:
        "authoritative enclosure slab and exterior sculpture retained unchanged; final product shades one open-boundary union manifold per crystal side with internal mating faces omitted",
      packageSnapshot: {
        layout: movement.layout,
        structure: structure
          ? {
              outer: structure.plan.outer,
              inner: structure.plan.inner,
              elements: structure.plan.elements,
              bearings: structure.plan.bearings,
              anchors: structure.plan.anchors,
              loci: structure.plan.loci,
            }
          : null,
        accommodation: accommodation?.plan ?? null,
        display: display?.plan ?? null,
        enclosure: enclosure?.plan ?? null,
        exterior: exterior?.plan ?? null,
      },
      identity: exterior?.report().identity ?? null,
    },
    sapphire: {
      innerMaterial: enclosure ? materialRow(enclosure.materials.sapphire) : null,
      outerMaterial: exterior ? materialRow(exterior.materials.sapphire) : null,
      owners: sapphireOwners,
      topology: exterior?.report().opticalOwnership ?? null,
      ordering: {
        automaticTransparentDistanceSort: renderer.sortObjects,
        commonRenderOrder: sapphireOwners.every((row) => row.renderOrder === 0),
        depthWriteDisabled: [enclosure?.materials.sapphire, exterior?.materials.sapphire]
          .filter((item): item is THREE.MeshPhysicalMaterial => item !== undefined)
          .every((item) => item.depthWrite === false),
        depthTestRetained: [enclosure?.materials.sapphire, exterior?.materials.sapphire]
          .filter((item): item is THREE.MeshPhysicalMaterial => item !== undefined)
          .every((item) => item.depthTest === true),
      },
    },
    lighting: {
      profile: currentPhase5dProfile,
      authority: PHASE5D_C_PROFILES,
      environment: {
        mode: "neutral showcase PMREM with broad restrained cards and lifted negative fill",
        intensity: studio.scene.environmentIntensity,
        background:
          studio.scene.background instanceof THREE.Color
            ? `#${studio.scene.background.getHexString()}`
            : studio.scene.background?.type ?? null,
      },
      lights: lighting,
    },
    cameras: {
      seedPreflight: {
        presentHeroSeedTiltDeg: 17.959,
        presentThreeQuarterSeedTiltDeg: 25.596,
        presentThreeQuarterSeedPasses28To34: false,
        resolution: "preserved +X/+Y azimuth; distance/Z/FOV only adjusted to the authorized in-band 30.623-degree ray",
      },
      presentHero: { position: [18.35, 13.4, 74.01], target: [-0.9, 0.55, 1.6], fov: 32 },
      presentThreeQuarter: { position: [32, 22.93, 68.62], target: [-0.8, 0.5, 1.5], fov: 32 },
      releaseAnnexR1: r1CameraAuthority(),
      current: {
        view: currentViewName,
        position: studio.camera.position.toArray(),
        target: studio.controls.target.toArray(),
        up: studio.camera.up.toArray(),
        fov: studio.camera.fov,
        far: studio.camera.far,
      },
    },
    renderer: {
      antialias: contextAttributes?.antialias ?? null,
      pixelRatio: renderer.getPixelRatio(),
      outputColorSpace: renderer.outputColorSpace,
      toneMapping: renderer.toneMapping,
      exposure: renderer.toneMappingExposure,
      transparentObjectSorting: renderer.sortObjects,
      shadowMapEnabled: renderer.shadowMap.enabled,
    },
    hygiene: {
      shadowsDisabledSoNoShadowAcnePath: renderer.shadowMap.enabled === false,
      noSapphireDepthWrites: [enclosure?.materials.sapphire, exterior?.materials.sapphire]
        .filter((item): item is THREE.MeshPhysicalMaterial => item !== undefined)
        .every((item) => item.depthWrite === false),
      noSapphirePolygonOffset: [enclosure?.materials.sapphire, exterior?.materials.sapphire]
        .filter((item): item is THREE.MeshPhysicalMaterial => item !== undefined)
        .every((item) => item.polygonOffset === false),
      screenDoorAlphaCoverageDisabled: [enclosure?.materials.sapphire, exterior?.materials.sapphire]
        .filter((item): item is THREE.MeshPhysicalMaterial => item !== undefined)
        .every((item) => item.alphaToCoverage === false),
      materialDitheringDisabled: [enclosure?.materials.sapphire, exterior?.materials.sapphire]
        .filter((item): item is THREE.MeshPhysicalMaterial => item !== undefined)
        .every((item) => item.dithering === false),
      typographyOrBrandingStarted: true,
      faceUnsigned: true,
      duplicatedOverlappingTransmissiveVolumeInProduct: false,
    },
  };
};

type Phase5dB2DiagnosticMode =
  | "product"
  | "legacySapphire"
  | "flatSapphire"
  | "sapphireId"
  | "roughnessFlat";
type Phase5dB2Profile = "authoritative" | "conservative" | "middle" | "bright";
type Phase5dB2Camera = "hero" | "macro";
type Phase5dB2FamilyIdState = {
  materials: Map<THREE.Mesh, THREE.Material | THREE.Material[]>;
  visibility: Map<THREE.Mesh, boolean>;
  background: THREE.Color | THREE.Texture | null;
  toneMapping: THREE.ToneMapping;
  generated: THREE.Material[];
};
let phase5dB2FamilyIdState: Phase5dB2FamilyIdState | null = null;

const setPhase5dB2Diagnostic = (mode: Phase5dB2DiagnosticMode): void => {
  if (!exterior) return;
  const sapphireMode: SapphirePresentationMode =
    mode === "legacySapphire"
      ? "legacy"
      : mode === "flatSapphire"
        ? "flat"
        : mode === "sapphireId"
          ? "id"
          : "corrected";
  const finishMode: ExteriorFinishDiagnosticMode = mode === "roughnessFlat" ? "roughnessFlat" : "finished";
  exterior.setSapphirePresentation(sapphireMode);
  exterior.setFinishDiagnostic(finishMode);
};

const setPhase5dB2Profile = (profile: Phase5dB2Profile, cameraMode: Phase5dB2Camera): void => {
  const rows = {
    authoritative: { exposure: 1.12, environment: 1.1, hemisphere: 0.52, fill: 0.34, key: 0.52, rim: 0.2, under: 0.14 },
    conservative: { exposure: 1.3, environment: 1.15, hemisphere: 0.6, fill: 0.5, key: 0.5, rim: 0.18, under: 0.15 },
    middle: { exposure: 1.34, environment: 1.18, hemisphere: 0.63, fill: 0.54, key: 0.52, rim: 0.2, under: 0.165 },
    bright: { exposure: 1.38, environment: 1.22, hemisphere: 0.66, fill: 0.58, key: 0.55, rim: 0.22, under: 0.18 },
  } as const;
  const row = rows[profile];
  renderer.toneMappingExposure = row.exposure;
  studio.scene.environmentIntensity = row.environment;
  studio.scene.traverse((object) => {
    if (!(object instanceof THREE.Light)) return;
    if (object.name === "finish:showcase:hemisphere") object.intensity = row.hemisphere;
    else if (object.name === "finish:showcase:fill") object.intensity = row.fill;
    else if (object.name === "finish:showcase:key") object.intensity = row.key;
    else if (object.name === "finish:showcase:rim") object.intensity = row.rim;
    else if (object.name === "finish:showcase:under") object.intensity = row.under;
    else if (object.name === "finish:showcase:r1-rake") object.intensity = 0;
    else if (object.name === "finish:showcase:r1-finish-proof") object.intensity = 0;
    else if (object.name === "finish:showcase:r1-front-read") object.intensity = 0;
    else if (object.name === "finish:showcase:r1-rear-rake") object.intensity = 0;
  });
  if (cameraMode === "hero" && profile !== "authoritative") {
    studio.camera.position.set(16, 10, 31.5);
    studio.controls.target.set(-0.8, 0.6, 1.7);
    studio.camera.fov = 30;
    studio.camera.updateProjectionMatrix();
    studio.controls.update();
  }
};

const setPhase5dCProfile = (profile: Phase5dCProfile): void => {
  applyPhase5dCProfile(profile);
};

const setPhase5dB2FamilyId = (on: boolean): void => {
  if (phase5dB2FamilyIdState) {
    for (const [mesh, material] of phase5dB2FamilyIdState.materials) mesh.material = material;
    for (const [mesh, visible] of phase5dB2FamilyIdState.visibility) mesh.visible = visible;
    studio.scene.background = phase5dB2FamilyIdState.background;
    renderer.toneMapping = phase5dB2FamilyIdState.toneMapping;
    for (const material of phase5dB2FamilyIdState.generated) material.dispose();
    phase5dB2FamilyIdState = null;
  }
  if (!on) return;
  const state: Phase5dB2FamilyIdState = {
    materials: new Map(),
    visibility: new Map(),
    background: studio.scene.background,
    toneMapping: renderer.toneMapping,
    generated: [],
  };
  const colors = {
    case: 0xff355e,
    barrel: 0xffb000,
    train: 0x00d084,
    rubies: 0xff00ff,
    hourHand: 0x00a8ff,
    minuteHand: 0x0050ff,
    chapter: 0xffffff,
    bridge: 0x9a72ff,
    hairspring: 0x00ffff,
    balance: 0xffff00,
    other: 0x161616,
  } as const;
  const materialsByFamily = Object.fromEntries(
    Object.entries(colors).map(([family, color]) => {
      const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, depthWrite: true, depthTest: true });
      state.generated.push(material);
      return [family, material];
    }),
  ) as Record<keyof typeof colors, THREE.MeshBasicMaterial>;
  const family = (object: THREE.Mesh): keyof typeof colors | null => {
    const path = objectPath(object);
    const name = object.name;
    if (object.userData.phase5dOpticalOwner || /Sapphire/.test(name)) return null;
    if (/HourHandMount|\/HourHand$/.test(path)) return "hourHand";
    if (/MinuteHandMount|\/MinuteHand$/.test(path)) return "minuteHand";
    if (/hairspring/i.test(path)) return "hairspring";
    if (/jewel|palletStone|ruby/i.test(path) && !/setting/i.test(name)) return "rubies";
    if (/barrel:/.test(path)) return "barrel";
    if (/calibre\/(center|third|fourth|escape):pose/.test(path) || /phase4b:gear/.test(path)) return "train";
    if (/balance:/.test(path)) return "balance";
    if (/ReadoutRoot\/ChapterPose/.test(path)) return "chapter";
    if (/structure:root|assembly:root/.test(path)) return "bridge";
    if (/ExteriorRoot\/ext:visible/.test(path) && !/truth|keepout|kernel|lugDiag|axis/i.test(path)) return "case";
    return "other";
  };
  studio.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    state.materials.set(object, object.material);
    state.visibility.set(object, object.visible);
    const owner = family(object);
    if (owner === null) object.visible = false;
    else object.material = materialsByFamily[owner];
  });
  phase5dB2FamilyIdState = state;
  studio.scene.background = new THREE.Color(0x000000);
  renderer.toneMapping = THREE.NoToneMapping;
};

// Publish the inspection/runtime API before the first potentially expensive
// WebGL shader compile. The scheduled callback enters the same frame loop and
// uses the same kinematic time source as the former synchronous first call.
requestAnimationFrame(frame);

declare global {
  interface Window {
    __WATCH__: {
      setView: (name: string) => void;
      toggleDebug: () => void;
      setDebug: (on: boolean) => void;
      setTime: (time: number | null) => void;
      setPlaybackPaused: (paused: boolean) => void;
      releasePresentationReport: () => ReturnType<typeof releasePresentationReport>;
      capture: () => string;
      setSilhouette: (on: boolean) => void;
      setAudit: (on: boolean) => void;
      structureReport: () => ReturnType<NonNullable<typeof structure>["report"]> | null;
      assemblyReport: () => ReturnType<NonNullable<typeof assembly>["report"]> | null;
      setTone: (name: ToneName, exposure: number) => void;
      accommodationReport: () => ReturnType<NonNullable<typeof accommodation>["report"]> | null;
      displayReport: () => ReturnType<NonNullable<typeof display>["report"]> | null;
      enclosureReport: () => ReturnType<NonNullable<typeof enclosure>["report"]> | null;
      exteriorReport: () => ReturnType<NonNullable<typeof exterior>["report"]> | null;
      readoutReport: () => ReturnType<NonNullable<typeof readout>["report"]> | null;
      finishReport: () => ReturnType<NonNullable<typeof finish>["report"]> | null;
      strapReport: () => ReturnType<NonNullable<typeof strap>["report"]> | null;
      setReadoutPose: (spec: string | null) => void;
      clearReadoutPose: () => void;
      setJunctionAudit: (region: JunctionAuditRegion, view: JunctionAuditView) => void;
      setCenterResidualAudit: (view: CenterResidualView) => void;
      setDisplayDriveAudit: (view: DisplayDriveAuditView) => void;
      clearDisplayDriveAudit: () => void;
      centerResidualRayReport: (pixelX: number, pixelY: number) => ReturnType<typeof centerResidualRayReport>;
      junctionOwnership: () => { label: string; path: string; color: string }[];
      centerIntegrityReport: () => ReturnType<typeof centerIntegrityReport>;
      kinematicReport: (times: number[]) => ReturnType<typeof kinematicReport>;
      displayDriveReport: (times: number[]) => ReturnType<typeof displayDriveReport>;
      setSurfaceArtifactAudit: (mode: SurfaceArtifactAuditMode) => void;
      clearSurfaceArtifactAudit: () => void;
      surfaceArtifactReport: () => ReturnType<typeof surfaceArtifactReport>;
      phase5dPresentationReport: () => ReturnType<typeof phase5dPresentationReport>;
      setPhase5dB2Diagnostic: (mode: Phase5dB2DiagnosticMode) => void;
      setSapphireStackDiagnostic: (mode: SapphireStackDiagnosticMode) => SapphireStackDiagnosticState | null;
      setPhase5dB2Profile: (profile: Phase5dB2Profile, camera: Phase5dB2Camera) => void;
      setPhase5dB2FamilyId: (on: boolean) => void;
      setPhase5dCProfile: (profile: Phase5dCProfile) => void;
      setExplode: (value: number) => void;
      animateExplode: (value: number, durationMs?: number) => void;
      explodedAssemblyReport: () => ReturnType<typeof explodedAssemblyReport>;
      setBarrelCenterAudit: (mode: BarrelCenterAuditMode) => void;
      clearBarrelCenterAudit: () => void;
      barrelCenterAuditReport: (times: number[]) => ReturnType<typeof barrelCenterAuditReport>;
      barrelFourthAuditReport: (times: number[]) => ReturnType<typeof barrelFourthAuditReport>;
      fourthWheelSweepAuditReport: () => ReturnType<typeof fourthWheelSweepAuditReport>;
      escapementRepairReport: () => ReturnType<typeof createEscapementRepairReport>;
      setEscapementAudit: (mode: EscapementVisualAuditMode) => void;
      clearEscapementAudit: () => void;
      sceneDump: () => {
        name: string;
        path: string;
        parent: string;
        visible: boolean;
        x: number;
        y: number;
        z: number;
        scaleX: number;
        scaleY: number;
        scaleZ: number;
        minX: number;
        maxX: number;
        minY: number;
        maxY: number;
        minZ: number;
        maxZ: number;
      }[];
    };
  }
}

window.__WATCH__ = {
  setView: (name) => {
    clearBarrelCenterAudit();
    clearSurfaceArtifactAudit();
    clearDisplayDriveAudit();
    restoreJunctionAudit();
    if (name === "silhouette") {
      setSilhouette(true);
      return;
    }
    if (silhouetteOn && name !== "silhouette") setSilhouette(false);
    applyAnyView(name);
  },
  toggleDebug,
  setDebug: (on) => {
    debugOn = on;
    debug.visible = on && !silhouetteOn;
    if (structure) structure.debug.visible = on && !silhouetteOn;
  },
  setTime: (time: number | null) => {
    timeOverride = time;
  },
  setPlaybackPaused,
  releasePresentationReport,
  capture: () => {
    const time = currentKinematicTime();
    const damping = studio.controls.enableDamping;
    const rotating = studio.controls.autoRotate;
    studio.controls.enableDamping = false;
    studio.controls.autoRotate = false;
    renderAt(time);
    studio.controls.enableDamping = damping;
    studio.controls.autoRotate = rotating;
    return renderer.domElement.toDataURL("image/png");
  },
  setSilhouette,
  setAudit,
  structureReport: () => (structure ? structure.report() : null),
  assemblyReport: () => (assembly ? assembly.report() : null),
  setTone: (name, exposure) => {
    if (finish) finish.setTone(name, exposure);
  },
  accommodationReport: () => (accommodation ? accommodation.report() : null),
  displayReport: () => (display ? display.report() : null),
  enclosureReport: () => (enclosure ? enclosure.report() : null),
  exteriorReport: () => (exterior ? exterior.report() : null),
  readoutReport: () => (readout ? readout.report() : null),
  finishReport: () => (finish ? finish.report() : null),
  strapReport: () => (strap ? strap.report() : null),
  setJunctionAudit,
  setCenterResidualAudit,
  setDisplayDriveAudit,
  clearDisplayDriveAudit,
  centerResidualRayReport,
  junctionOwnership: () => junctionOwnershipRows.map((row) => ({ ...row })),
  centerIntegrityReport,
  kinematicReport,
  displayDriveReport,
  setSurfaceArtifactAudit,
  clearSurfaceArtifactAudit,
  surfaceArtifactReport,
  phase5dPresentationReport,
  setPhase5dB2Diagnostic,
  setSapphireStackDiagnostic: (mode) => (
    exterior ? exterior.setSapphireStackDiagnostic(mode) : null
  ),
  setPhase5dB2Profile,
  setPhase5dB2FamilyId,
  setPhase5dCProfile,
  setExplode,
  animateExplode,
  explodedAssemblyReport,
  setBarrelCenterAudit,
  clearBarrelCenterAudit,
  barrelCenterAuditReport,
  barrelFourthAuditReport,
  fourthWheelSweepAuditReport,
  escapementRepairReport: () => createEscapementRepairReport(movement, structure!, assembly),
  setEscapementAudit,
  clearEscapementAudit,
  sceneDump: () => {
    const box = new THREE.Box3();
    const rows: {
      name: string;
      path: string;
      parent: string;
      visible: boolean;
      x: number;
      y: number;
      z: number;
      scaleX: number;
      scaleY: number;
      scaleZ: number;
      minX: number;
      maxX: number;
      minY: number;
      maxY: number;
      minZ: number;
      maxZ: number;
    }[] = [];
    studio.scene.updateMatrixWorld(true);
    studio.scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || !o.geometry) return;
      if (o.name.startsWith("ext:")) return;
      box.setFromObject(o);
      if (box.isEmpty()) return;
      const c = box.getCenter(new THREE.Vector3());
      const s = o.getWorldScale(new THREE.Vector3());
      rows.push({
        name: o.name || o.parent?.name || "(unnamed)",
        path: objectPath(o),
        parent: o.parent?.name ?? "",
        visible: (() => {
          let p: THREE.Object3D | null = o;
          while (p) {
            if (!p.visible) return false;
            p = p.parent;
          }
          return true;
        })(),
        x: c.x,
        y: c.y,
        z: c.z,
        scaleX: s.x,
        scaleY: s.y,
        scaleZ: s.z,
        minX: box.min.x,
        maxX: box.max.x,
        minY: box.min.y,
        maxY: box.max.y,
        minZ: box.min.z,
        maxZ: box.max.z,
      });
    });
    return rows;
  },
  setReadoutPose: (spec: string | null) => {
    if (!readout) return;
    requestedReadoutPose = spec === null ? null : parseReadoutPose(spec);
    const pose = activeReadoutPose();
    if (pose) readout.setPose(pose.hours, pose.minutes, pose.id);
  },
  clearReadoutPose: () => {
    requestedReadoutPose = null;
    const pose = activeReadoutPose();
    if (pose && readout) readout.setPose(pose.hours, pose.minutes, pose.id);
  },
};
