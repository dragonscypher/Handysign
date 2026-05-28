import type {
  CandidateMatch,
  RecognitionResult,
  SequenceQuality,
  TranslationDebtType,
} from "@/lib/recognition/types";

export type RepairAction =
  | "accept"
  | "repeat-slower"
  | "show-mouth-cue"
  | "fingerspell"
  | "choose-top-candidate"
  | "teach-personal-sign"
  | "reposition";

export interface UncertaintyDecision {
  mode: "accept" | "repair";
  debtType: TranslationDebtType;
  debtLabel: string;
  message: string;
  explanation: string;
  confidence: number;
  margin: number;
  primaryCandidate: CandidateMatch | null;
  alternatives: CandidateMatch[];
  recommendedActions: RepairAction[];
  acceptedText: string | null;
}

export class UncertaintyEngine {
  private unknownStreak = 0;

  evaluate(
    recognition: RecognitionResult,
    quality: SequenceQuality,
  ): UncertaintyDecision {
    const top1 = recognition.top1;
    const top2 = recognition.top2;
    const confidence = top1?.confidence ?? 0;
    const margin = confidence - (top2?.confidence ?? 0);
    const safetyConfidence = top1?.baseConfidence ?? confidence;
    const safetyMargin =
      safetyConfidence - (top2?.baseConfidence ?? top2?.confidence ?? 0);

    if (safetyConfidence < 0.55) {
      this.unknownStreak += 1;
    } else {
      this.unknownStreak = 0;
    }

    if (quality.occlusionRatio > 0.35) {
      return this.repair(
        "hand-occlusion",
        "Debt: hand occlusion",
        "I'm not sure. Hands or face dropped out of frame too often.",
        "Reposition so both signing hand and mouth stay visible for at least a second.",
        top1,
        recognition.topK.slice(0, 3),
        confidence,
        margin,
        ["reposition", "repeat-slower"],
      );
    }

    if (quality.handVisibleRatio < 0.65 || quality.faceVisibleRatio < 0.35) {
      return this.repair(
        "hand-occlusion",
        "Debt: hand occlusion",
        "I'm not sure. Required landmarks are missing or unstable.",
        "Keep both signing hand and mouth in frame before trusting candidate output.",
        top1,
        recognition.topK.slice(0, 3),
        confidence,
        margin,
        ["reposition", "repeat-slower"],
      );
    }

    if (top1?.metadata.needsMouthCue && quality.handVisibleRatio > 0.6 && quality.mouthStability < 0.45) {
      return this.repair(
        "mouth-cue-missing",
        "Debt: mouth cue missing",
        "I'm not sure. Hand shape looks usable, but mouth signal is weak or unstable.",
        "Show mouth movement clearly for this prototype, then repeat once.",
        top1,
        recognition.topK.slice(0, 3),
        confidence,
        margin,
        ["show-mouth-cue", "repeat-slower"],
      );
    }

    if (quality.validFrameCount < 24 || quality.motionEnergy < 0.08) {
      return this.repair(
        "motion-too-short",
        "Debt: motion too short",
        "I'm not sure. Not enough motion history for reliable known-candidate matching.",
        "Repeat slower and hold the sign inside frame for another beat.",
        top1,
        recognition.topK.slice(0, 3),
        confidence,
        margin,
        ["repeat-slower"],
      );
    }

    if (this.unknownStreak >= 2) {
      return this.repair(
        "dialect-custom-sign-unknown",
        "Debt: dialect/custom sign unknown",
        "I'm not sure. No stored candidate cleared confidence floor twice in a row.",
        "Use Fingerspell or Teach Mode so future guesses stay constrained to your local sign set.",
        top1,
        recognition.topK.slice(0, 3),
        confidence,
        margin,
        ["fingerspell", "teach-personal-sign"],
      );
    }

    if (safetyConfidence >= 0.55 && safetyMargin < 0.12) {
      return this.repair(
        "ambiguous",
        "Debt: competing candidates",
        "I'm not sure. Top known candidates are too close to trust one answer.",
        "Choose from the top matches or repeat with clearer motion.",
        top1,
        recognition.topK.slice(0, 3),
        confidence,
        margin,
        ["choose-top-candidate", "repeat-slower"],
      );
    }

    if (safetyConfidence >= 0.78 && safetyMargin >= 0.18) {
      return {
        mode: "accept",
        debtType: "clean",
        debtLabel: "Clean",
        message: "Known-candidate match accepted.",
        explanation:
          "Confidence floor and top-1 margin both passed. SignRepair can show this tentative known-candidate label.",
        confidence,
        margin,
        primaryCandidate: top1,
        alternatives: recognition.topK.slice(1, 3),
        recommendedActions: ["accept"],
        acceptedText: top1?.label ?? null,
      };
    }

    return this.repair(
      "ambiguous",
      "Debt: competing candidates",
      "I'm not sure. Confidence is moderate but not clean enough to accept.",
      "Choose from top candidates or repeat with slower motion.",
      top1,
      recognition.topK.slice(0, 3),
      confidence,
      margin,
      ["choose-top-candidate", "repeat-slower"],
    );
  }

  private repair(
    debtType: TranslationDebtType,
    debtLabel: string,
    message: string,
    explanation: string,
    primaryCandidate: CandidateMatch | null,
    alternatives: CandidateMatch[],
    confidence: number,
    margin: number,
    recommendedActions: RepairAction[],
  ): UncertaintyDecision {
    return {
      mode: "repair",
      debtType,
      debtLabel,
      message,
      explanation,
      confidence,
      margin,
      primaryCandidate,
      alternatives,
      recommendedActions,
      acceptedText: null,
    };
  }
}

export const uncertaintyEngine = new UncertaintyEngine();
