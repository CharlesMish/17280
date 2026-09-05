# Crown shading repair

The crown's polished shoulder had a sharp reflection break where the lathe
wrapped around. Its first and last meridians occupy the same surface positions
but use separate UV vertices. Recomputing vertex normals left the two sides
with different shading directions.

`buildCrown` now averages and normalizes the nine matching meridian pairs after
normal recomputation and before tangent generation. Sixteen vertex normals
change; the other two already agree. The measured maximum discontinuity falls
from 22.527602° to exactly 0°.

This repair preserves the crown's positions, profile, dimensions, triangle
indices, UV seam, material groups, cap closure, flutes, emblem, and finish.
All normals outside the seam are exact. Tangents are regenerated from the
corrected normals. This is a specific normal/tangent exception to the earlier
finishing pass's invariance record; its material and optical choices remain
unchanged. The earlier [case assessment](CASE_EXECUTION_ASSESSMENT.md) is retained
as the diagnosis history.

## Verification

```sh
npm run verify:crown
npm run build
```

The verifier exercises the current crown construction twice, removing only the
marked repair for the baseline. It checks exact positions, indices, UVs, material
groups, bounds, and non-seam normals, plus a finite, unit, orthogonal tangent
basis. It derives the body dimensions from the current plan and specification.

The matched browser comparison checks five points along the six-second crown
take and saves a Hero view for context. Cameras, lighting profiles, and material
values agree. The live scene comparison identifies only
`Scene/ExteriorRoot/ext:visible/CrownExteriorPose/ext:crown-body` as changed, with
differences confined to normal and tangent attributes; other mesh attributes,
transforms, hierarchy paths, and material-reference relationships agree.

Visual review confirms the abrupt shoulder break is absent at the five matched
angles and in sampled frames from the saved orbit. The repaired MP4 decodes
fully with 144 frames over six seconds at 24 fps. The study page passes desktop
and mobile layout checks, keyboard/image selection, video playback, and relative
navigation beneath a simulated GitHub Pages repository prefix. The production
build passes; its existing bundle-size advisory remains.

To repeat the visual comparison, serve a saved pre-repair build on one port and
the repaired build on another, then run:

```sh
node scripts/capture-crown-seam.mjs http://127.0.0.1:5185 http://127.0.0.1:5184 captures/crown-comparison-new
npm run capture:film -- http://127.0.0.1:5184 captures/crown-orbit-new crown --duration=6 --width=640 --height=360 --fps=24
```

Use new output directories. Run browser capture jobs sequentially.

## Saved study

The static [crown study page](public/films/crown/index.html) and its media live
under `public/films/crown/`, so the normal Vite build includes them at
`films/crown/` beneath the hosting root. The page links to the normal watch and
the interactive crown camera using relative URLs suitable for GitHub Pages.
It includes original/repaired close-ups and six-second 640 × 360, 24 fps MP4s.
The original orbit is preserved as the comparison reference.
