// Turns the flat file list into districts (directories) and buildings (files)
// placed on a square ground plane.

import type { FileData } from "../types";
import { type Rect, squarify } from "./treemap";

export interface District {
  path: string;
  depth: number;
  rect: Rect;
}

export interface Building {
  file: FileData;
  /** Depth of the district it stands in; decides its base elevation. */
  depth: number;
  rect: Rect;
}

export interface CityLayout {
  size: number;
  districts: District[];
  buildings: Building[];
}

interface DirNode {
  name: string;
  path: string;
  dirs: Map<string, DirNode>;
  files: FileData[];
  weight: number;
}

// Tiny files still get a visible footprint.
const MIN_FILE_WEIGHT = 4;

export function fileWeight(file: FileData): number {
  return Math.max(file.lines.code, MIN_FILE_WEIGHT);
}

export function layoutCity(files: readonly FileData[], size: number): CityLayout {
  const root = collapse(buildTree(files));
  const layout: CityLayout = { size, districts: [], buildings: [] };
  placeNode(root, { x: -size / 2, y: -size / 2, w: size, h: size }, 0, layout);
  return layout;
}

function buildTree(files: readonly FileData[]): DirNode {
  const root = newNode("", "");
  for (const file of files) {
    const parts = file.path.split("/");
    parts.pop();
    let node = root;
    for (const part of parts) {
      let child = node.dirs.get(part);
      if (!child) {
        child = newNode(part, node.path ? `${node.path}/${part}` : part);
        node.dirs.set(part, child);
      }
      node = child;
    }
    node.files.push(file);
  }
  computeWeights(root);
  return root;
}

function newNode(name: string, path: string): DirNode {
  return { name, path, dirs: new Map(), files: [], weight: 0 };
}

function computeWeights(node: DirNode): number {
  let weight = node.files.reduce((sum, file) => sum + fileWeight(file), 0);
  for (const child of node.dirs.values()) {
    weight += computeWeights(child);
  }
  node.weight = weight;
  return weight;
}

/** Merges chains like src/ -> pkg/ that hold nothing but one folder. */
function collapse(node: DirNode): DirNode {
  for (const [key, child] of node.dirs) {
    node.dirs.set(key, collapse(child));
  }
  const only = node.dirs.size === 1 ? [...node.dirs.values()][0] : undefined;
  if (only && node.files.length === 0 && node.path !== "") {
    return { ...only, name: `${node.name}/${only.name}` };
  }
  return node;
}

function placeNode(node: DirNode, rect: Rect, depth: number, layout: CityLayout): void {
  layout.districts.push({ path: node.path, depth, rect });
  const inner = shrink(rect, Math.min(Math.max(Math.min(rect.w, rect.h) * 0.03, 0.4), 6));
  const dirs = [...node.dirs.values()];
  const weights = [...dirs.map((dir) => dir.weight), ...node.files.map(fileWeight)];
  const rects = squarify(weights, inner);

  dirs.forEach((dir, i) => placeNode(dir, rects[i]!, depth + 1, layout));
  node.files.forEach((file, i) => {
    const cell = rects[dirs.length + i]!;
    const gap = Math.min(Math.min(cell.w, cell.h) * 0.12, 3);
    layout.buildings.push({ file, depth, rect: shrink(cell, gap) });
  });
}

function shrink(rect: Rect, by: number): Rect {
  const dx = Math.min(by, rect.w / 2);
  const dy = Math.min(by, rect.h / 2);
  return { x: rect.x + dx, y: rect.y + dy, w: rect.w - 2 * dx, h: rect.h - 2 * dy };
}
