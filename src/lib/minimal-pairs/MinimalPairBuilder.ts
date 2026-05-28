import { clamp01, euclideanDistance, mean } from "@/lib/features/normalize";
import {
  featureSummaryFromCandidate,
  strongestDifferenceLabel,
} from "@/lib/features/ChannelDeltaAnalyzer";
import type {
  ChannelDelta,
  ContrastiveChannel,
  FeatureSummary,
} from "@/lib/recognition/ContrastiveMemory";
import type { CandidatePrototype } from "@/lib/recognition/types";
import {
  minimalPairCardId,
  slotToContrastiveChannel,
  type ChannelContrast,
  type MinimalPairCard,
  type MinimalPairExample,
  type MinimalPairRepairHint,
  type SignFormContrast,
  type SignFormSlotDifference,
} from "@/lib/minimal-pairs/MinimalPair";
import type { CuePatchKind } from "@/lib/repair/CuePatch";
import {
  SIGN_FORM_SLOT_ORDER,
  signFormSlotTitle,
  type SignFormSlotName,
} from "@/lib/signform/SignFormLedger";

export interface MinimalPairBuilderInput {
  candidateA: CandidatePrototype;
  candidateB: CandidatePrototype;
  examplesA: MinimalPairExample[];
  examplesB: MinimalPairExample[];
  userNotes?: string;
}

function nowIso() {
  return new Date().toISOString();
}

function round(value: number) {
  return Number(value.toFixed(4));
}

function averageNumberArrays(items: number[][]) {
  const width = Math.max(...items.map((item) => item.length), 0);

  if (width === 0) {
    return [];
  }

  return Array.from({ length: width }, (_, index) =>
    mean(items.map((item) => item[index] ?? 0)),
  );
}

function averageFeatureSummary(examples: MinimalPairExample[]) {
  const fromExamples = {
    handShape: averageNumberArrays(
      examples.map((example) => example.encodedFeatureSummary.handShape),
    ),
    handMotion: averageNumberArrays(
      examples.map((example) => example.encodedFeatureSummary.handMotion),
    ),
    mouthCue: averageNumberArrays(
      examples.map((example) => example.encodedFeatureSummary.mouthCue),
    ),
    facialCue: averageNumberArrays(
      examples.map((example) => example.encodedFeatureSummary.facialCue),
    ),
    pose: averageNumberArrays(
      examples.map((example) => example.encodedFeatureSummary.pose),
    ),
    timing: averageNumberArrays(
      examples.map((example) => example.encodedFeatureSummary.timing),
    ),
    visibility: averageNumberArrays(
      examples.map((example) => example.encodedFeatureSummary.visibility),
    ),
  } satisfies FeatureSummary;

  return fromExamples;
}

function normalizedDistance(left: number[], right: number[]) {
  const width = Math.max(left.length, right.length, 1);
  return euclideanDistance(left, right) / Math.sqrt(width);
}

function representativeSlot(
  examples: MinimalPairExample[],
  slot: SignFormSlotName,
) {
  const slots = examples.map((example) => example.signFormLedger.slots[slot]);
  const labelCounts = new Map<string, number>();

  for (const entry of slots) {
    labelCounts.set(entry.valueLabel, (labelCounts.get(entry.valueLabel) ?? 0) + 1);
  }

  const valueLabel =
    [...labelCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ??
    "unknown";
  const evidenceScore = mean(slots.map((entry) => entry.evidenceScore));
  const weak = slots.some((entry) => entry.status === "weak" || entry.status === "missing");

  return {
    valueLabel,
    evidenceScore,
    weak,
  };
}

function buildSignFormContrast(
  input: MinimalPairBuilderInput,
): SignFormContrast {
  const differingSlots: SignFormSlotDifference[] = [];
  const similarSlots: SignFormSlotName[] = [];

  for (const slot of SIGN_FORM_SLOT_ORDER) {
    const left = representativeSlot(input.examplesA, slot);
    const right = representativeSlot(input.examplesB, slot);

    if (left.valueLabel === right.valueLabel) {
      similarSlots.push(slot);
      continue;
    }

    const scoreGap = clamp01(
      Math.abs(left.evidenceScore - right.evidenceScore) +
        (left.weak || right.weak ? 0.12 : 0.28),
    );

    differingSlots.push({
      slot,
      candidateAValue: left.valueLabel,
      candidateBValue: right.valueLabel,
      scoreGap: round(scoreGap),
      explanation: `${signFormSlotTitle(slot)} differed most between local examples.`,
    });
  }

  differingSlots.sort((left, right) => right.scoreGap - left.scoreGap);
  const strongest = differingSlots[0] ?? null;
  const strongestText = strongest ? signFormSlotTitle(strongest.slot).toLowerCase() : "no single slot";
  const secondary = differingSlots[1]
    ? signFormSlotTitle(differingSlots[1].slot).toLowerCase()
    : "other cues";

  return {
    differingSlots,
    similarSlots,
    strongestSlotDifference: strongest,
    explanation: `These two local candidates look similar in some cues, but differ most in coarse ${strongestText} and ${secondary}.`,
  };
}

function channelExplanation(
  channel: ContrastiveChannel,
  labelA: string,
  labelB: string,
) {
  switch (channel) {
    case "handShape":
      return `Coarse handshape separated ${labelA} and ${labelB} most in local review.`;
    case "handMotion":
      return `Hand motion timing and path separated ${labelA} and ${labelB} most in local review.`;
    case "mouthCue":
      return `Mouth cue looked most different across these local examples.`;
    case "facialCue":
      return `Non-manual face cue looked most different across these local examples.`;
    case "pose":
      return `Body-zone or orientation cues separated this local pair most.`;
    case "timing":
      return `Timing or hold separated this local pair most.`;
    case "visibility":
    default:
      return `Visibility changed how this local pair compared.`;
  }
}

function buildChannelContrast(
  input: MinimalPairBuilderInput,
): ChannelContrast {
  const exampleSummaryA = averageFeatureSummary(input.examplesA);
  const exampleSummaryB = averageFeatureSummary(input.examplesB);
  const prototypeSummaryA = featureSummaryFromCandidate(input.candidateA);
  const prototypeSummaryB = featureSummaryFromCandidate(input.candidateB);
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
      const exampleDistance = normalizedDistance(
        exampleSummaryA[channel],
        exampleSummaryB[channel],
      );
      const prototypeDistance = normalizedDistance(
        prototypeSummaryA[channel],
        prototypeSummaryB[channel],
      );
      const deltaScore = round(clamp01(Math.max(exampleDistance, prototypeDistance) / 1.2));

      return {
        channel,
        deltaScore,
        directionLabel: `${strongestDifferenceLabel({ channel, deltaScore, directionLabel: "", explanation: "" } as ChannelDelta)} often separates ${input.candidateA.label} and ${input.candidateB.label}.`,
        explanation: channelExplanation(channel, input.candidateA.label, input.candidateB.label),
      } satisfies ChannelDelta;
    })
    .sort((left, right) => right.deltaScore - left.deltaScore);

  return {
    channelDeltas,
    strongestChannel: channelDeltas[0] ?? null,
    explanation:
      channelDeltas[0]?.explanation ??
      "No single feature channel stood out across these local examples.",
  };
}

function hintFromCuePatchKind(kind: CuePatchKind, pairLabel: string): string {
  switch (kind) {
    case "final-handshape-hold":
      return `Repeat ${pairLabel} slowly and hold ending handshape for one second.`;
    case "body-frame-repeat":
      return `Repeat ${pairLabel} with upper body fully in frame.`;
    case "mouth-visible-repeat":
      return `Repeat ${pairLabel} with your mouth visible.`;
    case "slow-full-repeat":
      return `Repeat ${pairLabel} slowly through full motion once.`;
    case "hand-occlusion-repeat":
      return `Repeat ${pairLabel} with both hands fully visible.`;
    case "face-cue-visible-repeat":
      return `Repeat ${pairLabel} with face cue clearly visible.`;
    case "choose-from-candidates":
      return `Choose from local candidates instead of forcing a guess.`;
    case "teach-personal-sign":
      return `Teach this pair as personal or dialect contrast if local cues stay unresolved.`;
    default:
      return `Repeat ${pairLabel} with clearer local evidence.`;
  }
}

function buildRepairHints(
  input: MinimalPairBuilderInput,
  signFormContrast: SignFormContrast,
  channelContrast: ChannelContrast,
) {
  const hints: MinimalPairRepairHint[] = [];
  const pushHint = (cuePatchKind: CuePatchKind, why: string) => {
    if (hints.some((hint) => hint.cuePatchKind === cuePatchKind)) {
      return;
    }

    hints.push({
      cuePatchKind,
      text: hintFromCuePatchKind(
        cuePatchKind,
        `${input.candidateA.label} / ${input.candidateB.label}`,
      ),
      why,
    });
  };
  const strongestSlot = signFormContrast.strongestSlotDifference?.slot ?? null;
  const mappedSlotChannel = slotToContrastiveChannel(strongestSlot);
  const strongestChannel = channelContrast.strongestChannel?.channel ?? mappedSlotChannel;
  const weakVisibility = [...input.examplesA, ...input.examplesB].some(
    (example) =>
      example.qualitySummary.occlusionRatio > 0.3 ||
      example.qualitySummary.handVisibleRatio < 0.7 ||
      example.qualitySummary.faceVisibleRatio < 0.45,
  );

  if (weakVisibility) {
    pushHint(
      "hand-occlusion-repeat",
      "Local review saw weak visibility or occlusion in one or more examples.",
    );
  }

  switch (strongestSlot) {
    case "handshape":
      pushHint(
        "final-handshape-hold",
        "Local minimal-pair review says coarse handshape differs most.",
      );
      break;
    case "location":
    case "palmOrientation":
      pushHint(
        "body-frame-repeat",
        "Local minimal-pair review says signing-space location or orientation differs most.",
      );
      break;
    case "mouthCue":
      pushHint(
        "mouth-visible-repeat",
        "Local minimal-pair review says mouth cue differs most.",
      );
      break;
    case "movement":
    case "timing":
      pushHint(
        "slow-full-repeat",
        "Local minimal-pair review says movement or timing differs most.",
      );
      break;
    case "facialCue":
      pushHint(
        "face-cue-visible-repeat",
        "Local minimal-pair review says non-manual face cue differs most.",
      );
      break;
    default:
      break;
  }

  switch (strongestChannel) {
    case "handShape":
      pushHint(
        "final-handshape-hold",
        "Strongest channel contrast was hand shape.",
      );
      break;
    case "pose":
      pushHint(
        "body-frame-repeat",
        "Strongest channel contrast was body position or location.",
      );
      break;
    case "mouthCue":
      pushHint(
        "mouth-visible-repeat",
        "Strongest channel contrast was mouth cue.",
      );
      break;
    case "handMotion":
    case "timing":
      pushHint(
        "slow-full-repeat",
        "Strongest channel contrast was motion or timing.",
      );
      break;
    case "facialCue":
      pushHint(
        "face-cue-visible-repeat",
        "Strongest channel contrast was facial cue.",
      );
      break;
    case "visibility":
      pushHint(
        "hand-occlusion-repeat",
        "Strongest channel contrast was visibility.",
      );
      break;
    default:
      break;
  }

  if (!hints.length) {
    pushHint(
      "choose-from-candidates",
      "Local review did not isolate one clear cue. Keep repair constrained.",
    );
  }

  return hints.slice(0, 3);
}

export class MinimalPairBuilder {
  build(input: MinimalPairBuilderInput): MinimalPairCard {
    const signFormContrast = buildSignFormContrast(input);
    const channelContrast = buildChannelContrast(input);
    const repairHints = buildRepairHints(input, signFormContrast, channelContrast);
    const timestamp = nowIso();

    return {
      id: minimalPairCardId(
        {
          candidateId: input.candidateA.id,
          label: input.candidateA.label,
        },
        {
          candidateId: input.candidateB.id,
          label: input.candidateB.label,
        },
      ),
      createdAt: timestamp,
      updatedAt: timestamp,
      candidateA: {
        candidateId: input.candidateA.id,
        label: input.candidateA.label,
        source: input.candidateA.source === "demo" ? "demo" : "personal",
      },
      candidateB: {
        candidateId: input.candidateB.id,
        label: input.candidateB.label,
        source: input.candidateB.source === "demo" ? "demo" : "personal",
      },
      examplesA: input.examplesA,
      examplesB: input.examplesB,
      signFormContrast,
      channelContrast,
      repairHints,
      usageStats: {
        buildCount: 1,
        appliedCount: 0,
        lastAppliedAt: null,
      },
      privacy: {
        landmarkOnly: true,
        rawVideoStored: false,
        pixelDataStored: false,
      },
      userNotes: input.userNotes?.trim() ?? "",
    };
  }
}

export const minimalPairBuilder = new MinimalPairBuilder();
