import { describe, expect, it } from "vitest";

import { type Rect, squarify } from "./treemap";

const BOUNDS: Rect = { x: 0, y: 0, w: 60, h: 40 };

function area(rect: Rect): number {
  return rect.w * rect.h;
}

function overlaps(a: Rect, b: Rect): boolean {
  const eps = 1e-9;
  return (
    a.x + eps < b.x + b.w && b.x + eps < a.x + a.w && a.y + eps < b.y + b.h && b.y + eps < a.y + a.h
  );
}

describe("squarify", () => {
  it("gives every weight an area proportional to it", () => {
    const weights = [6, 6, 4, 3, 2, 2, 1];
    const rects = squarify(weights, BOUNDS);
    const total = weights.reduce((a, b) => a + b, 0);

    rects.forEach((rect, i) => {
      expect(area(rect)).toBeCloseTo((weights[i]! / total) * area(BOUNDS), 6);
    });
  });

  it("keeps rectangles inside the bounds and apart from each other", () => {
    const rects = squarify([5, 1, 9, 3, 3, 7, 2, 8], BOUNDS);

    for (const rect of rects) {
      expect(rect.x).toBeGreaterThanOrEqual(BOUNDS.x - 1e-9);
      expect(rect.y).toBeGreaterThanOrEqual(BOUNDS.y - 1e-9);
      expect(rect.x + rect.w).toBeLessThanOrEqual(BOUNDS.x + BOUNDS.w + 1e-9);
      expect(rect.y + rect.h).toBeLessThanOrEqual(BOUNDS.y + BOUNDS.h + 1e-9);
    }
    rects.forEach((a, i) =>
      rects.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false)),
    );
  });

  it("returns rectangles in input order", () => {
    const [small, big] = squarify([1, 9], BOUNDS);

    expect(area(big!)).toBeGreaterThan(area(small!));
  });

  it("produces near-square pieces for equal weights", () => {
    const rects = squarify([1, 1, 1, 1], { x: 0, y: 0, w: 10, h: 10 });

    for (const rect of rects) {
      expect(Math.max(rect.w / rect.h, rect.h / rect.w)).toBeCloseTo(1, 6);
    }
  });

  it("handles zero and empty input", () => {
    expect(squarify([], BOUNDS)).toEqual([]);
    expect(squarify([0, 0], BOUNDS).map(area)).toEqual([0, 0]);
    expect(area(squarify([0, 5], BOUNDS)[1]!)).toBeCloseTo(area(BOUNDS), 6);
  });
});
