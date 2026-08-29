# Skeleton Watch RC1 release notes

Date: 2026-08-28 UTC  
Authority: `captures/rc1/` and `captures/release-annex-r1/`

RC1 closes the post-5D release candidate without reopening the watch's product
architecture. It combines two narrowly bounded going-train mesh corrections,
one same-metal identity-raster refinement, a presentation-only proof suite, and
a public interaction/packaging layer.

## Mechanical closeout

- The barrel 80T / center pinion 12T and fourth wheel 56T / escape pinion 7T
  pairs now use pair-specific working profiles and local clocking.
- Frozen axes, tooth counts, module, analytic pitch/root/tip radii, ratios,
  direction, motion ownership, and world-Z slabs remain authoritative.
- Removing the former expanding bevel also removes its roughly 0.016 mm
  rendered radial overshoot; this is a bounded contraction with no package or
  neighboring-solid growth.
- All four going-train pairs are required to pass actual rendered-geometry
  repeating-cycle sweeps in the consolidated RC1 matrix.
- The escape clubs, pallet contact law, complete beat, Phase 4B display drive,
  bearings/supports, and package remain regression-gated.

## Presentation and interaction

- The rear copy remains exactly `2.4 Hz · 17 280 · TWO HANDS` on
  `ext:caseback`; only the decimal's mip-safe same-steel roughness/bump raster
  footprint is refined.
- Release Annex R1 adds whole-watch, front-elevation, wearable, finish,
  sapphire, rear, and exploded proof views without changing product geometry.
- The public shell adds Assembled/Exploded, Pause/Resume, Reset view, keyboard
  focus/help, touch-sized controls, reduced-motion behavior, and a restrained
  eight-layer explosion legend.
- Historical Phase 5D-C cameras/profiles and Annex E1 authority remain callable
  and unchanged.

## Distribution

- Static, source-handoff, and selected-evidence archives are deterministic and
  self-verifying.
- The static artifact contains a WebGL/static-poster fallback, hosting header
  examples, the project rights notice, the Three.js MIT notice, and an SBOM.
- Source handoff supports `npm ci`, `npm run build`, and
  `npm run verify:authority` with Node `^20.19.0 || >=22.12.0`.

See `KNOWN_LIMITATIONS.md` for precise nonclaims. RC1 is an unsigned,
mechanically informed two-hand skeleton wristwatch visualization; it is not a
production or fabrication certification.
