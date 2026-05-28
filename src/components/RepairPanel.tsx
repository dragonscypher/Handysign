"use client";

import Link from "next/link";
import type { RepairState } from "@/lib/uncertainty/RepairController";
import type {
  RepairAction,
  UncertaintyDecision,
} from "@/lib/uncertainty/UncertaintyEngine";
import type { CandidateMatch } from "@/lib/recognition/types";

interface RepairPanelProps {
  decision: UncertaintyDecision | null;
  repairState: RepairState | null;
  saveConsent: boolean;
  onSaveConsentChange: (value: boolean) => void;
  onAction: (action: RepairAction) => void;
  onConfirmConfusionChoice: (candidate: CandidateMatch, persist: boolean) => void;
  onClearConfusionMemory: () => void;
  canClearConfusionMemory: boolean;
  confusionTwinChoices: CandidateMatch[];
  confusionTwinExplanation: string | null;
  receiptStrongestCue: string;
  hasReceipt: boolean;
  missingSignFormEvidence: string[];
  fingerspellValue: string;
  onFingerspellValueChange: (value: string) => void;
  onFingerspellSubmit: () => void;
  teachHref: string;
}

const LABELS: Record<RepairAction, string> = {
  accept: "Accept",
  "repeat-slower": "Repeat slower",
  "show-mouth-cue": "Show mouth cue",
  fingerspell: "Fingerspell",
  "choose-top-candidate": "Choose from top 3",
  "teach-personal-sign": "Teach as personal sign",
  reposition: "Reposition in frame",
};

export default function RepairPanel({
  decision,
  repairState,
  saveConsent,
  onSaveConsentChange,
  onAction,
  onConfirmConfusionChoice,
  onClearConfusionMemory,
  canClearConfusionMemory,
  confusionTwinChoices,
  confusionTwinExplanation,
  receiptStrongestCue,
  hasReceipt,
  missingSignFormEvidence,
  fingerspellValue,
  onFingerspellValueChange,
  onFingerspellSubmit,
  teachHref,
}: RepairPanelProps) {
  const confusionTwinActive =
    decision?.mode === "repair" &&
    decision.debtType === "ambiguous" &&
    confusionTwinChoices.length >= 2;
  const showFingerspellForm =
    decision?.recommendedActions.includes("fingerspell") ||
    repairState?.action === "fingerspell";
  const secondaryActions = (decision?.recommendedActions ?? []).filter(
    (action) =>
      ![
        "choose-top-candidate",
        "teach-personal-sign",
        "fingerspell",
      ].includes(action),
  );

  return (
    <section className="panel section-stack">
      <div className="split-line">
        <h2 className="title-md">{confusionTwinActive ? "Confusion Twin" : "Repair Mode"}</h2>
        <span className="debt-badge" data-kind={decision?.debtType ?? "ambiguous"}>
          {decision?.debtLabel ?? "Awaiting landmarks"}
        </span>
      </div>
      <p className="body-sm">
        {confusionTwinActive
          ? "I'm not sure which known candidate this is. Pick intended one and I can keep local repair memory for this device."
          : repairState?.prompt ??
            decision?.explanation ??
            "Repair prompts appear here when SignRepair cannot justify a known-candidate label."}
      </p>

      {missingSignFormEvidence.length ? (
        <div className="info-box">
          <strong>Missing sign-form evidence</strong>
          <p className="body-sm">{missingSignFormEvidence.join(", ")}.</p>
          <p className="caption">
            Coarse landmark slots only. Not official ASL phonology or linguistic authority.
          </p>
        </div>
      ) : null}

      {confusionTwinActive ? (
        <div className="section-stack">
          <div className="info-box">
            <strong>What confused me</strong>
            <p className="body-sm">
              {confusionTwinExplanation ??
                "These known candidates stayed too close across visible feature channels."}
            </p>
            {hasReceipt ? (
              <p className="caption">Strongest inspected cue: {receiptStrongestCue}.</p>
            ) : null}
          </div>
          <div className="prediction-list">
            {confusionTwinChoices.map((candidate) => (
              <article key={candidate.id} className="prediction-card">
                <div className="split-line">
                  <div>
                    <h3 className="title-md">{candidate.label}</h3>
                    <span className="source-badge" data-source={candidate.source}>
                      {candidate.source}
                    </span>
                  </div>
                  <strong className="mono">{Math.round(candidate.confidence * 100)}%</strong>
                </div>
                <p className="body-sm">
                  {candidate.metadata.demoDisclaimer ?? candidate.metadata.notes}
                </p>
                <div className="button-row">
                  <button
                    type="button"
                    className="button-soft"
                    onClick={() => onConfirmConfusionChoice(candidate, saveConsent)}
                    aria-label={`Confirm ${candidate.label} as intended candidate`}
                  >
                    That one
                  </button>
                  <button
                    type="button"
                    className="button-ghost"
                    onClick={() => onConfirmConfusionChoice(candidate, false)}
                    aria-label={`Use ${candidate.label} once without saving contrastive repair`}
                  >
                    {"Use once, don't save"}
                  </button>
                </div>
              </article>
            ))}
          </div>
          <div className="button-row">
            {decision?.recommendedActions.includes("teach-personal-sign") ? (
              <Link
                href={teachHref}
                className="button-ghost"
                aria-label="Open Teach Mode for a personal sign"
              >
                Teach as personal sign
              </Link>
            ) : null}
            <button
              type="button"
              className="button-ghost"
              onClick={onClearConfusionMemory}
              aria-label="Clear local Confusion Twin repair memory for current candidate set"
              disabled={!canClearConfusionMemory}
            >
              Clear this repair memory
            </button>
          </div>
        </div>
      ) : null}

      {!confusionTwinActive && secondaryActions.length ? (
        <div className="repair-actions">
          {secondaryActions.map((action) => (
            <button
              key={action}
              type="button"
              className="button-soft"
              onClick={() => onAction(action)}
              aria-label={`Repair action: ${LABELS[action]}`}
            >
              {LABELS[action]}
            </button>
          ))}
        </div>
      ) : null}

      <label className="checkbox-row" htmlFor="save-consent">
        <input
          id="save-consent"
          type="checkbox"
          checked={saveConsent}
          onChange={(event) => onSaveConsentChange(event.target.checked)}
          aria-label={
            confusionTwinActive
              ? "Save this contrastive repair locally"
              : "Allow saving landmark-derived confirmation data on this device"
          }
        />
        <span>
          {confusionTwinActive
            ? "Save this contrastive repair locally. Stores landmark-derived features only."
            : "Save confirmed correction locally. Default storage is landmark sequence and derived features only."}
        </span>
      </label>

      {showFingerspellForm ? (
        <div className="field-group">
          <label className="field-label" htmlFor="fingerspell-word">
            Intended word after fingerspelling
          </label>
          <input
            id="fingerspell-word"
            className="text-input"
            value={fingerspellValue}
            onChange={(event) => onFingerspellValueChange(event.target.value)}
            placeholder="Type confirmed word"
            aria-label="Type intended word after fingerspelling"
          />
          <button
            type="button"
            className="button"
            onClick={onFingerspellSubmit}
            disabled={!fingerspellValue.trim()}
            aria-label="Confirm typed word after fingerspelling"
          >
            Confirm fingerspelled word
          </button>
        </div>
      ) : null}

      {!confusionTwinActive && decision?.recommendedActions.includes("teach-personal-sign") ? (
        <Link
          href={teachHref}
          className="button-ghost"
          aria-label="Open Teach Mode for a personal sign"
        >
          Teach as personal sign
        </Link>
      ) : null}
    </section>
  );
}
