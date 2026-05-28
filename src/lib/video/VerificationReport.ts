import { assembleVerificationTranscript } from "@/lib/recognition/TranscriptAssembler";
import type { CandidateMatch, RecognitionResult } from "@/lib/recognition/types";
import type { UncertaintyDecision } from "@/lib/uncertainty/UncertaintyEngine";
import {
  getBenchmarkConceptById,
  getBenchmarkVocabularyPack,
  matchConceptsForText,
  type BenchmarkVocabularyPack,
  type BenchmarkVocabularyPackId,
} from "@/lib/benchmarks/vocabularyPacks";

export type VerificationMatchResult =
  | "exact"
  | "partial"
  | "uncertain"
  | "mismatch"
  | "out-of-coverage";
export type VerificationCoverageStatus = "covered" | "limited" | "out-of-coverage";
export type VerificationComparisonMode = "exact" | "concept-level";
export type VerificationConceptMatchResult =
  | "match"
  | "partial"
  | "uncertain"
  | "mismatch"
  | "out-of-coverage"
  | "insufficient-examples";

export interface VerificationReferenceSegment {
  id: string;
  expected: string;
  useForCalibration?: boolean;
  conceptIds?: string[];
}

export interface VerificationReference {
  clipName: string;
  source: "local" | "upload";
  notes: string;
  segments: VerificationReferenceSegment[];
}

export interface VerificationCandidateAlternative {
  candidateId: string;
  label: string;
  confidence: number;
  baseConfidence?: number;
  contrastiveAdjustment?: number;
  minimalPairAdjustment?: number;
}

export interface VerificationSegmentDebug {
  framesAnalyzed: number;
  skippedFrames: number;
  detectorFailures: number;
  extractorKind: "holistic" | "mock";
  firstTimestampMs: number | null;
  lastTimestampMs: number | null;
}

export interface VerificationSegmentResult {
  id: string;
  startMs: number;
  endMs: number;
  expected: string;
  expectedConceptIds: string[];
  modelOutput: string;
  predictedLabel: string | null;
  confidence: number;
  alternatives: VerificationCandidateAlternative[];
  debtLabel: string;
  uncertaintyReason: string;
  matchResult: VerificationMatchResult;
  coverageStatus: VerificationCoverageStatus;
  comparisonReason: string;
  candidateSetSize: number;
  usedForCalibration: boolean;
  conceptEvaluation: VerificationConceptEvaluation;
  debug?: VerificationSegmentDebug;
}

export interface VerificationSummary {
  segmentsProcessed: number;
  segmentsPredicted: number;
  uncertainSegments: number;
  averageConfidence: number;
  mismatchCount: number;
  exactCount: number;
  partialCount: number;
  outOfCoverageCount: number;
  coverageLimitedSegments: number;
  heldOutSegments: number;
}

export interface VerificationConceptReferenceItem {
  id: string;
  label: string;
}

export interface VerificationConceptEvaluation {
  topConceptLabel: string | null;
  confidence: number;
  uncertaintyReason: string;
  result: VerificationConceptMatchResult;
  expectedConcepts: VerificationConceptReferenceItem[];
  hits: VerificationConceptReferenceItem[];
  misses: VerificationConceptReferenceItem[];
  recognizedConcepts: VerificationConceptReferenceItem[];
  outOfCoverageConcepts: VerificationConceptReferenceItem[];
  insufficientExampleConcepts: VerificationConceptReferenceItem[];
  coverageRate: number;
}

export interface VerificationConceptSupport {
  conceptId: string;
  label: string;
  aliases: string[];
  cueNotes?: string;
  exampleCount: number;
  insufficientExamples: boolean;
  benchmarkSupported: boolean;
}

export interface VerificationVocabularyPackSummary {
  id: BenchmarkVocabularyPackId;
  label: string;
  description: string;
  conceptCount: number;
  supportedConceptCount: number;
  insufficientConceptCount: number;
  concepts: VerificationConceptSupport[];
}

export interface VerificationConceptSummary {
  comparisonMode: VerificationComparisonMode;
  conceptMatchCount: number;
  conceptPartialCount: number;
  conceptUncertainCount: number;
  conceptMismatchCount: number;
  conceptOutOfCoverageCount: number;
  insufficientExampleSegments: number;
  heldOutComparableConcepts: number;
  conceptHits: number;
  conceptCoverageRate: number;
}

export interface VerificationCalibrationSummary {
  enabled: boolean;
  calibrationSegmentIds: string[];
  heldOutSegmentIds: string[];
  baselineHeldOutPassRate: number | null;
  calibratedHeldOutPassRate: number | null;
  improvedOnHeldOut: boolean | null;
  note: string;
}

export interface VerificationPrivacy {
  rawVideoStored: false;
  pixelDataStored: false;
  landmarkOnly: true;
  persisted: boolean;
}

export interface VerificationCoverageSummary {
  limited: boolean;
  outOfCoverageSegments: number;
  limitedSegments: number;
  coveredSegments: number;
  outsideVocabularySegments: Array<{
    id: string;
    expected: string;
  }>;
  note: string;
}

export interface VerificationReportDebug {
  detectorInitStatus: "ready" | "mock-fallback" | "failed";
  totalFramesRequested: number;
  framesAnalyzed: number;
  framesSkipped: number;
  duplicateTimestampsSkipped: number;
  invalidTimestampsSkipped: number;
  detectorFailures: number;
  firstTimestampMs: number | null;
  lastTimestampMs: number | null;
  warningsCount: number;
  runtimeLogCount: number;
  analysisWarnings: string[];
}

export interface VerificationReport {
  id: string;
  createdAt: string;
  clipName: string;
  clipDurationMs: number;
  mode: "demo-vocabulary" | "benchmark-verification";
  comparisonMode: VerificationComparisonMode;
  notes: string;
  reference: VerificationReference;
  modelOutputTranscript: string;
  expectedTranscript: string;
  candidateSetSize: number;
  vocabularyLabels: string[];
  vocabularyPack: VerificationVocabularyPackSummary;
  segments: VerificationSegmentResult[];
  summary: VerificationSummary;
  conceptSummary: VerificationConceptSummary;
  coverage: VerificationCoverageSummary;
  debug: VerificationReportDebug;
  calibration: VerificationCalibrationSummary;
  privacy: VerificationPrivacy;
  source: "verify";
}

export interface VerificationSegmentDraft {
  id: string;
  expected: string;
  useForCalibration?: boolean;
}

const COVERAGE_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "the",
  "to",
  "of",
  "with",
  "then",
  "into",
  "let",
  "me",
  "you",
  "he",
  "she",
  "they",
  "this",
  "that",
  "there",
  "here",
  "story",
  "man",
]);

function round(value: number) {
  return Number(value.toFixed(4));
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]/g, " ")
    .replace(/[/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string) {
  return normalize(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function informativeTokens(value: string) {
  return tokenize(value).filter(
    (token) => token.length > 1 && !COVERAGE_STOP_WORDS.has(token),
  );
}

function overlapRatio(left: string, right: string) {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));

  if (!leftTokens.size || !rightTokens.size) {
    return 0;
  }

  let shared = 0;

  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      shared += 1;
    }
  }

  return shared / Math.max(leftTokens.size, rightTokens.size);
}

function includesWholeLabel(expected: string, label: string) {
  const normalizedExpected = ` ${normalize(expected)} `;
  const normalizedLabel = ` ${normalize(label)} `;
  return normalizedExpected.includes(normalizedLabel);
}

function toConceptReferenceItems(
  pack: BenchmarkVocabularyPack,
  conceptIds: string[],
) {
  return conceptIds
    .map((conceptId) => getBenchmarkConceptById(pack, conceptId))
    .filter((concept): concept is NonNullable<typeof concept> => Boolean(concept))
    .map((concept) => ({
      id: concept.id,
      label: concept.label,
    }));
}

function uniqueConceptItems(items: VerificationConceptReferenceItem[]) {
  const map = new Map<string, VerificationConceptReferenceItem>();

  for (const item of items) {
    map.set(item.id, item);
  }

  return Array.from(map.values());
}

export function buildVocabularyPackSummary(
  packId: BenchmarkVocabularyPackId,
  conceptExampleCounts: Record<string, number> = {},
): VerificationVocabularyPackSummary {
  const pack = getBenchmarkVocabularyPack(packId);
  const concepts = pack.concepts.map((concept) => {
    const exampleCount = conceptExampleCounts[concept.id] ?? 0;

    return {
      conceptId: concept.id,
      label: concept.label,
      aliases: concept.aliases,
      cueNotes: concept.cueNotes,
      exampleCount,
      insufficientExamples: exampleCount > 0 && exampleCount < 2,
      benchmarkSupported: concept.benchmarkSupported,
    } satisfies VerificationConceptSupport;
  });

  return {
    id: pack.id,
    label: pack.label,
    description: pack.description,
    conceptCount: concepts.length,
    supportedConceptCount: concepts.filter(
      (concept) => concept.benchmarkSupported && concept.exampleCount >= 2,
    ).length,
    insufficientConceptCount: concepts.filter((concept) => concept.insufficientExamples).length,
    concepts,
  };
}

export function compareExpectedConceptsToRecognition(params: {
  expectedConceptIds: string[];
  vocabularyPack: VerificationVocabularyPackSummary;
  recognition: RecognitionResult;
  decision: UncertaintyDecision;
}) {
  const pack = getBenchmarkVocabularyPack(params.vocabularyPack.id);
  const expectedConcepts = uniqueConceptItems(
    toConceptReferenceItems(pack, params.expectedConceptIds),
  );
  const expectedComparable = expectedConcepts.filter((concept) => {
    const support = params.vocabularyPack.concepts.find(
      (item) => item.conceptId === concept.id,
    );
    return support?.benchmarkSupported;
  });
  const recognizedConcepts = uniqueConceptItems(
    params.recognition.topK.flatMap((candidate) =>
      matchConceptsForText(pack, candidate.label).map((concept) => ({
        id: concept.id,
        label: concept.label,
      })),
    ),
  );
  const recognizedSet = new Set(recognizedConcepts.map((concept) => concept.id));
  const hits = expectedComparable.filter((concept) => recognizedSet.has(concept.id));
  const misses = expectedComparable.filter((concept) => !recognizedSet.has(concept.id));
  const outOfCoverageConcepts = expectedConcepts.filter((concept) => {
    const support = params.vocabularyPack.concepts.find(
      (item) => item.conceptId === concept.id,
    );
    return !support || !support.benchmarkSupported;
  });
  const insufficientExampleConcepts = expectedComparable.filter((concept) => {
    const support = params.vocabularyPack.concepts.find(
      (item) => item.conceptId === concept.id,
    );
    return Boolean(support?.insufficientExamples || support?.exampleCount === 0);
  });

  let result: VerificationConceptMatchResult = "mismatch";

  if (!expectedConcepts.length || outOfCoverageConcepts.length === expectedConcepts.length) {
    result = "out-of-coverage";
  } else if (params.decision.mode !== "accept" && !hits.length) {
    result = "uncertain";
  } else if (hits.length && hits.length === expectedComparable.length) {
    result = insufficientExampleConcepts.length ? "insufficient-examples" : "match";
  } else if (hits.length) {
    result = "partial";
  } else if (insufficientExampleConcepts.length) {
    result = "insufficient-examples";
  }

  return {
    topConceptLabel: recognizedConcepts[0]?.label ?? null,
    confidence: Number((params.recognition.top1?.confidence ?? 0).toFixed(4)),
    uncertaintyReason: params.decision.message,
    result,
    expectedConcepts,
    hits,
    misses,
    recognizedConcepts,
    outOfCoverageConcepts,
    insufficientExampleConcepts,
    coverageRate: Number(
      (
        hits.length /
        Math.max(expectedComparable.length || outOfCoverageConcepts.length, 1)
      ).toFixed(4),
    ),
  } satisfies VerificationConceptEvaluation;
}

export function assessReferenceCoverage(
  expected: string,
  vocabularyLabels: string[],
) {
  const expectedTokens = informativeTokens(expected);

  if (!expected.trim()) {
    return {
      status: "limited" as const,
      matchedVocabularyLabels: [],
      outsideReferenceTokens: [],
      reason: "Expected reference is blank, so coverage cannot be judged.",
    };
  }

  if (!expectedTokens.length) {
    return {
      status: "limited" as const,
      matchedVocabularyLabels: [],
      outsideReferenceTokens: [],
      reason: "Expected reference uses mostly generic tokens, so coverage check stays limited.",
    };
  }

  const matchedVocabularyLabels: string[] = [];
  const matchedTokens = new Set<string>();

  for (const label of vocabularyLabels) {
    const labelTokens = informativeTokens(label);
    const overlaps = labelTokens.filter((token) => expectedTokens.includes(token));

    if (includesWholeLabel(expected, label) || overlaps.length) {
      matchedVocabularyLabels.push(label);
      overlaps.forEach((token) => matchedTokens.add(token));
    }
  }

  const outsideReferenceTokens = expectedTokens.filter((token) => !matchedTokens.has(token));
  const coverageRatio = matchedTokens.size / expectedTokens.length;

  if (!matchedVocabularyLabels.length) {
    return {
      status: "out-of-coverage" as const,
      matchedVocabularyLabels,
      outsideReferenceTokens,
      reason: "Expected reference concepts sit outside current recognizer vocabulary.",
    };
  }

  if (
    matchedVocabularyLabels.some((label) => includesWholeLabel(expected, label)) ||
    coverageRatio >= 0.5
  ) {
    return {
      status: "covered" as const,
      matchedVocabularyLabels,
      outsideReferenceTokens,
      reason: "Expected reference overlaps current recognizer vocabulary closely enough for comparison.",
    };
  }

  return {
    status: "limited" as const,
    matchedVocabularyLabels,
    outsideReferenceTokens,
    reason: "Expected reference only partially overlaps current recognizer vocabulary.",
  };
}

function buildUncertainOutput(alternatives: Array<{ label: string }>) {
  const labels = alternatives
    .map((candidate) => candidate.label.trim())
    .filter(Boolean)
    .slice(0, 3);

  return labels.length ? `uncertain: ${labels.join(" / ")}` : "uncertain: no stable candidate";
}

export function segmentModelOutput(
  recognition: RecognitionResult,
  decision: UncertaintyDecision,
) {
  if (decision.mode === "accept" && recognition.top1?.label) {
    return recognition.top1.label;
  }

  return buildUncertainOutput(recognition.topK);
}

export function compareExpectedToRecognition(
  expected: string,
  recognition: RecognitionResult,
  decision: UncertaintyDecision,
  vocabularyLabels: string[] = recognition.topK.map((candidate) => candidate.label),
) {
  const top1 = recognition.top1;
  const alternatives = recognition.topK.slice(0, 3);
  const coverage = assessReferenceCoverage(expected, vocabularyLabels);

  if (coverage.status === "out-of-coverage") {
    return "out-of-coverage" as const;
  }

  if (!top1 || !expected.trim()) {
    return "uncertain" as const;
  }

  if (decision.mode !== "accept") {
    return "uncertain" as const;
  }

  if (includesWholeLabel(expected, top1.label)) {
    return "exact" as const;
  }

  const topOverlap = overlapRatio(expected, top1.label);

  if (topOverlap >= 0.55) {
    return "exact" as const;
  }

  if (topOverlap >= 0.3) {
    return "partial" as const;
  }

  if (
    alternatives.slice(1).some((candidate) => includesWholeLabel(expected, candidate.label))
  ) {
    return "partial" as const;
  }

  if (alternatives.slice(1).some((candidate) => overlapRatio(expected, candidate.label) >= 0.3)) {
    return "partial" as const;
  }

  return "mismatch" as const;
}

export function describeVerificationComparison(
  matchResult: VerificationMatchResult,
  coverageStatus: VerificationCoverageStatus,
  decision: UncertaintyDecision,
  expected: string,
  predictedLabel: string | null,
) {
  switch (matchResult) {
    case "exact":
      return `Expected reference overlaps accepted label "${predictedLabel}".`;
    case "partial":
      return `Expected reference partially overlaps accepted or alternate known candidate for "${expected}".`;
    case "uncertain":
      return `Segment stayed uncertain because ${decision.message.toLowerCase()}`;
    case "out-of-coverage":
      return `Expected reference sits outside current recognizer vocabulary, so comparison stays out-of-coverage.`;
    case "mismatch":
      return coverageStatus === "limited"
        ? "Accepted label does not match expected reference, and vocabulary overlap is only partial."
        : "Accepted label does not match expected reference.";
    default:
      return "Comparison stayed limited.";
  }
}

function coverageSummary(segments: VerificationSegmentResult[]) {
  const outOfCoverageSegments = segments.filter(
    (segment) => segment.coverageStatus === "out-of-coverage",
  );
  const limitedSegments = segments.filter(
    (segment) => segment.coverageStatus === "limited",
  );
  const coveredSegments = segments.filter(
    (segment) => segment.coverageStatus === "covered",
  );

  return {
    limited: Boolean(outOfCoverageSegments.length || limitedSegments.length),
    outOfCoverageSegments: outOfCoverageSegments.length,
    limitedSegments: limitedSegments.length,
    coveredSegments: coveredSegments.length,
    outsideVocabularySegments: outOfCoverageSegments.map((segment) => ({
      id: segment.id,
      expected: segment.expected,
    })),
    note: outOfCoverageSegments.length
      ? `${outOfCoverageSegments.length} segment(s) sit outside current recognizer vocabulary.`
      : limitedSegments.length
        ? `${limitedSegments.length} segment(s) only partially overlap current recognizer vocabulary.`
        : "Expected reference is reasonably comparable to current recognizer vocabulary.",
  } satisfies VerificationCoverageSummary;
}

function buildConceptSummary(
  segments: VerificationSegmentResult[],
  calibrationSegmentIds: string[],
  comparisonMode: VerificationComparisonMode,
) {
  const heldOutSegments = segments.filter(
    (segment) => !calibrationSegmentIds.includes(segment.id),
  );
  const conceptMatchCount = heldOutSegments.filter(
    (segment) => segment.conceptEvaluation.result === "match",
  ).length;
  const conceptPartialCount = heldOutSegments.filter(
    (segment) => segment.conceptEvaluation.result === "partial",
  ).length;
  const conceptUncertainCount = heldOutSegments.filter(
    (segment) => segment.conceptEvaluation.result === "uncertain",
  ).length;
  const conceptMismatchCount = heldOutSegments.filter(
    (segment) => segment.conceptEvaluation.result === "mismatch",
  ).length;
  const conceptOutOfCoverageCount = heldOutSegments.filter(
    (segment) => segment.conceptEvaluation.result === "out-of-coverage",
  ).length;
  const insufficientExampleSegments = heldOutSegments.filter(
    (segment) => segment.conceptEvaluation.result === "insufficient-examples",
  ).length;
  const heldOutComparableConcepts = heldOutSegments.reduce(
    (sum, segment) =>
      sum + segment.conceptEvaluation.hits.length + segment.conceptEvaluation.misses.length,
    0,
  );
  const conceptHits = heldOutSegments.reduce(
    (sum, segment) => sum + segment.conceptEvaluation.hits.length,
    0,
  );

  return {
    comparisonMode,
    conceptMatchCount,
    conceptPartialCount,
    conceptUncertainCount,
    conceptMismatchCount,
    conceptOutOfCoverageCount,
    insufficientExampleSegments,
    heldOutComparableConcepts,
    conceptHits,
    conceptCoverageRate: round(conceptHits / Math.max(heldOutComparableConcepts, 1)),
  } satisfies VerificationConceptSummary;
}

export function toVerificationAlternatives(alternatives: CandidateMatch[]) {
  return alternatives.slice(0, 3).map((candidate) => ({
    candidateId: candidate.id,
    label: candidate.label,
    confidence: round(candidate.confidence),
    baseConfidence:
      typeof candidate.baseConfidence === "number"
        ? round(candidate.baseConfidence)
        : undefined,
    contrastiveAdjustment:
      typeof candidate.contrastiveAdjustment === "number"
        ? round(candidate.contrastiveAdjustment)
        : undefined,
    minimalPairAdjustment:
      typeof candidate.minimalPairAdjustment === "number"
        ? round(candidate.minimalPairAdjustment)
        : undefined,
  }));
}

export function buildVerificationSummary(
  segments: VerificationSegmentResult[],
  calibrationSegmentIds: string[],
) {
  const heldOutSegments = segments.filter(
    (segment) => !calibrationSegmentIds.includes(segment.id),
  );
  const predicted = segments.filter((segment) => segment.modelOutput.trim().length > 0);
  const uncertain = segments.filter((segment) => segment.matchResult === "uncertain");
  const exactCount = heldOutSegments.filter((segment) => segment.matchResult === "exact").length;
  const partialCount = heldOutSegments.filter(
    (segment) => segment.matchResult === "partial",
  ).length;
  const outOfCoverageCount = heldOutSegments.filter(
    (segment) => segment.matchResult === "out-of-coverage",
  ).length;
  const mismatchCount = heldOutSegments.filter(
    (segment) =>
      Boolean(segment.expected.trim()) &&
      (segment.matchResult === "uncertain" ||
        segment.matchResult === "mismatch" ||
        segment.matchResult === "out-of-coverage"),
  ).length;
  const coverageLimitedSegments = heldOutSegments.filter(
    (segment) => segment.coverageStatus !== "covered",
  ).length;

  return {
    segmentsProcessed: segments.length,
    segmentsPredicted: predicted.length,
    uncertainSegments: uncertain.length,
    averageConfidence: round(
      predicted.length
        ? predicted.reduce((sum, segment) => sum + segment.confidence, 0) / predicted.length
        : 0,
    ),
    mismatchCount,
    exactCount,
    partialCount,
    outOfCoverageCount,
    coverageLimitedSegments,
    heldOutSegments: heldOutSegments.length,
  } satisfies VerificationSummary;
}

export function heldOutPassRate(
  segments: VerificationSegmentResult[],
  calibrationSegmentIds: string[],
) {
  const heldOut = segments.filter((segment) => !calibrationSegmentIds.includes(segment.id));

  if (!heldOut.length) {
    return null;
  }

  const positive = heldOut.filter(
    (segment) => segment.matchResult === "exact" || segment.matchResult === "partial",
  ).length;

  return round(positive / heldOut.length);
}

export function createVerificationReport(params: {
  clipName: string;
  clipDurationMs: number;
  notes: string;
  reference: VerificationReference;
  candidateSetSize: number;
  vocabularyLabels: string[];
  vocabularyPack: VerificationVocabularyPackSummary;
  comparisonMode: VerificationComparisonMode;
  segments: VerificationSegmentResult[];
  calibrationSegmentIds?: string[];
  baselineHeldOutSegments?: VerificationSegmentResult[];
  debug: VerificationReportDebug;
  persisted?: boolean;
}): VerificationReport {
  const calibrationSegmentIds = params.calibrationSegmentIds ?? [];
  const summary = buildVerificationSummary(params.segments, calibrationSegmentIds);
  const coverage = coverageSummary(params.segments);
  const conceptSummary = buildConceptSummary(
    params.segments,
    calibrationSegmentIds,
    params.comparisonMode,
  );
  const baselineHeldOutPassRate = params.baselineHeldOutSegments
    ? heldOutPassRate(params.baselineHeldOutSegments, calibrationSegmentIds)
    : null;
  const calibratedHeldOutPassRate = heldOutPassRate(params.segments, calibrationSegmentIds);

  return {
    id: `verification-${crypto.randomUUID()}`,
    createdAt: new Date().toISOString(),
    clipName: params.clipName,
    clipDurationMs: params.clipDurationMs,
    mode: "benchmark-verification",
    comparisonMode: params.comparisonMode,
    notes: params.notes,
    reference: params.reference,
    modelOutputTranscript: assembleVerificationTranscript(params.segments),
    expectedTranscript: params.reference.segments.map((segment) => segment.expected).join(" / "),
    candidateSetSize: params.candidateSetSize,
    vocabularyLabels: params.vocabularyLabels,
    vocabularyPack: params.vocabularyPack,
    segments: params.segments,
    summary,
    conceptSummary,
    coverage,
    debug: params.debug,
    calibration: {
      enabled: calibrationSegmentIds.length > 0,
      calibrationSegmentIds,
      heldOutSegmentIds: params.segments
        .filter((segment) => !calibrationSegmentIds.includes(segment.id))
        .map((segment) => segment.id),
      baselineHeldOutPassRate,
      calibratedHeldOutPassRate,
      improvedOnHeldOut:
        baselineHeldOutPassRate !== null && calibratedHeldOutPassRate !== null
          ? calibratedHeldOutPassRate > baselineHeldOutPassRate
          : null,
      note: calibrationSegmentIds.length
        ? "Held-out segments matter more than calibration segments. Small improvements can still be overfit."
        : "No calibration prototypes applied. Results come from current constrained candidate set only.",
    },
    privacy: {
      rawVideoStored: false,
      pixelDataStored: false,
      landmarkOnly: true,
      persisted: params.persisted ?? false,
    },
    source: "verify",
  };
}

export function updateVerificationReportDraft(
  report: VerificationReport,
  drafts: VerificationSegmentDraft[],
) {
  const draftMap = new Map(drafts.map((segment) => [segment.id, segment]));
  const nextSegments = report.segments.map((segment) => {
    const draft = draftMap.get(segment.id);

    if (!draft) {
      return segment;
    }

    const nextExpected = draft.expected;
    const nextCoverage = assessReferenceCoverage(nextExpected, report.vocabularyLabels);
    const matchResult: VerificationMatchResult =
      nextCoverage.status === "out-of-coverage"
        ? "out-of-coverage"
        : !segment.predictedLabel || segment.modelOutput.startsWith("uncertain:")
          ? "uncertain"
          : includesWholeLabel(nextExpected, segment.predictedLabel) ||
              overlapRatio(nextExpected, segment.predictedLabel) >= 0.55
            ? "exact"
            : overlapRatio(nextExpected, segment.predictedLabel) >= 0.3
              ? "partial"
              : "mismatch";

    return {
      ...segment,
      expected: nextExpected,
      matchResult,
      coverageStatus: nextCoverage.status,
      comparisonReason: nextCoverage.status === "out-of-coverage"
        ? nextCoverage.reason
        : !segment.predictedLabel || segment.modelOutput.startsWith("uncertain:")
          ? "Edited expected reference is still compared against uncertain model output."
          : matchResult === "exact"
            ? `Edited expected reference now overlaps "${segment.predictedLabel}".`
            : matchResult === "partial"
              ? `Edited expected reference partially overlaps "${segment.predictedLabel}".`
              : `Edited expected reference still does not match "${segment.predictedLabel}".`,
      usedForCalibration: draft.useForCalibration ?? false,
    };
  });
  const nextReference = {
    ...report.reference,
    segments: report.reference.segments.map((segment) => {
      const draft = draftMap.get(segment.id);

      return draft
        ? {
            ...segment,
            expected: draft.expected,
            useForCalibration: draft.useForCalibration ?? false,
          }
        : segment;
    }),
  };
  const calibrationSegmentIds = nextReference.segments
    .filter((segment) => segment.useForCalibration)
    .map((segment) => segment.id);
  const summary = buildVerificationSummary(nextSegments, calibrationSegmentIds);
  const coverage = coverageSummary(nextSegments);
  const conceptSummary = buildConceptSummary(
    nextSegments,
    calibrationSegmentIds,
    report.comparisonMode,
  );

  return {
    ...report,
    reference: nextReference,
    expectedTranscript: nextReference.segments.map((segment) => segment.expected).join(" / "),
    modelOutputTranscript: assembleVerificationTranscript(nextSegments),
    segments: nextSegments,
    summary,
    conceptSummary,
    coverage,
    calibration: {
      ...report.calibration,
      enabled: calibrationSegmentIds.length > 0,
      calibrationSegmentIds,
      heldOutSegmentIds: nextSegments
        .filter((segment) => !calibrationSegmentIds.includes(segment.id))
        .map((segment) => segment.id),
      calibratedHeldOutPassRate: heldOutPassRate(nextSegments, calibrationSegmentIds),
    },
  } satisfies VerificationReport;
}
