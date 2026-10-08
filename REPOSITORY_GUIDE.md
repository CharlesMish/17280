# Repository guide

Start with the [README](README.md) to [open the watch](https://charlesmish.github.io/17280/),
run it locally, use the inspection controls and read the rights notices.
This map adds navigation without relocating release records or evidence.

## Current design and use

| Read | Purpose |
| --- | --- |
| [Known limitations](KNOWN_LIMITATIONS.md) | Boundaries of the mechanically informed visualization. |
| [Dial](DIAL.md) | Current mist dial and movement-inspection control. |
| [Optics](OPTICS.md) | Crystal and ruby rendering. |
| [Graphite finish](GRAPHITE_FINISHING.md) | Surface treatment and its design context. |
| [Crown refinement](CROWN_REFINEMENT.md) | Crown shading repair and matched observations. |
| [Filming](FILMING.md) | Deterministic captures and export commands. |
| [Deployment](DEPLOYMENT.md) | Build and Pages publication workflow. |

## Historical engineering and release records

- [Review index](review/README.md): earlier technical-truth snapshots and reviews.
- [POST5D closeout plan](POST5D_CLOSEOUT_PLAN.md) and
  [revised August 27 plan](POST5D_CLOSEOUT_PLAN_REVISED_2026-08-27.md): milestone
  scope and closeout decisions, not a fresh implementation assignment.
- [Review packets](review-packets/): packaged review records and their checksum inventory.
- [Graphite/sapphire checkpoint index](review/checkpoints/graphite-sapphire/README.md):
  retained checkpoint lineage and the boundary for generated bundles.
- [RC1 release notes](RELEASE_NOTES_RC1.md): the recorded release scope and limitations.

Older records may describe a previous dial or unrepaired findings. Read them
alongside the current README and the specific design note. Release scripts refer
to these paths and some records are checksum-bound; do not move, rewrite or
regenerate them just to tidy the repository. Missing local captures are not
reproducible evidence merely because a report names them.

## Proposing a change

Use a focused branch from `main` and a pull request describing the intended
change, checks performed and remaining limitations. The README lists build and
collision-audit commands. Keep mechanical claims separate from rendering and
human inspection; automated checks do not establish manufacturing readiness.
