import { RepairController } from "@/lib/uncertainty/RepairController";
import type { UncertaintyDecision } from "@/lib/uncertainty/UncertaintyEngine";

const decision: UncertaintyDecision = {
  mode: "repair",
  debtType: "ambiguous",
  debtLabel: "Debt: competing candidates",
  message: "Need clarification.",
  explanation: "Choose from top candidates or repeat.",
  confidence: 0.62,
  margin: 0.04,
  primaryCandidate: null,
  alternatives: [],
  recommendedActions: ["choose-top-candidate", "repeat-slower"],
  acceptedText: null,
};

describe("RepairController", () => {
  it("turns candidate choice into persistence-friendly prompt", () => {
    const controller = new RepairController();
    const state = controller.next(decision, "choose-top-candidate");

    expect(state.status).toBe("confirmed-session");
    expect(state.persistRecommended).toBe(true);
  });

  it("keeps repeat instructions in repair mode", () => {
    const controller = new RepairController();
    const state = controller.next(decision, "repeat-slower");

    expect(state.status).toBe("needs-repair");
    expect(state.prompt).toMatch(/Repeat slower/i);
  });
});
