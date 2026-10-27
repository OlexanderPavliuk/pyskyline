import "./style.css";

import type { Color } from "three";

import { type CityLayout, layoutCity } from "./layout/city";
import { CityScene } from "./scene/city-scene";
import { COLOR_MODES, type ColorMode, fileColor, rampGradient } from "./scene/colors";
import { type CityData, parseCity } from "./types";

interface CityEntry {
  file: string;
  name: string;
  note: string;
}

const CITY_SIZE = 1000;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const stage = $<HTMLDivElement>("stage");
const summary = $<HTMLParagraphElement>("city-summary");
const select = $<HTMLSelectElement>("city-select");
const fileInput = $<HTMLInputElement>("file-input");
const modeButtons = $<HTMLDivElement>("color-modes");
const legendText = $<HTMLParagraphElement>("legend-text");
const toast = $<HTMLDivElement>("toast");
const dropOverlay = $<HTMLDivElement>("drop-overlay");

const scene = new CityScene(stage);
let city: CityData | null = null;
let layout: CityLayout | null = null;
let mode: ColorMode = "complexity";

$<HTMLDivElement>("legend-bar").style.background = rampGradient();

for (const [key, { label }] of Object.entries(COLOR_MODES)) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mode-button";
  button.textContent = label;
  button.dataset.mode = key;
  button.setAttribute("role", "radio");
  button.addEventListener("click", () => setMode(key as ColorMode));
  modeButtons.append(button);
}

function showCity(data: CityData): void {
  city = data;
  layout = layoutCity(data.files, CITY_SIZE);
  const maxTotal = Math.max(...layout.buildings.map((b) => b.file.complexity.total), 1);
  // Tallest tower scales with the typical footprint, so small and large cities
  // both read as towers rather than slabs or needles.
  const typicalSide = CITY_SIZE / Math.sqrt(Math.max(layout.buildings.length, 1));
  const maxHeight = Math.min(CITY_SIZE * 0.4, Math.max(typicalSide * 2.2, CITY_SIZE * 0.15));
  // Square root keeps one giant file from flattening everything else.
  const heights = layout.buildings.map(
    (b) => 2 + maxHeight * Math.sqrt(b.file.complexity.total / maxTotal),
  );
  if (!data.hasHistory && mode !== "complexity") {
    mode = "complexity";
  }
  scene.setCity(layout, heights, colors());
  updateControls();

  const code = data.files.reduce((sum, file) => sum + file.lines.code, 0);
  summary.textContent = `${data.name}: ${data.files.length} files, ${code.toLocaleString("en")} lines of code`;
  document.title = `${data.name} · pyskyline`;
}

function colors(): Color[] {
  if (!layout) return [];
  const maxCommits = Math.max(0, ...layout.buildings.map((b) => b.file.history?.commits ?? 0));
  return layout.buildings.map((b) => fileColor(b.file, mode, maxCommits));
}

function setMode(next: ColorMode): void {
  mode = next;
  scene.setColors(colors());
  updateControls();
}

function updateControls(): void {
  for (const button of modeButtons.querySelectorAll<HTMLButtonElement>("button")) {
    const key = button.dataset.mode as ColorMode;
    button.setAttribute("aria-checked", String(key === mode));
    button.disabled = key !== "complexity" && !city?.hasHistory;
    button.title = button.disabled ? "This city was analyzed without git history" : "";
  }
  legendText.textContent = `Color: ${COLOR_MODES[mode].legend}.`;
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
  const response = await fetch(`${import.meta.env.BASE_URL}cities/index.json`);
  const entries = (await response.json()) as CityEntry[];
  for (const entry of entries) {
    select.append(new Option(`${entry.name} · ${entry.note}`, entry.name));
  }
  select.append(new Option("Your file", "", false, false));
  select.lastElementChild?.setAttribute("hidden", "");

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
