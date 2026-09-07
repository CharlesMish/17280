import "./filming.css";
import { createOpticsControls } from "./opticsControls";
import { createDialControls } from "./dialControls";

type Point = [number, number, number];
type Watch = Window["__WATCH__"];
type Shot = {
  id: string;
  label: string;
  description: string;
  duration: number;
  view: string;
  position: Point;
  target: Point;
  arc: number;
  startScale: number;
  endScale: number;
};

declare global {
  interface Window {
    __WATCH_FILM__: {
      shots: Pick<Shot, "id" | "label" | "description" | "duration">[];
      setFrame: (id: string, seconds: number) => void;
      pause: () => void;
    };
  }
}

// Resolve landmarks from this watch's live model and accepted product cameras.
// Selecting a legacy diagnostic camera can change visibility and finishing.
function createShots(watch: Watch): Shot[] {
  const views = watch.releasePresentationReport().views;
  const exterior = watch.exteriorReport();
  if (!exterior) throw new Error("Filming requires the complete 17280 watch.");
  const crown = exterior.crown;
  const north = exterior.lugs.sides.find(side => side.side === "north")!;
  const crownTarget: Point = [(crown.bodyX0 + crown.bodyX1) / 2, crown.axis.y, crown.axis.z];
  const strapTarget: Point = [exterior.lugs.strapWidth / 2 - 2, north.yTip - 1.5, 0.4];
  const fromView = (view: keyof typeof views) => ({ view, position: views[view].position, target: views[view].target });
  return [
    { id: "balance", label: "Balance", description: "A shallow arc across the oscillating balance and blue spring.",
      ...fromView("r1BalanceFinishMacro"), duration: 6, arc: 10, startScale: 1.22, endScale: 1.12 },
    { id: "hands", label: "Blue hands", description: "A slow approach to the blue hands, center hub and gold barrel.",
      view: "r1FrontThreeQuarter", position: [7, 5, 37], target: [-0.4, -1.3, 6.2],
      duration: 6, arc: -6, startScale: 1.1, endScale: 0.94 },
    { id: "crown", label: "Crown", description: "A short orbit around the crown face, flutes and case shoulder.",
      view: "r1FrontThreeQuarter", target: crownTarget,
      position: [crownTarget[0] + 12, crownTarget[1] - 6, crownTarget[2] + 8],
      duration: 6, arc: 14, startScale: 1.06, endScale: 1 },
    { id: "sapphire", label: "Sapphire", description: "A grazing sweep across the sapphire and polished bezel.",
      ...fromView("r1SapphireOblique"), duration: 6, arc: 14, startScale: 1.05, endScale: 1 },
    { id: "strap", label: "Lug & strap", description: "A close orbit across the north horn, spring-bar end and charcoal strap.",
      view: "r1WearableJunction", target: strapTarget,
      position: [strapTarget[0] + 9, strapTarget[1] + 8, strapTarget[2] + 11],
      duration: 6, arc: -10, startScale: 1.1, endScale: 1 },
    { id: "rear", label: "Caseback", description: "A gentle push toward the caseback rim and exhibition movement.",
      ...fromView("r1RearIdentity"), duration: 6, arc: -7, startScale: 1.12, endScale: 1 },
  ];
}

export function createFilming(watch: Watch, initialId: string, captureOnly: boolean): void {
  const shots = createShots(watch);
  let current: Shot | null = null;
  let seconds = 0;
  let playing = false;
  let animation = 0;
  let playStart = 0;
  let sync = (): void => {};

  const pause = (): void => {
    playing = false;
    cancelAnimationFrame(animation);
    sync();
  };
  const applyFrame = (id: string, time: number): void => {
    const shot = shots.find(row => row.id === id);
    if (!shot) throw new Error(`Unknown filming shot: ${id}`);
    if (!Number.isFinite(time)) throw new Error("Film time must be finite.");
    if (current !== shot) {
      watch.setView(shot.view);
      watch.selectLayer(null);
      watch.setDebug(false);
      watch.setPlaybackPaused(true);
      watch.setReadoutPose("1010");
      current = shot;
    }
    seconds = Math.max(0, Math.min(shot.duration, time));
    const progress = seconds / shot.duration;
    const ease = progress * progress * (3 - 2 * progress);
    const angle = (ease - 0.5) * shot.arc * Math.PI / 180;
    const scale = shot.startScale + (shot.endScale - shot.startScale) * ease;
    const [x, y, z] = shot.position.map((value, i) => (value - shot.target[i]) * scale);
    const position: Point = [
      shot.target[0] + x * Math.cos(angle) + z * Math.sin(angle),
      shot.target[1] + y,
      shot.target[2] - x * Math.sin(angle) + z * Math.cos(angle),
    ];
    watch.setCaptureCamera(position, shot.target);
    watch.setTime(0.104 + seconds);
    sync();
  };
  const setFrame = (id: string, time: number): void => {
    pause();
    applyFrame(id, time);
  };
  const tick = (now: number): void => {
    if (!playing || !current) return;
    applyFrame(current.id, (now - playStart) / 1000);
    if (seconds >= current.duration) pause();
    else animation = requestAnimationFrame(tick);
  };
  const play = (): void => {
    if (!current) return;
    if (seconds >= current.duration) applyFrame(current.id, 0);
    playing = true;
    playStart = performance.now() - seconds * 1000;
    sync();
    animation = requestAnimationFrame(tick);
  };

  setFrame(shots.some(shot => shot.id === initialId) ? initialId : "balance", 0);
  window.__WATCH_FILM__ = {
    shots: shots.map(({ id, label, description, duration }) => ({ id, label, description, duration })),
    setFrame,
    pause,
  };
  if (captureOnly) return;

  document.title = "17280 · Close-up studio";
  const panel = document.createElement("aside");
  panel.className = "film-panel";
  panel.setAttribute("aria-label", "Close-up studio");
  panel.innerHTML = `<div class="film-panel__heading"><strong>17280 <span>Close-up studio</span></strong>
    <button type="button" data-action="hide">Hide controls</button></div>
    <div class="film-panel__shots" role="group" aria-label="Close-up cameras"></div>
    <p class="film-panel__description"></p>
    <div class="film-panel__transport"><button type="button" data-action="play">Play take</button>
    <button type="button" data-action="restart">Restart</button>
    <label class="film-panel__timeline">Take position <input type="range" min="0" max="6" step="0.01" value="0"></label>
    <output></output></div>
    <p class="film-panel__help">Drag to frame; scroll to zoom. Space plays or pauses; H hides controls; Home restarts. Each take is six seconds.</p>`;
  const reveal = document.createElement("button");
  reveal.type = "button";
  reveal.className = "film-reveal";
  reveal.textContent = "Show controls";
  reveal.hidden = true;
  document.body.append(panel, reveal);
  panel.insertBefore(createOpticsControls(watch.getOpticsMode, watch.setOpticsMode), panel.querySelector(".film-panel__help"));
  panel.insertBefore(createDialControls(watch.getDialMode, watch.setDialMode), panel.querySelector(".film-panel__help"));
  const playButton = panel.querySelector<HTMLButtonElement>('[data-action="play"]')!;
  const restartButton = panel.querySelector<HTMLButtonElement>('[data-action="restart"]')!;
  const hideButton = panel.querySelector<HTMLButtonElement>('[data-action="hide"]')!;
  const description = panel.querySelector<HTMLParagraphElement>(".film-panel__description")!;
  const timeline = panel.querySelector<HTMLInputElement>("input")!;
  const output = panel.querySelector<HTMLOutputElement>("output")!;
  const buttons = new Map<string, HTMLButtonElement>();
  for (const shot of shots) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = shot.label;
    button.addEventListener("click", () => {
      setFrame(shot.id, 0);
      const url = new URL(window.location.href);
      url.searchParams.set("film", shot.id);
      window.history.replaceState(null, "", url);
    });
    buttons.set(shot.id, button);
    panel.querySelector(".film-panel__shots")!.append(button);
  }
  sync = () => {
    if (!current) return;
    description.textContent = current.description;
    timeline.max = String(current.duration);
    timeline.value = String(seconds);
    output.textContent = `${seconds.toFixed(1)} / ${current.duration}s`;
    playButton.textContent = playing ? "Pause take" : seconds >= current.duration ? "Replay take" : "Play take";
    playButton.setAttribute("aria-pressed", String(playing));
    for (const [id, button] of buttons) button.setAttribute("aria-pressed", String(id === current.id));
  };
  const toggle = (): void => { if (playing) pause(); else play(); };
  const restart = (): void => { if (current) setFrame(current.id, 0); };
  const hide = (hidden: boolean): void => {
    panel.hidden = hidden;
    reveal.hidden = !hidden;
    (hidden ? reveal : hideButton).focus({ preventScroll: true });
  };
  playButton.addEventListener("click", toggle);
  restartButton.addEventListener("click", restart);
  hideButton.addEventListener("click", () => hide(true));
  reveal.addEventListener("click", () => hide(false));
  timeline.addEventListener("input", () => { if (current) setFrame(current.id, Number(timeline.value)); });
  const canvas = document.querySelector("#app canvas")!;
  canvas.addEventListener("pointerdown", pause);
  canvas.addEventListener("wheel", pause, { passive: true });
  window.addEventListener("keydown", event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement ||
      event.target instanceof HTMLTextAreaElement || (event.target instanceof HTMLElement && event.target.isContentEditable)) return;
    // Keep the older inspection shortcuts from replacing a filming composition.
    if (/^[0-9eds]$/i.test(event.key)) { event.stopImmediatePropagation(); return; }
    if (event.key.toLowerCase() === "h") { event.preventDefault(); event.stopImmediatePropagation(); hide(!panel.hidden); }
    if (event.key === "Home") { event.preventDefault(); event.stopImmediatePropagation(); restart(); }
    if (event.code === "Space" && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault(); event.stopImmediatePropagation(); toggle();
    }
  }, { capture: true });
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
  sync();
}
