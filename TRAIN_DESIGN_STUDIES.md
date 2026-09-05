# Two bounded train-design studies

The graphite/sapphire checkpoint is `e58144b` on `checkpoint/graphite-sapphire`, submitted as [draft PR #2](https://github.com/CharlesMish/17280/pull/2). These studies live separately on `explore/train-design`. Neither is enabled by default or combined with the other.

The frozen watch retains its case, graphite finish, gold/blue hierarchy, sapphire settings, lighting and authored cameras. Train axes, tooth counts, tooth profiles, backlash, phases, ratios, depth intervals, display-drive ownership and escapement timing remain protected. There are no case or bevel changes in these studies.

## Center-wheel web

`?experiment=center-web` replaces only `center:wheel.geometry`. The five spokes keep their existing sweep but gain fuller hub/rim attachments and a restrained taper. Only interior windows change; the working tooth contour, bore and exact bounds remain identical. The measured minimum spoke width is 0.35918 mm against the 0.34 mm constraint. This is a shape measurement, not a structural-strength claim.

This is the more useful visual option: the wheel reads as a deliberately shaped part in close-up without changing the train arrangement. Hero remains very close to the frozen presentation. It remains a preview for review, with its own portable package and fresh evidence rather than the original RC1 designation.

The preview uses 24,532 triangles for this wheel versus 7,852 in the baseline. This is a real geometry cost of the rounded window contours; no further tessellation tuning was included in the bounded study.

## Stationary train bridge

`?experiment=train-bridge` replaces only `struct:trainBridge:body.geometry`. It adds at most 0.09 mm to each side of the connecting ribbon, preserving the existing center-root correction, bore, stub union and protected bearing lands. It does not move a support, replace fasteners, or change the rotating core.

The visual benefit is smaller and mostly visible in close-up. **This study is held, without clearance acceptance; retain the baseline bridge.** The study preserves the original bridge's texture projection and phase so the comparison does not introduce a second finishing change.

The exact check found zero distance between the bridge body and the third/fourth upper shaft tips at the initial pose, in both baseline and candidate. This does not identify a new penetration caused by the taper, but it prevents a clean bridge-clearance result. No journal, bearing land or bore correction was attempted. A separate engineering pass could establish the intended journal/bore ownership and resolve those two contacts while preserving the train axes. The zero-distance result alone does not determine the needed correction dimensions.

## Review and reproduction

Open [the comparison gallery](review/experiments/train-design/index.html). It includes Hero, Front, Rear, Exploded and one clearly labeled diagnostic close-up. Authored views use the existing camera coordinates. The diagnostic close-up is identical across options and is not a camera edit in the application.

All comparisons use `refinement=graphite-finish`, static time 0.104 and the 10:10 readout pose at 960 × 760. Hero thumbnails are displayed at 200 px wide. The dim versions simulate 50% linear display luminance; this is not a measurement of a physical display. At that scale and simulated brightness, the gold wheel remains gold, the hands remain blue, and the graphite case outline remains separable. Fine interior spokes become subtle, as expected at this size. No Hero lighting adjustment was needed.

Run the app using `npm run dev -- --port 5210`. Open a fresh page with `experiment=none`, `train-bridge` or `center-web`. Omit the parameter for the frozen baseline.

```sh
node scripts/capture-train-design.mjs http://127.0.0.1:5210 /tmp/new-train-visuals
EXPERIMENT=center-web GEAR_SWEEPS=1 node scripts/audit-train-experiments.mjs /tmp/new-center-evidence http://127.0.0.1:5210
EXPERIMENT=train-bridge node scripts/audit-train-experiments.mjs /tmp/new-bridge-evidence http://127.0.0.1:5210
node scripts/verify-train-switching.mjs http://127.0.0.1:5210 /tmp/new-switching.json
node scripts/package-train-experiment.mjs --evidence /tmp/new-center-evidence/package-evidence.json --output /tmp/new-preview-package
```

Fresh evidence inspects actual rendered meshes, not historical engineering proxy solids. The four tooth-pair sweeps are separate from changed-web/bridge clearance checks. In-page `__WATCH__.setExperiment()` is diagnostic: exploded geometry authority remains the page-initial variant. Use fresh pages for each candidate's assembled/exploded acceptance; returning to the original variant restores its exact authority.

## Validation results

The production build passes with the existing bundle-size warning. All 12 authored-camera comparisons and three shared diagnostic-camera comparisons pass, with unchanged refinement reports and no unexpected browser errors. The default Hero is pixel-identical to the frozen checkpoint. Each candidate restores its page-initial geometry after Exploded. Switching between studies preserves the display drive and restores every assembled-geometry authority field; camera interpolation is checked separately by the matched renders.

For the center web, the actual scene contains the same 301 meshes in the same order and exactly one changed geometry. Pivots, train/display kinematics and depth intervals remain unchanged; returning to the baseline restores exact geometry and normal hashes. All 285 foreign-part checks prove positive separation around the changed material, with a minimum lower bound of 0.107499 mm. The changed web also clears the third pinion's full-turn envelope by 0.142899 mm. These bounds concern added/removed web material, not a new certification of every unchanged assembly.

All four fresh tooth-pair checks use 8,193 repeating-cycle samples plus 2,049 local refinement samples and find zero intersections. Their minimum clearances reproduce the frozen train's results:

| Pair | Minimum nominal clearance, mm |
| --- | ---: |
| Barrel 80 / center 12 | 0.002900033 |
| Center 64 / third 10 | 0.002899969 |
| Third 60 / fourth 8 | 0.001750789 |
| Fourth 56 / escape 7 | 0.002900456 |

These small tooth gaps are nominal geometric results, not manufacturing tolerances. [Fresh center-web evidence](review/experiments/train-design/evidence/center-web/package-evidence.json), [visual checks](review/experiments/train-design/evidence/visual-acceptance.json), and [switching checks](review/experiments/train-design/evidence/switching.json) retain the details.

The [bridge report](review/experiments/train-design/evidence/train-bridge/foreign-solids-and-invariants.json) remains unaccepted because of the two inherited shaft-tip contacts described above. Its four pallet-part checks cover the actual 0–11° motion delta with 1,441 samples plus 514 local refinement samples each. Before/after minima agree: riser 0.20285 mm, left horn 0.15736 mm, right horn 0.41266 mm, fork bridge 0.21107 mm. Identity, pivots, train/display kinematics, depth and exact baseline restoration all pass. Explicit stationary attachment unions and superseded case geometry are identified separately in the report.

## Portability

The center-web preview contains standalone procedural source, a GLB with the five existing named pivots, dimensions, fresh reports, checksums and a focused integration patch. Source coordinates remain millimetres and the GLB root scale remains 0.001. Integration instructions explain how to apply only the web option in another watch. The stationary bridge is excluded.

The original `release/watch-going-train-core-v1.zip` and its checksum remain unchanged. The preview does not overwrite V1 or claim RC1 authority. Its checks concern the nominal geometry and unchanged kinematics; they do not establish torque transmission, tolerances, fatigue life or fabrication readiness.

Download the [center-web preview ZIP](review/experiments/train-design/deliverables/watch-going-train-core-center-web-preview.zip) and [SHA-256 checksum](review/experiments/train-design/deliverables/watch-going-train-core-center-web-preview.zip.sha256). The standalone source typecheck, GLB reload, exact audited geometry match, focused patch application against the checkpoint, and archive checksum checks all pass. The original V1 checksum remains `735a855e5adc0748ff617f2b6ac5a2ea5ce3bb3ec259b3b50448f8aef800c346`.
