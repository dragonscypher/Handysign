import { signFormExtractor } from "@/lib/signform/SignFormExtractor";
import {
  createEncodedSequence,
  createMotionReceipt,
  createRecognitionResult,
  createUncertaintyDecision,
} from "./testUtils";

describe("SignFormExtractor", () => {
  it("returns coarse handshape labels", () => {
    const encoded = createEncodedSequence({
      handPoseVector: [0, 0, 0, 0, 0, 0, 0, 0, 0.82, 0.38, 0.54, 0.72],
      quality: {
        handVisibleRatio: 1,
      },
    });
    const recognition = createRecognitionResult({ encoded });
    const receipt = createMotionReceipt();

    const ledger = signFormExtractor.extract({
      receiptId: receipt.id,
      receipt,
      encodedSequence: encoded,
      recognition,
      decision: createUncertaintyDecision(),
    });

    expect(ledger.slots.handshape.valueLabel).toBe("open-ish");
  });

  it("maps landmarks to coarse body zone", () => {
    const receipt = createMotionReceipt();

    receipt.replayFrames = receipt.replayFrames.map((frame) => ({
      ...frame,
      hands: frame.hands.map((hand) => ({
        ...hand,
        points: hand.points.map((point, index) =>
          index === 0 ? [point[0], 0.41, point[2]] : point,
        ),
      })),
    }));

    const encoded = createEncodedSequence({
      handPoseVector: [0, 0, 0, 0, 0, 0, 0, 0, 0.64, 0.24, 0.7, 0.78],
    });
    const recognition = createRecognitionResult({ encoded });

    const ledger = signFormExtractor.extract({
      receiptId: receipt.id,
      receipt,
      encodedSequence: encoded,
      recognition,
      decision: createUncertaintyDecision(),
    });

    expect(ledger.slots.location.valueLabel).toBe("face zone");
  });

  it("maps missing mouth cue to missing slot", () => {
    const encoded = createEncodedSequence({
      quality: {
        faceVisibleRatio: 0.22,
        mouthStability: 0.08,
      },
    });
    const recognition = createRecognitionResult({ encoded });
    const receipt = createMotionReceipt();

    const ledger = signFormExtractor.extract({
      receiptId: receipt.id,
      receipt,
      encodedSequence: encoded,
      recognition,
      decision: createUncertaintyDecision({
        debtType: "mouth-cue-missing",
      }),
    });

    expect(ledger.slots.mouthCue.status).toBe("missing");
    expect(ledger.slots.mouthCue.valueLabel).toBe("missing");
  });

  it("maps short timing window to weak timing slot", () => {
    const encoded = createEncodedSequence({
      frameCount: 12,
      quality: {
        validFrameCount: 12,
      },
    });
    const recognition = createRecognitionResult({ encoded });
    const receipt = createMotionReceipt({
      replayFrames: createMotionReceipt().replayFrames.slice(0, 12),
    });

    const ledger = signFormExtractor.extract({
      receiptId: receipt.id,
      receipt,
      encodedSequence: encoded,
      recognition,
      decision: createUncertaintyDecision({
        debtType: "motion-too-short",
      }),
    });

    expect(ledger.slots.timing.valueLabel).toBe("too short");
    expect(ledger.slots.timing.status).toBe("weak");
  });

  it("maps occlusion to visibility warning", () => {
    const encoded = createEncodedSequence({
      quality: {
        handVisibleRatio: 0.88,
        faceVisibleRatio: 0.86,
        occlusionRatio: 0.42,
      },
    });
    const recognition = createRecognitionResult({ encoded });
    const receipt = createMotionReceipt();

    const ledger = signFormExtractor.extract({
      receiptId: receipt.id,
      receipt,
      encodedSequence: encoded,
      recognition,
      decision: createUncertaintyDecision({
        debtType: "hand-occlusion",
      }),
    });

    expect(ledger.slots.visibility.valueLabel).toBe("partial occlusion");
    expect(ledger.warnings.some((warning) => /visibility|occlusion/i.test(warning))).toBe(
      true,
    );
  });
});
