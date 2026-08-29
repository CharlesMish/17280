# Review scoring anchors

Use the same anchors in both stages.

## Dimension score

- **1** — fundamentally fails or materially misleads;
- **2** — obvious major revision required;
- **3** — credible but materially unresolved;
- **4** — release-quality with bounded polish;
- **5** — exceptionally resolved; no material issue visible;
- **N/E** — insufficient evidence in the packet.

Scores are visual judgments unless the context response cites source evidence.
Do not convert `N/E` into a numeric value.

## Finding impact

- **4** — defeats a core category/function or should block visual release;
- **3** — materially lowers perceived quality or understanding;
- **2** — noticeable but contained defect;
- **1** — minor polish.

## Confidence

- **H** — directly visible in two or more views, or source-confirmed in Stage 2;
- **M** — clear in one view;
- **L** — projection, lighting, crop, or ownership remains ambiguous.

## Stage-2 reconciliation classes

- **SURVIVES_VISUAL** — the perceptual issue remains after context;
- **SOURCE_CONFIRMED** — source/report evidence confirms the underlying defect;
- **SOURCE_REFUTED_BUT_READ_FAILURE** — the feature exists, but the images fail
  to communicate it;
- **SOURCE_REFUTED_DROP** — both the technical inference and need for action are
  withdrawn;
- **UNRESOLVED** — supplied evidence cannot decide.

## Stage-2 action lanes

- **BLOCKER** — factual/mechanical or core-use failure preventing release;
- **PRE_RELEASE** — bounded required polish before release;
- **PRESENTATION_ANNEX** — camera/light/UI proof without product redesign;
- **V2_DEFER** — new identity, architecture, or feature;
- **NONE** — no action.

