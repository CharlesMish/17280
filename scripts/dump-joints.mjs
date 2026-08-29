import { chromium } from "playwright";
import fs from "node:fs";

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.setDefaultTimeout(180000);
await page.goto("http://127.0.0.1:5173/?static=1&view=finishHero&t=0.104&readoutPose=1010", {
  waitUntil: "commit",
  timeout: 60000,
});
await page.waitForFunction(() => window.__WATCH__ !== undefined, { timeout: 180000 });
await page.waitForTimeout(900);
const payload = await page.evaluate(() => {
  const struct = window.__WATCH__.structureReport();
  const asm = window.__WATCH__.assemblyReport();
  const dump = window.__WATCH__.sceneDump();
  const pivots = [];
  for (const el of struct?.elements ?? []) {
    for (const b of el.bearings ?? []) pivots.push({ ...b, element: el.id, seat: "upper" });
  }
  for (const c of struct?.lowerColumns ?? []) {
    pivots.push({ id: `lower:${c.pivot}`, pivot: c.pivot, xy: null, element: "mainplate", seat: "lower", extra: c });
  }
  const anchors = [];
  for (const el of struct?.elements ?? []) {
    for (const a of el.anchors ?? []) anchors.push(a);
  }
  return { struct, asm, dump, pivots, anchors };
});
fs.writeFileSync("captures/joint-audit/raw.json", JSON.stringify(payload, null, 2));
const asmB = payload.asm?.seatAudit ?? [];
const bearings = payload.asm ? payload.asm : {};
console.log("assembly bearings", payload.asm?.bearingCount, "fasteners", payload.asm?.fastenerCount);
console.log("seatAudit");
for (const s of payload.asm?.seatAudit ?? []) {
  console.log(
    `  ${s.id} ${s.kind} locus=${s.locusZ?.toFixed?.(3)} jewelMid=${s.jewelMidZ?.toFixed?.(3)} seatFace=${s.seatFaceZ?.toFixed?.(3)} rel=${s.relation}`,
  );
}
console.log("containment");
for (const c of payload.asm?.containment ?? []) {
  console.log(`  ${c.id} boss=${c.bossOrFoot.toFixed(3)} outer=${c.outer.toFixed(3)} margin=${c.margin.toFixed(3)}`);
}
console.log("lowerColumns");
for (const c of payload.struct?.lowerColumns ?? []) {
  console.log(`  ${c.pivot} present=${c.present} seatZ=${c.seatZ.toFixed(3)} rise=${c.rise.toFixed(3)}`);
}

const nodes = [
  ...(payload.asm?.containment ?? []).map((c) => c.id),
];
const dump = payload.dump;
function near(x, y, r = 1.1) {
  return dump.filter((m) => Math.hypot(m.x - x, m.y - y) < r && m.maxZ > -2.2 && m.minZ < 7);
}

const loci = {};
for (const el of payload.struct?.elements ?? []) {
  for (const b of el.bearings ?? []) {
    loci[`${b.pivot}:upper`] = b.xy;
  }
  for (const a of el.anchors ?? []) {
    loci[a.id] = a.xy;
  }
}
// center is 0,0 typically
const known = Object.entries(loci);
console.log("\nNODE MESHES");
for (const [id, xy] of known) {
  if (!xy) continue;
  const hits = near(xy.x, xy.y, 0.95)
    .filter((m) => !m.name.startsWith("readout:hand") && !m.name.startsWith("readout:marker") && !m.name.includes("Sapphire") && !m.name.startsWith("enc:"))
    .sort((a, b) => b.maxZ - a.maxZ);
  console.log(`\n== ${id} @ (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)})  n=${hits.length}`);
  for (const m of hits.slice(0, 18)) {
    console.log(
      `  ${m.visible ? "V" : "h"} ${m.parent.padEnd(28)} ${(m.name || "").padEnd(36)} z=${m.minZ.toFixed(3)}..${m.maxZ.toFixed(3)}  xy=(${m.x.toFixed(2)},${m.y.toFixed(2)})`,
    );
  }
}

await browser.close();
