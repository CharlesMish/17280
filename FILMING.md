# Filming 17280

Run `npm run dev`, then open <http://127.0.0.1:5173/?film=balance>.
The optional Close-up studio opens with a still frame. Select a subject and
choose **Play take**, or scrub the six-second timeline. **Restart** restores
the authored start; dragging or zooming pauses the take so you can compose
manually. Playback follows the authored camera path.

Space plays or pauses when focus is on the canvas; Home restarts; H hides or
shows the controls. Buttons retain their normal keyboard behavior. Each shot
has a link, for example `?film=crown`. Motion starts only when requested.

| Link parameter | Subject | Camera move |
| --- | --- | --- |
| `?film=balance` | Oscillating balance and blue spring | Shallow arc and gentle approach |
| `?film=hands` | Blue hands, center hub and gold barrel | Slow push with a small arc |
| `?film=crown` | Crown face, flutes and case shoulder | Short orbit |
| `?film=sapphire` | Crystal and polished bezel | Grazing sweep |
| `?film=strap` | North horn, spring-bar end and FKM strap | Close orbit |
| `?film=rear` | Caseback rim and exhibition movement | Gentle approach |

These are compositions of the current graphite-finish watch, using its
existing product views and lighting. The visible movement advances at its
normal simulated rate; the blue hands use the existing 10:10 presentation
pose. The camera movement eases at the beginning and end of each six-second
take. Framing is authored for landscape; a narrower window crops more closely.

## Export clips

The export script requires the existing Playwright Chromium installation and
`ffmpeg` with the `libx264` encoder. Start the local server first, then run:

```sh
npm run capture:film -- http://127.0.0.1:5173 captures/filming-take-01 all --duration=6
```

This writes six **960 × 540, 24 fps H.264 MP4** clips, start/middle/end PNGs,
an `index.html` gallery, and `report.json`. Output directories must be new.
The clips contain the canvas, without the studio controls or audio. Frames
are sampled at exact simulation times and streamed to ffmpeg; rendering
speed does not affect the exported frame rate.

To inspect framing before exporting, or request only selected subjects:

```sh
npm run capture:film -- http://127.0.0.1:5173 captures/filming-check crown,strap --preview-only --duration=6
npm run capture:film -- http://127.0.0.1:5173 captures/filming-hd balance,hands --width=1920 --height=1080 --fps=30 --duration=6
```

The default duration is four seconds. A shorter duration captures the opening
portion of the same six-second move; it does not speed up the mechanism or
retime the camera. Use `--duration=6` for a complete move. Start/middle/end
previews correspond to the first, middle and last encoded frames. Software
WebGL can render substantially slower than playback; run browser captures
sequentially. Inspect the gallery before choosing a higher export resolution.

For automation, `?film=balance&static=1` omits the studio controls and the
continuous render loop. `window.__WATCH_FILM__.setFrame(id, seconds)` sets a
deterministic camera and movement time; `window.__WATCH__.capture()` renders
that frame. The usual watch page does not load the filming module.
