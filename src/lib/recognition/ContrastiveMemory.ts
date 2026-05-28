export type ContrastiveMemorySource = "repair-confirmation" | "teach-mode";

export type ContrastiveChannel =
  | "handShape"
  | "handMotion"
  | "mouthCue"
  | "facialCue"
  | "pose"
  | "timing"
  | "visibility";

export interface FeatureSummary {
  handShape: number[];
  handMotion: number[];
  mouthCue: number[];
  facialCue: number[];
  pose: number[];
  timing: number[];
  visibility: number[];
}

export interface ChannelDelta {
  channel: ContrastiveChannel;
  deltaScore: number;
  directionLabel: string;
  explanation: string;
}

export interface ConfusionPair {
  id: string;
  intendedLabel: string;
  confusedLabel: string;
  intendedCandidateId?: string;
  confusedCandidateId?: string;
  receiptId?: string;
  positiveFeatureSummary: FeatureSummary;
  negativeFeatureSummary: FeatureSummary;
  channelDeltas: ChannelDelta[];
  source: ContrastiveMemorySource;
  createdAt: string;
  updatedAt: string;
  count: number;
}

function normalizeLabel(label: string) {
  return label.trim().toLowerCase().replace(/\s+/g, "-");
}

function mergeNumberArrays(
  current: number[],
  incoming: number[],
  currentWeight: number,
  incomingWeight: number,
) {
  const width = Math.max(current.length, incoming.length);
  const merged: number[] = [];

  for (let index = 0; index < width; index += 1) {
    const currentValue = current[index] ?? 0;
    const incomingValue = incoming[index] ?? 0;
    const totalWeight = currentWeight + incomingWeight;

    merged.push(
      totalWeight === 0
        ? 0
        : (currentValue * currentWeight + incomingValue * incomingWeight) / totalWeight,
    );
  }

  return merged;
}

export function confusionPairId(intendedLabel: string, confusedLabel: string) {
  return `confusion-${normalizeLabel(intendedLabel)}-vs-${normalizeLabel(confusedLabel)}`;
}

export function strongestChannelDelta(pair: ConfusionPair) {
  return [...pair.channelDeltas].sort(
    (left, right) => right.deltaScore - left.deltaScore,
  )[0] ?? null;
}

export function mergeFeatureSummary(
  current: FeatureSummary,
  incoming: FeatureSummary,
  currentWeight: number,
  incomingWeight: number,
): FeatureSummary {
  return {
    handShape: mergeNumberArrays(
      current.handShape,
      incoming.handShape,
      currentWeight,
      incomingWeight,
    ),
    handMotion: mergeNumberArrays(
      current.handMotion,
      incoming.handMotion,
      currentWeight,
      incomingWeight,
    ),
    mouthCue: mergeNumberArrays(
      current.mouthCue,
      incoming.mouthCue,
      currentWeight,
      incomingWeight,
    ),
    facialCue: mergeNumberArrays(
      current.facialCue,
      incoming.facialCue,
      currentWeight,
      incomingWeight,
    ),
    pose: mergeNumberArrays(current.pose, incoming.pose, currentWeight, incomingWeight),
    timing: mergeNumberArrays(
      current.timing,
      incoming.timing,
      currentWeight,
      incomingWeight,
    ),
    visibility: mergeNumberArrays(
      current.visibility,
      incoming.visibility,
      currentWeight,
      incomingWeight,
    ),
  };
}

export function mergeConfusionPair(
  existing: ConfusionPair | null,
  incoming: ConfusionPair,
) {
  if (!existing) {
    return incoming;
  }

  const nextCount = existing.count + incoming.count;

  return {
    ...incoming,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: incoming.updatedAt,
    receiptId: incoming.receiptId ?? existing.receiptId,
    count: nextCount,
    positiveFeatureSummary: mergeFeatureSummary(
      existing.positiveFeatureSummary,
      incoming.positiveFeatureSummary,
      existing.count,
      incoming.count,
    ),
    negativeFeatureSummary: mergeFeatureSummary(
      existing.negativeFeatureSummary,
      incoming.negativeFeatureSummary,
      existing.count,
      incoming.count,
    ),
    channelDeltas:
      incoming.channelDeltas.length >= existing.channelDeltas.length
        ? incoming.channelDeltas
        : existing.channelDeltas,
  };
}
