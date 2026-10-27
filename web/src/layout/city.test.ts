import { describe, expect, it } from "vitest";

import type { FileData } from "../types";
import { layoutCity } from "./city";

function file(path: string, code: number): FileData {
  return {
    path,
    module: path.replace(/\.py$/, "").replaceAll("/", "."),
    lines: { total: code, code, comment: 0, blank: 0 },
    classes: 0,
    complexity: { total: 1, max: 1, average: 0, module: 1 },
    functions: [],
    imports: [],
    packages: [],
    history: null,
    hotspot: 0,
    error: null,
  };
}

describe("layoutCity", () => {
  const files = [
    file("src/shop/models.py", 120),
    file("src/shop/cart/pricing.py", 300),
    file("src/shop/cart/__init__.py", 0),
    file("tests/test_cart.py", 80),
    file("setup.py", 10),
  ];
  const layout = layoutCity(files, 100);

  it("places one building per file", () => {
    expect(layout.buildings.map((b) => b.file.path).sort()).toEqual(
      files.map((f) => f.path).sort(),
    );
  });

  it("collapses folders that only hold one folder", () => {
    expect(layout.districts.map((d) => d.path)).toEqual(["", "src/shop", "src/shop/cart", "tests"]);
  });

  it("keeps every building on the ground plane", () => {
    for (const { rect } of layout.buildings) {
      expect(rect.w).toBeGreaterThan(0);
      expect(rect.x).toBeGreaterThanOrEqual(-50);
      expect(rect.x + rect.w).toBeLessThanOrEqual(50);
    }
  });

  it("gives bigger files bigger footprints", () => {
    const area = (path: string) => {
      const rect = layout.buildings.find((b) => b.file.path === path)!.rect;
      return rect.w * rect.h;
    };

    expect(area("src/shop/cart/pricing.py")).toBeGreaterThan(area("src/shop/models.py"));
  });

  it("raises nested districts", () => {
    const depth = (path: string) => layout.buildings.find((b) => b.file.path === path)!.depth;

    expect(depth("setup.py")).toBe(0);
    expect(depth("src/shop/models.py")).toBe(1);
    expect(depth("src/shop/cart/pricing.py")).toBe(2);
  });
});
