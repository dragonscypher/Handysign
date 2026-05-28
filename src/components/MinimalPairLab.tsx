"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  startTransition,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import LandmarkOverlay from "@/components/LandmarkOverlay";
import { featureSummaryFromSequence } from "@/lib/features/ChannelDeltaAnalyzer";
import { featureEncoder } from "@/lib/features/FeatureEncoder";
import { E2ELandmarkExtractor } from "@/lib/testing/E2ELandmarkExtractor";
import {
  createE2EConfusionTwinSnapshot,
  createE2EEncodedSequence,
} from "@/lib/testing/e2eFixtures";
import type { LiveE2EScenario } from "@/lib/testing/e2eFlags";
import {
  HolisticLandmarkExtractor,
  MockLandmarkExtractor,
} from "@/lib/landmarks/LandmarkExtractor";
import {
  CameraStartError,
  startUserCamera,
  stopUserCamera,
} from "@/lib/landmarks/camera";
import type {
  LandmarkExtractor,
  LandmarkSnapshot,
} from "@/lib/landmarks/types";
import {
  minimalPairBuilder,
  type MinimalPairBuilderInput,
} from "@/lib/minimal-pairs/MinimalPairBuilder";
import type {
  MinimalPairCard,
  MinimalPairExample,
} from "@/lib/minimal-pairs/MinimalPair";
import {
  saveSessionMinimalPairCard,
} from "@/lib/minimal-pairs/MinimalPairSessionStore";
import { assertNoRawVideoFields } from "@/lib/privacy/assertNoRawVideoFields";
import { LocalDataStore, localDataStore } from "@/lib/privacy/LocalDataStore";
import { buildMotionReceipt } from "@/lib/receipts/MotionReceiptBuilder";
import { candidateRecognizer } from "@/lib/recognition/CandidateRecognizer";
import type {
  CandidatePrototype,
  EncodedSequence,
} from "@/lib/recognition/types";
import {
  mergeCandidateCatalog,
  PrototypeStore,
  prototypeStore,
} from "@/lib/recognition/PrototypeStore";

interface MinimalPairLabProps {
  initialCandidateAId?: string;
  initialCandidateBId?: string;
  extractorFactory?: () => LandmarkExtractor;
  cameraStarter?: (video: HTMLVideoElement) => Promise<MediaStream | null>;
  dataStore?: LocalDataStore;
  prototypeStoreInstance?: PrototypeStore;
  forceMockLandmarks?: boolean;
  e2eScenario?: LiveE2EScenario;
}

const DEFAULT_SIZE = { width: 640, height: 480 };

function getCameraErrorMessage(error: unknown) {
  if (error instanceof CameraStartError) {
    return error.userMessage;
  }

  return "Camera could not start. Check browser support and permissions, then try again.";
}

function exampleId(side: "A" | "B", label: string) {
  return `minimal-pair-${side}-${label.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function formatSource(source: CandidatePrototype["source"]) {
  return source === "demo" ? "demo" : "personal";
}

export default function MinimalPairLab({
  initialCandidateAId = "",
  initialCandidateBId = "",
  extractorFactory,
  cameraStarter = startUserCamera,
  dataStore = localDataStore,
  prototypeStoreInstance = prototypeStore,
  forceMockLandmarks = false,
  e2eScenario = null,
}: MinimalPairLabProps) {
  const pathname = usePathname();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const extractorRef = useRef<LandmarkExtractor | null>(null);
  const latestSequenceRef = useRef<EncodedSequence | null>(null);
  const latestSnapshotRef = useRef<LandmarkSnapshot | null>(null);

  const [consentAccepted, setConsentAccepted] = useState<boolean | null>(null);
  const [personalCandidates, setPersonalCandidates] = useState<CandidatePrototype[]>([]);
  const [candidateAId, setCandidateAId] = useState(initialCandidateAId);
  const [candidateBId, setCandidateBId] = useState(initialCandidateBId);
  const [cameraMode, setCameraMode] = useState<"live" | "demo">("live");
  const [videoSize, setVideoSize] = useState(DEFAULT_SIZE);
  const [snapshot, setSnapshot] = useState<LandmarkSnapshot | null>(null);
  const [examplesA, setExamplesA] = useState<MinimalPairExample[]>([]);
  const [examplesB, setExamplesB] = useState<MinimalPairExample[]>([]);
  const [builtCard, setBuiltCard] = useState<MinimalPairCard | null>(null);
  const [userNotes, setUserNotes] = useState("");
  const [statusMessage, setStatusMessage] = useState(
    "Collect 2 to 3 landmark-only examples for each local candidate.",
  );
  const [startupError, setStartupError] = useState<string | null>(null);
  const [demoReason, setDemoReason] = useState<string | null>(null);

  const candidateCatalog = useMemo(
    () => mergeCandidateCatalog(personalCandidates),
    [personalCandidates],
  );
  const selectedCandidateAId = candidateAId || candidateCatalog[0]?.id || "";
  const selectedCandidateBId = candidateBId || candidateCatalog[1]?.id || "";
  const candidateA =
    candidateCatalog.find((candidate) => candidate.id === selectedCandidateAId) ?? null;
  const candidateB =
    candidateCatalog.find((candidate) => candidate.id === selectedCandidateBId) ?? null;

  const handleSnapshot = useEffectEvent((nextSnapshot: LandmarkSnapshot) => {
    latestSnapshotRef.current = nextSnapshot;
    latestSequenceRef.current = e2eScenario
      ? createE2EEncodedSequence(e2eScenario)
      : featureEncoder.encode(nextSnapshot.buffer);
    startTransition(() => {
      setSnapshot(nextSnapshot);
    });
  });

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    const teardown = () => {
      unsubscribe?.();
      unsubscribe = undefined;
      extractorRef.current?.stop();
      extractorRef.current = null;
      stopUserCamera(streamRef.current, videoRef.current ?? undefined);
      streamRef.current = null;
    };

    const boot = async () => {
      const accepted = await dataStore.getSetting("consentAccepted", false);
      const nextCandidates = await prototypeStoreInstance.loadPersonalCandidates();

      if (!active) {
        return;
      }

      setConsentAccepted(accepted);
      setPersonalCandidates(nextCandidates);
      setStartupError(null);
      setDemoReason(null);
      setCameraMode("live");

      if (!accepted || !videoRef.current) {
        setStatusMessage("Consent screen must be acknowledged before recording pair examples.");
        return;
      }

      let stream: MediaStream | null = null;

      try {
        stream = await cameraStarter(videoRef.current);
        streamRef.current = stream;
      } catch (error) {
        const message = getCameraErrorMessage(error);

        if (!active) {
          return;
        }

        setStartupError(message);
        setStatusMessage(message);
        return;
      }

      let extractor =
        extractorFactory?.() ??
        (e2eScenario
          ? new E2ELandmarkExtractor(e2eScenario)
          : new HolisticLandmarkExtractor());
      let nextDemoReason: string | null = null;

      if (e2eScenario) {
        await extractor.start(videoRef.current);
        nextDemoReason =
          "Demo Mode: mock landmarks active for repeatable Minimal Pair Lab QA.";
      } else {
        try {
          if (forceMockLandmarks) {
            throw new Error("Forced MediaPipe failure for browser QA.");
          }

          await extractor.start(videoRef.current);
        } catch {
          extractor.stop();
          extractor = new MockLandmarkExtractor();
          await extractor.start(videoRef.current);
          nextDemoReason =
            "Demo Mode: mock landmarks active because MediaPipe could not load.";
        }
      }

      if (!active) {
        extractor.stop();
        stopUserCamera(stream, videoRef.current);
        return;
      }

      extractorRef.current = extractor;
      unsubscribe = extractor.subscribe(handleSnapshot);

      const nextMode = extractor.getKind() === "mock" ? "demo" : "live";
      setCameraMode(nextMode);

      if (nextMode === "demo") {
        setDemoReason(
          nextDemoReason ?? "Demo Mode: mock landmarks active for this session.",
        );
        setStatusMessage(
          nextDemoReason ?? "Demo Mode: mock landmarks active for this session.",
        );
        return;
      }

      setStatusMessage("Live landmark capture is active. Record 2 to 3 examples for each side.");
    };

    void boot();

    return () => {
      active = false;
      teardown();
    };
  }, [
    cameraStarter,
    dataStore,
    e2eScenario,
    extractorFactory,
    forceMockLandmarks,
    pathname,
    prototypeStoreInstance,
  ]);

  const buildExample = (
    side: "A" | "B",
    candidate: CandidatePrototype,
    sequence: EncodedSequence,
    landmarkSnapshot: LandmarkSnapshot,
  ) => {
    const recognition = candidateRecognizer.recognize(sequence, {
      candidates: [candidate],
      topK: 1,
    });
    const decision = {
      mode: "accept" as const,
      debtType: "clean" as const,
      debtLabel: "Clean",
      message: "Local minimal-pair capture anchored to chosen candidate for inspectability.",
      explanation:
        "Minimal Pair Lab uses the chosen candidate as local review anchor. This is not official ASL analysis.",
      confidence: recognition.top1?.confidence ?? 0,
      margin: 1,
      primaryCandidate: recognition.top1,
      alternatives: [],
      recommendedActions: ["accept" as const],
      acceptedText: candidate.label,
    };
    const receipt = buildMotionReceipt({
      landmarkBuffer: landmarkSnapshot.buffer,
      encodedSequence: sequence,
      recognition,
      decision,
      mode: "teach",
      source: e2eScenario || forceMockLandmarks ? "e2e" : "minimal-pair-lab",
    });

    return {
      receipt,
      example: {
        id: exampleId(side, candidate.label),
        capturedAt: new Date().toISOString(),
        receiptId: receipt.id,
        encodedFeatureSummary: featureSummaryFromSequence(sequence),
        signFormLedger: receipt.signFormLedger!,
        qualitySummary: sequence.quality,
      } satisfies MinimalPairExample,
    };
  };

  const captureContext = () => {
    const sequence = latestSequenceRef.current;
    const currentSnapshot = latestSnapshotRef.current;

    if (sequence && currentSnapshot) {
      return {
        sequence,
        snapshot: currentSnapshot,
      };
    }

    if (e2eScenario) {
      return {
        sequence: createE2EEncodedSequence(e2eScenario),
        snapshot: createE2EConfusionTwinSnapshot(),
      };
    }

    return null;
  };

  const captureExample = (side: "A" | "B") => {
    const candidate = side === "A" ? candidateA : candidateB;
    const context = captureContext();

    if (!candidate || !context) {
      setStatusMessage("Need live landmark window before recording local pair example.");
      return;
    }

    if (context.sequence.frameCount < 24) {
      setStatusMessage("Need more motion history before recording. Repeat sign a bit longer.");
      return;
    }

    const { example } = buildExample(side, candidate, context.sequence, context.snapshot);

    if (side === "A") {
      setExamplesA((current) => [...current.slice(-2), example]);
    } else {
      setExamplesB((current) => [...current.slice(-2), example]);
    }

    setBuiltCard(null);
    setStatusMessage(
      `Recorded ${candidate.label} as example ${side}. Landmark-only local capture saved in lab state.`,
    );
  };

  const buildContrastCard = () => {
    if (!candidateA || !candidateB || candidateA.id === candidateB.id) {
      setStatusMessage("Choose two different known candidates before building contrast card.");
      return;
    }

    if (examplesA.length < 2 || examplesB.length < 2) {
      setStatusMessage("Need at least 2 examples for candidate A and candidate B.");
      return;
    }

    const nextCard = minimalPairBuilder.build({
      candidateA,
      candidateB,
      examplesA,
      examplesB,
      userNotes,
    } satisfies MinimalPairBuilderInput);

    setBuiltCard(nextCard);
    setStatusMessage(
      `Built local contrast card: ${candidateA.label} vs ${candidateB.label}. Review before saving.`,
    );
  };

  const persistCard = async (persistLocally: boolean) => {
    if (!builtCard) {
      return;
    }

    const card: MinimalPairCard = {
      ...builtCard,
      updatedAt: new Date().toISOString(),
      userNotes: userNotes.trim(),
    };

    assertNoRawVideoFields(card);

    if (persistLocally) {
      await prototypeStoreInstance.saveMinimalPairCard(card);
      setStatusMessage(
        `Saved Minimal Pair Lab card locally: ${card.candidateA.label} vs ${card.candidateB.label}.`,
      );
    } else {
      saveSessionMinimalPairCard(card);
      setStatusMessage(
        `Minimal Pair Lab card active for this session only: ${card.candidateA.label} vs ${card.candidateB.label}.`,
      );
    }

    setBuiltCard(card);
  };

  const discardCard = () => {
    setExamplesA([]);
    setExamplesB([]);
    setBuiltCard(null);
    setUserNotes("");
    setStatusMessage("Minimal Pair Lab state cleared. No local card saved.");
  };

  if (consentAccepted === false) {
    return (
      <section className="page-shell">
        <div className="panel warning-box">
          <strong>Consent not recorded yet.</strong>
          <p className="body-sm">
            Minimal Pair Lab will not open camera until the consent screen is acknowledged.
          </p>
          <Link href="/" className="button">
            Go to consent screen
          </Link>
        </div>
      </section>
    );
  }

  const modeBadge = startupError
    ? "Camera unavailable"
    : cameraMode === "demo"
      ? "Demo Mode: mock landmarks"
      : "Live landmark capture";

  return (
    <section className="page-shell">
      <div className="teach-grid">
        <div className="panel section-stack">
          <span className="eyebrow">Minimal Pair Lab</span>
          <h1 className="title-lg">Compare confusing local candidates.</h1>
          <p className="body-sm">
            Compare confusing local candidates with landmark-derived evidence only. This does not
            produce official ASL analysis.
          </p>

          {startupError ? (
            <div className="warning-box" role="alert">
              <strong>Camera could not start.</strong>
              <p className="body-sm">{startupError}</p>
            </div>
          ) : null}

          {cameraMode === "demo" ? (
            <div className="info-box" role="status" aria-live="polite">
              <strong>Demo Mode: mock landmarks</strong>
              <p className="body-sm">
                {demoReason ??
                  "Mock landmarks are active. Treat this as QA demo, not live sign evidence."}
              </p>
            </div>
          ) : null}

          <div className="video-shell">
            <div className="video-stage mirror-surface">
              <video
                ref={videoRef}
                className="camera-video"
                autoPlay
                muted
                playsInline
                aria-label="Minimal Pair Lab camera preview"
                onLoadedMetadata={(event) => {
                  const element = event.currentTarget;
                  if (element.videoWidth && element.videoHeight) {
                    setVideoSize({
                      width: element.videoWidth,
                      height: element.videoHeight,
                    });
                  }
                }}
              />
              <LandmarkOverlay
                snapshot={snapshot}
                width={videoSize.width}
                height={videoSize.height}
                visible
              />
            </div>
            <div className="video-toolbar">
              <div className="glass-strip">
                <span>{modeBadge}</span>
              </div>
              <div className="glass-strip" role="status" aria-live="polite">
                <span>{statusMessage}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="section-stack">
          <section className="panel section-stack">
            <div className="receipt-grid">
              <div className="field-group">
                <label className="field-label" htmlFor="minimal-pair-a">
                  Candidate A
                </label>
                <select
                  id="minimal-pair-a"
                  className="text-input"
                  value={selectedCandidateAId}
                  onChange={(event) => setCandidateAId(event.target.value)}
                  aria-label="Choose candidate A for Minimal Pair Lab"
                >
                  <option value="">Choose candidate A</option>
                  {candidateCatalog.map((candidate) => (
                    <option key={`a-${candidate.id}`} value={candidate.id}>
                      {candidate.label} ({formatSource(candidate.source)})
                    </option>
                  ))}
                </select>
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="minimal-pair-b">
                  Candidate B
                </label>
                <select
                  id="minimal-pair-b"
                  className="text-input"
                  value={selectedCandidateBId}
                  onChange={(event) => setCandidateBId(event.target.value)}
                  aria-label="Choose candidate B for Minimal Pair Lab"
                >
                  <option value="">Choose candidate B</option>
                  {candidateCatalog.map((candidate) => (
                    <option key={`b-${candidate.id}`} value={candidate.id}>
                      {candidate.label} ({formatSource(candidate.source)})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="button-row">
              <button
                type="button"
                className="button"
                onClick={() => captureExample("A")}
                disabled={!candidateA || candidateA.id === candidateB?.id}
                aria-label="Record example for A"
              >
                Record example for A
              </button>
              <button
                type="button"
                className="button"
                onClick={() => captureExample("B")}
                disabled={!candidateB || candidateB.id === candidateA?.id}
                aria-label="Record example for B"
              >
                Record example for B
              </button>
              <button
                type="button"
                className="button-soft"
                onClick={buildContrastCard}
                disabled={
                  !candidateA ||
                  !candidateB ||
                  candidateA.id === candidateB.id ||
                  examplesA.length < 2 ||
                  examplesB.length < 2
                }
                aria-label="Build contrast card from recorded minimal pair examples"
              >
                Build contrast card
              </button>
            </div>
          </section>

          <section className="panel section-stack">
            <div className="split-line">
              <h2 className="title-md">Recorded examples</h2>
              <span className="badge">
                A {examplesA.length} / B {examplesB.length}
              </span>
            </div>
            <div className="receipt-grid">
              <article className="prediction-card">
                <span className="caption">Candidate A</span>
                <h3 className="title-md">{candidateA?.label ?? "Choose candidate A"}</h3>
                <div className="receipt-summary-list">
                  {examplesA.length ? (
                    examplesA.map((example, index) => (
                      <p key={example.id} className="caption">
                        Example {index + 1}: motion {example.qualitySummary.motionEnergy.toFixed(2)}
                        {" / "}visibility {Math.round(example.qualitySummary.handVisibleRatio * 100)}%
                      </p>
                    ))
                  ) : (
                    <p className="caption">Need 2 to 3 examples.</p>
                  )}
                </div>
              </article>
              <article className="prediction-card">
                <span className="caption">Candidate B</span>
                <h3 className="title-md">{candidateB?.label ?? "Choose candidate B"}</h3>
                <div className="receipt-summary-list">
                  {examplesB.length ? (
                    examplesB.map((example, index) => (
                      <p key={example.id} className="caption">
                        Example {index + 1}: motion {example.qualitySummary.motionEnergy.toFixed(2)}
                        {" / "}visibility {Math.round(example.qualitySummary.handVisibleRatio * 100)}%
                      </p>
                    ))
                  ) : (
                    <p className="caption">Need 2 to 3 examples.</p>
                  )}
                </div>
              </article>
            </div>
          </section>

          <section className="panel section-stack">
            <div className="split-line">
              <h2 className="title-md">Contrast card</h2>
              <span className="badge">{builtCard ? "ready" : "not built"}</span>
            </div>
            {builtCard ? (
              <>
                <p className="body-sm">{builtCard.signFormContrast.explanation}</p>
                <div className="receipt-summary-list">
                  <p className="caption">
                    Strongest slot difference:{" "}
                    {builtCard.signFormContrast.strongestSlotDifference
                      ? builtCard.signFormContrast.strongestSlotDifference.slot
                      : "none singled out"}
                  </p>
                  <p className="caption">
                    Strongest channel:{" "}
                    {builtCard.channelContrast.strongestChannel?.channel ?? "none singled out"}
                  </p>
                  <p className="caption">
                    Repair hint:{" "}
                    {builtCard.repairHints[0]?.cuePatchKind ?? "none singled out"}
                  </p>
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="minimal-pair-notes">
                    Local notes
                  </label>
                  <textarea
                    id="minimal-pair-notes"
                    className="textarea"
                    value={userNotes}
                    onChange={(event) => setUserNotes(event.target.value)}
                    placeholder="Optional local note for this contrast card"
                    aria-label="Local notes for Minimal Pair Lab contrast card"
                  />
                </div>
                <div className="button-row">
                  <button
                    type="button"
                    className="button"
                    onClick={() => void persistCard(true)}
                    aria-label="Save Minimal Pair Lab contrast card locally"
                  >
                    Save locally
                  </button>
                  <button
                    type="button"
                    className="button-soft"
                    onClick={() => void persistCard(false)}
                    aria-label="Use Minimal Pair Lab contrast card for this session only"
                  >
                    Use as session-only
                  </button>
                  <button
                    type="button"
                    className="button-ghost"
                    onClick={discardCard}
                    aria-label="Discard Minimal Pair Lab contrast card"
                  >
                    Discard
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-state">
                Record 2 to 3 landmark-only examples for each side, then build local contrast
                card. Saved cards can be reviewed later in Memory.
              </div>
            )}
            <p className="body-sm">
              Landmark-derived evidence only. No raw video. Session-only cards stay local to this
              browser tab until refresh.
            </p>
            <div className="button-row">
              <Link href="/live" className="button-ghost">
                Back to live review
              </Link>
              <Link href="/memory" className="button-ghost">
                Review local memory
              </Link>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
