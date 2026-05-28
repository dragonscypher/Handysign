import type {
  ChannelDelta,
  ContrastiveChannel,
} from "@/lib/recognition/ContrastiveMemory";
import type { CandidateMatch } from "@/lib/recognition/types";
import type { MotionReceipt, ReceiptChannelSummary } from "@/lib/receipts/MotionReceipt";
import { receiptChannelLabel, strongestReceiptChannelLabel } from "@/lib/receipts/MotionReceipt";
import type { UncertaintyDecision } from "@/lib/uncertainty/UncertaintyEngine";
import type { MinimalPairCard } from "@/lib/minimal-pairs/MinimalPair";
import { signFormSlotTitle } from "@/lib/signform/SignFormLedger";
import type { SignFormSlotName } from "@/lib/signform/SignFormLedger";
import type {
  CuePatchComparison,
  CuePatchKind,
  CuePatchPrompt,
  CuePatchResult,
} from "@/lib/repair/CuePatch";

export interface CuePatchPlannerInput {
  decision: UncertaintyDecision;
  translationDebt: MotionReceipt["translationDebt"];
  motionReceipt: MotionReceipt;
  channelSummary: ReceiptChannelSummary;
  topCandidates: CandidateMatch[];
  confusionTwinDeltas?: ChannelDelta[] | null;
  minimalPairCard?: MinimalPairCard | null;
}

export interface CuePatchCompletion {
  result: CuePatchResult;
  comparison: CuePatchComparison;
  status: string;
}

function nowIso() {
  return new Date().toISOString();
}

function createPrompt(
  kind: CuePatchKind,
  input: CuePatchPlannerInput,
  overrides: Pick<CuePatchPrompt, "title" | "instruction" | "why" | "targetChannels" | "expectedDurationMs">,
): CuePatchPrompt {
  return {
    id: `${kind}-${input.motionReceipt.id}`,
    kind,
    title: overrides.title,
    instruction: overrides.instruction,
    why: overrides.why,
    targetChannels: overrides.targetChannels,
    expectedDurationMs: overrides.expectedDurationMs,
    safetyCopy:
      "Still tentative. Cue Patch Mode asks for better evidence, not proof of meaning.",
    sourceDebt: input.translationDebt.type,
    sourceReceiptId: input.motionReceipt.id,
    createdAt: nowIso(),
  };
}

function hasMissingChannel(
  channelSummary: ReceiptChannelSummary,
  value: "visibility" | "facial cue" | "mouth cue" | "timing" | "pose",
) {
  return channelSummary.missingChannels.includes(value);
}

function hasWeakOrMissingSlot(receipt: MotionReceipt, slot: SignFormSlotName) {
  const value = receipt.signFormLedger?.slots[slot];
  return value?.status === "weak" || value?.status === "missing";
}

function finalFrameNeedsHold(receipt: MotionReceipt) {
  const finalFrame = receipt.replayFrames.at(-1);
  const previousFrame = receipt.replayFrames.at(-2);

  if (!finalFrame) {
    return false;
  }

  const finalHandPoints = finalFrame.hands.reduce(
    (count, hand) => count + hand.points.length,
    0,
  );
  const previousHandPoints = previousFrame?.hands.reduce(
    (count, hand) => count + hand.points.length,
    0,
  ) ?? finalHandPoints;

  return (
    !finalFrame.quality.handVisible ||
    finalHandPoints < 6 ||
    Math.abs(previousHandPoints - finalHandPoints) >= 6
  );
}

function shouldSuggestFacePatch(input: CuePatchPlannerInput) {
  const strongestDelta = input.confusionTwinDeltas?.[0]?.channel;
  const topCandidate = input.topCandidates[0];

  return (
    topCandidate?.metadata.needsFaceCue === true ||
    topCandidate?.metadata.expectedFormHints?.needsFacialCue === true ||
    strongestDelta === "facialCue" ||
    hasMissingChannel(input.channelSummary, "facial cue") ||
    hasWeakOrMissingSlot(input.motionReceipt, "facialCue")
  );
}

function promptOrder(kind: CuePatchKind) {
  switch (kind) {
    case "hand-occlusion-repeat":
      return 1;
    case "mouth-visible-repeat":
      return 2;
    case "face-cue-visible-repeat":
      return 3;
    case "final-handshape-hold":
      return 4;
    case "body-frame-repeat":
      return 5;
    case "choose-from-candidates":
      return 6;
    case "teach-personal-sign":
      return 7;
    case "slow-full-repeat":
    default:
      return 8;
  }
}

function cueSummaryLabel(channel: ContrastiveChannel) {
  return receiptChannelLabel(channel);
}

function cuePatchTemplate(kind: CuePatchKind) {
  switch (kind) {
    case "hand-occlusion-repeat":
      return {
        title: "Hand occlusion patch",
        instruction: "Move both hands fully inside frame and repeat.",
        targetChannels: ["visibility", "handShape", "handMotion"] satisfies ContrastiveChannel[],
        expectedDurationMs: 1400,
      };
    case "mouth-visible-repeat":
      return {
        title: "Mouth cue patch",
        instruction: "Repeat once with your mouth visible.",
        targetChannels: ["mouthCue", "visibility"] satisfies ContrastiveChannel[],
        expectedDurationMs: 1400,
      };
    case "face-cue-visible-repeat":
      return {
        title: "Face cue patch",
        instruction: "Keep your face visible and repeat once.",
        targetChannels: ["facialCue", "visibility"] satisfies ContrastiveChannel[],
        expectedDurationMs: 1400,
      };
    case "final-handshape-hold":
      return {
        title: "Final handshape hold",
        instruction: "Repeat slowly and hold ending handshape for one second.",
        targetChannels: ["handShape", "timing", "visibility"] satisfies ContrastiveChannel[],
        expectedDurationMs: 1800,
      };
    case "body-frame-repeat":
      return {
        title: "Body frame patch",
        instruction: "Step back slightly so upper body stays in frame, then repeat.",
        targetChannels: ["pose", "visibility"] satisfies ContrastiveChannel[],
        expectedDurationMs: 1500,
      };
    case "choose-from-candidates":
      return {
        title: "Choose from top candidates",
        instruction: "Pick from top candidates instead of repeating whole sign.",
        targetChannels: ["handShape", "handMotion", "mouthCue", "facialCue"] satisfies ContrastiveChannel[],
        expectedDurationMs: 0,
      };
    case "teach-personal-sign":
      return {
        title: "Teach as personal sign",
        instruction:
          "Pick from top candidates, or teach this as personal sign if none fit.",
        targetChannels: [] satisfies ContrastiveChannel[],
        expectedDurationMs: 0,
      };
    case "slow-full-repeat":
    default:
      return {
        title: "Slow full repeat",
        instruction: "Repeat slowly through full sign once.",
        targetChannels: ["handMotion", "timing", "visibility"] satisfies ContrastiveChannel[],
        expectedDurationMs: 1800,
      };
  }
}

function minimalPairWhy(card: MinimalPairCard, hintWhy: string) {
  const strongestSlot = card.signFormContrast.strongestSlotDifference
    ? signFormSlotTitle(card.signFormContrast.strongestSlotDifference.slot).toLowerCase()
    : null;
  const strongestChannel = card.channelContrast.strongestChannel
    ? receiptChannelLabel(card.channelContrast.strongestChannel.channel).toLowerCase()
    : null;
  const parts = [strongestSlot, strongestChannel].filter(Boolean);
  const evidence =
    parts.length > 1
      ? `${parts[0]} and ${parts[1]}`
      : parts[0] ?? "coarse local evidence";

  return `Local minimal-pair card says this pair is usually separated by ${evidence}. ${hintWhy}`;
}

function uniquePrompts(prompts: CuePatchPrompt[]) {
  const map = new Map<CuePatchKind, CuePatchPrompt>();

  for (const prompt of prompts) {
    if (!map.has(prompt.kind)) {
      map.set(prompt.kind, prompt);
    }
  }

  return Array.from(map.values()).sort(
    (left, right) => {
      const leftPriority = left.id.startsWith("minimal-pair-") ? 0 : 1;
      const rightPriority = right.id.startsWith("minimal-pair-") ? 0 : 1;

      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      return promptOrder(left.kind) - promptOrder(right.kind);
    },
  );
}

function comparisonSnapshot(receipt: MotionReceipt) {
  return {
    visibilityScore: receipt.channelSummary.visibilityScore,
    motionEnergy: receipt.channelSummary.motionEnergy,
    mouthStability: receipt.channelSummary.mouthStability,
    strongestChannel: strongestReceiptChannelLabel(receipt),
  };
}

function improvedFromTarget(
  target: ContrastiveChannel,
  before: MotionReceipt,
  after: MotionReceipt,
) {
  switch (target) {
    case "mouthCue":
      return after.channelSummary.mouthStability > before.channelSummary.mouthStability + 0.05;
    case "handMotion":
    case "timing":
      return after.channelSummary.motionEnergy > before.channelSummary.motionEnergy + 0.05;
    case "facialCue":
    case "pose":
    case "visibility":
    case "handShape":
    default:
      return after.channelSummary.visibilityScore > before.channelSummary.visibilityScore + 0.05;
  }
}

function missingDelta(before: MotionReceipt, after: MotionReceipt) {
  return before.channelSummary.missingChannels.filter(
    (channel) => !after.channelSummary.missingChannels.includes(channel),
  );
}

export function completeCuePatchCapture(
  prompt: CuePatchPrompt,
  beforeReceipt: MotionReceipt,
  afterReceipt: MotionReceipt,
  decision: UncertaintyDecision,
): CuePatchCompletion {
  const improvedChannels = Array.from(
    new Set([
      ...prompt.targetChannels
        .filter((channel) => improvedFromTarget(channel, beforeReceipt, afterReceipt))
        .map(cueSummaryLabel),
      ...missingDelta(beforeReceipt, afterReceipt),
    ]),
  );
  const stillMissingChannels = afterReceipt.channelSummary.missingChannels.slice();
  const nextRecommendedAction =
    decision.mode === "accept"
      ? "updated-window-passed-thresholds"
      : decision.recommendedActions[0] ?? "slow-full-repeat";
  const result: CuePatchResult = {
    promptId: prompt.id,
    completedAt: nowIso(),
    beforeReceiptId: beforeReceipt.id,
    afterReceiptId: afterReceipt.id,
    improvedChannels,
    stillMissingChannels,
    nextRecommendedAction,
  };
  const comparison: CuePatchComparison = {
    before: comparisonSnapshot(beforeReceipt),
    after: comparisonSnapshot(afterReceipt),
  };
  const status =
    improvedChannels.length > 0
      ? `Cue patch improved ${improvedChannels.join(", ")}. Standard thresholds still decide whether output stays tentative.`
      : `Cue patch completed, but missing cues remain: ${stillMissingChannels.join(", ") || "none singled out"}.`;

  return { result, comparison, status };
}

export class CuePatchPlanner {
  plan(input: CuePatchPlannerInput) {
    const prompts: CuePatchPrompt[] = [];
    const visibilityUsable =
      input.channelSummary.visibilityScore >= 0.72 &&
      !hasMissingChannel(input.channelSummary, "visibility");
    const lowMotion =
      input.channelSummary.motionEnergy < 0.08 ||
      hasMissingChannel(input.channelSummary, "timing") ||
      input.motionReceipt.replayFrames.length < 24;
    const topCandidate = input.topCandidates[0];

    if (input.minimalPairCard?.repairHints.length) {
      for (const hint of input.minimalPairCard.repairHints) {
        const template = cuePatchTemplate(hint.cuePatchKind);

        prompts.push(
          {
            ...createPrompt(hint.cuePatchKind, input, {
              ...template,
              instruction: hint.text || template.instruction,
              why: minimalPairWhy(input.minimalPairCard, hint.why),
            }),
            id: `minimal-pair-${hint.cuePatchKind}-${input.motionReceipt.id}`,
          },
        );
      }
    }

    if (
      input.translationDebt.type === "hand-occlusion" ||
      hasMissingChannel(input.channelSummary, "visibility") ||
      hasWeakOrMissingSlot(input.motionReceipt, "visibility")
    ) {
      prompts.push(
        createPrompt("hand-occlusion-repeat", input, {
          title: "Hand occlusion patch",
          instruction: "Move both hands fully inside frame and repeat.",
          why: "Last window had hand occlusion or missing hand landmarks.",
          targetChannels: ["visibility", "handShape", "handMotion"],
          expectedDurationMs: 1400,
        }),
      );
    }

    if (
      !input.motionReceipt.replayFrames.at(-1)?.quality.poseVisible ||
      hasMissingChannel(input.channelSummary, "pose") ||
      input.motionReceipt.signFormLedger?.slots.location.valueLabel === "low/out of frame"
    ) {
      prompts.push(
        createPrompt("body-frame-repeat", input, {
          title: "Body frame patch",
          instruction: "Step back slightly so upper body stays in frame, then repeat.",
          why: "Body frame or pose landmarks were missing in last window.",
          targetChannels: ["pose", "visibility"],
          expectedDurationMs: 1500,
        }),
      );
    }

    if (
      input.translationDebt.type === "mouth-cue-missing" ||
      hasMissingChannel(input.channelSummary, "mouth cue") ||
      hasWeakOrMissingSlot(input.motionReceipt, "mouthCue")
    ) {
      prompts.push(
        createPrompt("mouth-visible-repeat", input, {
          title: "Mouth cue patch",
          instruction: "Repeat once with your mouth visible.",
          why: "I saw hand motion, but mouth cue was missing or unstable.",
          targetChannels: ["mouthCue", "visibility"],
          expectedDurationMs: 1400,
        }),
      );
    }

    if (shouldSuggestFacePatch(input)) {
      prompts.push(
        createPrompt("face-cue-visible-repeat", input, {
          title: "Face cue patch",
          instruction: "Keep your face visible and repeat once.",
          why: topCandidate?.metadata.needsFaceCue
            ? "This candidate may need non-manual cue visibility."
            : "Face cue was weak; non-manual features may separate this near miss.",
          targetChannels: ["facialCue", "visibility"],
          expectedDurationMs: 1400,
        }),
      );
    }

    if (finalFrameNeedsHold(input.motionReceipt)) {
      prompts.push(
        createPrompt("final-handshape-hold", input, {
          title: "Final handshape hold",
          instruction: "Repeat slowly and hold ending handshape for one second.",
          why: "Ending frame was unstable or missing dominant hand landmarks.",
          targetChannels: ["handShape", "timing", "visibility"],
          expectedDurationMs: 1800,
        }),
      );
    }

    if (input.translationDebt.type === "dialect-custom-sign-unknown") {
      prompts.push(
        createPrompt("teach-personal-sign", input, {
          title: "Teach as personal sign",
          instruction:
            "Pick from top candidates, or teach this as personal sign if none fit.",
          why: "I do not have enough evidence for a safe known-candidate guess.",
          targetChannels: [],
          expectedDurationMs: 0,
        }),
      );
    }

    if (input.translationDebt.type === "ambiguous" && visibilityUsable) {
      prompts.push(
        createPrompt("choose-from-candidates", input, {
          title: "Choose from top candidates",
          instruction: "Pick from top candidates instead of repeating whole sign.",
          why: "Visibility is usable, but known candidates are still too close for a safe guess.",
          targetChannels: ["handShape", "handMotion", "mouthCue", "facialCue"],
          expectedDurationMs: 0,
        }),
      );
    }

    if (input.translationDebt.type === "motion-too-short" || lowMotion || !prompts.length) {
      prompts.push(
        createPrompt("slow-full-repeat", input, {
          title: "Slow full repeat",
          instruction: "Repeat slowly through full sign once.",
          why: "Motion window was too short or too static for stable decision.",
          targetChannels: ["handMotion", "timing", "visibility"],
          expectedDurationMs: 1800,
        }),
      );
    }

    if (
      input.motionReceipt.signFormLedger?.slots.timing.valueLabel === "too short" &&
      !prompts.some((prompt) => prompt.kind === "slow-full-repeat")
    ) {
      prompts.push(
        createPrompt("slow-full-repeat", input, {
          title: "Slow full repeat",
          instruction: "Repeat slowly through full sign once.",
          why: "Timing slot stayed too short for stable inspectable evidence.",
          targetChannels: ["handMotion", "timing", "visibility"],
          expectedDurationMs: 1800,
        }),
      );
    }

    return uniquePrompts(prompts);
  }
}

export const cuePatchPlanner = new CuePatchPlanner();
