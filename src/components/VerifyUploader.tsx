"use client";

import { useMemo, useRef, useState } from "react";
import BlindInferenceComparison from "@/components/BlindInferenceComparison";
import BlindExportCompare from "@/components/BlindExportCompare";
import BlindInferenceTimeline from "@/components/BlindInferenceTimeline";
import { PrototypeStore, prototypeStore } from "@/lib/recognition/PrototypeStore";
import {
  benchmarkEvaluator,
  type BenchmarkAnalysis,
  type BenchmarkEvaluator,
} from "@/lib/recognition/BenchmarkEvaluator";
import type { BlindSessionAnchor } from "@/lib/recognition/BlindHypothesis";
import { assertNoRawVideoFields } from "@/lib/privacy/assertNoRawVideoFields";
import PredictionComparison from "@/components/PredictionComparison";
import VerificationTimeline from "@/components/VerificationTimeline";
import {
  updateVerificationReportDraft,
  type VerificationReference,
  type VerificationReport,
} from "@/lib/video/VerificationReport";
import type { BlindInferenceReport } from "@/lib/video/BlindInferenceReport";
import {
  DEFAULT_BENCHMARK_VOCABULARY_PACK_ID,
  listBenchmarkVocabularyPacks,
  type BenchmarkVocabularyPackId,
} from "@/lib/benchmarks/vocabularyPacks";
import { loadBundledVerificationReference } from "@/lib/benchmarks/loadBundledVerificationReference";

interface VerifyUploaderProps {
  prototypeStoreInstance?: PrototypeStore;
  evaluator?: BenchmarkEvaluator;
  forceMockLandmarks?: boolean;
  forceMockVerification?: boolean;
}

type VerifyMode = "blind-inference" | "exact-benchmark" | "concept-benchmark";
type BlindAnalysis = Awaited<ReturnType<BenchmarkEvaluator["analyzeBlindClip"]>>;

function downloadJson(fileName: string, value: unknown) {
  assertNoRawVideoFields(value);
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export default function VerifyUploader({
  prototypeStoreInstance = prototypeStore,
  evaluator = benchmarkEvaluator,
  forceMockLandmarks = false,
  forceMockVerification = false,
}: VerifyUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [verifyMode, setVerifyMode] = useState<VerifyMode>("blind-inference");
  const [benchmarkAnalysis, setBenchmarkAnalysis] = useState<BenchmarkAnalysis | null>(null);
  const [blindAnalysis, setBlindAnalysis] = useState<BlindAnalysis | null>(null);
  const [benchmarkReport, setBenchmarkReport] = useState<VerificationReport | null>(null);
  const [blindReport, setBlindReport] = useState<BlindInferenceReport | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [temporaryAnchors, setTemporaryAnchors] = useState<BlindSessionAnchor[]>([]);
  const [savedBlindLexemeCount, setSavedBlindLexemeCount] = useState(0);
  const [selectedVocabularyPackId, setSelectedVocabularyPackId] =
    useState<BenchmarkVocabularyPackId>(DEFAULT_BENCHMARK_VOCABULARY_PACK_ID);
  const [statusMessage, setStatusMessage] = useState(
    "Upload a new clip, run blind inference, then export landmark-derived validation JSON without loading any bundled expected reference.",
  );
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [reference, setReference] = useState<VerificationReference | null>(null);
  const isBlindMode = verifyMode === "blind-inference";
  const comparisonMode = verifyMode === "exact-benchmark" ? "exact" : "concept-level";

  const calibrationSegmentIds = useMemo(
    () =>
      (reference?.segments ?? [])
        .filter((segment) => segment.useForCalibration)
        .map((segment) => segment.id),
    [reference?.segments],
  );
  const vocabularyPacks = useMemo(() => listBenchmarkVocabularyPacks(), []);

  const readCurrentFile = () => selectedFile ?? fileInputRef.current?.files?.[0] ?? null;

  const handleSelectedFile = (files: FileList | null) => {
    setSelectedFile(files?.[0] ?? null);
    setTemporaryAnchors([]);
  };

  const ensureBenchmarkReference = async () => {
    if (reference) {
      return reference;
    }

    const bundled = await loadBundledVerificationReference();
    setReference(bundled);
    return bundled;
  };

  const processClip = async () => {
    const activeFile = readCurrentFile();

    if (!activeFile) {
      setStatusMessage("Choose mp4 clip first.");
      return;
    }

    setProcessing(true);
    setSaveStatus(null);
    setAnalysisError(null);
    setBenchmarkAnalysis(null);
    setBlindAnalysis(null);
    setBenchmarkReport(null);
    setBlindReport(null);

    try {
      if (isBlindMode) {
        const savedLexemeMemories = await prototypeStoreInstance.loadBlindLexemeMemories();
        setSavedBlindLexemeCount(savedLexemeMemories.length);
        const nextAnalysis = await evaluator.analyzeBlindClip({
          file: activeFile,
          prototypeStore: prototypeStoreInstance,
          forceMockLandmarks,
          forceMockVerification,
        });
        const builtReport = evaluator.buildBlindReport(nextAnalysis, {
          sessionAnchors: temporaryAnchors,
          savedLexemeMemories,
        });

        setBlindAnalysis(nextAnalysis);
        setBlindReport(builtReport);
        setStatusMessage(
          nextAnalysis.extractorKind === "mock"
            ? "Blind inference processed clip in demo fallback. Outputs stay as event-family hypotheses only."
            : nextAnalysis.debug.analysisWarnings.length
              ? "Blind inference processed real uploaded clip. Runtime logs, motif clusters, and skipped frames are in debug drawer."
              : "Blind inference processed real uploaded clip without expected reference text. Event-family hypotheses stay tentative.",
        );
      } else {
        const benchmarkReference = await ensureBenchmarkReference();
        const nextReference = {
          ...benchmarkReference,
          source: "upload" as const,
          clipName: activeFile.name,
        };
        const nextAnalysis = await evaluator.analyzeClip({
          file: activeFile,
          reference: nextReference,
          prototypeStore: prototypeStoreInstance,
          forceMockLandmarks,
          forceMockVerification,
        });
        const builtReport = evaluator.buildReport(nextAnalysis, {
          calibrationSegmentIds,
          vocabularyPackId: selectedVocabularyPackId,
          comparisonMode,
        });

        setReference(nextReference);
        setBenchmarkAnalysis(nextAnalysis);
        setBenchmarkReport(builtReport);
        setStatusMessage(
          nextAnalysis.extractorKind === "mock"
            ? "Verify processed clip in demo fallback. Current model output stays constrained and may not cover story-scale content."
            : nextAnalysis.debug.analysisWarnings.length
              ? "Verify processed real uploaded clip. Non-fatal runtime logs and frame skips were captured in debug drawer."
              : "Verify processed real uploaded clip with on-device landmarks. Current model output is still constrained by known candidate set.",
        );
      }
    } catch (error) {
      setAnalysisError(
        error instanceof Error ? error.message : "Verify processing failed.",
      );
      setStatusMessage(
        "Verify failed on real uploaded clip. Check specific analysis error below.",
      );
    } finally {
      setProcessing(false);
    }
  };

  const rebuildWithCalibration = () => {
    if (!benchmarkAnalysis) {
      return;
    }

    const rebuilt = evaluator.buildReport(
      {
        ...benchmarkAnalysis,
        reference: reference ?? benchmarkAnalysis.reference,
      },
      {
        calibrationSegmentIds,
        vocabularyPackId: selectedVocabularyPackId,
        comparisonMode,
      },
    );

    setBenchmarkReport(rebuilt);
    setSaveStatus(null);
    setStatusMessage(
      calibrationSegmentIds.length
        ? "Re-ran verification with selected calibration segments. Check held-out rate, not calibration-only matches."
        : "Re-ran verification without calibration. Results still reflect constrained vocabulary only.",
    );
  };

  const rebuildForModeOrPack = (
    nextPackId: BenchmarkVocabularyPackId,
    nextMode: VerifyMode,
  ) => {
    if (!benchmarkAnalysis || processing || nextMode === "blind-inference") {
      return;
    }

    setBenchmarkReport(
      evaluator.buildReport(
        {
          ...benchmarkAnalysis,
          reference: reference ?? benchmarkAnalysis.reference,
        },
        {
          calibrationSegmentIds,
          vocabularyPackId: nextPackId,
          comparisonMode: nextMode === "exact-benchmark" ? "exact" : "concept-level",
        },
      ),
    );
  };

  const updateExpected = (segmentId: string, nextExpected: string) => {
    setReference((current) =>
      current
        ? {
            ...current,
            segments: current.segments.map((segment) =>
              segment.id === segmentId
                ? { ...segment, expected: nextExpected }
                : segment,
            ),
          }
        : current,
    );
    setBenchmarkReport((current) =>
        current
          ? updateVerificationReportDraft(current, [
              ...current.reference.segments.map((segment) => ({
                id: segment.id,
                expected: segment.id === segmentId ? nextExpected : segment.expected,
                useForCalibration: segment.useForCalibration,
              })),
            ])
          : current,
    );
  };

  const updateCalibration = (segmentId: string, checked: boolean) => {
    setReference((current) =>
      current
        ? {
            ...current,
            segments: current.segments.map((segment) =>
              segment.id === segmentId
                ? { ...segment, useForCalibration: checked }
                : segment,
            ),
          }
        : current,
    );
    setBenchmarkReport((current) =>
        current
          ? updateVerificationReportDraft(
              current,
              current.reference.segments.map((segment) => ({
                id: segment.id,
                expected: segment.expected,
                useForCalibration:
                  segment.id === segmentId ? checked : segment.useForCalibration,
              })),
            )
          : current,
    );
  };

  const saveReport = async () => {
    if (!benchmarkReport) {
      return;
    }

    const persistedReport: VerificationReport = {
      ...benchmarkReport,
      privacy: {
        ...benchmarkReport.privacy,
        persisted: true,
      },
    };

    await prototypeStoreInstance.saveVerificationReport(persistedReport);
    setBenchmarkReport(persistedReport);
    setSaveStatus("Saved benchmark verification report locally. Landmark-derived data only.");
  };

  const exportReport = () => {
    if (!benchmarkReport) {
      return;
    }

    downloadJson(
      `signrepair-verification-${benchmarkReport.clipName.replace(/\s+/g, "-").toLowerCase()}.json`,
      benchmarkReport,
    );
    setSaveStatus("Exported verification JSON report.");
  };

  const exportBlindReport = () => {
    if (!blindReport) {
      return;
    }

    downloadJson(
      `signrepair-blind-${blindReport.clipName.replace(/\s+/g, "-").toLowerCase()}.json`,
      blindReport,
    );
    setSaveStatus("Exported blind inference JSON report.");
  };

  const saveBlindLexemes = async () => {
    if (!blindReport?.lexemes.length) {
      return;
    }

    await prototypeStoreInstance.createAndSaveBlindLexemeMemory(
      blindReport.clipName,
      blindReport.lexemes,
    );
    const saved = await prototypeStoreInstance.loadBlindLexemeMemories();
    setSavedBlindLexemeCount(saved.length);
    setSaveStatus(
      `Saved ${blindReport.lexemes.length} blind lexemes locally. They can stabilize future blind clip clustering on this device.`,
    );
  };

  const promoteTemporaryAnchor = (segmentId: string) => {
    if (!blindAnalysis || temporaryAnchors.some((anchor) => anchor.sourceSegmentId === segmentId)) {
      return;
    }

    const segment = blindAnalysis.segments.find((item) => item.id === segmentId);

    if (!segment) {
      return;
    }

    const nextAnchors = [
      ...temporaryAnchors,
      {
        id: `temp-anchor-${temporaryAnchors.length + 1}`,
        sourceSegmentId: segmentId,
        createdAt: new Date().toISOString(),
        centroid: [...segment.encoded.centroid],
      },
    ];

    setTemporaryAnchors(nextAnchors);
    setBlindReport(
      evaluator.buildBlindReport(blindAnalysis, {
        sessionAnchors: nextAnchors,
      }),
    );
    setStatusMessage(
      `Added ${segmentId} as temporary anchor. Future blind segments can match it as unlabeled local similarity only.`,
    );
  };

  return (
    <section className="page-shell">
      <div className="panel panel-strong section-stack">
        <span className="eyebrow">Verify</span>
        <div className="split-line">
          <div>
            <h1 className="title-lg">Upload clip and verify constrained model output.</h1>
            <p className="body-sm">
              Upload mp4, then choose blind inference or benchmark review. Blind mode avoids bundled
              expected text for unseen clip validation. Benchmark modes keep explicit exact or concept
              comparison.
            </p>
          </div>
          <span className="demo-badge">
            {forceMockLandmarks ? "Demo fallback" : isBlindMode ? "Blind inference" : "Benchmark-first"}
          </span>
        </div>
      </div>

      <div className="memory-grid">
        <div className="section-stack">
          <section className="panel section-stack">
            <div className="split-line">
              <div>
                <h2 className="title-md">Upload + Verify</h2>
                <p className="body-sm">
                  Current recognizer is still small. Blind mode is default for unseen clip validation.
                  Benchmark modes compare against expected reference without pretending story translation.
                </p>
              </div>
              <span className="badge">
                {(blindReport?.candidateSetSize ?? benchmarkReport?.candidateSetSize ?? 5)} constrained
                {" "}labels
              </span>
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="verify-file">
                Upload signed clip
              </label>
              <input
                id="verify-file"
                ref={fileInputRef}
                type="file"
                accept="video/mp4"
                onChange={(event) => handleSelectedFile(event.target.files)}
                onInput={(event) =>
                  handleSelectedFile((event.target as HTMLInputElement | null)?.files ?? null)
                }
                aria-label="Upload mp4 clip for verification"
              />
            </div>

            <div className="button-row">
              <div className="field-group">
                <label className="field-label" htmlFor="verify-flow-mode">
                  Verify mode
                </label>
                <select
                  id="verify-flow-mode"
                  className="input"
                  value={verifyMode}
                  onChange={(event) => {
                    const nextMode = event.target.value as VerifyMode;
                    setVerifyMode(nextMode);
                    setSaveStatus(null);

                    if (nextMode === "blind-inference") {
                      if (blindAnalysis) {
                        setBlindReport(
                          evaluator.buildBlindReport(blindAnalysis, {
                            sessionAnchors: temporaryAnchors,
                          }),
                        );
                      }
                        setStatusMessage(
                        "Blind inference mode stays reference-free for unseen clip validation and shows landmark-derived event-family hypotheses only.",
                      );
                    } else {
                      rebuildForModeOrPack(selectedVocabularyPackId, nextMode);
                      setStatusMessage(
                        nextMode === "exact-benchmark"
                          ? "Exact benchmark mode keeps strict string-level comparison against expected reference."
                          : "Concept benchmark mode estimates partial coverage against expected reference.",
                      );
                    }
                  }}
                  aria-label="Select verify mode"
                >
                  <option value="blind-inference">Blind inference</option>
                  <option value="exact-benchmark">Exact benchmark</option>
                  <option value="concept-benchmark">Concept benchmark</option>
                </select>
              </div>
              {!isBlindMode ? (
              <div className="field-group">
                <label className="field-label" htmlFor="verify-pack">
                  Vocabulary pack
                </label>
                <select
                  id="verify-pack"
                  className="input"
                  value={selectedVocabularyPackId}
                  onChange={(event) => {
                    const nextPackId = event.target.value as BenchmarkVocabularyPackId;
                    setSelectedVocabularyPackId(nextPackId);
                    rebuildForModeOrPack(nextPackId, verifyMode);
                  }}
                  aria-label="Select benchmark vocabulary pack"
                >
                  {vocabularyPacks.map((pack) => (
                    <option key={pack.id} value={pack.id}>
                      {pack.label}
                    </option>
                  ))}
                </select>
              </div>
              ) : null}
            </div>

            <div className="button-row">
              <button
                type="button"
                className="button"
                onClick={() => void processClip()}
                disabled={!selectedFile || processing}
                aria-label="Process uploaded clip for verification"
              >
                {processing
                  ? "Processing clip"
                  : isBlindMode
                    ? "Run blind inference"
                    : "Process clip"}
              </button>
              {!isBlindMode ? (
                <button
                  type="button"
                  className="button-ghost"
                  onClick={() => {
                    void loadBundledVerificationReference().then((nextReference) => {
                      setReference(nextReference);
                      setSaveStatus(null);
                      setStatusMessage("Reset expected reference to bundled benchmark.");
                    });
                  }}
                  aria-label="Reset expected reference to bundled benchmark"
                >
                  Reset bundled reference
                </button>
              ) : null}
              <label className="checkbox-row" htmlFor="verify-debug">
                <input
                  id="verify-debug"
                  type="checkbox"
                  checked={debugEnabled}
                  onChange={(event) => setDebugEnabled(event.target.checked)}
                  aria-label="Show verify debug details"
                />
                <span>Debug mode</span>
              </label>
            </div>

            <div className="info-box">
              <strong>{isBlindMode ? "Blind inference mode" : "Benchmark mode"}</strong>
              <p className="body-sm">
                {isBlindMode
                  ? "Blind mode does not load bundled expected reference or concept mapping. It shows exact guesses only when evidence is strong, then falls back to event-family hypotheses, phases, blind lexemes, failure tags, and improve-next validation notes."
                  : "This clip can exceed current exact-label recognizer. Benchmark modes estimate exact or concept-level coverage only."}
              </p>
            </div>

            <div className="info-box">
              <strong>Privacy</strong>
              <p className="body-sm">
                Uploaded clip stays in memory for current session only. Verification reports save
                landmark-derived data only unless you explicitly export JSON.
              </p>
              <p className="caption">
                Raw video persistence stays off by default. Model output must stay visible even when
                it cannot cover story-scale content.
              </p>
            </div>

            {isBlindMode ? (
              <div className="info-box">
                <strong>Temporary anchors</strong>
                <p className="body-sm">
                  Promote segment into unlabeled session anchor if you want local similarity checks
                  without injecting transcript text or benchmark answer keys.
                </p>
                <p className="caption">
                  Anchors in session: {temporaryAnchors.length}. Saved blind lexeme memories:{" "}
                  {savedBlindLexemeCount}. Session anchors are not saved unless you export or save
                  discovered lexemes locally.
                </p>
              </div>
            ) : null}

            {analysisError ? (
              <div className="warning-box" role="alert">
                <strong>Verify analysis failed</strong>
                <p className="body-sm">{analysisError}</p>
              </div>
            ) : null}

            <p className="body-sm" aria-live="polite">
              {statusMessage}
            </p>
          </section>

          {!isBlindMode && benchmarkReport ? (
            <PredictionComparison
              report={benchmarkReport}
              onSave={() => void saveReport()}
              onExport={exportReport}
              onRebuildWithCalibration={rebuildWithCalibration}
              saveStatus={saveStatus}
              debugEnabled={debugEnabled}
              comparisonMode={comparisonMode}
            />
          ) : null}

          {isBlindMode && blindReport ? (
            <BlindInferenceComparison
              report={blindReport}
              onExport={exportBlindReport}
              onSaveLexemes={() => void saveBlindLexemes()}
              debugEnabled={debugEnabled}
              saveStatus={saveStatus}
            />
          ) : null}

          {isBlindMode ? <BlindExportCompare /> : null}

          {!isBlindMode && benchmarkReport ? (
            <VerificationTimeline
              segments={benchmarkReport.segments}
              onExpectedChange={updateExpected}
              onCalibrationChange={updateCalibration}
              debugEnabled={debugEnabled}
              comparisonMode={comparisonMode}
            />
          ) : null}

          {isBlindMode && blindReport ? (
            <BlindInferenceTimeline
              segments={blindReport.segments}
              onPromoteAnchor={promoteTemporaryAnchor}
              anchoredSegmentIds={temporaryAnchors.map((anchor) => anchor.sourceSegmentId)}
              debugEnabled={debugEnabled}
            />
          ) : null}

          {isBlindMode && !blindReport ? (
            <section className="panel empty-state">
              No unseen clip validation report yet. Upload mp4, run blind inference, then review
              event-family chain, lexeme chain, failure tags, unresolved segments, and export blind
              JSON here.
            </section>
          ) : null}

          {!isBlindMode && !benchmarkReport ? (
            <section className="panel empty-state">
              No verification report yet. Upload mp4, process clip, then review expected reference,
              model output, match result, and export JSON report here.
            </section>
          ) : null}
        </div>

        <aside className="section-stack">
          {!isBlindMode && reference ? (
            <section className="panel section-stack">
              <h2 className="title-md">Reference note</h2>
              <p className="body-sm">{reference.notes}</p>
              <p className="caption">
                Treat expected text as human-reviewed English summary, not exact ASL gloss.
              </p>
            </section>
          ) : null}

          <section className="panel section-stack">
            <h2 className="title-md">
              {isBlindMode ? "Current blind mode" : "Current benchmark mode"}
            </h2>
            <p className="body-sm">
                {isBlindMode
                ? "Blind inference uses exact known-candidate guesses only when confidence is strong. Otherwise it shows event-family hypotheses, segment phases, discovered blind lexemes, and validation failure tags from motion, handshape, placement, timing, mouth, face, and visibility cues."
                : "Demo vocabulary mode is still small. Benchmark verification mode shows exact guesses, uncertainty, coverage limits, and mismatch instead of pretending narrative translation."}
            </p>
            <div className="receipt-summary-list">
              <p className="caption">Current guess</p>
              <p className="caption">Other possibilities</p>
              <p className="caption">Why unsure</p>
              <p className="caption">What to fix</p>
              {!isBlindMode ? (
                <>
                  <p className="caption">Expected reference</p>
                  <p className="caption">Model output</p>
                  <p className="caption">Match result</p>
                  <p className="caption">Coverage result</p>
                </>
              ) : (
                <>
                  <p className="caption">Best hypothesis</p>
                  <p className="caption">Top exact label guess</p>
                  <p className="caption">Event-family hypothesis</p>
                  <p className="caption">Blind lexeme chain</p>
                  <p className="caption">Phase structure</p>
                  <p className="caption">Failure tags</p>
                  <p className="caption">Improve next</p>
                </>
              )}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
