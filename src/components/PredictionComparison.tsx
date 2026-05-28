"use client";

import type { VerificationReport } from "@/lib/video/VerificationReport";

interface PredictionComparisonProps {
  report: VerificationReport;
  onSave: () => void;
  onExport: () => void;
  onRebuildWithCalibration: () => void;
  saveStatus: string | null;
  debugEnabled: boolean;
  comparisonMode: "exact" | "concept-level";
}

export default function PredictionComparison({
  report,
  onSave,
  onExport,
  onRebuildWithCalibration,
  saveStatus,
  debugEnabled,
  comparisonMode,
}: PredictionComparisonProps) {
  return (
    <section className="panel section-stack">
      <div className="split-line">
        <div>
          <h2 className="title-md">Prediction comparison</h2>
          <p className="body-sm">
            Compare expected reference against exact model output. This is benchmark review, not
            linguistic authority.
          </p>
        </div>
        <span className="badge">{report.mode}</span>
      </div>

      <div className="info-box">
        <strong>Current comparison mode</strong>
        <p className="body-sm">
          {comparisonMode === "exact"
            ? "Exact mode keeps strict string-level scoring. This will stay weak on story clips when recognizer vocabulary is small."
            : "Concept-level mode estimates partial benchmark concept coverage. It is not translation or linguistic authority."}
        </p>
      </div>

      {report.coverage.limited ? (
        <div className="warning-box" role="status" aria-live="polite">
          <strong>Coverage limited</strong>
          <p className="body-sm">
            Current recognizer has {report.candidateSetSize} labels. {report.coverage.note}
          </p>
          <p className="caption">
            Treat clip output as constrained known-candidate verification only, not story-scale
            sign translation.
          </p>
          <p className="caption">
            Selected pack: {report.vocabularyPack.label}. Supported concepts with 2+ examples:{" "}
            {report.vocabularyPack.supportedConceptCount} / {report.vocabularyPack.conceptCount}
          </p>
          {report.coverage.outsideVocabularySegments.length ? (
            <p className="caption">
              Outside vocabulary:{" "}
              {report.coverage.outsideVocabularySegments
                .slice(0, 3)
                .map((segment) => segment.expected)
                .join(" / ")}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="verify-grid">
        <article className="prediction-card section-stack">
          <span className="caption">Expected reference</span>
          <p className="body-sm">{report.expectedTranscript}</p>
        </article>
        <article className="prediction-card section-stack">
          <span className="caption">Model output</span>
          <p className="body-sm">{report.modelOutputTranscript || "No stable output yet."}</p>
        </article>
      </div>

      <div className="stats-grid">
        <div className="prediction-card">
          <span className="caption">Segments processed</span>
          <strong className="mono">{report.summary.segmentsProcessed}</strong>
        </div>
        <div className="prediction-card">
          <span className="caption">Segments predicted</span>
          <strong className="mono">{report.summary.segmentsPredicted}</strong>
        </div>
        <div className="prediction-card">
          <span className="caption">Uncertain segments</span>
          <strong className="mono">{report.summary.uncertainSegments}</strong>
        </div>
        <div className="prediction-card">
          <span className="caption">Average confidence</span>
          <strong className="mono">{Math.round(report.summary.averageConfidence * 100)}%</strong>
        </div>
        <div className="prediction-card">
          <span className="caption">
            {comparisonMode === "exact" ? "Mismatch count" : "Concept matches"}
          </span>
          <strong className="mono">
            {comparisonMode === "exact"
              ? report.summary.mismatchCount
              : report.conceptSummary.conceptMatchCount}
          </strong>
        </div>
        <div className="prediction-card">
          <span className="caption">
            {comparisonMode === "exact" ? "Exact matches" : "Concept partial"}
          </span>
          <strong className="mono">
            {comparisonMode === "exact"
              ? report.summary.exactCount
              : report.conceptSummary.conceptPartialCount}
          </strong>
        </div>
        <div className="prediction-card">
          <span className="caption">
            {comparisonMode === "exact" ? "Out-of-coverage" : "Concept coverage"}
          </span>
          <strong className="mono">
            {comparisonMode === "exact"
              ? report.summary.outOfCoverageCount
              : `${Math.round(report.conceptSummary.conceptCoverageRate * 100)}%`}
          </strong>
        </div>
        <div className="prediction-card">
          <span className="caption">Candidate set size</span>
          <strong className="mono">{report.candidateSetSize}</strong>
        </div>
      </div>

      <div className="stats-grid">
        <div className="prediction-card">
          <span className="caption">Exact matches</span>
          <strong className="mono">{report.summary.exactCount}</strong>
        </div>
        <div className="prediction-card">
          <span className="caption">Concept matches</span>
          <strong className="mono">{report.conceptSummary.conceptMatchCount}</strong>
        </div>
        <div className="prediction-card">
          <span className="caption">Concept partial</span>
          <strong className="mono">{report.conceptSummary.conceptPartialCount}</strong>
        </div>
        <div className="prediction-card">
          <span className="caption">Insufficient examples</span>
          <strong className="mono">{report.conceptSummary.insufficientExampleSegments}</strong>
        </div>
      </div>

      <div className="info-box">
        <strong>Calibration and hold-out</strong>
        <p className="body-sm">{report.calibration.note}</p>
        <p className="caption">
          Baseline held-out rate:{" "}
          {report.calibration.baselineHeldOutPassRate === null
            ? "n/a"
            : `${Math.round(report.calibration.baselineHeldOutPassRate * 100)}%`}
          {" / "}
          Current held-out rate:{" "}
          {report.calibration.calibratedHeldOutPassRate === null
            ? "n/a"
            : `${Math.round(report.calibration.calibratedHeldOutPassRate * 100)}%`}
        </p>
        <p className="caption">
          Concept coverage on held-out segments:{" "}
          {Math.round(report.conceptSummary.conceptCoverageRate * 100)}%
        </p>
      </div>

      <details className="panel section-stack" open={debugEnabled}>
        <summary className="split-line">
          <strong>Verify debug drawer</strong>
          <span className="badge">{debugEnabled ? "debug on" : "debug off"}</span>
        </summary>
        <div className="receipt-summary-list">
          <p className="caption">Clip duration: {Math.round(report.clipDurationMs / 1000)}s</p>
          <p className="caption">Segment count: {report.segments.length}</p>
          <p className="caption">Detector init: {report.debug.detectorInitStatus}</p>
          <p className="caption">
            Frame extraction: requested {report.debug.totalFramesRequested} / analyzed{" "}
            {report.debug.framesAnalyzed} / skipped {report.debug.framesSkipped}
          </p>
          <p className="caption">
            Duplicate timestamps skipped: {report.debug.duplicateTimestampsSkipped} / invalid
            timestamps skipped: {report.debug.invalidTimestampsSkipped}
          </p>
          <p className="caption">
            Detector failures: {report.debug.detectorFailures} / runtime logs{" "}
            {report.debug.runtimeLogCount} / warnings {report.debug.warningsCount}
          </p>
          <p className="caption">
            First timestamp:{" "}
            {report.debug.firstTimestampMs === null ? "n/a" : `${Math.round(report.debug.firstTimestampMs)}ms`}
            {" / "}
            Last timestamp:{" "}
            {report.debug.lastTimestampMs === null ? "n/a" : `${Math.round(report.debug.lastTimestampMs)}ms`}
          </p>
          {report.debug.analysisWarnings.slice(0, 5).map((warning) => (
            <p key={warning} className="caption">
              Warning: {warning}
            </p>
          ))}
        </div>
      </details>

      <div className="button-row">
        <button
          type="button"
          className="button"
          onClick={onRebuildWithCalibration}
          aria-label="Re-run verification with current calibration selections"
        >
          Re-run with calibration
        </button>
        <button
          type="button"
          className="button-soft"
          onClick={onSave}
          aria-label="Save verification report locally"
        >
          Save report locally
        </button>
        <button
          type="button"
          className="button-ghost"
          onClick={onExport}
          aria-label="Export verification report as JSON"
        >
          Export JSON verification report
        </button>
      </div>
      {saveStatus ? <p className="caption">{saveStatus}</p> : null}
    </section>
  );
}
