# 17280 — graphite refinement

Current finishing pass: the public default is now `graphite-finish`, based on
`graphite-materials`. See [finishing acceptance notes](GRAPHITE_FINISHING.md).
The environment/optics decisions below describe the earlier `graphite` experiment,
which remains available for comparison.

This is a targeted follow-up to the earlier readability pass, not a replacement
of the watch or its engineering model. The previous final remains available at
`?refinement=final`. The new public default is `?refinement=graphite`.

## Material changes

The case now represents satin graphite-coated metal, with restrained polished
graphite edges. Movement metals are neutral and lighter; rubber is near-black.
The large warm mass is the barrel, not the steel train wheels. Its gold face,
edge, and side receive separate finishes. Hand-face values, chapter hierarchy,
holder-pad suppression, screws, pivots, and ruby materials are preserved.

Overrides live in `src/refinement.ts`; existing authored materials remain intact.
Rotated bridge/cock clones are classified from their original material values,
so they retain the correct family and brushing direction after repeated changes.

Roughness below is scalar × mean green-channel texture input, not a claim about
the complete shader BRDF. The original finishing maps are retained.

| Part | Previous final | Graphite | Reason |
| --- | --- | --- | --- |
| Bezel satin | `#9aa2aa`, roughness 0.32 | `#74787a`, 0.30 | Darker controlled case, still visibly satin |
| Midcase / caseback / lug faces / crown body | Separate blue-gray colors, 0.32 | `#74787a`, 0.30 | One coherent coated exterior |
| Waist / bores / socket / flutes | Authored recess colors | `#292b2d` | Dark local recesses rather than global dimming |
| Case polish / lug ends / crown shoulder | `#b8c2cc` or authored steel, roughness 0.20, clearcoat 0.12 | `#929596`, 0.12, clearcoat 0 | Tighter coated-metal highlights, below bare-steel reflectance |
| Crown cap | `#a8b0b8`, 0.20 | `#686b6c`, 0.26 | Distinguish cap from shoulder and body |
| Bridge faces | `#858e9a`, 0.31 | `#929593`, 0.32 | Neutral structural steel |
| Cock faces | `#858e9a`, 0.31 | `#a5a49f`, 0.29 | A slightly warmer, lighter structural layer |
| Mainplate | `#626c78`, 0.38 | `#5d605f`, 0.38 | Neutral lower-value foundation |
| Bridge edges | roughness 0.19, clearcoat 0.20 | `#c5c6c3`, 0.12, clearcoat 0 | Crisp bare-metal accents |
| Barrel face | `#c49642`, approximately 0.176 | `#c18a38`, 0.24 | Warmer gold and broader metallic reflection |
| Barrel edge / side | Authored gold | `#e2b967` / `#9c702e`; edge roughness 0.10 | Local gold finish contrast |
| Rubber face / edge | `#292d33` / `#333941` | `#1c1d1e` / `#292a2b` | Near-black matte rubber, no blue cast |

Rubber roughness remains 0.55, with no clearcoat. Blue hand faces remain
`#438bd7`, metalness 0.48, roughness 0.30. No geometry was added to fake detail.

## Lighting, environment and optical changes

Camera definitions, framing, public responsive layout, exposure, tone mapping,
and preset light intensities are unchanged. The PMREM environment retains five
broad fill cards at their existing sizes and positions, neutralizes their colors,
and adds a narrow reflection strip plus one localized dark card. No visible
scene object or extra direct light is introduced.

Environment background: `#535963` → `#595959`. Broad card colors, in existing
order: `#e6e6e3`, `#c8c9c8`, `#dcdcd9`, `#9b9c9c`, `#9e9e9c`.
New cards face the origin: 3 × 24 at (-10, 9, 17), `#f5f2ea`; 7 × 20 at
(12, -3, 15), `#202122`. PMREM blur remains 0.04. The two environments are cached
so switching stages does not allocate another environment each time.

Both sapphire material slots now use IOR **1.77**, specular intensity **0.40**,
opacity **1**, and shader thickness **0**. Existing transmission 0.97/0.98,
roughness 0.025/0.018, optical meshes, depth handling and surface ownership remain.

A 40-image factorial comparison covers Hero, Sapphire, Exploded, Front and Rear:
IOR 1.46/1.77 × shader thickness 0/0.35 × specular intensity 0.20/0.40.
The nonzero-thickness candidates introduce doubled movement contours in the
oblique view; they are rejected. IOR 1.77 and specular 0.40 provide a more readable
grazing surface/edge without those offsets. This remains an approximate real-time
optical treatment, not a complete simulation of a thick sapphire crystal.

## Geometry and trade-offs

No geometry, normals, bevels, camera poses, kinematics, or exploded membership
changed. Existing crown shoulders, cap, 18 flute details, and case bevels are
revealed through finish differences. Crown/lug faceting is not repaired in this
pass; a geometry change would require its own mechanical and silhouette review.

The capture-only helper now drains residual orbit motion before setting an
authored pose. Camera verification checks all comparison/calibration frames and
recaptures any first-frame drift; it does not modify camera definitions.

The graphite case intentionally carries less face brightness than bare steel;
polished accents vary more during an orbit. Rubber is less prominent in dark
angles. Crystal presence remains restrained head-on, and shader thickness stays
off to protect movement readability. The gold still depends on studio reflection
angle: its Hero appearance is quieter than its Exploded/Rear appearance.
Close or overlapping hand positions remain mechanically truthful; this pass
does not move hands apart for presentation.

## Reproduction and inspection

Modes: `baseline`, `materials`, `final` (unchanged historical stages),
`graphite-materials` (new material treatment under the previous environment and
optics), and `graphite` (accepted environment and optics).

`window.__WATCH__.setRefinement(stage, optics?)` supports optional validated
`ior` (1, 1.46, 1.77), `thickness` (0, 0.35), and `specularIntensity` (0.2, 0.4).
These diagnostic overrides persist until replaced or the page reloads; old
one-argument calls remain valid. Query equivalents are `sapphireIor`,
`sapphireThickness`, and `sapphireSpecular`. Without overrides, old stages retain
their previous optics and graphite uses the new accepted optics. Thickness and
specular overrides apply only to graphite. Reports include named material
families, optical values, environment intensity and clearcoat.

Build and start the existing preview on port 5198, then run browser jobs
sequentially. Output directories must not already exist.

```sh
npm run build
npm run preview -- --port 5198
node scripts/capture-refinement.mjs http://127.0.0.1:5198 /tmp/watch-graphite-accepted hero,sapphire,exploded,front,rear,wearable final,graphite-materials,graphite
node scripts/capture-graphite-optics.mjs http://127.0.0.1:5198 /tmp/watch-graphite-optics
node scripts/test-refinement.mjs http://127.0.0.1:5198 /tmp/watch-graphite-tests graphite
node scripts/test-refinement-touch.mjs http://127.0.0.1:5198 /tmp/watch-graphite-touch
node scripts/capture-refinement-phone.mjs http://127.0.0.1:5198 /tmp/watch-graphite-public
node scripts/capture-refinement-orbit.mjs http://127.0.0.1:5198 /tmp/watch-graphite-orbit final graphite
node scripts/verify-refinement-cameras.mjs http://127.0.0.1:5198 /tmp/watch-graphite-accepted /tmp/watch-graphite-optics
node scripts/package-graphite.mjs
```

The packager requires all interaction/touch checks and expected captures before
creating a gallery with source, build and artifact hashes. Software Chromium
rendering is visual/functional evidence, not a physical-phone or hardware-GPU
certification. No deployment or historical audit regeneration is included.

## Validation results

- TypeScript and production build pass. The existing large-bundle warning remains.
- All 37 interaction/invariance checks pass, including exact material-value
  restoration, unchanged mesh data/transforms, driven-hand kinematics, all eight
  layer selections, keyboard activation, orbit persistence and reset paths.
- All eight layer selections and clears pass touch testing at 390 × 844, DPR 2.
- Interaction and touch runs report no unexpected browser errors.
- Public visual checks include ten desktop/phone overview images and 28 hand-pose
  captures (Hero and Front at 10:10, 3:00, 6:30, 8:40, 9:45, 1:05 and 12:00).
  Phone explosion framing remains intact. The capture run has no unexpected
  browser errors.
- The 24-position matched final/graphite orbit completes without unexpected
  browser errors and is encoded as a 12-second video. It is a sampled appearance
  comparison, not a real-time performance claim.
- All 18 material comparisons and 40 optical calibration frames pass authored
  camera alignment checks; two early first-frame captures were realigned.
