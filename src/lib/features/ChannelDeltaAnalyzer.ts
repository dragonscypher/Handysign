import { clamp01, euclideanDistance } from "@/lib/features/normalize";
import type {
  ChannelDelta,
  ConfusionPair,
  ContrastiveChannel,
  ContrastiveMemorySource,
  FeatureSummary,
} from "@/lib/recognition/ContrastiveMemory";
import { confusionPairId } from "@/lib/recognition/ContrastiveMemory";
import type {
  CandidatePrototype,
  EncodedSequence,
} from "@/lib/recognition/types";

const HAND_POSE_WIDTH = 12;
const HAND_VELOCITY_WIDTH = 4;
const MOUTH_WIDTH = 4;
const FACIAL_WIDTH = 4;
const MOTION_MASK_WIDTH = 4;
const VISIBILITY_WIDTH = 4;

function normalizedDistance(left: number[], right: number[]) {
  const width = Math.max(left.length, right.length, 1);
  return euclideanDistance(left, right) / Math.sqrt(width);
}

function channelLabel(channel: ContrastiveChannel) {
  switch (channel) {
    case "handShape":
      return "hand shape";
    case "handMotion":
      return "hand motion";
    case "mouthCue":
      return "mouth cue";
    case "facialCue":
      return "face cue";
    case "pose":
      return "pose";
    case "timing":
      return "timing";
    case "visibility":
      return "visibility";
    default:
      return "feature channel";
  }
}

function channelExplanation(
  channel: ContrastiveChannel,
  sequence: EncodedSequence,
  intended: CandidatePrototype,
  confused: CandidatePrototype,
) {
  switch (channel) {
    case "handMotion":
      return "Hand motion separated these candidates most.";
    case "mouthCue":
      return sequence.quality.mouthStability < 0.45
        ? "Mouth cue was missing or unstable."
        : `Mouth cue separated ${intended.label} from ${confused.label}.`;
    case "facialCue":
      return sequence.quality.faceVisibleRatio < 0.45
        ? "Face cue was weak; this pair may need non-manual features."
        : "Facial cue acted like semantic anchor for this near miss.";
    case "timing":
      return sequence.quality.validFrameCount < 24 || sequence.quality.motionEnergy < 0.08
        ? "Timing was too short for a stable decision."
        : "Timing pattern separated these candidates most.";
    case "visibility":
      return "Landmark visibility changed which candidate looked plausible.";
    case "pose":
      return "Body position and hand placement helped separate this pair.";
    case "handShape":
    default:
      return "Hand shape separated these candidates most.";
  }
}

function splitCentroid(centroid: number[]) {
  const handPose = centroid.slice(0, HAND_POSE_WIDTH);
  const handVelocity = centroid.slice(
    HAND_POSE_WIDTH,
    HAND_POSE_WIDTH + HAND_VELOCITY_WIDTH,
  );
  const mouthShape = centroid.slice(
    HAND_POSE_WIDTH + HAND_VELOCITY_WIDTH,
    HAND_POSE_WIDTH + HAND_VELOCITY_WIDTH + MOUTH_WIDTH,
  );
  const facialCue = centroid.slice(
    HAND_POSE_WIDTH + HAND_VELOCITY_WIDTH + MOUTH_WIDTH,
    HAND_POSE_WIDTH + HAND_VELOCITY_WIDTH + MOUTH_WIDTH + FACIAL_WIDTH,
  );
  const motionMask = centroid.slice(
    HAND_POSE_WIDTH + HAND_VELOCITY_WIDTH + MOUTH_WIDTH + FACIAL_WIDTH,
    HAND_POSE_WIDTH +
      HAND_VELOCITY_WIDTH +
      MOUTH_WIDTH +
      FACIAL_WIDTH +
      MOTION_MASK_WIDTH,
  );
  const visibility = centroid.slice(
    HAND_POSE_WIDTH +
      HAND_VELOCITY_WIDTH +
      MOUTH_WIDTH +
      FACIAL_WIDTH +
      MOTION_MASK_WIDTH,
    HAND_POSE_WIDTH +
      HAND_VELOCITY_WIDTH +
      MOUTH_WIDTH +
      FACIAL_WIDTH +
      MOTION_MASK_WIDTH +
      VISIBILITY_WIDTH,
  );

  return {
    handPose,
    handVelocity,
    mouthShape,
    facialCue,
    motionMask,
    visibility,
  };
}

export function featureSummaryFromSequence(sequence: EncodedSequence): FeatureSummary {
  return {
    handShape: sequence.handPoseVector.slice(0, 10),
    handMotion: sequence.handVelocityVector.slice(),
    mouthCue: sequence.mouthShapeVector.slice(),
    facialCue: sequence.facialCueVector.slice(),
    pose: [
      sequence.handPoseVector[10] ?? 0,
      sequence.handPoseVector[11] ?? 0,
      sequence.motionMaskSummary[2] ?? 0,
    ],
    timing: [
      clamp01(sequence.frameCount / 64),
      sequence.motionMaskSummary[0] ?? 0,
      sequence.handVelocityVector[2] ?? 0,
      sequence.handVelocityVector[3] ?? 0,
    ],
    visibility: sequence.visibilityMask.slice(),
  };
}

export function featureSummaryFromCandidate(candidate: CandidatePrototype): FeatureSummary {
  const channels = splitCentroid(candidate.centroid);

  return {
    handShape: channels.handPose.slice(0, 10),
    handMotion: channels.handVelocity.slice(),
    mouthCue: channels.mouthShape.slice(),
    facialCue: channels.facialCue.slice(),
    pose: [
      channels.handPose[10] ?? 0,
      channels.handPose[11] ?? 0,
      channels.motionMask[2] ?? 0,
    ],
    timing: [
      channels.motionMask[0] ?? 0,
      channels.motionMask[1] ?? 0,
      channels.handVelocity[2] ?? 0,
      channels.handVelocity[3] ?? 0,
    ],
    visibility: channels.visibility.slice(),
  };
}

export function pairSupportForCurrentSequence(
  currentSummary: FeatureSummary,
  pair: ConfusionPair,
) {
  const rankedChannels = pair.channelDeltas.slice(0, 3);

  if (!rankedChannels.length) {
    return 0;
  }

  let weightedSupport = 0;
  let totalWeight = 0;

  for (const delta of rankedChannels) {
    const positiveDistance = normalizedDistance(
      currentSummary[delta.channel],
      pair.positiveFeatureSummary[delta.channel],
    );
    const negativeDistance = normalizedDistance(
      currentSummary[delta.channel],
      pair.negativeFeatureSummary[delta.channel],
    );
    const support = Math.max(-1, Math.min(1, negativeDistance - positiveDistance));
    const weight = Math.max(delta.deltaScore, 0.08);

    weightedSupport += support * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) {
    return 0;
  }

  return weightedSupport / totalWeight;
}

export function strongestDifferenceLabel(channelDelta: ChannelDelta | null) {
  return channelDelta ? channelLabel(channelDelta.channel) : "mixed cues";
}

export function analyzeChannelDeltas(
  sequence: EncodedSequence,
  intended: CandidatePrototype,
  confused: CandidatePrototype,
) {
  const currentSummary = featureSummaryFromSequence(sequence);
  const intendedSummary = featureSummaryFromCandidate(intended);
  const confusedSummary = featureSummaryFromCandidate(confused);
  const channels: ContrastiveChannel[] = [
    "handShape",
    "handMotion",
    "mouthCue",
    "facialCue",
    "pose",
    "timing",
    "visibility",
  ];

  const channelDeltas = channels
    .map((channel) => {
      const intendedDistance = normalizedDistance(
        currentSummary[channel],
        intendedSummary[channel],
      );
      const confusedDistance = normalizedDistance(
        currentSummary[channel],
        confusedSummary[channel],
      );
      const deltaScore = clamp01(
        Math.abs(confusedDistance - intendedDistance) / 1.25,
      );

      return {
        channel,
        deltaScore,
        directionLabel: `${channelLabel(channel)} favored ${intended.label} over ${confused.label}.`,
        explanation: channelExplanation(channel, sequence, intended, confused),
      } satisfies ChannelDelta;
    })
    .sort((left, right) => right.deltaScore - left.deltaScore)
    .slice(0, 3);

  return {
    channelDeltas,
    strongestChannel: channelDeltas[0] ?? null,
    topExplanation:
      channelDeltas[0]?.explanation ??
      "Multiple channels stayed too close for a stable decision.",
    positiveFeatureSummary: currentSummary,
    negativeFeatureSummary: confusedSummary,
  };
}

export function buildConfusionPair(
  sequence: EncodedSequence,
  intended: CandidatePrototype,
  confused: CandidatePrototype,
  source: ContrastiveMemorySource,
): ConfusionPair {
  const now = new Date().toISOString();
  const analysis = analyzeChannelDeltas(sequence, intended, confused);

  return {
    id: confusionPairId(intended.label, confused.label),
    intendedLabel: intended.label,
    confusedLabel: confused.label,
    intendedCandidateId: intended.id,
    confusedCandidateId: confused.id,
    positiveFeatureSummary: analysis.positiveFeatureSummary,
    negativeFeatureSummary: analysis.negativeFeatureSummary,
    channelDeltas: analysis.channelDeltas,
    source,
    createdAt: now,
    updatedAt: now,
    count: 1,
  };
}
