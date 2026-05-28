import {
  createBlindInferenceReport,
  createEncodedSequence,
  createRecognitionResult,
  createUncertaintyDecision,
} from "./testUtils";
import {
  createBlindInferenceReport as createBlindInferenceReportBase,
  createBlindInferenceSegment,
} from "@/lib/video/BlindInferenceReport";

describe("BlindInferenceReport", () => {
  it("prefers structured unknown hypothesis when exact label is weak", () => {
    const recognition = createRecognitionResult({
      topK: [
        {
          ...createRecognitionResult().topK[0]!,
          label: "hello",
          confidence: 0.49,
          baseConfidence: 0.49,
        },
        {
          ...createRecognitionResult().topK[1]!,
          label: "thank-you",
          confidence: 0.45,
          baseConfidence: 0.45,
        },
      ],
      top1: {
        ...createRecognitionResult().topK[0]!,
        label: "hello",
        confidence: 0.49,
        baseConfidence: 0.49,
      },
      top2: {
        ...createRecognitionResult().topK[1]!,
        label: "thank-you",
        confidence: 0.45,
        baseConfidence: 0.45,
      },
      encoded: createEncodedSequence({
        handPoseVector: [0, 0, 0, 0, 0, 0, 0, 0, 0.32, 0.14, 0.18, 0.08],
        handVelocityVector: [0.01, 0.21, 0.88, 0.94],
        motionMaskSummary: [0.94, 0.88, 0.08, 1],
        visibilityMask: [0.9, 0.82, 0.7, 0.78],
        quality: {
          motionEnergy: 0.88,
          mouthStability: 0.16,
        },
      }),
    });
    const decision = createUncertaintyDecision({
      mode: "repair",
      primaryCandidate: recognition.top1,
      alternatives: recognition.topK,
      confidence: recognition.top1?.confidence ?? 0.49,
      margin: 0.04,
    });

    const segment = createBlindInferenceSegment({
      id: "seg-01",
      startMs: 0,
      endMs: 1200,
      recognition,
      decision,
      eventFamily: {
        label: "chop/cut-like",
        confidence: 0.74,
        reason: "Directional stroke looked chop-like.",
        channels: ["motion", "timing", "handshape"],
        genericUnknown: false,
      },
      eventAlternatives: [
        {
          label: "repeated-tool-use-like",
          confidence: 0.68,
          reason: "Repeated strokes also looked tool-use-like.",
          channels: ["motion", "handshape", "placement"],
          genericUnknown: false,
        },
      ],
    });

    expect(segment.bestHypothesis).toBe("chop/cut-like");
    expect(segment.exactLabelGuess).toBe("hello");
    expect(segment.actionHypothesis).toBe("chop/cut-like");
    expect(segment.eventFamilyHypothesis).toBe("chop/cut-like");
    expect(segment.runnerUpFamily).toBeNull();
    expect(segment.confidenceMargin).toBe(0);
    expect(segment.alternatives.some((item) => item.kind === "event-family")).toBe(true);
  });

  it("builds clip-level blind summary without reference fields", () => {
    const report = createBlindInferenceReport();
    const serialized = JSON.stringify(report);

    expect(report.summary.topEventChain).toContain("chop/cut-like");
    expect(report.summary.topLexemeChain).toContain("lexeme-");
    expect(report.lexemes[0]?.id).toBe("lexeme-01");
    expect(report.segments[0]?.phases.length).toBeGreaterThan(0);
    expect(report.segments[0]?.phaseRoleSummary.length).toBeGreaterThan(0);
    expect(report.segments[0]?.failureTags.length).toBeGreaterThan(0);
    expect(report.summary.improveNext.likelyNextDataNeed.length).toBeGreaterThan(0);
    expect(report.summary.repeatedPatterns[0]?.label).toBe("chop/cut-like");
    expect(report.summary.metrics.genericUnknownRatio).toBe(0);
    expect(report.summary.metrics.genericUnknownCount).toBe(0);
    expect(report.summary.metrics.eventFamilyDiversity).toBeGreaterThan(0);
    expect(report.summary.metrics.averageConfidenceMargin).toBeGreaterThan(0);
    expect(report.summary.metrics.refinementCount).toBe(0);
    expect(serialized).not.toContain("\"reference\"");
    expect(serialized).not.toContain("\"expectedTranscript\"");
    expect(serialized).not.toContain("\"expected\"");
  });

  it("keeps accepted exact label when thresholds pass", () => {
    const recognition = createRecognitionResult({
      top1: {
        ...createRecognitionResult().topK[0]!,
        label: "hello",
        confidence: 0.86,
        baseConfidence: 0.86,
      },
      top2: {
        ...createRecognitionResult().topK[1]!,
        label: "thank-you",
        confidence: 0.52,
        baseConfidence: 0.52,
      },
    });
    const decision = createUncertaintyDecision({
      mode: "accept",
      acceptedText: "hello",
      primaryCandidate: recognition.top1,
      alternatives: recognition.topK,
      confidence: 0.86,
      margin: 0.34,
    });
    const segment = createBlindInferenceSegment({
      id: "seg-01",
      startMs: 0,
      endMs: 1000,
      recognition,
      decision,
      eventFamily: {
        label: "intro/greeting-like",
        confidence: 0.66,
        reason: "Greeting-like fixture.",
        channels: ["location", "handshape", "timing"],
        genericUnknown: false,
      },
    });
    const report = createBlindInferenceReportBase({
      clipName: "clip.mp4",
      clipDurationMs: 1000,
      notes: "accepted exact fixture",
      candidateSetSize: 5,
      segments: [segment],
      debug: {
        detectorInitStatus: "ready",
        totalFramesRequested: 6,
        framesAnalyzed: 6,
        framesSkipped: 0,
        duplicateTimestampsSkipped: 0,
        invalidTimestampsSkipped: 0,
        detectorFailures: 0,
        firstTimestampMs: 0,
        lastTimestampMs: 1000,
        warningsCount: 0,
        runtimeLogCount: 0,
        analysisWarnings: [],
      },
    });

    expect(report.segments[0]?.bestHypothesis).toBe("hello");
    expect(report.segmentHypothesisTranscript).toBe("hello");
  });

  it("tags likely blind failure sources from weak visibility and close competition", () => {
    const recognition = createRecognitionResult({
      encoded: createEncodedSequence({
        quality: {
          handVisibleRatio: 0.58,
          faceVisibleRatio: 0.62,
          poseVisibleRatio: 0.74,
          occlusionRatio: 0.34,
          motionEnergy: 0.22,
          mouthStability: 0.18,
          validFrameRatio: 0.54,
        },
      }),
    });
    const decision = createUncertaintyDecision({
      mode: "repair",
      primaryCandidate: recognition.top1,
      alternatives: recognition.topK,
      confidence: 0.56,
      margin: 0.04,
    });

    const segment = createBlindInferenceSegment({
      id: "seg-failure",
      startMs: 0,
      endMs: 900,
      recognition,
      decision,
      eventFamily: {
        label: "drink-like",
        confidence: 0.61,
        reason: "Fixture ingest hypothesis.",
        channels: ["mouthCue", "timing", "handshape"],
        genericUnknown: false,
      },
      runnerUpFamily: {
        label: "eat-like",
        confidence: 0.58,
        reason: "Fixture ingest runner-up.",
        channels: ["mouthCue", "motion", "handshape"],
        genericUnknown: false,
      },
      confidenceMargin: 0.04,
      debug: {
        framesAnalyzed: 6,
        skippedFrames: 2,
        detectorFailures: 0,
        extractorKind: "mock",
        firstTimestampMs: 0,
        lastTimestampMs: 900,
      },
    });

    expect(segment.failureTags).toContain("hand-visibility-weak");
    expect(segment.failureTags).toContain("mouth-face-cue-weak");
    expect(segment.failureTags).toContain("ingest-confusion");
    expect(segment.failureTags).toContain("low-confidence-competition");
    expect(segment.failureTags).toContain("segmentation-unstable");
  });
});
