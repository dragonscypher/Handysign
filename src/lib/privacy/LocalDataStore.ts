import Dexie, { type Table } from "dexie";
import type { EvidenceHealthReport } from "@/lib/evidence-health/EvidenceHealth";
import type { MinimalPairCard } from "@/lib/minimal-pairs/MinimalPair";
import type { BlindLexemeMemory } from "@/lib/recognition/BlindSemanticDecoder";
import type { MotionReceipt } from "@/lib/receipts/MotionReceipt";
import { assertNoRawVideoFields } from "@/lib/privacy/assertNoRawVideoFields";
import type { ConfusionPair } from "@/lib/recognition/ContrastiveMemory";
import type { VerificationReport } from "@/lib/video/VerificationReport";
import type {
  CandidateMetadata,
  CorrectionAction,
  EncodedSequence,
} from "@/lib/recognition/types";

export type SettingKey =
  | "consentAccepted"
  | "overlayEnabled"
  | "saveConsent"
  | "cameraMode";

export interface SettingRecord<T = boolean | string | null> {
  key: SettingKey;
  value: T;
  updatedAt: string;
}

export interface PersonalSignRecord {
  id: string;
  label: string;
  labelKey: string;
  examples: EncodedSequence[];
  prototype: number[];
  metadata: CandidateMetadata & {
    confirmedCount?: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CorrectionRecord {
  id: string;
  label: string;
  candidateId?: string;
  receiptId?: string;
  action: CorrectionAction;
  saved: boolean;
  confidence: number;
  debtType: string;
  timestamp: string;
}

export type SavedMotionReceiptRecord = MotionReceipt;
export type MinimalPairCardRecord = MinimalPairCard;
export type EvidenceHealthReportRecord = EvidenceHealthReport;
export type VerificationReportRecord = VerificationReport;
export type BlindLexemeMemoryRecord = BlindLexemeMemory;

export interface SignRepairExport {
  exportedAt: string;
  settings: SettingRecord[];
  personalSigns: PersonalSignRecord[];
  corrections: CorrectionRecord[];
  confusionPairs: ConfusionPair[];
  savedReceipts: SavedMotionReceiptRecord[];
  minimalPairCards: MinimalPairCardRecord[];
  evidenceHealthReport: EvidenceHealthReportRecord | null;
  verificationReports: VerificationReportRecord[];
  blindLexemeMemories: BlindLexemeMemoryRecord[];
}

class SignRepairDexie extends Dexie {
  settings!: Table<SettingRecord, SettingKey>;
  personalSigns!: Table<PersonalSignRecord, string>;
  corrections!: Table<CorrectionRecord, string>;
  confusionPairs!: Table<ConfusionPair, string>;
  savedReceipts!: Table<SavedMotionReceiptRecord, string>;
  minimalPairCards!: Table<MinimalPairCardRecord, string>;
  evidenceHealthReports!: Table<EvidenceHealthReportRecord, string>;
  verificationReports!: Table<VerificationReportRecord, string>;
  blindLexemeMemories!: Table<BlindLexemeMemoryRecord, string>;

  constructor(name: string) {
    super(name);

    this.version(1).stores({
      settings: "key, updatedAt",
      personalSigns: "id, label, labelKey, updatedAt",
      corrections: "id, label, timestamp",
    });
    this.version(2).stores({
      settings: "key, updatedAt",
      personalSigns: "id, label, labelKey, updatedAt",
      corrections: "id, label, timestamp",
      confusionPairs: "id, intendedLabel, confusedLabel, updatedAt",
    });
    this.version(3).stores({
      settings: "key, updatedAt",
      personalSigns: "id, label, labelKey, updatedAt",
      corrections: "id, label, timestamp",
      confusionPairs: "id, intendedLabel, confusedLabel, updatedAt",
      savedReceipts: "id, createdAt, mode",
    });
    this.version(4).stores({
      settings: "key, updatedAt",
      personalSigns: "id, label, labelKey, updatedAt",
      corrections: "id, label, timestamp",
      confusionPairs: "id, intendedLabel, confusedLabel, updatedAt",
      savedReceipts: "id, createdAt, mode",
      minimalPairCards: "id, updatedAt",
    });
    this.version(5).stores({
      settings: "key, updatedAt",
      personalSigns: "id, label, labelKey, updatedAt",
      corrections: "id, label, timestamp",
      confusionPairs: "id, intendedLabel, confusedLabel, updatedAt",
      savedReceipts: "id, createdAt, mode",
      minimalPairCards: "id, updatedAt",
      evidenceHealthReports: "id, createdAt, overallStatus",
    });
    this.version(6).stores({
      settings: "key, updatedAt",
      personalSigns: "id, label, labelKey, updatedAt",
      corrections: "id, label, timestamp",
      confusionPairs: "id, intendedLabel, confusedLabel, updatedAt",
      savedReceipts: "id, createdAt, mode",
      minimalPairCards: "id, updatedAt",
      evidenceHealthReports: "id, createdAt, overallStatus",
      verificationReports: "id, createdAt, clipName",
    });
    this.version(7).stores({
      settings: "key, updatedAt",
      personalSigns: "id, label, labelKey, updatedAt",
      corrections: "id, label, timestamp",
      confusionPairs: "id, intendedLabel, confusedLabel, updatedAt",
      savedReceipts: "id, createdAt, mode",
      minimalPairCards: "id, updatedAt",
      evidenceHealthReports: "id, createdAt, overallStatus",
      verificationReports: "id, createdAt, clipName",
      blindLexemeMemories: "id, updatedAt",
    });
  }
}

export class LocalDataStore {
  private readonly db: SignRepairDexie;

  constructor(name = "SignRepairDB") {
    this.db = new SignRepairDexie(name);
  }

  async getSetting<T extends boolean | string | null>(
    key: SettingKey,
    fallback: T,
  ) {
    const record = await this.db.settings.get(key);
    return (record?.value as T | undefined) ?? fallback;
  }

  async setSetting<T extends boolean | string | null>(key: SettingKey, value: T) {
    await this.db.settings.put({
      key,
      value,
      updatedAt: new Date().toISOString(),
    });
  }

  async listSettings() {
    return this.db.settings.orderBy("key").toArray();
  }

  async listPersonalSigns() {
    return this.db.personalSigns.orderBy("updatedAt").reverse().toArray();
  }

  async findPersonalSignByLabel(label: string) {
    return this.db.personalSigns.where("labelKey").equals(label.trim().toLowerCase()).first();
  }

  async getPersonalSign(id: string) {
    return this.db.personalSigns.get(id);
  }

  async upsertPersonalSign(record: PersonalSignRecord) {
    assertNoRawVideoFields(record);
    await this.db.personalSigns.put(record);
  }

  async deletePersonalSign(id: string) {
    await this.db.personalSigns.delete(id);
  }

  async addCorrection(record: CorrectionRecord) {
    assertNoRawVideoFields(record);
    await this.db.corrections.put(record);
  }

  async listCorrections() {
    return this.db.corrections.orderBy("timestamp").reverse().toArray();
  }

  async listConfusionPairs() {
    return this.db.confusionPairs.orderBy("updatedAt").reverse().toArray();
  }

  async getConfusionPair(id: string) {
    return this.db.confusionPairs.get(id);
  }

  async upsertConfusionPair(record: ConfusionPair) {
    assertNoRawVideoFields(record);
    await this.db.confusionPairs.put(record);
  }

  async deleteConfusionPair(id: string) {
    await this.db.confusionPairs.delete(id);
  }

  async saveReceipt(record: SavedMotionReceiptRecord) {
    const persistedRecord: SavedMotionReceiptRecord = {
      ...record,
      privacy: {
        ...record.privacy,
        persisted: true,
      },
    };

    assertNoRawVideoFields(persistedRecord);
    await this.db.savedReceipts.put(persistedRecord);

    const receipts = await this.db.savedReceipts.orderBy("createdAt").toArray();

    if (receipts.length > 25) {
      await Promise.all(
        receipts
          .slice(0, receipts.length - 25)
          .map((receipt) => this.db.savedReceipts.delete(receipt.id)),
      );
    }

    return persistedRecord;
  }

  async getReceipt(id: string) {
    return this.db.savedReceipts.get(id);
  }

  async listReceipts() {
    return this.db.savedReceipts.orderBy("createdAt").reverse().toArray();
  }

  async deleteReceipt(id: string) {
    await this.db.savedReceipts.delete(id);
  }

  async getMinimalPairCard(id: string) {
    return this.db.minimalPairCards.get(id);
  }

  async listMinimalPairCards() {
    return this.db.minimalPairCards.orderBy("updatedAt").reverse().toArray();
  }

  async upsertMinimalPairCard(record: MinimalPairCardRecord) {
    assertNoRawVideoFields(record);
    await this.db.minimalPairCards.put(record);
  }

  async deleteMinimalPairCard(id: string) {
    await this.db.minimalPairCards.delete(id);
  }

  async saveEvidenceHealthReport(report: EvidenceHealthReportRecord) {
    assertNoRawVideoFields(report);
    await this.db.transaction("rw", this.db.evidenceHealthReports, async () => {
      await this.db.evidenceHealthReports.clear();
      await this.db.evidenceHealthReports.put(report);
    });

    return report;
  }

  async getLatestEvidenceHealthReport() {
    return (
      (await this.db.evidenceHealthReports.orderBy("createdAt").reverse().first()) ?? null
    );
  }

  async clearEvidenceHealthReports() {
    await this.db.evidenceHealthReports.clear();
  }

  async saveVerificationReport(record: VerificationReportRecord) {
    assertNoRawVideoFields(record);
    await this.db.verificationReports.put(record);

    const reports = await this.db.verificationReports.orderBy("createdAt").toArray();

    if (reports.length > 15) {
      await Promise.all(
        reports
          .slice(0, reports.length - 15)
          .map((report) => this.db.verificationReports.delete(report.id)),
      );
    }

    return record;
  }

  async getVerificationReport(id: string) {
    return this.db.verificationReports.get(id);
  }

  async listVerificationReports() {
    return this.db.verificationReports.orderBy("createdAt").reverse().toArray();
  }

  async deleteVerificationReport(id: string) {
    await this.db.verificationReports.delete(id);
  }

  async saveBlindLexemeMemory(record: BlindLexemeMemoryRecord) {
    assertNoRawVideoFields(record);
    await this.db.blindLexemeMemories.put(record);

    const memories = await this.db.blindLexemeMemories.orderBy("updatedAt").toArray();

    if (memories.length > 5) {
      await Promise.all(
        memories
          .slice(0, memories.length - 5)
          .map((memory) => this.db.blindLexemeMemories.delete(memory.id)),
      );
    }

    return record;
  }

  async listBlindLexemeMemories() {
    return this.db.blindLexemeMemories.orderBy("updatedAt").reverse().toArray();
  }

  async deleteBlindLexemeMemory(id: string) {
    await this.db.blindLexemeMemories.delete(id);
  }

  async export(): Promise<SignRepairExport> {
    const [
      settings,
      personalSigns,
      corrections,
      confusionPairs,
      savedReceipts,
      minimalPairCards,
      evidenceHealthReport,
      verificationReports,
      blindLexemeMemories,
    ] = await Promise.all([
      this.listSettings(),
      this.listPersonalSigns(),
      this.listCorrections(),
      this.listConfusionPairs(),
      this.listReceipts(),
      this.listMinimalPairCards(),
      this.getLatestEvidenceHealthReport(),
      this.listVerificationReports(),
      this.listBlindLexemeMemories(),
    ]);

    const exported = {
      exportedAt: new Date().toISOString(),
      settings,
      personalSigns,
      corrections,
      confusionPairs,
      savedReceipts,
      minimalPairCards,
      evidenceHealthReport,
      verificationReports,
      blindLexemeMemories,
    };

    assertNoRawVideoFields(exported);

    return exported;
  }

  async clearAll() {
    await this.db.transaction(
      "rw",
      [
        this.db.settings,
        this.db.personalSigns,
        this.db.corrections,
        this.db.confusionPairs,
        this.db.savedReceipts,
        this.db.minimalPairCards,
        this.db.evidenceHealthReports,
        this.db.verificationReports,
        this.db.blindLexemeMemories,
      ],
      async () => {
        await this.db.settings.clear();
        await this.db.personalSigns.clear();
        await this.db.corrections.clear();
        await this.db.confusionPairs.clear();
        await this.db.savedReceipts.clear();
        await this.db.minimalPairCards.clear();
        await this.db.evidenceHealthReports.clear();
        await this.db.verificationReports.clear();
        await this.db.blindLexemeMemories.clear();
      },
    );
  }
}

export const localDataStore = new LocalDataStore();
