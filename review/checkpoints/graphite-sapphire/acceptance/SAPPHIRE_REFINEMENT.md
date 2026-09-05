# Sapphire candidate on the frozen graphite finish

`graphite-finish` remains the default and comparison authority. The opt-in
`?refinement=graphite-sapphire` changes only the two existing sapphire material
slots. No case, movement, camera, scene environment, exposure or light-profile
changes are part of this pass. The existing Hero-only edge reflection is retained.

## Optical treatment

The candidate changes `specularIntensity` from 0.40 to 1.0 and multiplies the
restored, linear-space `specularColor` by 0.40. In the installed Three.js shader,
F0 is the IOR-derived reflectance multiplied by specular color and intensity;
F90 uses specular intensity for dielectrics. Consequently the normal-incidence
reflectance parameter is preserved while the grazing limit increases from 0.40
to 1.0. This uses the stock material shader; there is no custom outline, overlay,
new shell, clearcoat, or screen-space reflection painted over the movement.

IOR 1.77, shader thickness 0.04, roughness 0.018/0.025, transmission 0.98/0.97,
opacity 1, depth handling, normals and optical mesh ownership remain unchanged.
The single crystal-only strip remains 3 × 32 at (-18, 0, 12), facing the origin,
color #e3e7ec at intensity 1, with PMREM blur 0.04. The material report now includes
linear specular color, clearcoat roughness and reflection-environment metadata.

This is a restrained coated-sapphire appearance approximation. It does not
simulate a multilayer anti-reflective coating, wavelength-dependent optics or a
fully shared studio: the inherited crystal-only environment remains an
art-directed compromise. Shader thickness is not a claim about mesh thickness.
The material semantics are documented by
[Three.js MeshPhysicalMaterial](https://threejs.org/docs/pages/MeshPhysicalMaterial.html).

The new stage ignores historical optical overrides just as `graphite-finish`
does; the historical stages and their override behavior remain unchanged.
Switching back restores the original specular color without cumulative scaling.

## Reproduction

Build once and use a production preview, keeping browser jobs sequential:

```sh
npm run build
npm run preview -- --port 5200
node scripts/capture-refinement.mjs http://127.0.0.1:5200 /tmp/watch-sapphire-acceptance hero,sapphire,exploded,rear graphite-finish,graphite-sapphire
node scripts/verify-refinement-cameras.mjs http://127.0.0.1:5200 /tmp/watch-sapphire-acceptance
node scripts/capture-sapphire-sweep.mjs http://127.0.0.1:5200 /tmp/watch-sapphire-sweep
node scripts/test-refinement.mjs http://127.0.0.1:5200 /tmp/watch-sapphire-tests graphite-sapphire
```

The sweep uses five matched diagnostic angles (-12°, -6°, 0°, +6°, +12°)
around the Sapphire camera target at fixed pose/time. It does not rewrite presets.
It also checks the frozen default, geometry/material assignments, complete base
restoration, non-sapphire invariance, and preservation of both sapphire F0 values.
Output directories must not already exist.

## Acceptance findings

- The recaptured Hero, Sapphire and Exploded `graphite-finish` images are
  pixel-identical to the previous finishing acceptance images.
- Sapphire: pass. The existing edge/surface is more perceptible through grazing
  reflection; the oblique movement remains legible, without obvious doubled
  contours or an opaque overlay. The original 3-unit strip is retained; narrower
  variants were not needed.
- Exploded: pass. The upper-left front optical body separates more clearly from
  the background. Its increased brightness is reflected light on the glass,
  not a change to any graphite component.
- Rear: pass. The same treatment preserves the exhibition view and its gold mass.
- Hero: pass for regression and major hierarchy. The gold remains the base's
  subdued ochre-gold, the hands stay blue, and the rim separates the case. At
  200 px and simulated 50% linear display luminance those main cues remain
  legible; tiny movement details and darkest strap/recess boundaries compress.
  The candidate's mean absolute Hero change is below 0.02/255 per RGB channel.
  This average is supporting evidence, not a substitute for visual inspection.
- Sweep: the five samples show progressively stronger grazing reflection, with
  some movement contrast loss at the steepest angle. No abrupt discontinuity,
  screen-fixed outline or doubled contour is visible in the sampled frames.
  This is sampled software-rendering evidence, not continuous hardware-GPU proof.
- No new Hero-specific lighting adjustment is proposed. The inherited dark
  case/strap limit under severe dimming is not caused by this sapphire pass.

All eight main captures match authored cameras. The eight additional sapphire
scope/sweep checks pass, including exact base restoration and both optical F0
values. The production build passes with the existing bundle-size warning.

All 37 existing restoration and interaction checks pass against the production
preview, including geometry/normal/material-reference invariance, kinematics,
all layer selections, keyboard/orbit/reset behavior and desktop/phone views.
No unexpected browser errors were reported. The case diagnostic captures also
completed without unexpected browser errors.

Acceptance gallery: `captures/sapphire-2026-09-05/index.html`.
Separate follow-up: [case execution assessment](CASE_EXECUTION_ASSESSMENT.md).
The frozen base remains the default; no deployment or candidate promotion occurred.
