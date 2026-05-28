import type {
  CorrectionRecord,
  PersonalSignRecord,
} from "@/lib/privacy/LocalDataStore";
import type { MinimalPairCard } from "@/lib/minimal-pairs/MinimalPair";
import type { MotionReceipt } from "@/lib/receipts/MotionReceipt";
import type { ConfusionPair } from "@/lib/recognition/ContrastiveMemory";
import {
  evidenceHealthSummaryKey,
  worstEvidenceHealthStatus,
  type CoverageGap,
  type DriftWarning,
  type EvidenceHealthAction,
  type EvidenceHealthReport,
  type EvidenceHealthStatus,
  type MemoryHealthSummary,
} from "@/lib/evidence-health/EvidenceHealth";
import { signFormSlotTitle } from "@/lib/signform/SignFormLedger";

export interface EvidenceHealthAnalyzerInput {
  personalSigns: PersonalSignRecord[];
  confusionPairs: ConfusionPair[];
  savedReceipts: MotionReceipt[];
  minimalPairCards: MinimalPairCard[];
  corrections?: CorrectionRecord[];
  now?: string;
}

function nowIso() {
  return new Date().toISOString();
}

function daysSince(timestamp: string, now: Date) {
  return (now.getTime() - new Date(timestamp).getTime()) / (1000 * 60 * 60 * 24);
}

function mean(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function labelKey(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function buildAction(
  id: EvidenceHealthAction["id"],
  title: string,
  instruction: string,
  targetRoute?: string,
  targetId?: string,
): EvidenceHealthAction {
  return {
    id,
    title,
    instruction,
    targetRoute,
    targetId,
  };
}

function dedupeActions(actions: EvidenceHealthAction[]) {
  return Array.from(
    new Map(
      actions.map((action) => [
        `${action.id}:${action.targetId ?? ""}:${action.targetRoute ?? ""}`,
        action,
      ]),
    ).values(),
  );
}

function summarizeReasons(reasons: string[], fallback: string) {
  return reasons.length ? reasons : [fallback];
}

function findPairCard(
  cards: MinimalPairCard[],
  pair: ConfusionPair,
) {
  return (
    cards.find((card) => {
      const ids = new Set([
        card.candidateA.candidateId,
        card.candidateB.candidateId,
      ]);
      const labels = new Set([
        labelKey(card.candidateA.label),
        labelKey(card.candidateB.label),
      ]);

      return (
        (pair.intendedCandidateId && ids.has(pair.intendedCandidateId)) ||
        (pair.confusedCandidateId && ids.has(pair.confusedCandidateId)) ||
        (labels.has(labelKey(pair.intendedLabel)) && labels.has(labelKey(pair.confusedLabel)))
      );
    }) ?? null
  );
}

function isReceiptHardDebt(receipt: MotionReceipt) {
  return (
    receipt.translationDebt.type !== "clean" ||
    receipt.uncertaintySummary.hardDebtPresent
  );
}

function analyzePersonalSigns(
  input: EvidenceHealthAnalyzerInput,
  now: Date,
) {
  const summaries: MemoryHealthSummary[] = [];
  const driftWarnings: DriftWarning[] = [];
  const coverageGaps: CoverageGap[] = [];

  for (const sign of input.personalSigns) {
    const matchingReceipts = input.savedReceipts.filter(
      (receipt) =>
        labelKey(receipt.candidateSummary.topLabel) === labelKey(sign.label) ||
        labelKey(receipt.signFormLedger?.candidateLabel) === labelKey(sign.label),
    );
    const relatedPairs = input.confusionPairs.filter(
      (pair) =>
        labelKey(pair.intendedLabel) === labelKey(sign.label) ||
        labelKey(pair.confusedLabel) === labelKey(sign.label),
    );
    const recentCorrections = (input.corrections ?? []).filter(
      (correction) => labelKey(correction.label) === labelKey(sign.label),
    );
    const noteCount = Object.values(sign.metadata.signFormNotes ?? {}).filter(Boolean).length;
    const hasLedger = matchingReceipts.some((receipt) => receipt.signFormLedger);
    const visibilityScores = [
      ...sign.examples.map(
        (example) => (example.quality.handVisibleRatio + example.quality.faceVisibleRatio) / 2,
      ),
      ...matchingReceipts.map((receipt) => receipt.channelSummary.visibilityScore),
    ];
    const visibilityScore = mean(visibilityScores);
    const weakSlots = Array.from(
      new Set(
        matchingReceipts.flatMap((receipt) => receipt.signFormLedger?.missingSlots ?? []),
      ),
    );
    const staleDays = daysSince(sign.updatedAt, now);
    const stale = staleDays >= 45;
    const repeatedConfusionCount = relatedPairs.reduce((sum, pair) => sum + pair.count, 0);
    const recentRepairBurden = matchingReceipts.filter(
      (receipt) => isReceiptHardDebt(receipt) || receipt.cuePatch?.prompt,
    );

    const reasons: string[] = [];

    if (sign.examples.length < 3) {
      reasons.push(`Only ${sign.examples.length} local example${sign.examples.length === 1 ? "" : "s"} stored.`);
      coverageGaps.push({
        id: `gap-too-few-${sign.id}`,
        gapType: "too-few-examples",
        label: sign.label,
        why: "Local personal sign has too few examples for stable comparison.",
        recommendedAction: buildAction(
          "record-more-examples",
          "Record 2 more examples",
          `Record 2 more examples for ${sign.label}.`,
          `/teach?label=${encodeURIComponent(sign.label)}`,
          sign.id,
        ),
      });
    }

    if (!noteCount && !hasLedger) {
      reasons.push("No local sign-form note or saved ledger yet.");
    }

    if (weakSlots.length) {
      reasons.push(
        `Missing sign-form evidence: ${weakSlots.slice(0, 2).map((slot) => signFormSlotTitle(slot)).join(", ")}.`,
      );
    }

    if (visibilityScore > 0 && visibilityScore < 0.7) {
      reasons.push("Visibility across saved evidence looks weak.");
      coverageGaps.push({
        id: `gap-low-visibility-${sign.id}`,
        gapType: "low-visibility",
        label: sign.label,
        why: "Recent examples or receipts show low visibility or unstable framing.",
        recommendedAction: buildAction(
          "run-cue-patch",
          "Run Cue Patch",
          `Open Live mode and re-capture ${sign.label} with clearer framing.`,
          "/live",
          sign.id,
        ),
      });
    }

    if (stale) {
      reasons.push(`Memory is ${Math.floor(staleDays)} days old and may be stale.`);
      coverageGaps.push({
        id: `gap-stale-${sign.id}`,
        gapType: "stale-memory",
        label: sign.label,
        why: "This local memory may no longer match the user's current signing.",
        recommendedAction: buildAction(
          "delete-stale-memory",
          "Review or delete stale memory",
          `Re-record examples for ${sign.label} or delete stale memory if it is no longer useful.`,
          "/memory",
          sign.id,
        ),
      });
    }

    if (repeatedConfusionCount >= 2) {
      reasons.push("This sign still appears in repeated local confusion pairs.");
    }

    const driftReason =
      stale && recentRepairBurden.length
        ? `${sign.label} may have drifted. Old memory and recent repairs still disagree.`
        : stale
          ? `${sign.label} may have drifted. This local memory looks stale and needs review.`
        : recentRepairBurden.length >= 2 || repeatedConfusionCount >= 2
          ? `${sign.label} may have drifted. Recent local receipts still need repair or confusion review.`
          : null;

    if (driftReason) {
      driftWarnings.push({
        id: `drift-${sign.id}`,
        targetType: "personal-sign",
        targetId: sign.id,
        label: sign.label,
        severity:
          stale && (recentRepairBurden.length >= 2 || repeatedConfusionCount >= 2)
            ? "high"
            : stale || recentRepairBurden.length >= 2
              ? "medium"
              : "low",
        reason: driftReason,
        recentEvidenceIds: [
          ...recentRepairBurden.map((receipt) => receipt.id),
          ...recentCorrections.slice(0, 3).map((correction) => correction.id),
        ].slice(0, 5),
        recommendedAction: buildAction(
          "record-more-examples",
          "Refresh this personal sign",
          `Refresh ${sign.label} with a few new local examples.`,
          `/teach?label=${encodeURIComponent(sign.label)}`,
          sign.id,
        ),
      });
    }

    let status: EvidenceHealthStatus = "unknown";
    let score = 0.4;
    let recommendedAction = buildAction(
      "keep-observing",
      "Keep observing",
      `Keep watching ${sign.label} before changing this memory.`,
      "/evidence-health",
      sign.id,
    );

    if (
      sign.examples.length >= 3 &&
      !stale &&
      visibilityScore >= 0.7 &&
      (noteCount > 0 || hasLedger) &&
      weakSlots.length === 0 &&
      repeatedConfusionCount < 2
    ) {
      status = "healthy";
      score = 0.84;
      recommendedAction = buildAction(
        "keep-observing",
        "Keep observing",
        `${sign.label} has enough local evidence for now.`,
        "/evidence-health",
        sign.id,
      );
    } else if (stale || repeatedConfusionCount >= 3) {
      status = "needs-review";
      score = 0.28;
      recommendedAction = stale
        ? buildAction(
            "delete-stale-memory",
            "Review or delete stale memory",
            `This memory may be stale. Re-record ${sign.label} or delete it.`,
            "/memory",
            sign.id,
          )
        : buildAction(
            "open-minimal-pair-lab",
            "Open Minimal Pair Lab",
            `Repeated confusion around ${sign.label} suggests contrast review.`,
            "/evidence-health",
            sign.id,
          );
    } else {
      status = "watch";
      score = 0.56;
      recommendedAction =
        sign.examples.length < 3
          ? buildAction(
              "record-more-examples",
              "Record more examples",
              `Record 2 more examples for ${sign.label}.`,
              `/teach?label=${encodeURIComponent(sign.label)}`,
              sign.id,
            )
          : weakSlots.length
            ? buildAction(
                "review-signform-notes",
                "Review SignForm notes",
                `Review missing sign-form evidence for ${sign.label}.`,
                "/memory",
                sign.id,
              )
            : buildAction(
                "keep-observing",
                "Keep observing",
                `Keep tracking ${sign.label} before promoting it.`,
                "/evidence-health",
                sign.id,
              );
    }

    summaries.push({
      memoryType: "personal-sign",
      memoryId: sign.id,
      label: sign.label,
      status,
      score,
      reasons: summarizeReasons(
        reasons,
        "Local personal sign has not collected enough evidence for a stronger health label yet.",
      ),
      evidenceCounts: {
        examples: sign.examples.length,
        receipts: matchingReceipts.length,
        confusions: repeatedConfusionCount,
        signFormNotes: noteCount,
      },
      lastUpdated: sign.updatedAt,
      recommendedAction,
    });
  }

  return { summaries, driftWarnings, coverageGaps };
}

function analyzeConfusionPairs(
  input: EvidenceHealthAnalyzerInput,
  now: Date,
) {
  const summaries: MemoryHealthSummary[] = [];
  const coverageGaps: CoverageGap[] = [];

  for (const pair of input.confusionPairs) {
    const relatedCard = findPairCard(input.minimalPairCards, pair);
    const stale = daysSince(pair.updatedAt, now) >= 45;
    const reasons: string[] = [];

    if (pair.count >= 2) {
      reasons.push(`This pair has collided ${pair.count} times in saved local repairs.`);
      coverageGaps.push({
        id: `gap-repeated-confusion-${pair.id}`,
        gapType: "repeated-confusion",
        label: `${pair.intendedLabel} vs ${pair.confusedLabel}`,
        why: "Repeated collisions mean local contrast evidence is still weak.",
        recommendedAction: buildAction(
          "open-minimal-pair-lab",
          "Open Minimal Pair Lab",
          `Open Minimal Pair Lab for ${pair.intendedLabel} vs ${pair.confusedLabel}.`,
          pair.intendedCandidateId && pair.confusedCandidateId
            ? `/minimal-pair?candidateAId=${encodeURIComponent(pair.intendedCandidateId)}&candidateBId=${encodeURIComponent(pair.confusedCandidateId)}`
            : "/minimal-pair",
          pair.id,
        ),
      });
    }

    if (!relatedCard) {
      reasons.push("No Minimal Pair Lab card exists for this repeated confusion.");
    }

    if (stale) {
      reasons.push("This saved repair has not been refreshed recently.");
    }

    let status: EvidenceHealthStatus = "unknown";
    let score = 0.42;
    let recommendedAction = buildAction(
      "keep-observing",
      "Keep observing",
      `Keep observing ${pair.intendedLabel} vs ${pair.confusedLabel}.`,
      "/evidence-health",
      pair.id,
    );

    if (pair.count >= 3) {
      status = "needs-review";
      score = 0.24;
      recommendedAction = buildAction(
        "open-minimal-pair-lab",
        "Open Minimal Pair Lab",
        `This pair keeps colliding. Compare ${pair.intendedLabel} vs ${pair.confusedLabel}.`,
        pair.intendedCandidateId && pair.confusedCandidateId
          ? `/minimal-pair?candidateAId=${encodeURIComponent(pair.intendedCandidateId)}&candidateBId=${encodeURIComponent(pair.confusedCandidateId)}`
          : "/minimal-pair",
        pair.id,
      );
    } else if (pair.count >= 1 && !relatedCard) {
      status = "watch";
      score = 0.54;
      recommendedAction = buildAction(
        "open-minimal-pair-lab",
        "Open Minimal Pair Lab",
        `Create a local contrast card for ${pair.intendedLabel} vs ${pair.confusedLabel}.`,
        pair.intendedCandidateId && pair.confusedCandidateId
          ? `/minimal-pair?candidateAId=${encodeURIComponent(pair.intendedCandidateId)}&candidateBId=${encodeURIComponent(pair.confusedCandidateId)}`
          : "/minimal-pair",
        pair.id,
      );
    } else if (pair.count >= 1 && relatedCard && !stale) {
      status = "healthy";
      score = 0.78;
    } else {
      status = "watch";
      score = 0.52;
    }

    summaries.push({
      memoryType: "confusion-twin",
      memoryId: pair.id,
      label: `${pair.intendedLabel} vs ${pair.confusedLabel}`,
      status,
      score,
      reasons: summarizeReasons(
        reasons,
        "Local contrastive repair is saved, but needs more observation before it looks stable.",
      ),
      evidenceCounts: {
        savedRepairs: pair.count,
        channelDeltas: pair.channelDeltas.length,
        hasMinimalPairCard: relatedCard ? 1 : 0,
      },
      lastUpdated: pair.updatedAt,
      recommendedAction,
    });
  }

  return { summaries, coverageGaps };
}

function analyzeMinimalPairs(
  input: EvidenceHealthAnalyzerInput,
  now: Date,
) {
  const summaries: MemoryHealthSummary[] = [];

  for (const card of input.minimalPairCards) {
    const pairCollisions = input.confusionPairs
      .filter((pair) => findPairCard([card], pair))
      .reduce((sum, pair) => sum + pair.count, 0);
    const weakVisibility = [...card.examplesA, ...card.examplesB].some(
      (example) =>
        example.qualitySummary.occlusionRatio > 0.3 ||
        example.qualitySummary.handVisibleRatio < 0.7 ||
        example.qualitySummary.faceVisibleRatio < 0.45,
    );
    const strongSlotGap =
      card.signFormContrast.strongestSlotDifference?.scoreGap ?? 0;
    const strongChannelGap = card.channelContrast.strongestChannel?.deltaScore ?? 0;
    const reasons: string[] = [];
    const stale = daysSince(card.updatedAt, now) >= 45;

    if (weakVisibility) {
      reasons.push("Some saved examples in this card had weak visibility.");
    }

    if (strongSlotGap < 0.25 && strongChannelGap < 0.25) {
      reasons.push("Slot and channel contrast stay weak across this card.");
    }

    if (pairCollisions >= 3) {
      reasons.push("This pair keeps colliding even after a saved contrast card.");
    }

    if (stale) {
      reasons.push("This contrast card may be stale.");
    }

    let status: EvidenceHealthStatus = "unknown";
    let score = 0.46;
    let recommendedAction = buildAction(
      "keep-observing",
      "Keep observing",
      `Keep observing ${card.candidateA.label} vs ${card.candidateB.label}.`,
      "/evidence-health",
      card.id,
    );

    if (pairCollisions >= 3) {
      status = "needs-review";
      score = 0.26;
      recommendedAction = buildAction(
        "run-cue-patch",
        "Run Cue Patch",
        `Open Live mode and use cue patches for ${card.candidateA.label} vs ${card.candidateB.label}.`,
        "/live",
        card.id,
      );
    } else if (
      card.examplesA.length >= 2 &&
      card.examplesB.length >= 2 &&
      strongSlotGap >= 0.25 &&
      strongChannelGap >= 0.25 &&
      !weakVisibility &&
      !stale
    ) {
      status = "healthy";
      score = 0.82;
    } else {
      status = "watch";
      score = 0.58;
      recommendedAction = buildAction(
        "record-more-examples",
        "Record more examples",
        `Record another example for each side of ${card.candidateA.label} vs ${card.candidateB.label}.`,
        `/minimal-pair?candidateAId=${encodeURIComponent(card.candidateA.candidateId)}&candidateBId=${encodeURIComponent(card.candidateB.candidateId)}`,
        card.id,
      );
    }

    summaries.push({
      memoryType: "minimal-pair-card",
      memoryId: card.id,
      label: `${card.candidateA.label} vs ${card.candidateB.label}`,
      status,
      score,
      reasons: summarizeReasons(
        reasons,
        "Local contrast card exists, but more examples may clarify it.",
      ),
      evidenceCounts: {
        examplesA: card.examplesA.length,
        examplesB: card.examplesB.length,
        savedRepairs: pairCollisions,
      },
      lastUpdated: card.updatedAt,
      recommendedAction,
    });
  }

  return { summaries };
}

function analyzeReceipts(input: EvidenceHealthAnalyzerInput) {
  const receiptSummaries: MemoryHealthSummary[] = [];
  const ledgerSummaries: MemoryHealthSummary[] = [];
  const coverageGaps: CoverageGap[] = [];

  for (const receipt of input.savedReceipts) {
    const missingSlots = receipt.signFormLedger?.missingSlots ?? [];
    const reasons: string[] = [];

    if (isReceiptHardDebt(receipt)) {
      reasons.push(`Saved receipt still shows ${receipt.translationDebt.label.toLowerCase()}.`);
    }

    if (receipt.channelSummary.visibilityScore < 0.7) {
      reasons.push("Saved receipt visibility is weak.");
      coverageGaps.push({
        id: `gap-low-visibility-receipt-${receipt.id}`,
        gapType: "low-visibility",
        label: receipt.candidateSummary.topLabel ?? receipt.id,
        why: "Saved receipt shows low visibility or unstable framing.",
        recommendedAction: buildAction(
          "run-cue-patch",
          "Run Cue Patch",
          "Open Live mode and capture a cleaner window.",
          "/live",
          receipt.id,
        ),
      });
    }

    if (missingSlots.includes("mouthCue")) {
      coverageGaps.push({
        id: `gap-mouth-${receipt.id}`,
        gapType: "missing-mouth-cue",
        label: receipt.candidateSummary.topLabel ?? receipt.id,
        why: "Saved receipt is missing mouth-cue evidence.",
        recommendedAction: buildAction(
          "run-cue-patch",
          "Patch mouth cue",
          "Run Cue Patch and repeat once with mouth visible.",
          "/live",
          receipt.id,
        ),
      });
    }

    if (missingSlots.includes("facialCue")) {
      coverageGaps.push({
        id: `gap-face-${receipt.id}`,
        gapType: "missing-face-cue",
        label: receipt.candidateSummary.topLabel ?? receipt.id,
        why: "Saved receipt is missing facial or non-manual cue evidence.",
        recommendedAction: buildAction(
          "run-cue-patch",
          "Patch facial cue",
          "Run Cue Patch with face cue fully visible.",
          "/live",
          receipt.id,
        ),
      });
    }

    if (missingSlots.includes("handshape")) {
      coverageGaps.push({
        id: `gap-handshape-${receipt.id}`,
        gapType: "weak-handshape",
        label: receipt.candidateSummary.topLabel ?? receipt.id,
        why: "Saved receipt is weak on coarse handshape evidence.",
        recommendedAction: buildAction(
          "run-cue-patch",
          "Patch final handshape",
          "Repeat and hold the final handshape for a beat.",
          "/live",
          receipt.id,
        ),
      });
    }

    if (missingSlots.includes("location")) {
      coverageGaps.push({
        id: `gap-location-${receipt.id}`,
        gapType: "weak-location",
        label: receipt.candidateSummary.topLabel ?? receipt.id,
        why: "Saved receipt is weak on location or signing-space evidence.",
        recommendedAction: buildAction(
          "run-cue-patch",
          "Patch body framing",
          "Repeat with upper body fully inside frame.",
          "/live",
          receipt.id,
        ),
      });
    }

    const receiptStatus: EvidenceHealthStatus =
      reasons.length || missingSlots.length ? "watch" : "healthy";

    receiptSummaries.push({
      memoryType: "motion-receipt",
      memoryId: receipt.id,
      label: receipt.candidateSummary.topLabel ?? receipt.id,
      status: receiptStatus,
      score: receiptStatus === "healthy" ? 0.72 : 0.48,
      reasons: summarizeReasons(
        reasons,
        "Saved receipt is documentation only. It is not proof of correctness.",
      ),
      evidenceCounts: {
        replayFrames: receipt.replayFrames.length,
        missingSlots: missingSlots.length,
      },
      lastUpdated: receipt.createdAt,
      recommendedAction:
        receiptStatus === "healthy"
          ? buildAction(
              "keep-observing",
              "Keep observing",
              "Saved receipt is useful for local inspection only.",
              "/memory",
              receipt.id,
            )
          : buildAction(
              "run-cue-patch",
              "Run Cue Patch",
              "Open Live mode and capture a cleaner receipt window.",
              "/live",
              receipt.id,
            ),
    });

    if (receipt.signFormLedger) {
      const ledger = receipt.signFormLedger;
      const ledgerReasons: string[] = [];

      if (ledger.missingSlots.length) {
        ledgerReasons.push(
          `Missing slots: ${ledger.missingSlots.slice(0, 2).map((slot) => signFormSlotTitle(slot)).join(", ")}.`,
        );
      }

      if (ledger.warnings.length) {
        ledgerReasons.push(ledger.warnings[0]!);
      }

      ledgerSummaries.push({
        memoryType: "signform-ledger",
        memoryId: ledger.id,
        label: ledger.candidateLabel ?? receipt.candidateSummary.topLabel ?? ledger.id,
        status:
          ledger.missingSlots.length || ledger.warnings.length ? "watch" : "healthy",
        score:
          ledger.missingSlots.length || ledger.warnings.length ? 0.5 : 0.76,
        reasons: summarizeReasons(
          ledgerReasons,
          "Saved SignForm Ledger has enough coarse evidence for local inspection.",
        ),
        evidenceCounts: {
          missingSlots: ledger.missingSlots.length,
          warnings: ledger.warnings.length,
        },
        lastUpdated: ledger.createdAt,
        recommendedAction:
          ledger.missingSlots.length || ledger.warnings.length
            ? buildAction(
                "review-signform-notes",
                "Review SignForm notes",
                "Review weak or missing coarse slots in local memory.",
                "/memory",
                ledger.id,
              )
            : buildAction(
                "keep-observing",
                "Keep observing",
                "Ledger is only a coarse evidence view, not authoritative analysis.",
                "/memory",
                ledger.id,
              ),
      });
    }
  }

  return { receiptSummaries, ledgerSummaries, coverageGaps };
}

export class EvidenceHealthAnalyzer {
  analyze(input: EvidenceHealthAnalyzerInput): EvidenceHealthReport {
    const now = new Date(input.now ?? nowIso());
    const personal = analyzePersonalSigns(input, now);
    const confusion = analyzeConfusionPairs(input, now);
    const minimalPairs = analyzeMinimalPairs(input, now);
    const receipts = analyzeReceipts(input);
    const memorySummaries = [
      ...personal.summaries,
      ...confusion.summaries,
      ...minimalPairs.summaries,
      ...receipts.receiptSummaries,
      ...receipts.ledgerSummaries,
    ].sort((left, right) => {
      const statusDelta =
        ["needs-review", "watch", "healthy", "unknown"].indexOf(left.status) -
        ["needs-review", "watch", "healthy", "unknown"].indexOf(right.status);

      if (statusDelta !== 0) {
        return statusDelta;
      }

      return right.lastUpdated.localeCompare(left.lastUpdated);
    });
    const driftWarnings = personal.driftWarnings.sort((left, right) =>
      ["high", "medium", "low"].indexOf(left.severity) -
      ["high", "medium", "low"].indexOf(right.severity),
    );
    const coverageGaps = [
      ...personal.coverageGaps,
      ...confusion.coverageGaps,
      ...receipts.coverageGaps,
    ];
    const recommendedActions = dedupeActions(
      [
        ...memorySummaries
          .filter((summary) => summary.recommendedAction.id !== "keep-observing")
          .map((summary) => summary.recommendedAction),
        ...driftWarnings.map((warning) => warning.recommendedAction),
        ...coverageGaps.map((gap) => gap.recommendedAction),
      ],
    ).slice(0, 5);

    return {
      id: `evidence-health-${now.toISOString()}`,
      createdAt: now.toISOString(),
      overallStatus: memorySummaries.length
        ? worstEvidenceHealthStatus([
            ...memorySummaries.map((summary) => summary.status),
            ...driftWarnings.map((warning) =>
              warning.severity === "high"
                ? "needs-review"
                : warning.severity === "medium"
                  ? "watch"
                  : "healthy",
            ),
          ])
        : "unknown",
      memorySummaries,
      driftWarnings,
      coverageGaps,
      recommendedActions,
      privacy: {
        landmarkOnly: true,
        rawVideoStored: false,
        pixelDataStored: false,
        uploaded: false,
      },
    };
  }
}

export const evidenceHealthAnalyzer = new EvidenceHealthAnalyzer();

export function evidenceHealthSummaryMap(report: EvidenceHealthReport | null | undefined) {
  return new Map(
    (report?.memorySummaries ?? []).map((summary) => [
      evidenceHealthSummaryKey(summary.memoryType, summary.memoryId),
      summary,
    ]),
  );
}
