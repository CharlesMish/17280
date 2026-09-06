import { OPTICS_MODES, type OpticsMode } from "./optics";
import "./opticsControls.css";

export function createOpticsControls(getMode: () => OpticsMode, setMode: (mode: OpticsMode) => void): HTMLElement {
  const label = document.createElement("label");
  label.className = "optics-controls";
  const title = document.createElement("span");
  title.textContent = "Crystal & rubies";
  const select = document.createElement("select");
  select.setAttribute("aria-label", "Crystal & rubies");
  const labels: Record<OpticsMode, string> = {
    translucent: "Translucent rubies", opaque: "Opaque rubies", hidden: "Hide crystal",
  };
  for (const mode of OPTICS_MODES) select.add(new Option(labels[mode], mode));
  select.value = getMode();
  select.addEventListener("change", () => setMode(select.value as OpticsMode));
  window.addEventListener("watch-optics-change", () => { select.value = getMode(); });
  label.append(title, select);
  return label;
}
