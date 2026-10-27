// Squarified treemap (Bruls, Huizing, van Wijk, 2000).
//
// Splits a rectangle into pieces whose areas are proportional to the weights,
// keeping each piece as close to a square as the greedy row building allows.
// Squares matter here: a long thin strip makes an unreadable building.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Returns one rectangle per weight, in input order. Zero weights get empty rectangles. */
export function squarify(weights: readonly number[], bounds: Rect): Rect[] {
  const result: Rect[] = weights.map(() => ({ x: bounds.x, y: bounds.y, w: 0, h: 0 }));
  const total = weights.reduce((sum, weight) => sum + Math.max(weight, 0), 0);
  if (total <= 0 || bounds.w <= 0 || bounds.h <= 0) {
    return result;
  }

  const scale = (bounds.w * bounds.h) / total;
  // Largest first: big items placed early end up the squarest.
  const order = weights
    .map((weight, index) => ({ index, area: Math.max(weight, 0) * scale }))
    .filter((item) => item.area > 0)
    .sort((a, b) => b.area - a.area);

  let free: Rect = { ...bounds };
  let row: { index: number; area: number }[] = [];

  for (const item of order) {
    const side = Math.min(free.w, free.h);
    if (row.length === 0 || worstRatio([...row, item], side) <= worstRatio(row, side)) {
      row.push(item);
      continue;
    }
    free = placeRow(row, free, result);
    row = [item];
  }
  if (row.length > 0) {
    placeRow(row, free, result);
  }
  return result;
}

/** Worst aspect ratio in a row laid along a side of the given length. */
function worstRatio(row: readonly { area: number }[], side: number): number {
  let sum = 0;
  let min = Infinity;
  let max = 0;
  for (const { area } of row) {
    sum += area;
    min = Math.min(min, area);
    max = Math.max(max, area);
  }
  const sideSquared = side * side;
  const sumSquared = sum * sum;
  return Math.max((sideSquared * max) / sumSquared, sumSquared / (sideSquared * min));
}

/** Lays a row along the shorter side of free and returns the space left over. */
function placeRow(
  row: readonly { index: number; area: number }[],
  free: Rect,
  result: Rect[],
): Rect {
  const rowArea = row.reduce((sum, item) => sum + item.area, 0);
  if (free.w >= free.h) {
    // Column on the left edge.
    const width = rowArea / free.h;
    let y = free.y;
    for (const item of row) {
      const height = item.area / width;
      result[item.index] = { x: free.x, y, w: width, h: height };
      y += height;
    }
    return { x: free.x + width, y: free.y, w: free.w - width, h: free.h };
  }
  // Row along the top edge.
  const height = rowArea / free.w;
  let x = free.x;
  for (const item of row) {
    const width = item.area / height;
    result[item.index] = { x, y: free.y, w: width, h: height };
    x += width;
  }
  return { x: free.x, y: free.y + height, w: free.w, h: free.h - height };
}
