# Train design review

Open `index.html` directly from disk. The gallery is self-contained and uses no
scripts, network requests, external fonts, or remote assets. Full-size images
open when clicked; the small Hero images display at their native 200 px width.

The three columns are the frozen `graphite-finish` base, the independent
`train-bridge` study, and the independent `center-web` study. Nothing is promoted.
The authored Hero, Front, Rear, and Exploded camera definitions, lighting,
material stage, fixed movement time (`0.104 s`), and `10:10` pose are matched.
Movement detail uses a shared diagnostic camera at `[7, -5, 21]` looking at
`[0, 0, 1.8]`; it does not modify an authored camera preset.

The center-web treatment looks more promising in the movement detail. The final
bridge refinement gives a small benefit close up, but is **held: clearance is not
accepted**, and the frozen baseline bridge is retained. At 200 px the gold mass, blue hands,
and case boundary remain identifiable, while fine movement detail compresses.
These are visual observations; fresh mechanical reports provide the separate
clearance and invariant evidence.

## Portable center-web preview

`deliverables/watch-going-train-core-center-web-preview.zip` contains the
separately named procedural source, GLB, unchanged pivot interface, geometry
specification, focused integration patch, fresh evidence, and internal checksums.
Its adjacent `.sha256` and `verification.json` record package integrity and checks.

The fresh center-web evidence under `evidence/center-web/` passes all four
8,193-state tooth-mesh sweeps with 2,049-state local refinements, 285 changed-solid
clearance-envelope checks, and frozen motion/display/geometry-restoration checks.
Packaging type-checked the standalone source, reloaded the GLB, verified the exact
audited candidate geometry, checked the focused patch against the checkpoint,
verified repeatable ZIP bytes and extracted checksums, and confirmed V1 remained
unchanged. This remains an opt-in design preview; nothing is promoted.

## Files and provenance

- Ten baseline/center-web full renders came from `/tmp/train-design-visuals`.
- Four baseline/center-web small previews came from `/tmp/train-design-review`.
- Five final bridge renders and its two small previews came from
  `/tmp/train-design-bridge-final`.
- `visual-summary.json` records dimensions, source paths, checksums, capture
  settings, and provisional observations. The original 1.3 MB capture report is
  referenced by SHA-256 rather than duplicated here.
- Reduced brightness is a simulated 50% linear luminance inspection. It is not
  a calibrated measurement of a physical display's brightness control.

## Final bridge capture

The [bridge audit](evidence/train-bridge/foreign-solids-and-invariants.json) found
inherited zero-distance conditions between the third/fourth upper arbor tips and
the bridge body in both baseline and candidate at time zero. No new interference
was identified, but full bridge clearance cannot be claimed. The four pallet
parts clear their finite `0–11°` range and other foreign clearances are unchanged.
This bounded study makes no geometry correction or journal changes. The candidate
remains held and the baseline is retained.

The bridge column now shows the final local refinement. Its authored camera and
shared diagnostic-camera alignment were checked to within `1e-9`. Original
geometry authority remained intact and all four zero-explosion captures restored
the exact base assembly state; the Exploded capture intentionally uses explosion
`1`. The capture report recorded no browser errors. Updated files:

```text
images/hero-train-bridge.png
images/front-train-bridge.png
images/rear-train-bridge.png
images/exploded-train-bridge.png
images/close-train-bridge.png
images/hero-train-bridge-200.png
images/hero-train-bridge-200-dim.png
```

`visual-summary.json` records the replacement images' source paths/checksums and
the final bridge report's separate SHA-256. Baseline and center-web images are
unchanged. PNGs are ignored repository-wide, so an intentional Git evidence
commit must add this directory's images explicitly.
