"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  startTransition,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import LandmarkOverlay from "@/components/LandmarkOverlay";
import { buildConfusionPair, strongestDifferenceLabel } from "@/lib/features/ChannelDeltaAnalyzer";
import { featureEncoder } from "@/lib/features/FeatureEncoder";
import { strongestChannelDelta } from "@/lib/recognition/ContrastiveMemory";
import {
  HolisticLandmarkExtractor,
  MockLandmarkExtractor,
} from "@/lib/landmarks/LandmarkExtractor";
import {
  CameraStartError,
  startUserCamera,
  stopUserCamera,
} from "@/lib/landmarks/camera";
import type { LandmarkExtractor, LandmarkSnapshot } from "@/lib/landmarks/types";
import { LocalDataStore, localDataStore } from "@/lib/privacy/LocalDataStore";
import { candidateRecognizer } from "@/lib/recognition/CandidateRecognizer";
import { DEMO_PROTOTYPES } from "@/lib/recognition/demoCatalog";
import type { CandidatePrototype, EncodedSequence } from "@/lib/recognition/types";
import { PrototypeStore, prototypeStore } from "@/lib/recognition/PrototypeStore";
import { averageVectors } from "@/lib/features/normalize";
import {
  SIGN_FORM_SLOT_ORDER,
  signFormSlotTitle,
  type SignFormNotes,
} from "@/lib/signform/SignFormLedger";

interface TeachModeProps {
  initialLabel?: string;
  confusedLabel?: string;
  confusedCandidateId?: string;
  extractorFactory?: () => LandmarkExtractor;
  cameraStarter?: (video: HTMLVideoElement) => Promise<MediaStream | null>;
  dataStore?: LocalDataStore;
  prototypeStoreInstance?: PrototypeStore;
}

const DEFAULT_SIZE = { width: 640, height: 480 };

function formatQuotedLabel(label: string) {
  return `"${label}"`;
}

function getCameraErrorMessage(error: unknown) {
  if (error instanceof CameraStartError) {
    return error.userMessage;
  }

  return "Camera could not start. Check browser support and permissions, then try again.";
}

function buildPersonalCandidate(label: string, examples: EncodedSequence[]): CandidatePrototype {
  return {
    id: `personal-${label.trim().toLowerCase().replace(/\s+/g, "-")}`,
    label: label.trim(),
    source: "personal",
    centroid: averageVectors(examples.map((example) => example.centroid)),
    metadata: {
      notes: "Landmark-only personal sign prototype created in Teach Mode.",
    },
    examplesCount: examples.length,
    updatedAt: new Date().toISOString(),
  };
}

export default function TeachMode({
  initialLabel = "",
  confusedLabel,
  confusedCandidateId,
  extractorFactory,
  cameraStarter = startUserCamera,
  dataStore = localDataStore,
  prototypeStoreInstance = prototypeStore,
}: TeachModeProps) {
  const pathname = usePathname();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const extractorRef = useRef<LandmarkExtractor | null>(null);
  const latestSequenceRef = useRef<EncodedSequence | null>(null);

  const [consentAccepted, setConsentAccepted] = useState<boolean | null>(null);
  const [label, setLabel] = useState(() => initialLabel);
  const [cameraMode, setCameraMode] = useState<"live" | "demo">("live");
  const [videoSize, setVideoSize] = useState(DEFAULT_SIZE);
  const [snapshot, setSnapshot] = useState<LandmarkSnapshot | null>(null);
  const [examples, setExamples] = useState<EncodedSequence[]>([]);
  const [statusMessage, setStatusMessage] = useState(
    "Record 3 to 5 examples. Only landmark-derived data can be saved.",
  );
  const [startupError, setStartupError] = useState<string | null>(null);
  const [demoReason, setDemoReason] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [signFormNotes, setSignFormNotes] = useState<SignFormNotes>({});

  const handleSnapshot = useEffectEvent((nextSnapshot: LandmarkSnapshot) => {
    latestSequenceRef.current = featureEncoder.encode(nextSnapshot.buffer);
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

      if (!active) {
        return;
      }

      setConsentAccepted(accepted);
      setStartupError(null);
      setDemoReason(null);
      setCameraMode("live");

      if (!accepted || !videoRef.current) {
        setStatusMessage("Consent screen must be acknowledged before recording examples.");
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

      let extractor = extractorFactory?.() ?? new HolisticLandmarkExtractor();
      let nextDemoReason: string | null = null;

      try {
        await extractor.start(videoRef.current);
      } catch {
        extractor.stop();
        extractor = new MockLandmarkExtractor();
        await extractor.start(videoRef.current);
        nextDemoReason =
          "Demo Mode: mock landmarks active because MediaPipe could not load.";
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
        const status =
          nextDemoReason ?? "Demo Mode: mock landmarks active for this session.";

        setDemoReason(status);
        setStatusMessage(status);
        return;
      }

      setStatusMessage("Live landmark capture is active. Record 3 to 5 examples.");
    };

    void boot();

    return () => {
      active = false;
      teardown();
    };
  }, [cameraStarter, dataStore, extractorFactory, pathname]);

  const captureExample = () => {
    const sequence = latestSequenceRef.current;

    if (!sequence || sequence.frameCount < 24) {
      setStatusMessage("Need more motion history before capturing. Repeat sign a bit longer.");
      return;
    }

    if (examples.length >= 5) {
      setStatusMessage("MVP stores up to 5 examples per teach pass.");
      return;
    }

    setExamples((current) => [...current, sequence]);
    setStatusMessage(`Captured example ${examples.length + 1}.`);
  };

  const saveExamples = async () => {
    if (!label.trim() || examples.length < 3 || examples.length > 5) {
      return;
    }

    setSaving(true);

    for (const example of examples) {
      await prototypeStoreInstance.addExample(label.trim(), example, true, {
        signFormNotes,
      });
    }

    if (confusedLabel?.trim()) {
      const personalCandidate = buildPersonalCandidate(label.trim(), examples);
      const confusedCandidate =
        DEMO_PROTOTYPES.find(
          (candidate) =>
            candidate.id === confusedCandidateId || candidate.label === confusedLabel,
        ) ??
        candidateRecognizer.recognize(examples[0], {
          candidates: DEMO_PROTOTYPES,
          topK: 1,
        }).top1;

      if (confusedCandidate && examples[0]) {
        const pair = buildConfusionPair(
          examples[0],
          personalCandidate,
          confusedCandidate,
          "teach-mode",
        );
        const strongestLabel = strongestDifferenceLabel(strongestChannelDelta(pair));

        await prototypeStoreInstance.saveConfusionPair(pair);
        setStatusMessage(
          `Saved ${formatQuotedLabel(label.trim())} and teach-mode Confusion Twin against ${confusedCandidate.label}. Strongest difference: ${strongestLabel}.`,
        );
      }
    }

    await dataStore.setSetting("saveConsent", true);
    setSaving(false);
    setExamples([]);
    setSignFormNotes({});

    if (!confusedLabel?.trim()) {
      setStatusMessage(
        `Saved ${formatQuotedLabel(label.trim())} as personal sign with landmark-only examples.`,
      );
    }
  };

  if (consentAccepted === false) {
    return (
      <section className="page-shell">
        <div className="panel warning-box">
          <strong>Consent not recorded yet.</strong>
          <p className="body-sm">
            Teach Mode will not open camera until the consent screen is acknowledged.
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
          <span className="eyebrow">Teach</span>
          <h1 className="title-lg">
            Add local personal signs.
          </h1>
          <p className="body-sm">
            Add local personal signs with landmark-derived examples only.
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
                  "Mock landmarks are active. Treat any saved example as UI demo, not live sign evidence."}
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
                aria-label="Teach Mode camera preview"
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
            <div className="field-group">
              <label className="field-label" htmlFor="teach-label">
                Personal sign label
              </label>
              <input
                id="teach-label"
                className="text-input"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Example: family-hello"
                aria-label="Personal sign label"
              />
            </div>
            <div className="section-stack">
              <strong>Local sign-form notes</strong>
              <p className="body-sm">These notes are for your local memory only.</p>
              <div className="receipt-grid">
                {SIGN_FORM_SLOT_ORDER.map((slot) => (
                  <div key={slot} className="field-group">
                    <label className="field-label" htmlFor={`teach-note-${slot}`}>
                      {signFormSlotTitle(slot)}
                    </label>
                    <input
                      id={`teach-note-${slot}`}
                      className="text-input"
                      value={signFormNotes[slot] ?? ""}
                      onChange={(event) =>
                        setSignFormNotes((current) => ({
                          ...current,
                          [slot]: event.target.value,
                        }))
                      }
                      placeholder={`Optional ${signFormSlotTitle(slot).toLowerCase()} note`}
                      aria-label={`${signFormSlotTitle(slot)} note for this personal sign`}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="button-row">
              <button
                type="button"
                className="button"
                onClick={captureExample}
                disabled={examples.length >= 5}
                aria-label="Capture a landmark-derived example for this personal sign"
              >
                Capture example
              </button>
              <button
                type="button"
                className="button-ghost"
                onClick={() => setExamples([])}
                disabled={!examples.length}
                aria-label="Reset captured teach examples"
              >
                Reset examples
              </button>
            </div>
            <p className="body-sm">Saves landmark-derived data locally on this device.</p>
            {confusedLabel ? (
              <p className="body-sm">
                If you save, Teach Mode also stores local Confusion Twin memory against{" "}
                {formatQuotedLabel(confusedLabel)} using landmark-derived features only.
              </p>
            ) : null}
            <button
              type="button"
              className="button-soft"
              onClick={() => void saveExamples()}
              disabled={!label.trim() || examples.length < 3 || examples.length > 5 || saving}
              aria-label="Save personal sign from captured landmark examples"
            >
              Save personal sign
            </button>
            <Link
              href="/memory"
              className="button-ghost"
              aria-label="Review exported or stored local SignRepair data"
            >
              Review local data
            </Link>
          </section>

          <section className="panel section-stack">
            <div className="split-line">
              <h2 className="title-md">Captured examples</h2>
              <span className="badge">{examples.length} / 5</span>
            </div>
            <div className="example-list">
              {examples.length ? (
                examples.map((example, index) => (
                  <article key={`${example.frameCount}-${index}`} className="example-card">
                    <div className="split-line">
                      <h3 className="title-md">Example {index + 1}</h3>
                      <strong className="mono">{example.frameCount} frames</strong>
                    </div>
                    <p className="body-sm">
                      Motion {example.quality.motionEnergy.toFixed(2)} / Mouth stability{" "}
                      {example.quality.mouthStability.toFixed(2)}
                    </p>
                  </article>
                ))
              ) : (
                <div className="empty-state">
                  Capture 3 landmark-only examples before saving. More than 5 is not needed for
                  this MVP. Saved personal signs stay local and can be reviewed in Memory.
                  <div className="button-row">
                    <Link href="/memory" className="button-soft">
                      Open Memory
                    </Link>
                    <Link href="/review" className="button-ghost">
                      Open Review Guide
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
