import { Color } from "three";

import type { FileData } from "../types";

export type ColorMode = "complexity" | "churn" | "hotspot";

export const COLOR_MODES: Record<ColorMode, { label: string; legend: string }> = {
  complexity: {
    label: "Complexity",
    legend: "most complex function, 1 to 25+",
  },
  churn: {
    label: "Churn",
    legend: "commits touching the file, relative to the busiest file",
  },
  hotspot: {
    label: "Hotspots",
    legend: "complex and frequently changed at once, relative to the worst file",
  },
};

// Monochrome city: calm files stay gray, only the extremes turn to the accent.
const LOW = new Color("#3a3a40");
const MID = new Color("#b4b4ba");
export const ACCENT = new Color("#ff5a36");
const BROKEN = new Color("#5c2b2b");
const MID_STOP = 0.7;

/** Past this a function is very hard to test, so the scale saturates there. */
const COMPLEXITY_CEILING = 25;

export function ramp(t: number, target: Color = new Color()): Color {
  const clamped = Math.min(Math.max(t, 0), 1);
  if (clamped <= MID_STOP) {
    return target.copy(LOW).lerp(MID, clamped / MID_STOP);
  }
  return target.copy(MID).lerp(ACCENT, (clamped - MID_STOP) / (1 - MID_STOP));
}

/** City-wide maxima for the relative color modes. */
export interface ColorScale {
  maxCommits: number;
  maxHotspot: number;
}

export function colorScale(files: readonly FileData[]): ColorScale {
  return {
    maxCommits: Math.max(0, ...files.map((f) => f.history?.commits ?? 0)),
    maxHotspot: Math.max(0, ...files.map((f) => f.hotspot)),
  };
}

export function metricShare(file: FileData, mode: ColorMode, scale: ColorScale): number {
  switch (mode) {
    case "complexity":
      return (file.complexity.max - 1) / (COMPLEXITY_CEILING - 1);
    case "churn":
      return scale.maxCommits > 0 ? (file.history?.commits ?? 0) / scale.maxCommits : 0;
    case "hotspot":
      // The worst file in the city always gets the full accent.
      return scale.maxHotspot > 0 ? file.hotspot / scale.maxHotspot : 0;
  }
}

export function fileColor(file: FileData, mode: ColorMode, scale: ColorScale): Color {
  if (file.error !== null) {
    return BROKEN.clone();
  }
  return ramp(metricShare(file, mode, scale));
}

/** CSS gradient matching ramp(), for the legend. */
export function rampGradient(): string {
  return `linear-gradient(to right, #${LOW.getHexString()}, #${MID.getHexString()} ${
    MID_STOP * 100
  }%, #${ACCENT.getHexString()})`;
}
