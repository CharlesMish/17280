# Graphite finishing acceptance

The default `?refinement=graphite-finish` builds on `graphite-materials`.
The preferred base remains available unchanged at `?refinement=graphite-materials`.

Only three existing polished exterior material slots change: case/bezel polish,
lug terminals, and crown shoulders. Roughness is 0.085 (was 0.12), clearcoat 0.10
(was 0), and clearcoat roughness 0.055. Satin face values and roughness stay fixed.
Existing normals, bevels, geometry and material assignments are retained.

Both sapphire slots use IOR 1.77, shader thickness 0.04 scene units, and specular
intensity 0.40. Transmission, opacity, surface ownership and depth handling stay
fixed. The small shader thickness is an optical approximation, not a change to
the physical mesh thickness. A crystal-only environment retains the base cards
and adds one 3 × 32 reflection strip at (-18, 0, 12), facing the origin.

The dark upper-left separated component in Exploded is named
`ext:frontSapphireOpticalBody`, not the caseback. Its grazing reflection provides
local separation; the actual caseback and its satin material are untouched.

Hero alone gives the three polished exterior slots an extra 3 × 26 reflection
strip at (-10, 9, 17), with linear white intensity 2. This reflection environment
is local to those facets and restores when switching views. The scene environment,
direct light profiles, exposure, cameras, background, movement and colors retain
the preferred base treatment. No additional neutral-steel experiment is included.

Reproduce with the existing local server and capture harness:

```sh
npm run build
npm run dev -- --port 5198
node scripts/capture-refinement.mjs http://127.0.0.1:5198 /tmp/watch-finishing hero,sapphire,exploded graphite-materials,graphite-finish
node scripts/verify-refinement-cameras.mjs http://127.0.0.1:5198 /tmp/watch-finishing
node scripts/test-refinement.mjs http://127.0.0.1:5198 /tmp/watch-finishing-tests graphite-finish
```

Run browser jobs sequentially. Existing output directories are not overwritten.
Acceptance renders and the small/dim Hero comparison are in
`captures/graphite-finishing-2026-09-05/index.html`.

## Visual inspection

Hero at 200 px retains the gold barrel / blue hands / brighter movement-edge
hierarchy. The cool case separates from near-black rubber through its rim, rather
than a brighter satin face. At simulated 50% display luminance, the major hierarchy
remains readable; fine movement details and the darkest strap/recesses compress.
A harsher 50% sRGB-value stress image is also supplied: hands and barrel remain
identifiable, but the top case/strap boundary is marginal. This is not a calibrated
physical-display brightness test.

Sapphire has a restrained grazing reflection and shallow optical offset, with no
obvious doubled movement contours at the acceptance size. Exploded's upper-left
crystal is more distinct from the background. The existing crown/lug faceting
remains visible up close; no bevel or normal changes were required for this pass.

TypeScript and production build pass (the existing bundle-size warning remains).
All six matched renders pass authored-camera alignment. Capture reports contain
no unexpected browser errors. The scope comparison confirms unchanged colors,
cameras and light profiles, and only the five intended material slots differ.

All 37 existing refinement checks pass against the production preview, including
exact material restoration, mesh/normal/topology/transform invariance, drive
kinematics, all layer selections, keyboard/orbit/reset behavior, and desktop/phone
views. No unexpected browser errors were reported.
