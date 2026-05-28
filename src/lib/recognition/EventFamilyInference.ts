import { clamp01, euclideanDistance, mean } from "@/lib/features/normalize";
import { buildBlindStructuredHypotheses } from "@/lib/recognition/BlindHypothesis";
import type { EncodedSequence } from "@/lib/recognition/types";

export type BlindEventFamilyLabel =
  | "intro/greeting-like"
  | "person/setup-like"
  | "carry/hold-object-like"
  | "walk/continue-like"
  | "phone/call-like"
  | "inspect/listen-like"
  | "confusion/realization-like"
  | "fingerspell/emphatic-letter-sequence-like"
  | "repeated-tool-use-like"
  | "chop/cut-like"
  | "object-fall-like"
  | "impact/bounce-like"
  | "big-fall-like"
  | "sit/pause-like"
  | "eat-like"
  | "drink-like"
  | "container/open-close-like"
  | "hold-round-object-like"
  | "discard/throw-away-like"
  | "approval/celebration-like"
  | "unknown-tool-use-like"
  | "unknown-eat/drink-like"
  | "unknown-person-intro-like"
  | "unknown-travel/continue-like";

export interface BlindSegmentProfile {
  id: string;
  startMs: number;
  endMs: number;
  encoded: EncodedSequence;
  averageMotion: number;
  peakMotion: number;
  holdRatio: number;
  directionChanges: number;
}

export interface BlindEventFamilyHypothesis {
  label: BlindEventFamilyLabel;
  confidence: number;
  reason: string;
  channels: string[];
  genericUnknown: boolean;
}

export interface BlindMotifCluster {
  id: string;
  label: BlindEventFamilyLabel;
  count: number;
  segmentIds: string[];
}

export interface BlindSegmentInference {
  id: string;
  primary: BlindEventFamilyHypothesis;
  alternatives: BlindEventFamilyHypothesis[];
  motifClusterId: string | null;
}

export interface BlindClipEventSummary {
  topEventChain: string;
  alternateEventChains: string[];
  repeatedMotifs: BlindMotifCluster[];
  genericUnknownRatio: number;
  resolvedEventFamilyRatio: number;
  specificEventFamilyCount: number;
  unresolvedSegmentsCount: number;
  averageConfidenceByEventFamily: Array<{
    label: BlindEventFamilyLabel;
    averageConfidence: number;
  }>;
}

export interface BlindEventInferenceResult {
  segments: BlindSegmentInference[];
  summary: BlindClipEventSummary;
}

function round(value: number) {
  return Number(value.toFixed(4));
}

function horizontalTravel(sequence: EncodedSequence) {
  return clamp01(Math.abs(sequence.handVelocityVector[0] ?? 0) / 0.18);
}

function verticalTravel(sequence: EncodedSequence) {
  return clamp01(Math.abs(sequence.handVelocityVector[1] ?? 0) / 0.18);
}

function verticalBias(sequence: EncodedSequence) {
  return clamp01(sequence.handVelocityVector[3] ?? 0);
}

function openHand(sequence: EncodedSequence) {
  return clamp01(sequence.handPoseVector[8] ?? 0);
}

function fingerSpread(sequence: EncodedSequence) {
  return clamp01(sequence.handPoseVector[9] ?? 0);
}

function handAboveShoulder(sequence: EncodedSequence) {
  return clamp01(sequence.handPoseVector[10] ?? 0);
}

function handNearFace(sequence: EncodedSequence) {
  return clamp01(sequence.handPoseVector[11] ?? sequence.motionMaskSummary[2] ?? 0);
}

function visibility(sequence: EncodedSequence) {
  return clamp01(mean(sequence.visibilityMask));
}

function faceCue(sequence: EncodedSequence) {
  return clamp01(mean(sequence.facialCueVector) * 2.4);
}

function motionEnergy(sequence: EncodedSequence) {
  return clamp01(sequence.quality.motionEnergy);
}

function mouthStability(sequence: EncodedSequence) {
  return clamp01(sequence.quality.mouthStability);
}

function timingStrength(sequence: EncodedSequence) {
  return clamp01(sequence.quality.validFrameCount / 32);
}

function normalizeMotion(value: number, scale: number) {
  return clamp01(value / scale);
}

function motionProfile(segment: BlindSegmentProfile) {
  return {
    average: normalizeMotion(segment.averageMotion, 0.03),
    peak: normalizeMotion(segment.peakMotion, 0.065),
    hold: clamp01(segment.holdRatio),
    directionChanges: clamp01(segment.directionChanges / 3),
  };
}

function createHypothesis(
  label: BlindEventFamilyLabel,
  score: number,
  reason: string,
  channels: string[],
  genericUnknown = false,
): BlindEventFamilyHypothesis {
  return {
    label,
    confidence: round(clamp01(score)),
    reason,
    channels,
    genericUnknown,
  };
}

function baseHypotheses(segment: BlindSegmentProfile) {
  const sequence = segment.encoded;
  const motion = motionEnergy(sequence);
  const nearFace = handNearFace(sequence);
  const face = faceCue(sequence);
  const open = openHand(sequence);
  const spread = fingerSpread(sequence);
  const aboveShoulder = handAboveShoulder(sequence);
  const visible = visibility(sequence);
  const mouth = mouthStability(sequence);
  const timing = timingStrength(sequence);
  const horizontal = horizontalTravel(sequence);
  const vertical = verticalTravel(sequence);
  const verticalAxis = verticalBias(sequence);
  const profile = motionProfile(segment);
  const closedHand = clamp01(1 - open);
  const repeatedness = clamp01(
    profile.directionChanges * 0.45 + profile.peak * 0.3 + motion * 0.25,
  );
  const pauseStrength = clamp01(profile.hold * 0.7 + (1 - motion) * 0.3);
  const structuredTop = buildBlindStructuredHypotheses(sequence)[0]?.label ?? null;
  const ingestBias = structuredTop === "unknown-eat/drink-like" ? 0.12 : 0;
  const toolBias =
    structuredTop === "unknown-tool-use-like" || structuredTop === "unknown-cut/fall-like"
      ? 0.1
      : 0;
  const introBias =
    structuredTop === "unknown-person-intro-like" || structuredTop === "unknown-greeting-like"
      ? 0.1
      : 0;
  const travelBias = structuredTop === "unknown-travel/continue-like" ? 0.08 : 0;
  const releaseStrength = clamp01(
    vertical * 0.34 +
      profile.peak * 0.28 +
      (1 - nearFace) * 0.18 +
      (1 - profile.directionChanges) * 0.12 +
      (1 - open) * 0.08,
  );

  return [
    createHypothesis(
      "intro/greeting-like",
      nearFace * 0.28 +
        aboveShoulder * 0.2 +
        open * 0.16 +
        face * 0.12 +
        visible * 0.12 +
        (1 - vertical) * 0.12 +
        introBias,
      "Open or face-framed movement stayed near face or shoulder like short intro or greeting.",
      ["location", "handshape", "timing"],
    ),
    createHypothesis(
      "person/setup-like",
      nearFace * 0.26 +
        face * 0.2 +
        pauseStrength * 0.22 +
        visible * 0.16 +
        timing * 0.16 +
        introBias,
      "Window stayed face-framed and relatively still, which looks setup-like rather than action-heavy.",
      ["facialCue", "placement", "timing"],
    ),
    createHypothesis(
      "phone/call-like",
      nearFace * 0.24 +
        closedHand * 0.18 +
        pauseStrength * 0.18 +
        face * 0.12 +
        visible * 0.1 +
        (1 - horizontal) * 0.1 +
        introBias * 0.35,
      "One-hand face-adjacent hold with lower travel looked phone-or-call-like.",
      ["placement", "handshape", "timing"],
    ),
    createHypothesis(
      "inspect/listen-like",
      nearFace * 0.22 +
        pauseStrength * 0.22 +
        face * 0.16 +
        visible * 0.12 +
        (1 - motion) * 0.14 +
        open * 0.08 +
        introBias * 0.35,
      "Near-face attention hold with low travel looked inspect-or-listen-like.",
      ["placement", "facialCue", "timing"],
    ),
    createHypothesis(
      "confusion/realization-like",
      face * 0.22 +
        profile.directionChanges * 0.18 +
        pauseStrength * 0.18 +
        nearFace * 0.16 +
        motion * 0.12 +
        visible * 0.08,
      "Face-driven pause and change pattern looked confusion-or-realization-like.",
      ["facialCue", "motion", "timing"],
    ),
    createHypothesis(
      "fingerspell/emphatic-letter-sequence-like",
      profile.directionChanges * 0.24 +
        motion * 0.16 +
        spread * 0.14 +
        open * 0.12 +
        visible * 0.12 +
        (1 - horizontal) * 0.12 +
        (1 - vertical) * 0.1,
      "Compact repeated changes with less large travel looked fingerspell-or-emphatic-sequence-like.",
      ["handshape", "motion", "placement"],
    ),
    createHypothesis(
      "carry/hold-object-like",
      closedHand * 0.22 +
        (1 - nearFace) * 0.2 +
        pauseStrength * 0.18 +
        profile.average * 0.16 +
        visible * 0.14 +
        timing * 0.1 +
        travelBias * 0.6,
      "Tighter handshape with steadier movement away from face looked like carrying or holding.",
      ["handshape", "placement", "motion"],
    ),
    createHypothesis(
      "walk/continue-like",
      horizontal * 0.28 +
        motion * 0.22 +
        (1 - nearFace) * 0.18 +
        timing * 0.14 +
        visible * 0.1 +
        open * 0.08 +
        travelBias,
      "Longer sideways path away from face looked like travel or continuation.",
      ["motion", "placement", "pose"],
    ),
    createHypothesis(
      "repeated-tool-use-like",
      repeatedness * 0.36 +
        closedHand * 0.18 +
        profile.average * 0.16 +
        (1 - nearFace) * 0.14 +
        verticalAxis * 0.08 +
        visible * 0.08 +
        toolBias,
      "Repeated active strokes with tighter handshape looked like repeated tool use.",
      ["motion", "handshape", "placement"],
    ),
    createHypothesis(
      "chop/cut-like",
      motion * 0.22 +
        verticalAxis * 0.2 +
        profile.peak * 0.14 +
        repeatedness * 0.18 +
        closedHand * 0.12 +
        visible * 0.08 +
        toolBias,
      "Active directional strokes with vertical bias looked chop or cut-like.",
      ["motion", "timing", "handshape"],
    ),
    createHypothesis(
      "object-fall-like",
      releaseStrength * 0.58 +
        visible * 0.14 +
        profile.hold * 0.12 +
        toolBias * 0.16,
      "Fast directional drop with visible release or hold transition looked fall-like.",
      ["motion", "visibility", "timing"],
    ),
    createHypothesis(
      "impact/bounce-like",
      profile.peak * 0.24 +
        profile.directionChanges * 0.2 +
        vertical * 0.16 +
        motion * 0.14 +
        visible * 0.14 +
        toolBias * 0.08,
      "Release with stronger rebound looked impact-or-bounce-like.",
      ["motion", "pose", "timing"],
    ),
    createHypothesis(
      "big-fall-like",
      releaseStrength * 0.32 +
        profile.peak * 0.18 +
        motion * 0.14 +
        vertical * 0.14 +
        profile.directionChanges * 0.1 +
        toolBias * 0.12,
      "Longer build-up plus stronger release aftermath looked big-fall-like.",
      ["motion", "timing", "pose"],
    ),
    createHypothesis(
      "sit/pause-like",
      pauseStrength * 0.34 +
        (1 - aboveShoulder) * 0.16 +
        (1 - nearFace) * 0.14 +
        visible * 0.14 +
        timing * 0.12 +
        (1 - profile.average) * 0.1,
      "Low-motion hold with less face framing looked like pause or settle.",
      ["timing", "placement", "pose"],
    ),
    createHypothesis(
      "eat-like",
      nearFace * 0.28 +
        open * 0.18 +
        spread * 0.14 +
        mouth * 0.14 +
        profile.directionChanges * 0.12 +
        motion * 0.08 +
        visible * 0.06 +
        ingestBias,
      "Hand repeatedly approached mouth with more open handshape, which looks eat-like.",
      ["mouthCue", "handshape", "motion"],
    ),
    createHypothesis(
      "drink-like",
      nearFace * 0.28 +
        mouth * 0.18 +
        closedHand * 0.16 +
        pauseStrength * 0.14 +
        vertical * 0.1 +
        face * 0.08 +
        visible * 0.06 +
        ingestBias,
      "Hand stayed near mouth with steadier hold and tighter handshape, which looks drink-like.",
      ["mouthCue", "timing", "handshape"],
    ),
    createHypothesis(
      "container/open-close-like",
      profile.directionChanges * 0.3 +
        motion * 0.18 +
        closedHand * 0.14 +
        spread * 0.14 +
        (1 - nearFace) * 0.12 +
        visible * 0.12 +
        toolBias * 0.4,
      "Back-and-forth hand change with moderate motion looked open-close-like.",
      ["handshape", "motion", "visibility"],
    ),
    createHypothesis(
      "hold-round-object-like",
      open * 0.22 +
        spread * 0.18 +
        pauseStrength * 0.18 +
        nearFace * 0.14 +
        visible * 0.14 +
        (1 - motion) * 0.14 +
        ingestBias * 0.45,
      "More open curved handshape with steadier hold looked like holding rounded object.",
      ["handshape", "timing", "placement"],
    ),
    createHypothesis(
      "discard/throw-away-like",
      horizontal * 0.24 +
        profile.peak * 0.22 +
        open * 0.16 +
        motion * 0.16 +
        (1 - nearFace) * 0.12 +
        visible * 0.1 +
        travelBias * 0.4,
      "Fast outward release with visible path looked like discard or throw-away motion.",
      ["motion", "handshape", "placement"],
    ),
    createHypothesis(
      "approval/celebration-like",
      aboveShoulder * 0.22 +
        open * 0.16 +
        face * 0.16 +
        motion * 0.14 +
        vertical * 0.12 +
        visible * 0.1 +
        introBias * 0.2,
      "Lifted final pose with stronger positive-looking motion looked approval-or-celebration-like.",
      ["pose", "motion", "facialCue"],
    ),
    createHypothesis(
      "unknown-tool-use-like",
      repeatedness * 0.24 +
        motion * 0.22 +
        (1 - nearFace) * 0.18 +
        closedHand * 0.14 +
        visible * 0.12 +
        timing * 0.1 +
        toolBias,
      "Active away-from-face motion looked tool-use-like, but evidence stayed too broad for narrower family.",
      ["motion", "handshape", "placement"],
      true,
    ),
    createHypothesis(
      "unknown-eat/drink-like",
      nearFace * 0.3 +
        mouth * 0.18 +
        motion * 0.14 +
        face * 0.12 +
        open * 0.08 +
        visible * 0.08 +
        timing * 0.1 +
        ingestBias,
      "Hand stayed near mouth with usable mouth cue, but evidence stayed broad between eat and drink.",
      ["mouthCue", "placement", "motion"],
      true,
    ),
    createHypothesis(
      "unknown-person-intro-like",
        nearFace * 0.22 +
        face * 0.22 +
        pauseStrength * 0.22 +
        visible * 0.18 +
        timing * 0.16 +
        introBias,
      "Window looked face-framed and relatively still, but evidence stayed broad between intro and setup.",
      ["facialCue", "placement", "timing"],
      true,
    ),
    createHypothesis(
      "unknown-travel/continue-like",
      horizontal * 0.24 +
        motion * 0.2 +
        (1 - nearFace) * 0.18 +
        timing * 0.14 +
        visible * 0.12 +
        open * 0.12 +
        travelBias,
      "Path looked travel-like, but evidence stayed broad between carry, continue, and discard.",
      ["motion", "pose", "timing"],
      true,
    ),
  ].sort((left, right) => right.confidence - left.confidence);
}

function inferenceVector(segment: BlindSegmentProfile) {
  return [
    ...segment.encoded.centroid,
    round(normalizeMotion(segment.averageMotion, 0.03)),
    round(normalizeMotion(segment.peakMotion, 0.065)),
    round(clamp01(segment.holdRatio)),
    round(clamp01(segment.directionChanges / 3)),
  ];
}

function familyGroup(label: BlindEventFamilyLabel) {
  if (label.includes("tool") || label.includes("cut") || label.includes("fall")) {
    return "tool";
  }

  if (label.includes("phone") || label.includes("listen") || label.includes("confusion")) {
    return "attention";
  }

  if (
    label.includes("eat") ||
    label.includes("drink") ||
    label.includes("round-object") ||
    label.includes("container")
  ) {
    return "ingest";
  }

  if (label.includes("fingerspell")) {
    return "signal";
  }

  if (label.includes("carry") || label.includes("walk") || label.includes("travel")) {
    return "travel";
  }

  if (label.includes("intro") || label.includes("setup")) {
    return "intro";
  }

  if (label.includes("approval") || label.includes("celebration")) {
    return "celebration";
  }

  if (label.includes("discard")) {
    return "release";
  }

  return "other";
}

function shouldSharpenGeneric(primary: BlindEventFamilyHypothesis, alternative?: BlindEventFamilyHypothesis) {
  return (
    primary.genericUnknown &&
    alternative &&
    !alternative.genericUnknown &&
    alternative.confidence >= 0.58 &&
    alternative.confidence >= primary.confidence - 0.08
  );
}

function primaryHypothesis(segment: BlindSegmentProfile) {
  const ranked = baseHypotheses(segment);
  const [first, second] = ranked;

  if (first && shouldSharpenGeneric(first, second)) {
    return {
      primary: second,
      alternatives: [first, ...ranked.filter((item) => item.label !== second.label).slice(1, 4)],
    };
  }

  return {
    primary: first!,
    alternatives: ranked.slice(1, 5),
  };
}

function clusterSegments(segments: Array<{
  profile: BlindSegmentProfile;
  primary: BlindEventFamilyHypothesis;
}>) {
  const clusters: Array<{
    id: string;
    label: BlindEventFamilyLabel;
    familyGroup: string;
    segmentIds: string[];
    center: number[];
  }> = [];

  for (const segment of segments) {
    const vector = inferenceVector(segment.profile);
    const group = familyGroup(segment.primary.label);
    const matching = clusters.find((cluster) => {
      if (cluster.familyGroup !== group) {
        return false;
      }

      const distance =
        euclideanDistance(vector, cluster.center) / Math.sqrt(Math.max(vector.length, 1));
      return distance <= 0.18;
    });

    if (matching) {
      matching.segmentIds.push(segment.profile.id);
      matching.center = matching.center.map((value, index) =>
        round((value * (matching.segmentIds.length - 1) + (vector[index] ?? 0)) / matching.segmentIds.length),
      );
      if (segment.primary.confidence > 0.62 && !segment.primary.genericUnknown) {
        matching.label = segment.primary.label;
      }
      continue;
    }

    clusters.push({
      id: `motif-${String(clusters.length + 1).padStart(2, "0")}`,
      label: segment.primary.label,
      familyGroup: group,
      segmentIds: [segment.profile.id],
      center: vector,
    });
  }

  return clusters.filter((cluster) => cluster.segmentIds.length >= 2);
}

function refineWithMotifs(
  segments: Array<{
    profile: BlindSegmentProfile;
    primary: BlindEventFamilyHypothesis;
    alternatives: BlindEventFamilyHypothesis[];
  }>,
) {
  const motifClusters = clusterSegments(segments);
  const assignedSegmentIds = new Set(motifClusters.flatMap((cluster) => cluster.segmentIds));
  const fallbackByLabel = new Map<BlindEventFamilyLabel, string[]>();

  for (const segment of segments) {
    if (assignedSegmentIds.has(segment.profile.id)) {
      continue;
    }

    const bucket = fallbackByLabel.get(segment.primary.label) ?? [];
    bucket.push(segment.profile.id);
    fallbackByLabel.set(segment.primary.label, bucket);
  }

  for (const [label, segmentIds] of fallbackByLabel.entries()) {
    if (segmentIds.length < 2) {
      continue;
    }

    const firstSegment = segments.find((segment) => segment.profile.id === segmentIds[0]);
    motifClusters.push({
      id: `motif-${String(motifClusters.length + 1).padStart(2, "0")}`,
      label,
      familyGroup: familyGroup(label),
      segmentIds,
      center: firstSegment ? inferenceVector(firstSegment.profile) : [],
    });
  }

  const segmentToCluster = new Map<string, BlindMotifCluster>();

  for (const cluster of motifClusters) {
    const motif = {
      id: cluster.id,
      label:
        cluster.label === "unknown-tool-use-like"
          ? "repeated-tool-use-like"
          : cluster.label,
      count: cluster.segmentIds.length,
      segmentIds: [...cluster.segmentIds],
    } satisfies BlindMotifCluster;

    for (const segmentId of motif.segmentIds) {
      segmentToCluster.set(segmentId, motif);
    }
  }

  const refinedSegments = segments.map((segment) => {
    const motif = segmentToCluster.get(segment.profile.id) ?? null;
    let primary = segment.primary;

    if (motif?.label === "repeated-tool-use-like") {
      if (primary.label === "unknown-tool-use-like") {
        primary = createHypothesis(
          "repeated-tool-use-like",
          Math.max(primary.confidence, 0.64),
          "Clip-internal repeated motif grouped this segment with similar tool-use-like strokes.",
          ["motion", "handshape", "placement"],
        );
      } else if (primary.label === "chop/cut-like") {
        primary = createHypothesis(
          "chop/cut-like",
          Math.max(primary.confidence, 0.66),
          "Clip-internal repeated motif reinforced directional repeated tool-use strokes.",
          ["motion", "timing", "handshape"],
        );
      }
    }

    if (motif?.label === "eat-like" && primary.label === "unknown-eat/drink-like") {
      primary = createHypothesis(
        "eat-like",
        Math.max(primary.confidence, 0.6),
        "Clip-internal repeated mouth-adjacent motif favored eat-like action over generic ingest.",
        ["mouthCue", "handshape", "motion"],
      );
    }

    if (motif?.label === "drink-like" && primary.label === "unknown-eat/drink-like") {
      primary = createHypothesis(
        "drink-like",
        Math.max(primary.confidence, 0.6),
        "Clip-internal repeated mouth-adjacent motif favored drink-like action over generic ingest.",
        ["mouthCue", "timing", "handshape"],
      );
    }

    return {
      id: segment.profile.id,
      primary,
      alternatives: segment.alternatives,
      motifClusterId: motif?.id ?? null,
    } satisfies BlindSegmentInference;
  });

  return {
    segments: refinedSegments,
    motifs: motifClusters.map((cluster) => ({
      id: cluster.id,
      label:
        cluster.label === "unknown-tool-use-like"
          ? "repeated-tool-use-like"
          : cluster.label,
      count: cluster.segmentIds.length,
      segmentIds: cluster.segmentIds,
    })),
  };
}

function compactChain(labels: BlindEventFamilyLabel[]) {
  const parts: string[] = [];

  for (const label of labels) {
    const last = parts.at(-1);

    if (last?.startsWith(`${label} x`)) {
      const [, countText] = last.split(" x");
      const count = Number.parseInt(countText ?? "1", 10);
      parts[parts.length - 1] = `${label} x${count + 1}`;
      continue;
    }

    if (last === label) {
      parts[parts.length - 1] = `${label} x2`;
      continue;
    }

    parts.push(label);
  }

  return parts.join(" -> ");
}

function alternateChains(inferences: BlindSegmentInference[]) {
  const swaps = inferences
    .map((segment) => {
      const alternative = segment.alternatives.find(
        (item) => !item.genericUnknown && item.confidence >= segment.primary.confidence - 0.12,
      );

      return {
        id: segment.id,
        alternative,
      };
    })
    .filter((item) => item.alternative)
    .slice(0, 3);

  const chains = new Set<string>();

  for (const swap of swaps) {
    const labels = inferences.map((segment) =>
      segment.id === swap.id ? swap.alternative!.label : segment.primary.label,
    );

    chains.add(compactChain(labels));
  }

  return Array.from(chains).slice(0, 3);
}

function averageConfidenceByEventFamily(inferences: BlindSegmentInference[]) {
  const buckets = new Map<BlindEventFamilyLabel, number[]>();

  for (const inference of inferences) {
    const bucket = buckets.get(inference.primary.label) ?? [];
    bucket.push(inference.primary.confidence);
    buckets.set(inference.primary.label, bucket);
  }

  return Array.from(buckets.entries())
    .map(([label, values]) => ({
      label,
      averageConfidence: round(mean(values)),
    }))
    .sort((left, right) => right.averageConfidence - left.averageConfidence);
}

export function inferBlindEventFamilies(
  segments: BlindSegmentProfile[],
): BlindEventInferenceResult {
  const seeded = segments.map((profile) => {
    const { primary, alternatives } = primaryHypothesis(profile);
    return {
      profile,
      primary,
      alternatives,
    };
  });
  const refined = refineWithMotifs(seeded);
  const topEventChain = compactChain(refined.segments.map((segment) => segment.primary.label));
  const genericUnknownCount = refined.segments.filter(
    (segment) => segment.primary.genericUnknown || segment.primary.label.startsWith("unknown-"),
  ).length;
  const specificEventFamilyCount = refined.segments.length - genericUnknownCount;

  return {
    segments: refined.segments,
    summary: {
      topEventChain,
      alternateEventChains: alternateChains(refined.segments),
      repeatedMotifs: refined.motifs.sort((left, right) => right.count - left.count),
      genericUnknownRatio: round(genericUnknownCount / Math.max(refined.segments.length, 1)),
      resolvedEventFamilyRatio: round(
        specificEventFamilyCount / Math.max(refined.segments.length, 1),
      ),
      specificEventFamilyCount,
      unresolvedSegmentsCount: refined.segments.filter((segment) =>
        segment.primary.label.startsWith("unknown-"),
      ).length,
      averageConfidenceByEventFamily: averageConfidenceByEventFamily(refined.segments),
    },
  };
}
