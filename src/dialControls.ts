import { DIAL_MODES, type DialMode } from "./continuousDial";
import "./opticsControls.css";

export function createDialControls(getMode: () => DialMode, setMode: (mode: DialMode) => void): HTMLElement {
  const label = document.createElement("label");
  label.className = "optics-controls";
  const title = document.createElement("span");
  title.textContent = "Dial";
  const select = document.createElement("select");
  select.setAttribute("aria-label", "Dial");
  const labels: Record<DialMode, string> = { mist: "Cool mist · 65%", hidden: "Hide dial · inspect movement" };
  for (const mode of DIAL_MODES) select.add(new Option(labels[mode], mode));
  select.value = getMode();
  select.addEventListener("change", () => setMode(select.value as DialMode));
  window.addEventListener("watch-dial-change", () => { select.value = getMode(); });
  label.append(title, select);
  return label;
}
