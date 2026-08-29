# Context reconciliation

## Metadata

Reviewer/model: Grok  
Date: 2026-08-27  
Blind response filename/reference: `watch-audit-01-blind-visual-2026-08-27/GROK_01_BLIND_VISUAL_AUDIT.md`  
No other reviewer's response consulted (`yes` or `no`): yes  

## Blind finding reconciliation

Include one row for every original F-ID.

| F-ID | Original impact/confidence | Classification | Evidence citation | Revised impact/confidence | Disposition and reason |
| --- | --- | --- | --- | --- | --- |
| F01 | 3/H | SOURCE_REFUTED_BUT_READ_FAILURE | `02_PRODUCT_TRUTH.md` (two-hand display; 12 marker stations, cardinal emphasis, distinct 12); `source/src/readoutSpec.ts` (`selectedConcept: "blade-baton"`, `seconds: "not-authorized"`, 12-station widths); `source/src/readoutPlan.ts` (`MarkerKind` cardinal12/cardinal/subordinate); `reports/review-capture-report.json` (`fixedReadoutPose: "10:10"`, V01–V03 cameras). Four gray flange dots in V01/V03 match support/attachment language (`READOUT.attachmentAngles` at 45° rays), not the 12 batons. | 3/H | Keep as presentation failure. Chapter and driven hands exist; whole-object frames still do not lock time. Do not add numerals, lume, or a 60-tick track. Recapture hero/front so batons and blade/leaf tips read at the supplied 1600×1100 size. |
| F02 | 3/H | SOURCE_REFUTED_BUT_READ_FAILURE | `02_PRODUCT_TRUTH.md` (four case-grown steel horn lugs, two 18 mm charcoal FKM heads, coaxial spring bars, buckle; “There is no display stand.”); `source/src/strapSpec.ts` (`hornGap: 0.28`, `taperEndWidth: 15.4`, `freeLen: 68`, `buckleAt: 64`, spring-bar pin); `source/src/exteriorSpec.ts` (`strapWidth: 18`, `hornFreeLength: 4.45`). V01–V02/V05/V07/V09 still crop to rectangular heads and faceted horns. | 3/H | Drop the stand-construction guess. Keep the wearable-read failure. Do not rebuild lugs from screenshots. Require strap-complete matched frames (loop, bar, buckle, horn gap) before any public wearable claim. |
| F03 | 3/H | SURVIVES_VISUAL | V02/V05/V10 still show stepped caseband banding. `source/src/exteriorSpec.ts` `EXT_FINISH` already specifies cool brushed metals (`anisotropy: 0.36`, `brushMm: 2.6`). `90_CURRENT_CLOSEOUT_PLAN.md` §4 forbids retuning all materials before current-source captures; §P2 allows a named lighting annex only with matched evidence. | 2/H | Contained presentation defect, not proof the finish family is missing. First action is matched recapture under accepted 5D-C profiles; only then a separately named fill/lighting annex. No case rebuild. |
| F04 | 3/H | SOURCE_REFUTED_BUT_READ_FAILURE | `02_PRODUCT_TRUTH.md` (front and rear planar sapphire; intentionally not domed; ~10.0576 mm package Z); `source/src/enclosureSpec.ts` (`frontSapphireMinThick: 0.8`, `frontSapphireMaxThick: 1.12`); `reports/annex-e1-comparison-report.json` `layerTable` ids `front-sapphire` / `rear-sapphire`. V08/V09/V11 prove plates exist; V01/V02/V07 still lack assembled edge/volume. | 3/H | Feature exists and is planar by frozen choice. Assembled hero must show shoulder, thickness, and a top specular. Do not dome or add decorative crystal graphics. |
| F05 | 2/H | SOURCE_REFUTED_BUT_READ_FAILURE | Blind read of V06 as “SAMPLE ONLY / NO HANDS” is false. `source/src/identity.ts` `REAR_IDENTITY_CANONICAL_COPY = "2.4 Hz · 17 280 · TWO HANDS"`; letter height 0.38 mm on south cap band; glyphs mirrored for 12-up rear. `02_PRODUCT_TRUTH.md` rear identity matches. V06 contrast, curve, and obliqueness still make the line unreadable and easy to invert. | 2/H | Drop leftover-markup inference. Keep readability action: one rear frame where the canonical line can be read without source knowledge. Do not change copy. |
| F06 | 2/H | SOURCE_REFUTED_BUT_READ_FAILURE | `source/src/finishMaterials.ts` defines transmissive ruby/rubyCap (`ior: 1.77`, attenuation); `source/src/finishSpec.ts` `rubyColor` / `chatonColor`. `02_PRODUCT_TRUTH.md` does not claim a marketing jewel count. V04 still reads jewels as flat red discs and several cocks as hard facets. Dark studio is listed as an open presentation question in `03_KNOWN_OPEN_ITEMS.md`. | 2/M | Geometry/material family exists; hero lighting fails the stone read. Presentation annex first. Deeper jewel/bridge sculpture is V2 unless matched captures prove missing geometry. |
| F07 | 2/H | SOURCE_REFUTED_BUT_READ_FAILURE | `02_PRODUCT_TRUTH.md` (crown socket, fixed root collar, neck/body/cap, polished shoulder, 18 flutes, render-only cap emblem; keyless works not claimed); `source/src/exteriorSpec.ts` (`crownFlutes: 18`, `crownBodyR: 2.62`, `crownProjection: 2.38`); `source/src/identity.ts` three open cushion arcs, 1.02 mm mark. Envelope ~31.54×29.55 mm makes “toy-thick crown” an unverified scale guess. V10 still shows a smooth puck. | 2/H | Drop overscale/keyless inference. Keep flute/socket/shoulder communication failure. Recapture crown macro/profile; do not invent winding works. |
| F08 | 2/M | SOURCE_REFUTED_BUT_READ_FAILURE | `reports/annex-e1-comparison-report.json` `layerTable` is an axial case/display stack (sapphire, bezel, display+Phase-4B drive, bridges, mainplate, carrier, caseback). `stageTwoFeasibility.feasible: true` but movement-only explosion is deferred (`90_CURRENT_CLOSEOUT_PLAN.md` §P3). V11 now states 0/.25/.5/.75/1 order; V09 remains dark and underscaled. | 1/H | Drop “missing caliber in E1” as a product defect. Keep V09 as a weak accepted camera. Ship current E1; optional UI/legend later. No v1 movement-only explosion. |

## Score reconciliation

| Dimension | Blind | Context | Delta | Why/evidence |
| --- | ---: | ---: | ---: | --- |
| Identity and coherence | 4 | 4 | 0 | Silhouette and warm-gold / cool-steel / one-blue thesis confirmed in `02_PRODUCT_TRUTH.md`. Rear identity exists but does not raise the score until V06 reads. |
| Wearable-object legibility, including case/lug/strap junction | 2 | 3 | +1 | Stand inference refuted by `strapSpec.ts` / product truth; supplied frames still hide loop, bars, and buckle, so the dimension is unresolved rather than failed architecture. |
| Time-reading clarity | 2 | 2 | 0 | 12-station blade-baton chapter is in source; V01–V03/V07 still lose it to flange glare and gear clutter at whole-object size. |
| Spatial depth and mechanical hierarchy | 3 | 3 | 0 | Certified Z stack and separate owners are documented; dark fills and overlaps in V03/V04 continue to flatten the read. |
| Case, crown, and sapphire credibility | 2 | 3 | +1 | Planar sapphires, 18-flute crown, and layered case are source-real; assembled optical volume and flute/shoulder still fail in V01/V05/V07/V10. |
| Movement-detail and finishing credibility | 3 | 3 | 0 | Ruby materials and repaired pairs exist; V04 jewel/bridge read plus two remaining mesh penetrations keep this at 3. |
| Material and lighting realism | 2 | 2 | 0 | `EXT_FINISH` family is specified; V05/V10 banding and plastic speculars survive as presentation. |
| Exploded-assembly clarity | 3 | 4 | +1 | V11 plus E1 layer table make intended axial order clear; V09 is now a weak extra, not the authority frame. |
| Composition and product presentation | 3 | 3 | 0 | `reports/review-capture-report.json` confirms tight crops are accepted cameras; they still starve wearable and time proofs. |
| Overall release readiness | 3 | 3 | 0 | Identity holds; P0 mesh closeout plus a matched presentation recapture remain before a visual release candidate. |

## Newly discovered source truths

Maximum five. Mark each assertion `verified` or `documented-only`.

| N-ID | Finding | Exact citation | Verified vs documented | Impact |
| --- | --- | --- | --- | --- |
| N01 | Two train pairs still have rendered volumetric tooth penetration: barrel 80T ↔ center pinion 12T (max area 0.004096 mm²) and fourth 56T ↔ escape pinion 7T (max area 0.069366 mm²), 2049/2049 collision samples each. | `reports/current-final-regression-report.json` → `readOnlyLatentGearMeshFindings.rows`; restated in `02_PRODUCT_TRUTH.md` and `03_KNOWN_OPEN_ITEMS.md`. | verified | PRE_RELEASE mechanical closeout; blocks an unqualified “physically exact train” claim. |
| N02 | Rear legend is `2.4 Hz · 17 280 · TWO HANDS` at 0.38 mm on the south caseback band, not sample/no-hands markup. Native rate is 2.4 Hz / 17,280 vph. | `source/src/identity.ts` `REAR_IDENTITY_CANONICAL_COPY`; `02_PRODUCT_TRUTH.md` Product identity. | verified | Corrects F05; V06 remains a read failure. |
| N03 | Wearable system is specified as 18 mm charcoal FKM heads, 0.28 mm horn gaps, coaxial spring bars, 68 mm free length, buckle at 64 mm; no stand. Envelope ~31.54 × 29.55 mm, lug-to-lug 34.17 mm, metal stack ~9.34 mm. | `source/src/strapSpec.ts`; `source/src/exteriorSpec.ts`; `02_PRODUCT_TRUTH.md` Existing physical/presentation architecture. | documented-only | Refutes stand theory; current image suite does not independently show buckle or free strap. |
| N04 | Front/rear glasses are frozen planar optical manifolds (front 0.80–1.12 mm, rear 0.58–0.76 mm), not missing parts and not domes. | `source/src/enclosureSpec.ts` `ENC`; `02_PRODUCT_TRUTH.md`; `reports/annex-e1-comparison-report.json` sapphire layers. | verified (spec + E1 owners) / assembled optical read unverified in V01–V07 | F04 is communication, not absence. |
| N05 | Annex E1 is a deterministic axial case/display explosion; movement-only rigid-compound explosion is feasible and deferred. Functional keyless works, seconds, WR, power reserve, and jewel-count marketing are explicit non-claims. | `reports/annex-e1-comparison-report.json` `layerTable`, `stageTwoFeasibility`; `source/src/explodedStudy.ts`; `02_PRODUCT_TRUTH.md` Explicit non-claims; `source/src/readoutSpec.ts` `seconds: "not-authorized"`. | verified | Bounds F08 and public copy. |

## Plan challenge

| Plan section | KEEP/CHANGE/DROP | Reason | Replacement wording |
| --- | --- | --- | --- |
| §3 P0 — two remaining gear-pair repairs + consolidated mesh matrix | KEEP | Source-confirmed penetrations in `current-final-regression-report.json`. Required before any “exact train” claim. | (none) |
| §3 P2 — presentation recapture treated as open questions | CHANGE | Blind F01/F02/F04/F05/F07 survived as read failures. P2 currently under-weights them as optional adjudication. | “P2 is a required matched recapture gate, not a taste workshop: (a) whole-object time lock at 1600×1100; (b) strap-complete wearable proof; (c) assembled planar-sapphire shoulder; (d) 18-flute crown socket/shoulder; (e) rear identity line readable as `2.4 Hz · 17 280 · TWO HANDS`. No frozen family reopened unless a matched pair proves missing geometry.” |
| §5 item 2 — treat current watch as wearable because source implements it | CHANGE | Architecture is wearable; the supplied suite does not prove it. Public wearable language is premature. | “Treat the source architecture as wearable, but do not publish that claim until strap-complete frames show horns, gap, spring bars, FKM loop, and buckle.” |
| §3 P3 — ship current E1; defer movement-only explosion | KEEP | V11 plus layer table already explain the annex. F08’s missing-train request is V2. | (none) |
| §4 — do not rebuild case/lugs/sapphire/chapter from screenshots | KEEP | Stage-2 classes are mostly read failures, not missing parts. | (none) |
| §3 P1/P4/P5 — new RC authority, then packaging | KEEP | Stale `release/` warning in the plan is consistent with `02_PRODUCT_TRUTH.md` Packaging status. | (none) |
| §3 P0 fallback — ship with KNOWN_LIMITATIONS if pairs left open | CHANGE | Acceptable only if public copy is demoted. Do not keep silent. | “If either latent pair remains, the hosted build must be labeled a mechanically informed visualization and list both pair IDs and max intersection areas; it is not an unqualified physically exact movement.” |

## Final ranked actions

Provide exactly five rows.

| Rank | Action | Lane | Evidence | Smallest acceptance test |
| ---: | --- | --- | --- | --- |
| 1 | Close barrel80–center12 and fourth56–escape7 with pair-bounded profile repairs; run the four-pair plus escapement matrix. | PRE_RELEASE | `reports/current-final-regression-report.json` `readOnlyLatentGearMeshFindings`; `03_KNOWN_OPEN_ITEMS.md`; plan §P0. | Named reports show 0 unintended volumetric hits on all intended meshes across a full repeating-cycle rendered sweep; adjacent repaired pairs remain clear. |
| 2 | Recapture whole-watch hero and clean front at accepted 5D-C cameras so 10:10 blade/leaf tips and 12-station batons lock time at native 1600×1100. | PRESENTATION_ANNEX | F01; `source/src/readoutSpec.ts`; `reports/review-capture-report.json` V01/V03. | An uncropped V01-class frame lets a reviewer state hour and minute without opening a macro or the source. |
| 3 | Add strap-complete wearable proof frames (hero loop, spring-bar macro, buckle, underside horn gap) without editing lug/strap geometry. | PRESENTATION_ANNEX | F02; `source/src/strapSpec.ts`; `02_PRODUCT_TRUTH.md`. | One frame shows continuous horn → bar → FKM head → free strap; another shows the buckle. No stand read at thumbnail. |
| 4 | Matched recapture of assembled sapphire oblique, crown flute/socket/shoulder, and rear identity so planar glass volume, 18 flutes, and `2.4 Hz · 17 280 · TWO HANDS` are readable. | PRESENTATION_ANNEX | F03–F05, F07; `enclosureSpec.ts`; `exteriorSpec.ts`; `identity.ts`; V05/V06/V10. | V05-class shows a glass edge/specular; V10-class shows flutes not a smooth puck; V06-class lettering is transcribable without source. |
| 5 | After 1–4, serialize a new release-candidate source/runtime authority and retire stale 5D-C/`release/` packages; keep E1 as-is at `explode=0`. | PRE_RELEASE | plan §P1/P4/P5; `02_PRODUCT_TRUTH.md` Packaging status; F08/N05. | One checksummed RC manifest cites current source; extracted static ZIP smoke-tests; historical 5D-C reports remain cited, not overwritten. |

## Preserve/frozen

Keep the unsigned two-hand face, 2.4 Hz / 17,280 identity, warm barrel / cool envelope / one blue, asymmetric cushion outline, planar (not domed) sapphires, case-grown 18 mm horn interface, Phase 4B hand drive, certified axes/tooth counts/module/Z planes/escapement law, Annex E1 at `explode=0`, and no maison name on the watch.

## Reject/defer

Do not add seconds, 4 Hz / 28,800 claims, 60-tick or lume redesign, domed crystal, functional keyless works, a vitrine stand, global case rescale, movement-only explosion in v1, decorative crystal art, or screenshot-driven lug/case/chapter rebuilds. Do not claim water resistance, power reserve, production tolerances, or a jewel count.

## Truthful public claims and nonclaims

May say: unsigned wearable two-hand skeleton; 2.4 Hz / 17,280 vph; planar front and rear exhibition sapphire; open barrel as the warm mass; presentation-only axial assembly explosion. May not say: physically exact remaining train meshes until N01 is closed; water-resistant; winding/setting watch; three-hand or 28,800-vph movement; named manufacture; power-reserve figure; that current hero frames already prove strap wearability or chapter readability.

## Final verdict

proceed after the listed bounded roadmap revisions. P0 mesh closeout stays mandatory for an unqualified movement claim, and P2 must be upgraded from optional taste questions to a five-point matched recapture gate so the already-built strap, chapter, sapphire, crown, and rear identity actually read.

Saved as `artifacts/watch-audit-02-context-template-2026-08-27/GROK_02_CONTEXT_RECONCILIATION.md`. Stage-1 file was not rewritten.