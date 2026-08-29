# RC1 known limitations and nonclaims

RC1 is a mechanically informed interactive visualization of a nominal watch
model. Its collision, kinematic, package, and presentation reports establish
the specific modeled relationships they name; they are not a manufacturing
drawing or physical prototype qualification.

## Runtime

- Three.js emits a known `BufferGeometry.computeTangents()` diagnostic for a
  geometry/material path that lacks all tangent prerequisites. RC1 fingerprints
  and allowlists only that exact message (regardless of repeated scenarios).
  Any different console, page, request, or HTTP failure is a release failure.
- The renderer retains `preserveDrawingBuffer` because deterministic evidence
  capture depends on it. This has a performance cost and is not presented as a
  general renderer optimization.
- Browser automation is software-rendered where noted. Every Playwright engine
  requested by the release gate must be installed and pass; physical devices
  unavailable on the release host are recorded as untested, never as passing.

## Product model

- Geometry is nominal. No production tolerance stack, elastic/shock model,
  lubrication, wear, sealing, or water-resistance validation is claimed.
- The crown and stem are visually coherent presentation geometry; functional
  winding, setting, clutch, and keyless works are not modeled as an operable
  system.
- The display has two hands and no seconds indication. No power reserve or
  marketing jewel-count certification is claimed.
- Crown grip relief is visually restrained and is not advertised as functional
  deep fluting. Several jewel bodies are intentionally simplified rather than
  production-cut stones.
- Annex E1 is a deterministic presentation-only axial explosion. It is not a
  service sequence, and it does not simulate disassembly forces or fastener
  removal.

## Public description

Use “unsigned, mechanically informed two-hand skeleton wristwatch
visualization.” Do not describe RC1 as production-ready, physically fabricated,
water resistant, shock qualified, functionally windable/settable, or certified
for a stated power reserve or jewel count.
