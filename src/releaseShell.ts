export type ReleaseLayer = {
  id: string;
  label: string;
};

export type ReleaseViewId = "hero" | "front" | "wearable" | "rear";

export const RELEASE_VIEWS: { id: ReleaseViewId; label: string }[] = [
  { id: "hero", label: "Hero" },
  { id: "front", label: "Front" },
  { id: "wearable", label: "Wearable" },
  { id: "rear", label: "Rear" },
];

export type ReleaseShellOptions = {
  canvas: HTMLCanvasElement;
  initialExploded: boolean;
  initialPaused: boolean;
  initialView: ReleaseViewId;
  layers: ReleaseLayer[];
  onSetView: (view: ReleaseViewId) => void;
  onSetExploded: (exploded: boolean, reducedMotion: boolean) => void;
  onSetPaused: (paused: boolean) => void;
  onResetView: () => void;
  onReducedMotionChange: (reducedMotion: boolean) => void;
};

export type ReleaseShell = {
  setExploded: (exploded: boolean) => void;
  setPaused: (paused: boolean) => void;
  setView: (view: ReleaseViewId) => void;
  reducedMotion: () => boolean;
};

const button = (label: string, className: string): HTMLButtonElement => {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.textContent = label;
  return element;
};

const isTextField = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement;

export function createReleaseShell(options: ReleaseShellOptions): ReleaseShell {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  let exploded = options.initialExploded;
  let paused = options.initialPaused;
  let view = options.initialView;

  const shell = document.createElement("aside");
  shell.className = "release-shell";
  shell.setAttribute("aria-label", "Interactive watch controls");

  const heading = document.createElement("h1");
  heading.className = "release-shell__title";
  heading.textContent = "17280";

  const viewLabel = document.createElement("p");
  viewLabel.className = "release-shell__eyebrow";
  viewLabel.textContent = "Camera";

  const viewGroup = document.createElement("div");
  viewGroup.className = "release-shell__views";
  viewGroup.setAttribute("role", "group");
  viewGroup.setAttribute("aria-label", "Camera");
  const viewButtons = new Map<ReleaseViewId, HTMLButtonElement>();
  for (const row of RELEASE_VIEWS) {
    const viewButton = button(row.label, "release-shell__segment-button");
    viewButtons.set(row.id, viewButton);
    viewGroup.append(viewButton);
  }

  const modeLabel = document.createElement("p");
  modeLabel.className = "release-shell__eyebrow";
  modeLabel.textContent = "Assembly view";

  const modeGroup = document.createElement("div");
  modeGroup.className = "release-shell__segment";
  modeGroup.setAttribute("role", "group");
  modeGroup.setAttribute("aria-label", "Assembly state");

  const assembledButton = button("Assembled", "release-shell__segment-button");
  assembledButton.setAttribute("aria-keyshortcuts", "E");
  const explodedButton = button("Exploded", "release-shell__segment-button");
  explodedButton.setAttribute("aria-keyshortcuts", "E");
  modeGroup.append(assembledButton, explodedButton);

  const actionGroup = document.createElement("div");
  actionGroup.className = "release-shell__actions";
  const pauseButton = button("Pause", "release-shell__button");
  pauseButton.setAttribute("aria-keyshortcuts", "Space");
  const resetButton = button("Reset view", "release-shell__button");
  resetButton.setAttribute("aria-keyshortcuts", "Home");
  actionGroup.append(pauseButton, resetButton);

  const layerPanel = document.createElement("details");
  layerPanel.className = "release-shell__layers";
  layerPanel.setAttribute("aria-label", "Exploded assembly layers");
  const layerTitle = document.createElement("summary");
  layerTitle.className = "release-shell__layers-summary";
  layerTitle.textContent = "Exploded layers";
  const layerList = document.createElement("ol");
  for (const layer of options.layers) {
    const item = document.createElement("li");
    item.dataset.layer = layer.id;
    item.textContent = layer.label;
    layerList.append(item);
  }
  layerPanel.append(layerTitle, layerList);

  const instructions = document.createElement("p");
  instructions.id = "watch-instructions";
  instructions.className = "release-shell__instructions";
  instructions.textContent =
    "Drag to orbit, scroll or pinch to zoom. Camera buttons choose a proof view. E changes assembly; Space pauses; Home resets.";
  options.canvas.setAttribute("aria-describedby", instructions.id);

  const status = document.createElement("p");
  status.className = "release-shell__status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  shell.append(
    heading,
    viewLabel,
    viewGroup,
    modeLabel,
    modeGroup,
    actionGroup,
    layerPanel,
    instructions,
    status,
  );
  document.body.append(shell);

  const focusCanvas = (): void => {
    options.canvas.focus({ preventScroll: true });
  };

  const viewLabelFor = (id: ReleaseViewId): string =>
    RELEASE_VIEWS.find((row) => row.id === id)?.label ?? "Hero";

  const sync = (announce = false): void => {
    for (const [id, viewButton] of viewButtons) {
      viewButton.setAttribute("aria-pressed", String(!exploded && view === id));
    }
    assembledButton.setAttribute("aria-pressed", String(!exploded));
    explodedButton.setAttribute("aria-pressed", String(exploded));
    layerPanel.hidden = !exploded;
    if (!exploded) layerPanel.open = false;
    pauseButton.textContent = paused ? "Resume" : "Pause";
    pauseButton.setAttribute("aria-pressed", String(paused));
    if (announce) {
      status.textContent = exploded
        ? `Exploded view. Motion ${paused ? "paused" : "playing"}.`
        : `${viewLabelFor(view)} camera. Motion ${paused ? "paused" : "playing"}.`;
    }
  };

  const chooseView = (next: ReleaseViewId): void => {
    view = next;
    exploded = false;
    options.onSetView(view);
    sync(true);
    focusCanvas();
  };

  const chooseAssembly = (next: boolean): void => {
    if (next === exploded) return;
    exploded = next;
    options.onSetExploded(exploded, media.matches);
    sync(true);
    focusCanvas();
  };

  const choosePaused = (next: boolean): void => {
    if (next === paused) return;
    paused = next;
    options.onSetPaused(paused);
    sync(true);
    focusCanvas();
  };

  const resetView = (): void => {
    view = "hero";
    exploded = false;
    options.onResetView();
    sync(true);
    focusCanvas();
  };

  for (const [id, viewButton] of viewButtons) {
    viewButton.addEventListener("click", () => chooseView(id));
  }
  assembledButton.addEventListener("click", () => chooseAssembly(false));
  explodedButton.addEventListener("click", () => chooseAssembly(true));
  pauseButton.addEventListener("click", () => choosePaused(!paused));
  resetButton.addEventListener("click", resetView);

  window.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (isTextField(event.target)) return;
    if (event.key === "e" || event.key === "E") {
      chooseAssembly(!exploded);
    } else if (event.code === "Space") {
      event.preventDefault();
      choosePaused(!paused);
    } else if (event.key === "Home") {
      event.preventDefault();
      resetView();
    }
  });

  const onMotionPreference = (): void => {
    options.onReducedMotionChange(media.matches);
    status.textContent = media.matches
      ? "Reduced motion enabled. Camera rotation and assembly transitions are disabled."
      : "Reduced motion preference disabled.";
  };
  media.addEventListener("change", onMotionPreference);

  sync(false);
  return {
    setExploded: (next) => {
      exploded = next;
      sync(false);
    },
    setPaused: (next) => {
      paused = next;
      sync(false);
    },
    setView: (next) => {
      view = next;
      sync(false);
    },
    reducedMotion: () => media.matches,
  };
}
