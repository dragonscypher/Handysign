import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BlindExportCompare from "@/components/BlindExportCompare";
import { createBlindInferenceReport } from "./testUtils";

describe("BlindExportCompare", () => {
  it("loads two blind exports and shows compare metrics", async () => {
    const user = userEvent.setup();
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
        unresolvedSegments: [],
        repeatedPatterns: [
          {
            label: "repeated-tool-use-like",
            count: 1,
          },
        ],
        metrics: {
          ...createBlindInferenceReport().summary.metrics,
          averageConfidenceMargin: 0.21,
          eventFamilyDiversity: 2,
          genericUnknownCount: 0,
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

    render(<BlindExportCompare />);

    await user.upload(
      screen.getByLabelText(/Upload baseline blind export JSON/i),
      new File([JSON.stringify(baseline)], "baseline.json", { type: "application/json" }),
    );
    await user.upload(
      screen.getByLabelText(/Upload current blind export JSON/i),
      new File([JSON.stringify(current)], "current.json", { type: "application/json" }),
    );
    await user.click(screen.getByRole("button", { name: /Compare blind exports/i }));

    expect(await screen.findByText(/Top chain differences/i)).toBeInTheDocument();
    expect(screen.getByText(/Segment count/i)).toBeInTheDocument();
    expect(screen.getByText(/Avg confidence margin/i)).toBeInTheDocument();
    expect(screen.getByText(/Fingerspell count/i)).toBeInTheDocument();
    expect(screen.getByText(/Failure tag counts/i)).toBeInTheDocument();
    expect(screen.getByText(/Likely confusion pairs/i)).toBeInTheDocument();
    expect(screen.getByText(/Event-family chain:/i)).toBeInTheDocument();
  });
});
