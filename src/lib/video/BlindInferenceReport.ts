import type { BlindSessionAnchor } from "@/lib/recognition/BlindHypothesis";
import {
  buildBlindStructuredHypotheses,
  scoreBlindSessionAnchors,
} from "@/lib/recognition/BlindHypothesis";
import {
  inferBlindEventFamilies,
  type BlindEventFamilyHypothesis,
  type BlindEventFamilyLabel,
  type BlindSegmentProfile,
} from "@/lib/recognition/EventFamilyInference";
import type {
  BlindConfidenceBreakdown,
  BlindBodyReactionStats,
  BlindDiscoveredLexeme,
  BlindHandshapeChangeStats,
  BlindPhaseRole,
  BlindSegmentPhase,
  BlindTransitionPoint,
} from "@/lib/recognition/BlindSemanticDecoder";
import type { CandidateMatch, RecognitionResult } from "@/lib/recognition/types";
import type { UncertaintyDecision } from "@/lib/uncertainty/UncertaintyEngine";
import type {
  VerificationReportDebug,
  VerificationSegmentDebug,
} from "@/lib/video/VerificationReport";

export type BlindFailureTag =
  | "hand-visibility-weak"
  | "mouth-face-cue-weak"
  | "segmentation-unstable"
  | "tool-use-vs-release-confusion"
  | "ingest-confusion"
  | "travel-setup-confusion"
  | "low-confidence-competition";

export interface BlindInferenceAlternative {
  label: string;
  kind: "exact" | "structured-unknown" | "anchor" | "event-family";
  confidence: number;
  reason: string;
}

export interface BlindInferenceQualitySignals {
  handVisibleRatio: number;
  faceVisibleRatio: number;
  poseVisibleRatio: number;
  occlusionRatio: number;
  motionEnergy: number;
  mouthStability: number;
  validFrameRatio: number;
}

export interface BlindInferenceSegmentResult {
  id: string;
  startMs: number;
  endMs: number;
  bestHypothesis: string;
  exactLabelGuess: string | null;
  actionHypothesis: string;
  eventFamilyHypothesis: BlindEventFamilyLabel;
  runnerUpFamily: BlindEventFamilyLabel | null;
  alternatives: BlindInferenceAlternative[];
  confidence: number;
  confidenceMargin: number;
  localTransitionSupport: number;
  debtLabel: string;
  uncertaintyReason: string;
  hypothesisReason: string;
  evidenceChannels: string[];
  motifClusterId: string | null;
  lexemeIds: string[];
  repeatedCycleCount: number;
  confidenceBreakdown: BlindConfidenceBreakdown;
  qualitySignals: BlindInferenceQualitySignals;
  handshapeChangeStats: BlindHandshapeChangeStats;
  bodyReactionStats: BlindBodyReactionStats;
  phaseFamilyVotes: Array<{
    label: BlindEventFamilyLabel;
    score: number;
  }>;
  motifTags: string[];
  failureTags: BlindFailureTag[];
  phases: BlindInferencePhaseResult[];
  refinementChanged: boolean;
  refinedFromFamily: BlindEventFamilyLabel | null;
  refinementReason: string | null;
  phaseRoleSummary: BlindPhaseRole[];
  unresolved: boolean;
  debug?: VerificationSegmentDebug;
}

export interface BlindInferencePhaseResult extends Omit<BlindSegmentPhase, "lexemeId"> {
  lexemeId: string | null;
}

export interface BlindInferenceSummary {
  topSummary: string;
  alternateSummaries: string[];
  topEventChain: string;
  alternateEventChains: string[];
  repeatedPatterns: Array<{
    label: string;
    count: number;
    segmentIds?: string[];
  }>;
  topLexemeChain: string;
  alternateLexemeChains: string[];
  repeatedActionCycles: number;
  likelyTransitionPoints: BlindTransitionPoint[];
  motifTags: string[];
  lexemeCount: number;
  unresolvedSegments: string[];
  improveNext: {
    strongestFamilies: Array<{
      label: BlindEventFamilyLabel;
      count: number;
      averageConfidence: number;
    }>;
    weakestFamilies: Array<{
      label: BlindEventFamilyLabel;
      count: number;
      averageConfidence: number;
    }>;
    likelyConfusionPairs: Array<{
      pair: string;
      count: number;
    }>;
    likelyNextDataNeed: string[];
    failureTagCounts: Array<{
      tag: BlindFailureTag;
      count: number;
    }>;
  };
  metrics: {
    genericUnknownRatio: number;
    genericUnknownCount: number;
    resolvedEventFamilyRatio: number;
    repeatedMotifCount: number;
    eventFamilyDiversity: number;
    specificEventFamilyCount: number;
    unresolvedSegmentsCount: number;
    refinementCount: number;
    averageConfidenceMargin: number;
    averageConfidenceByEventFamily: Array<{
      label: BlindEventFamilyLabel;
      averageConfidence: number;
    }>;
  };
}

export interface BlindInferencePrivacy {
  rawVideoStored: false;
  pixelDataStored: false;
  landmarkOnly: true;
}

export interface BlindInferenceReport {
  id: string;
  createdAt: string;
  clipName: string;
  clipDurationMs: number;
  mode: "blind-inference";
  notes: string;
  candidateSetSize: number;
  segmentHypothesisTranscript: string;
  segments: BlindInferenceSegmentResult[];
  lexemes: BlindDiscoveredLexeme[];
  summary: BlindInferenceSummary;
  debug: VerificationReportDebug;
  privacy: BlindInferencePrivacy;
  source: "verify";
}

type BlindEventSummaryOverrides = Partial<BlindInferenceSummary["metrics"]> & {
  topEventChain?: string;
  alternateEventChains?: string[];
  repeatedPatterns?: BlindInferenceSummary["repeatedPatterns"];
  topLexemeChain?: string;
  alternateLexemeChains?: string[];
  repeatedActionCycles?: number;
  likelyTransitionPoints?: BlindTransitionPoint[];
  motifTags?: string[];
  lexemeCount?: number;
};

function round(value: number) {
  return Number(value.toFixed(4));
}

function mean(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toolFamily(label: BlindEventFamilyLabel | null | undefined) {
  return Boolean(
    label &&
      [
        "repeated-tool-use-like",
        "chop/cut-like",
        "object-fall-like",
        "impact/bounce-like",
        "big-fall-like",
      ].includes(label),
  );
}

function ingestFamily(label: BlindEventFamilyLabel | null | undefined) {
  return Boolean(
    label &&
      [
        "drink-like",
        "eat-like",
        "hold-round-object-like",
        "container/open-close-like",
        "discard/throw-away-like",
        "phone/call-like",
        "inspect/listen-like",
      ].includes(label),
  );
}

function travelFamily(label: BlindEventFamilyLabel | null | undefined) {
  return Boolean(
    label &&
      ["person/setup-like", "carry/hold-object-like", "walk/continue-like"].includes(label),
  );
}

function failureTagsForSegment(segment: {
  eventFamilyHypothesis: BlindEventFamilyLabel;
  runnerUpFamily: BlindEventFamilyLabel | null;
  confidenceMargin: number;
  repeatedCycleCount: number;
  qualitySignals: BlindInferenceQualitySignals;
  phaseRoleSummary: BlindPhaseRole[];
  debug?: VerificationSegmentDebug;
  unresolved: boolean;
}): BlindFailureTag[] {
  const tags = new Set<BlindFailureTag>();
  const framesAnalyzed = segment.debug?.framesAnalyzed ?? 0;

  if (
    segment.qualitySignals.handVisibleRatio < 0.78 ||
    segment.qualitySignals.occlusionRatio > 0.22
  ) {
    tags.add("hand-visibility-weak");
  }

  if (
    segment.qualitySignals.faceVisibleRatio < 0.76 ||
    segment.qualitySignals.mouthStability < 0.34
  ) {
    tags.add("mouth-face-cue-weak");
  }

  if (
    segment.qualitySignals.validFrameRatio < 0.68 ||
    framesAnalyzed < 8 ||
    (segment.phaseRoleSummary.length >= 4 && segment.confidenceMargin < 0.1)
  ) {
    tags.add("segmentation-unstable");
  }

  if (
    (toolFamily(segment.eventFamilyHypothesis) && toolFamily(segment.runnerUpFamily)) ||
    ((segment.eventFamilyHypothesis === "object-fall-like" ||
      segment.runnerUpFamily === "object-fall-like") &&
      segment.repeatedCycleCount >= 2)
  ) {
    tags.add("tool-use-vs-release-confusion");
  }

  if (
    ingestFamily(segment.eventFamilyHypothesis) &&
    ingestFamily(segment.runnerUpFamily)
  ) {
    tags.add("ingest-confusion");
  }

  if (
    travelFamily(segment.eventFamilyHypothesis) &&
    travelFamily(segment.runnerUpFamily)
  ) {
    tags.add("travel-setup-confusion");
  }

  if (segment.unresolved || segment.confidenceMargin < 0.12) {
    tags.add("low-confidence-competition");
  }

  return Array.from(tags);
}

function familySummary(segments: BlindInferenceSegmentResult[]) {
  const buckets = new Map<BlindEventFamilyLabel, number[]>();

  for (const segment of segments) {
    const bucket = buckets.get(segment.eventFamilyHypothesis) ?? [];
    bucket.push(segment.confidence);
    buckets.set(segment.eventFamilyHypothesis, bucket);
  }

  return Array.from(buckets.entries()).map(([label, values]) => ({
    label,
    count: values.length,
    averageConfidence: round(mean(values)),
  }));
}

function likelyConfusionPairs(segments: BlindInferenceSegmentResult[]) {
  const counts = new Map<string, number>();

  for (const segment of segments) {
    if (!segment.runnerUpFamily) {
      continue;
    }

    const pair = [segment.eventFamilyHypothesis, segment.runnerUpFamily]
      .sort()
      .join(" vs ");
    counts.set(pair, (counts.get(pair) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([pair, count]) => ({ pair, count }))
    .sort((left, right) => right.count - left.count || left.pair.localeCompare(right.pair))
    .slice(0, 4);
}

function nextDataNeedForTag(tag: BlindFailureTag) {
  switch (tag) {
    case "hand-visibility-weak":
      return "Need more clips with both hands fully visible and less occlusion.";
    case "mouth-face-cue-weak":
      return "Need more clips with clearer mouth and face visibility.";
    case "segmentation-unstable":
      return "Need steadier clips with clearer pauses so segmentation can split events more cleanly.";
    case "tool-use-vs-release-confusion":
      return "Need more repeated vertical stroke examples with clean release tails.";
    case "ingest-confusion":
      return "Need more labeled mouth-adjacent ingest examples.";
    case "travel-setup-confusion":
      return "Need more carry and travel examples with stable horizontal paths.";
    case "low-confidence-competition":
      return "Need more repeated examples per recurring visual unit to widen family margins.";
    default:
      return "Keep collecting more landmark-only blind examples.";
  }
}

function buildImproveNextSummary(segments: BlindInferenceSegmentResult[]) {
  const failureTagCounts = new Map<BlindFailureTag, number>();

  for (const segment of segments) {
    for (const tag of segment.failureTags) {
      failureTagCounts.set(tag, (failureTagCounts.get(tag) ?? 0) + 1);
    }
  }

  const rankedTagCounts = Array.from(failureTagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag));
  const familyStats = familySummary(segments).sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }

    return right.averageConfidence - left.averageConfidence;
  });

  return {
    strongestFamilies: familyStats.slice(0, 3),
    weakestFamilies: [...familyStats]
      .sort((left, right) => {
        if (left.averageConfidence !== right.averageConfidence) {
          return left.averageConfidence - right.averageConfidence;
        }

        return left.count - right.count;
      })
      .slice(0, 3),
    likelyConfusionPairs: likelyConfusionPairs(segments),
    likelyNextDataNeed: Array.from(
      new Set(rankedTagCounts.slice(0, 3).map((item) => nextDataNeedForTag(item.tag))),
    ),
    failureTagCounts: rankedTagCounts,
  };
}

function patternAlternatives(recognition: RecognitionResult, decision: UncertaintyDecision) {
  const patterns = buildBlindStructuredHypotheses(recognition.encoded);
  const anchors = patterns.slice(0, 3).map((pattern) => ({
    label: pattern.label,
    kind: "structured-unknown" as const,
    confidence: pattern.confidence,
    reason: pattern.reason,
  }));
  const accepted = decision.mode === "accept" && recognition.top1?.label;
  return {
    primaryPattern: patterns[0]!,
    selectedPattern:
      patterns[0]?.label === "unknown-person-intro-like" &&
      decision.mode === "repair" &&
      patterns[1] &&
      patterns[0].confidence < 0.78 &&
      patterns[1].confidence >= 0.55
        ? patterns[1]
        : patterns[0]!,
    alternatives: accepted ? anchors.slice(0, 2) : anchors,
  };
}

function mergeAlternatives(
  exact: CandidateMatch[],
  eventAlternatives: BlindEventFamilyHypothesis[],
  patternAlternativesList: BlindInferenceAlternative[],
  anchorAlternatives: BlindInferenceAlternative[],
) {
  const seen = new Set<string>();
  const merged = [
    ...eventAlternatives.map((family) => ({
      label: family.label,
      kind: "event-family" as const,
      confidence: family.confidence,
      reason: family.reason,
    })),
    ...patternAlternativesList,
    ...exact.map((candidate) => ({
      label: candidate.label,
      kind: "exact" as const,
      confidence: round(candidate.confidence),
      reason: "Closest exact known-candidate label under current local prototype set.",
    })),
    ...anchorAlternatives,
  ].filter((alternative) => {
    const key = `${alternative.kind}:${alternative.label}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });

  return merged.slice(0, 4);
}

export function createBlindInferenceSegment(params: {
  id: string;
  startMs: number;
  endMs: number;
  recognition: RecognitionResult;
  decision: UncertaintyDecision;
  eventFamily: BlindEventFamilyHypothesis;
  eventAlternatives?: BlindEventFamilyHypothesis[];
  runnerUpFamily?: BlindEventFamilyHypothesis | null;
  motifClusterId?: string | null;
  lexemeIds?: string[];
  repeatedCycleCount?: number;
  confidenceBreakdown?: BlindConfidenceBreakdown;
  handshapeChangeStats?: BlindHandshapeChangeStats;
  bodyReactionStats?: BlindBodyReactionStats;
  phaseFamilyVotes?: Array<{
    label: BlindEventFamilyLabel;
    score: number;
  }>;
  motifTags?: string[];
  phases?: BlindInferencePhaseResult[];
  confidenceMargin?: number;
  localTransitionSupport?: number;
  refinedFromFamily?: BlindEventFamilyLabel | null;
  refinementReason?: string | null;
  debug?: VerificationSegmentDebug;
  sessionAnchors?: BlindSessionAnchor[];
}) {
  const exactGuess = params.recognition.top1?.label ?? null;
  const { alternatives: patternAlternativesList } = patternAlternatives(
    params.recognition,
    params.decision,
  );
  const anchorAlternatives = scoreBlindSessionAnchors(
    params.recognition.encoded,
    params.sessionAnchors ?? [],
  ).map((match) => ({
    label: match.label,
    kind: "anchor" as const,
    confidence: match.confidence,
    reason: match.reason,
  }));
  const acceptedExact =
    params.decision.mode === "accept" && params.recognition.top1?.label
      ? params.recognition.top1.label
      : null;
  const bestHypothesis = acceptedExact ?? params.eventFamily.label;
  const bestConfidence = acceptedExact
    ? round(params.recognition.top1?.confidence ?? 0)
    : params.eventFamily.confidence;
  const unresolved =
    params.decision.mode !== "accept" || params.eventFamily.label.startsWith("unknown-");
  const qualitySignals = {
    handVisibleRatio: round(params.recognition.encoded.quality.handVisibleRatio),
    faceVisibleRatio: round(params.recognition.encoded.quality.faceVisibleRatio),
    poseVisibleRatio: round(params.recognition.encoded.quality.poseVisibleRatio),
    occlusionRatio: round(params.recognition.encoded.quality.occlusionRatio),
    motionEnergy: round(params.recognition.encoded.quality.motionEnergy),
    mouthStability: round(params.recognition.encoded.quality.mouthStability),
    validFrameRatio: round(params.recognition.encoded.quality.validFrameRatio),
  } satisfies BlindInferenceQualitySignals;
  const phaseRoleSummary = Array.from(
    new Set((params.phases ?? []).map((phase) => phase.role)),
  );
  const failureTags = failureTagsForSegment({
    eventFamilyHypothesis: params.eventFamily.label,
    runnerUpFamily: params.runnerUpFamily?.label ?? null,
    confidenceMargin: params.confidenceMargin ?? 0,
    repeatedCycleCount: params.repeatedCycleCount ?? 0,
    qualitySignals,
    phaseRoleSummary,
    debug: params.debug,
    unresolved,
  });

  return {
    id: params.id,
    startMs: params.startMs,
    endMs: params.endMs,
    bestHypothesis,
    exactLabelGuess: exactGuess,
    actionHypothesis: params.eventFamily.label,
    eventFamilyHypothesis: params.eventFamily.label,
    runnerUpFamily: params.runnerUpFamily?.label ?? null,
    alternatives: mergeAlternatives(
      params.recognition.topK,
      params.eventAlternatives ?? [],
      patternAlternativesList,
      anchorAlternatives,
    ),
    confidence: bestConfidence,
    confidenceMargin: round(params.confidenceMargin ?? 0),
    localTransitionSupport: round(params.localTransitionSupport ?? 0),
    debtLabel: params.decision.debtLabel,
    uncertaintyReason: params.decision.message,
    hypothesisReason: acceptedExact
      ? "Exact known-candidate label passed current acceptance thresholds."
      : params.eventFamily.reason,
    evidenceChannels: params.eventFamily.channels,
    motifClusterId: params.motifClusterId ?? null,
    lexemeIds: params.lexemeIds ?? [],
    repeatedCycleCount: params.repeatedCycleCount ?? 0,
    confidenceBreakdown: params.confidenceBreakdown ?? {
      motion: 0,
      handshape: 0,
      placement: 0,
      pose: 0,
      mouthFace: 0,
    },
    handshapeChangeStats: params.handshapeChangeStats ?? {
      volatility: 0,
      changeCount: 0,
      compactBurstScore: 0,
    },
    bodyReactionStats: params.bodyReactionStats ?? {
      torsoDisplacement: 0,
      shoulderLift: 0,
      headBounce: 0,
      armSpreadChange: 0,
      reactionAftermathScore: 0,
    },
    phaseFamilyVotes: params.phaseFamilyVotes ?? [],
    motifTags: params.motifTags ?? [],
    qualitySignals,
    failureTags,
    phases: params.phases ?? [],
    refinementChanged: Boolean(params.refinedFromFamily),
    refinedFromFamily: params.refinedFromFamily ?? null,
    refinementReason: params.refinementReason ?? null,
    phaseRoleSummary,
    unresolved,
    debug: params.debug,
  } satisfies BlindInferenceSegmentResult;
}

function summarizePatterns(segments: BlindInferenceSegmentResult[]) {
  const counts = new Map<string, number>();

  for (const segment of segments) {
    const label = segment.actionHypothesis;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return left.label.localeCompare(right.label);
    });
}

function summaryAlternates(repeatedPatterns: Array<{ label: string; count: number }>) {
  return repeatedPatterns
    .slice(0, 3)
    .map((item) => `${item.label} x${item.count}`);
}

function topSummary(
  repeatedPatterns: Array<{ label: string; count: number }>,
  unresolvedSegments: string[],
) {
  if (!repeatedPatterns.length) {
    return unresolvedSegments.length
      ? `Mostly unresolved segments (${unresolvedSegments.join(", ")}).`
      : "No stable repeated pattern.";
  }

  const lead = repeatedPatterns[0]!;
  const next = repeatedPatterns[1];
  return next
    ? `${lead.label} x${lead.count}; ${next.label} x${next.count}`
    : `${lead.label} x${lead.count}`;
}

export function createBlindInferenceReport(params: {
  clipName: string;
  clipDurationMs: number;
  notes: string;
  candidateSetSize: number;
  segments: BlindInferenceSegmentResult[];
  lexemes?: BlindDiscoveredLexeme[];
  eventSummary?: BlindEventSummaryOverrides;
  debug: VerificationReportDebug;
}): BlindInferenceReport {
  const repeatedPatterns = summarizePatterns(params.segments);
  const unresolvedSegments = params.segments
    .filter((segment) => segment.unresolved)
    .map((segment) => segment.id);
  const genericUnknownCount = params.segments.filter((segment) =>
    segment.eventFamilyHypothesis.startsWith("unknown-"),
  ).length;
  const eventFamilyDiversity = new Set(
    params.segments.map((segment) => segment.eventFamilyHypothesis),
  ).size;
  const averageConfidenceMargin = round(
    mean(params.segments.map((segment) => segment.confidenceMargin)),
  );
  const improveNext = buildImproveNextSummary(params.segments);
  const eventMetrics: BlindEventSummaryOverrides = params.eventSummary ?? {
    genericUnknownRatio: genericUnknownCount / Math.max(params.segments.length, 1),
    genericUnknownCount,
    resolvedEventFamilyRatio: 0,
    repeatedMotifCount: repeatedPatterns.length,
    eventFamilyDiversity,
    specificEventFamilyCount: 0,
    unresolvedSegmentsCount: unresolvedSegments.length,
    refinementCount: 0,
    averageConfidenceMargin,
    averageConfidenceByEventFamily: [],
    topEventChain: topSummary(repeatedPatterns, unresolvedSegments),
    alternateEventChains: summaryAlternates(repeatedPatterns),
    repeatedPatterns,
    topLexemeChain: "",
    alternateLexemeChains: [],
    repeatedActionCycles: 0,
    likelyTransitionPoints: [],
    lexemeCount: params.lexemes?.length ?? 0,
  };

  return {
    id: `blind-inference-${crypto.randomUUID()}`,
    createdAt: new Date().toISOString(),
    clipName: params.clipName,
    clipDurationMs: params.clipDurationMs,
    mode: "blind-inference",
    notes: params.notes,
    candidateSetSize: params.candidateSetSize,
    segmentHypothesisTranscript: params.segments
      .map((segment) => segment.bestHypothesis)
      .join(" / "),
    segments: params.segments,
    lexemes: params.lexemes ?? [],
    summary: {
      topSummary: topSummary(repeatedPatterns, unresolvedSegments),
      alternateSummaries: summaryAlternates(repeatedPatterns),
      topEventChain: eventMetrics.topEventChain ?? topSummary(repeatedPatterns, unresolvedSegments),
      alternateEventChains:
        eventMetrics.alternateEventChains ?? summaryAlternates(repeatedPatterns),
      repeatedPatterns: eventMetrics.repeatedPatterns ?? repeatedPatterns,
      topLexemeChain: eventMetrics.topLexemeChain ?? "",
      alternateLexemeChains: eventMetrics.alternateLexemeChains ?? [],
      repeatedActionCycles: eventMetrics.repeatedActionCycles ?? 0,
      likelyTransitionPoints: eventMetrics.likelyTransitionPoints ?? [],
      motifTags: eventMetrics.motifTags ?? [],
      lexemeCount: eventMetrics.lexemeCount ?? (params.lexemes?.length ?? 0),
      unresolvedSegments,
      improveNext,
      metrics: {
        genericUnknownRatio:
          eventMetrics.genericUnknownRatio ?? genericUnknownCount / Math.max(params.segments.length, 1),
        genericUnknownCount:
          eventMetrics.genericUnknownCount ?? genericUnknownCount,
        resolvedEventFamilyRatio:
          eventMetrics.resolvedEventFamilyRatio ??
          (params.segments.length - genericUnknownCount) / Math.max(params.segments.length, 1),
        repeatedMotifCount: eventMetrics.repeatedMotifCount ?? repeatedPatterns.length,
        eventFamilyDiversity:
          eventMetrics.eventFamilyDiversity ?? eventFamilyDiversity,
        specificEventFamilyCount:
          eventMetrics.specificEventFamilyCount ??
          (params.segments.length - genericUnknownCount),
        unresolvedSegmentsCount:
          eventMetrics.unresolvedSegmentsCount ?? unresolvedSegments.length,
        refinementCount: eventMetrics.refinementCount ?? 0,
        averageConfidenceMargin:
          eventMetrics.averageConfidenceMargin ?? averageConfidenceMargin,
        averageConfidenceByEventFamily:
          eventMetrics.averageConfidenceByEventFamily ?? [],
      },
    },
    debug: params.debug,
    privacy: {
      rawVideoStored: false,
      pixelDataStored: false,
      landmarkOnly: true,
    },
    source: "verify",
  };
}

export function buildBlindEventSummary(segmentProfiles: BlindSegmentProfile[]) {
  return inferBlindEventFamilies(segmentProfiles);
}
