"use client";

import type { VerificationSegmentResult } from "@/lib/video/VerificationReport";

interface SegmentReviewCardProps {
  segment: VerificationSegmentResult;
  onExpectedChange: (segmentId: string, nextExpected: string) => void;
  onCalibrationChange: (segmentId: string, checked: boolean) => void;
  debugEnabled: boolean;
  comparisonMode: "exact" | "concept-level";
}

function formatTime(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function SegmentReviewCard({
  segment,
  onExpectedChange,
  onCalibrationChange,
  debugEnabled,
  comparisonMode,
}: SegmentReviewCardProps) {
  return (
    <article className="memory-card section-stack">
      <div className="split-line">
        <div>
          <h3 className="title-md">{segment.id}</h3>
          <p className="caption">
            {formatTime(segment.startMs)} - {formatTime(segment.endMs)}
          </p>
        </div>
        <div className="button-row">
          <span className="status-pill">
            {comparisonMode === "exact"
              ? segment.matchResult
              : segment.conceptEvaluation.result}
          </span>
          <span className="badge">{segment.coverageStatus}</span>
        </div>
      </div>

      <div className="verify-grid">
        <div className="prediction-card section-stack">
          <span className="caption">Expected reference</span>
          <textarea
            className="textarea"
            value={segment.expected}
            onChange={(event) => onExpectedChange(segment.id, event.target.value)}
            aria-label={`Expected reference for ${segment.id}`}
          />
          <label className="checkbox-row" htmlFor={`calibration-${segment.id}`}>
            <input
              id={`calibration-${segment.id}`}
              type="checkbox"
              checked={segment.usedForCalibration}
              onChange={(event) => onCalibrationChange(segment.id, event.target.checked)}
              aria-label={`Use ${segment.id} as calibration segment`}
            />
            <span>Use as calibration prototype only. Hold-out matters more.</span>
          </label>
        </div>

        <div className="prediction-card section-stack">
          <span className="caption">Model output</span>
          <h3 className="title-md">{segment.modelOutput}</h3>
          <p className="body-sm">Current guess: {segment.predictedLabel ?? "uncertain"}</p>
          <p className="caption">
            Confidence {Math.round(segment.confidence * 100)}% / candidate set{" "}
            {segment.candidateSetSize}
          </p>
          <div className="receipt-summary-list">
            <p className="caption">Why unsure: {segment.uncertaintyReason}</p>
            <p className="caption">Translation Debt: {segment.debtLabel}</p>
            <p className="caption">Exact result: {segment.matchResult}</p>
            <p className="caption">Concept result: {segment.conceptEvaluation.result}</p>
            <p className="caption">Coverage result: {segment.coverageStatus}</p>
            <p className="caption">{segment.comparisonReason}</p>
            <p className="caption">
              Concept hits:{" "}
              {segment.conceptEvaluation.hits.length
                ? segment.conceptEvaluation.hits.map((concept) => concept.label).join(" / ")
                : "none"}
            </p>
            <p className="caption">
              Concept misses:{" "}
              {segment.conceptEvaluation.misses.length
                ? segment.conceptEvaluation.misses.map((concept) => concept.label).join(" / ")
                : "none"}
            </p>
            <p className="caption">
              Out-of-coverage concepts:{" "}
              {segment.conceptEvaluation.outOfCoverageConcepts.length
                ? segment.conceptEvaluation.outOfCoverageConcepts
                    .map((concept) => concept.label)
                    .join(" / ")
                : "none"}
            </p>
            <p className="caption">
              Concept coverage: {Math.round(segment.conceptEvaluation.coverageRate * 100)}%
            </p>
            <p className="caption">
              Other possibilities:{" "}
              {segment.alternatives.length
                ? segment.alternatives
                    .map((alternative) => `${alternative.label} (${Math.round(alternative.confidence * 100)}%)`)
                    .join(" / ")
                : "none"}
            </p>
            <div className="button-row">
              {segment.conceptEvaluation.expectedConcepts.map((concept) => (
                <span key={`${segment.id}-${concept.id}`} className="badge">
                  {concept.label}
                </span>
              ))}
            </div>
            {debugEnabled && segment.debug ? (
              <p className="caption">
                Debug: frames {segment.debug.framesAnalyzed} / skipped {segment.debug.skippedFrames}
                {" / "}detector failures {segment.debug.detectorFailures}
              </p>
            ) : null}
            {debugEnabled && segment.debug ? (
              <p className="caption">
                Debug window:{" "}
                {segment.debug.firstTimestampMs === null
                  ? "n/a"
                  : `${Math.round(segment.debug.firstTimestampMs)}ms`}
                {" - "}
                {segment.debug.lastTimestampMs === null
                  ? "n/a"
                  : `${Math.round(segment.debug.lastTimestampMs)}ms`}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
