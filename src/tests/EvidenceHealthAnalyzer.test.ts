import { averageVectors } from "@/lib/features/normalize";
import { evidenceHealthAnalyzer } from "@/lib/evidence-health/EvidenceHealthAnalyzer";
import type { PersonalSignRecord } from "@/lib/privacy/LocalDataStore";
import {
  createConfusionPair,
  createEncodedSequence,
  createMinimalPairCard,
  createMotionReceipt,
  createSignFormLedger,
} from "./testUtils";

function createPersonalSignRecord(
  label: string,
  exampleCount: number,
  overrides?: Partial<PersonalSignRecord>,
): PersonalSignRecord {
  const examples = Array.from({ length: exampleCount }, (_, index) =>
    createEncodedSequence({
      handPoseVector: new Array(12).fill(0.1 + index * 0.05),
    }),
  );

  return {
    id: overrides?.id ?? `personal-${label}`,
    label,
    labelKey: label.toLowerCase(),
    examples,
    prototype: averageVectors(examples.map((example) => example.centroid)),
    metadata: {
      notes: "fixture personal sign",
      signFormNotes: {
        handshape: "open-ish",
      },
      ...(overrides?.metadata ?? {}),
    },
    createdAt: overrides?.createdAt ?? "2026-04-20T00:00:00.000Z",
    updatedAt: overrides?.updatedAt ?? "2026-04-21T00:00:00.000Z",
  };
}

describe("EvidenceHealthAnalyzer", () => {
  it("marks personal sign with 3 examples healthy", () => {
    const report = evidenceHealthAnalyzer.analyze({
      personalSigns: [createPersonalSignRecord("family-hello", 3)],
      confusionPairs: [],
      savedReceipts: [],
      minimalPairCards: [],
      corrections: [],
      now: "2026-04-22T00:00:00.000Z",
    });

    expect(
      report.memorySummaries.find((summary) => summary.memoryType === "personal-sign")?.status,
    ).toBe("healthy");
    expect(report.privacy.uploaded).toBe(false);
  });

  it("marks one-example personal sign watch", () => {
    const report = evidenceHealthAnalyzer.analyze({
      personalSigns: [
        createPersonalSignRecord("family-hello", 1, {
          metadata: {
            notes: "fixture personal sign",
            signFormNotes: {},
          },
        }),
      ],
      confusionPairs: [],
      savedReceipts: [],
      minimalPairCards: [],
      corrections: [],
      now: "2026-04-22T00:00:00.000Z",
    });

    const summary = report.memorySummaries.find(
      (entry) => entry.memoryType === "personal-sign",
    );

    expect(summary?.status).toBe("watch");
    expect(summary?.recommendedAction.id).toBe("record-more-examples");
  });

  it("marks personal sign with missing sign-form slots watch", () => {
    const report = evidenceHealthAnalyzer.analyze({
      personalSigns: [createPersonalSignRecord("family-hello", 3)],
      confusionPairs: [],
      savedReceipts: [
        createMotionReceipt({
          candidateSummary: {
            topLabel: "family-hello",
            topCandidateId: "personal-family-hello",
            topConfidence: 0.58,
            alternatives: [],
          },
          signFormLedger: createSignFormLedger({
            candidateLabel: "family-hello",
            candidateId: "personal-family-hello",
            missingSlots: ["mouthCue", "handshape"],
          }),
        }),
      ],
      minimalPairCards: [],
      corrections: [],
      now: "2026-04-22T00:00:00.000Z",
    });

    const summary = report.memorySummaries.find(
      (entry) => entry.memoryType === "personal-sign",
    );

    expect(summary?.status).toBe("watch");
    expect(summary?.reasons.join(" ")).toMatch(/Missing sign-form evidence/i);
    expect(summary?.recommendedAction.id).toBe("review-signform-notes");
  });

  it("marks repeated confusion without minimal-pair card needs-review", () => {
    const report = evidenceHealthAnalyzer.analyze({
      personalSigns: [],
      confusionPairs: [
        createConfusionPair({
          id: "confusion-hello-vs-thank-you",
          count: 3,
        }),
      ],
      savedReceipts: [],
      minimalPairCards: [],
      corrections: [],
      now: "2026-04-22T00:00:00.000Z",
    });

    const summary = report.memorySummaries.find(
      (entry) => entry.memoryType === "confusion-twin",
    );

    expect(summary?.status).toBe("needs-review");
    expect(summary?.recommendedAction.id).toBe("open-minimal-pair-lab");
  });

  it("marks repeated confusion without minimal-pair card watch before escalation", () => {
    const report = evidenceHealthAnalyzer.analyze({
      personalSigns: [],
      confusionPairs: [
        createConfusionPair({
          id: "confusion-watch-hello-vs-thank-you",
          count: 2,
        }),
      ],
      savedReceipts: [],
      minimalPairCards: [],
      corrections: [],
      now: "2026-04-22T00:00:00.000Z",
    });

    const summary = report.memorySummaries.find(
      (entry) => entry.memoryType === "confusion-twin",
    );

    expect(summary?.status).toBe("watch");
    expect(summary?.recommendedAction.id).toBe("open-minimal-pair-lab");
  });

  it("marks minimal-pair card with 2 examples each healthy", () => {
    const report = evidenceHealthAnalyzer.analyze({
      personalSigns: [],
      confusionPairs: [],
      savedReceipts: [],
      minimalPairCards: [createMinimalPairCard()],
      corrections: [],
      now: "2026-04-22T00:00:00.000Z",
    });

    expect(
      report.memorySummaries.find((summary) => summary.memoryType === "minimal-pair-card")
        ?.status,
    ).toBe("healthy");
  });

  it("creates drift warning for stale personal sign", () => {
    const report = evidenceHealthAnalyzer.analyze({
      personalSigns: [
        createPersonalSignRecord("family-hello", 3, {
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      ],
      confusionPairs: [],
      savedReceipts: [],
      minimalPairCards: [],
      corrections: [],
      now: "2026-04-22T00:00:00.000Z",
    });

    expect(report.driftWarnings[0]?.label).toBe("family-hello");
    expect(report.driftWarnings[0]?.reason).toMatch(/may have drifted/i);
  });

  it("marks repeated collision after minimal-pair card needs-review", () => {
    const report = evidenceHealthAnalyzer.analyze({
      personalSigns: [],
      confusionPairs: [
        createConfusionPair({
          count: 3,
        }),
      ],
      savedReceipts: [],
      minimalPairCards: [createMinimalPairCard()],
      corrections: [],
      now: "2026-04-22T00:00:00.000Z",
    });

    const summary = report.memorySummaries.find(
      (entry) => entry.memoryType === "minimal-pair-card",
    );

    expect(summary?.status).toBe("needs-review");
  });

  it("flags saved receipt gaps as watch summaries", () => {
    const report = evidenceHealthAnalyzer.analyze({
      personalSigns: [],
      confusionPairs: [],
      savedReceipts: [
        createMotionReceipt({
          signFormLedger: createSignFormLedger({
            missingSlots: ["mouthCue"],
          }),
        }),
      ],
      minimalPairCards: [],
      corrections: [],
      now: "2026-04-22T00:00:00.000Z",
    });

    expect(
      report.memorySummaries.find((summary) => summary.memoryType === "motion-receipt")
        ?.status,
    ).toBe("watch");
    expect(report.coverageGaps.some((gap) => gap.gapType === "missing-mouth-cue")).toBe(true);
  });

  it("marks saved receipt with hard debt and low visibility watch", () => {
    const report = evidenceHealthAnalyzer.analyze({
      personalSigns: [],
      confusionPairs: [],
      savedReceipts: [
        createMotionReceipt({
          translationDebt: {
            type: "hand-occlusion",
            label: "Debt: hand occlusion",
            message: "Last window had hand occlusion.",
          },
          uncertaintySummary: {
            decision: "repair",
            reason: "Hand visibility stayed weak.",
            acceptedByThreshold: false,
            hardDebtPresent: true,
          },
          channelSummary: {
            strongestChannels: [],
            missingChannels: ["visibility"],
            visibilityScore: 0.42,
            motionEnergy: 0.18,
            mouthStability: 0.66,
          },
        }),
      ],
      minimalPairCards: [],
      corrections: [],
      now: "2026-04-22T00:00:00.000Z",
    });

    const summary = report.memorySummaries.find(
      (entry) => entry.memoryType === "motion-receipt",
    );

    expect(summary?.status).toBe("watch");
    expect(summary?.reasons.join(" ")).toMatch(/hand occlusion/i);
    expect(report.coverageGaps.some((gap) => gap.gapType === "low-visibility")).toBe(true);
  });

  it("keeps evidence-health privacy flags local only", () => {
    const report = evidenceHealthAnalyzer.analyze({
      personalSigns: [createPersonalSignRecord("family-hello", 3)],
      confusionPairs: [],
      savedReceipts: [],
      minimalPairCards: [],
      corrections: [],
      now: "2026-04-22T00:00:00.000Z",
    });

    expect(report.privacy).toEqual({
      landmarkOnly: true,
      rawVideoStored: false,
      pixelDataStored: false,
      uploaded: false,
    });
  });
});
