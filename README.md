# 17280

**17280** is an interactive study of an unsigned two-hand skeleton wristwatch.
The name is the movement rate: **2.4 Hz / 17,280 vph**, echoed on the caseback as
`2.4 Hz · 17 280 · TWO HANDS`.

[Open the live watch →](https://charlesmish.github.io/17280/)

This began as a first watch-design prototype: a small workshop object for exploring
how far a mechanically informed watch could be modeled, reviewed, repaired, and
presented directly in Three.js.

The model includes a ratio-linked, Z-stacked going train, lever escapement,
mechanically driven hour and minute hands, front and rear planar sapphire, horn
lugs, spring bars, and an 18 mm charcoal FKM strap. The interaction layer adds
preset views and an exploded assembly study.

It is a **visualization**, not a fabrication package or physical qualification.
No production-tolerance, water-resistance, shock, power-reserve, functional
winding/setting, or jewel-count certification is claimed. See
[KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) for the precise boundaries.

## Explore

The public view supports:

- **Hero / Front / Wearable / Rear** preset cameras
- **Assembled / Exploded** views
- drag to orbit and scroll or pinch to zoom
- pause/resume and view reset
- keyboard controls and reduced-motion behavior

The site is a fully static Three.js build with no account, database, server
application, or external asset service required at runtime.

## Run locally

Requires Node.js `^20.19.0` or `>=22.12.0` and npm.

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:5173/>.

To make a production build:

```sh
npm run build
```

The static site is written to `dist/`. GitHub Pages builds that directory from
`main` using `.github/workflows/pages.yml`.

## A note on the engineering archive

This repository also preserves the unusually thorough development and review
trail behind the prototype: mechanical audits, visual-review packets, closeout
plans, regression tooling, and release scripts.

Those files are useful as **development history**, but they are not all statements
about the current public build. In particular, documents under `review/` and
`review-packets/`, plus the `POST5D_*` closeout plans, capture earlier review
states and may mention findings that were subsequently repaired or superseded.
The current public description and [RC1 release notes](RELEASE_NOTES_RC1.md) take
precedence when those historical documents disagree with later state.

Some release scripts refer to local evidence/archive directories that were part
of the closeout workspace but are intentionally not included in this public
repository snapshot. The ordinary public build does **not** require them.

## Rights and dependencies

The project currently carries an all-rights-reserved notice in
[PROJECT_LICENSE.txt](PROJECT_LICENSE.txt); third-party software keeps its own
licenses. See [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt) and the
timestamped [dependency audit](SECURITY_AUDIT.md).
