import type {
  ChannelDelta,
  ContrastiveChannel,
  FeatureSummary,
} from "@/lib/recognition/ContrastiveMemory";
import type { CuePatchKind } from "@/lib/repair/CuePatch";
import type { SequenceQuality } from "@/lib/recognition/types";
import type {
  SignFormLedger,
  SignFormSlotName,
} from "@/lib/signform/SignFormLedger";

export interface MinimalPairCandidate {
  candidateId: string;
  label: string;
  source: "demo" | "personal";
}

export interface MinimalPairExample {
  id: string;
  capturedAt: string;
  receiptId?: string;
  encodedFeatureSummary: FeatureSummary;
  signFormLedger: SignFormLedger;
  qualitySummary: SequenceQuality;
}

export interface SignFormSlotDifference {
  slot: SignFormSlotName;
  candidateAValue: string;
  candidateBValue: string;
  scoreGap: number;
  explanation: string;
}

export interface SignFormContrast {
  differingSlots: SignFormSlotDifference[];
  similarSlots: SignFormSlotName[];
  strongestSlotDifference: SignFormSlotDifference | null;
  explanation: string;
}

export interface ChannelContrast {
  channelDeltas: ChannelDelta[];
  strongestChannel: ChannelDelta | null;
  explanation: string;
}

export interface MinimalPairRepairHint {
  cuePatchKind: CuePatchKind;
  text: string;
  why: string;
}

export interface MinimalPairUsageStats {
  buildCount: number;
  appliedCount: number;
  lastAppliedAt: string | null;
}

export interface MinimalPairPrivacy {
  landmarkOnly: true;
  rawVideoStored: false;
  pixelDataStored: false;
}

export interface MinimalPairCard {
  id: string;
  createdAt: string;
  updatedAt: string;
  candidateA: MinimalPairCandidate;
  candidateB: MinimalPairCandidate;
  examplesA: MinimalPairExample[];
  examplesB: MinimalPairExample[];
  signFormContrast: SignFormContrast;
  channelContrast: ChannelContrast;
  repairHints: MinimalPairRepairHint[];
  usageStats: MinimalPairUsageStats;
  privacy: MinimalPairPrivacy;
  userNotes: string;
}

export interface MinimalPairReceiptSummary {
  id: string;
  labelA: string;
  labelB: string;
  strongestSlotDifference: string;
  strongestChannel: string;
  repairHint: string;
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

export function minimalPairCardId(
  candidateA: Pick<MinimalPairCandidate, "candidateId" | "label">,
  candidateB: Pick<MinimalPairCandidate, "candidateId" | "label">,
) {
  const left = `${normalize(candidateA.candidateId || candidateA.label)}`;
  const right = `${normalize(candidateB.candidateId || candidateB.label)}`;
  const [first, second] = [left, right].sort();

  return `minimal-pair-${first}-vs-${second}`;
}

export function minimalPairMatchesCandidates(
  card: MinimalPairCard,
  first:
    | Pick<MinimalPairCandidate, "candidateId" | "label">
    | null
    | undefined,
  second:
    | Pick<MinimalPairCandidate, "candidateId" | "label">
    | null
    | undefined,
) {
  if (!first || !second) {
    return false;
  }

  const candidates = [card.candidateA, card.candidateB];

  return [first, second].every((candidate) =>
    candidates.some(
      (entry) =>
        entry.candidateId === candidate.candidateId ||
        entry.label.toLowerCase() === candidate.label.toLowerCase(),
    ),
  );
}

export function strongestMinimalPairChannel(card: MinimalPairCard) {
  return card.channelContrast.strongestChannel ?? null;
}

export function strongestMinimalPairSlot(card: MinimalPairCard) {
  return card.signFormContrast.strongestSlotDifference ?? null;
}

export function slotToContrastiveChannel(
  slot: SignFormSlotName | null | undefined,
): ContrastiveChannel | null {
  switch (slot) {
    case "handshape":
      return "handShape";
    case "movement":
      return "handMotion";
    case "timing":
      return "timing";
    case "mouthCue":
      return "mouthCue";
    case "facialCue":
      return "facialCue";
    case "location":
    case "palmOrientation":
      return "pose";
    case "visibility":
      return "visibility";
    default:
      return null;
  }
}

export function minimalPairReceiptSummary(card: MinimalPairCard): MinimalPairReceiptSummary {
  return {
    id: card.id,
    labelA: card.candidateA.label,
    labelB: card.candidateB.label,
    strongestSlotDifference:
      card.signFormContrast.strongestSlotDifference?.slot ?? "none singled out",
    strongestChannel:
      card.channelContrast.strongestChannel?.channel ?? "none singled out",
    repairHint:
      card.repairHints[0]?.cuePatchKind ?? "none singled out",
  };
}

export function mergeMinimalPairCard(
  existing: MinimalPairCard | null,
  incoming: MinimalPairCard,
) {
  if (!existing) {
    return incoming;
  }

  return {
    ...incoming,
    id: existing.id,
    createdAt: existing.createdAt,
    usageStats: {
      buildCount: existing.usageStats.buildCount + 1,
      appliedCount: existing.usageStats.appliedCount,
      lastAppliedAt: existing.usageStats.lastAppliedAt,
    },
    userNotes: incoming.userNotes || existing.userNotes,
  };
}
