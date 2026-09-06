# Crystal and ruby rendering

The **Crystal & rubies** selector works in the public watch and close-up studio.
It redraws the current scene without a reload or camera/time reset. The choice is
shareable through `?optics=translucent`, `?optics=opaque` or `?optics=hidden`.

- **Translucent rubies** (default): renders the complete interior into a linear,
  half-float texture before the sapphire is drawn. Rubies retain their original
  physical material, transmission, attenuation and geometry.
- **Opaque rubies**: uses cached reflective material copies with transmission
  disabled, opacity one and alpha blending disabled. Sapphire retains its normal
  stock transmission. Original material assignments restore after each draw.
- **Hide crystal**: temporarily hides front and rear sapphire while rendering,
  retaining the original translucent ruby appearance. Mesh visibility restores
  after the draw, so camera changes and assembly-layer selection remain independent.

## Why the extra pass is needed

Three.js WebGL transmission normally captures opaque objects for its background
texture. Translucent ruby front faces are absent from that texture. Sapphire can
overwrite a previously drawn ruby with the dark bearing behind it. Sorting by
object bounding-sphere centers changes the draw order as the camera orbits, making
the ruby appear and disappear. This was reproduced with the mechanism frozen.

`src/optics.ts` supplies the sapphire shader with an interior texture containing
the rubies. It retains the existing stock refraction, attenuation, roughness and
reflection calculations. Sapphire draws after the gemstones with ordinary depth
testing, so its reflection also covers them. This is paired with the complete
interior texture; changing draw order alone would not fix the missing background.

The interior pass hides sapphire, uses no tone mapping and renders at the current
drawing-buffer resolution. The final display applies tone mapping once. The render
target resizes with the canvas. Devices without float color-target support use
an unsigned-byte fallback, with less highlight range. Renderer target/tone mapping, crystal visibility
and draw order, and opaque-mode material assignments restore in `finally` blocks.
Mechanical time advances only once per displayed frame.

The corrected translucent mode costs an additional scene render. Opaque and hidden
modes skip that extra pass. This remains a screen-space optical approximation:
it does not implement arbitrary recursive refraction through multiple gemstones
and both crystals. Camera-inside-glass views retain the existing front-face
culling behavior; the explicit hidden mode provides a predictable inspection view.

## Verification

```sh
npm run build
npm run dev -- --port 5301
node scripts/test-optics.mjs http://127.0.0.1:5301/ captures/optics-check
npm run verify:crown
```

The browser check samples the old balance-jewel sorting transition at fixed time,
requires visible ruby pixels in every mode, checks exact restoration after toggling,
and saves front/rear/exploded comparisons. It checks camera, physical geometry and
original material preservation, public and studio selectors, URL restoration,
mobile layout and browser errors. Software-rendered evidence does not establish
frame rate on a user's GPU. Historical crown and sapphire studies retain their
original images; fresh film exports use the selected optics mode.
