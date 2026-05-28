import { LocalDataStore } from "@/lib/privacy/LocalDataStore";
import { PrototypeStore } from "@/lib/recognition/PrototypeStore";
import { createBlindLexemeMemory } from "@/lib/recognition/BlindSemanticDecoder";
import {
  createConfusionPair,
  createCuePatchComparison,
  createCuePatchPrompt,
  createCuePatchResult,
  createEncodedSequence,
  createMinimalPairCard,
  createMotionReceipt,
  createSignFormLedger,
  createVerificationReport,
} from "./testUtils";

describe("LocalDataStore", () => {
  it("stores, exports, and clears local prototype data", async () => {
    const store = new LocalDataStore(`signrepair-test-${crypto.randomUUID()}`);
    const prototypes = new PrototypeStore(store);

    await store.setSetting("consentAccepted", true);
    await prototypes.addExample("family-hello", createEncodedSequence(), true, {
      signFormNotes: {
        handshape: "open-ish",
      },
    });
    await prototypes.recordCorrection({
      label: "family-hello",
      action: "choose",
      saved: true,
      confidence: 0.84,
      debtType: "clean",
      timestamp: new Date().toISOString(),
    });
    await prototypes.saveConfusionPair(createConfusionPair());
    await prototypes.saveMinimalPairCard(createMinimalPairCard());
    await prototypes.saveReceipt(
      createMotionReceipt({
        signFormLedger: createSignFormLedger({
          missingSlots: ["mouthCue"],
        }),
        cuePatch: {
          prompt: createCuePatchPrompt(),
          result: createCuePatchResult(),
          comparison: createCuePatchComparison(),
        },
      }),
    );
    await prototypes.saveVerificationReport(createVerificationReport());
    await prototypes.createAndSaveBlindLexemeMemory("sample clip.mp4", [
      {
        id: "lexeme-01",
        centroid: [0.1, 0.2, 0.3],
        count: 2,
        averageConfidence: 0.66,
        dominantEventFamily: "repeated-tool-use-like",
        exampleSegmentIds: ["seg-01", "seg-02"],
      },
    ]);
    await prototypes.generateEvidenceHealthReport("2026-04-22T00:00:00.000Z");

    const exported = await store.export();

    expect(exported.settings).toHaveLength(1);
    expect(exported.personalSigns[0]?.label).toBe("family-hello");
    expect(exported.corrections).toHaveLength(1);
    expect(exported.confusionPairs).toHaveLength(1);
    expect(exported.minimalPairCards).toHaveLength(1);
    expect(exported.savedReceipts).toHaveLength(1);
    expect(exported.verificationReports).toHaveLength(1);
    expect(exported.blindLexemeMemories).toHaveLength(1);
    expect(exported.evidenceHealthReport?.privacy.uploaded).toBe(false);
    expect(exported.personalSigns[0]?.metadata.signFormNotes?.handshape).toBe("open-ish");
    expect(exported.savedReceipts[0]?.privacy.landmarkOnly).toBe(true);
    expect(exported.savedReceipts[0]?.signFormLedger?.privacy.landmarkOnly).toBe(true);
    expect(exported.savedReceipts[0]?.signFormLedger?.missingSlots).toContain("mouthCue");
    expect(exported.savedReceipts[0]?.cuePatch?.prompt?.kind).toBe("mouth-visible-repeat");
    const serialized = JSON.stringify(exported);
    for (const forbiddenField of [
      "rawVideo",
      "videoBlob",
      "framePixels",
      "imageData",
      "canvasData",
      "dataUrl",
      "jpg",
      "jpeg",
      "png",
      "webp",
      "base64",
    ]) {
      expect(serialized).not.toContain(`"${forbiddenField}"`);
    }

    await store.clearAll();

    const cleared = await store.export();

    expect(cleared.personalSigns).toHaveLength(0);
    expect(cleared.corrections).toHaveLength(0);
    expect(cleared.confusionPairs).toHaveLength(0);
    expect(cleared.minimalPairCards).toHaveLength(0);
    expect(cleared.savedReceipts).toHaveLength(0);
    expect(cleared.verificationReports).toHaveLength(0);
    expect(cleared.blindLexemeMemories).toHaveLength(0);
    expect(cleared.evidenceHealthReport).toBeNull();
  });

  it("saves, lists, deletes, and caps saved receipts", async () => {
    const store = new LocalDataStore(`signrepair-receipts-${crypto.randomUUID()}`);

    for (let index = 0; index < 27; index += 1) {
      await store.saveReceipt(
        createMotionReceipt({
          id: `receipt-${index}`,
          createdAt: new Date(Date.UTC(2026, 3, 21, 0, 0, index)).toISOString(),
        }),
      );
    }

    const receipts = await store.listReceipts();

    expect(receipts).toHaveLength(25);
    expect(receipts.some((receipt) => receipt.id === "receipt-0")).toBe(false);
    expect(receipts[0]?.privacy.persisted).toBe(true);

    await store.deleteReceipt(receipts[0]!.id);

    const nextReceipts = await store.listReceipts();

    expect(nextReceipts).toHaveLength(24);
  });

  it("saves, lists, and deletes minimal-pair cards", async () => {
    const store = new LocalDataStore(`signrepair-minimal-pairs-${crypto.randomUUID()}`);
    const card = createMinimalPairCard();

    await store.upsertMinimalPairCard(card);

    const cards = await store.listMinimalPairCards();

    expect(cards).toHaveLength(1);
    expect(cards[0]?.privacy.landmarkOnly).toBe(true);

    await store.deleteMinimalPairCard(card.id);

    const cleared = await store.listMinimalPairCards();

    expect(cleared).toHaveLength(0);
  });

  it("saves, lists, and deletes verification reports", async () => {
    const store = new LocalDataStore(`signrepair-verification-${crypto.randomUUID()}`);
    const report = createVerificationReport();

    await store.saveVerificationReport(report);

    const reports = await store.listVerificationReports();

    expect(reports).toHaveLength(1);
    expect(reports[0]?.privacy.landmarkOnly).toBe(true);
    expect(reports[0]?.privacy.rawVideoStored).toBe(false);

    await store.deleteVerificationReport(report.id);

    const cleared = await store.listVerificationReports();

    expect(cleared).toHaveLength(0);
  });

  it("saves, lists, and deletes blind lexeme memories", async () => {
    const store = new LocalDataStore(`signrepair-blind-lexemes-${crypto.randomUUID()}`);
    const memory = createBlindLexemeMemory({
      clipName: "sample clip.mp4",
      lexemes: [
        {
          id: "lexeme-01",
          centroid: [0.1, 0.2, 0.3],
          count: 3,
          averageConfidence: 0.7,
          dominantEventFamily: "chop/cut-like",
          exampleSegmentIds: ["seg-01", "seg-02"],
        },
      ],
    });

    await store.saveBlindLexemeMemory(memory);

    const memories = await store.listBlindLexemeMemories();

    expect(memories).toHaveLength(1);
    expect(memories[0]?.privacy.rawVideoStored).toBe(false);
    expect(memories[0]?.lexemes[0]?.id).toBe("lexeme-01");

    await store.deleteBlindLexemeMemory(memory.id);

    const cleared = await store.listBlindLexemeMemories();

    expect(cleared).toHaveLength(0);
  });
});
