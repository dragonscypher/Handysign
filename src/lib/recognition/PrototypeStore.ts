import type { EvidenceHealthReport } from "@/lib/evidence-health/EvidenceHealth";
import { evidenceHealthAnalyzer } from "@/lib/evidence-health/EvidenceHealthAnalyzer";
import {
  type BlindLexemeMemory,
  createBlindLexemeMemory,
} from "@/lib/recognition/BlindSemanticDecoder";
import {
  type ConfusionPair,
  confusionPairId,
  mergeConfusionPair,
} from "@/lib/recognition/ContrastiveMemory";
import { averageVectors } from "@/lib/features/normalize";
import {
  type PersonalSignRecord,
  type SignRepairExport,
  LocalDataStore,
  localDataStore,
} from "@/lib/privacy/LocalDataStore";
import { clearSessionMinimalPairCards } from "@/lib/minimal-pairs/MinimalPairSessionStore";
import type { MinimalPairCard } from "@/lib/minimal-pairs/MinimalPair";
import type { MotionReceipt } from "@/lib/receipts/MotionReceipt";
import type {
  CandidatePrototype,
  CorrectionSummary,
  EncodedSequence,
} from "@/lib/recognition/types";
import type { SignFormNotes } from "@/lib/signform/SignFormLedger";
import type { VerificationReport } from "@/lib/video/VerificationReport";
import { DEMO_PROTOTYPES } from "./demoCatalog";

function nowIso() {
  return new Date().toISOString();
}

function idFromLabel(label: string) {
  return `personal-${label.trim().toLowerCase().replace(/\s+/g, "-")}`;
}

function shouldPersistEvidenceHealthReport(report: EvidenceHealthReport) {
  return !(
    report.overallStatus === "unknown" &&
    report.memorySummaries.length === 0 &&
    report.driftWarnings.length === 0 &&
    report.coverageGaps.length === 0 &&
    report.recommendedActions.length === 0
  );
}

function toCandidate(record: PersonalSignRecord): CandidatePrototype {
  return {
    id: record.id,
    label: record.label,
    source: "personal",
    centroid: record.prototype,
    metadata: record.metadata,
    examplesCount: record.examples.length,
    correctionBoost: Math.min((record.metadata.confirmedCount ?? 0) * 0.02, 0.18),
    updatedAt: record.updatedAt,
  };
}

export function buildSessionCandidate(
  label: string,
  examples: EncodedSequence[],
): CandidatePrototype {
  const timestamp = nowIso();

  return {
    id: `session-${label.trim().toLowerCase().replace(/\s+/g, "-")}`,
    label,
    source: "session",
    centroid: averageVectors(examples.map((example) => example.centroid)),
    metadata: {
      notes: "Session-only repair. Not persisted unless user opts in.",
    },
    examplesCount: examples.length,
    correctionBoost: 0.06,
    updatedAt: timestamp,
  };
}

export function mergeCandidateCatalog(
  personalCandidates: CandidatePrototype[],
  sessionCandidates: CandidatePrototype[] = [],
) {
  const map = new Map<string, CandidatePrototype>();

  for (const candidate of DEMO_PROTOTYPES) {
    map.set(candidate.label.toLowerCase(), candidate);
  }

  for (const candidate of personalCandidates) {
    map.set(candidate.label.toLowerCase(), candidate);
  }

  for (const candidate of sessionCandidates) {
    map.set(candidate.label.toLowerCase(), candidate);
  }

  return Array.from(map.values()).sort((left, right) =>
    left.label.localeCompare(right.label),
  );
}

export class PrototypeStore {
  constructor(private readonly dataStore: LocalDataStore = localDataStore) {}

  async loadPersonalCandidates() {
    const signs = await this.dataStore.listPersonalSigns();
    return signs.map(toCandidate);
  }

  async addExample(
    label: string,
    encodedSequence: EncodedSequence,
    consent: boolean,
    options?: {
      signFormNotes?: SignFormNotes;
    },
  ) {
    const normalizedLabel = label.trim();

    if (!normalizedLabel || !consent) {
      return;
    }

    const existing = await this.dataStore.findPersonalSignByLabel(normalizedLabel);
    const timestamp = nowIso();
    const examples = [...(existing?.examples ?? []), encodedSequence];

    const record: PersonalSignRecord = {
      id: existing?.id ?? idFromLabel(normalizedLabel),
      label: normalizedLabel,
      labelKey: normalizedLabel.toLowerCase(),
      examples,
      prototype: averageVectors(examples.map((example) => example.centroid)),
      metadata: {
        ...(existing?.metadata ?? {}),
        confirmedCount: (existing?.metadata.confirmedCount ?? 0) + 1,
        notes:
          existing?.metadata.notes ??
          "User-confirmed personal or dialect sign stored as landmark-only prototype.",
        signFormNotes: {
          ...(existing?.metadata.signFormNotes ?? {}),
          ...(options?.signFormNotes ?? {}),
        },
      },
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };

    await this.dataStore.upsertPersonalSign(record);
  }

  async updatePersonalSignNotes(id: string, signFormNotes: SignFormNotes) {
    const existing = await this.dataStore.getPersonalSign(id);

    if (!existing) {
      return;
    }

    await this.dataStore.upsertPersonalSign({
      ...existing,
      metadata: {
        ...existing.metadata,
        signFormNotes,
      },
      updatedAt: nowIso(),
    });
  }

  async deletePersonalSign(id: string) {
    await this.dataStore.deletePersonalSign(id);
  }

  async recordCorrection(summary: CorrectionSummary) {
    await this.dataStore.addCorrection({
      id: `${summary.action}-${summary.label}-${summary.timestamp}`,
      label: summary.label,
      candidateId: summary.candidateId,
      action: summary.action,
      saved: summary.saved,
      confidence: summary.confidence,
      debtType: summary.debtType,
      receiptId: summary.receiptId,
      timestamp: summary.timestamp,
    });
  }

  async loadConfusionPairs() {
    return this.dataStore.listConfusionPairs();
  }

  async saveConfusionPair(pair: ConfusionPair) {
    const existing = await this.dataStore.getConfusionPair(pair.id);
    await this.dataStore.upsertConfusionPair(mergeConfusionPair(existing ?? null, pair));
  }

  async deleteConfusionPair(id: string) {
    await this.dataStore.deleteConfusionPair(id);
  }

  async deleteConfusionPairByLabels(intendedLabel: string, confusedLabel: string) {
    await this.dataStore.deleteConfusionPair(
      confusionPairId(intendedLabel, confusedLabel),
    );
  }

  async loadMinimalPairCards() {
    return this.dataStore.listMinimalPairCards();
  }

  async getMinimalPairCard(id: string) {
    return this.dataStore.getMinimalPairCard(id);
  }

  async saveMinimalPairCard(card: MinimalPairCard) {
    const existing = await this.dataStore.getMinimalPairCard(card.id);
    const { mergeMinimalPairCard } = await import("@/lib/minimal-pairs/MinimalPair");
    await this.dataStore.upsertMinimalPairCard(mergeMinimalPairCard(existing ?? null, card));
  }

  async updateMinimalPairNotes(id: string, userNotes: string) {
    const existing = await this.dataStore.getMinimalPairCard(id);

    if (!existing) {
      return;
    }

    await this.dataStore.upsertMinimalPairCard({
      ...existing,
      updatedAt: nowIso(),
      userNotes,
    });
  }

  async deleteMinimalPairCard(id: string) {
    await this.dataStore.deleteMinimalPairCard(id);
  }

  async saveReceipt(receipt: MotionReceipt) {
    return this.dataStore.saveReceipt(receipt);
  }

  async loadReceipts() {
    return this.dataStore.listReceipts();
  }

  async getReceipt(id: string) {
    return this.dataStore.getReceipt(id);
  }

  async loadCorrections() {
    return this.dataStore.listCorrections();
  }

  async generateEvidenceHealthReport(now?: string): Promise<EvidenceHealthReport> {
    const [personalSigns, confusionPairs, savedReceipts, minimalPairCards, corrections] =
      await Promise.all([
        this.dataStore.listPersonalSigns(),
        this.dataStore.listConfusionPairs(),
        this.dataStore.listReceipts(),
        this.dataStore.listMinimalPairCards(),
        this.dataStore.listCorrections(),
      ]);
    const report = evidenceHealthAnalyzer.analyze({
      personalSigns,
      confusionPairs,
      savedReceipts,
      minimalPairCards,
      corrections,
      now,
    });

    if (shouldPersistEvidenceHealthReport(report)) {
      await this.dataStore.saveEvidenceHealthReport(report);
    } else {
      await this.dataStore.clearEvidenceHealthReports();
    }

    return report;
  }

  async loadLatestEvidenceHealthReport() {
    return this.dataStore.getLatestEvidenceHealthReport();
  }

  async deleteReceipt(id: string) {
    await this.dataStore.deleteReceipt(id);
  }

  async saveVerificationReport(report: VerificationReport) {
    return this.dataStore.saveVerificationReport(report);
  }

  async loadVerificationReports() {
    return this.dataStore.listVerificationReports();
  }

  async getVerificationReport(id: string) {
    return this.dataStore.getVerificationReport(id);
  }

  async deleteVerificationReport(id: string) {
    await this.dataStore.deleteVerificationReport(id);
  }

  async saveBlindLexemeMemory(memory: BlindLexemeMemory) {
    return this.dataStore.saveBlindLexemeMemory(memory);
  }

  async createAndSaveBlindLexemeMemory(clipName: string, lexemes: BlindLexemeMemory["lexemes"]) {
    return this.dataStore.saveBlindLexemeMemory(
      createBlindLexemeMemory({
        clipName,
        lexemes,
      }),
    );
  }

  async loadBlindLexemeMemories() {
    return this.dataStore.listBlindLexemeMemories();
  }

  async deleteBlindLexemeMemory(id: string) {
    await this.dataStore.deleteBlindLexemeMemory(id);
  }

  async export(): Promise<SignRepairExport> {
    return this.dataStore.export();
  }

  async clearAll() {
    await this.dataStore.clearAll();
    clearSessionMinimalPairCards();
  }
}

export const prototypeStore = new PrototypeStore();
