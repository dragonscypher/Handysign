"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  evidenceHealthCounts,
  evidenceHealthStatusLabel,
  evidenceMemoryTypeLabel,
  type EvidenceHealthReport,
  type MemoryHealthSummary,
} from "@/lib/evidence-health/EvidenceHealth";
import { assertNoRawVideoFields } from "@/lib/privacy/assertNoRawVideoFields";
import { LocalDataStore, localDataStore } from "@/lib/privacy/LocalDataStore";
import { PrototypeStore, prototypeStore } from "@/lib/recognition/PrototypeStore";

interface EvidenceHealthDashboardProps {
  dataStore?: LocalDataStore;
  prototypeStoreInstance?: PrototypeStore;
}

function statusSummary(summary: MemoryHealthSummary) {
  return summary.reasons[0] ?? "No local reason recorded yet.";
}

function firstActionRoute(
  report: EvidenceHealthReport | null,
  actionId: MemoryHealthSummary["recommendedAction"]["id"],
) {
  return report?.recommendedActions.find((action) => action.id === actionId)?.targetRoute ?? null;
}

function staleSummary(report: EvidenceHealthReport | null) {
  return (
    report?.memorySummaries.find(
      (summary) => summary.recommendedAction.id === "delete-stale-memory",
    ) ?? null
  );
}

export default function EvidenceHealthDashboard({
  dataStore = localDataStore,
  prototypeStoreInstance = prototypeStore,
}: EvidenceHealthDashboardProps) {
  void dataStore;
  const [report, setReport] = useState<EvidenceHealthReport | null>(null);
  const [statusMessage, setStatusMessage] = useState(
    "Evidence Health uses local landmark-derived data only. It is not an accuracy certificate.",
  );

  const reload = async () => {
    const nextReport = await prototypeStoreInstance.generateEvidenceHealthReport();
    setReport(nextReport);
  };

  useEffect(() => {
    let active = true;

    void (async () => {
      const nextReport = await prototypeStoreInstance.generateEvidenceHealthReport();

      if (!active) {
        return;
      }

      setReport(nextReport);
    })();

    return () => {
      active = false;
    };
  }, [prototypeStoreInstance]);

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
    setStatusMessage("Export created from local landmark-only memory.");
  };

  const clearStaleMemory = async () => {
    const summary = staleSummary(report);

    if (!summary) {
      setStatusMessage("No stale memory is marked for review right now.");
      return;
    }

    if (!window.confirm(`Review and delete stale memory for ${summary.label}?`)) {
      return;
    }

    switch (summary.memoryType) {
      case "personal-sign":
        await prototypeStoreInstance.deletePersonalSign(summary.memoryId);
        break;
      case "confusion-twin":
        await prototypeStoreInstance.deleteConfusionPair(summary.memoryId);
        break;
      case "motion-receipt":
        await prototypeStoreInstance.deleteReceipt(summary.memoryId);
        break;
      case "minimal-pair-card":
        await prototypeStoreInstance.deleteMinimalPairCard(summary.memoryId);
        break;
      default:
        setStatusMessage("This stale item must be reviewed from Memory.");
        return;
    }

    await reload();
    setStatusMessage(`Deleted stale local memory for ${summary.label}.`);
  };

  const counts = evidenceHealthCounts(report);
  const minimalPairRoute = firstActionRoute(report, "open-minimal-pair-lab") ?? "/minimal-pair";
  const teachRoute = firstActionRoute(report, "record-more-examples") ?? "/teach";

  return (
    <section className="page-shell">
      <div className="panel section-stack">
        <span className="eyebrow">Evidence Health / Drift Sentinel</span>
        <div className="split-line">
          <div>
            <h1 className="title-lg">Review local memory quality and drift.</h1>
            <p className="body-sm">
              Review local memory quality, drift, and repeated confusion with landmark-derived
              evidence only.
            </p>
          </div>
          <span className="status-pill">
            Status: {evidenceHealthStatusLabel(report?.overallStatus ?? "unknown")}
          </span>
        </div>
        <p className="body-sm" aria-live="polite">
          {statusMessage}
        </p>
        <div className="info-box">
          <strong>Health status guide</strong>
          <ul className="list">
            <li>Healthy: enough local evidence for this prototype.</li>
            <li>Watch: usable but weak, stale, or missing evidence.</li>
            <li>Needs review: repeated confusion or stale, low-quality memory.</li>
            <li>Unknown: not enough local data yet.</li>
          </ul>
          <p className="caption">
            Health is not accuracy. It only describes local evidence quality.
          </p>
        </div>
        <div className="stats-grid">
          <div className="prediction-card">
            <span className="caption">Healthy</span>
            <strong className="mono">{counts.healthy}</strong>
          </div>
          <div className="prediction-card">
            <span className="caption">Watch</span>
            <strong className="mono">{counts.watch}</strong>
          </div>
          <div className="prediction-card">
            <span className="caption">Needs review</span>
            <strong className="mono">{counts["needs-review"]}</strong>
          </div>
          <div className="prediction-card">
            <span className="caption">Unknown</span>
            <strong className="mono">{counts.unknown}</strong>
          </div>
        </div>
      </div>

      <div className="memory-grid">
        <div className="panel section-stack">
          <div className="split-line">
            <h2 className="title-md">Recommended actions</h2>
            <span className="badge">{report?.recommendedActions.length ?? 0}</span>
          </div>
          <div className="memory-list">
            {report?.recommendedActions.length ? (
              report.recommendedActions.map((action) => (
                <article key={`${action.id}-${action.targetId ?? action.title}`} className="memory-card">
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
                No local actions yet. Save local examples, repairs, or receipts first, then review
                health here.
                <div className="button-row">
                  <Link href="/teach" className="button-soft">
                    Go to Teach
                  </Link>
                  <Link href="/memory" className="button-ghost">
                    Open Memory
                  </Link>
                </div>
              </div>
            )}
          </div>

          <div className="split-line">
            <h2 className="title-md">Drift warnings</h2>
            <span className="badge">{report?.driftWarnings.length ?? 0}</span>
          </div>
          <div className="memory-list">
            {report?.driftWarnings.length ? (
              report.driftWarnings.map((warning) => (
                <article key={warning.id} className="memory-card">
                  <div className="split-line">
                    <div>
                      <h3 className="title-md">{warning.label}</h3>
                      <p className="caption">
                        {evidenceMemoryTypeLabel(warning.targetType)} / severity {warning.severity}
                      </p>
                    </div>
                    <span className="status-pill">
                      {warning.severity.toUpperCase()}
                    </span>
                  </div>
                  <p className="body-sm">{warning.reason}</p>
                  {warning.recommendedAction.targetRoute ? (
                    <Link href={warning.recommendedAction.targetRoute} className="button-soft">
                      {warning.recommendedAction.title}
                    </Link>
                  ) : null}
                </article>
              ))
            ) : (
              <div className="empty-state">
                No drift warnings yet. Drift Sentinel only flags possible stale or conflicting
                local memories. Save receipts or personal signs, then check back here.
              </div>
            )}
          </div>

          <div className="split-line">
            <h2 className="title-md">Coverage gaps</h2>
            <span className="badge">{report?.coverageGaps.length ?? 0}</span>
          </div>
          <div className="memory-list">
            {report?.coverageGaps.length ? (
              report.coverageGaps.map((gap) => (
                <article key={gap.id} className="memory-card">
                  <div className="split-line">
                    <strong>{gap.label}</strong>
                    <span className="status-pill">{gap.gapType}</span>
                  </div>
                  <p className="body-sm">{gap.why}</p>
                  {gap.recommendedAction.targetRoute ? (
                    <Link href={gap.recommendedAction.targetRoute} className="button-soft">
                      {gap.recommendedAction.title}
                    </Link>
                  ) : null}
                </article>
              ))
            ) : (
              <div className="empty-state">
                No coverage gaps right now. Keep checking as local memories grow, or open Live to
                gather more landmark-derived evidence.
                <div className="button-row">
                  <Link href="/live" className="button-soft">
                    Open Live
                  </Link>
                  <Link href="/memory" className="button-ghost">
                    Open Memory
                  </Link>
                </div>
              </div>
            )}
          </div>

          <div className="split-line">
            <h2 className="title-md">Memory health</h2>
            <span className="badge">{report?.memorySummaries.length ?? 0}</span>
          </div>
          <div className="memory-list">
            {report?.memorySummaries.length ? (
              report.memorySummaries.map((summary) => (
                <article key={`${summary.memoryType}-${summary.memoryId}`} className="memory-card">
                  <div className="split-line">
                    <div>
                      <h3 className="title-md">{summary.label}</h3>
                      <p className="caption">
                        {evidenceMemoryTypeLabel(summary.memoryType)} / updated{" "}
                        {new Date(summary.lastUpdated).toLocaleString()}
                      </p>
                    </div>
                    <span className="status-pill">
                      {evidenceHealthStatusLabel(summary.status)}
                    </span>
                  </div>
                  <p className="body-sm">{statusSummary(summary)}</p>
                  <p className="caption">Score {Math.round(summary.score * 100)} / 100</p>
                  {summary.recommendedAction.targetRoute ? (
                    <Link href={summary.recommendedAction.targetRoute} className="button-soft">
                      {summary.recommendedAction.title}
                    </Link>
                  ) : null}
                </article>
              ))
            ) : (
              <div className="empty-state">
                No local memory health summaries yet. Teach Mode, receipts, repairs, and saved
                cards will appear here. Start in Teach, Live, or Memory.
                <div className="button-row">
                  <Link href="/teach" className="button-soft">
                    Go to Teach
                  </Link>
                  <Link href="/live" className="button-ghost">
                    Open Live
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="section-stack">
          <section className="panel section-stack">
            <strong>Privacy notice</strong>
            <p className="body-sm">
              Evidence Health uses local landmark-derived data only. It is not an accuracy
              certificate.
            </p>
            <p className="caption">
              No raw video, no pixels, no upload. Human or Deaf-led review is still needed before
              deployment.
            </p>
          </section>

          <section className="panel section-stack">
            <h2 className="title-md">Actions</h2>
            <div className="memory-actions">
              <Link href={minimalPairRoute} className="button">
                Open Minimal Pair Lab
              </Link>
              <Link href={teachRoute} className="button-soft">
                Go to Teach Mode
              </Link>
              <Link href="/memory" className="button-ghost">
                Open Memory
              </Link>
              <button
                type="button"
                className="button-ghost"
                onClick={() => void downloadExport()}
                aria-label="Export local data from Evidence Health"
              >
                Export local data
              </button>
              <button
                type="button"
                className="button-ghost"
                onClick={() => void clearStaleMemory()}
                aria-label="Clear stale memory if Evidence Health found one"
              >
                Clear stale memory
              </button>
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
