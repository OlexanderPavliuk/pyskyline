// Details panel for the selected file. Built with DOM nodes and textContent
// only: city files can come from anywhere, so nothing is parsed as HTML.

import type { FileData } from "../types";

export interface PanelLinks {
  importedBy: readonly FileData[];
  onOpen: (path: string) => void;
  onClose: () => void;
}

const TOP_FUNCTIONS = 8;

export function renderPanel(root: HTMLElement, file: FileData, links: PanelLinks): void {
  root.replaceChildren();

  const header = el("div", "flex items-start justify-between gap-3");
  const title = el("div", "min-w-0");
  title.append(
    el("p", "font-mono text-sm break-all text-white", file.path),
    el("p", "mt-0.5 font-mono text-xs break-all text-mute", file.module || "(top level)"),
  );
  const close = el("button", "control shrink-0 px-2 py-1", "Close");
  close.type = "button";
  close.addEventListener("click", links.onClose);
  header.append(title, close);
  root.append(header);

  if (file.error !== null) {
    root.append(el("p", "mt-3 rounded-md bg-[#5c2b2b]/50 p-2 text-xs text-fog", file.error));
  }

  const lastChanged = file.history
    ? new Date(file.history.lastChanged * 1000).toISOString().slice(0, 10)
    : "–";
  root.append(
    statGrid([
      ["Lines of code", file.lines.code],
      ["Comments", file.lines.comment],
      ["Functions", file.functions.length],
      ["Classes", file.classes],
      ["Complexity", file.complexity.total],
      ["Most complex", file.complexity.max],
      ["Commits", file.history?.commits ?? "–"],
      ["Last change", lastChanged],
      ["Hotspot", file.history ? file.hotspot.toFixed(2) : "–"],
      ["Avg per function", file.complexity.average.toFixed(1)],
    ]),
  );

  const functions = [...file.functions]
    .sort((a, b) => b.complexity - a.complexity)
    .slice(0, TOP_FUNCTIONS);
  if (functions.length > 0) {
    root.append(sectionTitle("Most complex functions"));
    const list = el("ul", "mt-1 space-y-0.5");
    for (const fn of functions) {
      const row = el("li", "flex justify-between gap-3 font-mono text-xs");
      const tone = fn.complexity > 10 ? "text-accent" : "text-fog";
      row.append(
        el("span", "min-w-0 truncate text-fog", `${fn.name} :${fn.line}`),
        el("span", `shrink-0 ${tone}`, String(fn.complexity)),
      );
      list.append(row);
    }
    root.append(list);
  }

  root.append(linkList("Imports", file.imports, "bg-[#f4f4f6]", links.onOpen));
  root.append(
    linkList(
      "Imported by",
      links.importedBy.map((f) => f.path),
      "bg-[#ff8a6b]",
      links.onOpen,
    ),
  );

  if (file.packages.length > 0) {
    root.append(sectionTitle("Third-party packages"));
    const chips = el("div", "mt-1 flex flex-wrap gap-1");
    for (const name of file.packages) {
      chips.append(el("span", "rounded border border-line px-1.5 py-0.5 font-mono text-xs", name));
    }
    root.append(chips);
  }
}

function statGrid(stats: [string, string | number][]): HTMLElement {
  const grid = el("dl", "mt-3 grid grid-cols-2 gap-x-4 gap-y-2");
  for (const [label, value] of stats) {
    const cell = el("div", "min-w-0");
    cell.append(
      el("dt", "text-[11px] text-mute", label),
      el("dd", "font-mono text-sm text-white tabular-nums", String(value)),
    );
    grid.append(cell);
  }
  return grid;
}

function linkList(
  label: string,
  paths: readonly string[],
  swatch: string,
  onOpen: (path: string) => void,
): HTMLElement {
  const section = el("section");
  const heading = sectionTitle(`${label} (${paths.length})`);
  heading.prepend(el("span", `mr-1.5 inline-block size-2 rounded-full ${swatch}`));
  section.append(heading);
  const list = el("ul", "mt-1 space-y-0.5");
  for (const path of paths) {
    const button = el("button", "w-full truncate text-left font-mono text-xs text-fog hover:text-white", path);
    button.type = "button";
    button.title = path;
    button.addEventListener("click", () => onOpen(path));
    const item = el("li");
    item.append(button);
    list.append(item);
  }
  section.append(list);
  return section;
}

function sectionTitle(text: string): HTMLElement {
  return el("h3", "mt-4 text-[11px] tracking-wider text-mute uppercase", text);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
