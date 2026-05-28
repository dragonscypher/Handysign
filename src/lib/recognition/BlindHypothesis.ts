import { clamp01, euclideanDistance, mean } from "@/lib/features/normalize";
import type { EncodedSequence } from "@/lib/recognition/types";

export type BlindStructuredHypothesisLabel =
  | "unknown-greeting-like"
  | "unknown-person-intro-like"
  | "unknown-tool-use-like"
  | "unknown-cut/fall-like"
  | "unknown-eat/drink-like"
  | "unknown-travel/continue-like";

export interface BlindStructuredHypothesis {
  label: BlindStructuredHypothesisLabel;
  confidence: number;
  reason: string;
  channels: string[];
}

export interface BlindSessionAnchor {
  id: string;
  sourceSegmentId: string;
  createdAt: string;
  centroid: number[];
}

export interface BlindSessionAnchorMatch {
  id: string;
  label: string;
  confidence: number;
  reason: string;
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

function openHand(sequence: EncodedSequence) {
  return clamp01(sequence.handPoseVector[8] ?? 0);
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

function scoreGreeting(sequence: EncodedSequence) {
  const nearFace = handNearFace(sequence);
  const aboveShoulder = handAboveShoulder(sequence);
  const motion = motionEnergy(sequence);
  const open = openHand(sequence);
  const face = faceCue(sequence);
  const score = clamp01(
    nearFace * 0.28 +
      aboveShoulder * 0.24 +
      open * 0.18 +
      (1 - verticalTravel(sequence)) * 0.12 +
      face * 0.1 +
      motion * 0.08,
  );

  return {
    label: "unknown-greeting-like" as const,
    confidence: round(score),
    reason: "Hand stayed near face or shoulder with open hand and short greeting-like motion.",
    channels: ["handshape", "location", "timing"],
  };
}

function scorePersonIntro(sequence: EncodedSequence) {
  const baseScore =
    handNearFace(sequence) * 0.2 +
    faceCue(sequence) * 0.24 +
    (1 - motionEnergy(sequence)) * 0.24 +
    visibility(sequence) * 0.16 +
    timingStrength(sequence) * 0.16;
  const score = clamp01(baseScore * clamp01(1 - motionEnergy(sequence) * 0.85));

  return {
    label: "unknown-person-intro-like" as const,
    confidence: round(score),
    reason: "Window looked face-framed and relatively still, like person-intro or topic setup.",
    channels: ["facialCue", "location", "timing"],
  };
}

function scoreToolUse(sequence: EncodedSequence) {
  const score = clamp01(
    motionEnergy(sequence) * 0.28 +
      (1 - handNearFace(sequence)) * 0.22 +
      verticalTravel(sequence) * 0.16 +
      (1 - openHand(sequence)) * 0.14 +
      visibility(sequence) * 0.12 +
      timingStrength(sequence) * 0.08,
  );

  return {
    label: "unknown-tool-use-like" as const,
    confidence: round(score),
    reason: "Motion was active away from face with tighter handshape, which looks tool-use-like.",
    channels: ["handMotion", "handshape", "location"],
  };
}

function scoreCutFall(sequence: EncodedSequence) {
  const score = clamp01(
    motionEnergy(sequence) * 0.34 +
      verticalTravel(sequence) * 0.26 +
      timingStrength(sequence) * 0.14 +
      (1 - handNearFace(sequence)) * 0.14 +
      visibility(sequence) * 0.12,
  );

  return {
    label: "unknown-cut/fall-like" as const,
    confidence: round(score),
    reason: "Strong directional motion with vertical bias looked cut-or-fall-like.",
    channels: ["handMotion", "timing", "visibility"],
  };
}

function scoreEatDrink(sequence: EncodedSequence) {
  const score = clamp01(
    handNearFace(sequence) * 0.34 +
      mouthStability(sequence) * 0.2 +
      motionEnergy(sequence) * 0.14 +
      faceCue(sequence) * 0.12 +
      openHand(sequence) * 0.1 +
      visibility(sequence) * 0.1,
  );

  return {
    label: "unknown-eat/drink-like" as const,
    confidence: round(score),
    reason: "Hand path stayed near mouth with usable mouth stability, which looks eat-or-drink-like.",
    channels: ["mouthCue", "location", "handMotion"],
  };
}

function scoreTravelContinue(sequence: EncodedSequence) {
  const score = clamp01(
    motionEnergy(sequence) * 0.26 +
      horizontalTravel(sequence) * 0.22 +
      (1 - handNearFace(sequence)) * 0.16 +
      timingStrength(sequence) * 0.14 +
      visibility(sequence) * 0.12 +
      openHand(sequence) * 0.1,
  );

  return {
    label: "unknown-travel/continue-like" as const,
    confidence: round(score),
    reason: "Path looked longer and more horizontal, which reads as travel-or-continue-like.",
    channels: ["handMotion", "pose", "timing"],
  };
}

export function buildBlindStructuredHypotheses(sequence: EncodedSequence) {
  return [
    scoreGreeting(sequence),
    scorePersonIntro(sequence),
    scoreToolUse(sequence),
    scoreCutFall(sequence),
    scoreEatDrink(sequence),
    scoreTravelContinue(sequence),
  ].sort((left, right) => right.confidence - left.confidence);
}

export function scoreBlindSessionAnchors(
  sequence: EncodedSequence,
  anchors: BlindSessionAnchor[],
) {
  return anchors
    .map((anchor, index) => {
      const distance =
        euclideanDistance(sequence.centroid, anchor.centroid) /
        Math.sqrt(Math.max(sequence.centroid.length, 1));
      const confidence = clamp01(Math.exp(-distance * 1.7));

      return {
        id: anchor.id,
        label: `similar to temp anchor ${index + 1}`,
        confidence: round(confidence),
        reason: "Current segment is close to previously promoted unlabeled anchor.",
      } satisfies BlindSessionAnchorMatch;
    })
    .filter((match) => match.confidence >= 0.55)
    .sort((left, right) => right.confidence - left.confidence);
}
