import type { ChannelDelta } from "@/lib/recognition/ContrastiveMemory";
import type { ExtractorKind, Handedness } from "@/lib/landmarks/types";
import type {
  CandidateExpectedFormHints,
  TranslationDebtType,
} from "@/lib/recognition/types";
import type { MinimalPairReceiptSummary } from "@/lib/minimal-pairs/MinimalPair";
import type { CuePatchMetadata } from "@/lib/repair/CuePatch";
import type { SignFormLedger } from "@/lib/signform/SignFormLedger";

export type MotionReceiptMode = "accepted" | "uncertain" | "repair" | "teach" | "demo";
export type MotionReceiptSource =
  | "live"
  | "repair-panel"
  | "teach-mode"
  | "minimal-pair-lab"
  | "e2e";

export interface ReceiptCandidateAlternative {
  candidateId: string;
  label: string;
  confidence: number;
  baseConfidence?: number;
  contrastiveAdjustment?: number;
  minimalPairAdjustment?: number;
}

export interface ReceiptCandidateSummary {
  topLabel: string | null;
  topCandidateId: string | null;
  topConfidence: number;
  alternatives: ReceiptCandidateAlternative[];
  demoHints?: CandidateExpectedFormHints | null;
}

export interface ReceiptRecognitionSummary {
  matchedAt: number;
  candidateSetSize: number;
  extractorKind: ExtractorKind;
  isDemoMode: boolean;
  margin: number;
}

export interface ReceiptUncertaintySummary {
  decision: string;
  reason: string;
  acceptedByThreshold: boolean;
  hardDebtPresent: boolean;
}

export interface ReceiptTranslationDebt {
  type: TranslationDebtType;
  label: string;
  message: string;
}

export type ReceiptPoint = [number, number, number];

export interface ReceiptReplayHand {
  handedness: Handedness;
  points: ReceiptPoint[];
}

export interface ReceiptReplayFrameQuality {
  extractorKind: ExtractorKind;
  isDemoMode: boolean;
  handVisible: boolean;
  faceVisible: boolean;
  poseVisible: boolean;
}

export interface ReceiptReplayFrame {
  timestamp: number;
  hands: ReceiptReplayHand[];
  mouth: ReceiptPoint[];
  face: ReceiptPoint[];
  pose: ReceiptPoint[];
  quality: ReceiptReplayFrameQuality;
  debtFlags: string[];
}

export interface ReceiptPrivacy {
  rawVideoStored: false;
  pixelDataStored: false;
  landmarkOnly: true;
  persisted: boolean;
}

export interface ReceiptChannelSummary {
  strongestChannels: ChannelDelta[];
  missingChannels: string[];
  visibilityScore: number;
  motionEnergy: number;
  mouthStability: number;
}

export interface MotionReceipt {
  id: string;
  createdAt: string;
  mode: MotionReceiptMode;
  candidateSummary: ReceiptCandidateSummary;
  recognitionSummary: ReceiptRecognitionSummary;
  uncertaintySummary: ReceiptUncertaintySummary;
  translationDebt: ReceiptTranslationDebt;
  channelSummary: ReceiptChannelSummary;
  replayFrames: ReceiptReplayFrame[];
  privacy: ReceiptPrivacy;
  source: MotionReceiptSource;
  cuePatch?: CuePatchMetadata;
  signFormLedger?: SignFormLedger;
  minimalPairCardIds?: string[];
  relatedMinimalPairCards?: MinimalPairReceiptSummary[];
}

export function receiptChannelLabel(channel: ChannelDelta["channel"] | null) {
  switch (channel) {
    case "handShape":
      return "hand shape";
    case "handMotion":
      return "hand motion";
    case "mouthCue":
      return "mouth cue";
    case "facialCue":
      return "facial cue";
    case "pose":
      return "pose";
    case "timing":
      return "timing";
    case "visibility":
      return "visibility";
    default:
      return "mixed cues";
  }
}

export function strongestReceiptChannelLabel(receipt: MotionReceipt | null) {
  return receiptChannelLabel(receipt?.channelSummary.strongestChannels[0]?.channel ?? null);
}
