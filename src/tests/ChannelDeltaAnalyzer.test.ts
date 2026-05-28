import { analyzeChannelDeltas } from "@/lib/features/ChannelDeltaAnalyzer";
import {
  createCandidatePrototype,
  createEncodedSequence,
} from "./testUtils";

describe("ChannelDeltaAnalyzer", () => {
  it("ranks strongest separating channel first", () => {
    const sequence = createEncodedSequence({
      handPoseVector: new Array(12).fill(0.1),
      handVelocityVector: [0.62, 0.2, 0.84, 0.5],
      mouthShapeVector: [0.1, 0.2, 0.1, 0.7],
      facialCueVector: [0.1, 0.1, 0.1, 0.1],
      motionMaskSummary: [0.8, 0.84, 0.5, 1],
      visibilityMask: [1, 1, 1, 1],
    });
    const intended = createCandidatePrototype("hello", "demo", {
      handPoseVector: new Array(12).fill(0.1),
      handVelocityVector: [0.62, 0.2, 0.84, 0.5],
      mouthShapeVector: [0.1, 0.2, 0.1, 0.7],
      facialCueVector: [0.1, 0.1, 0.1, 0.1],
      motionMaskSummary: [0.8, 0.84, 0.5, 1],
      visibilityMask: [1, 1, 1, 1],
    });
    const confused = createCandidatePrototype("thank-you", "demo", {
      handPoseVector: new Array(12).fill(0.1),
      handVelocityVector: [0.04, 0.06, 0.12, 0.12],
      mouthShapeVector: [0.12, 0.2, 0.1, 0.68],
      facialCueVector: [0.1, 0.1, 0.1, 0.1],
      motionMaskSummary: [0.4, 0.12, 0.5, 1],
      visibilityMask: [1, 1, 1, 1],
    });

    const analysis = analyzeChannelDeltas(sequence, intended, confused);

    expect(analysis.channelDeltas[0]?.channel).toBe("handMotion");
    expect(analysis.topExplanation).toMatch(/Hand motion separated/i);
  });
});
