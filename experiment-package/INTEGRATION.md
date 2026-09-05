# Integrating the center-web experiment

Preserve the other watch's current baseline before experimenting. This package
is a preview and must not replace its V1 archive or authority records.

## Minimal source integration

The focused patch adds an optional center-web construction style in
`geometry.ts` and the `centerWebExperiment.ts` helper. All existing geometry
calls retain their original default. Apply the patch only to a matching source
baseline; use `SOURCE_PROVENANCE.json` to compare the checkpoint hashes. If the
other watch has diverged, port those two changes by hand rather than replacing
its movement, spec, materials, or support structure.

After the destination movement exists, opt in explicitly:

```ts
import { createCenterWebExperiment } from "./centerWebExperiment";

const experiment = createCenterWebExperiment(movement.root);
experiment.apply(true);
// Restore before disposing the experiment or movement:
experiment.apply(false);
experiment.dispose();
```

The helper changes only the `center:wheel` geometry. Its material, object
identity, local transform, and motion ownership remain in the destination
movement. Do not run two helpers on the same movement. To reuse the entire
five-arbor preview instead, use `createGoingTrainPreview(materials)` from the
included source index.

## GLB interface

The root is `going-train-core-center-web-preview`. The unchanged child interface
is `barrel_pose` → `barrel_motion`, and the same pattern for `center`, `third`,
`fourth`, and `escape`. Animate motion nodes; pose nodes own fixed arbor axes.
`PIVOTS.json` records the source names, exported names, positions, and initial
motion angles. Preserve root scale `0.001` when using a metre-based scene.

## Evidence boundary

Fresh evidence binds the packaged candidate geometry and current procedural
source, with four complete repeating-cycle tooth-mesh sweeps and local minimum
refinements. Additional evidence checks the study watch's invariant datums and
clearance of altered solids. This is a geometric preview; it does not establish
manufacturing tolerances, structural strength, wear, lubrication, or service life.

The other watch's bridges, plates, and display can differ. Recheck their complete
moving clearance envelope even when importing the same train. Altering tooth
profiles, phase, depth, pivots, or ratios requires new full-cycle mesh sweeps.
Keep any derivative under its own name and evidence manifest. Do not describe
changed source or geometry as the original RC1 train.
