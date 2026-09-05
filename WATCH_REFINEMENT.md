# 17280 presentation refinement

This document records the earlier readability pass. The subsequent
[graphite refinement](GRAPHITE_REFINEMENT.md) is now the public default; its
material/optical settings and validation are documented separately. The earlier
final is preserved at `?refinement=final`.

This pass retains the product geometry and motion system while refining material
response, dial hierarchy, and the public viewing experience. Its baseline is
commit `e32469d319e57ba78aaaefebb72ee865b79aa0e7`, including that commit's sapphire
diagnostic settings. Historical RC1 evidence and authority manifests are retained.

## Presentation

- Satin case faces target a mean roughness input of 0.32, bridges 0.31, plate 0.38,
  and rubber 0.55. Scalars compensate for each procedural roughness map's green
  channel mean; the existing grain is retained.
- Broad, neutral environment cards reveal the rear and underside while retaining
  a dark background. Tone mapping and the existing preset intensity profiles stay
  fixed for comparison. Polished accents are quieter.
- Blue hand faces use a broader reflection and a stable base value. The circular
  movement-holder pads are subdued independently of chapter marks.
- Sapphire uses opacity 1, transmission 0.97/0.98, IOR 1.46, zero shader thickness,
  and specular intensity 0.20. This is a restrained visualization setting, not a
  claim of physically complete sapphire optics. The existing optical boundaries,
  depth behavior, and hidden engineering surfaces are preserved. Comparisons also
  cover IOR 1 and 1.77 under identical lighting.
- Desktop canvas space excludes the control panel. On phones the canvas occupies
  the upper 56% of the viewport; controls scroll below it. Preset framing adapts
  to the canvas aspect. Wearable gets a modestly tighter public composition.

The baseline materials remain authored in their existing modules. Reversible
overrides live in `src/refinement.ts`; historical non-R1 diagnostic views restore
their original materials. For capture comparisons use `?refinement=baseline`,
`?refinement=materials`, or `?refinement=final` (the earlier public default). The optional
`sapphireIor=1`, `1.46`, or `1.77` selects the isolated optical comparison.

## Exploded layers

The eight legend buttons use the existing layer IDs and rigid object membership.
One selected layer receives temporary material overrides; crystals receive a
translucent cyan tint. Other parts remain visible. Repeat activation or Escape
clears selection; assembly, camera presets, and reset also clear it. Orbiting
preserves selection. Original material references are restored and temporary
materials disposed on each clear/change.

Buttons support mouse, touch, Enter, and Space, with pressed state, visible focus,
and an accessible status message. Space on a focused button performs its native
action instead of toggling playback.

Inspection additions to `window.__WATCH__`: `setRefinement(stage)`,
`selectLayer(id | null)`, `setCaptureCamera(position, target)`, and
`physicalPresentationSnapshot()`. Presentation reports include refinement values
and selected layer; explosion reports distinguish temporary material changes.
The capture camera helper freezes rotation and damping for matched comparisons.

## Reproduce the evidence

Build with `npm run build`, then run `npm run preview -- --port 5198`.
All tools refuse to overwrite their output directories/files.

```sh
node scripts/capture-refinement.mjs http://127.0.0.1:5198 /tmp/watch-comparisons
node scripts/test-refinement.mjs http://127.0.0.1:5198 /tmp/watch-validation
node scripts/test-refinement-touch.mjs http://127.0.0.1:5198 /tmp/watch-touch
node scripts/capture-refinement-phone.mjs http://127.0.0.1:5198 /tmp/watch-public-views
node scripts/capture-refinement-orbit.mjs http://127.0.0.1:5198 /tmp/watch-orbit
node scripts/audit-public-runtime.mjs dist /tmp/watch-runtime.json 24
```

The orbit tool requires `ffmpeg` and produces a 12-second, 24-pose matched
comparison. It is an appearance comparison, not a real-time performance demo.
The runtime audit's optional final argument changes only its informational frame
timing sample (default 180, minimum 24). Functional, resource, repeated assembly,
resize, input, and context-loss checks remain in place. Resize checks account for
the reserved control area, and gestures target the actual canvas.

The interaction suite compares mesh attributes, topology, transforms and material
references across presentation stages, plus the driven-hand report. It exercises
all eight layer selections and restoration, keyboard behavior, and clear/reset
paths. The public-capture script covers Hero and Front at 10:10, 3:00, 6:30, 8:40,
9:45, 1:05 and 12:00 on desktop and phone viewports, using canvas-only pose images
and full screenshots for the public controls. Exact hand overlap remains truthful.

These checks establish presentation invariance against the current source; they
do not re-certify historical full-cycle collision audits. Browser evidence uses
Chromium/ANGLE SwiftShader. Physical phones and hardware GPU rendering remain
untested. No deployment or historical authority regeneration is part of this pass.

## Completed validation

- Production build and TypeScript checking passed.
- All 35 interaction/invariance checks passed, with no unexpected browser errors.
- All eight layers passed selection and clearing with touch input at 390 × 844,
  device pixel ratio 2.
- Final public captures include ten desktop/phone overview and exploded views,
  plus 28 canvas-only hand-pose images. The inspection camera and shell state agree.
- The production runtime audit passed both desktop and phone scenarios, including
  repeated assembly, resource stability, resize/input, and WebGL context recovery.
  It used 24 frames per informational timing sample. An earlier concurrent run's
  browser closed before completion; the accepted run used an isolated browser job.
- The matched 24-pose orbit is encoded as a 12-second comparison video.

The generated local [review gallery](captures/refinement-2026-09-05/index.html)
includes images, video, reports, and source/build hashes. Generated evidence is
kept outside the tracked source files; the scripts above reproduce it.
