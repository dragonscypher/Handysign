"use client";

import type { BlindInferenceReport } from "@/lib/video/BlindInferenceReport";

interface BlindInferenceComparisonProps {
  report: BlindInferenceReport;
  onExport: () => void;
  onSaveLexemes: () => void;
  debugEnabled: boolean;
  saveStatus: string | null;
}

export default function BlindInferenceComparison({
  report,
  onExport,
  onSaveLexemes,
  debugEnabled,
  saveStatus,
}: BlindInferenceComparisonProps) {
  const coverageLimited = report.candidateSetSize <= 8;
  const topEventChain = report.summary.topEventChain ?? report.summary.topSummary;
  const alternateEventChains =
    report.summary.alternateEventChains ?? report.summary.alternateSummaries;
  const metrics = report.summary.metrics ?? {
    genericUnknownRatio: 0,
    genericUnknownCount: 0,
    resolvedEventFamilyRatio: 0,
    repeatedMotifCount: report.summary.repeatedPatterns.length,
    eventFamilyDiversity: 0,
    specificEventFamilyCount: 0,
    unresolvedSegmentsCount: report.summary.unresolvedSegments.length,
    refinementCount: 0,
    averageConfidenceMargin: 0,
    averageConfidenceByEventFamily: [],
  };

  return (
    <section className="panel section-stack">
      <div className="split-line">
        <div>
          <h2 className="title-md">Unseen clip validation summary</h2>
          <p className="body-sm">
            No expected reference loaded here. These are landmark-derived hypotheses, not transcript
            claims.
          </p>
        </div>
        <span className="badge">{report.mode}</span>
      </div>

      {coverageLimited ? (
        <div className="warning-box" role="status" aria-live="polite">
          <strong>Coverage limited</strong>
          <p className="body-sm">
            Exact recognizer still has only {report.candidateSetSize} known labels. Blind mode will
            prefer structured unknown hypotheses when exact evidence is weak.
          </p>
          <p className="caption">
            Do not treat exact label guesses as story translation. Unknown action-like summaries are
            still tentative.
          </p>
        </div>
      ) : null}

      <div className="verify-grid">
        <article className="prediction-card section-stack">
          <span className="caption">Top blind summary</span>
          <h3 className="title-md">{topEventChain}</h3>
          <p className="body-sm">
            Model output: {report.segmentHypothesisTranscript || "No stable segment hypotheses yet."}
          </p>
          <p className="caption">Top lexeme chain: {report.summary.topLexemeChain || "none"}</p>
        </article>
        <article className="prediction-card section-stack">
          <span className="caption">Other possible event chains</span>
          <div className="receipt-summary-list">
            {alternateEventChains.length ? (
              alternateEventChains.map((summary) => (
                <p key={summary} className="caption">
                  {summary}
                </p>
              ))
            ) : (
              <p className="caption">No alternate chain strong enough yet.</p>
            )}
          </div>
        </article>
      </div>

      <div className="stats-grid">
        <div className="prediction-card">
          <span className="caption">Segments</span>
          <strong className="mono">{report.segments.length}</strong>
        </div>
        <div className="prediction-card">
          <span className="caption">Repeated motifs</span>
          <strong className="mono">{metrics.repeatedMotifCount}</strong>
        </div>
        <div className="prediction-card">
          <span className="caption">Specific event families</span>
          <strong className="mono">{metrics.specificEventFamilyCount}</strong>
        </div>
        <div className="prediction-card">
          <span className="caption">Generic unknown count</span>
          <strong className="mono">
            {metrics.genericUnknownCount}
          </strong>
        </div>
        <div className="prediction-card">
          <span className="caption">Blind lexemes</span>
          <strong className="mono">{report.summary.lexemeCount}</strong>
        </div>
        <div className="prediction-card">
          <span className="caption">Family diversity</span>
          <strong className="mono">{metrics.eventFamilyDiversity}</strong>
        </div>
        <div className="prediction-card">
          <span className="caption">Clip relabels</span>
          <strong className="mono">{report.summary.metrics.refinementCount}</strong>
        </div>
        <div className="prediction-card">
          <span className="caption">Avg confidence margin</span>
          <strong className="mono">{Math.round(metrics.averageConfidenceMargin * 100)}%</strong>
        </div>
      </div>

      <div className="info-box">
        <strong>Repeated motifs detected</strong>
        <div className="receipt-summary-list">
          {report.summary.repeatedPatterns.length ? (
            report.summary.repeatedPatterns.map((pattern) => (
              <p key={pattern.label} className="caption">
                {pattern.label} x{pattern.count}
                {pattern.segmentIds?.length ? ` (${pattern.segmentIds.join(", ")})` : ""}
              </p>
            ))
          ) : (
            <p className="caption">No repeated motif strong enough yet.</p>
          )}
          {report.summary.motifTags.map((tag) => (
            <p key={tag} className="caption">
              Motif tag: {tag}
            </p>
          ))}
        </div>
      </div>

      <div className="info-box">
        <strong>Discovered blind lexemes</strong>
        <div className="receipt-summary-list">
          {report.lexemes.length ? (
            report.lexemes.slice(0, 8).map((lexeme) => (
              <p key={lexeme.id} className="caption">
                {lexeme.id}: {lexeme.dominantEventFamily} / count {lexeme.count} / avg{" "}
                {Math.round(lexeme.averageConfidence * 100)}%
              </p>
            ))
          ) : (
            <p className="caption">No reusable blind lexemes discovered yet.</p>
          )}
          {report.summary.alternateLexemeChains.length ? (
            report.summary.alternateLexemeChains.map((chain) => (
              <p key={chain} className="caption">
                Alt lexeme chain: {chain}
              </p>
            ))
          ) : null}
        </div>
      </div>

      <div className="info-box">
        <strong>Unresolved segments</strong>
        <p className="body-sm">
          {report.summary.unresolvedSegments.length
            ? report.summary.unresolvedSegments.join(", ")
            : "No unresolved segments flagged."}
        </p>
      </div>

      <div className="info-box">
        <strong>Blind metrics</strong>
        <div className="receipt-summary-list">
          <p className="caption">
            Resolved event-family ratio:{" "}
            {Math.round(metrics.resolvedEventFamilyRatio * 100)}%
          </p>
          <p className="caption">
            Unresolved segments: {metrics.unresolvedSegmentsCount}
          </p>
          <p className="caption">
            Repeated action cycles: {report.summary.repeatedActionCycles}
          </p>
          <p className="caption">
            Generic unknown ratio: {Math.round(metrics.genericUnknownRatio * 100)}%
          </p>
          {metrics.averageConfidenceByEventFamily.slice(0, 4).map((item) => (
            <p key={item.label} className="caption">
              Avg confidence {item.label}: {Math.round(item.averageConfidence * 100)}%
            </p>
          ))}
        </div>
      </div>

      <div className="info-box">
        <strong>Likely transition points</strong>
        <div className="receipt-summary-list">
          {report.summary.likelyTransitionPoints.length ? (
            report.summary.likelyTransitionPoints.slice(0, 6).map((point) => (
              <p key={`${point.segmentId}-${point.timeMs}-${point.toPhase}`} className="caption">
                {point.segmentId} @ {Math.round(point.timeMs / 1000)}s: {point.fromPhase} {"->"}{" "}
                {point.toPhase}
              </p>
            ))
          ) : (
            <p className="caption">No transition points strong enough yet.</p>
          )}
        </div>
      </div>

      <div className="info-box">
        <strong>Improve next</strong>
        <div className="receipt-summary-list">
          {report.summary.improveNext.strongestFamilies.map((family) => (
            <p key={`strong-${family.label}`} className="caption">
              Strongest family: {family.label} x{family.count} @{" "}
              {Math.round(family.averageConfidence * 100)}%
            </p>
          ))}
          {report.summary.improveNext.weakestFamilies.map((family) => (
            <p key={`weak-${family.label}`} className="caption">
              Weakest family: {family.label} x{family.count} @{" "}
              {Math.round(family.averageConfidence * 100)}%
            </p>
          ))}
          {report.summary.improveNext.likelyConfusionPairs.map((pair) => (
            <p key={pair.pair} className="caption">
              Likely confusion: {pair.pair} x{pair.count}
            </p>
          ))}
          {report.summary.improveNext.likelyNextDataNeed.map((need) => (
            <p key={need} className="caption">
              Improve next: {need}
            </p>
          ))}
        </div>
      </div>

      <div className="info-box">
        <strong>Failure tags</strong>
        <div className="receipt-summary-list">
          {report.summary.improveNext.failureTagCounts.length ? (
            report.summary.improveNext.failureTagCounts.map((item) => (
              <p key={item.tag} className="caption">
                {item.tag}: {item.count}
              </p>
            ))
          ) : (
            <p className="caption">No dominant blind failure tag yet.</p>
          )}
        </div>
      </div>

      <details className="panel section-stack" open={debugEnabled}>
        <summary className="split-line">
          <strong>Blind debug drawer</strong>
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
            Detector failures: {report.debug.detectorFailures} / runtime logs{" "}
            {report.debug.runtimeLogCount} / warnings {report.debug.warningsCount}
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
          className="button-soft"
          onClick={onSaveLexemes}
          aria-label="Save discovered blind lexemes locally"
        >
          Save discovered lexemes locally
        </button>
        <button
          type="button"
          className="button-ghost"
          onClick={onExport}
          aria-label="Export blind inference report as JSON"
        >
          Export blind inference JSON
        </button>
      </div>
      {saveStatus ? <p className="caption">{saveStatus}</p> : null}
    </section>
  );
}
