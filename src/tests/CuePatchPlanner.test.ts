import {
  CuePatchPlanner,
  completeCuePatchCapture,
} from "@/lib/repair/CuePatchPlanner";
import {
  createCandidatePrototype,
  createCuePatchPrompt,
  createMinimalPairCard,
  createMotionReceipt,
  createRecognitionResult,
  createSignFormLedger,
  createUncertaintyDecision,
} from "./testUtils";

describe("CuePatchPlanner", () => {
  const planner = new CuePatchPlanner();

  it("maps hand occlusion debt to hand-occlusion-repeat", () => {
    const receipt = createMotionReceipt({
      channelSummary: {
        strongestChannels: [],
        missingChannels: ["visibility"],
        visibilityScore: 0.42,
        motionEnergy: 0.24,
        mouthStability: 0.74,
      },
    });
    const prompts = planner.plan({
      decision: createUncertaintyDecision({
        debtType: "hand-occlusion",
        debtLabel: "Debt: hand occlusion",
      }),
      translationDebt: receipt.translationDebt,
      motionReceipt: receipt,
      channelSummary: receipt.channelSummary,
      topCandidates: createRecognitionResult().topK,
    });

    expect(prompts[0]?.kind).toBe("hand-occlusion-repeat");
  });

  it("maps mouth cue debt to mouth-visible-repeat", () => {
    const receipt = createMotionReceipt({
      translationDebt: {
        type: "mouth-cue-missing",
        label: "Debt: mouth cue missing",
        message: "I'm not sure. Mouth signal is weak.",
      },
      channelSummary: {
        strongestChannels: [],
        missingChannels: ["mouth cue"],
        visibilityScore: 0.88,
        motionEnergy: 0.24,
        mouthStability: 0.18,
      },
    });
    const prompts = planner.plan({
      decision: createUncertaintyDecision({
        debtType: "mouth-cue-missing",
        debtLabel: "Debt: mouth cue missing",
      }),
      translationDebt: receipt.translationDebt,
      motionReceipt: receipt,
      channelSummary: receipt.channelSummary,
      topCandidates: createRecognitionResult().topK,
    });

    expect(prompts[0]?.kind).toBe("mouth-visible-repeat");
  });

  it("maps short motion window to slow-full-repeat", () => {
    const receipt = createMotionReceipt({
      translationDebt: {
        type: "motion-too-short",
        label: "Debt: motion too short",
        message: "I'm not sure. Motion window too short.",
      },
      channelSummary: {
        strongestChannels: [],
        missingChannels: ["timing"],
        visibilityScore: 0.9,
        motionEnergy: 0.04,
        mouthStability: 0.74,
      },
      replayFrames: createMotionReceipt().replayFrames.slice(0, 12),
    });
    const prompts = planner.plan({
      decision: createUncertaintyDecision({
        debtType: "motion-too-short",
        debtLabel: "Debt: motion too short",
      }),
      translationDebt: receipt.translationDebt,
      motionReceipt: receipt,
      channelSummary: receipt.channelSummary,
      topCandidates: createRecognitionResult().topK,
    });

    expect(prompts.some((prompt) => prompt.kind === "slow-full-repeat")).toBe(true);
  });

  it("maps unstable final frame to final-handshape-hold", () => {
    const receipt = createMotionReceipt();
    receipt.replayFrames[receipt.replayFrames.length - 1] = {
      ...receipt.replayFrames.at(-1)!,
      hands: [],
      quality: {
        ...receipt.replayFrames.at(-1)!.quality,
        handVisible: false,
      },
    };

    const prompts = planner.plan({
      decision: createUncertaintyDecision({
        debtType: "motion-too-short",
      }),
      translationDebt: receipt.translationDebt,
      motionReceipt: receipt,
      channelSummary: receipt.channelSummary,
      topCandidates: createRecognitionResult().topK,
    });

    expect(prompts.some((prompt) => prompt.kind === "final-handshape-hold")).toBe(true);
  });

  it("maps repeated unknown debt to teach-personal-sign", () => {
    const receipt = createMotionReceipt({
      translationDebt: {
        type: "dialect-custom-sign-unknown",
        label: "Debt: dialect/custom sign unknown",
        message: "I do not know this sign safely.",
      },
    });
    const prompts = planner.plan({
      decision: createUncertaintyDecision({
        debtType: "dialect-custom-sign-unknown",
        recommendedActions: ["fingerspell", "teach-personal-sign"],
      }),
      translationDebt: receipt.translationDebt,
      motionReceipt: receipt,
      channelSummary: receipt.channelSummary,
      topCandidates: createRecognitionResult().topK,
    });

    expect(prompts.some((prompt) => prompt.kind === "teach-personal-sign")).toBe(true);
  });

  it("maps ambiguous good-visibility state to choose-from-candidates", () => {
    const receipt = createMotionReceipt({
      channelSummary: {
        strongestChannels: [],
        missingChannels: [],
        visibilityScore: 0.94,
        motionEnergy: 0.24,
        mouthStability: 0.74,
      },
    });
    const prompts = planner.plan({
      decision: createUncertaintyDecision({
        debtType: "ambiguous",
      }),
      translationDebt: receipt.translationDebt,
      motionReceipt: receipt,
      channelSummary: receipt.channelSummary,
      topCandidates: createRecognitionResult().topK,
    });

    expect(prompts.some((prompt) => prompt.kind === "choose-from-candidates")).toBe(true);
  });

  it("falls back to slow-full-repeat when no smaller patch fits", () => {
    const receipt = createMotionReceipt({
      signFormLedger: createSignFormLedger(),
      channelSummary: {
        strongestChannels: [],
        missingChannels: [],
        visibilityScore: 0.6,
        motionEnergy: 0.24,
        mouthStability: 0.74,
      },
    });
    const topCandidates = [
      {
        ...createCandidatePrototype("hello", "demo", {
          metadata: {
            needsFaceCue: false,
            needsMouthCue: false,
          },
        }),
        confidence: 0.62,
        distance: 0.2,
      },
    ];
    const prompts = planner.plan({
      decision: createUncertaintyDecision({
        debtType: "ambiguous",
      }),
      translationDebt: receipt.translationDebt,
      motionReceipt: receipt,
      channelSummary: receipt.channelSummary,
      topCandidates,
    });

    expect(prompts.some((prompt) => prompt.kind === "slow-full-repeat")).toBe(true);
  });

  it("patch completion cannot bypass uncertainty thresholds", () => {
    const beforeReceipt = createMotionReceipt({
      id: "receipt-before",
      channelSummary: {
        strongestChannels: [],
        missingChannels: ["mouth cue"],
        visibilityScore: 0.78,
        motionEnergy: 0.2,
        mouthStability: 0.18,
      },
    });
    const afterReceipt = createMotionReceipt({
      id: "receipt-after",
      channelSummary: {
        strongestChannels: [],
        missingChannels: [],
        visibilityScore: 0.9,
        motionEnergy: 0.22,
        mouthStability: 0.72,
      },
    });
    const completion = completeCuePatchCapture(
      createCuePatchPrompt(),
      beforeReceipt,
      afterReceipt,
      createUncertaintyDecision({
        mode: "repair",
        debtType: "ambiguous",
        recommendedActions: ["choose-top-candidate"],
      }),
    );

    expect(completion.result.nextRecommendedAction).toBe("choose-top-candidate");
  });

  it("suggests face cue patch when candidate metadata needs non-manual cue", () => {
    const receipt = createMotionReceipt({
      channelSummary: {
        strongestChannels: [],
        missingChannels: ["facial cue"],
        visibilityScore: 0.72,
        motionEnergy: 0.2,
        mouthStability: 0.7,
      },
    });
    const prompts = planner.plan({
      decision: createUncertaintyDecision(),
      translationDebt: receipt.translationDebt,
      motionReceipt: receipt,
      channelSummary: receipt.channelSummary,
      topCandidates: [
        {
          ...createCandidatePrototype("help", "demo", {
            metadata: { needsFaceCue: true },
          }),
          confidence: 0.62,
          distance: 0.2,
        },
      ],
    });

    expect(prompts.some((prompt) => prompt.kind === "face-cue-visible-repeat")).toBe(
      true,
    );
  });

  it("uses sign-form missing mouth slot to suggest mouth-visible-repeat", () => {
    const receipt = createMotionReceipt({
      signFormLedger: createSignFormLedger({
        slots: {
          mouthCue: {
            name: "mouthCue",
            valueLabel: "missing",
            evidenceScore: 0.1,
            status: "missing",
            explanation: "missing mouth",
            landmarksUsed: ["fixture"],
            userEditable: true,
          },
        },
        missingSlots: ["mouthCue"],
      }),
      channelSummary: {
        strongestChannels: [],
        missingChannels: [],
        visibilityScore: 0.88,
        motionEnergy: 0.24,
        mouthStability: 0.18,
      },
    });
    const prompts = planner.plan({
      decision: createUncertaintyDecision({
        debtType: "ambiguous",
      }),
      translationDebt: receipt.translationDebt,
      motionReceipt: receipt,
      channelSummary: receipt.channelSummary,
      topCandidates: createRecognitionResult().topK,
    });

    expect(prompts.some((prompt) => prompt.kind === "mouth-visible-repeat")).toBe(true);
  });

  it("uses sign-form location slot to suggest body-frame-repeat", () => {
    const receipt = createMotionReceipt({
      signFormLedger: createSignFormLedger({
        slots: {
          location: {
            name: "location",
            valueLabel: "low/out of frame",
            evidenceScore: 0.2,
            status: "missing",
            explanation: "location low",
            landmarksUsed: ["fixture"],
            userEditable: true,
          },
        },
        missingSlots: ["location"],
      }),
      channelSummary: {
        strongestChannels: [],
        missingChannels: [],
        visibilityScore: 0.82,
        motionEnergy: 0.24,
        mouthStability: 0.74,
      },
    });
    const prompts = planner.plan({
      decision: createUncertaintyDecision({
        debtType: "ambiguous",
      }),
      translationDebt: receipt.translationDebt,
      motionReceipt: receipt,
      channelSummary: receipt.channelSummary,
      topCandidates: createRecognitionResult().topK,
    });

    expect(prompts.some((prompt) => prompt.kind === "body-frame-repeat")).toBe(true);
  });

  it("uses Minimal Pair Lab repair hints before generic fallback", () => {
    const receipt = createMotionReceipt();
    const prompts = planner.plan({
      decision: createUncertaintyDecision({
        debtType: "ambiguous",
      }),
      translationDebt: receipt.translationDebt,
      motionReceipt: receipt,
      channelSummary: receipt.channelSummary,
      topCandidates: createRecognitionResult().topK,
      minimalPairCard: createMinimalPairCard(),
    });

    expect(prompts[0]?.kind).toBe("final-handshape-hold");
    expect(prompts[0]?.why).toMatch(/Local minimal-pair card says this pair is usually separated by/i);
  });
});
