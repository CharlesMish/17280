# 17280

An unsigned two-hand skeleton wristwatch. The name is the rate: **2.4 Hz /
17,280 vph**, already written on the caseback as `2.4 Hz · 17 280 · TWO HANDS`.

This repository is an interactive Three.js presentation of that model. The
production bundle is a fully static site: it does not require a database, server
application, account, or external asset service.

The modeled product uses explicit ratio-linked and Z-stacked train ownership, a
lever escapement, front and rear planar sapphire, horn lugs, spring bars, and an
18 mm charcoal FKM strap. It is a visualization, not a production-tolerance,
water-resistance, shock, winding/setting, power-reserve, or marketing jewel-count
certification.

## Run the project

Development requirements: Node.js `^20.19.0` or `>=22.12.0`, plus npm.
The release-packaging command additionally requires Info-ZIP `zip`/`unzip`,
the Chromium, Firefox, and WebKit browsers installed for Playwright, and an npm
cache or registry connection sufficient for the extracted clean-room `npm ci`.

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:5173/>.

## Build and verify

```sh
npm run build
npm run verify:authority
```

The production site is written to `dist/`. Asset paths are relative, so the
same tested build can be hosted at a domain root or a path such as `/watch/`
or `/17280/`.

## Host it

GitHub Pages builds `dist/` from `main` via `.github/workflows/pages.yml`.
The public URL is `https://charlesmish.github.io/17280/`.

To put it on your own site, build and upload the contents of `dist/`:

```sh
npm ci
npm run build
```

Or extract `release/watch-static-site-rc1.zip` if you still want the frozen RC1
bytes. See [DEPLOYMENT.md](DEPLOYMENT.md) for headers, checksums, and rollback.

The current working tree includes public-shell cameras (Hero / Front / Wearable /
Rear) that landed after RC1. Use `npm run build` for the named watch as it is
now.

The release-only `npm run audit:runtime` command records the public shell's
startup/frame/resource behavior, ten explode cycles, resize/orbit/zoom, and
WebGL context loss/restoration on the local software-rendered evidence host. It
refuses to overwrite an existing authority report. `verify:authority`
intentionally fails until all RC1 mechanical, runtime, and
Release Annex R1 evidence exists and is accepted. The current RC1 authority is:

- `captures/rc1/final-regression-report.json`
- `captures/rc1/executable-source-manifest.json`
- `captures/rc1/executable-runtime-reference.json`
- `captures/rc1/public-runtime-quality.json`
- `captures/rc1/mechanical/consolidated-train-matrix.json`
- `captures/release-annex-r1/report.json`

Historical Phase 5D-C and Annex E1 reports remain immutable history; they are
not relabeled as the current executable authority.

## Make release packages

```sh
npm run package
```

Packaging first verifies RC1, builds the site, emits a CycloneDX SBOM, creates
each archive twice, requires byte-identical SHA-256 hashes, rejects unsafe ZIP
paths, extracts and verifies every manifest row, smoke-tests the static site at
`/` and `/watch/` in every requested browser, and clean-room rebuilds the source
handoff. It produces:

- `release/watch-static-site-rc1.zip`
- `release/watch-source-handoff-rc1.zip`
- `release/watch-release-evidence-rc1.zip`
- `release/STATIC-SMOKE-RC1.json`
- `release/CLEANROOM-RC1.json`
- `release/SHA256SUMS-RC1.txt`

Existing stale pre-RC1 archives must not be distributed. See
[DEPLOYMENT.md](DEPLOYMENT.md) for local viewing, hosting, security headers,
checksums, and rollback.

## Rights and dependencies

The watch project is currently all-rights-reserved; see
[PROJECT_LICENSE.txt](PROJECT_LICENSE.txt). Third-party software retains its
own licenses, including the bundled Three.js MIT notice in
[THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt). The release SBOM and the
timestamped [dependency audit](SECURITY_AUDIT.md) accompany the packages.
Release scope and nonclaims are recorded in
[KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).
