# Center-wheel web preview package

This directory contains the packaging overlay for a separately named experimental
going-train core. It never updates the V1 release or its authority records.

Build only after fresh experiment evidence passes:

```sh
node scripts/package-train-experiment.mjs --evidence review/experiments/train-design/evidence/center-web/package-evidence.json --output /tmp/train-design-deliverables
```

The evidence JSON must use `watch.train-design-evidence.v1`, select `center-web`,
bind the current procedural source files and all four full-cycle mesh reports by
SHA-256, and include the center-wheel geometry hash and passing invariant/clearance
evidence. The packager verifies those inputs, exports the exact opt-in geometry,
type-checks the standalone source, reloads the GLB, and creates an archive with
internal and external checksums. The GLB and source preserve the five original
pose/motion pivot names. Preview files carry their own provenance; changed bytes
are never described as RC1.

The existing `package:train-core` command retains its original RC1 source gates.
Its only change is correcting the location of the existing V1 template directory.
