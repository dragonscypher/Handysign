import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import MotionReceiptViewer from "@/components/MotionReceiptViewer";
import {
  createCuePatchComparison,
  createCuePatchPrompt,
  createCuePatchResult,
  createMinimalPairCard,
  createMotionReceipt,
  createSignFormLedger,
} from "./testUtils";

describe("MotionReceiptViewer", () => {
  it("renders receipt sections in product spine order", () => {
    render(
      <MotionReceiptViewer
        receipt={createMotionReceipt()}
        onDiscard={() => undefined}
        onSave={() => undefined}
      />,
    );

    expect(screen.getByText("Motion Replay Receipt")).toBeInTheDocument();
    expect(screen.getByText(/Privacy notice/i)).toBeInTheDocument();
    expect(screen.getByText(/not linguistic authority/i)).toBeInTheDocument();
    expect(screen.getByText(/Decision summary/i)).toBeInTheDocument();
    expect(screen.getByText(/^Translation Debt$/i)).toBeInTheDocument();
    expect(screen.getByText(/SignForm Ledger/i)).toBeInTheDocument();
    expect(screen.getByText(/Skeleton replay/i)).toBeInTheDocument();
    expect(screen.getByText(/Receipt actions/i)).toBeInTheDocument();
    expect(screen.getByText(/coarse sign-form evidence slots/i)).toBeInTheDocument();
  });

  it("updates replay frame from scrubber", async () => {
    render(
      <MotionReceiptViewer
        receipt={createMotionReceipt()}
        onDiscard={() => undefined}
      />,
    );

    expect(screen.getByText(/Frame 1 \/ 32/i)).toBeInTheDocument();

    fireEvent.change(
      screen.getByLabelText(/Frame scrubber for motion receipt replay/i),
      { target: { value: "31" } },
    );

    expect(screen.getByText(/Frame 32 \/ 32/i)).toBeInTheDocument();
  });

  it("does not save until user clicks save receipt button", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <MotionReceiptViewer
        receipt={createMotionReceipt()}
        onDiscard={() => undefined}
        onSave={onSave}
      />,
    );

    expect(onSave).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /save motion receipt locally/i }));

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("renders cue patch comparison when receipt includes before and after metadata", () => {
    render(
      <MotionReceiptViewer
        receipt={createMotionReceipt({
          cuePatch: {
            prompt: createCuePatchPrompt(),
            result: createCuePatchResult(),
            comparison: createCuePatchComparison(),
          },
        })}
        onDiscard={() => undefined}
      />,
    );

    expect(screen.getByText(/Cue Patch review/i)).toBeInTheDocument();
    expect(screen.getByText(/Suggested patch: Mouth cue patch/i)).toBeInTheDocument();
    expect(screen.getByText(/Improved channels: mouth cue, visibility/i)).toBeInTheDocument();
  });

  it("renders SignForm slot cards and demo hint comparison", () => {
    render(
      <MotionReceiptViewer
        receipt={createMotionReceipt({
          candidateSummary: {
            topLabel: "hello",
            topCandidateId: "demo-hello",
            topConfidence: 0.64,
            alternatives: [],
            demoHints: {
              expectedLocation: "face zone",
              expectedMovement: "long path",
              handshapeHint: "open-ish",
              needsMouthCue: true,
            },
          },
          signFormLedger: createSignFormLedger({
            slots: {
              mouthCue: {
                name: "mouthCue",
                valueLabel: "missing",
                evidenceScore: 0.1,
                status: "missing",
                explanation: "mouth missing",
                landmarksUsed: ["fixture"],
                userEditable: true,
              },
            },
            missingSlots: ["mouthCue"],
          }),
        })}
        onDiscard={() => undefined}
      />,
    );

    expect(screen.getAllByText(/^Handshape$/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Candidate demo hints comparison/i)).toBeInTheDocument();
    expect(screen.getByText(/Handshape hint: open-ish/i)).toBeInTheDocument();
    expect(screen.getByText(/Missing or weak slots/i)).toBeInTheDocument();
  });

  it("renders related Minimal Pair Lab summary when receipt includes one", () => {
    render(
      <MotionReceiptViewer
        receipt={createMotionReceipt({
          relatedMinimalPairCards: [
            {
              id: createMinimalPairCard().id,
              labelA: "hello",
              labelB: "thank-you",
              strongestSlotDifference: "handshape",
              strongestChannel: "handShape",
              repairHint: "final-handshape-hold",
            },
          ],
        })}
        onDiscard={() => undefined}
      />,
    );

    expect(screen.getByText(/Related minimal-pair card/i)).toBeInTheDocument();
    expect(screen.getByText(/hello vs thank-you/i)).toBeInTheDocument();
    expect(screen.getByText(/Strongest slot difference: Handshape/i)).toBeInTheDocument();
  });
});
