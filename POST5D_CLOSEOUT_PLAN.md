# Post-5D closeout and release roadmap

Status: working plan, not new product authority  
Date: 2026-08-27  
Current baseline: the accepted post-5D mechanical/presentation source plus the latest bounded gear and structural-junction repairs

> **Release warning:** the existing files in `release/` were built on 2026-08-25 and do not contain the current 2026-08-27 source. They are internally checksummed but stale. Do not distribute them as the finished watch.

Primary evidence anchors:

- current combined regression: [`captures/post5d-newer-827-followup/final-regression-report.json`](captures/post5d-newer-827-followup/final-regression-report.json);
- current runtime snapshot: [`captures/post5d-newer-827-followup/runtime-regression.json`](captures/post5d-newer-827-followup/runtime-regression.json);
- final 5D-C presentation authority: [`captures/phase5d-c/comparison-report.json`](captures/phase5d-c/comparison-report.json);
- exploded Annex E1 authority: [`captures/annex-e1-exploded/comparison-report.json`](captures/annex-e1-exploded/comparison-report.json);
- current packaging instructions: [`README.md`](README.md), [`DEPLOYMENT.md`](DEPLOYMENT.md), and [`scripts/package-release.mjs`](scripts/package-release.mjs).

## 1. Recommended working model

The proposed division of labor is sound:

- **Owner / final authority:** decides taste, scope, and whether any frozen design family is reopened.
- **Grok / visual director:** critiques silhouettes, hierarchy, legibility, composition, and perceived product quality from renders.
- **Codex / build and truth layer:** resolves observations to exact scene owners, checks source/runtime geometry, proposes the smallest legal repair, implements it, and produces regression evidence.

The governing rule should be:

> A screenshot finding is a useful hypothesis, not mechanical authority. Identify the actual owners and test the rendered geometry before changing the watch.

This preserves the best part of the recent workflow: visual criticism can be broad and intuitive, while implementation remains bounded and evidence-led.

### Suggested handoff format

Every visual-director note should contain:

1. the marked source image and camera/view if known;
2. the perceptual problem, stated without guessing object names;
3. the desired visual outcome;
4. what must remain frozen;
5. whether the request is diagnosis-only or authorizes a bounded change.

Codex should return:

1. exact owners and source paths;
2. classification: real geometry, motion, material, lighting, or projection-only;
3. smallest repair family;
4. before/after evidence from matched cameras;
5. mechanical/package/source regression;
6. an explicit stop when the evidence does not support the proposed change.

## 2. How to use the shared Grok critique

The critique contains good design principles, but several literal observations describe an older or incomplete visual read rather than the current product.

| Grok observation | Current source truth | Disposition |
| --- | --- | --- |
| The watch has not chosen between lugs and a display stand. | The product has four steel horn lugs, two 18 mm strap heads, coaxial spring bars, and a charcoal strap. The dark forms in the supplied views are not a stand. | Treat as a camera/readability warning. Do not redesign the lugs or invent a plinth. |
| The case is only a hollow shell. | The current case has separate bezel/mid/waist/caseback architecture, nested aperture contours, closure and sapphire seating authority, a crown pocket/socket/root collar, and a rear exhibition closure. | Stale as geometry criticism. Continue to judge edge-language visibility in final renders. |
| The crystal is a flat pane. | Front and rear sapphire have frozen inner and outer boundary surfaces and one final optical manifold per side; duplicate transmissive ownership was already removed in 5D-B.2. | Stale as construction criticism. Preserve the geometry and optical ownership; verify the oblique read in release captures. |
| The time cannot be read and there is no chapter/12 marker. | The watch has a supported cushion chapter, 12 marker stations with a distinct 12/cardinal hierarchy, two mechanically driven blued hands, and a frozen two-hand identity. | Mostly stale. Better lighting/camera proof is allowed; adding 60 ticks, a seconds hand, lume, or a new applied index would reopen frozen readout/identity authority. |
| The movement is made from fantasy parts and all wheels share one plane. | The train has explicit teeth, pitch radii, signed ratios, separate wheel/pinion Z levels, staffs, bearings, jewels, bridges, a seated roller jewel, and a certified lever escapement. | Stale in the broad sense, but useful as a warning that bad meshes or dark lighting can make correct depth look false. |
| The crown is a placeholder cylinder. | The crown has a socket, fixed root collar, neck/body/cap, 18 flutes, operating clearance, and a render-only three-fold cap emblem. | Stale. The remaining narrow cap ring is an intentional polished shoulder, not the removed overlapping-face seam. |
| The exploded view is cinematic but undisciplined. | Annex E1 already uses deterministic `explode=0...1` carriers and a restrained axial layer order; `explode=0` is product-equivalent. | Partly useful. A deeper movement-only annex and optional guide/label layer remain viable presentation work, but are not required for product closure. |
| Use a 4 Hz/28,800-vph seconds architecture. | Native authority is 2.4 Hz / 17,280 vph and explicitly `TWO HANDS`; Phase 4B owns the real minute/hour drive. | Reject. It contradicts the certified movement and final rear inscription. |
| Rescale to a conventional 40–42 mm watch. | Current frozen case authority is approximately 31.54 × 29.55 mm, 34.17 mm lug-to-lug, 9.34 mm across the metal stack, and 10.0576 mm across the full sapphire/package Z span. | V2 identity question only. Do not casually rescale the finished package. |
| Put all dimensions in one new config object and regenerate the watch. | The project already has typed spec/plan modules and exact executable/frozen reports. A late wholesale refactor would create risk without improving the product. | Do not refactor before release. A read-only derived specification sheet is safer. |

The strongest ideas worth carrying forward are:

- preserve the gold barrel as the sole large warm mass;
- keep the balance as the mechanical hero;
- make depth legible rather than merely numerically correct;
- keep the explosion ordered and assembly-like;
- use finish and broad studio reflections to describe steel edges;
- keep every public technical claim true;
- never polish over a mechanical lie.

## 3. Recommended sequence

### P0 — Complete known mechanical closeout

This is the only recommended product-source work before calling a release candidate final.

Two pre-existing generic-profile gear penetrations remain recorded in the latest regression:

1. `barrel:wheel` 80T versus `center:pinion` 12T;
2. `fourth:wheel` 56T versus `escape:pinion` 7T.

Handle them as two separately bounded repairs, using the successful pair-specific method only where the exact rendered sweep supports it:

- preserve every axis, tooth count, module, pitch/root/tip radius, Z interval, compound ownership, ratio, and rate;
- derive the working tooth profile and local phase from the actual pair;
- retain the escape wheel's certified 15-club profile and escapement contact law;
- run an actual rendered-triangle repeating-cycle sweep, not a screenshot or pitch-circle proxy;
- re-screen every already repaired adjacent pair after each change.

Mechanical closeout is complete only when every intended train mesh has a named report and zero unintended volumetric penetration across its full repeating cycle.

After the two pair repairs, run one consolidated matrix covering:

- barrel 80 / center pinion 12;
- center wheel 64 / third pinion 10;
- third wheel 60 / fourth pinion 8;
- fourth wheel 56 / escape pinion 7;
- the escape wheel/pallet functional contacts under their separate signed-gap rules;
- all wheel/arbor/support relationships already certified.

### P1 — Freeze a true release-candidate authority

The current `captures/phase5d-c/` authority predates several accepted post-5D mechanical and topology repairs. Once P0 closes:

1. serialize a new executable source manifest;
2. serialize the exact runtime/package authority;
3. run the complete mechanical, Phase 4B, escapement, package, finish, sapphire, identity, and Annex E1 regressions;
4. record every allowed source delta since 5D-C;
5. give the result a single release-candidate disposition and checksum.

Do not rewrite historical reports. Add a new release-candidate snapshot that cites them.

### P2 — Refresh presentation evidence from current source

Re-capture, without art-direction churn:

- final whole-watch hero;
- front three-quarter;
- balance/escapement macro;
- sapphire oblique;
- rear exhibition;
- assembled and 25/50/75/100% Annex E1 frames.

Use the accepted 5D-C cameras, identity, sapphire ownership, and lighting profiles first. Change presentation only if a matched comparison demonstrates a current defect.

The visual review should answer:

- Can the blue hands be read against the current movement at normal display size?
- Does the chapter/12 hierarchy remain visible without becoming a dial?
- Does the gold barrel read as the primary mass in front and rear views?
- Do the case layers, horn lugs, strap gap, spring bars, crown shoulder, and sapphire edges read correctly?
- Did any repaired tooth profile or structural junction introduce a new finish or shading artifact?

This is the right place to use Grok as an art director again: provide the complete matched suite and ask for ranked perceptual findings, not source-level repair instructions.

The highest-value presentation questions suggested by Grok are narrower than a redesign:

- do the real horn lugs, strap gap, and charcoal FKM unmistakably read as wearable rather than as a stand;
- do the blued hands and existing 12-marker chapter remain readable at normal display size;
- do the existing planar sapphire shoulder and thickness read as transparent volume;
- do the crown flutes, socket, root collar, and intentional polished shoulder read clearly;
- does an oblique camera communicate the already-certified wheel/pinion Z stack;
- does the current dark studio obscure real movement finishing that a bounded fill adjustment could reveal?

Because 5D-C lighting is frozen, any change arising from this review should be a separately named presentation-only annex with matched evidence—not an incidental product edit.

### P3 — Decide the scope of Annex E1, separately

The current axial explosion is already valid. For a first hosted release, the recommendation is to keep it and avoid delaying publication.

Optional Annex E1.1 work, in descending value:

1. expose an obvious `Assembled ↔ Exploded` UI control and reduced-motion-safe transition;
2. add a restrained layer list or hover ownership legend outside the watch;
3. add view presets/help and a truthful specification card outside the watch;
4. add optional presentation-only assembly guides;
5. build the already-certified-feasible static movement-only explosion, keeping each wheel/pinion/arbor and each escapement compound rigid.

The specification card must not claim a power reserve, functional keyless works, seconds display, water resistance, production tolerances, or an unverified jewel total.

All annex additions must remain absent or exactly neutral at `explode=0`. Do not move bearings away from their staffs and imply that an axially exploded mechanism is still running.

### P4 — Refresh packaging and hosting

Packaging infrastructure already exists: `npm run package` produces an upload-ready static ZIP and a source handoff ZIP, and relative Vite asset paths support domain-root or subdirectory hosting.

The package inputs are now stale relative to the latest accepted repairs. The old Phase 5D-C manifest differs from 16 of the current 63 source files, and the README still points at Phase 5D-C rather than the latest post-5D closure. Before distributing:

1. create one **read-only** release verifier and immutable manifest for all current source files; do not use the old comparator as the new release gate;
2. update the package script to include the new release-candidate manifest/report and refreshed image suite;
3. update `README.md` and `DEPLOYMENT.md` so “final authority” points to the release candidate rather than the older 5D-C snapshot;
4. set and document the actual supported Node range (`^20.19.0` or `>=22.12.0` for the locked Vite release), then build from a clean `npm ci` installation;
5. extract every ZIP into a temporary directory, verify every internal hash, rebuild the source handoff, and smoke-test the static artifact independently;
6. make packaging reproducible by fixing entry order, timestamps, permissions, and archive metadata; package twice and require identical SHA-256 values;
7. test both `/` and a nested `/watch/` deployment path;
8. test current Chromium and Firefox, plus Safari/WebKit if available;
9. verify touch orbit/zoom, keyboard access, resize behavior, WebGL failure fallback, and `prefers-reduced-motion` behavior;
10. add labeled `Assembled / Exploded`, pause, reset-view, and keyboard-focus controls around the existing APIs rather than changing the watch;
11. add a static poster/fallback, neutral page title/description, favicon, and social preview image without putting a new name or brand on the watch;
12. preserve the no-network/no-secret property and publish `SHA256SUMS.txt` beside the archives;
13. add a project licensing decision and dependency notices, including the required Three.js MIT notice, plus a small dependency/SBOM inventory.

Recommended release artifacts:

- a versioned static-site ZIP containing the exact bytes tested for deployment;
- a versioned source-handoff ZIP containing the current verifier, current authority, and clean build instructions;
- an optional separate evidence ZIP containing only selected final PNG/JSON evidence rather than the hundreds of megabytes of historical captures.

The host should serve the already-tested static archive, not rebuild the project independently. Keep `index.html` revalidated, hashed assets immutable, compression enabled, and the previous verified archive available for rollback. Add a strict static-site CSP and standard `nosniff`, referrer, and permissions headers without introducing analytics or other network dependencies.

The current production JavaScript is roughly 964 kB minified / 283 kB gzip. That is acceptable for a first high-detail WebGL study, but the release gate should still record first stable frame, warm p50/p95 frame time, draw calls/triangles, and resource growth across repeated assembled/exploded transitions. A later non-visual optimization may lazy-load diagnostic/audit code so the public path does not carry the entire engineering harness.

The current page is canvas-first and relies heavily on undocumented hotkeys. The public wrapper should provide semantic text, an accessible canvas label, visible focus, 44 px touch targets, a pause control, reduced-motion behavior, `noscript` content, and a WebGL-unavailable poster. These are release-shell improvements, not permission to alter the product scene.

### P5 — Publish and freeze

A public-release freeze should require:

- no known unintended gear or support penetration;
- current mechanical/package reports accepted;
- refreshed final and exploded suites inspected;
- `npm run build` and the release comparator passing;
- both extracted archives smoke-tested;
- a complete source/runtime manifest and checksums;
- a short release note listing deliberate non-claims and deferred annex work.

Only then generate the final static and source-handoff ZIPs and publish the static one.

## 4. Explicit non-priorities

Unless a later design-authority memo deliberately reopens them, do not:

- rebuild the case, lugs, sapphire, crown, strap, chapter, hands, balance, or bridges from the two-picture critique;
- add a stand, seconds hand, 4 Hz rate, 28,800-vph claim, lume pip, model name, or new face branding;
- globally rescale the current 31.54 × 29.55 mm case into a different watch;
- replace the certified ratio graph with a physics engine;
- flatten or shift Z planes to improve a screenshot;
- add decorative crystal graphics;
- retune all materials or lighting before current-source release captures exist;
- perform a broad “one config object” refactor before packaging.

## 5. Immediate decision queue

Recommended answers are shown in parentheses.

1. Close the remaining two known gear pairs before release? **Yes.**
2. Treat the current watch as wearable rather than a vitrine/stand object? **Yes; that is already what its lugs, spring bars, and strap implement.**
3. Reopen the unsigned two-hand face to add a 60-tick track or seconds hand? **No.**
4. Ship the current E1 explosion in v1 and defer the movement-only explosion? **Yes.**
5. Let the next Grok pass judge a refreshed full suite rather than two isolated screenshots? **Yes.**
6. Refresh the release ZIPs only after the new authority snapshot? **Yes.**

## 6. Definition of “done”

The project is ready to hand off or host when the watch has:

- zero known unintended mechanical intersections;
- one current, reproducible source/runtime authority;
- one coherent final five-frame suite and one E1 suite from that authority;
- a static build that works at root and nested paths;
- a source archive that reproduces with `npm ci && npm run build`;
- checksums and a concise deployment guide;
- project/dependency license notices and a recorded release-time vulnerability audit;
- browser, performance, accessibility, extracted-ZIP, and nested-path smoke results;
- no unresolved ambiguity about which report or ZIP is the final one.

If the two P0 gear penetrations are deliberately left unresolved, they must appear in a public `KNOWN_LIMITATIONS.md`, and the release should be described as a mechanically informed interactive visualization rather than an unqualified physically exact movement. The preferred course is still to repair them before release.
