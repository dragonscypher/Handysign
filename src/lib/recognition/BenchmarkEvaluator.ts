import { featureEncoder } from "@/lib/features/FeatureEncoder";
import { averageVectors } from "@/lib/features/normalize";
import {
  buildSessionCandidate,
  mergeCandidateCatalog,
  type PrototypeStore,
} from "@/lib/recognition/PrototypeStore";
import { candidateRecognizer } from "@/lib/recognition/CandidateRecognizer";
import type {
  CandidatePrototype,
  EncodedSequence,
  RecognitionResult,
} from "@/lib/recognition/types";
import { UncertaintyEngine, type UncertaintyDecision } from "@/lib/uncertainty/UncertaintyEngine";
import {
  createHolisticDetector,
  createLandmarkFrameFromHolisticResult,
} from "@/lib/landmarks/holisticRuntime";
import type { LandmarkFrame } from "@/lib/landmarks/types";
import {
  inspectVideoFrameForAnalysis,
  loadClipFile,
  seekVideo,
  type LoadedClip,
} from "@/lib/video/ClipLoader";
import { segmentLandmarkFrames } from "@/lib/video/Segmenter";
import {
  buildVocabularyPackSummary,
  compareExpectedConceptsToRecognition,
  describeVerificationComparison,
  assessReferenceCoverage,
  compareExpectedToRecognition,
  createVerificationReport,
  segmentModelOutput,
  toVerificationAlternatives,
  type VerificationReportDebug,
  type VerificationReference,
  type VerificationReport,
  type VerificationSegmentDebug,
  type VerificationSegmentResult,
  type VerificationComparisonMode,
  type VerificationVocabularyPackSummary,
} from "@/lib/video/VerificationReport";
import {
  decodeBlindSemantics,
  type BlindLexemeMemory,
} from "@/lib/recognition/BlindSemanticDecoder";
import {
  buildBlindEventSummary,
  createBlindInferenceReport,
  createBlindInferenceSegment,
  type BlindInferenceReport,
} from "@/lib/video/BlindInferenceReport";
import {
  DEFAULT_BENCHMARK_VOCABULARY_PACK_ID,
  getBenchmarkVocabularyPack,
  matchConceptsForText,
  type BenchmarkVocabularyPackId,
} from "@/lib/benchmarks/vocabularyPacks";
import type { BlindSessionAnchor } from "@/lib/recognition/BlindHypothesis";

export interface BenchmarkAnalysisSegment {
  id: string;
  startMs: number;
  endMs: number;
  frames: LandmarkFrame[];
  averageMotion: number;
  peakMotion: number;
  holdRatio: number;
  directionChanges: number;
  encoded: EncodedSequence;
  baselineRecognition: RecognitionResult;
  baselineDecision: UncertaintyDecision;
  debug: VerificationSegmentDebug;
}

export interface BenchmarkRuntimeLog {
  level: "info" | "warning";
  context: string;
  message: string;
}

export interface BenchmarkAnalysisDebug {
  detectorInitStatus: VerificationReportDebug["detectorInitStatus"];
  runtimeLogs: BenchmarkRuntimeLog[];
  analysisWarnings: string[];
  frameStats: Omit<VerificationReportDebug, "detectorInitStatus" | "warningsCount" | "runtimeLogCount" | "analysisWarnings">;
}

export interface BenchmarkAnalysis {
  clipName: string;
  clipDurationMs: number;
  extractorKind: "holistic" | "mock";
  notes: string[];
  candidateCatalog: CandidatePrototype[];
  segments: BenchmarkAnalysisSegment[];
  reference: VerificationReference;
  debug: BenchmarkAnalysisDebug;
}

export interface AnalyzeClipOptions {
  file: File;
  reference: VerificationReference;
  prototypeStore: PrototypeStore;
  forceMockLandmarks?: boolean;
  forceMockVerification?: boolean;
}

export interface AnalyzeBlindClipOptions {
  file: File;
  prototypeStore: PrototypeStore;
  forceMockLandmarks?: boolean;
  forceMockVerification?: boolean;
}

export interface BuildVerificationReportOptions {
  calibrationSegmentIds?: string[];
  vocabularyPackId?: BenchmarkVocabularyPackId;
  comparisonMode?: VerificationComparisonMode;
}

function point(x: number, y: number, z = 0) {
  return { x, y, z };
}

const NON_FATAL_RUNTIME_INFO = [
  /^INFO:/i,
  /TensorFlow Lite XNNPACK delegate/i,
] as const;

const NON_FATAL_RUNTIME_WARNINGS = [
  /^WARNING:/i,
  /NORM_RECT/i,
  /Feedback manager requires a model with a single signature inference/i,
  /Inference feedback/i,
] as const;

function formatRuntimeLog(args: unknown[]) {
  return args
    .map((value) => {
      if (value instanceof Error) {
        return value.message;
      }

      if (typeof value === "string") {
        return value;
      }

      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    })
    .join(" ")
    .trim();
}

export function classifyClipRuntimeLog(args: unknown[]) {
  const message = formatRuntimeLog(args);

  if (!message) {
    return null;
  }

  if (NON_FATAL_RUNTIME_INFO.some((pattern) => pattern.test(message))) {
    return {
      level: "info" as const,
      message,
    };
  }

  if (NON_FATAL_RUNTIME_WARNINGS.some((pattern) => pattern.test(message))) {
    return {
      level: "warning" as const,
      message,
    };
  }

  return null;
}

function createEmptyDebug(): BenchmarkAnalysisDebug {
  return {
    detectorInitStatus: "failed",
    runtimeLogs: [],
    analysisWarnings: [],
    frameStats: {
      totalFramesRequested: 0,
      framesAnalyzed: 0,
      framesSkipped: 0,
      duplicateTimestampsSkipped: 0,
      invalidTimestampsSkipped: 0,
      detectorFailures: 0,
      firstTimestampMs: null,
      lastTimestampMs: null,
    },
  };
}

function pushAnalysisWarning(debug: BenchmarkAnalysisDebug, warning: string) {
  if (!debug.analysisWarnings.includes(warning)) {
    debug.analysisWarnings.push(warning);
  }
}

export function captureClipRuntimeLogs<T>(
  context: string,
  debug: BenchmarkAnalysisDebug,
  action: () => T | Promise<T>,
) {
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalInfo = console.info;
  const restore = () => {
    console.error = originalError;
    console.warn = originalWarn;
    console.info = originalInfo;
  };

  console.error = (...args: unknown[]) => {
    const classified = classifyClipRuntimeLog(args);

    if (classified) {
      debug.runtimeLogs.push({
        level: classified.level,
        context,
        message: classified.message,
      });

      if (classified.level === "warning") {
        originalWarn("[Verify runtime warning]", classified.message);
      } else {
        originalInfo("[Verify runtime info]", classified.message);
      }
      return;
    }

    originalError(...args);
  };

  console.warn = (...args: unknown[]) => {
    const classified = classifyClipRuntimeLog(args);

    if (classified) {
      debug.runtimeLogs.push({
        level: classified.level,
        context,
        message: classified.message,
      });
      originalWarn("[Verify runtime warning]", classified.message);
      return;
    }

    originalWarn(...args);
  };

  try {
    const result = action();

    if (result instanceof Promise) {
      return result.finally(restore);
    }

    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

function createMockClipFrame(
  timestamp: number,
  frameIndex: number,
  segmentIndex: number,
): LandmarkFrame {
  const drift = (frameIndex % 8) * 0.014;
  const baseX = 0.4 + segmentIndex * 0.028 + drift;
  const baseY = 0.34 + ((frameIndex % 5) - 2) * 0.01;
  const hand = [
    point(baseX, baseY),
    point(baseX + 0.01, baseY - 0.01),
    point(baseX + 0.02, baseY - 0.03),
    point(baseX + 0.03, baseY - 0.05),
    point(baseX + 0.05, baseY - 0.07),
    point(baseX + 0.01, baseY - 0.03),
    point(baseX + 0.015, baseY - 0.06),
    point(baseX + 0.02, baseY - 0.09),
    point(baseX + 0.03, baseY - 0.11),
    point(baseX, baseY - 0.03),
    point(baseX, baseY - 0.06),
    point(baseX, baseY - 0.09),
    point(baseX, baseY - 0.12),
    point(baseX - 0.01, baseY - 0.03),
    point(baseX - 0.015, baseY - 0.06),
    point(baseX - 0.02, baseY - 0.09),
    point(baseX - 0.025, baseY - 0.11),
    point(baseX - 0.02, baseY - 0.02),
    point(baseX - 0.03, baseY - 0.04),
    point(baseX - 0.04, baseY - 0.06),
    point(baseX - 0.05, baseY - 0.08),
  ];
  const faceLandmarks = Array.from({ length: 478 }, () => point(0.5, 0.35));

  faceLandmarks[13] = point(0.5, 0.39 - 0.01);
  faceLandmarks[14] = point(0.5, 0.39 + 0.01);
  faceLandmarks[61] = point(0.46, 0.39);
  faceLandmarks[291] = point(0.54, 0.39);

  return {
    timestamp,
    hands: [
      {
        handedness: "right",
        landmarks: hand,
      },
    ],
    face: {
      landmarks: faceLandmarks,
      blendshapes: {
        jawOpen: 0.12,
        browInnerUp: 0.1,
      },
    },
    mouth: [faceLandmarks[13]!, faceLandmarks[14]!, faceLandmarks[61]!, faceLandmarks[291]!],
    pose: {
      landmarks: [
        point(0.42, 0.44),
        point(0.58, 0.44),
        point(0.46, 0.72),
        point(0.54, 0.72),
      ],
    },
    quality: {
      extractorKind: "mock",
      isDemoMode: true,
      handVisible: true,
      faceVisible: true,
      poseVisible: true,
    },
    frameIndex,
    mirrored: true,
  };
}

async function extractFramesFromClip(
  loadedClip: LoadedClip,
  options: {
    forceMockLandmarks?: boolean;
    mockSegmentCount?: number;
  } = {},
) {
  const frames: LandmarkFrame[] = [];
  const notes: string[] = [];
  const debug = createEmptyDebug();
  let extractorKind: "holistic" | "mock" = "holistic";
  let detector: Awaited<ReturnType<typeof createHolisticDetector>> | null = null;
  const fps = 6;
  const sampleStepMs = 1000 / fps;
  const mockSegmentCount = options.mockSegmentCount ?? 5;

  try {
    if (!options.forceMockLandmarks) {
      detector = await captureClipRuntimeLogs("detector-init", debug, () =>
        createHolisticDetector(),
      );
      debug.detectorInitStatus = "ready";
    } else {
      throw new Error("Forced mock landmark verification.");
    }
  } catch (error) {
    extractorKind = "mock";
    debug.detectorInitStatus = "mock-fallback";
    notes.push(
      "Verification used mock landmark extraction fallback because MediaPipe clip processing was unavailable.",
    );
    pushAnalysisWarning(
      debug,
      error instanceof Error ? error.message : "MediaPipe detector init failed.",
    );
  }

  try {
    const sampleCount = Math.max(
      18,
      Math.min(140, Math.ceil(loadedClip.durationMs / sampleStepMs)),
    );
    let previousTimestamp: number | null = null;

    debug.frameStats.totalFramesRequested = sampleCount;

    for (let index = 0; index < sampleCount; index += 1) {
      const rawTimestamp = Math.min(
        index * sampleStepMs,
        Math.max(loadedClip.durationMs - 40, 0),
      );

      if (!Number.isFinite(rawTimestamp)) {
        debug.frameStats.invalidTimestampsSkipped += 1;
        debug.frameStats.framesSkipped += 1;
        pushAnalysisWarning(
          debug,
          `Skipped non-finite frame timestamp at request index ${index}.`,
        );
        continue;
      }

      const timestamp = Number(rawTimestamp.toFixed(2));

      if (previousTimestamp !== null && Math.abs(timestamp - previousTimestamp) < 0.5) {
        debug.frameStats.duplicateTimestampsSkipped += 1;
        debug.frameStats.framesSkipped += 1;
        continue;
      }

      previousTimestamp = timestamp;

      if (detector) {
        try {
          await seekVideo(loadedClip.video, timestamp / 1000);
        } catch (error) {
          debug.frameStats.framesSkipped += 1;
          pushAnalysisWarning(
            debug,
            `Skipped ${timestamp}ms because clip seek or decode was not ready: ${error instanceof Error ? error.message : "unknown error"}`,
          );
          continue;
        }

        const guard = inspectVideoFrameForAnalysis(loadedClip.video, timestamp / 1000);

        if (!guard.ok) {
          debug.frameStats.framesSkipped += 1;
          pushAnalysisWarning(
            debug,
            `Skipped ${timestamp}ms because frame guard failed: ${guard.reason}. ${guard.details ?? ""}`.trim(),
          );
          continue;
        }
      }

      if (detector) {
        try {
          const result = await captureClipRuntimeLogs(
            `detectForVideo@${timestamp}ms`,
            debug,
            () => detector.detectForVideo(loadedClip.video, timestamp),
          );
          frames.push(
            createLandmarkFrameFromHolisticResult(result, timestamp, index, "holistic"),
          );
          debug.frameStats.framesAnalyzed += 1;
          debug.frameStats.firstTimestampMs ??= timestamp;
          debug.frameStats.lastTimestampMs = timestamp;
        } catch (error) {
          debug.frameStats.detectorFailures += 1;
          debug.frameStats.framesSkipped += 1;
          pushAnalysisWarning(
            debug,
            `Detector failed at ${timestamp}ms: ${error instanceof Error ? error.message : "unknown error"}`,
          );
        }
      } else {
        const referenceSegmentIndex = Math.min(
          mockSegmentCount - 1,
          Math.floor((index / Math.max(sampleCount - 1, 1)) * mockSegmentCount),
        );
        frames.push(createMockClipFrame(timestamp, index, referenceSegmentIndex));
        debug.frameStats.framesAnalyzed += 1;
        debug.frameStats.firstTimestampMs ??= timestamp;
        debug.frameStats.lastTimestampMs = timestamp;
      }
    }
  } finally {
    detector?.close?.();
  }

  notes.push(
    `Frame extraction requested ${debug.frameStats.totalFramesRequested} frame(s), analyzed ${debug.frameStats.framesAnalyzed}, skipped ${debug.frameStats.framesSkipped}.`,
  );

  if (!frames.length) {
    throw new Error(
      "Verify could not extract any analyzable landmark frames from uploaded clip.",
    );
  }

  return { frames, extractorKind, notes, debug };
}

function calibrationCandidatesFromAnalysis(
  analysis: BenchmarkAnalysis,
  calibrationSegmentIds: string[],
) {
  if (!calibrationSegmentIds.length) {
    return [];
  }

  return calibrationSegmentIds
    .map((segmentId) => {
      const analysisSegment = analysis.segments.find((segment) => segment.id === segmentId);
      const referenceSegment = analysis.reference.segments.find((segment) => segment.id === segmentId);

      if (!analysisSegment || !referenceSegment?.expected.trim()) {
        return null;
      }

      return buildSessionCandidate(referenceSegment.expected.trim(), [analysisSegment.encoded]);
    })
    .filter((candidate): candidate is CandidatePrototype => Boolean(candidate));
}

function benchmarkConceptCandidatesFromAnalysis(
  analysis: BenchmarkAnalysis,
  calibrationSegmentIds: string[],
  vocabularyPackId: BenchmarkVocabularyPackId,
) {
  const pack = getBenchmarkVocabularyPack(vocabularyPackId);
  const conceptExampleCounts: Record<string, number> = {};

  const candidates = pack.concepts
    .map((concept) => {
      const calibrationExamples = analysis.segments
        .map((segment, index) => ({
          segment,
          referenceSegment: analysis.reference.segments[index],
        }))
        .filter(
          ({ segment, referenceSegment }) =>
            calibrationSegmentIds.includes(segment.id) &&
            Boolean(referenceSegment?.conceptIds?.includes(concept.id)),
        );
      const seedCandidates = analysis.candidateCatalog.filter((candidate) =>
        matchConceptsForText(pack, candidate.label).some(
          (matchedConcept) => matchedConcept.id === concept.id,
        ),
      );
      const centroids = [
        ...seedCandidates.map((candidate) => candidate.centroid),
        ...calibrationExamples.map(({ segment }) => segment.encoded.centroid),
      ];

      conceptExampleCounts[concept.id] = centroids.length;

      if (!centroids.length) {
        return null;
      }

      return {
        id: `benchmark-concept-${concept.id}`,
        label: concept.label,
        source: "session" as const,
        centroid: averageVectors(centroids),
        metadata: {
          notes:
            centroids.length < 2
              ? "Benchmark concept prototype has only one example. Treat concept hit as weak."
              : "Benchmark concept prototype built from selected calibration segments and constrained aliases.",
        },
        examplesCount: centroids.length,
        correctionBoost: centroids.length >= 2 ? 0.04 : 0.01,
        updatedAt: new Date().toISOString(),
      } satisfies CandidatePrototype;
    })
    .filter((candidate) => Boolean(candidate)) as CandidatePrototype[];

  return {
    candidates,
    vocabularyPack: buildVocabularyPackSummary(vocabularyPackId, conceptExampleCounts),
  };
}

function toVerificationSegment(
  analysisSegment: BenchmarkAnalysisSegment,
  referenceSegment: VerificationReference["segments"][number] | undefined,
  recognition: RecognitionResult,
  decision: UncertaintyDecision,
  conceptRecognition: RecognitionResult,
  conceptDecision: UncertaintyDecision,
  vocabularyPack: VerificationVocabularyPackSummary,
  vocabularyLabels: string[],
  candidateSetSize: number,
  usedForCalibration: boolean,
): VerificationSegmentResult {
  const expected = referenceSegment?.expected ?? "";
  const expectedConceptIds = referenceSegment?.conceptIds ?? [];
  const coverage = assessReferenceCoverage(expected, vocabularyLabels);
  const matchResult = compareExpectedToRecognition(
    expected,
    recognition,
    decision,
    vocabularyLabels,
  );
  const conceptEvaluation = compareExpectedConceptsToRecognition({
    expectedConceptIds,
    vocabularyPack,
    recognition: conceptRecognition,
    decision: conceptDecision,
  });

  return {
    id: analysisSegment.id,
    startMs: analysisSegment.startMs,
    endMs: analysisSegment.endMs,
    expected,
    expectedConceptIds,
    modelOutput: segmentModelOutput(recognition, decision),
    predictedLabel: recognition.top1?.label ?? null,
    confidence: Number((recognition.top1?.confidence ?? 0).toFixed(4)),
    alternatives: toVerificationAlternatives(recognition.topK),
    debtLabel: decision.debtLabel,
    uncertaintyReason: decision.message,
    matchResult,
    coverageStatus: coverage.status,
    comparisonReason: describeVerificationComparison(
      matchResult,
      coverage.status,
      decision,
      expected,
      recognition.top1?.label ?? null,
    ),
    candidateSetSize,
    usedForCalibration,
    conceptEvaluation,
    debug: analysisSegment.debug,
  };
}

export class BenchmarkEvaluator {
  async analyzeClip({
    file,
    reference,
    prototypeStore,
    forceMockLandmarks = false,
    forceMockVerification = false,
  }: AnalyzeClipOptions): Promise<BenchmarkAnalysis> {
    const personalCandidates = await prototypeStore.loadPersonalCandidates();
    const candidateCatalog = mergeCandidateCatalog(personalCandidates);
    const uncertainty = new UncertaintyEngine();

    if (forceMockVerification) {
      const debug = createEmptyDebug();
      debug.detectorInitStatus = "mock-fallback";
      debug.frameStats.totalFramesRequested = reference.segments.length * 10;
      debug.frameStats.framesAnalyzed = reference.segments.length * 10;
      debug.frameStats.firstTimestampMs = 0;
      debug.frameStats.lastTimestampMs = reference.segments.length * 1200;

      return {
        clipName: file.name,
        clipDurationMs: reference.segments.length * 1200,
        extractorKind: "mock",
        notes: [
          "Verification used mock clip analysis fallback for browser QA. Treat this as benchmark UI smoke only.",
        ],
        candidateCatalog,
        reference,
        debug,
        segments: reference.segments.map((referenceSegment, index) => {
          const frames = Array.from({ length: 10 }, (_, frameIndex) =>
            createMockClipFrame(index * 1200 + frameIndex * 120, index * 10 + frameIndex, index),
          );
          const encoded = featureEncoder.encode(frames);
          const baselineRecognition = candidateRecognizer.recognize(encoded, {
            topK: 3,
            candidates: candidateCatalog,
          });
          const baselineDecision = uncertainty.evaluate(
            baselineRecognition,
            encoded.quality,
          );

          return {
            id: referenceSegment.id,
            startMs: index * 1200,
            endMs: index * 1200 + 1080,
            frames,
            averageMotion: 0.022,
            peakMotion: 0.048,
            holdRatio: 0.24,
            directionChanges: 1,
            encoded,
            baselineRecognition,
            baselineDecision,
            debug: {
              framesAnalyzed: frames.length,
              skippedFrames: 0,
              detectorFailures: 0,
              extractorKind: "mock",
              firstTimestampMs: frames[0]?.timestamp ?? null,
              lastTimestampMs: frames.at(-1)?.timestamp ?? null,
            },
          };
        }),
      };
    }

    const loadedClip = await loadClipFile(file);

    try {
      const extraction = await extractFramesFromClip(loadedClip, {
        forceMockLandmarks,
        mockSegmentCount: reference.segments.length,
      });
      const segments = segmentLandmarkFrames(extraction.frames, {
        targetSegments: reference.segments.length,
      });

      return {
        clipName: file.name,
        clipDurationMs: loadedClip.durationMs,
        extractorKind: extraction.extractorKind,
        notes: extraction.notes,
        candidateCatalog,
        reference,
        debug: extraction.debug,
        segments: segments.map((segment) => {
          const encoded = featureEncoder.encode(segment.frames);
          const baselineRecognition = candidateRecognizer.recognize(encoded, {
            topK: 3,
            candidates: candidateCatalog,
          });
          const baselineDecision = uncertainty.evaluate(
            baselineRecognition,
            encoded.quality,
          );

          return {
            id: segment.id,
            startMs: segment.startMs,
            endMs: segment.endMs,
            frames: segment.frames,
            averageMotion: segment.averageMotion,
            peakMotion: segment.peakMotion,
            holdRatio: segment.holdRatio,
            directionChanges: segment.directionChanges,
            encoded,
            baselineRecognition,
            baselineDecision,
            debug: {
              framesAnalyzed: segment.frames.length,
              skippedFrames: 0,
              detectorFailures: 0,
              extractorKind: extraction.extractorKind,
              firstTimestampMs: segment.frames[0]?.timestamp ?? null,
              lastTimestampMs: segment.frames.at(-1)?.timestamp ?? null,
            },
          };
        }),
      };
    } finally {
      loadedClip.cleanup();
    }
  }

  async analyzeBlindClip({
    file,
    prototypeStore,
    forceMockLandmarks = false,
    forceMockVerification = false,
  }: AnalyzeBlindClipOptions): Promise<Omit<BenchmarkAnalysis, "reference">> {
    const personalCandidates = await prototypeStore.loadPersonalCandidates();
    const candidateCatalog = mergeCandidateCatalog(personalCandidates);
    const uncertainty = new UncertaintyEngine();

    if (forceMockVerification) {
      const debug = createEmptyDebug();
      const frames = Array.from({ length: 42 }, (_, index) =>
        createMockClipFrame(index * 140, index, Math.floor(index / 8)),
      );
      const segments = segmentLandmarkFrames(frames, {
        mode: "blind",
        minFramesPerSegment: 7,
        pauseFrameStreak: 3,
        lowMotionThreshold: 0.007,
        maxFramesPerSegment: 14,
      });

      debug.detectorInitStatus = "mock-fallback";
      debug.frameStats.totalFramesRequested = frames.length;
      debug.frameStats.framesAnalyzed = frames.length;
      debug.frameStats.firstTimestampMs = frames[0]?.timestamp ?? null;
      debug.frameStats.lastTimestampMs = frames.at(-1)?.timestamp ?? null;

      return {
        clipName: file.name,
        clipDurationMs: frames.at(-1)?.timestamp ?? 0,
        extractorKind: "mock",
        notes: [
          "Blind inference used mock clip analysis fallback for browser QA. Treat this as blind-UX smoke only.",
        ],
        candidateCatalog,
        debug,
        segments: segments.map((segment) => {
          const encoded = featureEncoder.encode(segment.frames);
          const baselineRecognition = candidateRecognizer.recognize(encoded, {
            topK: 3,
            candidates: candidateCatalog,
          });
          const baselineDecision = uncertainty.evaluate(
            baselineRecognition,
            encoded.quality,
          );

          return {
            id: segment.id,
            startMs: segment.startMs,
            endMs: segment.endMs,
            frames: segment.frames,
            averageMotion: segment.averageMotion,
            peakMotion: segment.peakMotion,
            holdRatio: segment.holdRatio,
            directionChanges: segment.directionChanges,
            encoded,
            baselineRecognition,
            baselineDecision,
            debug: {
              framesAnalyzed: segment.frames.length,
              skippedFrames: 0,
              detectorFailures: 0,
              extractorKind: "mock",
              firstTimestampMs: segment.frames[0]?.timestamp ?? null,
              lastTimestampMs: segment.frames.at(-1)?.timestamp ?? null,
            },
          };
        }),
      };
    }

    const loadedClip = await loadClipFile(file);

    try {
      const extraction = await extractFramesFromClip(loadedClip, {
        forceMockLandmarks,
        mockSegmentCount: 6,
      });
      const segments = segmentLandmarkFrames(extraction.frames, {
        mode: "blind",
        minFramesPerSegment: 10,
        pauseFrameStreak: 5,
        lowMotionThreshold: 0.0065,
        maxFramesPerSegment: 22,
      });

      return {
        clipName: file.name,
        clipDurationMs: loadedClip.durationMs,
        extractorKind: extraction.extractorKind,
        notes: extraction.notes,
        candidateCatalog,
        debug: extraction.debug,
        segments: segments.map((segment) => {
          const encoded = featureEncoder.encode(segment.frames);
          const baselineRecognition = candidateRecognizer.recognize(encoded, {
            topK: 3,
            candidates: candidateCatalog,
          });
          const baselineDecision = uncertainty.evaluate(
            baselineRecognition,
            encoded.quality,
          );

          return {
            id: segment.id,
            startMs: segment.startMs,
            endMs: segment.endMs,
            frames: segment.frames,
            averageMotion: segment.averageMotion,
            peakMotion: segment.peakMotion,
            holdRatio: segment.holdRatio,
            directionChanges: segment.directionChanges,
            encoded,
            baselineRecognition,
            baselineDecision,
            debug: {
              framesAnalyzed: segment.frames.length,
              skippedFrames: 0,
              detectorFailures: 0,
              extractorKind: extraction.extractorKind,
              firstTimestampMs: segment.frames[0]?.timestamp ?? null,
              lastTimestampMs: segment.frames.at(-1)?.timestamp ?? null,
            },
          };
        }),
      };
    } finally {
      loadedClip.cleanup();
    }
  }

  buildReport(
    analysis: BenchmarkAnalysis,
    options: BuildVerificationReportOptions = {},
  ): VerificationReport {
    const calibrationSegmentIds = options.calibrationSegmentIds ?? [];
    const vocabularyPackId =
      options.vocabularyPackId ?? DEFAULT_BENCHMARK_VOCABULARY_PACK_ID;
    const comparisonMode = options.comparisonMode ?? "concept-level";
    const calibrationCandidates = calibrationCandidatesFromAnalysis(
      analysis,
      calibrationSegmentIds,
    );
    const conceptCalibration = benchmarkConceptCandidatesFromAnalysis(
      analysis,
      calibrationSegmentIds,
      vocabularyPackId,
    );
    const heldOutUncertainty = new UncertaintyEngine();
    const baselineSegments = analysis.segments.map((analysisSegment, index) =>
      toVerificationSegment(
        analysisSegment,
        analysis.reference.segments[index],
        analysisSegment.baselineRecognition,
        analysisSegment.baselineDecision,
        analysisSegment.baselineRecognition,
        analysisSegment.baselineDecision,
        conceptCalibration.vocabularyPack,
        analysis.candidateCatalog.map((candidate) => candidate.label),
        analysis.candidateCatalog.length,
        calibrationSegmentIds.includes(analysisSegment.id),
      ),
    );
    const effectiveCatalog = calibrationCandidates.length
      ? mergeCandidateCatalog(
          analysis.candidateCatalog.filter((candidate) => candidate.source === "personal"),
          calibrationCandidates,
        )
      : analysis.candidateCatalog;
    const effectiveConceptCatalog = conceptCalibration.candidates.length
      ? conceptCalibration.candidates
      : analysis.candidateCatalog;
    const calibratedSegments = analysis.segments.map((analysisSegment, index) => {
      const referenceSegment = analysis.reference.segments[index];
      const usedForCalibration = calibrationSegmentIds.includes(analysisSegment.id);

      const exactRecognition =
        !calibrationCandidates.length || usedForCalibration
          ? analysisSegment.baselineRecognition
          : candidateRecognizer.recognize(analysisSegment.encoded, {
              topK: 3,
              candidates: effectiveCatalog,
            });
      const exactDecision =
        !calibrationCandidates.length || usedForCalibration
          ? analysisSegment.baselineDecision
          : heldOutUncertainty.evaluate(exactRecognition, analysisSegment.encoded.quality);
      const conceptRecognition =
        !conceptCalibration.candidates.length || usedForCalibration
          ? analysisSegment.baselineRecognition
          : candidateRecognizer.recognize(analysisSegment.encoded, {
              topK: 3,
              candidates: effectiveConceptCatalog,
            });
      const conceptDecision =
        !conceptCalibration.candidates.length || usedForCalibration
          ? analysisSegment.baselineDecision
          : heldOutUncertainty.evaluate(conceptRecognition, analysisSegment.encoded.quality);

      if (
        (!calibrationCandidates.length && !conceptCalibration.candidates.length) ||
        usedForCalibration
      ) {
        return toVerificationSegment(
          analysisSegment,
          referenceSegment,
          exactRecognition,
          exactDecision,
          conceptRecognition,
          conceptDecision,
          conceptCalibration.vocabularyPack,
          effectiveCatalog.map((candidate) => candidate.label),
          effectiveCatalog.length,
          usedForCalibration,
        );
      }

      return toVerificationSegment(
        analysisSegment,
        referenceSegment,
        exactRecognition,
        exactDecision,
        conceptRecognition,
        conceptDecision,
        conceptCalibration.vocabularyPack,
        effectiveCatalog.map((candidate) => candidate.label),
        effectiveCatalog.length,
        false,
      );
    });

    return createVerificationReport({
      clipName: analysis.clipName,
      clipDurationMs: analysis.clipDurationMs,
      notes: [
        `Benchmark verification processed ${analysis.segments.length} landmark segments.`,
        analysis.extractorKind === "mock"
          ? "Verify ran in demo fallback. Treat results as benchmark UI smoke, not clip-level sign understanding."
          : "Verify used on-device landmark extraction on uploaded clip.",
        `Current constrained candidate set has ${effectiveCatalog.length} labels.`,
        ...analysis.notes,
      ].join(" "),
      reference: analysis.reference,
      candidateSetSize: effectiveCatalog.length,
      vocabularyLabels: effectiveCatalog.map((candidate) => candidate.label),
      vocabularyPack: conceptCalibration.vocabularyPack,
      comparisonMode,
      segments: calibratedSegments,
      calibrationSegmentIds,
      baselineHeldOutSegments: baselineSegments,
      debug: {
        detectorInitStatus: analysis.debug.detectorInitStatus,
        totalFramesRequested: analysis.debug.frameStats.totalFramesRequested,
        framesAnalyzed: analysis.debug.frameStats.framesAnalyzed,
        framesSkipped: analysis.debug.frameStats.framesSkipped,
        duplicateTimestampsSkipped: analysis.debug.frameStats.duplicateTimestampsSkipped,
        invalidTimestampsSkipped: analysis.debug.frameStats.invalidTimestampsSkipped,
        detectorFailures: analysis.debug.frameStats.detectorFailures,
        firstTimestampMs: analysis.debug.frameStats.firstTimestampMs,
        lastTimestampMs: analysis.debug.frameStats.lastTimestampMs,
        warningsCount: analysis.debug.analysisWarnings.length,
        runtimeLogCount: analysis.debug.runtimeLogs.length,
        analysisWarnings: analysis.debug.analysisWarnings,
      },
    });
  }

  buildBlindReport(
    analysis: Omit<BenchmarkAnalysis, "reference">,
    options: {
      sessionAnchors?: BlindSessionAnchor[];
      savedLexemeMemories?: BlindLexemeMemory[];
    } = {},
  ): BlindInferenceReport {
    const eventSummary = buildBlindEventSummary(
      analysis.segments.map((segment) => ({
        id: segment.id,
        startMs: segment.startMs,
        endMs: segment.endMs,
        encoded: segment.encoded,
        averageMotion: segment.averageMotion,
        peakMotion: segment.peakMotion,
        holdRatio: segment.holdRatio,
        directionChanges: segment.directionChanges,
      })),
    );
    const eventBySegmentId = new Map(
      eventSummary.segments.map((segment) => [segment.id, segment] as const),
    );
    const semantic = decodeBlindSemantics({
      segments: analysis.segments.map((segment) => ({
        id: segment.id,
        startMs: segment.startMs,
        endMs: segment.endMs,
        frames: segment.frames,
        encoded: segment.encoded,
        primary:
          eventBySegmentId.get(segment.id)?.primary ?? eventSummary.segments[0]!.primary,
        alternatives: eventBySegmentId.get(segment.id)?.alternatives ?? [],
        motifClusterId: eventBySegmentId.get(segment.id)?.motifClusterId ?? null,
      })),
      savedLexemeMemories: options.savedLexemeMemories ?? [],
    });
    const semanticBySegmentId = new Map(
      semantic.segments.map((segment) => [segment.id, segment] as const),
    );
    const segments = analysis.segments.map((segment) =>
      createBlindInferenceSegment({
        id: segment.id,
        startMs: segment.startMs,
        endMs: segment.endMs,
        recognition: segment.baselineRecognition,
        decision: segment.baselineDecision,
        eventFamily:
          semanticBySegmentId.get(segment.id)?.primary ?? eventSummary.segments[0]!.primary,
        eventAlternatives: semanticBySegmentId.get(segment.id)?.alternatives ?? [],
        runnerUpFamily: semanticBySegmentId.get(segment.id)?.runnerUp ?? null,
        motifClusterId: semanticBySegmentId.get(segment.id)?.motifClusterId ?? null,
        lexemeIds: semanticBySegmentId.get(segment.id)?.lexemeIds ?? [],
        repeatedCycleCount: semanticBySegmentId.get(segment.id)?.repeatedCycleCount ?? 0,
        confidenceBreakdown:
          semanticBySegmentId.get(segment.id)?.confidenceBreakdown,
        handshapeChangeStats:
          semanticBySegmentId.get(segment.id)?.handshapeChangeStats,
        bodyReactionStats:
          semanticBySegmentId.get(segment.id)?.bodyReactionStats,
        phaseFamilyVotes:
          semanticBySegmentId.get(segment.id)?.phaseFamilyVotes,
        motifTags:
          semanticBySegmentId.get(segment.id)?.motifTags,
        phases: semanticBySegmentId.get(segment.id)?.phases ?? [],
        confidenceMargin: semanticBySegmentId.get(segment.id)?.confidenceMargin ?? 0,
        localTransitionSupport:
          semanticBySegmentId.get(segment.id)?.localTransitionSupport ?? 0,
        refinedFromFamily:
          semanticBySegmentId.get(segment.id)?.refinedFromFamily ?? null,
        refinementReason:
          semanticBySegmentId.get(segment.id)?.refinementReason ?? null,
        debug: segment.debug,
        sessionAnchors: options.sessionAnchors,
      }),
    );

    return createBlindInferenceReport({
      clipName: analysis.clipName,
      clipDurationMs: analysis.clipDurationMs,
      notes: [
        `Blind inference processed ${analysis.segments.length} landmark segments.`,
        analysis.extractorKind === "mock"
          ? "Blind inference ran in demo fallback. Treat outputs as event-family hypotheses, not clip meaning."
          : "Blind inference used on-device landmark extraction with no expected reference text.",
        `Current exact recognizer still has ${analysis.candidateCatalog.length} known labels.`,
        "Event-family hypotheses, lexeme clusters, and phase chains come from motion, handshape, placement, pose, timing, mouth, and visibility cues.",
        ...analysis.notes,
      ].join(" "),
      candidateSetSize: analysis.candidateCatalog.length,
      segments,
      lexemes: semantic.lexemes,
      eventSummary: {
        genericUnknownRatio: semantic.summary.genericUnknownRatio,
        genericUnknownCount: Math.round(
          semantic.summary.genericUnknownRatio * Math.max(semantic.segments.length, 1),
        ),
        resolvedEventFamilyRatio: semantic.summary.resolvedEventFamilyRatio,
        repeatedMotifCount: semantic.summary.repeatedMotifs.length,
        eventFamilyDiversity: new Set(
          semantic.segments.map((segment) => segment.primary.label),
        ).size,
        specificEventFamilyCount: semantic.summary.specificEventFamilyCount,
        unresolvedSegmentsCount: semantic.summary.unresolvedSegmentsCount,
        refinementCount: semantic.summary.refinementCount,
        averageConfidenceMargin:
          semantic.segments.reduce(
            (sum, segment) => sum + segment.confidenceMargin,
            0,
          ) / Math.max(semantic.segments.length, 1),
        averageConfidenceByEventFamily:
          semantic.summary.averageConfidenceByEventFamily,
        topEventChain: semantic.summary.topEventChain,
        alternateEventChains: semantic.summary.alternateEventChains,
        repeatedPatterns: semantic.summary.repeatedMotifs,
        topLexemeChain: semantic.summary.topLexemeChain,
        alternateLexemeChains: semantic.summary.alternateLexemeChains,
        repeatedActionCycles: semantic.summary.repeatedActionCycles,
        likelyTransitionPoints: semantic.summary.likelyTransitionPoints,
        motifTags: semantic.summary.motifTags,
        lexemeCount: semantic.lexemes.length,
      },
      debug: {
        detectorInitStatus: analysis.debug.detectorInitStatus,
        totalFramesRequested: analysis.debug.frameStats.totalFramesRequested,
        framesAnalyzed: analysis.debug.frameStats.framesAnalyzed,
        framesSkipped: analysis.debug.frameStats.framesSkipped,
        duplicateTimestampsSkipped: analysis.debug.frameStats.duplicateTimestampsSkipped,
        invalidTimestampsSkipped: analysis.debug.frameStats.invalidTimestampsSkipped,
        detectorFailures: analysis.debug.frameStats.detectorFailures,
        firstTimestampMs: analysis.debug.frameStats.firstTimestampMs,
        lastTimestampMs: analysis.debug.frameStats.lastTimestampMs,
        warningsCount: analysis.debug.analysisWarnings.length,
        runtimeLogCount: analysis.debug.runtimeLogs.length,
        analysisWarnings: analysis.debug.analysisWarnings,
      },
    });
  }
}

export const benchmarkEvaluator = new BenchmarkEvaluator();
