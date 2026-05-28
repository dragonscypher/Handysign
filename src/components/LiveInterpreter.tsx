"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import LandmarkOverlay from "@/components/LandmarkOverlay";
import MotionReceiptViewer from "@/components/MotionReceiptViewer";
import RepairPanel from "@/components/RepairPanel";
import type { EvidenceHealthReport } from "@/lib/evidence-health/EvidenceHealth";
import {
  analyzeChannelDeltas,
  buildConfusionPair,
  strongestDifferenceLabel,
} from "@/lib/features/ChannelDeltaAnalyzer";
import { featureEncoder } from "@/lib/features/FeatureEncoder";
import {
  mergeConfusionPair,
  strongestChannelDelta,
  type ConfusionPair,
} from "@/lib/recognition/ContrastiveMemory";
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
import { LocalDataStore, localDataStore } from "@/lib/privacy/LocalDataStore";
import {
  listSessionMinimalPairCards,
} from "@/lib/minimal-pairs/MinimalPairSessionStore";
import {
  minimalPairMatchesCandidates,
  type MinimalPairCard,
} from "@/lib/minimal-pairs/MinimalPair";
import { cuePatchKindLabel, type CuePatchPrompt } from "@/lib/repair/CuePatch";
import {
  cuePatchPlanner,
  completeCuePatchCapture,
} from "@/lib/repair/CuePatchPlanner";
import { buildMotionReceipt } from "@/lib/receipts/MotionReceiptBuilder";
import {
  strongestReceiptChannelLabel,
  type MotionReceipt,
} from "@/lib/receipts/MotionReceipt";
import { candidateRecognizer } from "@/lib/recognition/CandidateRecognizer";
import type {
  CandidateMatch,
  CandidatePrototype,
  EncodedSequence,
  RecognitionResult,
} from "@/lib/recognition/types";
import {
  PrototypeStore,
  buildSessionCandidate,
  mergeCandidateCatalog,
  prototypeStore,
} from "@/lib/recognition/PrototypeStore";
import {
  listWeakOrMissingSignFormSlots,
  signFormSlotTitle,
} from "@/lib/signform/SignFormLedger";
import {
  RepairController,
  type RepairState,
} from "@/lib/uncertainty/RepairController";
import {
  RepairAction,
  UncertaintyDecision,
  UncertaintyEngine,
} from "@/lib/uncertainty/UncertaintyEngine";
import { E2ELandmarkExtractor } from "@/lib/testing/E2ELandmarkExtractor";
import {
  type LiveE2EScenario,
} from "@/lib/testing/e2eFlags";
import { createE2EEncodedSequence } from "@/lib/testing/e2eFixtures";

interface LiveInterpreterProps {
  extractorFactory?: () => LandmarkExtractor;
  cameraStarter?: (video: HTMLVideoElement) => Promise<MediaStream | null>;
  dataStore?: LocalDataStore;
  prototypeStoreInstance?: PrototypeStore;
  forceMockLandmarks?: boolean;
  e2eScenario?: LiveE2EScenario;
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

function buildTeachHref(
  decision: UncertaintyDecision | null,
  fingerspellValue: string,
) {
  const params = new URLSearchParams();

  if (fingerspellValue.trim()) {
    params.set("label", fingerspellValue.trim());
  }

  if (decision?.primaryCandidate) {
    params.set("confusedLabel", decision.primaryCandidate.label);
    params.set("confusedCandidateId", decision.primaryCandidate.id);
  }

  const query = params.toString();

  return query ? `/teach?${query}` : "/teach";
}

function buildMinimalPairHref(
  first: CandidateMatch | null | undefined,
  second: CandidateMatch | null | undefined,
  flags: {
    forceMockLandmarks: boolean;
    scenario: LiveE2EScenario;
  },
) {
  if (!first || !second) {
    return null;
  }

  const params = new URLSearchParams();

  params.set("candidateAId", first.id);
  params.set("candidateBId", second.id);

  if (flags.forceMockLandmarks) {
    params.set("forceMockLandmarks", "1");
  }

  if (flags.scenario) {
    params.set("e2eScenario", flags.scenario);
  }

  return `/minimal-pair?${params.toString()}`;
}

function mergeMinimalPairCatalog(
  persistedCards: MinimalPairCard[],
  sessionCards: MinimalPairCard[],
) {
  return Array.from(
    new Map(
      [...persistedCards, ...sessionCards].map((card) => [card.id, card] as const),
    ).values(),
  );
}

function findRelevantMinimalPairCard(
  cards: MinimalPairCard[],
  first: CandidateMatch | null | undefined,
  second: CandidateMatch | null | undefined,
) {
  return (
    cards.find((card) =>
      minimalPairMatchesCandidates(
        card,
        first
          ? {
              candidateId: first.id,
              label: first.label,
            }
          : null,
        second
          ? {
              candidateId: second.id,
              label: second.label,
            }
          : null,
      ),
    ) ?? null
  );
}

function minimalPairExplanation(card: MinimalPairCard | null) {
  if (!card) {
    return null;
  }

  const strongestSlot = card.signFormContrast.strongestSlotDifference?.slot ?? "none singled out";
  const strongestChannel =
    card.channelContrast.strongestChannel?.channel ?? "none singled out";

  return `Local minimal-pair card says this pair is usually separated by ${strongestSlot} and ${strongestChannel}.`;
}

export default function LiveInterpreter({
  extractorFactory,
  cameraStarter = startUserCamera,
  dataStore = localDataStore,
  prototypeStoreInstance = prototypeStore,
  forceMockLandmarks = false,
  e2eScenario = null,
}: LiveInterpreterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const extractorRef = useRef<LandmarkExtractor | null>(null);
  const latestSequenceRef = useRef<EncodedSequence | null>(null);
  const savedReceiptIdsRef = useRef(new Set<string>());
  const cuePatchCaptureRef = useRef<{
    prompt: CuePatchPrompt;
    beforeReceipt: MotionReceipt;
  } | null>(null);
  const uncertaintyRef = useRef(new UncertaintyEngine());
  const repairControllerRef = useRef(new RepairController());

  const [consentAccepted, setConsentAccepted] = useState<boolean | null>(null);
  const [overlayEnabled, setOverlayEnabled] = useState(true);
  const [saveConsent, setSaveConsent] = useState(false);
  const [cameraMode, setCameraMode] = useState<"live" | "demo">("live");
  const [videoSize, setVideoSize] = useState(DEFAULT_SIZE);
  const [statusMessage, setStatusMessage] = useState(
    "Checking consent, camera access, and landmark runtime.",
  );
  const [startupError, setStartupError] = useState<string | null>(null);
  const [demoReason, setDemoReason] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<LandmarkSnapshot | null>(null);
  const [recognition, setRecognition] = useState<RecognitionResult | null>(null);
  const [decision, setDecision] = useState<UncertaintyDecision | null>(null);
  const [repairState, setRepairState] = useState<RepairState | null>(null);
  const [fingerspellValue, setFingerspellValue] = useState("");
  const [personalCandidates, setPersonalCandidates] = useState<CandidatePrototype[]>([]);
  const [sessionCandidates, setSessionCandidates] = useState<CandidatePrototype[]>([]);
  const [persistedConfusionPairs, setPersistedConfusionPairs] = useState<ConfusionPair[]>([]);
  const [sessionConfusionPairs, setSessionConfusionPairs] = useState<ConfusionPair[]>([]);
  const [persistedMinimalPairCards, setPersistedMinimalPairCards] = useState<
    MinimalPairCard[]
  >([]);
  const [sessionMinimalPairCards, setSessionMinimalPairCards] = useState<
    MinimalPairCard[]
  >([]);
  const [evidenceHealthReport, setEvidenceHealthReport] = useState<EvidenceHealthReport | null>(
    null,
  );
  const [confirmedLabel, setConfirmedLabel] = useState<string | null>(null);
  const [currentReceipt, setCurrentReceipt] = useState<MotionReceipt | null>(null);
  const [activeReceipt, setActiveReceipt] = useState<MotionReceipt | null>(null);
  const [receiptSaveStatus, setReceiptSaveStatus] = useState<string | null>(null);
  const [cuePatchCapturePrompt, setCuePatchCapturePrompt] = useState<CuePatchPrompt | null>(
    null,
  );
  const [cuePatchStatus, setCuePatchStatus] = useState<string | null>(null);

  const deferredRecognition = useDeferredValue(recognition);
  const candidateCatalog = mergeCandidateCatalog(personalCandidates, sessionCandidates);
  const allConfusionPairs = [...persistedConfusionPairs, ...sessionConfusionPairs];
  const allMinimalPairCards = mergeMinimalPairCatalog(
    persistedMinimalPairCards,
    sessionMinimalPairCards,
  );

  const refreshEvidenceHealth = async () => {
    const report = await prototypeStoreInstance.generateEvidenceHealthReport();
    setEvidenceHealthReport(report);
    return report;
  };

  const applySnapshot = useEffectEvent((nextSnapshot: LandmarkSnapshot) => {
    const sequence = e2eScenario
      ? createE2EEncodedSequence(
          e2eScenario,
          nextSnapshot.frameIndex >= 40 ? "after" : "before",
        )
      : featureEncoder.encode(nextSnapshot.buffer);
    const nextRecognition = candidateRecognizer.recognize(sequence, {
      topK: 3,
      candidates: candidateCatalog,
      contrastivePairs: allConfusionPairs,
      minimalPairCards: allMinimalPairCards,
    });
    const nextMinimalPairCard = findRelevantMinimalPairCard(
      allMinimalPairCards,
      nextRecognition.top1,
      nextRecognition.top2,
    );
    const nextDecision = uncertaintyRef.current.evaluate(
      nextRecognition,
      sequence.quality,
    );
    const nextRepairState = repairControllerRef.current.next(
      nextDecision,
      nextDecision.mode === "accept"
        ? "accept"
        : nextDecision.recommendedActions[0] ?? "repeat-slower",
    );
    const baseReceipt = buildMotionReceipt({
      landmarkBuffer: nextSnapshot.buffer,
      encodedSequence: sequence,
      recognition: nextRecognition,
      decision: nextDecision,
      minimalPairCards: nextMinimalPairCard ? [nextMinimalPairCard] : [],
      source: e2eScenario || forceMockLandmarks ? "e2e" : "live",
    });
    const nextCuePatchPrompts = cuePatchPlanner.plan({
      decision: nextDecision,
      translationDebt: baseReceipt.translationDebt,
      motionReceipt: baseReceipt,
      channelSummary: baseReceipt.channelSummary,
      topCandidates: nextRecognition.topK,
      minimalPairCard: nextMinimalPairCard,
      confusionTwinDeltas:
        nextDecision.debtType === "ambiguous" && nextRecognition.top1 && nextRecognition.top2
          ? analyzeChannelDeltas(sequence, nextRecognition.top1, nextRecognition.top2)
              .channelDeltas
          : null,
    });
    const pendingCuePatch = cuePatchCaptureRef.current;
    const cuePatchCompletion = pendingCuePatch
      ? completeCuePatchCapture(
          pendingCuePatch.prompt,
          pendingCuePatch.beforeReceipt,
          baseReceipt,
          nextDecision,
        )
      : null;
    const nextReceipt: MotionReceipt = cuePatchCompletion
      ? {
          ...baseReceipt,
          cuePatch: {
            prompt: pendingCuePatch?.prompt,
            result: cuePatchCompletion.result,
            comparison: cuePatchCompletion.comparison,
          },
        }
      : nextCuePatchPrompts[0]
        ? {
            ...baseReceipt,
            cuePatch: {
              prompt: nextCuePatchPrompts[0],
            },
          }
        : baseReceipt;

    latestSequenceRef.current = sequence;
    cuePatchCaptureRef.current = null;

    startTransition(() => {
      setSnapshot(nextSnapshot);
      setRecognition(nextRecognition);
      setDecision(nextDecision);
      setRepairState(nextRepairState);
      setCurrentReceipt(nextReceipt);
      if (cuePatchCompletion) {
        setCuePatchCapturePrompt(null);
        setCuePatchStatus(cuePatchCompletion.status);
        setActiveReceipt(nextReceipt);
      }
      if (nextDecision.mode === "accept") {
        setConfirmedLabel(nextDecision.primaryCandidate?.label ?? null);
      }
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
      const [consent, overlay, save] = await Promise.all([
        dataStore.getSetting("consentAccepted", false),
        dataStore.getSetting("overlayEnabled", true),
        dataStore.getSetting("saveConsent", false),
      ]);

      if (!active) {
        return;
      }

      setConsentAccepted(consent);
      setOverlayEnabled(overlay);
      setSaveConsent(save);
      setStartupError(null);
      setDemoReason(null);
      setCameraMode("live");

      const [nextCandidates, nextConfusionPairs, nextMinimalPairCards, nextHealthReport] =
        await Promise.all([
          prototypeStoreInstance.loadPersonalCandidates(),
          prototypeStoreInstance.loadConfusionPairs(),
          prototypeStoreInstance.loadMinimalPairCards(),
          prototypeStoreInstance.generateEvidenceHealthReport(),
        ]);

      if (!active) {
        return;
      }

      setPersonalCandidates(nextCandidates);
      setPersistedConfusionPairs(nextConfusionPairs);
      setPersistedMinimalPairCards(nextMinimalPairCards);
      setSessionMinimalPairCards(listSessionMinimalPairCards());
      setEvidenceHealthReport(nextHealthReport);

      if (!consent || !videoRef.current) {
        setStatusMessage("Consent required before live camera session can start.");
        return;
      }

      const video = videoRef.current;
      let stream: MediaStream | null = null;

      try {
        stream = await cameraStarter(video);
        streamRef.current = stream;
      } catch (error) {
        const message = getCameraErrorMessage(error);

        if (!active) {
          return;
        }

        setStartupError(message);
        setStatusMessage(message);
        await dataStore.setSetting("cameraMode", "live");
        return;
      }

      if (video.videoWidth && video.videoHeight) {
        setVideoSize({ width: video.videoWidth, height: video.videoHeight });
      }

      let extractor =
        extractorFactory?.() ??
        (e2eScenario
          ? new E2ELandmarkExtractor(e2eScenario)
          : new HolisticLandmarkExtractor());
      let nextDemoReason: string | null = null;

      if (e2eScenario) {
        await extractor.start(video);
        nextDemoReason =
          "Demo Mode: mock landmarks active for repeatable browser QA scenario.";
      } else {
        try {
          if (forceMockLandmarks) {
            throw new Error("Forced MediaPipe failure for browser QA.");
          }

          await extractor.start(video);
        } catch {
          extractor.stop();
          extractor = new MockLandmarkExtractor();
          await extractor.start(video);
          nextDemoReason =
            "Demo Mode: mock landmarks active because MediaPipe could not load.";
        }
      }

      if (!active) {
        extractor.stop();
        stopUserCamera(stream, video);
        return;
      }

      extractorRef.current = extractor;
      unsubscribe = extractor.subscribe((nextSnapshot) => {
        applySnapshot(nextSnapshot);
      });

      const nextMode = extractor.getKind() === "mock" ? "demo" : "live";
      setCameraMode(nextMode);
      await dataStore.setSetting("cameraMode", nextMode);

      if (nextMode === "demo") {
        const status =
          nextDemoReason ?? "Demo Mode: mock landmarks active for this session.";

        setDemoReason(status);
        setStatusMessage(status);
        return;
      }

      setStatusMessage("On-device landmark extraction is active.");
    };

    void boot();

    return () => {
      active = false;
      teardown();
    };
  }, [
    cameraStarter,
    dataStore,
    extractorFactory,
    forceMockLandmarks,
    pathname,
    prototypeStoreInstance,
    e2eScenario,
  ]);

  const updateOverlay = async (value: boolean) => {
    setOverlayEnabled(value);
    await dataStore.setSetting("overlayEnabled", value);
  };

  const updateSaveConsent = async (value: boolean) => {
    setSaveConsent(value);
    await dataStore.setSetting("saveConsent", value);
  };

  const recordCorrection = async (
    label: string,
    action: "choose" | "fingerspell",
    saved: boolean,
    candidateId?: string,
    receiptId?: string,
  ) => {
    await prototypeStoreInstance.recordCorrection({
      label,
      action,
      saved,
      candidateId,
      receiptId,
      confidence: decision?.confidence ?? 0,
      debtType: decision?.debtType ?? "clean",
      timestamp: new Date().toISOString(),
    });
  };

  const getPersistedReceiptReferenceId = () => {
    const candidateIds = [currentReceipt?.id, activeReceipt?.id].filter(
      (value): value is string => Boolean(value),
    );

    return candidateIds.find((value) => savedReceiptIdsRef.current.has(value));
  };

  const openReceiptViewer = () => {
    if (!currentReceipt) {
      return;
    }

    setActiveReceipt(currentReceipt);
    setReceiptSaveStatus(null);
  };

  const discardActiveReceipt = () => {
    setActiveReceipt(null);
    setReceiptSaveStatus(null);
  };

  const startCuePatchCapture = () => {
    const prompt = currentReceipt?.cuePatch?.prompt;

    if (!currentReceipt || !prompt) {
      return;
    }

    cuePatchCaptureRef.current = {
      prompt,
      beforeReceipt: currentReceipt,
    };
    extractorRef.current?.requestCuePatch?.(prompt.kind);
    setCuePatchCapturePrompt(prompt);
    setCuePatchStatus(
      `Cue Patch Mode armed: ${cuePatchKindLabel(prompt.kind)}. Capture next landmark window.`,
    );
    setStatusMessage(prompt.instruction);
  };

  const saveReceiptLocally = async (receipt: MotionReceipt) => {
    const savedReceipt = await prototypeStoreInstance.saveReceipt(receipt);

    savedReceiptIdsRef.current.add(savedReceipt.id);
    setReceiptSaveStatus(
      `Saved motion receipt locally. Strongest channel: ${strongestReceiptChannelLabel(savedReceipt)}.`,
    );
    setStatusMessage("Saved landmark-only motion receipt locally. No raw video.");

    if (currentReceipt?.id === savedReceipt.id) {
      setCurrentReceipt(savedReceipt);
    }

    setActiveReceipt(savedReceipt);
    await refreshEvidenceHealth();
  };

  const upsertSessionConfusionPairs = (pairs: ConfusionPair[]) => {
    setSessionConfusionPairs((current) => {
      const next = new Map(current.map((pair) => [pair.id, pair]));

      for (const pair of pairs) {
        const existing = next.get(pair.id) ?? null;
        next.set(pair.id, mergeConfusionPair(existing, pair));
      }

      return Array.from(next.values());
    });
  };

  const confirmConfusionChoice = async (
    candidate: CandidateMatch,
    persistOverride: boolean,
  ) => {
    const sequence = latestSequenceRef.current;

    if (!sequence || !decision) {
      return;
    }

    const confusionTwinChoices =
      decision.debtType === "ambiguous" ? decision.alternatives.slice(0, 3) : [];
    const confusedCandidates = confusionTwinChoices.filter(
      (choice) => choice.id !== candidate.id,
    );

    if (!confusedCandidates.length) {
      return;
    }

    const pairs = confusedCandidates.map((confusedCandidate) =>
      buildConfusionPair(
        sequence,
        candidate,
        confusedCandidate,
        "repair-confirmation",
      ),
    );
    const persistedReceiptId = persistOverride ? getPersistedReceiptReferenceId() : undefined;
    const strongestChannel = strongestChannelDelta(pairs[0]);
    const strongestLabel = strongestDifferenceLabel(strongestChannel);
    const nearMissLabel = pairs[0]?.confusedLabel ?? confusedCandidates[0]?.label ?? "near miss";

    if (persistOverride) {
      for (const pair of pairs) {
        if (persistedReceiptId) {
          pair.receiptId = persistedReceiptId;
        }

        await prototypeStoreInstance.saveConfusionPair(pair);
      }

      setPersistedConfusionPairs(await prototypeStoreInstance.loadConfusionPairs());
      setSessionConfusionPairs((current) =>
        current.filter(
          (existingPair) => !pairs.some((newPair) => newPair.id === existingPair.id),
        ),
      );
      await refreshEvidenceHealth();
      await recordCorrection(
        candidate.label,
        "choose",
        true,
        candidate.id,
        persistedReceiptId,
      );
      setRepairState({
        status: "confirmed-saved",
        prompt: `Saved local repair: ${candidate.label} vs ${nearMissLabel}. Strongest difference: ${strongestLabel}.`,
        action: "choose-top-candidate",
        persistRecommended: true,
      });
      setStatusMessage(
        `Saved local repair: ${candidate.label} vs ${nearMissLabel}. Strongest difference: ${strongestLabel}.`,
      );
    } else {
      upsertSessionConfusionPairs(pairs);
      await recordCorrection(candidate.label, "choose", false, candidate.id);
      setRepairState({
        status: "confirmed-session",
        prompt: `Using once: ${candidate.label} vs ${nearMissLabel}. Strongest difference: ${strongestLabel}.`,
        action: "choose-top-candidate",
        persistRecommended: true,
      });
      setStatusMessage(
        `Using once: ${candidate.label} vs ${nearMissLabel}. Strongest difference: ${strongestLabel}.`,
      );
    }

    setConfirmedLabel(candidate.label);
  };

  const clearCurrentConfusionMemory = async () => {
    const labels = new Set(
      (decision?.alternatives ?? []).slice(0, 3).map((candidate) => candidate.label),
    );
    const matchesCurrentSet = (pair: ConfusionPair) =>
      labels.has(pair.intendedLabel) && labels.has(pair.confusedLabel);
    const persistedMatches = persistedConfusionPairs.filter(matchesCurrentSet);

    for (const pair of persistedMatches) {
      await prototypeStoreInstance.deleteConfusionPair(pair.id);
    }

    setPersistedConfusionPairs(await prototypeStoreInstance.loadConfusionPairs());
    setSessionConfusionPairs((current) => current.filter((pair) => !matchesCurrentSet(pair)));
    await refreshEvidenceHealth();
    setStatusMessage("Cleared Confusion Twin repair memory for current candidate set.");
  };

  const handleAction = (action: RepairAction) => {
    if (!decision) {
      return;
    }

    const nextRepairState = repairControllerRef.current.next(decision, action);
    setRepairState(nextRepairState);

    if (action === "teach-personal-sign") {
      const teachHref = buildTeachHref(decision, fingerspellValue);

      startTransition(() => {
        router.push(teachHref);
      });
      return;
    }

    setStatusMessage(nextRepairState.prompt);
  };

  const submitFingerspell = async () => {
    const label = fingerspellValue.trim();
    const sequence = latestSequenceRef.current;

    if (!label || !sequence) {
      return;
    }

    if (saveConsent) {
      await prototypeStoreInstance.addExample(label, sequence, true);
      await recordCorrection(
        label,
        "fingerspell",
        true,
        undefined,
        getPersistedReceiptReferenceId(),
      );
      setPersonalCandidates(await prototypeStoreInstance.loadPersonalCandidates());
      await refreshEvidenceHealth();
      setStatusMessage(
        `Saved fingerspelled word ${formatQuotedLabel(label)} locally.`,
      );
      setRepairState({
        status: "confirmed-saved",
        prompt: "Fingerspelled word confirmed and stored locally.",
        action: "fingerspell",
        persistRecommended: true,
      });
    } else {
      setSessionCandidates((current) => {
        const next = current.filter(
          (candidate) => candidate.label.toLowerCase() !== label.toLowerCase(),
        );

        return [...next, buildSessionCandidate(label, [sequence])];
      });
      await recordCorrection(label, "fingerspell", false);
      setStatusMessage(
        `Added fingerspelled word ${formatQuotedLabel(label)} for this session.`,
      );
      setRepairState({
        status: "confirmed-session",
        prompt: "Fingerspelled word confirmed for this session.",
        action: "fingerspell",
        persistRecommended: true,
      });
    }

    setConfirmedLabel(label);
    setFingerspellValue("");
  };

  if (consentAccepted === false) {
    return (
      <section className="page-shell">
        <div className="panel warning-box">
          <strong>Consent not recorded yet.</strong>
          <p className="body-sm">
            SignRepair will not open camera until the consent screen is acknowledged.
          </p>
          <Link href="/" className="button">
            Go to consent screen
          </Link>
        </div>
      </section>
    );
  }

  const displayedLabel =
    decision?.mode === "accept"
      ? decision.primaryCandidate?.label ?? confirmedLabel
      : repairState?.status === "confirmed-saved" ||
          repairState?.status === "confirmed-session"
        ? confirmedLabel
        : null;
  const topCandidates = deferredRecognition?.topK ?? [];
  const modeBadge = startupError
    ? "Camera unavailable"
    : cameraMode === "demo"
      ? "Demo Mode: mock landmarks"
      : "On-device live landmarks";
  const debtKind = decision?.debtType ?? "ambiguous";
  const debtLabel =
    decision?.debtLabel ?? (startupError ? "Awaiting camera" : "Awaiting landmarks");
  const debtMessage = decision?.message ?? startupError ?? "Waiting for landmarks.";
  const currentOutputSummary = displayedLabel
    ? decision?.mode === "accept"
      ? "Known-candidate demo label shown because confidence and margin thresholds passed."
      : "Known-candidate demo label shown because you confirmed local repair memory."
    : "I'm not sure yet. Use Repair Mode, cue patches, or top alternatives before treating this as meaning.";
  const confusionTwinChoices =
    decision?.mode === "repair" && decision.debtType === "ambiguous"
      ? decision.alternatives.slice(0, 3)
      : [];
  const confusionTwinAnalysis =
    recognition?.encoded && confusionTwinChoices[0] && confusionTwinChoices[1]
      ? analyzeChannelDeltas(
          recognition.encoded,
          confusionTwinChoices[0],
          confusionTwinChoices[1],
        )
      : null;
  const canClearConfusionMemory = allConfusionPairs.some((pair) => {
    const labels = new Set(confusionTwinChoices.map((candidate) => candidate.label));
    return labels.has(pair.intendedLabel) && labels.has(pair.confusedLabel);
  });
  const activeMinimalPairCard = findRelevantMinimalPairCard(
    allMinimalPairCards,
    confusionTwinChoices[0],
    confusionTwinChoices[1],
  );
  const repeatedCollisionCount =
    confusionTwinChoices[0] && confusionTwinChoices[1]
      ? allConfusionPairs
          .filter((pair) => {
            const labels = new Set([
              pair.intendedLabel.toLowerCase(),
              pair.confusedLabel.toLowerCase(),
            ]);

            return (
              labels.has(confusionTwinChoices[0]!.label.toLowerCase()) &&
              labels.has(confusionTwinChoices[1]!.label.toLowerCase())
            );
          })
          .reduce((sum, pair) => sum + pair.count, 0)
      : 0;
  const minimalPairLabHref = buildMinimalPairHref(confusionTwinChoices[0], confusionTwinChoices[1], {
    forceMockLandmarks,
    scenario: e2eScenario,
  });
  const relevantConfusionPair =
    confusionTwinChoices[0] && confusionTwinChoices[1]
      ? allConfusionPairs.find((pair) => {
          const labels = new Set([
            pair.intendedLabel.toLowerCase(),
            pair.confusedLabel.toLowerCase(),
          ]);

          return (
            labels.has(confusionTwinChoices[0]!.label.toLowerCase()) &&
            labels.has(confusionTwinChoices[1]!.label.toLowerCase())
          );
        }) ?? null
      : null;
  const needsReviewPairSummary =
    relevantConfusionPair && evidenceHealthReport
      ? evidenceHealthReport.memorySummaries.find(
          (summary) =>
            summary.memoryType === "confusion-twin" &&
            summary.memoryId === relevantConfusionPair.id &&
            summary.status === "needs-review",
        ) ?? null
      : null;
  const stalePersonalSignSummary =
    decision?.primaryCandidate?.source === "personal" && evidenceHealthReport
      ? evidenceHealthReport.memorySummaries.find(
          (summary) =>
            summary.memoryType === "personal-sign" &&
            summary.memoryId === decision.primaryCandidate?.id &&
            summary.status === "needs-review" &&
            summary.reasons.some((reason) => reason.toLowerCase().includes("stale")),
        ) ?? null
      : null;
  const teachHref = buildTeachHref(decision, fingerspellValue);
  const refreshTeachHref =
    stalePersonalSignSummary?.label
      ? `/teach?label=${encodeURIComponent(stalePersonalSignSummary.label)}`
      : teachHref;
  const receiptButtonLabel = displayedLabel ? "View receipt" : "View why I'm unsure";
  const primaryCuePatch = currentReceipt?.cuePatch?.prompt ?? null;
  const cuePatchResult = currentReceipt?.cuePatch?.result ?? null;
  const cuePatchComparison = currentReceipt?.cuePatch?.comparison ?? null;
  const missingSignFormEvidence = listWeakOrMissingSignFormSlots(
    currentReceipt?.signFormLedger,
    2,
  ).map((slot) => signFormSlotTitle(slot.name));
  const showMinimalPairPrompt = repeatedCollisionCount >= 2 && Boolean(minimalPairLabHref);
  const showEvidenceHealthPrompt = Boolean(needsReviewPairSummary || stalePersonalSignSummary);

  return (
    <section className="page-shell">
      <div className="panel panel-strong section-stack">
        <span className="eyebrow">Live</span>
        <div className="split-line">
          <div>
            <h1 className="title-lg">Observe known candidates and repair uncertainty.</h1>
            <p className="body-sm">
              Observe known candidates and repair uncertainty with landmark-derived evidence only.
              This is research prototype, not certified interpretation.
            </p>
          </div>
          <span className="demo-badge">{modeBadge}</span>
        </div>
      </div>

      <div className="live-grid">
        <div className="panel section-stack">
          <div className="split-line">
            <div>
              <h2 className="title-md">Camera and consent state</h2>
              <p className="body-sm">
                Start with live landmarks or explicit demo fallback before reviewing any
                known-candidate demo state.
              </p>
            </div>
            <span className="badge">{cameraMode === "demo" ? "Demo fallback" : "Live camera"}</span>
          </div>

          {startupError ? (
            <div className="warning-box" role="alert">
              <strong>Camera could not start.</strong>
              <p className="body-sm">{startupError}</p>
              <p className="body-sm">
                Known-candidate demo stays paused until camera access and required browser APIs are
                available.
              </p>
            </div>
          ) : null}

          {cameraMode === "demo" ? (
            <div className="info-box" role="status" aria-live="polite">
              <strong>Demo Mode: mock landmarks</strong>
              <p className="body-sm">
                {demoReason ??
                  "Mock landmarks are active. Treat any candidate output as UI demo, not live sign evidence."}
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
                aria-label="Live camera preview for known-candidate sign evidence demo"
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
                visible={overlayEnabled}
              />
              {cameraMode === "demo" && !snapshot ? (
                <div className="video-fallback">
                  <p className="body-sm">Waiting for mock landmark stream.</p>
                </div>
              ) : null}
            </div>
            <div className="video-toolbar">
              <div className="glass-strip" role="status" aria-live="polite">
                <span>{statusMessage}</span>
              </div>
              <div className="glass-strip">
                <label className="checkbox-row" htmlFor="overlay-toggle">
                  <input
                    id="overlay-toggle"
                    type="checkbox"
                    checked={overlayEnabled}
                    onChange={(event) => void updateOverlay(event.target.checked)}
                    aria-label="Toggle landmark overlay on live camera preview"
                  />
                  <span>Overlay</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="section-stack">
          <section className="panel section-stack">
            <div className="split-line">
              <h2 className="title-md">Current guess</h2>
              <span className="badge">
                {Math.round((decision?.confidence ?? 0) * 100)}% confidence
              </span>
            </div>
            <div className="prediction-card" aria-live="polite" aria-atomic="true">
              <span className="caption">Current guess</span>
              <h2 className="title-lg">{displayedLabel ?? "No clean guess yet"}</h2>
              <p className="body-sm">{currentOutputSummary}</p>
            </div>
            <div className="prediction-card">
              <span className="caption">Confidence meter</span>
              <div className="meter" aria-label="Confidence meter">
                <span style={{ width: `${Math.round((decision?.confidence ?? 0) * 100)}%` }} />
              </div>
              <p className="mono">{Math.round((decision?.confidence ?? 0) * 100)}%</p>
            </div>
          </section>

          <section className="panel section-stack">
            <div className="split-line">
              <h2 className="title-md">Translation Debt</h2>
              <span className="debt-badge" data-kind={debtKind}>
                {debtLabel}
              </span>
            </div>
            <p className="caption">Why unsure</p>
            <p className="body-sm">{debtMessage}</p>
            <div className="metric-grid">
              <div className="metric-card prediction-card">
                <span className="caption">Top-1 / Top-2 margin</span>
                <strong className="mono">{(decision?.margin ?? 0).toFixed(2)}</strong>
              </div>
              <div className="metric-card prediction-card">
                <span className="caption">Motion energy</span>
                <strong className="mono">
                  {(recognition?.encoded.quality.motionEnergy ?? 0).toFixed(2)}
                </strong>
              </div>
              <div className="metric-card prediction-card">
                <span className="caption">Mouth stability</span>
                <strong className="mono">
                  {(recognition?.encoded.quality.mouthStability ?? 0).toFixed(2)}
                </strong>
              </div>
              <div className="metric-card prediction-card">
                <span className="caption">Occlusion ratio</span>
                <strong className="mono">
                  {(recognition?.encoded.quality.occlusionRatio ?? 0).toFixed(2)}
                </strong>
              </div>
            </div>
          </section>

          {decision?.mode === "repair" && primaryCuePatch ? (
            <section className="panel section-stack">
              <div className="split-line">
                <h2 className="title-md">Cue Patch Mode</h2>
                <span className="badge">{primaryCuePatch.title}</span>
              </div>
              <p className="body-sm">{primaryCuePatch.instruction}</p>
              <p className="caption">{primaryCuePatch.why}</p>
              <p className="caption">
                Targets {primaryCuePatch.targetChannels.map((channel) => channel).join(", ") || "manual confirmation"} /
                {` ${primaryCuePatch.safetyCopy}`}
              </p>
              <div className="button-row">
                <button
                  type="button"
                  className="button"
                  onClick={startCuePatchCapture}
                  aria-label={`Try cue patch ${primaryCuePatch.title}`}
                >
                  Try this patch
                </button>
                {decision.debtType === "ambiguous" ? (
                  <button
                    type="button"
                    className="button-ghost"
                    onClick={() => handleAction("choose-top-candidate")}
                    aria-label="Skip cue patch and choose candidate"
                  >
                    Skip patch and choose candidate
                  </button>
                ) : null}
                {decision.recommendedActions.includes("teach-personal-sign") ? (
                  <Link
                    href={teachHref}
                    className="button-ghost"
                    aria-label="Teach this as personal sign"
                  >
                    Teach as personal sign
                  </Link>
                ) : null}
              </div>
              {cuePatchCapturePrompt ? (
                <div className="info-box">
                  <strong>Cue patch capture active</strong>
                  <p className="body-sm">{cuePatchCapturePrompt.instruction}</p>
                </div>
              ) : null}
              {cuePatchStatus ? <p className="body-sm">{cuePatchStatus}</p> : null}
              {cuePatchResult && cuePatchComparison ? (
                <div className="prediction-card">
                  <span className="caption">Last cue patch result</span>
                  <p className="body-sm">
                    Improved channels: {cuePatchResult.improvedChannels.join(", ") || "none yet"}.
                  </p>
                  <p className="caption">
                    Before visibility {Math.round(cuePatchComparison.before.visibilityScore * 100)}%
                    / after {Math.round(cuePatchComparison.after.visibilityScore * 100)}% / before
                    motion {cuePatchComparison.before.motionEnergy.toFixed(2)} / after{" "}
                    {cuePatchComparison.after.motionEnergy.toFixed(2)}
                  </p>
                </div>
              ) : null}
            </section>
          ) : null}

          <RepairPanel
            decision={decision}
            repairState={repairState}
            saveConsent={saveConsent}
            onSaveConsentChange={(value) => void updateSaveConsent(value)}
            onAction={handleAction}
            onConfirmConfusionChoice={(candidate, persist) =>
              void confirmConfusionChoice(candidate, persist)
            }
            onClearConfusionMemory={() => void clearCurrentConfusionMemory()}
            canClearConfusionMemory={canClearConfusionMemory}
            confusionTwinChoices={confusionTwinChoices}
            confusionTwinExplanation={confusionTwinAnalysis?.topExplanation ?? null}
            receiptStrongestCue={strongestReceiptChannelLabel(currentReceipt)}
            hasReceipt={Boolean(currentReceipt)}
            missingSignFormEvidence={missingSignFormEvidence}
            fingerspellValue={fingerspellValue}
            onFingerspellValueChange={setFingerspellValue}
            onFingerspellSubmit={() => void submitFingerspell()}
            teachHref={teachHref}
          />

          {currentReceipt ? (
            <details className="panel section-stack evidence-drawer" open>
              <summary className="split-line">
                <div>
                  <h2 className="title-md">Evidence drawer</h2>
                  <p className="caption">Compact landmark-derived evidence only</p>
                </div>
                <span className="badge">landmark-only</span>
              </summary>
              <p className="body-sm">
                Review why this window was accepted or held back. Not linguistic authority.
              </p>
              <div className="metric-grid">
                <div className="metric-card prediction-card">
                  <span className="caption">Current guess</span>
                  <strong>{displayedLabel ?? "uncertain"}</strong>
                </div>
                <div className="metric-card prediction-card">
                  <span className="caption">Why unsure</span>
                  <strong>{debtLabel}</strong>
                </div>
                <div className="metric-card prediction-card">
                  <span className="caption">What to fix</span>
                  <strong>{primaryCuePatch?.title ?? "choose or repeat"}</strong>
                </div>
                <div className="metric-card prediction-card">
                  <span className="caption">Strongest cue</span>
                  <strong>{strongestReceiptChannelLabel(currentReceipt)}</strong>
                </div>
              </div>
              <div className="button-row">
                <button
                  type="button"
                  className="button-soft"
                  onClick={openReceiptViewer}
                  aria-label={
                    displayedLabel
                      ? "View motion replay receipt"
                      : "View why I am unsure in motion replay receipt"
                  }
                >
                  {receiptButtonLabel}
                </button>
                <p className="caption">
                  Motion Replay Receipt stays temporary unless you save it locally.
                </p>
              </div>
            </details>
          ) : null}

          {showMinimalPairPrompt ? (
            <section className="panel section-stack">
              <div className="split-line">
                <h2 className="title-md">Minimal Pair prompt</h2>
                <span className="badge">{repeatedCollisionCount} collisions</span>
              </div>
              <p className="body-sm">
                These two candidates keep colliding. Compare this pair before trusting the local
                distinction.
              </p>
              <p className="caption">
                {minimalPairExplanation(activeMinimalPairCard) ??
                  "Local contrast card can compare coarse sign-form evidence and channel deltas for this pair."}
              </p>
              {minimalPairLabHref ? (
                <Link
                  href={minimalPairLabHref}
                  className={primaryCuePatch ? "button-soft" : "button"}
                  aria-label="Compare this pair in Minimal Pair Lab"
                >
                  Compare this pair
                </Link>
              ) : null}
            </section>
          ) : null}

          {showEvidenceHealthPrompt ? (
            <section className="panel section-stack">
              <div className="split-line">
                <h2 className="title-md">Evidence Health prompt</h2>
                <span className="badge">memory review</span>
              </div>
              <p className="body-sm">
                Health is not accuracy. It only flags stale or repeatedly weak local evidence.
              </p>
              {needsReviewPairSummary ? (
                <div className="warning-box">
                  <strong>Repeated pair issue</strong>
                  <p className="body-sm">
                    This pair keeps colliding. Evidence Health recommends review.
                  </p>
                  <Link href="/evidence-health" className="button-soft">
                    Open Evidence Health
                  </Link>
                </div>
              ) : null}
              {stalePersonalSignSummary ? (
                <div className="warning-box">
                  <strong>Stale local sign memory</strong>
                  <p className="body-sm">
                    This local sign memory may need fresh examples.
                  </p>
                  <Link href={refreshTeachHref} className="button-soft">
                    Refresh in Teach Mode
                  </Link>
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="panel section-stack">
            <div className="split-line">
              <h2 className="title-md">Other possibilities</h2>
              <span className="badge">{candidateCatalog.length} constrained candidates</span>
            </div>
            <div className="prediction-list">
              {topCandidates.length ? (
                topCandidates.map((candidate: CandidateMatch) => (
                  <article key={candidate.id} className="prediction-card">
                    <div className="split-line">
                      <div>
                        <h3 className="title-md">{candidate.label}</h3>
                        <span className="source-badge" data-source={candidate.source}>
                          {candidate.source}
                        </span>
                      </div>
                      <strong className="mono">{Math.round(candidate.confidence * 100)}%</strong>
                    </div>
                    <p className="body-sm">
                      {candidate.metadata.demoDisclaimer ?? candidate.metadata.notes}
                    </p>
                    {candidate.contrastiveAdjustment ? (
                      <p className="caption">
                        Base {Math.round((candidate.baseConfidence ?? candidate.confidence) * 100)}%
                        / Confusion Twin {candidate.contrastiveAdjustment >= 0 ? "+" : ""}
                        {Math.round(candidate.contrastiveAdjustment * 100)}%
                      </p>
                    ) : null}
                    {candidate.minimalPairAdjustment ? (
                      <p className="caption">
                        Minimal Pair Lab {candidate.minimalPairAdjustment >= 0 ? "+" : ""}
                        {Math.round(candidate.minimalPairAdjustment * 100)}%
                      </p>
                    ) : null}
                  </article>
                ))
              ) : (
                <div className="empty-state">
                  Constrained candidates appear after camera starts and landmark window stabilizes.
                  If you need more local examples, go to Teach or Review Guide.
                  <div className="button-row">
                    <Link href="/teach" className="button-soft">
                      Go to Teach
                    </Link>
                    <Link href="/review" className="button-ghost">
                      Open Review Guide
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="panel info-box">
            <strong>Known-candidate demo only</strong>
            <p className="body-sm">
              Live view shows constrained labels only. If candidate set is too small for longer
              clip meaning, use Verify and expect mismatch or uncertainty instead of silent
              translation claims.
            </p>
          </section>

          {activeReceipt ? (
            <MotionReceiptViewer
              key={activeReceipt.id}
              receipt={activeReceipt}
              onDiscard={discardActiveReceipt}
              onSave={(receipt) => void saveReceiptLocally(receipt)}
              saveDisabled={activeReceipt.privacy.persisted}
              saveStatus={
                activeReceipt.privacy.persisted
                  ? "Receipt already saved locally."
                  : receiptSaveStatus
              }
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
