# Current technical truth for review

This document is context for a reviewer, not new design authority.

## Product identity

- Unsigned, wearable, two-hand skeleton wristwatch.
- Native rate: **2.4 Hz / 17,280 vph**.
- Rear identity: **2.4 Hz · 17 280 · TWO HANDS**.
- Visual thesis: **warm mass, cool drawing, one blue**.
- Gold barrel is the sole large warm mass; blued hands are the primary display
  accent; balance/hairspring are the mechanical hero.

## Existing physical/presentation architecture

- Four case-grown steel horn lugs, two 18 mm charcoal FKM strap heads, real
  coaxial spring bars, and a buckle. There is no display stand.
- Source-reported envelope is approximately **31.54 × 29.55 mm**, **34.17 mm**
  lug-to-lug, and **32.87 mm** wide including the crown. The metal-stack
  thickness is approximately **9.34 mm**; the exact full sapphire/package Z
  span is approximately **10.0576 mm** (`7.4616000001 - (-2.5960000052)`).
- Separate bezel, midcase, waist, caseback, carrier/closure, gasket/seat, and
  rear-exhibition authority.
- Front and rear planar sapphire assemblies with frozen inner/outer boundaries
  and one final optical manifold per side. They are intentionally not domed.
- Supported cushion chapter with 12 marker stations, cardinal emphasis, and a
  distinct 12 marker.
- Mechanically driven hour and minute hands through the certified Phase 4B
  motion works. There is no seconds display.
- Explicit wheel/pinion axes, tooth counts, module, signed ratios, separate Z
  levels, staffs, two-sided bearings, jewels, fasteners, bridges, barrel,
  balance, hairspring, and repaired lever escapement.
- Crown socket, fixed root collar, neck/body/cap, polished shoulder, 18 flutes,
  and render-only cap emblem. Functional stem/keyless works are not claimed.
- Deterministic presentation-only Annex E1 axial explosion with `explode=0...1`;
  assembled state is unchanged at zero.

## Current accepted state

The latest combined regression is:

`reports/current-final-regression-report.json`

It passes the recorded build/runtime, frozen package, Phase 4B, escapement,
finish, identity, sapphire, prior-repair, and assembled E1 gates. Product source
at packet generation time is hashed in `source/source-manifest.json`.

## Known unresolved mechanical findings

Two legacy-profile train pairs still have rendered tooth penetration and are
recommended for bounded repair before final public release:

1. barrel wheel 80T ↔ center pinion 12T;
2. fourth wheel 56T ↔ escape pinion 7T.

The other two train pairs have already been repaired and pass dense rendered
repeating-cycle sweeps:

- center wheel 64T ↔ third pinion 10T;
- third wheel 60T ↔ fourth pinion 8T.

The packet is therefore a **review candidate**, not a claim of complete final
mechanical closure.

Phase 5D-C and Annex E1 evidence in this packet are historical presentation
baselines. They predate later bounded repairs and are not current source
manifests; the current manifest and combined regression are separate.

## Frozen authority unless explicitly reopened

- all axes, tooth counts, module, pitch/root/tip radii, rates, ratios, and Z
  planes;
- lever escapement geometry/contact law, balance amplitude, bearings, and
  supports;
- Phase 4B real two-hand display drive;
- case, lugs, crown, sapphire boundaries/ownership, strap, package contours,
  and finish/identity families;
- the unsigned face and 2.4 Hz / 17,280 / two-hand identity;
- 5D-C presentation and E1 explosion at `explode=0`.

## Explicit non-claims

The project does not currently claim:

- production manufacturability or tolerance/shock certification;
- water resistance;
- a verified power reserve;
- functional winding/setting/keyless works;
- seconds display or 4 Hz/28,800-vph operation;
- a verified marketing jewel count;
- a model/maison name.

## Packaging status

The older archives in the repository's `release/` directory are stale and must
not be distributed as final. This context ZIP and its static preview are fresh
review artifacts, not final public-release packages.
