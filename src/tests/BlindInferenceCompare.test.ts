import {
  compareBlindInferenceReports,
  isBlindInferenceReport,
} from "@/lib/video/BlindInferenceCompare";
import { createBlindInferenceReport } from "./testUtils";

describe("BlindInferenceCompare", () => {
  it("compares two blind exports without reference fields", () => {
    const baseline = createBlindInferenceReport();
    const current = createBlindInferenceReport({
      segments: [
        {
          ...createBlindInferenceReport().segments[0]!,
          id: "seg-01",
          eventFamilyHypothesis: "approval/celebration-like",
          runnerUpFamily: "big-fall-like",
          failureTags: ["low-confidence-competition"],
        },
        {
          ...createBlindInferenceReport().segments[1]!,
          id: "seg-02",
          eventFamilyHypothesis: "big-fall-like",
          runnerUpFamily: "fingerspell/emphatic-letter-sequence-like",
          failureTags: ["tool-use-vs-release-confusion"],
        },
      ],
      summary: {
        ...createBlindInferenceReport().summary,
        topEventChain: "repeated-tool-use-like -> drink-like",
        topLexemeChain: "lexeme-03 -> lexeme-04",
        repeatedPatterns: [
          {
            label: "repeated-tool-use-like",
            count: 1,
          },
        ],
        unresolvedSegments: ["seg-03"],
        metrics: {
          ...createBlindInferenceReport().summary.metrics,
          genericUnknownCount: 0,
          eventFamilyDiversity: 2,
          averageConfidenceMargin: 0.2,
          refinementCount: 1,
        },
        improveNext: {
          ...createBlindInferenceReport().summary.improveNext,
          failureTagCounts: [
            { tag: "low-confidence-competition", count: 1 },
            { tag: "tool-use-vs-release-confusion", count: 1 },
          ],
          likelyConfusionPairs: [
            { pair: "approval/celebration-like vs big-fall-like", count: 1 },
          ],
        },
      },
      lexemes: createBlindInferenceReport().lexemes.slice(0, 1),
    });

    expect(isBlindInferenceReport(baseline)).toBe(true);
    expect(isBlindInferenceReport({ mode: "blind-inference", reference: {} })).toBe(false);

    const comparison = compareBlindInferenceReports(baseline, current);

    expect(comparison.metrics.segmentCount.delta).toBe(-1);
    expect(comparison.metrics.lexemeCount.delta).toBe(-1);
    expect(comparison.metrics.repeatedPatternCount.current).toBe(1);
    expect(comparison.metrics.averageConfidenceMargin.current).toBe(0.2);
    expect(comparison.focusFamilyCounts.approval.current).toBe(1);
    expect(comparison.focusFamilyCounts.bigFall.current).toBe(1);
    expect(comparison.familyCounts.some((item) => item.label === "approval/celebration-like")).toBe(true);
    expect(comparison.failureTagCounts.some((item) => item.tag === "tool-use-vs-release-confusion")).toBe(true);
    expect(
      comparison.likelyConfusionPairs.some(
        (item) => item.pair === "approval/celebration-like vs big-fall-like",
      ),
    ).toBe(true);
    expect(comparison.topChainDifferences.eventFamily.changed).toBe(true);
    expect(comparison.topChainDifferences.lexeme.changed).toBe(true);
  });
});
