# RC1 packaging and deployment

## Choose an artifact

Use `release/watch-static-site-rc1.zip` to show or host the watch. Extract it
and upload the **contents of its single top-level directory** to a static host.
No server-side code, secret, account, or runtime network service is required.

Use `release/watch-source-handoff-rc1.zip` when a collaborator needs to inspect
or build the exact RC1 source. After extraction:

```sh
npm ci
npm run build
npm run verify:authority
```

Use `release/watch-release-evidence-rc1.zip` for a compact audit handoff. It
contains current RC1 and Release Annex R1 evidence without the much larger
historical working-capture archive.

## Local viewing

Do not double-click `index.html`; browsers restrict module loading from
`file://` URLs. In the extracted static archive, use:

- Windows: `serve-local.bat`
- macOS/Linux: `sh serve-local.sh`

Then open <http://127.0.0.1:8080/>. The launchers use Python's small static
server. They do not send the model or usage data elsewhere.

## Hosting the tested bytes

The Vite build uses relative assets and is tested at both:

- `https://example.com/`
- `https://example.com/watch/`

Upload the verified static bytes directly. Do **not** ask the hosting service
to rebuild from source. Configure the host to serve JavaScript as
`text/javascript`, use HTTPS, and do not add an SPA fallback rewrite; the site
has no client routes.

The static archive supplies `_headers` and `headers.json` examples covering:

- a same-origin-only Content Security Policy;
- `X-Content-Type-Options: nosniff`;
- a strict referrer policy and narrow Permissions Policy;
- `no-cache` for `index.html`;
- one-year immutable caching for hashed `/assets/*`.

Translate these examples into the syntax required by the chosen host. Retest
the deployed URL after doing so. If the watch is intentionally embedded from a
different origin, make a narrow `frame-ancestors` decision rather than dropping
the rest of the policy.

## Browser, motion, and fallback behavior

The public shell exposes Assembled/Exploded, Pause/Resume, Reset view, keyboard
focus, and touch-sized controls. It respects `prefers-reduced-motion`. A static
hero poster and textual fallback remain available when WebGL cannot start;
`noscript` supplies a separate JavaScript-disabled message.

The packaged smoke test requires every Playwright engine named by
`WATCH_BROWSERS` (Chromium, Firefox, and WebKit by default) to be installed and
to pass; an unavailable or unknown requested engine fails closed. Packaging
also requires Info-ZIP `zip`/`unzip` and npm access or a populated cache for the
extracted clean-room `npm ci`. Hardware Safari/iOS and Android checks are manual
release evidence when available. Only the exact pre-existing Three.js
`computeTangents()` diagnostic is allowlisted; any other console, page, request,
or HTTP failure blocks packaging.

## Integrity

Keep `release/SHA256SUMS-RC1.txt` beside the archives. Verify before transfer or
deployment:

```sh
sha256sum -c SHA256SUMS-RC1.txt
```

macOS:

```sh
shasum -a 256 watch-static-site-rc1.zip
```

PowerShell:

```powershell
Get-FileHash .\watch-static-site-rc1.zip -Algorithm SHA256
```

Each archive also contains `release-manifest.json` and an internal
`SHA256SUMS.txt` for every staged file. `STATIC-SMOKE-RC1.json` records the
root/subpath browser exercise against the extracted static bytes, while
`CLEANROOM-RC1.json` records the extracted source install/build/authority gate.

## Deployment smoke and rollback

After upload, verify the canonical URL and any subpath/query form, then check:

1. a stable nonblank first frame;
2. orbit and zoom;
3. Assembled → Exploded → Assembled;
4. resize and a mobile viewport;
5. reduced-motion mode;
6. no unexpected browser-console or failed-network entries;
7. deployed asset hashes against the tested archive.

Retain the previous verified static archive and checksums. Rollback is simply
restoring those exact bytes; do not rebuild during an incident.

## Rights and truthful scope

The current watch project is all-rights-reserved. Distributing a review copy
does not grant permission to publish or modify it; see `PROJECT_LICENSE.txt`.
The Three.js MIT notice and dependency SBOM ship in the static/source packages.

Public language should say “mechanically informed two-hand skeleton wristwatch
visualization.” Do not claim production tolerances, water resistance, shock
qualification, functional winding/setting, a certified power reserve, or a
verified marketing jewel count.
