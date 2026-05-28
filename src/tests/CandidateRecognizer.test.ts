import { candidateRecognizer } from "@/lib/recognition/CandidateRecognizer";
import { UncertaintyEngine } from "@/lib/uncertainty/UncertaintyEngine";
import type { CandidatePrototype } from "@/lib/recognition/types";
import {
  createCandidatePrototype,
  createConfusionPair,
  createEncodedSequence,
  createMinimalPairCard,
} from "./testUtils";

describe("CandidateRecognizer", () => {
  it("prefers better weighted matches and personal candidates", () => {
    const sequence = createEncodedSequence({
      centroid: [0.2, 0.4, 0.6, 0.8],
    });
    const candidates: CandidatePrototype[] = [
      {
        id: "demo-1",
        label: "hello",
        source: "demo",
        centroid: [0.24, 0.4, 0.63, 0.78],
        metadata: {},
        examplesCount: 2,
        updatedAt: new Date().toISOString(),
      },
      {
        id: "personal-1",
        label: "hello",
        source: "personal",
        centroid: [0.21, 0.4, 0.61, 0.79],
        metadata: {},
        examplesCount: 4,
        correctionBoost: 0.08,
        updatedAt: new Date().toISOString(),
      },
    ];

    const result = candidateRecognizer.recognize(sequence, {
      candidates,
      topK: 2,
    });

    expect(result.top1?.source).toBe("personal");
    expect(result.topK).toHaveLength(2);
  });

  it("applies small Confusion Twin adjustment to matching pair", () => {
    const sequence = createEncodedSequence({
      handPoseVector: new Array(12).fill(0.1),
      handVelocityVector: [0.6, 0.2, 0.8, 0.5],
      motionMaskSummary: [0.8, 0.8, 0.5, 1],
    });
    const candidates: CandidatePrototype[] = [
      createCandidatePrototype("hello", "demo", {
        id: "demo-hello",
        handPoseVector: new Array(12).fill(0.1),
        handVelocityVector: [0.55, 0.18, 0.74, 0.48],
        motionMaskSummary: [0.78, 0.74, 0.5, 1],
      }),
      createCandidatePrototype("thank-you", "demo", {
        id: "demo-thank-you",
        handPoseVector: new Array(12).fill(0.1),
        handVelocityVector: [0.2, 0.08, 0.24, 0.2],
        motionMaskSummary: [0.42, 0.22, 0.5, 1],
      }),
    ];
    const base = candidateRecognizer.recognize(sequence, {
      candidates,
      topK: 2,
    });
    const adjusted = candidateRecognizer.recognize(sequence, {
      candidates,
      topK: 2,
      contrastivePairs: [
        createConfusionPair({
          intendedLabel: "hello",
          confusedLabel: "thank-you",
          intendedCandidateId: "demo-hello",
          confusedCandidateId: "demo-thank-you",
        }),
      ],
    });

    expect(adjusted.top1?.label).toBe("hello");
    expect((adjusted.top1?.contrastiveAdjustment ?? 0)).toBeGreaterThan(0);
    expect(adjusted.top1?.confidence).toBeGreaterThan(base.top1?.confidence ?? 0);
    expect(adjusted.top1?.appliedConfusionPairs).toContain("confusion-hello-vs-thank-you");
  });

  it("applies small Minimal Pair Lab adjustment to matching pair", () => {
    const sequence = createEncodedSequence({
      handPoseVector: new Array(12).fill(0.68),
      handVelocityVector: [0.18, 0.08, 0.3, 0.26],
    });
    const candidates: CandidatePrototype[] = [
      createCandidatePrototype("hello", "demo", {
        id: "demo-hello",
        handPoseVector: new Array(12).fill(0.7),
        handVelocityVector: [0.2, 0.1, 0.3, 0.28],
      }),
      createCandidatePrototype("thank-you", "demo", {
        id: "demo-thank-you",
        handPoseVector: new Array(12).fill(0.16),
        handVelocityVector: [0.34, 0.12, 0.18, 0.2],
      }),
    ];

    const adjusted = candidateRecognizer.recognize(sequence, {
      candidates,
      topK: 2,
      minimalPairCards: [createMinimalPairCard()],
    });

    expect((adjusted.top1?.minimalPairAdjustment ?? 0)).toBeGreaterThan(0);
    expect(adjusted.top1?.appliedMinimalPairCards).toContain(
      "minimal-pair-demo-hello-vs-demo-thank-you",
    );
  });

  it("does not let Minimal Pair Lab bypass uncertainty thresholds", () => {
    const engine = new UncertaintyEngine();
    const sequence = createEncodedSequence({
      centroid: [0.18, 0.24, 0.3, 0.35],
      handPoseVector: new Array(12).fill(0.36),
      handVelocityVector: [0.14, 0.1, 0.18, 0.16],
      quality: {
        motionEnergy: 0.24,
        mouthStability: 0.72,
        handVisibleRatio: 1,
        faceVisibleRatio: 1,
        poseVisibleRatio: 1,
        occlusionRatio: 0,
      },
    });
    const candidates: CandidatePrototype[] = [
      createCandidatePrototype("hello", "demo", {
        id: "demo-hello",
        centroid: [0.22, 0.26, 0.32, 0.38],
      }),
      createCandidatePrototype("thank-you", "demo", {
        id: "demo-thank-you",
        centroid: [0.27, 0.29, 0.36, 0.4],
      }),
    ];

    const result = candidateRecognizer.recognize(sequence, {
      candidates,
      topK: 2,
      minimalPairCards: [createMinimalPairCard()],
    });
    const decision = engine.evaluate(result, sequence.quality);

    expect(result.top1?.confidence).not.toBe(result.top1?.baseConfidence ?? 0);
    expect(decision.mode).toBe("repair");
  });
});
