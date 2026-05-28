import { buildMotionReceipt } from "@/lib/receipts/MotionReceiptBuilder";
import { assertNoRawVideoFields } from "@/lib/privacy/assertNoRawVideoFields";
import {
  createBufferSnapshot,
  createEncodedSequence,
  createRecognitionResult,
  createUncertaintyDecision,
} from "./testUtils";

describe("MotionReceiptBuilder", () => {
  it("creates landmark-only receipt with uncertainty reason and Translation Debt", () => {
    const snapshot = createBufferSnapshot({ frameCount: 32, motion: "dynamic" });
    const encoded = createEncodedSequence();
    const recognition = createRecognitionResult({ encoded });
    const decision = createUncertaintyDecision({
      confidence: recognition.top1?.confidence ?? 0.64,
      margin: 0.06,
      primaryCandidate: recognition.top1,
      alternatives: recognition.topK,
      debtType: "ambiguous",
      debtLabel: "Debt: competing candidates",
      message: "I'm not sure. Top known candidates are too close to trust one answer.",
    });

    const receipt = buildMotionReceipt({
      landmarkBuffer: snapshot.buffer,
      encodedSequence: encoded,
      recognition,
      decision,
      source: "live",
    });

    expect(receipt.privacy.landmarkOnly).toBe(true);
    expect(receipt.privacy.rawVideoStored).toBe(false);
    expect(receipt.privacy.pixelDataStored).toBe(false);
    expect(receipt.uncertaintySummary.reason).toMatch(/I'm not sure/i);
    expect(receipt.translationDebt.label).toBe("Debt: competing candidates");
    expect(receipt.replayFrames.length).toBeGreaterThan(0);
    expect(receipt.signFormLedger?.privacy.landmarkOnly).toBe(true);
    expect(receipt.signFormLedger?.slots.handshape.valueLabel).toBeTruthy();
    expect(receipt.signFormLedger?.warnings[0]).toMatch(/I'm not sure/i);

    expect(() => assertNoRawVideoFields(receipt)).not.toThrow();
  });

  it("caps replay frame count at 64", () => {
    const snapshot = createBufferSnapshot({ frameCount: 96, motion: "dynamic" });
    const encoded = createEncodedSequence({
      frameCount: 64,
      quality: {
        validFrameCount: 64,
      },
    });
    const recognition = createRecognitionResult({ encoded });
    const decision = createUncertaintyDecision({
      primaryCandidate: recognition.top1,
      alternatives: recognition.topK,
    });

    const receipt = buildMotionReceipt({
      landmarkBuffer: snapshot.buffer,
      encodedSequence: encoded,
      recognition,
      decision,
      source: "live",
    });

    expect(receipt.replayFrames.length).toBeLessThanOrEqual(64);
  });
});
