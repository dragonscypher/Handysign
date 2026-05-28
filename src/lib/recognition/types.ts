import type { SignFormNotes } from "@/lib/signform/SignFormLedger";

export type DominantHand = "left" | "right" | "unknown";
export type CandidateSource = "demo" | "personal" | "session";
export type TranslationDebtType =
  | "clean"
  | "hand-occlusion"
  | "mouth-cue-missing"
  | "motion-too-short"
  | "dialect-custom-sign-unknown"
  | "ambiguous";

export interface SequenceQuality {
  extractorKind: "holistic" | "mock";
  isDemoMode: boolean;
  validFrameCount: number;
  validFrameRatio: number;
  handVisibleRatio: number;
  faceVisibleRatio: number;
  poseVisibleRatio: number;
  occlusionRatio: number;
  motionEnergy: number;
  mouthStability: number;
}

export interface EncodedSequence {
  handPoseVector: number[];
  handVelocityVector: number[];
  mouthShapeVector: number[];
  facialCueVector: number[];
  motionMaskSummary: number[];
  visibilityMask: number[];
  dominantHand: DominantHand;
  frameCount: number;
  centroid: number[];
  quality: SequenceQuality;
}

export interface CandidateExpectedFormHints {
  expectedLocation?: string;
  expectedMovement?: string;
  needsMouthCue?: boolean;
  needsFacialCue?: boolean;
  handshapeHint?: string;
  notes?: string;
}

export interface CandidateMetadata {
  needsMouthCue?: boolean;
  needsFaceCue?: boolean;
  notes?: string;
  demoDisclaimer?: string;
  expectedFormHints?: CandidateExpectedFormHints;
  signFormNotes?: SignFormNotes;
}

export interface CandidatePrototype {
  id: string;
  label: string;
  source: CandidateSource;
  centroid: number[];
  metadata: CandidateMetadata;
  examplesCount: number;
  correctionBoost?: number;
  updatedAt: string;
}

export interface CandidateMatch extends CandidatePrototype {
  confidence: number;
  distance: number;
  baseConfidence?: number;
  contrastiveAdjustment?: number;
  appliedConfusionPairs?: string[];
  minimalPairAdjustment?: number;
  appliedMinimalPairCards?: string[];
}

export interface RecognitionResult {
  topK: CandidateMatch[];
  top1: CandidateMatch | null;
  top2: CandidateMatch | null;
  candidateSetSize: number;
  encoded: EncodedSequence;
  matchedAt: number;
}

export interface RecognitionOptions {
  topK?: number;
  candidates?: CandidatePrototype[];
}

export type CorrectionAction = "choose" | "teach" | "fingerspell";

export interface CorrectionSummary {
  label: string;
  action: CorrectionAction;
  saved: boolean;
  confidence: number;
  candidateId?: string;
  receiptId?: string;
  debtType: TranslationDebtType;
  timestamp: string;
}
