# Going-train core: center-web preview

This is a separately named design experiment, **not an RC1 release**. Only the
center wheel's interior web/windows change. The tooth profiles, counts, phase,
hub, bore, rim, depth slabs, arbor pivots, and signed ratios stay fixed. The
original V1 package is independent and remains available unchanged.

- `assets/going-train-core.glb`: portable five-arbor preview with named pivots.
- `source/`: procedural source plus an explicit opt-in preview constructor.
- `CORE_SPEC.json`, `PIVOTS.json`: geometry, coordinates, motion, and fresh evidence.
- `INTEGRATION.md`, `integration/center-web.patch`: focused integration delta.
- `evidence/`: the fresh four-pair sweep reports and invariant/clearance evidence.
- `SOURCE_PROVENANCE.json`, `MANIFEST.json`, `SHA256SUMS.txt`: source binding and integrity.

```ts
import { createMaterials, createGoingTrainPreview } from "./source/index";

const materials = createMaterials();
const { movement, core, experiment } = createGoingTrainPreview(materials);
scene.add(core.root);
movement.update(0); // Continue calling with elapsed seconds to animate.
// Optional comparison: experiment.apply(false); experiment.apply(true);
```

Source coordinates use millimetres; GLB world coordinates use metres through
the retained root scale of `0.001`. The GLB uses texture-free portable PBR
materials. Use the included browser material factory or the destination watch's
own compatible materials for appearance; the package does not prescribe a new
palette for either watch.

After installing the pinned dependencies, run `npm run check` to type-check the
source and reload the supplied GLB. Source changes or a new support structure
need new clearance evidence. The original V1/RC1 authority does not certify this
preview or the destination watch. See `PROJECT_RIGHTS.txt` and
`THIRD_PARTY_NOTICES.txt` for the private design-source terms.
