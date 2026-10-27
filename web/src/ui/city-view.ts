// Owns what is on screen for one city: colors, hover, selection, panel.

import { Color } from "three";

import { type CityLayout, layoutCity } from "../layout/city";
import type { CityScene } from "../scene/city-scene";
import { type ColorMode, colorScale, fileColor } from "../scene/colors";
import type { CityData, FileData } from "../types";
import { renderPanel } from "./panel";

export const CITY_SIZE = 1000;
const SELECTED = new Color("#ffffff");
const HOVERED = new Color("#e6e6ea");
// Unrelated buildings fade so the selection and its imports stand out.
const DIMMED = 0.22;

export interface ViewElements {
  panel: HTMLElement;
  tooltip: HTMLElement;
  legend: HTMLElement;
}

export class CityView {
  city: CityData | null = null;
  mode: ColorMode = "complexity";
  private layout: CityLayout | null = null;
  private indexByPath = new Map<string, number>();
  private importedBy: number[][] = [];
  private hovered: number | null = null;
  private selected: number | null = null;

  constructor(
    private readonly scene: CityScene,
    private readonly elements: ViewElements,
  ) {}

  show(data: CityData): void {
    this.city = data;
    const layout = layoutCity(data.files, CITY_SIZE);
    this.layout = layout;
    this.indexByPath = new Map(layout.buildings.map((b, i) => [b.file.path, i]));
    this.importedBy = layout.buildings.map(() => []);
    layout.buildings.forEach((building, i) => {
      for (const path of building.file.imports) {
        const target = this.indexByPath.get(path);
        if (target !== undefined) this.importedBy[target]!.push(i);
      }
    });
    this.hovered = null;
    this.selected = null;
    if (!data.hasHistory) this.mode = "complexity";
    this.scene.setCity(layout, this.heights(layout), this.colors());
    this.closePanel();
  }

  setMode(mode: ColorMode): void {
    this.mode = mode;
    this.refreshColors();
  }

  hover(index: number | null, clientX = 0, clientY = 0): void {
    const tooltip = this.elements.tooltip;
    const building = index === null ? undefined : this.layout?.buildings[index];
    if (!building) {
      tooltip.classList.add("hidden");
    } else {
      const { file } = building;
      tooltip.textContent = `${file.path}\n${file.lines.code} lines · complexity ${file.complexity.total}`;
      tooltip.style.whiteSpace = "pre";
      tooltip.style.transform = `translate(${clientX + 14}px, ${clientY + 14}px)`;
      tooltip.classList.remove("hidden");
    }
    if (index !== this.hovered) {
      this.hovered = index;
      this.refreshColors();
    }
  }

  select(index: number | null, fly = false): void {
    this.selected = index;
    const building = index === null ? undefined : this.layout?.buildings[index];
    if (index === null || !building) {
      this.scene.clearBridges();
      this.closePanel();
      this.refreshColors();
      return;
    }
    const imports = this.importsOf(index);
    const importedBy = this.importedBy[index] ?? [];
    this.scene.showBridges(index, imports, importedBy);
    renderPanel(this.elements.panel, building.file, {
      importedBy: importedBy.map((i) => this.layout!.buildings[i]!.file),
      onOpen: (path) => this.selectPath(path, true),
      onClose: () => this.select(null),
    });
    this.elements.panel.classList.remove("hidden");
    this.elements.legend.classList.add("max-md:hidden");
    this.refreshColors();
    if (fly) this.scene.flyTo(index);
  }

  selectPath(path: string, fly: boolean): boolean {
    const index = this.indexByPath.get(path);
    if (index === undefined) return false;
    this.select(index, fly);
    return true;
  }

  get paths(): string[] {
    return [...this.indexByPath.keys()].sort();
  }

  private importsOf(index: number): number[] {
    const file = this.layout?.buildings[index]?.file;
    if (!file) return [];
    return file.imports
      .map((path) => this.indexByPath.get(path))
      .filter((i): i is number => i !== undefined);
  }

  private closePanel(): void {
    this.elements.panel.classList.add("hidden");
    this.elements.panel.replaceChildren();
    this.elements.legend.classList.remove("max-md:hidden");
  }

  private refreshColors(): void {
    this.scene.setColors(this.colors());
  }

  private colors(): Color[] {
    const layout = this.layout;
    if (!layout) return [];
    const scale = colorScale(layout.buildings.map((b) => b.file));
    const related =
      this.selected === null
        ? null
        : new Set([
            this.selected,
            ...this.importsOf(this.selected),
            ...(this.importedBy[this.selected] ?? []),
          ]);
    return layout.buildings.map((building, i) => {
      if (i === this.selected) return SELECTED.clone();
      if (i === this.hovered) return HOVERED.clone();
      const color = fileColor(building.file, this.mode, scale);
      return related && !related.has(i) ? color.multiplyScalar(DIMMED) : color;
    });
  }

  private heights(layout: CityLayout): number[] {
    const files: FileData[] = layout.buildings.map((b) => b.file);
    const maxTotal = Math.max(...files.map((f) => f.complexity.total), 1);
    // Tallest tower scales with the typical footprint, so small and large cities
    // both read as towers rather than slabs or needles.
    const typicalSide = CITY_SIZE / Math.sqrt(Math.max(files.length, 1));
    const maxHeight = Math.min(CITY_SIZE * 0.4, Math.max(typicalSide * 2.2, CITY_SIZE * 0.15));
    // Square root keeps one giant file from flattening everything else.
    return files.map((f) => 2 + maxHeight * Math.sqrt(f.complexity.total / maxTotal));
  }
}
