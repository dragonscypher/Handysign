import {
  buildVocabularyPackSummary,
  compareExpectedConceptsToRecognition,
  assessReferenceCoverage,
  compareExpectedToRecognition,
  createVerificationReport,
  segmentModelOutput,
  updateVerificationReportDraft,
} from "@/lib/video/VerificationReport";
import {
  createRecognitionResult,
  createUncertaintyDecision,
} from "./testUtils";

function conceptEvaluation(overrides?: Partial<ReturnType<typeof compareExpectedConceptsToRecognition>>) {
  return {
    topConceptLabel: null,
    confidence: 0,
    uncertaintyReason: "Known candidates stayed too close.",
    result: "out-of-coverage" as const,
    expectedConcepts: [],
    hits: [],
    misses: [],
    recognizedConcepts: [],
    outOfCoverageConcepts: [],
    insufficientExampleConcepts: [],
    coverageRate: 0,
    ...overrides,
  };
}

describe("VerificationReport", () => {
  it("creates landmark-only report with summary metrics", () => {
    const report = createVerificationReport({
      clipName: "sample clip.mp4",
      clipDurationMs: 5000,
      notes: "Fixture benchmark report.",
      reference: {
        clipName: "sample clip.mp4",
        source: "local",
        notes: "Fixture reference.",
        segments: [
          { id: "seg-01", expected: "hello", useForCalibration: false },
          { id: "seg-02", expected: "thank-you", useForCalibration: false },
        ],
      },
      candidateSetSize: 5,
      vocabularyLabels: ["hello", "thank-you", "yes", "no", "help"],
      vocabularyPack: buildVocabularyPackSummary("sample-clip-benchmark", {
        "intro-greeting": 2,
      }),
      comparisonMode: "concept-level",
      segments: [
        {
          id: "seg-01",
          startMs: 0,
          endMs: 1000,
          expected: "hello",
          expectedConceptIds: ["intro-greeting"],
          modelOutput: "hello",
          predictedLabel: "hello",
          confidence: 0.82,
          alternatives: [],
          debtLabel: "Clean",
          uncertaintyReason: "Accepted known candidate.",
          matchResult: "exact",
          coverageStatus: "covered",
          comparisonReason: 'Expected reference overlaps accepted label "hello".',
          candidateSetSize: 5,
          usedForCalibration: false,
          conceptEvaluation: conceptEvaluation({
            result: "match",
            expectedConcepts: [{ id: "intro-greeting", label: "intro / greeting" }],
            hits: [{ id: "intro-greeting", label: "intro / greeting" }],
            recognizedConcepts: [{ id: "intro-greeting", label: "intro / greeting" }],
            coverageRate: 1,
          }),
        },
        {
          id: "seg-02",
          startMs: 1000,
          endMs: 2000,
          expected: "thank-you",
          expectedConceptIds: [],
          modelOutput: "uncertain: hello / thank-you",
          predictedLabel: "hello",
          confidence: 0.58,
          alternatives: [],
          debtLabel: "Debt: competing candidates",
          uncertaintyReason: "Known candidates stayed too close.",
          matchResult: "partial",
          coverageStatus: "covered",
          comparisonReason:
            'Expected reference partially overlaps accepted or alternate known candidate for "thank-you".',
          candidateSetSize: 5,
          usedForCalibration: false,
          conceptEvaluation: conceptEvaluation({
            result: "out-of-coverage",
          }),
        },
      ],
      debug: {
        detectorInitStatus: "ready",
        totalFramesRequested: 12,
        framesAnalyzed: 10,
        framesSkipped: 2,
        duplicateTimestampsSkipped: 0,
        invalidTimestampsSkipped: 0,
        detectorFailures: 0,
        firstTimestampMs: 0,
        lastTimestampMs: 2000,
        warningsCount: 0,
        runtimeLogCount: 0,
        analysisWarnings: [],
      },
    });

    expect(report.summary.segmentsProcessed).toBe(2);
    expect(report.summary.exactCount).toBe(1);
    expect(report.summary.partialCount).toBe(1);
    expect(report.summary.mismatchCount).toBe(0);
    expect(report.summary.averageConfidence).toBeGreaterThan(0);
    expect(report.conceptSummary.conceptMatchCount).toBe(1);
    expect(report.privacy.landmarkOnly).toBe(true);
    expect(report.privacy.rawVideoStored).toBe(false);
    expect(report.privacy.pixelDataStored).toBe(false);
  });

  it("compares expected text against constrained recognition honestly", () => {
    const recognition = createRecognitionResult();
    const accepted = createUncertaintyDecision({
      mode: "accept",
      primaryCandidate: recognition.top1,
      alternatives: recognition.topK,
    });
    const uncertain = createUncertaintyDecision({
      mode: "repair",
      primaryCandidate: recognition.top1,
      alternatives: recognition.topK,
    });

    expect(compareExpectedToRecognition("hello / greeting", recognition, accepted)).toBe("exact");
    expect(compareExpectedToRecognition("thank-you / greeting", recognition, accepted)).toBe(
      "partial",
    );
    expect(compareExpectedToRecognition("hello", recognition, uncertain)).toBe("uncertain");
    expect(
      compareExpectedToRecognition(
        "forest with axe and lunchbox",
        recognition,
        accepted,
        ["hello", "thank-you", "yes", "no", "help"],
      ),
    ).toBe("out-of-coverage");
    expect(
      assessReferenceCoverage("forest with axe and lunchbox", [
        "hello",
        "thank-you",
        "yes",
        "no",
        "help",
      ]).status,
    ).toBe("out-of-coverage");
    expect(segmentModelOutput(recognition, uncertain)).toMatch(/^uncertain:/i);
    expect(
      compareExpectedConceptsToRecognition({
        expectedConceptIds: ["intro-greeting"],
        vocabularyPack: buildVocabularyPackSummary("sample-clip-benchmark", {
          "intro-greeting": 2,
        }),
        recognition,
        decision: accepted,
      }).result,
    ).toBe("match");
  });

  it("updates edited expected reference and keeps match report in sync", () => {
    const report = createVerificationReport({
      clipName: "sample clip.mp4",
      clipDurationMs: 2000,
      notes: "Fixture benchmark report.",
      reference: {
        clipName: "sample clip.mp4",
        source: "local",
        notes: "Fixture reference.",
        segments: [{ id: "seg-01", expected: "forest story", useForCalibration: false }],
      },
      candidateSetSize: 5,
      vocabularyLabels: ["hello"],
      vocabularyPack: buildVocabularyPackSummary("sample-clip-benchmark"),
      comparisonMode: "concept-level",
      segments: [
        {
          id: "seg-01",
          startMs: 0,
          endMs: 1000,
          expected: "forest story",
          expectedConceptIds: [],
          modelOutput: "hello",
          predictedLabel: "hello",
          confidence: 0.8,
          alternatives: [],
          debtLabel: "Clean",
          uncertaintyReason: "Accepted known candidate.",
          matchResult: "out-of-coverage",
          coverageStatus: "out-of-coverage",
          comparisonReason: "Expected reference concepts sit outside current recognizer vocabulary.",
          candidateSetSize: 5,
          usedForCalibration: false,
          conceptEvaluation: conceptEvaluation({
            result: "out-of-coverage",
          }),
        },
      ],
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

    const updated = updateVerificationReportDraft(report, [
      { id: "seg-01", expected: "hello", useForCalibration: true },
    ]);

    expect(updated.reference.segments[0]?.expected).toBe("hello");
    expect(updated.segments[0]?.matchResult).toBe("exact");
    expect(updated.segments[0]?.coverageStatus).toBe("covered");
    expect(updated.segments[0]?.usedForCalibration).toBe(true);
    expect(updated.calibration.enabled).toBe(true);
  });

  it("counts uncertain and out-of-coverage segments as mismatches when expected text does not match", () => {
    const report = createVerificationReport({
      clipName: "sample clip.mp4",
      clipDurationMs: 3000,
      notes: "Fixture benchmark report.",
      reference: {
        clipName: "sample clip.mp4",
        source: "local",
        notes: "Fixture reference.",
        segments: [
          { id: "seg-01", expected: "forest intro", useForCalibration: false },
          { id: "seg-02", expected: "hello", useForCalibration: false },
          { id: "seg-03", expected: "drinks coffee", useForCalibration: false },
        ],
      },
      candidateSetSize: 5,
      vocabularyLabels: ["hello", "thank-you", "yes", "no", "help"],
      vocabularyPack: buildVocabularyPackSummary("sample-clip-benchmark"),
      comparisonMode: "concept-level",
      segments: [
        {
          id: "seg-01",
          startMs: 0,
          endMs: 1000,
          expected: "forest intro",
          expectedConceptIds: [],
          modelOutput: "uncertain: hello / thank-you",
          predictedLabel: "hello",
          confidence: 0.58,
          alternatives: [],
          debtLabel: "Debt: competing candidates",
          uncertaintyReason: "Known candidates stayed too close.",
          matchResult: "out-of-coverage",
          coverageStatus: "out-of-coverage",
          comparisonReason: "Expected reference concepts sit outside current recognizer vocabulary.",
          candidateSetSize: 5,
          usedForCalibration: false,
          conceptEvaluation: conceptEvaluation({
            result: "out-of-coverage",
          }),
        },
        {
          id: "seg-02",
          startMs: 1000,
          endMs: 2000,
          expected: "hello",
          expectedConceptIds: ["intro-greeting"],
          modelOutput: "uncertain: hello / thank-you",
          predictedLabel: "hello",
          confidence: 0.58,
          alternatives: [],
          debtLabel: "Debt: competing candidates",
          uncertaintyReason: "Known candidates stayed too close.",
          matchResult: "uncertain",
          coverageStatus: "covered",
          comparisonReason: "Segment stayed uncertain because known candidates stayed too close.",
          candidateSetSize: 5,
          usedForCalibration: false,
          conceptEvaluation: conceptEvaluation({
            result: "uncertain",
            expectedConcepts: [{ id: "intro-greeting", label: "intro / greeting" }],
            misses: [{ id: "intro-greeting", label: "intro / greeting" }],
          }),
        },
        {
          id: "seg-03",
          startMs: 2000,
          endMs: 3000,
          expected: "drinks coffee",
          expectedConceptIds: ["drink-coffee"],
          modelOutput: "hello",
          predictedLabel: "hello",
          confidence: 0.82,
          alternatives: [],
          debtLabel: "Clean",
          uncertaintyReason: "Accepted known candidate.",
          matchResult: "out-of-coverage",
          coverageStatus: "out-of-coverage",
          comparisonReason: "Expected reference concepts sit outside current recognizer vocabulary.",
          candidateSetSize: 5,
          usedForCalibration: false,
          conceptEvaluation: conceptEvaluation({
            result: "insufficient-examples",
            expectedConcepts: [{ id: "drink-coffee", label: "drink / coffee" }],
            misses: [{ id: "drink-coffee", label: "drink / coffee" }],
            insufficientExampleConcepts: [{ id: "drink-coffee", label: "drink / coffee" }],
          }),
        },
      ],
      debug: {
        detectorInitStatus: "ready",
        totalFramesRequested: 9,
        framesAnalyzed: 9,
        framesSkipped: 0,
        duplicateTimestampsSkipped: 0,
        invalidTimestampsSkipped: 0,
        detectorFailures: 0,
        firstTimestampMs: 0,
        lastTimestampMs: 3000,
        warningsCount: 0,
        runtimeLogCount: 0,
        analysisWarnings: [],
      },
    });

    expect(report.summary.uncertainSegments).toBe(1);
    expect(report.summary.outOfCoverageCount).toBe(2);
    expect(report.summary.mismatchCount).toBe(3);
    expect(report.coverage.limited).toBe(true);
  });

  it("keeps concept coverage on held-out segments separate from calibration segments", () => {
    const report = createVerificationReport({
      reference: {
        clipName: "sample clip.mp4",
        source: "local",
        notes: "Fixture reference.",
        segments: [
          { id: "seg-01", expected: "story intro / greeting", conceptIds: ["intro-greeting"], useForCalibration: true },
          { id: "seg-02", expected: "drinks coffee", conceptIds: ["drink-coffee"], useForCalibration: false },
        ],
      },
      segments: [
        {
          id: "seg-01",
          startMs: 0,
          endMs: 1000,
          expected: "story intro / greeting",
          expectedConceptIds: ["intro-greeting"],
          modelOutput: "hello",
          predictedLabel: "hello",
          confidence: 0.8,
          alternatives: [],
          debtLabel: "Clean",
          uncertaintyReason: "Accepted known candidate.",
          matchResult: "exact",
          coverageStatus: "covered",
          comparisonReason: "Expected reference overlaps accepted label \"hello\".",
          candidateSetSize: 5,
          usedForCalibration: true,
          conceptEvaluation: conceptEvaluation({
            result: "match",
            expectedConcepts: [{ id: "intro-greeting", label: "intro / greeting" }],
            hits: [{ id: "intro-greeting", label: "intro / greeting" }],
            coverageRate: 1,
          }),
        },
        {
          id: "seg-02",
          startMs: 1000,
          endMs: 2000,
          expected: "drinks coffee",
          expectedConceptIds: ["drink-coffee"],
          modelOutput: "uncertain: no stable candidate",
          predictedLabel: null,
          confidence: 0,
          alternatives: [],
          debtLabel: "Debt: motion too short",
          uncertaintyReason: "Segment stayed uncertain because the candidate set is too small.",
          matchResult: "uncertain",
          coverageStatus: "covered",
          comparisonReason: "Segment stayed uncertain because the candidate set is too small.",
          candidateSetSize: 5,
          usedForCalibration: false,
          conceptEvaluation: conceptEvaluation({
            result: "partial",
            expectedConcepts: [{ id: "drink-coffee", label: "drink / coffee" }],
            hits: [{ id: "drink-coffee", label: "drink / coffee" }],
            coverageRate: 1,
          }),
        },
      ],
      calibrationSegmentIds: ["seg-01"],
      vocabularyPack: buildVocabularyPackSummary("sample-clip-benchmark", {
        "intro-greeting": 2,
        "drink-coffee": 2,
      }),
    });

    expect(report.conceptSummary.conceptMatchCount).toBe(0);
    expect(report.conceptSummary.conceptPartialCount).toBe(1);
    expect(report.conceptSummary.heldOutComparableConcepts).toBe(1);
    expect(report.calibration.heldOutSegmentIds).toEqual(["seg-02"]);
  });
});
