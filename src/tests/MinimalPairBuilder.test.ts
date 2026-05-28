import { minimalPairBuilder } from "@/lib/minimal-pairs/MinimalPairBuilder";
import {
  createCandidatePrototype,
  createEncodedSequence,
  createMinimalPairExample,
  createSignFormLedger,
} from "./testUtils";

describe("MinimalPairBuilder", () => {
  it("builds a local contrast card from two examples each", () => {
    const hello = createCandidatePrototype("hello", "demo", {
      id: "demo-hello",
      handPoseVector: new Array(12).fill(0.72),
      handVelocityVector: [0.2, 0.1, 0.3, 0.28],
    });
    const thankYou = createCandidatePrototype("thank-you", "demo", {
      id: "demo-thank-you",
      handPoseVector: new Array(12).fill(0.18),
      handVelocityVector: [0.34, 0.12, 0.18, 0.2],
    });

    const card = minimalPairBuilder.build({
      candidateA: hello,
      candidateB: thankYou,
      examplesA: [
        createMinimalPairExample("hello", {
          sequence: createEncodedSequence({
            handPoseVector: new Array(12).fill(0.7),
          }),
          ledger: createSignFormLedger({
            slots: {
              handshape: {
                name: "handshape",
                valueLabel: "open-ish",
                evidenceScore: 0.84,
                status: "observed",
                explanation: "fixture",
                landmarksUsed: ["fixture"],
                userEditable: true,
              },
              location: {
                name: "location",
                valueLabel: "face zone",
                evidenceScore: 0.8,
                status: "observed",
                explanation: "fixture",
                landmarksUsed: ["fixture"],
                userEditable: true,
              },
            },
          }),
        }),
        createMinimalPairExample("hello", {
          sequence: createEncodedSequence({
            handPoseVector: new Array(12).fill(0.68),
          }),
          ledger: createSignFormLedger({
            slots: {
              handshape: {
                name: "handshape",
                valueLabel: "open-ish",
                evidenceScore: 0.8,
                status: "observed",
                explanation: "fixture",
                landmarksUsed: ["fixture"],
                userEditable: true,
              },
              location: {
                name: "location",
                valueLabel: "face zone",
                evidenceScore: 0.78,
                status: "observed",
                explanation: "fixture",
                landmarksUsed: ["fixture"],
                userEditable: true,
              },
            },
          }),
        }),
      ],
      examplesB: [
        createMinimalPairExample("thank-you", {
          sequence: createEncodedSequence({
            handPoseVector: new Array(12).fill(0.16),
          }),
          ledger: createSignFormLedger({
            slots: {
              handshape: {
                name: "handshape",
                valueLabel: "flat-ish",
                evidenceScore: 0.82,
                status: "observed",
                explanation: "fixture",
                landmarksUsed: ["fixture"],
                userEditable: true,
              },
              location: {
                name: "location",
                valueLabel: "chest zone",
                evidenceScore: 0.76,
                status: "observed",
                explanation: "fixture",
                landmarksUsed: ["fixture"],
                userEditable: true,
              },
            },
          }),
        }),
        createMinimalPairExample("thank-you", {
          sequence: createEncodedSequence({
            handPoseVector: new Array(12).fill(0.18),
          }),
          ledger: createSignFormLedger({
            slots: {
              handshape: {
                name: "handshape",
                valueLabel: "flat-ish",
                evidenceScore: 0.78,
                status: "observed",
                explanation: "fixture",
                landmarksUsed: ["fixture"],
                userEditable: true,
              },
              location: {
                name: "location",
                valueLabel: "chest zone",
                evidenceScore: 0.74,
                status: "observed",
                explanation: "fixture",
                landmarksUsed: ["fixture"],
                userEditable: true,
              },
            },
          }),
        }),
      ],
    });

    expect(card.examplesA).toHaveLength(2);
    expect(card.examplesB).toHaveLength(2);
    expect(["handshape", "location"]).toContain(
      card.signFormContrast.strongestSlotDifference?.slot,
    );
    expect(card.channelContrast.strongestChannel?.channel).toBe("handShape");
    expect([
      "final-handshape-hold",
      "body-frame-repeat",
      "hand-occlusion-repeat",
    ]).toContain(card.repairHints[0]?.cuePatchKind);
    expect(card.privacy.landmarkOnly).toBe(true);
  });
});
