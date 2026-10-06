# Cool-mist dial

The default watch uses the selected continuous warmer-mist dial: restrained sunburst,
65% opacity, no balance/barrel viewing apertures, deeper blued hands, and a complete
minute graduation. The necessary spindle bore is beneath the hand hub.

The **Dial** control appears in the main viewer and close-up studio. Choose
**Hide dial · inspect movement** to remove the dial surface and its minute ticks.
The hands and existing chapter markers remain. Switching does not reset the camera,
mechanical timeline, playback, selected view or crystal/ruby mode.

- Default: `?dial=mist` (the default value is omitted from shared URLs).
- Inspection: `?dial=hidden`.
- API: `window.__WATCH__.setDialMode("mist" | "hidden")` and `getDialMode()`.
- State: `releasePresentationReport().dial`.

The dial belongs to the motion-works/readout layer in the exploded view. Engineering
diagnostic views suppress the presentation dial. The broader case and lug geometry
are unchanged.

## Rendering

The dial is 0.15 mm thick at Z 4.25–4.40, with a 0.55 mm spindle-bore radius.
Its finish uses a gentle center-to-edge color graduation, deterministic mipmapped
radial roughness, and anisotropy 0.32. The opacity is an illustrative alpha material,
not a model of a manufacturable translucent metal or frosted-glass scattering.
Dial feet and service access have not been engineered.

The exposed hand blades use the selected width treatment (hour scale 1.09, minute
scale 1.35), fading to the original geometry near their bores. Lengths and mounting
regions remain fixed. The readout audit runs after shaping and verifies containment
within the hand sweep. The report includes the width scales and measured extents.

Stock Three.js draws transparent objects after transmissive objects. Without special
handling, an alpha dial can appear in the sapphire's complete interior texture and
then be blended over the crystal a second time. The optics renderer writes crystal
depth during the final pass when an alpha interior is visible. The later transparent
pass then draws only uncovered portions, including exposed areas in the exploded
view. The sapphire already contains the complete interior beneath it. Temporary
depth-write and renderer states are restored after every render. Opaque-ruby mode
also receives the complete interior when the dial is shown; hidden-crystal mode
renders the alpha dial normally.

## Verification

```sh
npm run build
npm run verify:crown
node scripts/test-dial.mjs http://127.0.0.1:5301/ captures/dial-check render
node scripts/test-dial.mjs http://127.0.0.1:5301/ captures/dial-check ui
node scripts/test-dial.mjs http://127.0.0.1:5301/ captures/dial-check film
```

The browser checks cover the default, exact pixel restoration after hiding/showing,
camera and playback preservation, all crystal/ruby modes, readout containment,
rear/exploded views, reassembly, URL/control synchronization and mobile layout.
Saved design comparisons under `captures/` remain local historical artifacts;
their injection scripts target their recorded source revision, not the new default.
