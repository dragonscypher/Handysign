import { analyzeChannelDeltas } from "@/lib/features/ChannelDeltaAnalyzer";
import { mean } from "@/lib/features/normalize";
import type {
  LandmarkFrame,
  Point3D,
} from "@/lib/landmarks/types";
import { assertNoRawVideoFields } from "@/lib/privacy/assertNoRawVideoFields";
import {
  minimalPairReceiptSummary,
  type MinimalPairCard,
} from "@/lib/minimal-pairs/MinimalPair";
import type { ChannelDelta } from "@/lib/recognition/ContrastiveMemory";
import type {
  EncodedSequence,
  RecognitionResult,
} from "@/lib/recognition/types";
import type { UncertaintyDecision } from "@/lib/uncertainty/UncertaintyEngine";
import { signFormExtractor } from "@/lib/signform/SignFormExtractor";
import type {
  MotionReceipt,
  MotionReceiptMode,
  MotionReceiptSource,
  ReceiptPoint,
  ReceiptReplayFrame,
} from "@/lib/receipts/MotionReceipt";

const FACE_INDICES = [1, 70, 300, 159, 145, 386, 374, 13, 14, 61, 291] as const;
const POSE_INDICES = [11, 12, 13, 14, 15, 16, 23, 24] as const;
const HAND_INDICES = [0, 4, 8, 12, 16, 20] as const;
const MAX_FRAMES = 64;

export interface MotionReceiptBuilderInput {
  landmarkBuffer: LandmarkFrame[];
  encodedSequence: EncodedSequence;
  recognition: RecognitionResult;
  decision: UncertaintyDecision;
  channelDeltas?: ChannelDelta[] | null;
  minimalPairCards?: MinimalPairCard[] | null;
  mode?: MotionReceiptMode;
  source: MotionReceiptSource;
  persisted?: boolean;
}

function createReceiptId() {
  const random = globalThis.crypto?.randomUUID?.();

  if (random) {
    return `receipt-${random}`;
  }

  return `receipt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function round(value: number) {
  return Number(value.toFixed(4));
}

function toPointTuple(point?: Point3D | null): ReceiptPoint | null {
  if (!point) {
    return null;
  }

  return [round(point.x), round(point.y), round(point.z ?? 0)];
}

function collectPoints(points: Array<Point3D | undefined | null>) {
  return points
    .map((point) => toPointTuple(point))
    .filter((point): point is ReceiptPoint => Boolean(point));
}

function downsampleBuffer(buffer: LandmarkFrame[]) {
  if (buffer.length <= MAX_FRAMES) {
    return buffer;
  }

  const result: LandmarkFrame[] = [];
  const step = (buffer.length - 1) / (MAX_FRAMES - 1);

  for (let index = 0; index < MAX_FRAMES; index += 1) {
    result.push(buffer[Math.round(index * step)]!);
  }

  return result;
}

function deriveDebtFlags(frame: LandmarkFrame, decision: UncertaintyDecision) {
  const flags = new Set<string>();

  if (!frame.quality.handVisible || !frame.quality.faceVisible) {
    flags.add("visibility gap");
  }

  if (decision.debtType !== "clean") {
    flags.add(decision.debtLabel);
  }

  return Array.from(flags);
}

function buildReplayFrame(frame: LandmarkFrame, decision: UncertaintyDecision): ReceiptReplayFrame {
  return {
    timestamp: frame.timestamp,
    hands: frame.hands.map((hand) => ({
      handedness: hand.handedness,
      points: collectPoints(HAND_INDICES.map((index) => hand.landmarks[index])),
    })),
    mouth: collectPoints(frame.mouth),
    face: collectPoints(FACE_INDICES.map((index) => frame.face?.landmarks[index])),
    pose: collectPoints(POSE_INDICES.map((index) => frame.pose?.landmarks[index])),
    quality: {
      extractorKind: frame.quality.extractorKind,
      isDemoMode: frame.quality.isDemoMode,
      handVisible: frame.quality.handVisible,
      faceVisible: frame.quality.faceVisible,
      poseVisible: frame.quality.poseVisible,
    },
    debtFlags: deriveDebtFlags(frame, decision),
  };
}

function deriveChannelDeltas(
  encodedSequence: EncodedSequence,
  recognition: RecognitionResult,
  provided?: ChannelDelta[] | null,
) {
  if (provided?.length) {
    return provided.slice(0, 3);
  }

  if (recognition.top1 && recognition.top2) {
    return analyzeChannelDeltas(encodedSequence, recognition.top1, recognition.top2).channelDeltas;
  }

  return [];
}

function deriveMissingChannels(
  encodedSequence: EncodedSequence,
  decision: UncertaintyDecision,
) {
  const missing = new Set<string>();
  const quality = encodedSequence.quality;

  if (quality.handVisibleRatio < 0.65 || quality.occlusionRatio > 0.35) {
    missing.add("visibility");
  }

  if (quality.faceVisibleRatio < 0.35) {
    missing.add("facial cue");
  }

  if (quality.poseVisibleRatio < 0.35) {
    missing.add("pose");
  }

  if (quality.mouthStability < 0.45 || decision.debtType === "mouth-cue-missing") {
    missing.add("mouth cue");
  }

  if (quality.validFrameCount < 24 || quality.motionEnergy < 0.08) {
    missing.add("timing");
    missing.add("hand motion");
  }

  return Array.from(missing);
}

function inferMode(
  encodedSequence: EncodedSequence,
  decision: UncertaintyDecision,
  explicitMode?: MotionReceiptMode,
): MotionReceiptMode {
  if (explicitMode) {
    return explicitMode;
  }

  if (encodedSequence.quality.isDemoMode) {
    return "demo";
  }

  if (decision.mode === "accept") {
    return "accepted";
  }

  if (
    decision.debtType === "ambiguous" ||
    decision.debtType === "dialect-custom-sign-unknown"
  ) {
    return "uncertain";
  }

  return "repair";
}

export function buildMotionReceipt({
  landmarkBuffer,
  encodedSequence,
  recognition,
  decision,
  channelDeltas,
  minimalPairCards,
  mode,
  source,
  persisted = false,
}: MotionReceiptBuilderInput): MotionReceipt {
  const receiptId = createReceiptId();
  const strongestChannels = deriveChannelDeltas(
    encodedSequence,
    recognition,
    channelDeltas,
  );
  const top1 = recognition.top1;
  const top2 = recognition.top2;
  const receipt: MotionReceipt = {
    id: receiptId,
    createdAt: new Date().toISOString(),
    mode: inferMode(encodedSequence, decision, mode),
    candidateSummary: {
      topLabel: top1?.label ?? null,
      topCandidateId: top1?.id ?? null,
      topConfidence: round(top1?.confidence ?? 0),
      demoHints: top1?.metadata.expectedFormHints ?? null,
      alternatives: recognition.topK.slice(0, 3).map((candidate) => ({
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
      })),
    },
    recognitionSummary: {
      matchedAt: recognition.matchedAt,
      candidateSetSize: recognition.candidateSetSize,
      extractorKind: encodedSequence.quality.extractorKind,
      isDemoMode: encodedSequence.quality.isDemoMode,
      margin: round((top1?.confidence ?? 0) - (top2?.confidence ?? 0)),
    },
    uncertaintySummary: {
      decision: decision.mode === "accept" ? "accepted" : "uncertain",
      reason: decision.message || decision.explanation,
      acceptedByThreshold: decision.mode === "accept" && decision.debtType === "clean",
      hardDebtPresent: decision.debtType !== "clean",
    },
    translationDebt: {
      type: decision.debtType,
      label: decision.debtLabel,
      message: decision.message,
    },
    channelSummary: {
      strongestChannels,
      missingChannels: deriveMissingChannels(encodedSequence, decision),
      visibilityScore: round(mean(encodedSequence.visibilityMask)),
      motionEnergy: round(encodedSequence.quality.motionEnergy),
      mouthStability: round(encodedSequence.quality.mouthStability),
    },
    replayFrames: downsampleBuffer(landmarkBuffer).map((frame) =>
      buildReplayFrame(frame, decision),
    ),
    privacy: {
      rawVideoStored: false,
      pixelDataStored: false,
      landmarkOnly: true,
      persisted,
    },
    source,
    minimalPairCardIds: minimalPairCards?.map((card) => card.id) ?? [],
    relatedMinimalPairCards:
      minimalPairCards?.map((card) => minimalPairReceiptSummary(card)) ?? [],
  };
  receipt.signFormLedger = signFormExtractor.extract({
    receiptId,
    receipt,
    encodedSequence,
    recognition,
    decision,
  });

  assertNoRawVideoFields(receipt);

  return receipt;
}
