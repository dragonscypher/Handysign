import {
  averageVectors,
  deriveMouthStability,
  normalizePoint,
} from "@/lib/features/normalize";

describe("normalize helpers", () => {
  it("averages vectors element by element", () => {
    expect(
      averageVectors([
        [1, 3, 5],
        [3, 5, 7],
      ]),
    ).toEqual([2, 4, 6]);
  });

  it("scores stable mouth motion higher than jittery motion", () => {
    const stable = deriveMouthStability([0.11, 0.12, 0.11, 0.115]);
    const jittery = deriveMouthStability([0.1, 0.34, 0.07, 0.28]);

    expect(stable).toBeGreaterThan(jittery);
  });

  it("normalizes coordinates around reference center", () => {
    const normalized = normalizePoint(
      { x: 0.7, y: 0.6, z: 0 },
      { x: 0.5, y: 0.5, z: 0 },
      0.2,
    );

    expect(normalized.x).toBeCloseTo(1);
    expect(normalized.y).toBeCloseTo(0.5);
  });
});
