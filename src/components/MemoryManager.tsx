"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  evidenceHealthCounts,
  evidenceHealthStatusLabel,
  evidenceHealthSummaryKey,
  type EvidenceHealthReport,
  type MemoryHealthSummary,
} from "@/lib/evidence-health/EvidenceHealth";
import { evidenceHealthSummaryMap } from "@/lib/evidence-health/EvidenceHealthAnalyzer";
import MotionReceiptViewer from "@/components/MotionReceiptViewer";
import { cuePatchKindLabel } from "@/lib/repair/CuePatch";
import { assertNoRawVideoFields } from "@/lib/privacy/assertNoRawVideoFields";
import {
  type PersonalSignRecord,
  type SavedMotionReceiptRecord,
  type SignRepairExport,
  type VerificationReportRecord,
  LocalDataStore,
  localDataStore,
} from "@/lib/privacy/LocalDataStore";
import type { MinimalPairCard } from "@/lib/minimal-pairs/MinimalPair";
import {
  strongestChannelDelta,
  type ConfusionPair,
} from "@/lib/recognition/ContrastiveMemory";
import { strongestDifferenceLabel } from "@/lib/features/ChannelDeltaAnalyzer";
import { receiptChannelLabel, strongestReceiptChannelLabel } from "@/lib/receipts/MotionReceipt";
import { PrototypeStore, prototypeStore } from "@/lib/recognition/PrototypeStore";
import {
  SIGN_FORM_SLOT_ORDER,
  signFormSlotTitle,
  type SignFormNotes,
} from "@/lib/signform/SignFormLedger";

interface MemoryManagerProps {
  dataStore?: LocalDataStore;
  prototypeStoreInstance?: PrototypeStore;
}

function summaryReason(summary: MemoryHealthSummary | undefined) {
  return summary?.reasons[0] ?? null;
}

export default function MemoryManager({
  dataStore = localDataStore,
  prototypeStoreInstance = prototypeStore,
}: MemoryManagerProps) {
  const [personalSigns, setPersonalSigns] = useState<PersonalSignRecord[]>([]);
  const [confusionPairs, setConfusionPairs] = useState<ConfusionPair[]>([]);
  const [minimalPairCards, setMinimalPairCards] = useState<MinimalPairCard[]>([]);
  const [savedReceipts, setSavedReceipts] = useState<SavedMotionReceiptRecord[]>([]);
  const [selectedReceipt, setSelectedReceipt] = useState<SavedMotionReceiptRecord | null>(null);
  const [exportState, setExportState] = useState<SignRepairExport | null>(null);
  const [evidenceHealthReport, setEvidenceHealthReport] = useState<EvidenceHealthReport | null>(
    null,
  );
  const [verificationReports, setVerificationReports] = useState<VerificationReportRecord[]>([]);
  const [draftNotes, setDraftNotes] = useState<Record<string, SignFormNotes>>({});
  const [minimalPairNotes, setMinimalPairNotes] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState(
    "Local data review. Delete or export anything from this device.",
  );

  const reload = async () => {
    const report = await prototypeStoreInstance.generateEvidenceHealthReport();
    const [signs, exported, pairs, receipts, minimalPairs, reports] = await Promise.all([
      dataStore.listPersonalSigns(),
      prototypeStoreInstance.export(),
      prototypeStoreInstance.loadConfusionPairs(),
      prototypeStoreInstance.loadReceipts(),
      prototypeStoreInstance.loadMinimalPairCards(),
      prototypeStoreInstance.loadVerificationReports(),
    ]);

    setPersonalSigns(signs);
    setExportState(exported);
    setEvidenceHealthReport(report);
    setConfusionPairs(pairs);
    setSavedReceipts(receipts);
    setMinimalPairCards(minimalPairs);
    setVerificationReports(reports);
    setDraftNotes((current) => {
      const next = { ...current };

      for (const sign of signs) {
        next[sign.id] = {
          ...(sign.metadata.signFormNotes ?? {}),
          ...(current[sign.id] ?? {}),
        };
      }

      return next;
    });
    setMinimalPairNotes((current) => {
      const next = { ...current };

      for (const card of minimalPairs) {
        next[card.id] = current[card.id] ?? card.userNotes;
      }

      return next;
    });
    if (selectedReceipt) {
      setSelectedReceipt(
        receipts.find((receipt) => receipt.id === selectedReceipt.id) ?? null,
      );
    }
  };

  useEffect(() => {
    let active = true;

    void (async () => {
      const report = await prototypeStoreInstance.generateEvidenceHealthReport();
      const [signs, exported, pairs, receipts, minimalPairs, reports] = await Promise.all([
        dataStore.listPersonalSigns(),
        prototypeStoreInstance.export(),
        prototypeStoreInstance.loadConfusionPairs(),
        prototypeStoreInstance.loadReceipts(),
        prototypeStoreInstance.loadMinimalPairCards(),
        prototypeStoreInstance.loadVerificationReports(),
      ]);

      if (!active) {
        return;
      }

      setPersonalSigns(signs);
      setExportState(exported);
      setEvidenceHealthReport(report);
      setConfusionPairs(pairs);
      setSavedReceipts(receipts);
      setMinimalPairCards(minimalPairs);
      setVerificationReports(reports);
      setDraftNotes((current) => {
        const next = { ...current };

        for (const sign of signs) {
          next[sign.id] = {
            ...(sign.metadata.signFormNotes ?? {}),
            ...(current[sign.id] ?? {}),
          };
        }

        return next;
      });
      setMinimalPairNotes((current) => {
        const next = { ...current };

        for (const card of minimalPairs) {
          next[card.id] = current[card.id] ?? card.userNotes;
        }

        return next;
      });
    })();

    return () => {
      active = false;
    };
  }, [dataStore, prototypeStoreInstance]);

  const downloadExport = async () => {
    const exported = await prototypeStoreInstance.export();
    assertNoRawVideoFields(exported);
    const blob = new Blob([JSON.stringify(exported, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `signrepair-export-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);

    setExportState(exported);
    setStatusMessage("Export created from local IndexedDB state.");
  };

  const downloadReceipt = (receipt: SavedMotionReceiptRecord) => {
    assertNoRawVideoFields(receipt);
    const blob = new Blob([JSON.stringify(receipt, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `signrepair-motion-receipt-${receipt.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStatusMessage("Saved motion receipt exported from local storage.");
  };

  const downloadMinimalPairCard = (card: MinimalPairCard) => {
    assertNoRawVideoFields(card);
    const blob = new Blob([JSON.stringify(card, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `signrepair-minimal-pair-${card.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStatusMessage("Minimal Pair Lab card exported from local storage.");
  };

  const downloadVerificationReport = (report: VerificationReportRecord) => {
    assertNoRawVideoFields(report);
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `signrepair-verification-${report.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStatusMessage("Verification report exported from local storage.");
  };

  const deleteSign = async (id: string) => {
    await prototypeStoreInstance.deletePersonalSign(id);
    setDraftNotes((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    await reload();
    setStatusMessage("Deleted personal sign from local storage.");
  };

  const updateDraftNote = (
    id: string,
    slot: keyof SignFormNotes,
    value: string,
  ) => {
    setDraftNotes((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? {}),
        [slot]: value,
      },
    }));
  };

  const saveSignFormNotes = async (id: string) => {
    const nextNotes = Object.fromEntries(
      Object.entries(draftNotes[id] ?? {}).filter(([, value]) => value?.trim()),
    ) as SignFormNotes;

    await prototypeStoreInstance.updatePersonalSignNotes(id, nextNotes);
    await reload();
    setStatusMessage("Saved local sign-form notes for personal sign.");
  };

  const clearSignFormNotes = async (id: string) => {
    setDraftNotes((current) => ({
      ...current,
      [id]: {},
    }));
    await prototypeStoreInstance.updatePersonalSignNotes(id, {});
    await reload();
    setStatusMessage("Cleared local sign-form notes for personal sign.");
  };

  const deleteConfusionPair = async (id: string) => {
    await prototypeStoreInstance.deleteConfusionPair(id);
    await reload();
    setStatusMessage("Deleted local Confusion Twin repair.");
  };

  const updateMinimalPairNote = (id: string, value: string) => {
    setMinimalPairNotes((current) => ({
      ...current,
      [id]: value,
    }));
  };

  const saveMinimalPairNote = async (id: string) => {
    await prototypeStoreInstance.updateMinimalPairNotes(id, minimalPairNotes[id]?.trim() ?? "");
    await reload();
    setStatusMessage("Saved local notes for Minimal Pair Lab card.");
  };

  const deleteMinimalPairCard = async (id: string) => {
    await prototypeStoreInstance.deleteMinimalPairCard(id);
    setMinimalPairNotes((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    await reload();
    setStatusMessage("Deleted Minimal Pair Lab card.");
  };

  const deleteReceipt = async (id: string) => {
    await prototypeStoreInstance.deleteReceipt(id);
    if (selectedReceipt?.id === id) {
      setSelectedReceipt(null);
    }
    await reload();
    setStatusMessage("Deleted saved motion receipt.");
  };

  const deleteVerificationReport = async (id: string) => {
    await prototypeStoreInstance.deleteVerificationReport(id);
    await reload();
    setStatusMessage("Deleted benchmark verification report.");
  };

  const clearAll = async () => {
    if (!window.confirm("Clear all local SignRepair data from this browser?")) {
      return;
    }

    await prototypeStoreInstance.clearAll();
    await reload();
    setStatusMessage("All local SignRepair data cleared.");
  };

  const healthSummaries = evidenceHealthSummaryMap(evidenceHealthReport);
  const healthCounts = evidenceHealthCounts(evidenceHealthReport);

  return (
    <section className="page-shell">
      <div className="memory-grid">
        <div className="panel section-stack">
          <span className="eyebrow">Memory</span>
          <h1 className="title-lg">Export, delete, and inspect saved local data.</h1>
          <p className="body-sm">
            Export, delete, and inspect saved local landmark-derived data on this device.
          </p>
          <div className="info-box">
            <strong>Personal memory vs benchmark evaluation</strong>
            <p className="body-sm">
              Personal signs, Confusion Twin repairs, and Minimal Pair cards are local adaptation
              memory. Verification reports are benchmark snapshots against expected human
              reference.
            </p>
          </div>
          <p className="body-sm" aria-live="polite">
            {statusMessage}
          </p>

          <div className="memory-list">
            <div className="split-line">
              <h2 className="title-md">Personal signs</h2>
              <span className="badge">{personalSigns.length}</span>
            </div>
            <p className="body-sm">
              Stores landmark-derived examples, local prototype summaries, and optional sign-form
              notes on this device.
            </p>
            {personalSigns.length ? (
              personalSigns.map((sign) => (
                <article key={sign.id} className="memory-card">
                  {(() => {
                    const healthSummary = healthSummaries.get(
                      evidenceHealthSummaryKey("personal-sign", sign.id),
                    );

                    return healthSummary ? (
                      <div className="split-line">
                        <span className="status-pill">
                          {evidenceHealthStatusLabel(healthSummary.status)}
                        </span>
                        <span className="caption">{summaryReason(healthSummary)}</span>
                      </div>
                    ) : null;
                  })()}
                  <div className="split-line">
                    <div>
                      <h2 className="title-md">{sign.label}</h2>
                      <p className="caption">
                        {sign.examples.length} example{sign.examples.length === 1 ? "" : "s"} /
                        updated {new Date(sign.updatedAt).toLocaleString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="button-soft"
                      onClick={() => void deleteSign(sign.id)}
                      aria-label={`Delete personal sign ${sign.label}`}
                    >
                      Delete
                    </button>
                  </div>
                    <p className="body-sm">
                      {sign.metadata.notes ??
                        "Landmark-only prototype stored for personal or dialect sign."}
                    </p>
                    {(() => {
                      const healthSummary = healthSummaries.get(
                        evidenceHealthSummaryKey("personal-sign", sign.id),
                      );

                      return healthSummary?.recommendedAction.targetRoute ? (
                        <Link
                          href={healthSummary.recommendedAction.targetRoute}
                          className="button-soft"
                        >
                          {healthSummary.recommendedAction.title}
                        </Link>
                      ) : null;
                    })()}
                  <div className="section-stack">
                    <strong>Local form notes</strong>
                    <p className="caption">These notes are for your local memory only.</p>
                    <div className="receipt-grid">
                      {SIGN_FORM_SLOT_ORDER.map((slot) => (
                        <div key={`${sign.id}-${slot}`} className="field-group">
                          <label className="field-label" htmlFor={`${sign.id}-${slot}`}>
                            {signFormSlotTitle(slot)}
                          </label>
                          <input
                            id={`${sign.id}-${slot}`}
                            className="text-input"
                            value={draftNotes[sign.id]?.[slot] ?? ""}
                            onChange={(event) =>
                              updateDraftNote(sign.id, slot, event.target.value)
                            }
                            placeholder={`Optional ${signFormSlotTitle(slot).toLowerCase()} note`}
                            aria-label={`${signFormSlotTitle(slot)} note for ${sign.label}`}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="button-row">
                      <button
                        type="button"
                        className="button-soft"
                        onClick={() => void saveSignFormNotes(sign.id)}
                        aria-label={`Save sign-form notes for ${sign.label}`}
                      >
                        Save notes
                      </button>
                      <button
                        type="button"
                        className="button-ghost"
                        onClick={() => void clearSignFormNotes(sign.id)}
                        aria-label={`Clear sign-form notes for ${sign.label}`}
                      >
                        Clear notes
                      </button>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="empty-state">
                No saved personal signs yet. Use Teach to add landmark-only local examples, then
                review them here.
                <div className="button-row">
                  <Link href="/teach" className="button-soft">
                    Go to Teach
                  </Link>
                </div>
              </div>
            )}
          </div>

          <section className="section-stack">
            <div className="split-line">
              <h2 className="title-md">Confusion Twin repairs</h2>
              <span className="badge">{confusionPairs.length}</span>
            </div>
            <p className="body-sm">
              Stores local repair memory for repeated near-miss known candidates. Landmark-derived
              features only.
            </p>
            <div className="memory-list">
              {confusionPairs.length ? (
                confusionPairs.map((pair) => (
                  <article key={pair.id} className="memory-card">
                    {(() => {
                      const healthSummary = healthSummaries.get(
                        evidenceHealthSummaryKey("confusion-twin", pair.id),
                      );

                      return healthSummary ? (
                        <div className="split-line">
                          <span className="status-pill">
                            {evidenceHealthStatusLabel(healthSummary.status)}
                          </span>
                          <span className="caption">{summaryReason(healthSummary)}</span>
                        </div>
                      ) : null;
                    })()}
                    <div className="split-line">
                      <div>
                        <h3 className="title-md">
                          {pair.intendedLabel} vs {pair.confusedLabel}
                        </h3>
                        <p className="caption">
                          {pair.count} save{pair.count === 1 ? "" : "s"} /
                          strongest {strongestDifferenceLabel(strongestChannelDelta(pair))} /
                          updated {new Date(pair.updatedAt).toLocaleString()}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="button-soft"
                        onClick={() => void deleteConfusionPair(pair.id)}
                        aria-label={`Delete Confusion Twin repair ${pair.intendedLabel} versus ${pair.confusedLabel}`}
                      >
                        Delete
                      </button>
                    </div>
                    <p className="body-sm">
                      {pair.channelDeltas[0]?.explanation ??
                        "Local contrastive repair memory stored from user confirmation."}
                    </p>
                    {(() => {
                      const healthSummary = healthSummaries.get(
                        evidenceHealthSummaryKey("confusion-twin", pair.id),
                      );

                      return healthSummary?.recommendedAction.targetRoute ? (
                        <Link
                          href={healthSummary.recommendedAction.targetRoute}
                          className="button-soft"
                        >
                          {healthSummary.recommendedAction.title}
                        </Link>
                      ) : null;
                    })()}
                  </article>
                ))
              ) : (
                <div className="empty-state">
                  No Confusion Twin repairs saved yet. Ambiguous repairs appear here after you
                  confirm and save local repair memory in Live.
                  <div className="button-row">
                    <Link href="/live" className="button-soft">
                      Open Live
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="section-stack">
            <div className="split-line">
              <h2 className="title-md">Minimal Pair Lab cards</h2>
              <span className="badge">{minimalPairCards.length}</span>
            </div>
            <p className="body-sm">
              Stores landmark-derived contrast cards, example summaries, and editable local notes
              for confusing candidate pairs.
            </p>
            <div className="memory-list">
              {minimalPairCards.length ? (
                minimalPairCards.map((card) => (
                  <article key={card.id} className="memory-card">
                    {(() => {
                      const healthSummary = healthSummaries.get(
                        evidenceHealthSummaryKey("minimal-pair-card", card.id),
                      );

                      return healthSummary ? (
                        <div className="split-line">
                          <span className="status-pill">
                            {evidenceHealthStatusLabel(healthSummary.status)}
                          </span>
                          <span className="caption">{summaryReason(healthSummary)}</span>
                        </div>
                      ) : null;
                    })()}
                    <div className="split-line">
                      <div>
                        <h3 className="title-md">
                          {card.candidateA.label} vs {card.candidateB.label}
                        </h3>
                        <p className="caption">
                          {card.examplesA.length} A examples / {card.examplesB.length} B examples /
                          updated {new Date(card.updatedAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <p className="body-sm">{card.signFormContrast.explanation}</p>
                    <div className="receipt-summary-list">
                      <p className="caption">
                        Strongest slot difference:{" "}
                        {card.signFormContrast.strongestSlotDifference
                          ? signFormSlotTitle(
                              card.signFormContrast.strongestSlotDifference.slot,
                            )
                          : "none singled out"}
                      </p>
                      <p className="caption">
                        Strongest channel:{" "}
                        {card.channelContrast.strongestChannel
                          ? receiptChannelLabel(card.channelContrast.strongestChannel.channel)
                          : "none singled out"}
                      </p>
                      <p className="caption">
                        Repair hint:{" "}
                        {card.repairHints[0]
                          ? cuePatchKindLabel(card.repairHints[0].cuePatchKind)
                          : "none singled out"}
                      </p>
                    </div>
                    <div className="field-group">
                      <label className="field-label" htmlFor={`minimal-pair-note-${card.id}`}>
                        Local notes
                      </label>
                      <textarea
                        id={`minimal-pair-note-${card.id}`}
                        className="textarea"
                        value={minimalPairNotes[card.id] ?? ""}
                        onChange={(event) => updateMinimalPairNote(card.id, event.target.value)}
                        placeholder="Optional local note for this contrast card"
                        aria-label={`Local notes for minimal pair ${card.candidateA.label} versus ${card.candidateB.label}`}
                      />
                    </div>
                    <div className="button-row">
                      <button
                        type="button"
                        className="button-soft"
                        onClick={() => void saveMinimalPairNote(card.id)}
                        aria-label={`Save notes for minimal pair ${card.candidateA.label} versus ${card.candidateB.label}`}
                      >
                        Save notes
                      </button>
                      <button
                        type="button"
                        className="button-ghost"
                        onClick={() => downloadMinimalPairCard(card)}
                        aria-label={`Export minimal pair card ${card.candidateA.label} versus ${card.candidateB.label}`}
                      >
                        Export
                      </button>
                      <button
                        type="button"
                        className="button-ghost"
                        onClick={() => void deleteMinimalPairCard(card.id)}
                        aria-label={`Delete minimal pair card ${card.candidateA.label} versus ${card.candidateB.label}`}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="empty-state">
                  No Minimal Pair Lab cards yet. Repeated Confusion Twin pairs can be reviewed
                  here after you save landmark-only contrast card.
                  <div className="button-row">
                    <Link href="/minimal-pair" className="button-soft">
                      Open Minimal Pair Lab
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="section-stack">
            <div className="split-line">
              <h2 className="title-md">Saved motion receipts</h2>
              <span className="badge">{savedReceipts.length}</span>
            </div>
            <p className="body-sm">
              Stores landmark-only replay, Translation Debt, cue patch summaries, and coarse
              sign-form evidence when you explicitly save it.
            </p>
            <div className="memory-list">
              {savedReceipts.length ? (
                savedReceipts.map((receipt) => (
                  <article key={receipt.id} className="memory-card">
                    {(() => {
                      const healthSummary = healthSummaries.get(
                        evidenceHealthSummaryKey("motion-receipt", receipt.id),
                      );

                      return healthSummary ? (
                        <div className="split-line">
                          <span className="status-pill">
                            {evidenceHealthStatusLabel(healthSummary.status)}
                          </span>
                          <span className="caption">{summaryReason(healthSummary)}</span>
                        </div>
                      ) : null;
                    })()}
                    <div className="split-line">
                      <div>
                        <h3 className="title-md">
                          {receipt.candidateSummary.topLabel ?? "No accepted label"}
                        </h3>
                        <p className="caption">
                          {new Date(receipt.createdAt).toLocaleString()} / {receipt.mode} /
                          debt {receipt.translationDebt.label} / strongest{" "}
                          {strongestReceiptChannelLabel(receipt)}
                        </p>
                      </div>
                    </div>
                    <p className="body-sm">
                      {receipt.uncertaintySummary.reason}
                    </p>
                    {receipt.signFormLedger ? (
                      <div className="receipt-summary-list">
                        <p className="caption">
                          SignForm: {receipt.signFormLedger.slots.handshape.valueLabel} /{" "}
                          {receipt.signFormLedger.slots.location.valueLabel} /{" "}
                          {receipt.signFormLedger.slots.movement.valueLabel}
                        </p>
                        <p className="caption">
                          Missing slots:{" "}
                          {receipt.signFormLedger.missingSlots.length
                            ? receipt.signFormLedger.missingSlots
                                .map((slot) => signFormSlotTitle(slot))
                                .join(", ")
                            : "none"}
                        </p>
                      </div>
                    ) : null}
                    {receipt.cuePatch?.prompt ? (
                      <p className="caption">
                        Cue Patch: {receipt.cuePatch.prompt.kind}
                        {receipt.cuePatch.result?.improvedChannels.length
                          ? ` / improved ${receipt.cuePatch.result.improvedChannels.join(", ")}`
                          : ""}
                      </p>
                    ) : null}
                    {receipt.cuePatch?.comparison ? (
                      <p className="caption">
                        Before {Math.round(receipt.cuePatch.comparison.before.visibilityScore * 100)}%
                        visibility / after{" "}
                        {Math.round(receipt.cuePatch.comparison.after.visibilityScore * 100)}%
                        visibility
                      </p>
                    ) : null}
                    {receipt.relatedMinimalPairCards?.length ? (
                      <p className="caption">
                        Minimal Pair: {receipt.relatedMinimalPairCards[0]?.labelA} vs{" "}
                        {receipt.relatedMinimalPairCards[0]?.labelB}
                      </p>
                    ) : null}
                    {receipt.signFormLedger
                      ? (() => {
                          const ledgerSummary = healthSummaries.get(
                            evidenceHealthSummaryKey("signform-ledger", receipt.signFormLedger.id),
                          );

                          return ledgerSummary ? (
                            <p className="caption">
                              SignForm health: {evidenceHealthStatusLabel(ledgerSummary.status)}.
                              {" "}
                              {summaryReason(ledgerSummary)}
                            </p>
                          ) : null;
                        })()
                      : null}
                    <div className="button-row">
                      <button
                        type="button"
                        className="button-soft"
                        onClick={() => setSelectedReceipt(receipt)}
                        aria-label={`View saved motion receipt ${receipt.id}`}
                      >
                        View
                      </button>
                      <button
                        type="button"
                        className="button-ghost"
                        onClick={() => downloadReceipt(receipt)}
                        aria-label={`Export saved motion receipt ${receipt.id}`}
                      >
                        Export
                      </button>
                      <button
                        type="button"
                        className="button-ghost"
                        onClick={() => void deleteReceipt(receipt.id)}
                        aria-label={`Delete saved motion receipt ${receipt.id}`}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="empty-state">
                  No saved motion receipts. Live receipts stay temporary unless you save them
                  locally from Live.
                  <div className="button-row">
                    <Link href="/live" className="button-soft">
                      Open Live
                    </Link>
                  </div>
                </div>
              )}
            </div>
            {selectedReceipt ? (
              <MotionReceiptViewer
                key={selectedReceipt.id}
                receipt={selectedReceipt}
                onDiscard={() => setSelectedReceipt(null)}
                discardLabel="Close receipt"
              />
            ) : null}
          </section>

          <section className="section-stack">
            <div className="split-line">
              <h2 className="title-md">Benchmark evaluations</h2>
              <span className="badge">{verificationReports.length}</span>
            </div>
            <p className="body-sm">
              Stores benchmark verification JSON reports with segment timeline, exact model output,
              alternatives, debt, and match results. Landmark-derived only.
            </p>
            <div className="memory-list">
              {verificationReports.length ? (
                verificationReports.map((report) => (
                  <article key={report.id} className="memory-card">
                    <div className="split-line">
                      <div>
                        <h3 className="title-md">{report.clipName}</h3>
                        <p className="caption">
                          {new Date(report.createdAt).toLocaleString()} / {report.summary.segmentsProcessed} segments /{" "}
                          {report.summary.uncertainSegments} uncertain
                        </p>
                      </div>
                      <span className="status-pill">{report.mode}</span>
                    </div>
                    <p className="body-sm">{report.modelOutputTranscript || "No stable output."}</p>
                    <div className="receipt-summary-list">
                      <p className="caption">Expected reference: {report.expectedTranscript}</p>
                      <p className="caption">
                        Match summary: {report.summary.exactCount} exact / {report.summary.partialCount} partial /{" "}
                        {report.summary.outOfCoverageCount} out-of-coverage / {report.summary.mismatchCount} mismatch
                      </p>
                      <p className="caption">
                        Concept summary: {report.conceptSummary.conceptMatchCount} match /{" "}
                        {report.conceptSummary.conceptPartialCount} partial /{" "}
                        {Math.round(report.conceptSummary.conceptCoverageRate * 100)}% coverage /{" "}
                        pack {report.vocabularyPack.label}
                      </p>
                      <p className="caption">
                        Candidate set size {report.candidateSetSize} / raw video stored{" "}
                        {report.privacy.rawVideoStored ? "yes" : "no"}
                      </p>
                    </div>
                    <div className="button-row">
                      <button
                        type="button"
                        className="button-ghost"
                        onClick={() => downloadVerificationReport(report)}
                        aria-label={`Export verification report ${report.clipName}`}
                      >
                        Export
                      </button>
                      <button
                        type="button"
                        className="button-ghost"
                        onClick={() => void deleteVerificationReport(report.id)}
                        aria-label={`Delete verification report ${report.clipName}`}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="empty-state">
                  No benchmark evaluations saved yet. Use Verify to process clip, compare model
                  output against expected reference, then save report locally.
                  <div className="button-row">
                    <Link href="/verify" className="button-soft">
                      Open Verify
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="section-stack">
            <div className="split-line">
              <h2 className="title-md">Evidence Health report</h2>
              <span className="status-pill">
                {evidenceHealthStatusLabel(evidenceHealthReport?.overallStatus ?? "unknown")}
              </span>
            </div>
            <p className="body-sm">
              Stores latest local evidence-quality report for this prototype. Landmark-derived only.
              Not an accuracy score.
            </p>
            <div className="stats-grid">
              <div className="prediction-card">
                <span className="caption">Healthy</span>
                <strong className="mono">{healthCounts.healthy}</strong>
              </div>
              <div className="prediction-card">
                <span className="caption">Watch</span>
                <strong className="mono">{healthCounts.watch}</strong>
              </div>
              <div className="prediction-card">
                <span className="caption">Needs review</span>
                <strong className="mono">{healthCounts["needs-review"]}</strong>
              </div>
            </div>
            <div className="memory-list">
              {evidenceHealthReport?.recommendedActions.length ? (
                evidenceHealthReport.recommendedActions.slice(0, 5).map((action) => (
                  <article
                    key={`${action.id}-${action.targetId ?? action.title}`}
                    className="memory-card"
                  >
                    <div className="split-line">
                      <strong>{action.title}</strong>
                      <span className="status-pill">{action.id}</span>
                    </div>
                    <p className="body-sm">{action.instruction}</p>
                    {action.targetRoute ? (
                      <Link href={action.targetRoute} className="button-soft">
                        Open action
                      </Link>
                    ) : null}
                  </article>
                ))
              ) : (
                <div className="empty-state">
                  No local health actions yet. Evidence Health updates as local memories grow.
                  <div className="button-row">
                    <Link href="/evidence-health" className="button-soft">
                      Open Evidence Health
                    </Link>
                  </div>
                </div>
              )}
            </div>
            {evidenceHealthReport?.driftWarnings.length ? (
              <div className="info-box">
                <strong>Drift warnings</strong>
                <p className="body-sm">{evidenceHealthReport.driftWarnings[0]?.reason}</p>
              </div>
            ) : null}
            {evidenceHealthReport?.coverageGaps.length ? (
              <div className="info-box">
                <strong>Coverage gaps</strong>
                <p className="body-sm">{evidenceHealthReport.coverageGaps[0]?.why}</p>
              </div>
            ) : null}
            <Link href="/evidence-health" className="button-soft">
              Open Evidence Health
            </Link>
          </section>
        </div>

        <aside className="section-stack">
          <section className="panel section-stack">
            <h2 className="title-md">Local data summary</h2>
            <div className="stats-grid">
              <div className="prediction-card">
                <span className="caption">Personal signs</span>
                <strong className="mono">{personalSigns.length}</strong>
              </div>
              <div className="prediction-card">
                <span className="caption">Confusion Twin repairs</span>
                <strong className="mono">{confusionPairs.length}</strong>
              </div>
              <div className="prediction-card">
                <span className="caption">Correction logs</span>
                <strong className="mono">{exportState?.corrections.length ?? 0}</strong>
              </div>
              <div className="prediction-card">
                <span className="caption">Minimal Pair cards</span>
                <strong className="mono">{minimalPairCards.length}</strong>
              </div>
              <div className="prediction-card">
                <span className="caption">Saved motion receipts</span>
                <strong className="mono">{savedReceipts.length}</strong>
              </div>
              <div className="prediction-card">
                <span className="caption">Benchmark evaluations</span>
                <strong className="mono">{verificationReports.length}</strong>
              </div>
              <div className="prediction-card">
                <span className="caption">Evidence Health</span>
                <strong className="mono">
                  {evidenceHealthStatusLabel(evidenceHealthReport?.overallStatus ?? "unknown")}
                </strong>
              </div>
              <div className="prediction-card">
                <span className="caption">Settings stored</span>
                <strong className="mono">{exportState?.settings.length ?? 0}</strong>
              </div>
            </div>
          </section>

          <section className="panel section-stack">
            <h2 className="title-md">Export / Clear all</h2>
            <div className="memory-actions">
              <button
                type="button"
                className="button"
                onClick={() => void downloadExport()}
                aria-label="Export all local SignRepair data"
              >
                Export local data
              </button>
              <button
                type="button"
                className="button-ghost"
                onClick={() => void clearAll()}
                aria-label="Clear all local SignRepair data from this browser"
              >
                Clear all data
              </button>
            </div>
            <p className="body-sm">
              Export contains settings, saved prototypes, correction history, and Confusion Twin
              repairs. Minimal Pair Lab cards and saved motion receipts stay landmark-only,
              including Cue Patch and SignForm Ledger metadata. Personal sign-form notes stay
              local text only. Evidence Health report stays local and is not an accuracy
              certificate. Raw video is not included.
            </p>
          </section>
        </aside>
      </div>
    </section>
  );
}
