"use client";

import type { BlindInferenceReport } from "@/lib/video/BlindInferenceReport";

interface BlindInferenceTimelineProps {
  segments: BlindInferenceReport["segments"];
  onPromoteAnchor: (segmentId: string) => void;
  anchoredSegmentIds: string[];
  debugEnabled: boolean;
}

function formatTime(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function BlindInferenceTimeline({
  segments,
  onPromoteAnchor,
  anchoredSegmentIds,
  debugEnabled,
}: BlindInferenceTimelineProps) {
  return (
    <section className="panel section-stack">
      <div className="split-line">
        <div>
          <h2 className="title-md">Blind inference timeline</h2>
          <p className="body-sm">
            Review segment event-family hypotheses, phases, blind lexemes, and why uncertainty
            stayed visible.
          </p>
        </div>
        <span className="badge">{segments.length} segments</span>
      </div>

      <div className="memory-list">
        {segments.map((segment) => {
          const isAnchored = anchoredSegmentIds.includes(segment.id);

          return (
            <article key={segment.id} className="memory-card section-stack">
              <div className="split-line">
                <div>
                  <h3 className="title-md">{segment.id}</h3>
                  <p className="caption">
                    {formatTime(segment.startMs)} - {formatTime(segment.endMs)}
                  </p>
                </div>
                <div className="button-row">
                  <span className="status-pill">
                    {segment.unresolved ? "unresolved" : "stable"}
                  </span>
                  <span className="badge">{Math.round(segment.confidence * 100)}%</span>
                </div>
              </div>

              <div className="verify-grid">
                <div className="prediction-card section-stack">
                  <span className="caption">Best hypothesis</span>
                  <h3 className="title-md">{segment.bestHypothesis}</h3>
                  <p className="body-sm">
                    Top exact label guess: {segment.exactLabelGuess ?? "none"}
                  </p>
                  <p className="body-sm">
                    Final event family: {segment.eventFamilyHypothesis ?? segment.actionHypothesis}
                  </p>
                  <p className="body-sm">Runner-up family: {segment.runnerUpFamily ?? "none"}</p>
                  <p className="body-sm">
                    Confidence margin: {Math.round(segment.confidenceMargin * 100)}%
                  </p>
                  <p className="body-sm">
                    Transition support: {Math.round(segment.localTransitionSupport * 100)}%
                  </p>
                  <p className="body-sm">
                    Blind lexemes: {segment.lexemeIds.length ? segment.lexemeIds.join(" / ") : "none"}
                  </p>
                  <p className="body-sm">
                    Motif tags: {segment.motifTags.length ? segment.motifTags.join(" / ") : "none"}
                  </p>
                </div>

                <div className="prediction-card section-stack">
                  <span className="caption">Why unsure</span>
                  <div className="receipt-summary-list">
                    <p className="caption">{segment.uncertaintyReason}</p>
                    <p className="caption">Translation Debt: {segment.debtLabel}</p>
                    <p className="caption">Hypothesis reason: {segment.hypothesisReason}</p>
                    <p className="caption">
                      Evidence channels: {segment.evidenceChannels.join(" / ")}
                    </p>
                    <p className="caption">
                      Motif cluster: {segment.motifClusterId ?? "none"}
                    </p>
                    <p className="caption">
                      Repeated cycles: {segment.repeatedCycleCount}
                    </p>
                    <p className="caption">
                      Phase-family votes:{" "}
                      {segment.phaseFamilyVotes.length
                        ? segment.phaseFamilyVotes
                            .map((vote) => `${vote.label} ${Math.round(vote.score * 100)}%`)
                            .join(" / ")
                        : "none"}
                    </p>
                    <p className="caption">
                      Failure tags:{" "}
                      {segment.failureTags.length ? segment.failureTags.join(" / ") : "none"}
                    </p>
                    <p className="caption">
                      Confidence mix: motion {Math.round(segment.confidenceBreakdown.motion * 100)}% / handshape{" "}
                      {Math.round(segment.confidenceBreakdown.handshape * 100)}% / placement{" "}
                      {Math.round(segment.confidenceBreakdown.placement * 100)}% / pose{" "}
                      {Math.round(segment.confidenceBreakdown.pose * 100)}% / mouth-face{" "}
                      {Math.round(segment.confidenceBreakdown.mouthFace * 100)}%
                    </p>
                    <p className="caption">
                      Handshape changes: volatility{" "}
                      {Math.round(segment.handshapeChangeStats.volatility * 100)}% / count{" "}
                      {segment.handshapeChangeStats.changeCount} / compact burst{" "}
                      {Math.round(segment.handshapeChangeStats.compactBurstScore * 100)}%
                    </p>
                    <p className="caption">
                      Body reaction: torso {Math.round(segment.bodyReactionStats.torsoDisplacement * 100)}% /
                      shoulder {Math.round(segment.bodyReactionStats.shoulderLift * 100)}% / bounce{" "}
                      {Math.round(segment.bodyReactionStats.headBounce * 100)}% / spread{" "}
                      {Math.round(segment.bodyReactionStats.armSpreadChange * 100)}% / aftermath{" "}
                      {Math.round(segment.bodyReactionStats.reactionAftermathScore * 100)}%
                    </p>
                    <p className="caption">
                      Quality: hand {Math.round(segment.qualitySignals.handVisibleRatio * 100)}% / face{" "}
                      {Math.round(segment.qualitySignals.faceVisibleRatio * 100)}% / mouth{" "}
                      {Math.round(segment.qualitySignals.mouthStability * 100)}% / occlusion{" "}
                      {Math.round(segment.qualitySignals.occlusionRatio * 100)}%
                    </p>
                    <p className="caption">
                      Phase roles:{" "}
                      {segment.phaseRoleSummary.length ? segment.phaseRoleSummary.join(" / ") : "none"}
                    </p>
                    <p className="caption">
                      Phases:{" "}
                      {segment.phases.length
                        ? segment.phases
                            .map(
                              (phase) =>
                                `${phase.kind} (${phase.role})${phase.lexemeId ? ` [${phase.lexemeId}]` : ""}${
                                  phase.strokeCount ? ` x${phase.strokeCount}` : ""
                                }`,
                            )
                            .join(" / ")
                        : "none"}
                    </p>
                    <p className="caption">
                      Clip refinement:{" "}
                      {segment.refinementChanged
                        ? `${segment.refinedFromFamily} -> ${segment.eventFamilyHypothesis}`
                        : "no relabel"}
                    </p>
                    {segment.refinementReason ? (
                      <p className="caption">Refinement reason: {segment.refinementReason}</p>
                    ) : null}
                    <p className="caption">
                      Other possibilities:{" "}
                      {segment.alternatives.length
                        ? segment.alternatives
                            .map((alternative) =>
                              `${alternative.label} (${Math.round(alternative.confidence * 100)}%)`,
                            )
                            .join(" / ")
                        : "none"}
                    </p>
                    {debugEnabled && segment.debug ? (
                      <p className="caption">
                        Debug: frames {segment.debug.framesAnalyzed} / detector failures{" "}
                        {segment.debug.detectorFailures}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="button-row">
                <button
                  type="button"
                  className="button-soft"
                  onClick={() => onPromoteAnchor(segment.id)}
                  disabled={isAnchored}
                  aria-label={`Promote ${segment.id} as temporary anchor`}
                >
                  {isAnchored ? "Temporary anchor added" : "Promote as temporary anchor"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
