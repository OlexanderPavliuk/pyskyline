import "./style.css";

import { CityScene } from "./scene/city-scene";
import { COLOR_MODES, type ColorMode, rampGradient } from "./scene/colors";
import { type CityData, parseCity } from "./types";
import { CityView } from "./ui/city-view";

interface CityEntry {
  file: string;
  name: string;
  note: string;
}

// A press that moves further than this is an orbit drag, not a click.
const CLICK_TOLERANCE_PX = 5;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const stage = $<HTMLDivElement>("stage");
const summary = $<HTMLParagraphElement>("city-summary");
const select = $<HTMLSelectElement>("city-select");
const fileInput = $<HTMLInputElement>("file-input");
const modeButtons = $<HTMLDivElement>("color-modes");
const legendText = $<HTMLParagraphElement>("legend-text");
const search = $<HTMLInputElement>("search");
const pathList = $<HTMLDataListElement>("file-paths");
const toast = $<HTMLDivElement>("toast");
const dropOverlay = $<HTMLDivElement>("drop-overlay");

const scene = new CityScene(stage);
const view = new CityView(scene, {
  panel: $("panel"),
  tooltip: $("tooltip"),
  legend: $("legend"),
});

$<HTMLDivElement>("legend-bar").style.background = rampGradient();

for (const [key, { label }] of Object.entries(COLOR_MODES)) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mode-button";
  button.textContent = label;
  button.dataset.mode = key;
  button.setAttribute("role", "radio");
  button.addEventListener("click", () => {
    view.setMode(key as ColorMode);
    updateControls();
  });
  modeButtons.append(button);
}

function showCity(data: CityData): void {
  view.show(data);
  pathList.replaceChildren(...view.paths.map((path) => new Option(path)));
  search.value = "";
  updateControls();
  const code = data.files.reduce((sum, file) => sum + file.lines.code, 0);
  summary.textContent = `${data.name}: ${data.files.length} files, ${code.toLocaleString("en")} lines of code`;
  document.title = `${data.name} · pyskyline`;
}

function updateControls(): void {
  for (const button of modeButtons.querySelectorAll<HTMLButtonElement>("button")) {
    const key = button.dataset.mode as ColorMode;
    button.setAttribute("aria-checked", String(key === view.mode));
    button.disabled = key !== "complexity" && !view.city?.hasHistory;
    button.title = button.disabled ? "This city was analyzed without git history" : "";
  }
  legendText.textContent = `Color: ${COLOR_MODES[view.mode].legend}.`;
}

function showError(message: string): void {
  toast.textContent = message;
  toast.classList.remove("hidden");
  window.setTimeout(() => toast.classList.add("hidden"), 5000);
}

async function loadBundled(entry: CityEntry): Promise<void> {
  summary.textContent = `Loading ${entry.name}…`;
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}cities/${entry.file}`);
    if (!response.ok) throw new Error(`Could not load ${entry.file} (${response.status}).`);
    showCity(parseCity(await response.text()));
    const url = new URL(window.location.href);
    url.searchParams.set("city", entry.name);
    window.history.replaceState(null, "", url);
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  }
}

async function loadFile(file: File): Promise<void> {
  try {
    showCity(parseCity(await file.text()));
    select.value = "";
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  }
}

async function start(): Promise<void> {
  // no-cache: after a redeploy the list must not come from a stale cache.
  const response = await fetch(`${import.meta.env.BASE_URL}cities/index.json`, {
    cache: "no-cache",
  });
  const entries = (await response.json()) as CityEntry[];
  for (const entry of entries) {
    select.append(new Option(`${entry.name} · ${entry.note}`, entry.name));
  }
  const ownFile = new Option("Your file", "");
  ownFile.hidden = true;
  select.append(ownFile);

  select.addEventListener("change", () => {
    const entry = entries.find((e) => e.name === select.value);
    if (entry) void loadBundled(entry);
  });
  const wanted = new URLSearchParams(window.location.search).get("city");
  const first = entries.find((e) => e.name === wanted) ?? entries[0];
  if (first) {
    select.value = first.name;
    await loadBundled(first);
  }
}

// Pointer: hover shows a tooltip, a click (not a drag) selects.
const canvas = scene.renderer.domElement;
let pressedAt: { x: number; y: number } | null = null;
let hoverFrame = 0;

canvas.addEventListener("pointermove", (event) => {
  cancelAnimationFrame(hoverFrame);
  // One raycast per frame at most, however fast the mouse moves.
  hoverFrame = requestAnimationFrame(() =>
    view.hover(scene.pick(event.clientX, event.clientY), event.clientX, event.clientY),
  );
});
canvas.addEventListener("pointerleave", () => {
  cancelAnimationFrame(hoverFrame);
  view.hover(null);
});
canvas.addEventListener("pointerdown", (event) => {
  pressedAt = { x: event.clientX, y: event.clientY };
});
canvas.addEventListener("pointerup", (event) => {
  if (!pressedAt) return;
  const moved = Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y);
  pressedAt = null;
  if (moved <= CLICK_TOLERANCE_PX) {
    view.select(scene.pick(event.clientX, event.clientY));
  }
});
canvas.addEventListener("dblclick", (event) => {
  const index = scene.pick(event.clientX, event.clientY);
  if (index !== null) view.select(index, true);
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") view.select(null);
});

search.addEventListener("change", () => {
  if (search.value && !view.selectPath(search.value.trim(), true)) {
    showError(`No file ${search.value} in this city.`);
  }
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) void loadFile(file);
  fileInput.value = "";
});

window.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropOverlay.classList.replace("hidden", "grid");
});
window.addEventListener("dragleave", (event) => {
  if (event.relatedTarget === null) dropOverlay.classList.replace("grid", "hidden");
});
window.addEventListener("drop", (event) => {
  event.preventDefault();
  dropOverlay.classList.replace("grid", "hidden");
  const file = event.dataTransfer?.files[0];
  if (file) void loadFile(file);
});

void start();
