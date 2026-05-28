import type { ContrastiveChannel } from "@/lib/recognition/ContrastiveMemory";
import type { TranslationDebtType } from "@/lib/recognition/types";

export type CuePatchKind =
  | "mouth-visible-repeat"
  | "hand-occlusion-repeat"
  | "final-handshape-hold"
  | "slow-full-repeat"
  | "face-cue-visible-repeat"
  | "body-frame-repeat"
  | "choose-from-candidates"
  | "teach-personal-sign";

export interface CuePatchPrompt {
  id: string;
  kind: CuePatchKind;
  title: string;
  instruction: string;
  why: string;
  targetChannels: ContrastiveChannel[];
  expectedDurationMs: number;
  safetyCopy: string;
  sourceDebt: TranslationDebtType;
  sourceReceiptId?: string;
  createdAt: string;
}

export interface CuePatchResult {
  promptId: string;
  completedAt: string;
  beforeReceiptId?: string;
  afterReceiptId?: string;
  improvedChannels: string[];
  stillMissingChannels: string[];
  nextRecommendedAction: string;
}

export interface CuePatchComparisonSnapshot {
  visibilityScore: number;
  motionEnergy: number;
  mouthStability: number;
  strongestChannel: string;
}

export interface CuePatchComparison {
  before: CuePatchComparisonSnapshot;
  after: CuePatchComparisonSnapshot;
}

export interface CuePatchMetadata {
  prompt?: CuePatchPrompt | null;
  result?: CuePatchResult | null;
  comparison?: CuePatchComparison | null;
}

export function cuePatchKindLabel(kind: CuePatchKind) {
  switch (kind) {
    case "mouth-visible-repeat":
      return "mouth cue patch";
    case "hand-occlusion-repeat":
      return "hand occlusion patch";
    case "final-handshape-hold":
      return "final handshape hold";
    case "slow-full-repeat":
      return "slow full repeat";
    case "face-cue-visible-repeat":
      return "face cue patch";
    case "body-frame-repeat":
      return "body frame patch";
    case "choose-from-candidates":
      return "choose from candidates";
    case "teach-personal-sign":
      return "teach as personal sign";
    default:
      return "cue patch";
  }
}
