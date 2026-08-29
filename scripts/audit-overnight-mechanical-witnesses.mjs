import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outPath = path.resolve(
  process.argv[2] || "captures/post5d-overnight-audit/regression/mechanical-witness-clearance.json",
);
const baseUrl = process.argv[3] || "http://127.0.0.1:5173";
fs.mkdirSync(path.dirname(outPath), { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.setDefaultTimeout(300000);
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));
await page.goto(`${baseUrl}/?static=1&view=presentHero&t=0.104&readoutPose=1010&explode=0`, {
  waitUntil: "commit",
  timeout: 60000,
});
await page.waitForFunction(() => typeof globalThis.__WATCH__?.escapementRepairReport === "function");

const cdp = await page.context().newCDPSession(page);
await cdp.send("Runtime.evaluate", {
  expression: "import('/node_modules/.vite/deps/three.js').then(m => globalThis.__THREE_OVERNIGHT__ = m)",
  awaitPromise: true,
});
const prototype = await cdp.send("Runtime.evaluate", {
  expression: "__THREE_OVERNIGHT__.Scene.prototype",
});
const instances = await cdp.send("Runtime.queryObjects", { prototypeObjectId: prototype.result.objectId });
await cdp.send("Runtime.callFunctionOn", {
  objectId: instances.objects.objectId,
  functionDeclaration: "function(){ globalThis.__OVERNIGHT_SCENE__ = this.find(x => x.getObjectByName && x.getObjectByName('calibre')); }",
});

const audit = await page.evaluate(() => {
  const THREE = globalThis.__THREE_OVERNIGHT__;
  const scene = globalThis.__OVERNIGHT_SCENE__;
  scene.updateMatrixWorld(true);
  const objectPath = (object) => {
    const rows = [];
    for (let current = object; current; current = current.parent) {
      let label = current.name || current.type;
      if (!current.name && current.parent) label += `[${current.parent.children.indexOf(current)}]`;
      rows.push(label);
    }
    return rows.reverse().join("/");
  };
  const requireObject = (name) => {
    const object = scene.getObjectByName(name);
    if (!object) throw new Error(`mechanical witness participant missing: ${name}`);
    return object;
  };
  const meshesBelow = (root, reject = () => false) => {
    const rows = [];
    root.traverse((object) => {
      if (object.isMesh && object.geometry && !reject(object)) rows.push(object);
    });
    return rows;
  };
  const box = (object) => new THREE.Box3().setFromObject(object, true);
  const bounds = (value) => ({ min: value.min.toArray(), max: value.max.toArray() });
  const axialFloor = (a, b) => a.max.z < b.min.z
    ? b.min.z - a.max.z
    : b.max.z < a.min.z
      ? a.min.z - b.max.z
      : 0;
  const pointSegmentDistance = (p, a, b) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const denominator = dx * dx + dy * dy;
    const t = denominator > 1e-18
      ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / denominator))
      : 0;
    return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
  };
  const pointTriangleDistance = (p, a, b, c) => {
    const cross = (u, v, w) => (v.x - u.x) * (w.y - u.y) - (v.y - u.y) * (w.x - u.x);
    const signs = [cross(a, b, p), cross(b, c, p), cross(c, a, p)];
    const inside = !(signs.some((value) => value < -1e-12) && signs.some((value) => value > 1e-12));
    return inside ? 0 : Math.min(
      pointSegmentDistance(p, a, b),
      pointSegmentDistance(p, b, c),
      pointSegmentDistance(p, c, a),
    );
  };
  const stationaryProjectionFloor = (stationary, point) => {
    const position = stationary.geometry.getAttribute("position");
    const index = stationary.geometry.getIndex();
    const count = index ? index.count : position.count;
    const read = (slot) => {
      const vertex = index ? index.getX(slot) : slot;
      return new THREE.Vector3().fromBufferAttribute(position, vertex).applyMatrix4(stationary.matrixWorld);
    };
    let minimum = Infinity;
    for (let slot = 0; slot < count; slot += 3) {
      minimum = Math.min(minimum, pointTriangleDistance(point, read(slot), read(slot + 1), read(slot + 2)));
    }
    return minimum;
  };
  const maximumRadius = (moving, axis) => {
    const position = moving.geometry.getAttribute("position");
    let maximum = 0;
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      const point = new THREE.Vector3().fromBufferAttribute(position, vertex).applyMatrix4(moving.matrixWorld);
      maximum = Math.max(maximum, Math.hypot(point.x - axis.x, point.y - axis.y));
    }
    return maximum;
  };
  const conservativeRows = (stationary, movingRoot, motionOwner, reject = () => false) => {
    const stationaryBox = box(stationary);
    const axis3 = motionOwner.getWorldPosition(new THREE.Vector3());
    const axis = { x: axis3.x, y: axis3.y };
    const stationaryRadial = stationaryProjectionFloor(stationary, axis);
    return meshesBelow(movingRoot, reject).map((moving) => {
      const movingBox = box(moving);
      const axial = axialFloor(stationaryBox, movingBox);
      const radius = maximumRadius(moving, axis);
      const radial = stationaryRadial - radius;
      const floor = Math.hypot(Math.max(0, radial), axial);
      return {
        moving: objectPath(moving),
        stationary: objectPath(stationary),
        stationaryBoundsMm: bounds(stationaryBox),
        movingBoundsMm: bounds(movingBox),
        motionAxisMm: [axis.x, axis.y],
        maximumRenderedRadiusMm: radius,
        stationaryProjectionDistanceFromAxisMm: stationaryRadial,
        radialFloorMm: radial,
        axialFloorMm: axial,
        conservativeClearanceFloorMm: floor,
        method: "rendered BufferGeometry maximum radius and stationary triangle projection plus invariant rendered Z bounds; valid through complete Z-axis rotation",
        noIntersection: floor > 0,
        clearsGeneralForeignGate: floor >= 0.1,
      };
    });
  };

  const stemBar = requireObject("struct:escapeFinger:stemBar");
  const centerNetwork = requireObject("struct:plate:spoke:center-network");
  const escapeMotion = requireObject("escape:motion");
  const palletMotion = requireObject("pallet:motion");
  const balanceMotion = requireObject("balance:motion");
  const escapeGeom = requireObject("escape:geom");
  const palletGeom = requireObject("pallet:geom");
  const balanceGeom = requireObject("balance:geom");
  const mechanical = globalThis.__WATCH__.escapementRepairReport();
  const certifiedPalletRow = mechanical.generalForeignSolids.find(
    (row) => row.a === "escape finger" && row.b === "raised fork",
  );

  const escapeRows = conservativeRows(
    stemBar,
    escapeGeom,
    escapeMotion,
    (mesh) => objectPath(mesh).includes("escape:arbor"),
  );
  const balanceRows = conservativeRows(stemBar, balanceGeom, balanceMotion);
  const palletRows = conservativeRows(
    stemBar,
    palletGeom,
    palletMotion,
    (mesh) => objectPath(mesh).includes("pallet:arbor"),
  );

  const trainSpecs = [
    ["barrel:geom", "barrel:motion"],
    ["center:geom", "center:motion"],
    ["third:geom", "third:motion"],
    ["fourth:geom", "fourth:motion"],
    ["escape:geom", "escape:motion"],
  ];
  const centerNetworkRows = trainSpecs.flatMap(([geometryName, motionName]) =>
    conservativeRows(
      centerNetwork,
      requireObject(geometryName),
      requireObject(motionName),
      (mesh) => objectPath(mesh).includes(":arbor"),
    ).map((row) => ({ ...row, trainOwner: geometryName })),
  );
  return {
    stemBar: {
      object: objectPath(stemBar),
      junctionTenon: stemBar.userData.junctionTenon,
      escape: escapeRows,
      balanceAndRoller: balanceRows,
      pallet: {
        certifiedCurrentMatrixRow: certifiedPalletRow,
        renderedConservativeRows: palletRows,
        coveredByCertifiedOwnerSweep:
          certifiedPalletRow?.accepted === true &&
          certifiedPalletRow?.minimumClearance >= certifiedPalletRow?.gate &&
          certifiedPalletRow?.samples === 1025,
      },
    },
    centerNetwork: {
      object: objectPath(centerNetwork),
      unifiedOwners: centerNetwork.userData.unifiedOwners,
      train: centerNetworkRows,
    },
  };
});

const allRows = [
  ...audit.stemBar.escape,
  ...audit.stemBar.balanceAndRoller,
  ...audit.stemBar.pallet.renderedConservativeRows,
  ...audit.centerNetwork.train,
];
const checks = {
  browserPageErrorsClean: pageErrors.length === 0,
  stemEscapeNoIntersection: audit.stemBar.escape.every((row) => row.noIntersection),
  stemBalanceAndRollerNoIntersection: audit.stemBar.balanceAndRoller.every((row) => row.noIntersection),
  stemPalletCertifiedSweepPass: audit.stemBar.pallet.coveredByCertifiedOwnerSweep,
  stemPalletRenderedRowsNoIntersection: audit.stemBar.pallet.renderedConservativeRows.every((row) => row.noIntersection),
  centerNetworkTrainNoIntersection: audit.centerNetwork.train.every((row) => row.noIntersection),
  everyRenderedRowAtLeastGeneralGate: allRows.every((row) => row.clearsGeneralForeignGate),
};
const report = {
  schema: "post5d-overnight-mechanical-witness-clearance-v1",
  disposition: Object.values(checks).every(Boolean)
    ? "PASS — NEW STATIONARY WITNESS REPAIRS CLEAR NEARBY MOVING SOLIDS"
    : "FAIL — NEW STATIONARY WITNESS REPAIR REQUIRES EXACT FOLLOW-UP",
  accepted: Object.values(checks).every(Boolean),
  scope: {
    stemBar: "new unified escape-finger stem/bar tenon against moving escape, pallet, balance, and roller geometry",
    centerNetwork: "new unified lower center spoke network against barrel/center/third/fourth/escape train geometry",
    exclusions: "coaxial arbors/tips intentionally passing through their named bearing bosses are not foreign-solid pairs",
  },
  audit,
  minima: {
    stemEscapeMm: Math.min(...audit.stemBar.escape.map((row) => row.conservativeClearanceFloorMm)),
    stemBalanceAndRollerMm: Math.min(...audit.stemBar.balanceAndRoller.map((row) => row.conservativeClearanceFloorMm)),
    stemPalletCertifiedMm: audit.stemBar.pallet.certifiedCurrentMatrixRow?.minimumClearance ?? null,
    stemPalletRenderedMm: Math.min(...audit.stemBar.pallet.renderedConservativeRows.map((row) => row.conservativeClearanceFloorMm)),
    centerNetworkTrainMm: Math.min(...audit.centerNetwork.train.map((row) => row.conservativeClearanceFloorMm)),
  },
  checks,
  pageErrors,
};
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify({ disposition: report.disposition, accepted: report.accepted, minima: report.minima, checks }, null, 2));
