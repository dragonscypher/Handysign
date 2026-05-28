import { inferBlindEventFamilies } from "@/lib/recognition/EventFamilyInference";
import { createEncodedSequence } from "./testUtils";

describe("EventFamilyInference", () => {
  it("groups similar tool-use segments into repeated motif cluster", () => {
    const result = inferBlindEventFamilies([
      {
        id: "seg-01",
        startMs: 0,
        endMs: 1000,
        averageMotion: 0.026,
        peakMotion: 0.06,
        holdRatio: 0.18,
        directionChanges: 3,
        encoded: createEncodedSequence({
          handPoseVector: [0, 0, 0, 0, 0, 0, 0, 0, 0.26, 0.18, 0.22, 0.08],
          handVelocityVector: [0.03, 0.19, 0.82, 0.9],
          visibilityMask: [0.92, 0.86, 0.8, 0.82],
          quality: {
            motionEnergy: 0.82,
            mouthStability: 0.12,
          },
        }),
      },
      {
        id: "seg-02",
        startMs: 1100,
        endMs: 2100,
        averageMotion: 0.028,
        peakMotion: 0.062,
        holdRatio: 0.16,
        directionChanges: 3,
        encoded: createEncodedSequence({
          handPoseVector: [0, 0, 0, 0, 0, 0, 0, 0, 0.24, 0.16, 0.2, 0.1],
          handVelocityVector: [0.02, 0.2, 0.84, 0.92],
          visibilityMask: [0.9, 0.84, 0.78, 0.82],
          quality: {
            motionEnergy: 0.84,
            mouthStability: 0.1,
          },
        }),
      },
    ]);

    expect(result.summary.repeatedMotifs).toHaveLength(1);
    expect(result.summary.repeatedMotifs[0]?.label).toBe("repeated-tool-use-like");
    expect(result.segments.every((segment) => segment.motifClusterId)).toBe(true);
  });

  it("sharpens generic ingest family when mouth and handshape evidence are strong", () => {
    const result = inferBlindEventFamilies([
      {
        id: "seg-01",
        startMs: 0,
        endMs: 1000,
        averageMotion: 0.014,
        peakMotion: 0.03,
        holdRatio: 0.62,
        directionChanges: 1,
        encoded: createEncodedSequence({
          handPoseVector: [0, 0, 0, 0, 0, 0, 0, 0, 0.22, 0.14, 0.18, 0.82],
          handVelocityVector: [0.02, 0.08, 0.46, 0.38],
          visibilityMask: [0.94, 0.88, 0.74, 0.84],
          quality: {
            motionEnergy: 0.46,
            mouthStability: 0.8,
          },
        }),
      },
    ]);

    expect(result.segments[0]?.primary.label).toBe("drink-like");
    expect(result.segments[0]?.primary.genericUnknown).toBe(false);
  });

  it("builds structured event chain from segment families", () => {
    const result = inferBlindEventFamilies([
      {
        id: "seg-01",
        startMs: 0,
        endMs: 900,
        averageMotion: 0.01,
        peakMotion: 0.02,
        holdRatio: 0.7,
        directionChanges: 0,
        encoded: createEncodedSequence({
          handPoseVector: [0, 0, 0, 0, 0, 0, 0, 0, 0.82, 0.22, 0.86, 0.88],
          handVelocityVector: [0.008, 0.016, 0.14, 0.12],
          visibilityMask: [0.9, 0.9, 0.8, 0.84],
          quality: {
            motionEnergy: 0.14,
            mouthStability: 0.18,
          },
        }),
      },
      {
        id: "seg-02",
        startMs: 1000,
        endMs: 1900,
        averageMotion: 0.026,
        peakMotion: 0.06,
        holdRatio: 0.14,
        directionChanges: 3,
        encoded: createEncodedSequence({
          handPoseVector: [0, 0, 0, 0, 0, 0, 0, 0, 0.26, 0.16, 0.24, 0.08],
          handVelocityVector: [0.02, 0.19, 0.82, 0.9],
          visibilityMask: [0.92, 0.86, 0.8, 0.82],
          quality: {
            motionEnergy: 0.82,
            mouthStability: 0.1,
          },
        }),
      },
      {
        id: "seg-03",
        startMs: 2000,
        endMs: 2900,
        averageMotion: 0.027,
        peakMotion: 0.061,
        holdRatio: 0.18,
        directionChanges: 3,
        encoded: createEncodedSequence({
          handPoseVector: [0, 0, 0, 0, 0, 0, 0, 0, 0.28, 0.18, 0.22, 0.09],
          handVelocityVector: [0.03, 0.2, 0.84, 0.92],
          visibilityMask: [0.9, 0.84, 0.78, 0.8],
          quality: {
            motionEnergy: 0.84,
            mouthStability: 0.1,
          },
        }),
      },
      {
        id: "seg-04",
        startMs: 3000,
        endMs: 3900,
        averageMotion: 0.014,
        peakMotion: 0.032,
        holdRatio: 0.64,
        directionChanges: 1,
        encoded: createEncodedSequence({
          handPoseVector: [0, 0, 0, 0, 0, 0, 0, 0, 0.22, 0.14, 0.18, 0.8],
          handVelocityVector: [0.02, 0.08, 0.48, 0.36],
          visibilityMask: [0.94, 0.88, 0.74, 0.84],
          quality: {
            motionEnergy: 0.48,
            mouthStability: 0.78,
          },
        }),
      },
    ]);

    expect(result.summary.topEventChain).toContain("intro/greeting-like");
    expect(result.summary.topEventChain).toContain("repeated-tool-use-like x2");
    expect(result.summary.topEventChain).toContain("drink-like");
  });
});
