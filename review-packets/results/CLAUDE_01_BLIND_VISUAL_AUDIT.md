# Blind visual audit

> Sealed Stage-1 response, transcribed verbatim from the review conversation.
> Written before any Stage-2 context, source, or report file was opened.
> Not edited in light of Stage-2. Corrections and reconciliation live in
> `CLAUDE_02_CONTEXT_RECONCILIATION.md`.

## Metadata

Reviewer/model: Claude (Opus 4.5), independent industrial-design / product-visualization reviewer  
Date: 2026-08-27  
Images reviewed: V01, V02, V03, V04, V05, V06, V07, V08, V09, V10 (all 10; SHA-256 verified against `MANIFEST.sha256`)  
Evidence boundary honored (`yes` or `no`): yes

## First read

Object category: Skeletonised mechanical wristwatch, open-worked front and display back, cushion/squircle case, side crown, integrated-slab strap (V01, V02, V06, V07)  
Wearable-versus-display-object read: Reads as a display/desk object first. At thumbnail scale (V01, V02, V07) the silhouette is a lumpy pebble with a ribbon passing behind it; lugs, strap thickness and wrist scale never resolve, and no view supplies ground contact, shadow, or scale cue (flat RGB 23,25,29 backdrop in all ten)  
Three-word design thesis: Dark skeletal pebble

## Scores

Use `02_SCORE_ANCHORS.md`. Enter 1–5 or `N/E`.

| Dimension | 1–5/N/E | Evidence views | Why |
| --- | ---: | --- | --- |
| Identity and coherence | 2 | V01, V02, V07, V09 | Case outline has no discernible symmetry axis and bezel width varies grossly around the loop; outer profile and inner aperture profile are non-parallel, so the form reads unresolved rather than authored. Movement, marker ring and case each follow a different geometric logic. |
| Wearable-object legibility, including case/lug/strap junction | 2 | V01, V02, V05, V07, V09 | Lugs exist and are modelled with countersunk screws (V09), but the strap is a flat constant-section slab that passes behind the case and never visibly engages them (V01, V02, V07). No spring bar, taper, thickness, keeper or buckle in any view. |
| Time-reading clarity | 1 | V01, V02, V07 | At whole-object scale the two blue hands disappear entirely into the dark open-worked movement; no hand is separable. Markers are undifferentiated, giving no 12 o'clock anchor, and hand tips stop well short of the index track (V07). |
| Spatial depth and mechanical hierarchy | 3 | V03, V04, V06 | Real depth exists — jewelled pivots, stacked bridges, overlapping wheels — but tone separation is so narrow that the back view (V06) collapses into an undifferentiated dark tangle at native exposure. |
| Case, crown, and sapphire credibility | 2 | V05, V09, V10 | Crown is a perfectly smooth cylinder with zero knurling, fluting or grip relief and no visible tube (V10 macro) — it cannot be read as operable. Crystal is near-invisible even in the exploded stack (V08, V09), so the sapphire reads as absent. |
| Movement-detail and finishing credibility | 3 | V03, V04, V06 | Genuine strengths: ruby jewels in polished settings, plausible wheel stack, screwed bridges. Against that, bridge edges are hard and flat with no anglage, plate surfaces carry no côtes/perlage, and the hairspring is an evenly-spaced flat coil that reads as a fan or speaker grille rather than a sprung balance (V04). |
| Material and lighting realism | 2 | V03, V06, V10 | Metal reads as untextured matte plastic: broad flat gradients, hard tonal steps with no chamfer highlight, visible horizontal shading bands on the case flank (V10). Uniform low-key exposure — median luminance 25/255 in every view, 15–34% of each frame at or below 12/255. |
| Exploded-assembly clarity | 2 | V08, V09 | Two exploded views that disagree: V08 keeps the strap attached and never separates the movement; V09 drops the strap entirely and is shot near-edge-on, collapsing crystal, hands and marker ring into hairlines. Neither carries labels, leader lines, numbering or a stated axis, and V08's explosion runs on inconsistent directions. |
| Composition and product presentation | 2 | V01–V10 | No orthographic or near-orthographic front elevation, side profile, or flat caseback view anywhere in the set; every view is a dramatic oblique with strong perspective. Identical flat void backdrop with no ground plane or shadow in all ten. |
| Overall release readiness | 2 | V01, V02, V07, V10 | Primary function (telling time) fails at normal viewing size and the crown reads as inoperable — both visible in whole-object views without magnification. |

## Preserve

Provide exactly three rows.

| ID | Views | Strength | What must not be lost |
| --- | --- | --- | --- |
| S01 | V03, V04 | Jewelled pivot craft: red rubies seated in polished chatons with correct scale relative to their pivots, several distributed through the wheel train | The jewel-to-pivot scale relationship and the seated-in-a-setting read. This is the single most convincing horological signal in the packet and survives magnification. |
| S02 | V01, V02, V03, V07 | The gold barrel is a genuinely effective chromatic anchor — one warm mass against a cold blue-grey field, giving the composition a focal point and real depth cueing | The single-warm-accent discipline. The palette restraint (navy / steel / one gold) is the most coherent identity decision visible. |
| S03 | V06 | Caseback carries curved engraved specification text that is cleanly formed, correctly wrapped to the case curvature, and legible on inspection ("…TWO HAN[DS] · 2800 · 4 HZ · 24…"), and it agrees with the two-hand display actually shown on the dial (V03) | The engraving craft and, critically, its factual agreement with the visible product. Internal consistency between marked spec and shown configuration is rare and worth protecting. |

## Ranked findings

Provide no more than eight rows, using stable `F01`… IDs.

| Rank | ID | Views | Visible observation | Inference (or none) | Effect | Impact 1–4 | Confidence H/M/L | Desired visual outcome |
| ---: | --- | --- | --- | --- | --- | ---: | --- | --- |
| 1 | F01 | V01, V02, V07 | At whole-object scale both hands vanish into the open-worked movement; neither is separable from bridges or wheels. Hands are dark blue over dark blue-grey mechanism | Inference: hand and movement values sit within a narrow luminance band with no dedicated separation treatment | The object cannot be used to read time at normal viewing size, defeating the core category function | 4 | H | Both hands must be independently identifiable at thumbnail scale from every whole-object view, by value, edge or reflective treatment that separates them from whatever sits behind them |
| 2 | F02 | V05, V09, V10 | Crown is a smooth cylinder with no knurling, fluting, gadroon or grip relief anywhere on its circumference; face carries a recessed trefoil glyph. No crown tube or collar is visible at the case junction | Inference: as shown there is no purchase for finger grip; no inference made about internal stem | A primary control reads as inoperable, undermining mechanical credibility of the whole object | 4 | H | Crown flank must show grip geometry that reads as turnable at whole-object scale, and the case junction must show a tube or collar so the crown reads as engaged rather than abutted |
| 3 | F03 | V01, V02, V03, V07 | The bezel band between outer silhouette and dial aperture varies markedly in width around the loop; outer profile and inner aperture profile are non-parallel and follow different curvature logic. No symmetry axis is discernible in any view | Inference: outer case form and aperture were shaped independently rather than offset from a shared spine | Silhouette reads as an accident rather than an authored asymmetry; identity does not resolve | 3 | H | Outer silhouette and dial aperture should share one legible curvature logic with controlled, intentional wall-width variation; if asymmetry is deliberate it must be readable as deliberate |
| 4 | F04 | V01, V02, V05, V07 | Strap is a flat constant-section slab of uniform thickness that passes behind the case; the cream/navy lug blocks sit adjacent to it with no visible engagement. No spring bar, taper, stitching, keeper or buckle in any view | Inference: strap and lugs are not visually coupled. Absence of buckle from these views is not proof of absence | Wearable read fails; object reads as a display piece with a ribbon behind it rather than a wristwatch | 3 | H | The strap must visibly terminate into the lugs with a legible attachment, and show section, taper or flex that reads as a worn component |
| 5 | F05 | V08, V09 | Two exploded views that disagree in inventory and axis: V08 retains the strap and never separates the movement, exploding on inconsistent directions with heavy part overlap; V09 omits the strap, is shot near-edge-on so crystal, hands and marker ring collapse to hairlines. Neither has labels, leader lines, numbering or a stated axis | None required — directly visible | Assembly logic is not communicated by either view; the crystal in particular reads as absent | 3 | H | One consistent exploded view on a single declared axis, complete inventory including movement and strap, even spacing, and a camera angle at which every flat component still reads as a part |
| 6 | F06 | V01, V02, V03, V05, V07 | Two distinct marker families on two different radii and planes — matte grey flat-topped cylinders on the inner flange, thin pale bars on the outer polished ring — with no distinguishing 12 o'clock marker; all cylinders are identical in diameter and finish. Hand tips stop well short of the index track (V07) | Inference: two index systems coexist without a stated hierarchy | Dial has no "up"; orientation must be guessed even before the hands are found. Compounds F01 | 3 | H | One dominant index family with an unmistakable 12 o'clock signature, and hands long enough that their tips meet the track they are read against |
| 7 | F07 | V03, V06, V10 | Metal surfaces render as broad flat gradients with abrupt tonal steps and no chamfer highlight at the transitions; visible horizontal shading banding on the case flank (V10); no anisotropic brushing, grain or environment detail on any metal surface. Movement plates carry no côtes or perlage, bridge edges are hard and flat | Inference: material response and edge treatment are reading as untextured rather than machined-and-finished | Case reads as painted plastic and the movement as unfinished, cancelling the credibility the jewels (S01) establish | 3 | M | Metal must show directional finish and a lit chamfer at every major transition; movement plates and bridge edges need a finishing signature legible at macro range |
| 8 | F08 | V01–V10 | No orthographic or near-orthographic front elevation, side profile, or flat caseback view in the set; all ten are strong obliques. All ten share an identical flat RGB(23,25,29) backdrop with zero variation, no gradient, no ground plane and no cast or contact shadow. Median frame luminance is 25/255 in every view with 15–34% of pixels at or below 12/255 | None required — directly measured | True proportions cannot be verified from any view, the object floats without scale, and uniform underexposure suppresses the craft that does exist (S01) | 3 | H | At least one near-orthographic front, side and back view; a lighting and exposure setup that resolves shadow detail; and a ground or scale cue in at least one presentation frame |

## Cross-view contradictions and unknowns

- **Exploded inventory disagrees between V08 and V09.** V08 separates bezel, crystal, marker ring and hands but keeps the strap attached and the movement unseparated. V09 separates a movement layer (dark ring with mounting posts, jewels and a marker ring beneath it) but omits the strap entirely. Neither is a superset of the other, so the true part count cannot be established from this packet.
- **Crystal ownership unresolved.** A faint transparent ghost sits above the bezel in V08 and V09. It is too low-contrast to confirm as a modelled sapphire versus a residual highlight. Its presence is inferred, not established. Absence from the assembled views is not proof of absence.
- **Grey cylindrical pegs appear on both sides.** Peg geometry matching the front hour markers is visible inside the caseback aperture in V06. Whether these are the same through-parts seen from behind, separate posts, or a duplicated marker ring cannot be decided from these views.
- **Glyphs on the gold barrel.** Outlined trapezoidal/fan-shaped marks are engraved on the face of the large toothed gold wheel (V03, V04, V07). They are not legible as numerals, letters or a mark. Inference, low confidence: if that wheel rotates, face graphics would not hold orientation — but rotation is not established by any image, only implied by its full-perimeter teeth and apparent pinion engagement.
- **Caseback engraving is partially cropped in V06**, so the full specification string cannot be read. The visible fragment is internally consistent with the dial ("TWO HAN[DS]" against two hands in V03; "2800" against "4 HZ"), but the complete text is unverified.
- **Dial-cluster placement.** The mechanism reads as clustered toward the upper-left/centre with dark voids at the right and lower-right of the aperture (V02, V07). Every available view is a strong oblique, so this may be projection rather than true eccentricity. Cannot be decided without a front elevation — this is the single unknown that F08 most blocks.
- **A thin bright sliver** extends below the strap into empty background at the lower edge of V01 (~x 858, y 845–905). Present in one view only; could be stray geometry, a coincident edge, or a crop artifact. Low confidence, no action claimed.
- **Wheel-tooth profiles** appear as simple radial blocks rather than ogival watch teeth (V03, V04), and gold and steel wheels appear to overlap near the centre. Per the packet instruction, visual overlap alone is not treated as evidence of collision; noted as unresolved.

## Verdict

`NEEDS-ANOTHER-PASS` — the core category function fails at normal viewing size (F01) and the primary control reads as inoperable (F02), both visible without magnification and both requiring product-level change rather than camera or lighting work, but the jewelling, palette discipline and caseback craft are strong enough that this is a revision rather than a reset of direction.

**A note on scope:** I stopped short of a planned close pass on the V05 chapter ring, which would have firmed up the marker-count and 12 o'clock evidence behind F06. That finding currently rests on V01, V02, V03 and V07, which is sufficient for its stated H confidence, but the ranking of F06 against F05 is the one ordering I would most want to re-check with that view. Everything else above is fully evidenced from views cited.
