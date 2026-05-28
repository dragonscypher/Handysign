import { vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RepairPanel from "@/components/RepairPanel";
import { createCandidatePrototype } from "./testUtils";

describe("RepairPanel", () => {
  it("shows Confusion Twin copy and missing sign-form evidence on ambiguous state", async () => {
    const user = userEvent.setup();
    const onConfirmConfusionChoice = vi.fn();

    render(
      <RepairPanel
        decision={{
          mode: "repair",
          debtType: "ambiguous",
          debtLabel: "Debt: competing candidates",
          message: "I'm not sure.",
          explanation: "Choose from top candidates.",
          confidence: 0.62,
          margin: 0.06,
          primaryCandidate: {
            ...createCandidatePrototype("hello"),
            confidence: 0.62,
            distance: 0.2,
          },
          alternatives: [
            {
              ...createCandidatePrototype("hello"),
              confidence: 0.62,
              distance: 0.2,
            },
            {
              ...createCandidatePrototype("thank-you"),
              confidence: 0.56,
              distance: 0.22,
            },
          ],
          recommendedActions: ["choose-top-candidate", "teach-personal-sign"],
          acceptedText: null,
        }}
        repairState={null}
        saveConsent
        onSaveConsentChange={() => undefined}
        onAction={() => undefined}
        onConfirmConfusionChoice={onConfirmConfusionChoice}
        onClearConfusionMemory={() => undefined}
        canClearConfusionMemory
        confusionTwinChoices={[
          {
            ...createCandidatePrototype("hello"),
            confidence: 0.62,
            distance: 0.2,
          },
          {
            ...createCandidatePrototype("thank-you"),
            confidence: 0.56,
            distance: 0.22,
          },
        ]}
        confusionTwinExplanation="Hand motion separated these candidates most."
        receiptStrongestCue="hand motion"
        hasReceipt
        missingSignFormEvidence={["Mouth cue", "Visibility / occlusion"]}
        fingerspellValue=""
        onFingerspellValueChange={() => undefined}
        onFingerspellSubmit={() => undefined}
        teachHref="/teach"
      />,
    );

    expect(screen.getByText("Confusion Twin")).toBeInTheDocument();
    expect(
      screen.getByText(/Pick intended one and I can keep local repair memory/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/What confused me/i)).toBeInTheDocument();
    expect(screen.getByText(/Hand motion separated/i)).toBeInTheDocument();
    expect(screen.getByText(/Strongest inspected cue: hand motion/i)).toBeInTheDocument();
    expect(screen.getByText(/Save this contrastive repair locally/i)).toBeInTheDocument();
    expect(screen.getByText(/Missing sign-form evidence/i)).toBeInTheDocument();
    expect(screen.getByText(/Mouth cue, Visibility \/ occlusion\./i)).toBeInTheDocument();
    expect(screen.getAllByText("That one")).toHaveLength(2);

    await user.click(screen.getByLabelText(/Confirm hello as intended candidate/i));

    expect(onConfirmConfusionChoice).toHaveBeenCalled();
  });
});
