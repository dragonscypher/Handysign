import type { Point3D } from "@/lib/landmarks/types";

export const HAND_SAMPLE_INDICES = [0, 4, 8, 12, 20] as const;
export const MOUTH_SAMPLE_INDICES = [13, 14, 61, 291, 78, 308] as const;

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function clamp01(value: number) {
  return clamp(value, 0, 1);
}

export function safeDivide(
  numerator: number,
  denominator: number,
  fallback = 0,
) {
  return denominator === 0 ? fallback : numerator / denominator;
}

export function mean(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function variance(values: number[]) {
  if (values.length < 2) {
    return 0;
  }

  const avg = mean(values);
  return mean(values.map((value) => (value - avg) ** 2));
}

export function distance2D(a: Point3D, b: Point3D) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function normalizePoint(
  point: Point3D,
  center: Point3D,
  scale: number,
  mirrored = false,
) {
  const scaleSafe = scale || 1;
  const x = safeDivide(point.x - center.x, scaleSafe, 0);

  return {
    x: mirrored ? -x : x,
    y: safeDivide(point.y - center.y, scaleSafe, 0),
    z: safeDivide(point.z - center.z, scaleSafe, 0),
  };
}

export function averageVectors(vectors: number[][]) {
  if (!vectors.length) {
    return [];
  }

  const width = vectors[0]?.length ?? 0;
  const totals = new Array<number>(width).fill(0);

  for (const vector of vectors) {
    for (let index = 0; index < width; index += 1) {
      totals[index] += vector[index] ?? 0;
    }
  }

  return totals.map((value) => value / vectors.length);
}

export function euclideanDistance(left: number[], right: number[]) {
  const width = Math.max(left.length, right.length);
  let sum = 0;

  for (let index = 0; index < width; index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    sum += delta * delta;
  }

  return Math.sqrt(sum);
}

export function buildCentroid(groups: number[][]) {
  return groups.flat();
}

export function deriveMouthStability(opennessSeries: number[]) {
  if (opennessSeries.length < 3) {
    return 0;
  }

  return clamp01(1 - variance(opennessSeries) * 18);
}

export function averagePoint(points: Point3D[]) {
  if (!points.length) {
    return { x: 0, y: 0, z: 0 };
  }

  return {
    x: mean(points.map((point) => point.x)),
    y: mean(points.map((point) => point.y)),
    z: mean(points.map((point) => point.z)),
  };
}
