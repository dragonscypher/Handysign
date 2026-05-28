"use client";

import { useState } from "react";
import {
  compareBlindInferenceReports,
  isBlindInferenceReport,
  type BlindInferenceComparisonResult,
} from "@/lib/video/BlindInferenceCompare";

async function readBlindExport(file: File) {
  const payload =
    typeof file.text === "function"
      ? await file.text()
      : await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error("Could not read blind export JSON."));
          reader.onload = () => resolve(String(reader.result ?? ""));
          reader.readAsText(file as Blob);
        });
  const parsed = JSON.parse(payload) as unknown;

  if (!isBlindInferenceReport(parsed)) {
    throw new Error("Blind export compare only accepts SignRepair blind inference JSON.");
  }

  return parsed;
}

function metricLabel(value: number) {
  return Number.isInteger(value) ? String(value) : `${Math.round(value * 100)}%`;
}

function deltaLabel(delta: number, percent = false) {
  const value = percent ? Math.round(delta * 100) : delta;
  const prefix = value > 0 ? "+" : "";
  return percent ? `${prefix}${value}%` : `${prefix}${value}`;
}

export default function BlindExportCompare() {
  const [baselineFile, setBaselineFile] = useState<File | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [comparison, setComparison] = useState<BlindInferenceComparisonResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runCompare = async () => {
    if (!baselineFile || !currentFile) {
      setError("Choose baseline and current blind export JSON first.");
      return;
    }

    try {
      const [baseline, current] = await Promise.all([
        readBlindExport(baselineFile),
        readBlindExport(currentFile),
      ]);
      setComparison(compareBlindInferenceReports(baseline, current));
      setError(null);
    } catch (nextError) {
      setComparison(null);
      setError(nextError instanceof Error ? nextError.message : "Blind export compare failed.");
    }
  };

  return (
    <section className="panel section-stack">
      <div className="split-line">
        <div>
          <h2 className="title-md">Blind export compare</h2>
          <p className="body-sm">
            Load two blind inference exports from unseen clips or reruns to compare structure drift
            without any expected transcript.
          </p>
        </div>
        <span className="badge">validation</span>
      </div>

      <div className="button-row">
        <div className="field-group">
          <label className="field-label" htmlFor="blind-compare-baseline">
            Baseline blind export
          </label>
          <input
            id="blind-compare-baseline"
            type="file"
            accept="application/json"
            onChange={(event) => setBaselineFile(event.target.files?.[0] ?? null)}
            aria-label="Upload baseline blind export JSON"
          />
        </div>
        <div className="field-group">
          <label className="field-label" htmlFor="blind-compare-current">
            Current blind export
          </label>
          <input
            id="blind-compare-current"
            type="file"
            accept="application/json"
            onChange={(event) => setCurrentFile(event.target.files?.[0] ?? null)}
            aria-label="Upload current blind export JSON"
          />
        </div>
      </div>

      <div className="button-row">
        <button
          type="button"
          className="button-soft"
          onClick={() => void runCompare()}
          aria-label="Compare blind exports"
        >
          Compare blind exports
        </button>
      </div>

      {error ? (
        <div className="warning-box" role="alert">
          <strong>Blind export compare failed</strong>
          <p className="body-sm">{error}</p>
        </div>
      ) : null}

      {comparison ? (
        <>
          <div className="info-box">
            <strong>Top chain differences</strong>
            <div className="receipt-summary-list">
              <p className="caption">
                Event-family chain: {comparison.topChainDifferences.eventFamily.baseline} {"->"}{" "}
                {comparison.topChainDifferences.eventFamily.current}
              </p>
              <p className="caption">
                Lexeme chain: {comparison.topChainDifferences.lexeme.baseline} {"->"}{" "}
                {comparison.topChainDifferences.lexeme.current}
              </p>
            </div>
          </div>

          <div className="stats-grid">
            <div className="prediction-card">
              <span className="caption">Segment count</span>
              <strong className="mono">
                {comparison.metrics.segmentCount.current}
              </strong>
              <p className="caption">
                {deltaLabel(comparison.metrics.segmentCount.delta)}
              </p>
            </div>
            <div className="prediction-card">
              <span className="caption">Lexeme count</span>
              <strong className="mono">
                {comparison.metrics.lexemeCount.current}
              </strong>
              <p className="caption">
                {deltaLabel(comparison.metrics.lexemeCount.delta)}
              </p>
            </div>
            <div className="prediction-card">
              <span className="caption">Generic unknown count</span>
              <strong className="mono">
                {comparison.metrics.genericUnknownCount.current}
              </strong>
              <p className="caption">
                {deltaLabel(comparison.metrics.genericUnknownCount.delta)}
              </p>
            </div>
            <div className="prediction-card">
              <span className="caption">Family diversity</span>
              <strong className="mono">
                {comparison.metrics.eventFamilyDiversity.current}
              </strong>
              <p className="caption">
                {deltaLabel(comparison.metrics.eventFamilyDiversity.delta)}
              </p>
            </div>
            <div className="prediction-card">
              <span className="caption">Repeated patterns</span>
              <strong className="mono">
                {comparison.metrics.repeatedPatternCount.current}
              </strong>
              <p className="caption">
                {deltaLabel(comparison.metrics.repeatedPatternCount.delta)}
              </p>
            </div>
            <div className="prediction-card">
              <span className="caption">Unresolved segments</span>
              <strong className="mono">
                {comparison.metrics.unresolvedSegmentCount.current}
              </strong>
              <p className="caption">
                {deltaLabel(comparison.metrics.unresolvedSegmentCount.delta)}
              </p>
            </div>
            <div className="prediction-card">
              <span className="caption">Avg confidence margin</span>
              <strong className="mono">
                {metricLabel(comparison.metrics.averageConfidenceMargin.current)}
              </strong>
              <p className="caption">
                {deltaLabel(comparison.metrics.averageConfidenceMargin.delta, true)}
              </p>
            </div>
            <div className="prediction-card">
              <span className="caption">Refinement count</span>
              <strong className="mono">
                {comparison.metrics.refinementCount.current}
              </strong>
              <p className="caption">
                {deltaLabel(comparison.metrics.refinementCount.delta)}
              </p>
            </div>
            <div className="prediction-card">
              <span className="caption">Fingerspell count</span>
              <strong className="mono">
                {comparison.focusFamilyCounts.fingerspell.current}
              </strong>
              <p className="caption">
                {deltaLabel(comparison.focusFamilyCounts.fingerspell.delta)}
              </p>
            </div>
            <div className="prediction-card">
              <span className="caption">Big-fall count</span>
              <strong className="mono">
                {comparison.focusFamilyCounts.bigFall.current}
              </strong>
              <p className="caption">
                {deltaLabel(comparison.focusFamilyCounts.bigFall.delta)}
              </p>
            </div>
            <div className="prediction-card">
              <span className="caption">Approval count</span>
              <strong className="mono">
                {comparison.focusFamilyCounts.approval.current}
              </strong>
              <p className="caption">
                {deltaLabel(comparison.focusFamilyCounts.approval.delta)}
              </p>
            </div>
          </div>

          <div className="info-box">
            <strong>Family counts</strong>
            <div className="receipt-summary-list">
              {comparison.familyCounts.map((item) => (
                <p key={item.label} className="caption">
                  {item.label}: {item.baseline} {"->"} {item.current} ({deltaLabel(item.delta)})
                </p>
              ))}
            </div>
          </div>

          <div className="info-box">
            <strong>Failure tag counts</strong>
            <div className="receipt-summary-list">
              {comparison.failureTagCounts.length ? (
                comparison.failureTagCounts.map((item) => (
                  <p key={item.tag} className="caption">
                    {item.tag}: {item.baseline} {"->"} {item.current} ({deltaLabel(item.delta)})
                  </p>
                ))
              ) : (
                <p className="caption">No failure tags in either export.</p>
              )}
            </div>
          </div>

          <div className="info-box">
            <strong>Likely confusion pairs</strong>
            <div className="receipt-summary-list">
              {comparison.likelyConfusionPairs.length ? (
                comparison.likelyConfusionPairs.map((item) => (
                  <p key={item.pair} className="caption">
                    {item.pair}: {item.baseline} {"->"} {item.current} ({deltaLabel(item.delta)})
                  </p>
                ))
              ) : (
                <p className="caption">No confusion pairs in either export.</p>
              )}
            </div>
          </div>
        </>
      ) : (
        <section className="empty-state">
          No blind export comparison yet. Load baseline and current blind JSON to compare unseen
          validation runs.
        </section>
      )}
    </section>
  );
}
