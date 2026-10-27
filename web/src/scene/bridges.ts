import {
  BufferGeometry,
  type Color,
  LineBasicMaterial,
  LineSegments,
  QuadraticBezierCurve3,
  Vector3,
} from "three";

const SEGMENTS_PER_ARC = 32;

/**
 * Arcs from one rooftop to several others. The arc rises with the distance it
 * covers, so long-range imports stand out above the skyline.
 */
export function buildBridges(from: Vector3, targets: readonly Vector3[], color: Color): LineSegments {
  const points: Vector3[] = [];
  for (const to of targets) {
    const lift = from.distanceTo(to) * 0.35;
    const middle = from.clone().add(to).multiplyScalar(0.5);
    middle.y = Math.max(from.y, to.y) + lift;
    const arc = new QuadraticBezierCurve3(from, middle, to).getPoints(SEGMENTS_PER_ARC);
    // LineSegments draws pairs, so every inner point appears twice.
    for (let i = 0; i < arc.length - 1; i++) {
      points.push(arc[i]!, arc[i + 1]!);
    }
  }
  const geometry = new BufferGeometry().setFromPoints(points);
  const material = new LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
  return new LineSegments(geometry, material);
}
