import { UncertaintyEngine } from "@/lib/uncertainty/UncertaintyEngine";
import type { RecognitionResult, SequenceQuality } from "@/lib/recognition/types";
import { createCandidatePrototype, createEncodedSequence } from "./testUtils";

function createRecognitionResult(
  confidence: number,
  secondConfidence: number,
  needsMouthCue = false,
): RecognitionResult {
  const encoded = createEncodedSequence();

  return {
    topK: [
      {
        id: "top-1",
        label: "thank-you",
        source: "demo",
        centroid: encoded.centroid,
        metadata: { needsMouthCue },
        examplesCount: 2,
        updatedAt: new Date().toISOString(),
        confidence,
        distance: 0.14,
      },
      {
        id: "top-2",
        label: "hello",
        source: "demo",
        centroid: encoded.centroid,
        metadata: {},
        examplesCount: 2,
        updatedAt: new Date().toISOString(),
        confidence: secondConfidence,
        distance: 0.2,
      },
    ],
    top1: {
      id: "top-1",
      label: "thank-you",
      source: "demo",
      centroid: encoded.centroid,
      metadata: { needsMouthCue },
      examplesCount: 2,
      updatedAt: new Date().toISOString(),
      confidence,
      distance: 0.14,
    },
    top2: {
      id: "top-2",
      label: "hello",
      source: "demo",
      centroid: encoded.centroid,
      metadata: {},
      examplesCount: 2,
      updatedAt: new Date().toISOString(),
      confidence: secondConfidence,
      distance: 0.2,
    },
    candidateSetSize: 2,
    encoded,
    matchedAt: Date.now(),
  };
}

function createQuality(overrides?: Partial<SequenceQuality>): SequenceQuality {
  return {
    extractorKind: "holistic",
    isDemoMode: false,
    validFrameCount: 32,
    validFrameRatio: 1,
    handVisibleRatio: 1,
    faceVisibleRatio: 1,
    poseVisibleRatio: 1,
    occlusionRatio: 0,
    motionEnergy: 0.26,
    mouthStability: 0.8,
    ...overrides,
  };
}

describe("UncertaintyEngine", () => {
  it("raises hand occlusion debt before other checks", () => {
    const engine = new UncertaintyEngine();
    const decision = engine.evaluate(
      createRecognitionResult(0.86, 0.42, true),
      createQuality({ occlusionRatio: 0.5 }),
    );

    expect(decision.debtType).toBe("hand-occlusion");
  });

  it("never reports clean when required landmarks are missing", () => {
    const engine = new UncertaintyEngine();
    const decision = engine.evaluate(
      createRecognitionResult(0.88, 0.41),
      createQuality({ handVisibleRatio: 0.4, faceVisibleRatio: 0.2 }),
    );

    expect(decision.mode).toBe("repair");
    expect(decision.debtType).toBe("hand-occlusion");
  });

  it("requests mouth cue when candidate metadata needs it", () => {
    const engine = new UncertaintyEngine();
    const decision = engine.evaluate(
      createRecognitionResult(0.8, 0.45, true),
      createQuality({ mouthStability: 0.2 }),
    );

    expect(decision.debtType).toBe("mouth-cue-missing");
  });

  it("accepts clean high-confidence predictions", () => {
    const engine = new UncertaintyEngine();
    const decision = engine.evaluate(
      createRecognitionResult(0.84, 0.51),
      createQuality(),
    );

    expect(decision.mode).toBe("accept");
    expect(decision.debtType).toBe("clean");
  });

  it("does not let contrastive adjustment bypass safety thresholds", () => {
    const engine = new UncertaintyEngine();
    const encoded = createEncodedSequence();
    const top1 = {
      ...createCandidatePrototype("hello"),
      confidence: 0.82,
      baseConfidence: 0.74,
      contrastiveAdjustment: 0.08,
      appliedConfusionPairs: ["confusion-hello-vs-thank-you"],
      distance: 0.18,
    };
    const top2 = {
      ...createCandidatePrototype("thank-you"),
      confidence: 0.58,
      baseConfidence: 0.5,
      contrastiveAdjustment: -0.03,
      appliedConfusionPairs: ["confusion-hello-vs-thank-you"],
      distance: 0.21,
    };
    const decision = engine.evaluate(
      {
        topK: [top1, top2],
        top1,
        top2,
        candidateSetSize: 2,
        encoded,
        matchedAt: Date.now(),
      },
      createQuality(),
    );

    expect(decision.mode).toBe("repair");
    expect(decision.debtType).toBe("ambiguous");
  });
});
