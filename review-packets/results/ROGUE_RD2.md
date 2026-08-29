# Context reconciliation

## Metadata

Reviewer/model: Grok (xAI)  
Date: 2026-08-27  
Blind response filename/reference: GROK_01_BLIND_VISUAL_AUDIT.md (Stage-1 sealed fill of 03_RESPONSE_TEMPLATE.md)  
No other reviewer's response consulted (`yes` or `no`): yes

## Blind finding reconciliation

Include one row for every original F-ID.

| F-ID | Original impact/confidence | Classification | Evidence citation | Revised impact/confidence | Disposition and reason |
| --- | --- | --- | --- | --- | --- |
| F01 | 3/H | SOURCE_REFUTED_BUT_READ_FAILURE | `02_PRODUCT_TRUTH.md` “Existing physical/presentation architecture”: four case-grown steel horn lugs, two 18 mm charcoal FKM strap heads, coaxial spring bars, buckle; “There is no display stand.” `source/src/strapSpec.ts` STRAP.thesis “sculpted charcoal loop, inherited 18 mm”. Images V01, V02, V07, V08 still show short black slabs that read as a fixture. | 3/H | Keep as presentation failure. Architecture is wearable; supplied assembled frames do not prove strap loop, buckle, horn gap, or FKM surface. Lane: PRESENTATION_ANNEX. Do not add a stand (plan non-priority). |
| F02 | 3/H | SURVIVES_VISUAL | `02_PRODUCT_TRUTH.md`: two-hand display, gold barrel is sole large warm mass, 12 marker stations with cardinal emphasis. `source/src/readoutSpec.ts` blade-baton, default 10:10, cardinal12Width 0.52 / cardinal 0.38 / sub 0.2; seconds “not-authorized”. `03_KNOWN_OPEN_ITEMS.md` lists “normal-size hand and chapter readability”. V01, V03, V05, V07 still bury hands and chapter under the gold wheel. | 3/H | Keep. Design intent explains the gold mass and two-hand limit; it does not erase the glance-read failure in whole-object views. Do not reopen a 60-tick dial (plan §5.3). Lane: PRESENTATION_ANNEX (matched normal-size recapture). |
| F03 | 3/H | SOURCE_REFUTED_BUT_READ_FAILURE | `02_PRODUCT_TRUTH.md`: front and rear planar sapphire assemblies, intentionally not domed; package Z span ~10.0576 mm. `03_KNOWN_OPEN_ITEMS.md`: “planar sapphire shoulder/volume visibility”. V01–V03, V05, V07, V08 still lack a readable glass edge or volume. | 3/H | Keep as communication failure. Do not dome or rescale sapphire (frozen). Lane: PRESENTATION_ANNEX — oblique/hero must show planar thickness and shoulder. |
| F04 | 3/H | SOURCE_REFUTED_DROP | Blind read of V06 as “SAMPLE ONLY · 000 /4 · NO HANDS” is false. Documented rear copy is `source/src/identity.ts` `REAR_IDENTITY_COPY` = "2.4 Hz · 17 280 · TWO HANDS"; `02_PRODUCT_TRUTH.md` Rear identity. V06 remains a tight, dark crop so the true line is easy to misread. | 1/M | Drop the sample-notation defect. Residual action is only that V06 does not make the official identity line unmistakable — fold into presentation recapture, not a product edit. Lane: PRESENTATION_ANNEX (minor). |
| F05 | 2/H | SURVIVES_VISUAL | `03_KNOWN_OPEN_ITEMS.md`: “whether the dark studio hides existing finishing.” Finish/identity families frozen (`02_PRODUCT_TRUTH.md` Frozen authority). V04, V05, V10 still show banding and untextured CAD faces. Combined regression `reports/current-final-regression-report.json` accepts finish/sapphire gates but does not prove photographic metal response. | 2/H | Keep as lighting/presentation, not a finish-family reopen. Lane: PRESENTATION_ANNEX (bounded fill/exposure on frozen 5D-C profiles only if matched before/after shows hidden finishing). |
| F06 | 2/M | SURVIVES_VISUAL | Annex E1 is accepted (`reports/annex-e1-comparison-report.json` cited in `04_SOURCE_MAP.md`; V08, V09, V11). Thin crystal/gaskets remain low-contrast. Plan §3 P3: keep current E1 for first release. | 2/M | Contained. Do not redesign explosion. Optional E1.1 legend/controls only. Lane: PRESENTATION_ANNEX (optional) / V2_DEFER for movement-only explode. |
| F07 | 2/M | SOURCE_REFUTED_BUT_READ_FAILURE | `02_PRODUCT_TRUTH.md` “Supported cushion chapter with 12 marker stations, cardinal emphasis, and a distinct 12 marker.” `source/src/readoutSpec.ts` widths above. Whole-object V03/V05 still read as four dots + hair ticks. | 2/H | Merge with F02 for closeout. Chapter exists; catalog-size frames must show all 12 stations without turning the face into a dial. Lane: PRESENTATION_ANNEX. |
| F08 | 1/M | SOURCE_REFUTED_DROP | `02_PRODUCT_TRUTH.md`: separate bezel, midcase, waist, caseback, carrier/closure. Horizontal bands in V10/V05 are the certified stack, not leftover construction. | 1/L | Drop as a defect. No case-profile redesign. If recapture can express the stack as designed facets, that is presentation only. Lane: NONE. |

## Score reconciliation

| Dimension | Blind | Context | Delta | Why/evidence |
| --- | ---: | ---: | ---: | --- |
| Identity and coherence | 4 | 4 | 0 | Unsigned 2.4 Hz / two-hand / warm-mass thesis in `02_PRODUCT_TRUTH.md` matches the visual language already seen. Rear copy exists but is poorly read in V06. |
| Wearable-object legibility, including case/lug/strap junction | 2 | 3 | +1 | Source proves horn lugs, FKM heads, spring bars, buckle (`strapSpec.ts`, Product Truth). Images still fail the wearable read, so the dimension is no longer “major revision of a stand object,” but remains unresolved presentation. |
| Time-reading clarity | 3 | 3 | 0 | Two hands and 12 stations are specified and present; whole-object frames still do not make them glanceable against the gold barrel (`readoutSpec.ts`, Known Open Items). |
| Spatial depth and mechanical hierarchy | 4 | 4 | 0 | Certified Z stack and E1 layering (`02_PRODUCT_TRUTH.md`, V08/V11) confirm the blind depth read. |
| Case, crown, and sapphire credibility | 3 | 3 | 0 | Crown flutes/shoulder exist (V10 + Product Truth). Planar sapphire is real but optically mute in assembled frames. |
| Movement-detail and finishing credibility | 3 | 3 | 0 | Train, jewels, hairspring, and two remaining mesh defects are source-real (`03_KNOWN_OPEN_ITEMS.md`). Macro finish still reads visualization-grade. |
| Material and lighting realism | 3 | 3 | 0 | Frozen dark 5D-C studio; banding on V10 persists. Not a materials rewrite. |
| Exploded-assembly clarity | 3 | 4 | +1 | V11 fixed-camera 0–1 strip plus Product Truth E1 contract improve part order; thin glass/gaskets remain the weak edge. |
| Composition and product presentation | 4 | 4 | 0 | Coverage is good; strap/sapphire/identity communication is the gap, not framing variety. |
| Overall release readiness | 3 | 3 | 0 | P0 mesh penetrations plus unresolved presentation reads keep it at “credible but materially unresolved.” |

## Newly discovered source truths

Maximum five. Mark each assertion `verified` or `documented-only`.

| N-ID | Finding | Exact citation | Verified vs documented | Impact |
| --- | --- | --- | --- | --- |
| N01 | Rear identity line is “2.4 Hz · 17 280 · TWO HANDS”, not sample/no-hands copy. | `source/src/identity.ts` `REAR_IDENTITY_COPY`; `02_PRODUCT_TRUTH.md` Product identity | verified (source string) | Drops F04’s sample claim; requires V06-class frames to render that exact line legibly. |
| N02 | Two train pairs still have documented rendered tooth penetration: barrel 80T ↔ center pinion 12T; fourth 56T ↔ escape pinion 7T. Center 64T/third 10T and third 60T/fourth 8T are reported repaired. | `02_PRODUCT_TRUTH.md` Known unresolved mechanical findings; `03_KNOWN_OPEN_ITEMS.md`; `reports/third-fourth-mesh-report.json` pairId third60-fourth8 VALID; `90_CURRENT_CLOSEOUT_PLAN.md` P0 | documented-only (did not re-run triangle sweeps) | PRE_RELEASE/BLOCKER for any “physically exact movement” claim. |
| N03 | Attachment is a wearable 18 mm charcoal FKM strap on case-grown horn lugs with real spring bars; envelope ~31.54 × 29.55 mm, lug-to-lug ~34.17 mm. No stand. | `02_PRODUCT_TRUTH.md`; `source/src/strapSpec.ts` | documented-only (geometry not independently measured) | Reframes F01 as read failure, not missing hardware. |
| N04 | Crystals are planar sapphire assemblies (not domed) with frozen inner/outer boundaries; metal stack ~9.34 mm, full sapphire/package Z ~10.0576 mm. | `02_PRODUCT_TRUTH.md` Existing physical/presentation architecture | documented-only | Caps F03 repair to communication of existing volume. |
| N05 | Native rate 2.4 Hz / 17,280 vph; mechanically driven hour and minute only; no seconds, no claimed keyless works, WR, power reserve, or maison name. | `02_PRODUCT_TRUTH.md` Product identity + Explicit non-claims; `source/src/readoutSpec.ts` seconds: "not-authorized" | verified (spec + truth files) | Public claims must stay inside this box. |

## Plan challenge

| Plan section | KEEP/CHANGE/DROP | Reason | Replacement wording |
| --- | --- | --- | --- |
| P0 — two remaining gear-pair repairs + consolidated mesh matrix | KEEP | Source-confirmed penetrations are the only product-source work that should precede a “final” candidate (`03_KNOWN_OPEN_ITEMS.md`, plan §3 P0). | none |
| P2 — recapture “only if a matched comparison demonstrates a current defect” | CHANGE | Stage-1 + this reconciliation already demonstrate strap, sapphire-volume, chapter/hands, and rear-identity read failures on the supplied current-source frames. Recapture of those four proofs is required, not discretionary. | “Re-capture the accepted 5D-C cameras plus one strap-proof view (loop/buckle/horn gap) and one identity-legible rear. Presentation change remains annex-only; skip only if a matched pair already proves the read.” |
| P3 — ship current E1, defer movement-only explode | KEEP | V11 already communicates axial order; F06 is not a release blocker. | none |
| §5.2 Treat as wearable / do not add a stand | KEEP | Matches N03 and F01 classification. | none |
| §5.3 Do not reopen unsigned two-hand face for 60-tick or seconds | KEEP | F02/F07 are communication of the existing 12-station chapter, not a missing track. | none |
| P4/P5 packaging, licenses, public shell controls | KEEP | Release-engineering items in `03_KNOWN_OPEN_ITEMS.md` are real but outside product form. | none |
| §4 non-priority: no case/lug/sapphire/strap rebuild from screenshots | KEEP | F08 dropped; F01/F03 are reads of existing parts. | none |

## Final ranked actions

Provide exactly five rows.

| Rank | Action | Lane | Evidence | Smallest acceptance test |
| ---: | --- | --- | --- | --- |
| 1 | Close the two remaining rendered tooth penetrations (barrel 80T–center 12T; fourth 56T–escape 7T) with pair-bounded profiles, then one whole-train mesh matrix. | PRE_RELEASE | `02_PRODUCT_TRUTH.md`; `03_KNOWN_OPEN_ITEMS.md`; plan P0 | Named reports show zero unintended volumetric penetration on all four train pairs across a full repeating-cycle rendered sweep; adjacent repaired pairs remain green. |
| 2 | Recapture assembled hero/profile that makes horn lugs, 18 mm FKM heads, strap gap, spring bars, and buckle read as a wearable junction (no stand language). | PRESENTATION_ANNEX | F01; `strapSpec.ts`; V01/V02/V07 | A reviewer who has not read Product Truth names “strap” not “stand” from one whole-object frame at catalog size. |
| 3 | Recapture sapphire-oblique and whole-face frames so planar crystal shoulder/thickness and the 12-station chapter + blue hands remain readable against the gold barrel at normal display size. | PRESENTATION_ANNEX | F02, F03, F07; `readoutSpec.ts`; V03/V05/V07 | At the same pixel size as V01/V03, all 12 stations and both hands are countable and a glass edge is distinguishable from the inner metal ring. |
| 4 | Recapture rear exhibition so `2.4 Hz · 17 280 · TWO HANDS` is unambiguous; keep frozen identity maps. | PRESENTATION_ANNEX | N01; F04 drop; V06; `identity.ts` | The official rear line is readable without guesswork at the supplied 1600×1100 crop. |
| 5 | After P0 + the four proof frames, freeze a new release-candidate source/runtime manifest and refresh packaging; do not distribute stale `release/` ZIPs. | PRE_RELEASE | plan P1/P4/P5; `03_KNOWN_OPEN_ITEMS.md` Release-engineering | One checksummed candidate that cites current combined regression plus the new image suite; old 5D-C ZIPs labeled stale. |

## Preserve/frozen

Silhouette and two-tone case; gold barrel as sole large warm mass; blued two-hand blade-baton readout; 2.4 Hz / 17,280 / TWO HANDS unsigned identity; planar sapphire ownership; horn-lug + 18 mm FKM architecture; certified axes/tooth counts/ratios/Z planes; lever escapement contact law; Phase 4B motion works; Annex E1 at explode=0 identical to assembled; 5D-C camera/light families unless a named annex shows a matched defect.

## Reject/defer

Stand object, seconds hand, 4 Hz / 28,800 claim, 60-tick/lume redesign, domed sapphire, global case rescale, functional keyless/winding, maison/model name, movement-only explosion as a v1 gate, broad material/lighting rewrite, screenshot-driven geometry rebuilds.

## Truthful public claims and nonclaims

Claims that may be made after P0 + proof recapture: unsigned two-hand skeleton wristwatch; 2.4 Hz / 17,280 vph; planar front and rear sapphire; wearable 18 mm FKM on horn lugs; presentation-only axial explosion. Must not claim: water resistance, power reserve, functional winding/setting, seconds display, production tolerances/shock, a verified jewel count, or that the two remaining train pairs are closed until their reports exist.

## Final verdict

proceed after the listed bounded roadmap revisions.  
P0 mesh closeout stays mandatory; P2 recapture must be required proof of strap, sapphire volume, chapter/hands, and rear identity rather than optional art direction; no product-family reopen.