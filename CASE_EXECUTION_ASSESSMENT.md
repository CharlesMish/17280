# Case execution assessment — diagnosis only

Historical diagnosis: the targeted crown normal correction described below is
now implemented. See [CROWN_REFINEMENT.md](CROWN_REFINEMENT.md) for its scope,
verification, and saved before/after views.

The cushion case concept, proportions, lugs and graphite treatment remain intact.
No case vertices, indices, normals, UVs, material assignments or cameras were
changed. Diagnostic close-up cameras exist only in the capture harness.

## 1. Crown seam: a justified, small follow-up

The close-up shows a sharp discontinuity in the polished shoulder highlight at
roughly its upper-left edge. This is more specific than a general lack of bevels.

The current crown is a 36-segment lathe. Its generated normals agree across the
coincident first/last meridians. `buildCrown` then runs `computeVertexNormals()`
after material grouping. The first/last meridians have separate UV vertices, so
that recomputation gives them different normals despite effectively coincident
positions. An in-memory reproduction of the exact current profile and grouping
measures up to **22.53°** of normal discontinuity; generated normals show **0°**.
Vertex position gaps are below 7e-16 scene units. This is strong evidence for a
shading seam, not an open physical crack. The visible highlight is consistent
with that mechanism; a live before/after correction has deliberately not been made.

**Smallest proposed follow-up:** average and normalize only the paired normals
at the crown body's first/last meridian, after the existing recomputation and
before tangent generation. Preserve UV separation, all vertices and triangles,
material groups, axial profile, cap closure, flutes and overall dimensions. Do not
smooth unrelated cap or shoulder boundaries. Recompute tangents for the corrected
normals. Validate zero seam-normal difference, unchanged geometry/bounds/groups,
and continuous shoulder reflection in the same close-up and a short orbit.

That normal-only repair should be evaluated before increasing segment counts or
changing bevels. It would require an explicitly reviewed normal change in the
geometry-invariance checks; this sapphire pass preserves those checks unchanged.

## 2. Crown tessellation and flute construction

The circular outline has minor polygonal stepping at close-up scale. At radius
2.62 and 36 segments, the radial chord error is approximately 0.010 scene units.
This is a tessellation limitation, not a reason to change the crown's profile.
Only if stepping remains objectionable after the seam correction should a later
comparison increase angular subdivisions while retaining the exact profile and
matching cap tessellation.

The 18 flute details are 0.07 × 0.08 cross-section boxes, embedded inside the
cylindrical envelope, rather than modeled cut channels. Their physical articulation
is weak in this view. This is a known construction simplification; converting it
to cut fluting would be a separate geometry task and is not recommended as part
of the initial normal-only repair.

## 3. Lugs: preserve the intended planes

The large planar side, tapered web and terminal chamfers read as intentional
faceted construction. The bore reveals polygonal interior shading at close-up
scale. The lower triangular transition follows the authored horn profile; the
images do not establish a crack or normal defect there. Do not round or globally
smooth these features merely to make the case less angular. No lug correction is
proposed from this evidence.

## Evidence and reproduction

Annotated images and the raw captures are in
`captures/sapphire-2026-09-05/case/index.html`. The exact numerical seam comparison
is in `case/crown-normal-seam.json`.

```sh
node scripts/capture-case-diagnosis.mjs http://127.0.0.1:5200 /tmp/watch-case-diagnosis
```

The script captures the frozen base, then recreates its current crown construction
in Node memory solely to compare generated and recomputed normals. It does not
write to the application model. The diagnosis is based on the current source in
`src/exteriorGeometry.ts` and the installed Three.js lathe implementation.
