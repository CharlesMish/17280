# Independent review sequence

This review is intentionally split into two stages.

## Stage 1 — Blind visual review

Use `watch-audit-01-blind-visual-2026-08-27.zip` first.

1. Start a fresh conversation with the reviewer if practical.
2. Upload only the blind ZIP.
3. Paste `01_PROMPT.md`.
4. Ask the reviewer to return a completed `03_RESPONSE_TEMPLATE.md`.
5. Save the response before revealing any source or engineering context.

The blind review is allowed to say what the watch *reads like*. It must not be
treated as proof of geometry, ownership, mechanics, or materials.

## Stage 2 — Context-aware review

After the blind response is saved, upload
`watch-audit-02-context-template-2026-08-27.zip` in the same conversation and
attach that reviewer's own saved Stage-1 response. Never attach the other
reviewer's response.

1. Paste `01_CONTEXT_PROMPT.md`.
2. Confirm no other reviewer's response is present.
3. Ask the reviewer to return a completed `06_RESPONSE_TEMPLATE.md`.
4. Preserve both responses without combining them.

The context review must explicitly reconcile the blind findings with the
current source truth. It should distinguish release blockers, presentation
opportunities, optional V2 ideas, and claims that should be withdrawn.

## Comparing Grok and Claude

Give both models identical ZIPs and prompts. Do not tell the second reviewer
what the first reviewer concluded. Name the returned files clearly, for example:

- `GROK_01_BLIND_VISUAL_AUDIT.md`
- `GROK_02_CONTEXT_RECONCILIATION.md`
- `CLAUDE_01_BLIND_VISUAL_AUDIT.md`
- `CLAUDE_02_CONTEXT_RECONCILIATION.md`

Return those four files to Codex together. Codex can then produce a revised
closeout plan with a traceable disposition for every recommendation.

## Codex synthesis rule

Codex will cluster the two reviews independently before comparing their prose.
A finding is promoted into the revised closeout plan when it is already a
source-known defect, when both reviewers independently score it impact 3 or 4
and it survives context review, or when one reviewer gives it high-confidence
impact 4 and source/context confirms it. A one-reviewer or projection-dependent
concern becomes a matched-camera test rather than an automatic product edit.
Score summaries use medians and ranges and never convert `N/E` into a number.
Strengths independently named by both reviewers are explicitly preserved.

## Important status

These are **review-candidate packets**, not final public-release archives. The
current watch still has two known tooth-profile penetrations documented in the
technical packet. The older ZIPs in `release/` are stale and should not be used.
