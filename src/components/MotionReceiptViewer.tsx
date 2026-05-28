"use client";

import { useEffect, useMemo, useState } from "react";
import { assertNoRawVideoFields } from "@/lib/privacy/assertNoRawVideoFields";
import type { MotionReceipt, ReceiptPoint } from "@/lib/receipts/MotionReceipt";
import { receiptChannelLabel } from "@/lib/receipts/MotionReceipt";
import { cuePatchKindLabel } from "@/lib/repair/CuePatch";
import {
  SIGN_FORM_SLOT_ORDER,
  listWeakOrMissingSignFormSlots,
  signFormSlotBadge,
  signFormSlotTitle,
} from "@/lib/signform/SignFormLedger";

interface MotionReceiptViewerProps {
  receipt: MotionReceipt;
  onDiscard: () => void;
  onSave?: (receipt: MotionReceipt) => void | Promise<void>;
  saveDisabled?: boolean;
  saveStatus?: string | null;
  discardLabel?: string;
}

type ReceiptSpeed = 0 | 0.5 | 1;

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function drawPoints(points: ReceiptPoint[], radius: number) {
  return points.map((point, index) => (
    <circle key={`${point[0]}-${point[1]}-${index}`} cx={point[0] * 100} cy={point[1] * 100} r={radius} />
  ));
}

function drawPolyline(points: ReceiptPoint[], close = false) {
  if (points.length < 2) {
    return null;
  }

  const path = points
    .map((point) => `${point[0] * 100},${point[1] * 100}`)
    .join(" ");

  return <polyline points={path} fill={close ? "rgba(31, 122, 130, 0.08)" : "none"} />;
}

function downloadReceipt(receipt: MotionReceipt) {
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
}

function formatMinimalPairSlot(slot: string) {
  if (slot === "none singled out") {
    return slot;
  }

  return signFormSlotTitle(slot as Parameters<typeof signFormSlotTitle>[0]);
}

function formatMinimalPairChannel(channel: string) {
  if (channel === "none singled out") {
    return channel;
  }

  return receiptChannelLabel(
    channel as Parameters<typeof receiptChannelLabel>[0],
  );
}

function formatMinimalPairHint(kind: string) {
  if (kind === "none singled out") {
    return kind;
  }

  return cuePatchKindLabel(kind as Parameters<typeof cuePatchKindLabel>[0]);
}

export default function MotionReceiptViewer({
  receipt,
  onDiscard,
  onSave,
  saveDisabled = false,
  saveStatus,
  discardLabel = "Discard receipt",
}: MotionReceiptViewerProps) {
  const [frameIndex, setFrameIndex] = useState(0);
  const [speed, setSpeed] = useState<ReceiptSpeed>(0);
  const [showHands, setShowHands] = useState(true);
  const [showMouth, setShowMouth] = useState(true);
  const [showFace, setShowFace] = useState(false);
  const [showPose, setShowPose] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);

  useEffect(() => {
    if (speed === 0 || receipt.replayFrames.length < 2) {
      return;
    }

    const interval = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % receipt.replayFrames.length);
    }, speed === 0.5 ? 420 : 220);

    return () => {
      window.clearInterval(interval);
    };
  }, [receipt.replayFrames.length, speed]);

  const currentFrame = receipt.replayFrames[frameIndex] ?? receipt.replayFrames[0];
  const strongestChannels = useMemo(
    () => receipt.channelSummary.strongestChannels.slice(0, 3),
    [receipt.channelSummary.strongestChannels],
  );
  const signFormLedger = receipt.signFormLedger;
  const weakOrMissingSlots = useMemo(
    () => listWeakOrMissingSignFormSlots(signFormLedger, 4),
    [signFormLedger],
  );
  const cuePatchPrompt = receipt.cuePatch?.prompt ?? null;
  const cuePatchResult = receipt.cuePatch?.result ?? null;
  const cuePatchComparison = receipt.cuePatch?.comparison ?? null;

  return (
    <section className="panel section-stack" aria-label="Motion Replay Receipt">
      <div className="split-line">
        <div className="section-stack">
          <span className="eyebrow">Motion Replay Receipt</span>
        </div>
        <span className="badge">
          {receipt.mode} / {receipt.source}
        </span>
      </div>

      <section className="info-box">
        <strong>Privacy notice</strong>
        <p className="body-sm">
          This replay uses landmark-derived skeleton data only. It is not raw video.
        </p>
        <p className="caption">
          This receipt is inspectability only. It is not linguistic authority.
        </p>
      </section>

      <section className="prediction-card section-stack">
        <strong>Decision summary</strong>
        <h2 className="title-md">{receipt.candidateSummary.topLabel ?? "No accepted label"}</h2>
        <p className="body-sm">
          Decision {receipt.uncertaintySummary.decision} / reason {receipt.uncertaintySummary.reason}
        </p>
        <p className="caption">
          Top confidence {formatPercent(receipt.candidateSummary.topConfidence)} / accepted by
          threshold {receipt.uncertaintySummary.acceptedByThreshold ? "yes" : "no"} / hard debt{" "}
          {receipt.uncertaintySummary.hardDebtPresent ? "present" : "none"}
        </p>
        <div className="receipt-summary-list">
          {receipt.candidateSummary.alternatives.map((alternative) => (
            <p key={alternative.candidateId} className="caption">
              {alternative.label}: {formatPercent(alternative.confidence)}
              {typeof alternative.baseConfidence === "number"
                ? ` (base ${formatPercent(alternative.baseConfidence)})`
                : ""}
              {typeof alternative.contrastiveAdjustment === "number"
                ? ` / contrastive ${alternative.contrastiveAdjustment >= 0 ? "+" : ""}${formatPercent(Math.abs(alternative.contrastiveAdjustment))}`
                : ""}
              {typeof alternative.minimalPairAdjustment === "number"
                ? ` / minimal pair ${alternative.minimalPairAdjustment >= 0 ? "+" : ""}${formatPercent(Math.abs(alternative.minimalPairAdjustment))}`
                : ""}
            </p>
          ))}
          <p className="caption">
            Strongest channel {receiptChannelLabel(strongestChannels[0]?.channel ?? null)}.
          </p>
          {strongestChannels.length ? (
            strongestChannels.map((channel) => (
              <p key={`${channel.channel}-${channel.deltaScore}`} className="caption">
                {receiptChannelLabel(channel.channel)}: {Math.round(channel.deltaScore * 100)}% /
                {` ${channel.explanation}`}
              </p>
            ))
          ) : (
            <p className="caption">No contrastive channel split captured in this window.</p>
          )}
        </div>
      </section>

      <section className="prediction-card section-stack">
        <strong>Translation Debt</strong>
        <h2 className="title-md">{receipt.translationDebt.label}</h2>
        <p className="body-sm">{receipt.translationDebt.message}</p>
        <div className="receipt-summary-list">
          <p className="caption">
            Missing channels:{" "}
            {receipt.channelSummary.missingChannels.length
              ? receipt.channelSummary.missingChannels.join(", ")
              : "none"}
          </p>
          <p className="caption">
            Visibility {formatPercent(receipt.channelSummary.visibilityScore)} / motion{" "}
            {receipt.channelSummary.motionEnergy.toFixed(2)} / mouth{" "}
            {receipt.channelSummary.mouthStability.toFixed(2)}
          </p>
        </div>
      </section>

      {signFormLedger ? (
        <section className="section-stack">
          <div className="split-line">
            <div>
              <strong>SignForm Ledger</strong>
              <p className="body-sm">
                These are coarse sign-form evidence slots from landmarks only, not official ASL
                analysis.
              </p>
            </div>
            <span className="badge">
              ledger {Math.round(signFormLedger.confidence * 100)}%
            </span>
          </div>
          <div className="receipt-grid">
            {SIGN_FORM_SLOT_ORDER.map((slotName) => {
              const slot = signFormLedger.slots[slotName];

              return (
                <article key={slot.name} className="prediction-card">
                  <div className="split-line">
                    <span className="caption">{signFormSlotTitle(slot.name)}</span>
                    <span className="badge">{signFormSlotBadge(slot.status)}</span>
                  </div>
                  <h3 className="title-md">{slot.valueLabel}</h3>
                  <p className="body-sm">{slot.explanation}</p>
                  <p className="caption">
                    Evidence {formatPercent(slot.evidenceScore)} / landmarks {slot.landmarksUsed.join(", ")}
                  </p>
                </article>
              );
            })}
          </div>
          <div className="receipt-grid">
            <article className="prediction-card">
              <span className="caption">Missing or weak slots</span>
              <p className="body-sm">
                {weakOrMissingSlots.length
                  ? weakOrMissingSlots.map((slot) => signFormSlotTitle(slot.name)).join(", ")
                  : "No weak slot flagged in this window."}
              </p>
              {signFormLedger.warnings.length ? (
                <div className="receipt-summary-list">
                  {signFormLedger.warnings.map((warning) => (
                    <p key={warning} className="caption">
                      {warning}
                    </p>
                  ))}
                </div>
              ) : null}
            </article>
            <article className="prediction-card">
              <span className="caption">Candidate demo hints comparison</span>
              <p className="body-sm">
                Demo hints are illustrative only, not authoritative ASL descriptions.
              </p>
              {receipt.candidateSummary.demoHints ? (
                <div className="receipt-summary-list">
                  {receipt.candidateSummary.demoHints.handshapeHint ? (
                    <p className="caption">
                      Handshape hint: {receipt.candidateSummary.demoHints.handshapeHint} / observed{" "}
                      {signFormLedger.slots.handshape.valueLabel}
                    </p>
                  ) : null}
                  {receipt.candidateSummary.demoHints.expectedLocation ? (
                    <p className="caption">
                      Location hint: {receipt.candidateSummary.demoHints.expectedLocation} / observed{" "}
                      {signFormLedger.slots.location.valueLabel}
                    </p>
                  ) : null}
                  {receipt.candidateSummary.demoHints.expectedMovement ? (
                    <p className="caption">
                      Movement hint: {receipt.candidateSummary.demoHints.expectedMovement} / observed{" "}
                      {signFormLedger.slots.movement.valueLabel}
                    </p>
                  ) : null}
                  <p className="caption">
                    Mouth cue hint:{" "}
                    {receipt.candidateSummary.demoHints.needsMouthCue ? "demo hint says yes" : "not singled out"} /
                    observed {signFormLedger.slots.mouthCue.valueLabel}
                  </p>
                  <p className="caption">
                    Facial cue hint:{" "}
                    {receipt.candidateSummary.demoHints.needsFacialCue ? "demo hint says yes" : "not singled out"} /
                    observed {signFormLedger.slots.facialCue.valueLabel}
                  </p>
                  {receipt.candidateSummary.demoHints.notes ? (
                    <p className="caption">{receipt.candidateSummary.demoHints.notes}</p>
                  ) : null}
                </div>
              ) : (
                <p className="caption">No demo hint stored for this candidate.</p>
              )}
            </article>
          </div>
        </section>
      ) : null}

      {(cuePatchPrompt || cuePatchResult) ? (
        <section className="prediction-card section-stack">
          <strong>Cue Patch review</strong>
          {cuePatchPrompt ? (
            <div className="receipt-summary-list">
              <p className="body-sm">
                Suggested patch: {cuePatchPrompt.title} ({cuePatchKindLabel(cuePatchPrompt.kind)}).
              </p>
              <p className="caption">{cuePatchPrompt.instruction}</p>
              <p className="caption">
                Targets{" "}
                {cuePatchPrompt.targetChannels.length
                  ? cuePatchPrompt
                      .targetChannels
                      .map((channel) => receiptChannelLabel(channel))
                      .join(", ")
                  : "manual confirmation"}
                .
              </p>
              <p className="caption">{cuePatchPrompt.why}</p>
            </div>
          ) : null}
          {cuePatchResult && cuePatchComparison ? (
            <div className="receipt-summary-list">
              <p className="body-sm">
                Improved channels: {cuePatchResult.improvedChannels.join(", ") || "none yet"}.
              </p>
              <p className="caption">
                Before visibility {formatPercent(cuePatchComparison.before.visibilityScore)} / after{" "}
                {formatPercent(cuePatchComparison.after.visibilityScore)}
              </p>
              <p className="caption">
                Before motion {cuePatchComparison.before.motionEnergy.toFixed(2)} / after{" "}
                {cuePatchComparison.after.motionEnergy.toFixed(2)}
              </p>
              <p className="caption">
                Before mouth {cuePatchComparison.before.mouthStability.toFixed(2)} / after{" "}
                {cuePatchComparison.after.mouthStability.toFixed(2)}
              </p>
              <p className="caption">
                Strongest channel before {cuePatchComparison.before.strongestChannel} / after{" "}
                {cuePatchComparison.after.strongestChannel}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {receipt.relatedMinimalPairCards?.length ? (
        <section className="prediction-card section-stack">
          <strong>Related minimal-pair card</strong>
          <div className="receipt-summary-list">
            {receipt.relatedMinimalPairCards.map((card) => (
              <div key={card.id}>
                <p className="body-sm">
                  {card.labelA} vs {card.labelB}
                </p>
                <p className="caption">
                  Strongest slot difference: {formatMinimalPairSlot(card.strongestSlotDifference)}
                </p>
                <p className="caption">
                  Strongest channel: {formatMinimalPairChannel(card.strongestChannel)}
                </p>
                <p className="caption">Repair hint: {formatMinimalPairHint(card.repairHint)}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="section-stack">
        <div className="receipt-replay-meta">
          <strong>Skeleton replay</strong>
          <span className="caption">
            Frame {frameIndex + 1} / {receipt.replayFrames.length} / timestamp{" "}
            {Math.round(currentFrame?.timestamp ?? 0)}ms
          </span>
        </div>
        <div className="receipt-replay-shell">
          <svg
            className="receipt-canvas"
            viewBox="0 0 100 100"
            role="img"
            aria-label="Skeleton replay of landmark-only motion receipt"
          >
            <rect x="0" y="0" width="100" height="100" rx="8" className="receipt-canvas-bg" />
            {showPose && currentFrame?.pose?.length ? (
              <g className="receipt-pose">
                {drawPolyline(currentFrame.pose)}
                {drawPoints(currentFrame.pose, 1.2)}
              </g>
            ) : null}
            {showHands
              ? currentFrame?.hands.map((hand) => (
                  <g key={`${hand.handedness}-${hand.points.length}`} className="receipt-hand">
                    {drawPolyline(hand.points)}
                    {drawPoints(hand.points, 1)}
                  </g>
                ))
              : null}
            {showFace && currentFrame?.face?.length ? (
              <g className="receipt-face">
                {drawPoints(currentFrame.face, 0.7)}
              </g>
            ) : null}
            {showMouth && currentFrame?.mouth?.length ? (
              <g className="receipt-mouth">
                {drawPolyline(currentFrame.mouth, true)}
                {drawPoints(currentFrame.mouth, 0.8)}
              </g>
            ) : null}
          </svg>
          {showMarkers ? (
            <div className="info-box">
              <strong>Visibility and debt markers</strong>
              <p className="body-sm">
                {currentFrame?.debtFlags.length
                  ? currentFrame.debtFlags.join(" / ")
                  : "No extra debt flags on this frame."}
              </p>
              <p className="caption">
                Hand visible {currentFrame?.quality.handVisible ? "yes" : "no"} / face visible{" "}
                {currentFrame?.quality.faceVisible ? "yes" : "no"} / pose visible{" "}
                {currentFrame?.quality.poseVisible ? "yes" : "no"}
              </p>
            </div>
          ) : null}
        </div>

        <label className="field-label" htmlFor="receipt-frame-scrubber">
          Frame scrubber
        </label>
        <input
          id="receipt-frame-scrubber"
          type="range"
          min={0}
          max={Math.max(receipt.replayFrames.length - 1, 0)}
          step={1}
          value={frameIndex}
          onChange={(event) => setFrameIndex(Number(event.target.value))}
          aria-label="Frame scrubber for motion receipt replay"
        />
        <div className="button-row">
          <button
            type="button"
            className={speed === 0 ? "button-soft" : "button-ghost"}
            onClick={() => setSpeed(0)}
            aria-label="Pause motion receipt replay"
          >
            Pause
          </button>
          <button
            type="button"
            className={speed === 0.5 ? "button-soft" : "button-ghost"}
            onClick={() => setSpeed(0.5)}
            aria-label="Play motion receipt replay at half speed"
          >
            0.5x
          </button>
          <button
            type="button"
            className={speed === 1 ? "button-soft" : "button-ghost"}
            onClick={() => setSpeed(1)}
            aria-label="Play motion receipt replay at normal speed"
          >
            1x
          </button>
        </div>

        <div className="receipt-toggle-grid">
          <label className="checkbox-row" htmlFor="receipt-hands-toggle">
            <input
              id="receipt-hands-toggle"
              type="checkbox"
              checked={showHands}
              onChange={(event) => setShowHands(event.target.checked)}
              aria-label="Toggle hands in motion receipt replay"
            />
            <span>Hands</span>
          </label>
          <label className="checkbox-row" htmlFor="receipt-mouth-toggle">
            <input
              id="receipt-mouth-toggle"
              type="checkbox"
              checked={showMouth}
              onChange={(event) => setShowMouth(event.target.checked)}
              aria-label="Toggle mouth in motion receipt replay"
            />
            <span>Mouth</span>
          </label>
          <label className="checkbox-row" htmlFor="receipt-face-toggle">
            <input
              id="receipt-face-toggle"
              type="checkbox"
              checked={showFace}
              onChange={(event) => setShowFace(event.target.checked)}
              aria-label="Toggle face in motion receipt replay"
            />
            <span>Face</span>
          </label>
          <label className="checkbox-row" htmlFor="receipt-pose-toggle">
            <input
              id="receipt-pose-toggle"
              type="checkbox"
              checked={showPose}
              onChange={(event) => setShowPose(event.target.checked)}
              aria-label="Toggle pose in motion receipt replay"
            />
            <span>Pose</span>
          </label>
          <label className="checkbox-row" htmlFor="receipt-markers-toggle">
            <input
              id="receipt-markers-toggle"
              type="checkbox"
              checked={showMarkers}
              onChange={(event) => setShowMarkers(event.target.checked)}
              aria-label="Toggle visibility and debt markers in motion receipt replay"
            />
            <span>Visibility and debt markers</span>
          </label>
        </div>
      </section>

      <section className="section-stack">
        <strong>Receipt actions</strong>
        <div className="button-row">
          {onSave ? (
            <button
              type="button"
              className="button"
              onClick={() => void onSave(receipt)}
              disabled={saveDisabled}
              aria-label="Save motion receipt locally"
            >
              Save receipt locally
            </button>
          ) : null}
          <button
            type="button"
            className="button-ghost"
            onClick={() => downloadReceipt(receipt)}
            aria-label="Export motion receipt as JSON"
          >
            Export receipt JSON
          </button>
          <button
            type="button"
            className="button-ghost"
            onClick={onDiscard}
            aria-label={discardLabel}
          >
            {discardLabel}
          </button>
        </div>
        {onSave ? (
          <p className="body-sm">
            Saves landmark-only replay data on this device. No raw video.
          </p>
        ) : null}
        {saveStatus ? <p className="caption">{saveStatus}</p> : null}
      </section>
    </section>
  );
}
