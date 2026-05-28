import type { RepairAction, UncertaintyDecision } from "@/lib/uncertainty/UncertaintyEngine";

export interface RepairState {
  status:
    | "accepted"
    | "needs-repair"
    | "confirmed-session"
    | "confirmed-saved";
  prompt: string;
  action: RepairAction;
  persistRecommended: boolean;
}

export class RepairController {
  next(decision: UncertaintyDecision, action: RepairAction): RepairState {
    if (decision.mode === "accept" || action === "accept") {
      return {
        status: "accepted",
        prompt: "Confidence and margin passed. Keep watching for drift or occlusion.",
        action: "accept",
        persistRecommended: false,
      };
    }

    switch (action) {
      case "repeat-slower":
        return {
          status: "needs-repair",
          prompt: "Repeat slower. Keep full hand path and face visible for at least one second.",
          action,
          persistRecommended: false,
        };
      case "show-mouth-cue":
        return {
          status: "needs-repair",
          prompt: "Show mouth cue clearly, then repeat once with same hand shape.",
          action,
          persistRecommended: false,
        };
      case "choose-top-candidate":
        return {
          status: "confirmed-session",
          prompt:
            "Candidate confirmed. Save locally if this reflects your personal sign or dialect.",
          action,
          persistRecommended: true,
        };
      case "fingerspell":
        return {
          status: "needs-repair",
          prompt:
            "Fingerspell slowly, then type intended word so SignRepair can keep decoding constrained.",
          action,
          persistRecommended: true,
        };
      case "teach-personal-sign":
        return {
          status: "needs-repair",
          prompt:
            "Capture 3 to 5 landmark-only examples in Teach Mode to store this as personal sign.",
          action,
          persistRecommended: true,
        };
      case "reposition":
        return {
          status: "needs-repair",
          prompt: "Reposition camera so signing hand and mouth stay in frame, then repeat.",
          action,
          persistRecommended: false,
        };
      default:
        return {
          status: "needs-repair",
          prompt: decision.explanation,
          action,
          persistRecommended: false,
        };
    }
  }
}

export const repairController = new RepairController();
