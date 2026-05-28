import { featureSummaryFromSequence, pairSupportForCurrentSequence } from "@/lib/features/ChannelDeltaAnalyzer";
import type {
  CandidateMatch,
  CandidatePrototype,
  EncodedSequence,
  RecognitionOptions,
  RecognitionResult,
} from "@/lib/recognition/types";
import type { ConfusionPair } from "@/lib/recognition/ContrastiveMemory";
import {
  slotToContrastiveChannel,
  type MinimalPairCard,
} from "@/lib/minimal-pairs/MinimalPair";
import { clamp01, euclideanDistance } from "@/lib/features/normalize";

const SOURCE_DISTANCE_DISCOUNT = {
  demo: 1,
  personal: 0.9,
  session: 0.94,
} as const;

const SOURCE_CONFIDENCE_BONUS = {
  demo: 0,
  personal: 0.05,
  session: 0.03,
} as const;

export class CandidateRecognizer {
  recognize(
    sequence: EncodedSequence,
    options: RecognitionOptions & {
      contrastivePairs?: ConfusionPair[];
      minimalPairCards?: MinimalPairCard[];
    } = {},
  ): RecognitionResult {
    const candidates = options.candidates ?? [];
    const topKCount = options.topK ?? 3;

    if (!candidates.length) {
      return {
        topK: [],
        top1: null,
        top2: null,
        candidateSetSize: 0,
        encoded: sequence,
        matchedAt: Date.now(),
      };
    }

    const baseRanked = candidates
      .map((candidate) => this.scoreCandidate(sequence, candidate))
      .sort((left, right) => {
        if (right.confidence !== left.confidence) {
          return right.confidence - left.confidence;
        }

        return left.distance - right.distance;
      });
    const ranked = this.applyContrastiveMemory(
      sequence,
      baseRanked,
      options.contrastivePairs ?? [],
    );
    const finalRanked = this.applyMinimalPairCards(
      sequence,
      ranked,
      options.minimalPairCards ?? [],
    );

    return {
      topK: finalRanked.slice(0, topKCount),
      top1: finalRanked[0] ?? null,
      top2: finalRanked[1] ?? null,
      candidateSetSize: candidates.length,
      encoded: sequence,
      matchedAt: Date.now(),
    };
  }

  private scoreCandidate(
    sequence: EncodedSequence,
    candidate: CandidatePrototype,
  ): CandidateMatch {
    const rawDistance = euclideanDistance(sequence.centroid, candidate.centroid);
    const normalizedDistance =
      rawDistance / Math.sqrt(Math.max(sequence.centroid.length, 1));
    const distance =
      normalizedDistance *
      SOURCE_DISTANCE_DISCOUNT[candidate.source] *
      (1 - Math.min(candidate.correctionBoost ?? 0, 0.2));
    const exampleBonus = Math.min(candidate.examplesCount, 5) * 0.01;
    const confidence = clamp01(
      Math.exp(-distance * 1.6) +
        SOURCE_CONFIDENCE_BONUS[candidate.source] +
        exampleBonus,
    );

    return {
      ...candidate,
      confidence,
      distance,
      baseConfidence: confidence,
      contrastiveAdjustment: 0,
      appliedConfusionPairs: [],
      minimalPairAdjustment: 0,
      appliedMinimalPairCards: [],
    };
  }

  private applyContrastiveMemory(
    sequence: EncodedSequence,
    ranked: CandidateMatch[],
    contrastivePairs: ConfusionPair[],
  ) {
    if (!ranked.length || !contrastivePairs.length) {
      return ranked;
    }

    const currentSummary = featureSummaryFromSequence(sequence);
    const topCandidates = ranked.slice(0, 3);
    const relevantPairs = contrastivePairs.filter((pair) => {
      const involved = topCandidates.filter(
        (candidate) =>
          candidate.id === pair.intendedCandidateId ||
          candidate.id === pair.confusedCandidateId ||
          candidate.label === pair.intendedLabel ||
          candidate.label === pair.confusedLabel,
      );

      return involved.length >= 2;
    });

    if (!relevantPairs.length) {
      return ranked;
    }

    const adjusted = ranked.map((candidate) => ({
      ...candidate,
      appliedConfusionPairs: [...(candidate.appliedConfusionPairs ?? [])],
    }));

    for (const pair of relevantPairs) {
      const support = pairSupportForCurrentSequence(currentSummary, pair);

      if (support <= 0.05) {
        continue;
      }

      const adjustment = Math.min(
        0.05,
        support * (0.015 + Math.min(pair.count, 4) * 0.0075),
      );

      for (const candidate of adjusted) {
        const isIntended =
          candidate.id === pair.intendedCandidateId ||
          candidate.label === pair.intendedLabel;
        const isConfused =
          candidate.id === pair.confusedCandidateId ||
          candidate.label === pair.confusedLabel;

        if (isIntended) {
          candidate.contrastiveAdjustment =
            (candidate.contrastiveAdjustment ?? 0) + adjustment;
          candidate.appliedConfusionPairs?.push(pair.id);
        } else if (isConfused) {
          candidate.contrastiveAdjustment =
            (candidate.contrastiveAdjustment ?? 0) - adjustment * 0.85;
          candidate.appliedConfusionPairs?.push(pair.id);
        }
      }
    }

    return adjusted
      .map((candidate) => ({
        ...candidate,
        confidence: clamp01(
          (candidate.baseConfidence ?? candidate.confidence) +
            (candidate.contrastiveAdjustment ?? 0),
        ),
      }))
      .sort((left, right) => {
        if (right.confidence !== left.confidence) {
          return right.confidence - left.confidence;
        }

        return left.distance - right.distance;
      });
  }

  private averageFeatureSummary(card: MinimalPairCard, side: "A" | "B") {
    const examples = side === "A" ? card.examplesA : card.examplesB;
    const average = (arrays: number[][]) => {
      const width = Math.max(...arrays.map((array) => array.length), 0);
      return Array.from({ length: width }, (_, index) =>
        arrays.length
          ? arrays.reduce((sum, array) => sum + (array[index] ?? 0), 0) / arrays.length
          : 0,
      );
    };

    return {
      handShape: average(examples.map((example) => example.encodedFeatureSummary.handShape)),
      handMotion: average(examples.map((example) => example.encodedFeatureSummary.handMotion)),
      mouthCue: average(examples.map((example) => example.encodedFeatureSummary.mouthCue)),
      facialCue: average(examples.map((example) => example.encodedFeatureSummary.facialCue)),
      pose: average(examples.map((example) => example.encodedFeatureSummary.pose)),
      timing: average(examples.map((example) => example.encodedFeatureSummary.timing)),
      visibility: average(examples.map((example) => example.encodedFeatureSummary.visibility)),
    };
  }

  private normalizedDistance(left: number[], right: number[]) {
    const width = Math.max(left.length, right.length, 1);
    return euclideanDistance(left, right) / Math.sqrt(width);
  }

  private minimalPairSupport(
    currentSummary: ReturnType<typeof featureSummaryFromSequence>,
    card: MinimalPairCard,
    side: "A" | "B",
  ) {
    const selfSummary = this.averageFeatureSummary(card, side);
    const otherSummary = this.averageFeatureSummary(card, side === "A" ? "B" : "A");
    const rankedChannels = [
      ...card.channelContrast.channelDeltas.slice(0, 2).map((delta) => delta.channel),
      slotToContrastiveChannel(card.signFormContrast.strongestSlotDifference?.slot),
    ].filter((value, index, items): value is keyof typeof currentSummary =>
      Boolean(value) && items.indexOf(value) === index,
    );

    if (!rankedChannels.length) {
      return 0;
    }

    const support = rankedChannels.map((channel) => {
      const selfDistance = this.normalizedDistance(currentSummary[channel], selfSummary[channel]);
      const otherDistance = this.normalizedDistance(currentSummary[channel], otherSummary[channel]);
      return otherDistance - selfDistance;
    });

    return support.reduce((sum, value) => sum + value, 0) / rankedChannels.length;
  }

  private applyMinimalPairCards(
    sequence: EncodedSequence,
    ranked: CandidateMatch[],
    minimalPairCards: MinimalPairCard[],
  ) {
    if (!ranked.length || !minimalPairCards.length) {
      return ranked;
    }

    const currentSummary = featureSummaryFromSequence(sequence);
    const topCandidates = ranked.slice(0, 3);
    const relevantCards = minimalPairCards.filter((card) => {
      const involved = topCandidates.filter(
        (candidate) =>
          candidate.id === card.candidateA.candidateId ||
          candidate.id === card.candidateB.candidateId ||
          candidate.label === card.candidateA.label ||
          candidate.label === card.candidateB.label,
      );

      return involved.length >= 2;
    });

    if (!relevantCards.length) {
      return ranked;
    }

    const adjusted = ranked.map((candidate) => ({
      ...candidate,
      appliedMinimalPairCards: [...(candidate.appliedMinimalPairCards ?? [])],
    }));

    for (const card of relevantCards) {
      const supportA = this.minimalPairSupport(currentSummary, card, "A");
      const supportB = this.minimalPairSupport(currentSummary, card, "B");
      const positiveA = Math.max(0, supportA);
      const positiveB = Math.max(0, supportB);

      if (positiveA <= 0.04 && positiveB <= 0.04) {
        continue;
      }

      const adjustmentA = Math.min(0.04, positiveA * 0.05);
      const adjustmentB = Math.min(0.04, positiveB * 0.05);

      for (const candidate of adjusted) {
        const isA =
          candidate.id === card.candidateA.candidateId ||
          candidate.label === card.candidateA.label;
        const isB =
          candidate.id === card.candidateB.candidateId ||
          candidate.label === card.candidateB.label;

        if (isA && adjustmentA > 0) {
          candidate.minimalPairAdjustment =
            (candidate.minimalPairAdjustment ?? 0) + adjustmentA;
          candidate.appliedMinimalPairCards?.push(card.id);
        } else if (isA && adjustmentB > 0) {
          candidate.minimalPairAdjustment =
            (candidate.minimalPairAdjustment ?? 0) - adjustmentB * 0.85;
          candidate.appliedMinimalPairCards?.push(card.id);
        } else if (isB && adjustmentB > 0) {
          candidate.minimalPairAdjustment =
            (candidate.minimalPairAdjustment ?? 0) + adjustmentB;
          candidate.appliedMinimalPairCards?.push(card.id);
        } else if (isB && adjustmentA > 0) {
          candidate.minimalPairAdjustment =
            (candidate.minimalPairAdjustment ?? 0) - adjustmentA * 0.85;
          candidate.appliedMinimalPairCards?.push(card.id);
        }
      }
    }

    return adjusted
      .map((candidate) => ({
        ...candidate,
        confidence: clamp01(
          (candidate.baseConfidence ?? candidate.confidence) +
            (candidate.contrastiveAdjustment ?? 0) +
            (candidate.minimalPairAdjustment ?? 0),
        ),
      }))
      .sort((left, right) => {
        if (right.confidence !== left.confidence) {
          return right.confidence - left.confidence;
        }

        return left.distance - right.distance;
      });
  }
}

export const candidateRecognizer = new CandidateRecognizer();
