import { vi } from "vitest";
import type {
  CuePatchComparison,
  CuePatchPrompt,
  CuePatchResult,
} from "@/lib/repair/CuePatch";
import { buildMotionReceipt } from "@/lib/receipts/MotionReceiptBuilder";
import type { MotionReceipt } from "@/lib/receipts/MotionReceipt";
import { buildCentroid } from "@/lib/features/normalize";
import type { ConfusionPair } from "@/lib/recognition/ContrastiveMemory";
import type {
  MinimalPairCard,
  MinimalPairExample,
} from "@/lib/minimal-pairs/MinimalPair";
import type {
  FaceLandmarkSet,
  LandmarkExtractor,
  LandmarkFrame,
  LandmarkListener,
  LandmarkSnapshot,
  Point3D,
  PoseLandmarkSet,
} from "@/lib/landmarks/types";
import type {
  RecognitionResult,
  CandidatePrototype,
  EncodedSequence,
} from "@/lib/recognition/types";
import {
  buildVocabularyPackSummary,
  createVerificationReport as createVerificationReportBase,
  type VerificationReport,
} from "@/lib/video/VerificationReport";
import {
  createBlindInferenceReport as createBlindInferenceReportBase,
  createBlindInferenceSegment,
  type BlindInferenceReport,
} from "@/lib/video/BlindInferenceReport";
import type {
  SignFormLedger,
  SignFormSlot,
  SignFormSlotName,
} from "@/lib/signform/SignFormLedger";
import type { UncertaintyDecision } from "@/lib/uncertainty/UncertaintyEngine";

export const routerPushMock = vi.fn();

let currentSearchParams = new URLSearchParams();
let currentPathname = "/";

export function setMockSearchParams(params: Record<string, string> = {}) {
  currentSearchParams = new URLSearchParams(params);
}

export function resetMockSearchParams() {
  currentSearchParams = new URLSearchParams();
}

export function setMockPathname(pathname = "/") {
  currentPathname = pathname;
}

export function resetMockPathname() {
  currentPathname = "/";
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPushMock,
    replace: routerPushMock,
    prefetch: vi.fn(),
  }),
  useSearchParams: () => currentSearchParams,
  usePathname: () => currentPathname,
}));

function point(x: number, y: number, z = 0): Point3D {
  return { x, y, z };
}

function createHandLandmarks(wristX: number, wristY: number) {
  return [
    point(wristX, wristY),
    point(wristX + 0.015, wristY - 0.01),
    point(wristX + 0.025, wristY - 0.03),
    point(wristX + 0.035, wristY - 0.05),
    point(wristX + 0.05, wristY - 0.07),
    point(wristX + 0.01, wristY - 0.03),
    point(wristX + 0.015, wristY - 0.06),
    point(wristX + 0.02, wristY - 0.09),
    point(wristX + 0.025, wristY - 0.12),
    point(wristX, wristY - 0.03),
    point(wristX, wristY - 0.06),
    point(wristX, wristY - 0.09),
    point(wristX, wristY - 0.12),
    point(wristX - 0.01, wristY - 0.03),
    point(wristX - 0.015, wristY - 0.06),
    point(wristX - 0.02, wristY - 0.09),
    point(wristX - 0.025, wristY - 0.11),
    point(wristX - 0.02, wristY - 0.02),
    point(wristX - 0.03, wristY - 0.04),
    point(wristX - 0.04, wristY - 0.06),
    point(wristX - 0.05, wristY - 0.08),
  ];
}

function createFace(mouthOpen = 0.02): FaceLandmarkSet {
  const landmarks = Array.from({ length: 478 }, () => point(0.5, 0.35));

  landmarks[1] = point(0.5, 0.34);
  landmarks[13] = point(0.5, 0.39 - mouthOpen / 2);
  landmarks[14] = point(0.5, 0.39 + mouthOpen / 2);
  landmarks[61] = point(0.46, 0.39);
  landmarks[291] = point(0.54, 0.39);
  landmarks[78] = point(0.46, 0.39);
  landmarks[308] = point(0.54, 0.39);
  landmarks[82] = point(0.48, 0.388);
  landmarks[312] = point(0.52, 0.388);
  landmarks[87] = point(0.485, 0.398);
  landmarks[317] = point(0.515, 0.398);

  return {
    landmarks,
    blendshapes: {
      jawOpen: mouthOpen * 10,
      browInnerUp: 0.16,
      eyeBlinkLeft: 0.08,
      eyeBlinkRight: 0.08,
      mouthSmileLeft: 0.18,
      mouthSmileRight: 0.18,
    },
  };
}

function createPose(): PoseLandmarkSet {
  const landmarks = Array.from({ length: 33 }, () => point(0.5, 0.5));

  landmarks[11] = point(0.42, 0.44);
  landmarks[12] = point(0.58, 0.44);
  landmarks[23] = point(0.46, 0.72);
  landmarks[24] = point(0.54, 0.72);

  return { landmarks };
}

export function createBufferSnapshot(options?: {
  frameCount?: number;
  motion?: "dynamic" | "static";
  occludedTailCount?: number;
  mouthOpen?: number;
}): LandmarkSnapshot {
  const {
    frameCount = 32,
    motion = "dynamic",
    occludedTailCount = 0,
    mouthOpen = 0.02,
  } = options ?? {};
  const buffer: LandmarkFrame[] = [];

  for (let index = 0; index < frameCount; index += 1) {
    const isOccluded = index >= frameCount - occludedTailCount;
    const drift = motion === "dynamic" ? index * 0.03 : 0;
    const bounce = motion === "dynamic" ? Math.sin(index / 4) * 0.04 : 0;
    const face = isOccluded ? null : createFace(mouthOpen);
    const hands = isOccluded
      ? []
      : [
          {
            handedness: "right" as const,
            landmarks: createHandLandmarks(0.56 + drift, 0.44 + bounce),
          },
        ];
    const pose = isOccluded ? null : createPose();

    buffer.push({
      timestamp: index * 90,
      hands,
      face,
      mouth:
        face?.landmarks
          .filter((_, landmarkIndex) =>
            [13, 14, 61, 291, 78, 308, 82, 312, 87, 317].includes(landmarkIndex),
          )
          .slice(0, 10) ?? [],
      pose,
      quality: {
        extractorKind: "mock",
        isDemoMode: true,
        handVisible: hands.length > 0,
        faceVisible: Boolean(face),
        poseVisible: Boolean(pose),
      },
      frameIndex: index,
      mirrored: true,
    });
  }

  const latest = buffer.at(-1)!;

  return {
    ...latest,
    buffer,
  };
}

export class ControlledExtractor implements LandmarkExtractor {
  private readonly listeners = new Set<LandmarkListener>();

  async start(video: HTMLVideoElement) {
    void video;
  }

  stop() {}

  subscribe(listener: LandmarkListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getKind() {
    return "mock" as const;
  }

  listenerCount() {
    return this.listeners.size;
  }

  emit(snapshot: LandmarkSnapshot) {
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

export function createEncodedSequence(overrides?: Partial<EncodedSequence>): EncodedSequence {
  const baseVectors = {
    handPoseVector: new Array(12).fill(0),
    handVelocityVector: new Array(4).fill(0),
    mouthShapeVector: new Array(4).fill(0),
    facialCueVector: new Array(4).fill(0),
    motionMaskSummary: new Array(4).fill(0),
    visibilityMask: new Array(4).fill(1),
  };
  const base: EncodedSequence = {
    ...baseVectors,
    dominantHand: "right",
    frameCount: 32,
    centroid: buildCentroid([
      baseVectors.handPoseVector,
      baseVectors.handVelocityVector,
      baseVectors.mouthShapeVector,
      baseVectors.facialCueVector,
      baseVectors.motionMaskSummary,
      baseVectors.visibilityMask,
    ]),
    quality: {
      extractorKind: "mock",
      isDemoMode: true,
      validFrameCount: 32,
      validFrameRatio: 1,
      handVisibleRatio: 1,
      faceVisibleRatio: 1,
      poseVisibleRatio: 1,
      occlusionRatio: 0,
      motionEnergy: 0.24,
      mouthStability: 0.72,
    },
  };

  const next = {
    ...base,
    ...overrides,
    quality: {
      ...base.quality,
      ...overrides?.quality,
    },
  };

  return {
    ...next,
    centroid:
      overrides?.centroid ??
      buildCentroid([
        next.handPoseVector,
        next.handVelocityVector,
        next.mouthShapeVector,
        next.facialCueVector,
        next.motionMaskSummary,
        next.visibilityMask,
      ]),
  };
}

export function createCandidatePrototype(
  label: string,
  source: CandidatePrototype["source"] = "demo",
  overrides?: Partial<CandidatePrototype> & {
    handPoseVector?: number[];
    handVelocityVector?: number[];
    mouthShapeVector?: number[];
    facialCueVector?: number[];
    motionMaskSummary?: number[];
    visibilityMask?: number[];
  },
): CandidatePrototype {
  const handPoseVector = overrides?.handPoseVector ?? new Array(12).fill(0);
  const handVelocityVector = overrides?.handVelocityVector ?? new Array(4).fill(0);
  const mouthShapeVector = overrides?.mouthShapeVector ?? new Array(4).fill(0);
  const facialCueVector = overrides?.facialCueVector ?? new Array(4).fill(0);
  const motionMaskSummary = overrides?.motionMaskSummary ?? new Array(4).fill(0);
  const visibilityMask = overrides?.visibilityMask ?? new Array(4).fill(1);

  return {
    id: overrides?.id ?? `${source}-${label.toLowerCase().replace(/\s+/g, "-")}`,
    label,
    source,
    centroid:
      overrides?.centroid ??
      buildCentroid([
        handPoseVector,
        handVelocityVector,
        mouthShapeVector,
        facialCueVector,
        motionMaskSummary,
        visibilityMask,
      ]),
    metadata: overrides?.metadata ?? {},
    examplesCount: overrides?.examplesCount ?? 2,
    correctionBoost: overrides?.correctionBoost,
    updatedAt: overrides?.updatedAt ?? new Date().toISOString(),
  };
}

export function createConfusionPair(overrides?: Partial<ConfusionPair>): ConfusionPair {
  return {
    id: overrides?.id ?? "confusion-hello-vs-thank-you",
    intendedLabel: overrides?.intendedLabel ?? "hello",
    confusedLabel: overrides?.confusedLabel ?? "thank-you",
    intendedCandidateId: overrides?.intendedCandidateId ?? "demo-hello",
    confusedCandidateId: overrides?.confusedCandidateId ?? "demo-thank-you",
    positiveFeatureSummary:
      overrides?.positiveFeatureSummary ?? {
        handShape: [0.1, 0.2],
        handMotion: [0.6, 0.2, 0.8, 0.5],
        mouthCue: [0.1, 0.2],
        facialCue: [0.1, 0.2],
        pose: [0.2, 0.4],
        timing: [0.8, 0.7],
        visibility: [1, 1, 1, 1],
      },
    negativeFeatureSummary:
      overrides?.negativeFeatureSummary ?? {
        handShape: [0.1, 0.2],
        handMotion: [0.05, 0.05, 0.1, 0.1],
        mouthCue: [0.1, 0.2],
        facialCue: [0.1, 0.2],
        pose: [0.2, 0.4],
        timing: [0.3, 0.2],
        visibility: [0.8, 0.7, 0.7, 0.6],
      },
    channelDeltas:
      overrides?.channelDeltas ?? [
        {
          channel: "handMotion",
          deltaScore: 0.9,
          directionLabel: "hand motion favored hello over thank-you.",
          explanation: "Hand motion separated these candidates most.",
        },
      ],
    source: overrides?.source ?? "repair-confirmation",
    createdAt: overrides?.createdAt ?? new Date().toISOString(),
    updatedAt: overrides?.updatedAt ?? new Date().toISOString(),
    count: overrides?.count ?? 1,
  };
}

export function createRecognitionResult(
  overrides?: Partial<RecognitionResult>,
): RecognitionResult {
  const hello = {
    ...createCandidatePrototype("hello"),
    confidence: 0.64,
    distance: 0.18,
    baseConfidence: 0.64,
    contrastiveAdjustment: 0,
    appliedConfusionPairs: [],
  };
  const thankYou = {
    ...createCandidatePrototype("thank-you"),
    confidence: 0.58,
    distance: 0.2,
    baseConfidence: 0.58,
    contrastiveAdjustment: 0,
    appliedConfusionPairs: [],
  };
  const encoded = overrides?.encoded ?? createEncodedSequence();

  return {
    topK: overrides?.topK ?? [hello, thankYou],
    top1: overrides?.top1 ?? hello,
    top2: overrides?.top2 ?? thankYou,
    candidateSetSize: overrides?.candidateSetSize ?? 5,
    encoded,
    matchedAt: overrides?.matchedAt ?? Date.now(),
  };
}

export function createUncertaintyDecision(
  overrides?: Partial<UncertaintyDecision>,
): UncertaintyDecision {
  return {
    mode: overrides?.mode ?? "repair",
    debtType: overrides?.debtType ?? "ambiguous",
    debtLabel: overrides?.debtLabel ?? "Debt: competing candidates",
    message: overrides?.message ?? "I'm not sure. Top known candidates are too close to trust one answer.",
    explanation: overrides?.explanation ?? "Choose from the top matches or repeat with clearer motion.",
    confidence: overrides?.confidence ?? 0.64,
    margin: overrides?.margin ?? 0.06,
    primaryCandidate: overrides?.primaryCandidate ?? createRecognitionResult().top1,
    alternatives: overrides?.alternatives ?? createRecognitionResult().topK,
    recommendedActions: overrides?.recommendedActions ?? ["choose-top-candidate", "repeat-slower"],
    acceptedText: overrides?.acceptedText ?? null,
  };
}

export function createMotionReceipt(overrides?: Partial<MotionReceipt>): MotionReceipt {
  const snapshot = createBufferSnapshot();
  const recognition = createRecognitionResult();
  const decision = createUncertaintyDecision({
    primaryCandidate: recognition.top1,
    alternatives: recognition.topK,
    confidence: recognition.top1?.confidence ?? 0.64,
    margin:
      (recognition.top1?.confidence ?? 0.64) - (recognition.top2?.confidence ?? 0.58),
  });

  const receipt = buildMotionReceipt({
    landmarkBuffer: snapshot.buffer,
    encodedSequence: recognition.encoded,
    recognition,
    decision,
    source: "live",
  });

  return {
    ...receipt,
    ...overrides,
    candidateSummary: {
      ...receipt.candidateSummary,
      ...overrides?.candidateSummary,
    },
    recognitionSummary: {
      ...receipt.recognitionSummary,
      ...overrides?.recognitionSummary,
    },
    uncertaintySummary: {
      ...receipt.uncertaintySummary,
      ...overrides?.uncertaintySummary,
    },
    translationDebt: {
      ...receipt.translationDebt,
      ...overrides?.translationDebt,
    },
    channelSummary: {
      ...receipt.channelSummary,
      ...overrides?.channelSummary,
    },
    privacy: {
      ...receipt.privacy,
      ...overrides?.privacy,
    },
    signFormLedger:
      overrides?.signFormLedger || receipt.signFormLedger
        ? {
            ...(receipt.signFormLedger ?? createSignFormLedger()),
            ...(overrides?.signFormLedger ?? {}),
            slots: {
              ...(receipt.signFormLedger?.slots ?? createSignFormLedger().slots),
              ...(overrides?.signFormLedger?.slots ?? {}),
            },
          }
        : undefined,
    cuePatch:
      overrides?.cuePatch || receipt.cuePatch
        ? {
            ...(receipt.cuePatch ?? {}),
            ...(overrides?.cuePatch ?? {}),
          }
        : undefined,
  };
}

function createSignFormSlot(
  name: SignFormSlotName,
  valueLabel: string,
  evidenceScore: number,
  status: SignFormSlot["status"] = "observed",
): SignFormSlot {
  return {
    name,
    valueLabel,
    evidenceScore,
    status,
    explanation: `${name} slot fixture`,
    landmarksUsed: ["fixture"],
    userEditable: true,
  };
}

type SignFormLedgerOverrides = Omit<Partial<SignFormLedger>, "slots"> & {
  slots?: Partial<SignFormLedger["slots"]>;
};

export function createSignFormLedger(
  overrides?: SignFormLedgerOverrides,
): SignFormLedger {
  return {
    id: overrides?.id ?? "ledger-fixture",
    createdAt: overrides?.createdAt ?? new Date().toISOString(),
    sourceReceiptId: overrides?.sourceReceiptId ?? "receipt-fixture",
    candidateId: overrides?.candidateId ?? "demo-hello",
    candidateLabel: overrides?.candidateLabel ?? "hello",
    slots: {
      handshape: createSignFormSlot("handshape", "open-ish", 0.82),
      palmOrientation: createSignFormSlot("palmOrientation", "away/side", 0.74),
      location: createSignFormSlot("location", "face zone", 0.78),
      movement: createSignFormSlot("movement", "long path", 0.76),
      timing: createSignFormSlot("timing", "stable window", 0.8),
      mouthCue: createSignFormSlot("mouthCue", "visible/stable", 0.72),
      facialCue: createSignFormSlot("facialCue", "visible", 0.68),
      visibility: createSignFormSlot("visibility", "clear", 0.88),
      ...(overrides?.slots ?? {}),
    },
    confidence: overrides?.confidence ?? 0.78,
    missingSlots: overrides?.missingSlots ?? [],
    warnings: overrides?.warnings ?? [],
    privacy: {
      landmarkOnly: true,
      rawVideoStored: false,
      pixelDataStored: false,
    },
  };
}

export function createCuePatchPrompt(
  overrides?: Partial<CuePatchPrompt>,
): CuePatchPrompt {
  return {
    id: overrides?.id ?? "cue-patch-mouth-visible-repeat",
    kind: overrides?.kind ?? "mouth-visible-repeat",
    title: overrides?.title ?? "Mouth cue patch",
    instruction: overrides?.instruction ?? "Repeat once with your mouth visible.",
    why: overrides?.why ?? "Mouth cue was missing or unstable.",
    targetChannels: overrides?.targetChannels ?? ["mouthCue", "visibility"],
    expectedDurationMs: overrides?.expectedDurationMs ?? 1400,
    safetyCopy:
      overrides?.safetyCopy ??
      "Still tentative. Cue Patch Mode asks for better evidence, not proof of meaning.",
    sourceDebt: overrides?.sourceDebt ?? "mouth-cue-missing",
    sourceReceiptId: overrides?.sourceReceiptId ?? "receipt-before",
    createdAt: overrides?.createdAt ?? new Date().toISOString(),
  };
}

export function createCuePatchResult(
  overrides?: Partial<CuePatchResult>,
): CuePatchResult {
  return {
    promptId: overrides?.promptId ?? "cue-patch-mouth-visible-repeat",
    completedAt: overrides?.completedAt ?? new Date().toISOString(),
    beforeReceiptId: overrides?.beforeReceiptId ?? "receipt-before",
    afterReceiptId: overrides?.afterReceiptId ?? "receipt-after",
    improvedChannels: overrides?.improvedChannels ?? ["mouth cue", "visibility"],
    stillMissingChannels: overrides?.stillMissingChannels ?? [],
    nextRecommendedAction: overrides?.nextRecommendedAction ?? "choose-top-candidate",
  };
}

export function createCuePatchComparison(
  overrides?: Partial<CuePatchComparison>,
): CuePatchComparison {
  return {
    before: {
      visibilityScore: overrides?.before?.visibilityScore ?? 0.48,
      motionEnergy: overrides?.before?.motionEnergy ?? 0.08,
      mouthStability: overrides?.before?.mouthStability ?? 0.18,
      strongestChannel: overrides?.before?.strongestChannel ?? "mouth cue",
    },
    after: {
      visibilityScore: overrides?.after?.visibilityScore ?? 0.92,
      motionEnergy: overrides?.after?.motionEnergy ?? 0.24,
      mouthStability: overrides?.after?.mouthStability ?? 0.74,
      strongestChannel: overrides?.after?.strongestChannel ?? "hand motion",
    },
  };
}

export function createMinimalPairExample(
  label: string,
  overrides?: Partial<MinimalPairExample> & {
    sequence?: EncodedSequence;
    ledger?: SignFormLedger;
  },
): MinimalPairExample {
  const sequence = overrides?.sequence ?? createEncodedSequence();
  const ledger =
    overrides?.ledger ??
    createSignFormLedger({
      candidateLabel: label,
      candidateId: `demo-${label}`,
    });

  return {
    id: overrides?.id ?? `minimal-example-${label}-${crypto.randomUUID()}`,
    capturedAt: overrides?.capturedAt ?? new Date().toISOString(),
    receiptId: overrides?.receiptId ?? `receipt-${label}`,
    encodedFeatureSummary:
      overrides?.encodedFeatureSummary ?? {
        handShape: sequence.handPoseVector.slice(0, 10),
        handMotion: sequence.handVelocityVector.slice(),
        mouthCue: sequence.mouthShapeVector.slice(),
        facialCue: sequence.facialCueVector.slice(),
        pose: [
          sequence.handPoseVector[10] ?? 0,
          sequence.handPoseVector[11] ?? 0,
          sequence.motionMaskSummary[2] ?? 0,
        ],
        timing: [
          sequence.motionMaskSummary[0] ?? 0,
          sequence.motionMaskSummary[1] ?? 0,
          sequence.handVelocityVector[2] ?? 0,
          sequence.handVelocityVector[3] ?? 0,
        ],
        visibility: sequence.visibilityMask.slice(),
      },
    signFormLedger: ledger,
    qualitySummary: overrides?.qualitySummary ?? sequence.quality,
  };
}

export function createMinimalPairCard(
  overrides?: Partial<MinimalPairCard>,
): MinimalPairCard {
  const helloSequence = createEncodedSequence({
    handPoseVector: new Array(12).fill(0.72),
    handVelocityVector: [0.2, 0.1, 0.3, 0.28],
    mouthShapeVector: [0.1, 0.26, 0.18, 0.62],
    facialCueVector: [0.12, 0.08, 0.18, 0.14],
  });
  const thankYouSequence = createEncodedSequence({
    handPoseVector: new Array(12).fill(0.18),
    handVelocityVector: [0.34, 0.12, 0.18, 0.2],
    mouthShapeVector: [0.18, 0.34, 0.22, 0.7],
    facialCueVector: [0.08, 0.06, 0.12, 0.1],
  });

  return {
    id: overrides?.id ?? "minimal-pair-demo-hello-vs-demo-thank-you",
    createdAt: overrides?.createdAt ?? new Date().toISOString(),
    updatedAt: overrides?.updatedAt ?? new Date().toISOString(),
    candidateA:
      overrides?.candidateA ?? {
        candidateId: "demo-hello",
        label: "hello",
        source: "demo",
      },
    candidateB:
      overrides?.candidateB ?? {
        candidateId: "demo-thank-you",
        label: "thank-you",
        source: "demo",
      },
    examplesA:
      overrides?.examplesA ?? [
        createMinimalPairExample("hello", {
          sequence: helloSequence,
          ledger: createSignFormLedger({
            candidateLabel: "hello",
            candidateId: "demo-hello",
            slots: {
              handshape: createSignFormSlot("handshape", "open-ish", 0.84),
              location: createSignFormSlot("location", "face zone", 0.8),
            },
          }),
        }),
        createMinimalPairExample("hello", {
          sequence: helloSequence,
          ledger: createSignFormLedger({
            candidateLabel: "hello",
            candidateId: "demo-hello",
            slots: {
              handshape: createSignFormSlot("handshape", "open-ish", 0.8),
              location: createSignFormSlot("location", "face zone", 0.76),
            },
          }),
        }),
      ],
    examplesB:
      overrides?.examplesB ?? [
        createMinimalPairExample("thank-you", {
          sequence: thankYouSequence,
          ledger: createSignFormLedger({
            candidateLabel: "thank-you",
            candidateId: "demo-thank-you",
            slots: {
              handshape: createSignFormSlot("handshape", "flat-ish", 0.82),
              location: createSignFormSlot("location", "chest zone", 0.74),
            },
          }),
        }),
        createMinimalPairExample("thank-you", {
          sequence: thankYouSequence,
          ledger: createSignFormLedger({
            candidateLabel: "thank-you",
            candidateId: "demo-thank-you",
            slots: {
              handshape: createSignFormSlot("handshape", "flat-ish", 0.78),
              location: createSignFormSlot("location", "chest zone", 0.72),
            },
          }),
        }),
      ],
    signFormContrast:
      overrides?.signFormContrast ?? {
        differingSlots: [
          {
            slot: "handshape",
            candidateAValue: "open-ish",
            candidateBValue: "flat-ish",
            scoreGap: 0.82,
            explanation: "Handshape differed most between local examples.",
          },
        ],
        similarSlots: ["movement"],
        strongestSlotDifference: {
          slot: "handshape",
          candidateAValue: "open-ish",
          candidateBValue: "flat-ish",
          scoreGap: 0.82,
          explanation: "Handshape differed most between local examples.",
        },
        explanation:
          "These two local candidates look similar in some cues, but differ most in coarse handshape and location.",
      },
    channelContrast:
      overrides?.channelContrast ?? {
        channelDeltas: [
          {
            channel: "handShape",
            deltaScore: 0.84,
            directionLabel: "hand shape often separates hello and thank-you.",
            explanation:
              "Coarse handshape separated hello and thank-you most in local review.",
          },
        ],
        strongestChannel: {
          channel: "handShape",
          deltaScore: 0.84,
          directionLabel: "hand shape often separates hello and thank-you.",
          explanation:
            "Coarse handshape separated hello and thank-you most in local review.",
        },
        explanation:
          "Coarse handshape separated hello and thank-you most in local review.",
      },
    repairHints:
      overrides?.repairHints ?? [
        {
          cuePatchKind: "final-handshape-hold",
          text: "Repeat hello / thank-you slowly and hold ending handshape for one second.",
          why: "Local minimal-pair review says coarse handshape differs most.",
        },
      ],
    usageStats:
      overrides?.usageStats ?? {
        buildCount: 1,
        appliedCount: 0,
        lastAppliedAt: null,
      },
    privacy: {
      landmarkOnly: true,
      rawVideoStored: false,
      pixelDataStored: false,
    },
    userNotes: overrides?.userNotes ?? "",
  };
}

export function createVerificationReport(
  overrides?: Partial<VerificationReport>,
): VerificationReport {
  const base = createVerificationReportBase({
    clipName: "sample clip.mp4",
    clipDurationMs: 4800,
    notes:
      "Provisional human reference summary, not exact ASL gloss. Known-candidate benchmark only.",
    reference: {
      clipName: "sample clip.mp4",
      source: "local",
      notes: "Fixture reference summary.",
      segments: [
        {
          id: "seg-01",
          expected: "story intro / greeting",
          conceptIds: ["intro-greeting"],
          useForCalibration: false,
        },
        {
          id: "seg-02",
          expected: "drinks coffee",
          conceptIds: ["drink-coffee"],
          useForCalibration: false,
        },
      ],
    },
    candidateSetSize: 5,
    vocabularyLabels: ["hello", "thank-you", "yes", "no", "help"],
    vocabularyPack: buildVocabularyPackSummary("sample-clip-benchmark", {
      "intro-greeting": 1,
      "drink-coffee": 0,
    }),
    comparisonMode: "concept-level",
    segments: [
      {
        id: "seg-01",
        startMs: 0,
        endMs: 1600,
        expected: "story intro / greeting",
        expectedConceptIds: ["intro-greeting"],
        modelOutput: "uncertain: hello / thank-you / no",
        predictedLabel: "hello",
        confidence: 0.62,
        alternatives: [
          {
            candidateId: "demo-hello",
            label: "hello",
            confidence: 0.62,
          },
          {
            candidateId: "demo-thank-you",
            label: "thank-you",
            confidence: 0.57,
          },
          {
            candidateId: "demo-no",
            label: "no",
            confidence: 0.34,
          },
        ],
        debtLabel: "Debt: competing candidates",
        uncertaintyReason:
          "Known candidates are close. Current model output is a constrained guess, not a story translation.",
        matchResult: "out-of-coverage",
        coverageStatus: "out-of-coverage",
        comparisonReason:
          "Expected reference concepts sit outside current recognizer vocabulary.",
        candidateSetSize: 5,
        usedForCalibration: false,
        conceptEvaluation: {
          topConceptLabel: "intro / greeting",
          confidence: 0.62,
          uncertaintyReason:
            "Known candidates are close. Current model output is a constrained guess, not a story translation.",
          result: "insufficient-examples",
          expectedConcepts: [{ id: "intro-greeting", label: "intro / greeting" }],
          hits: [{ id: "intro-greeting", label: "intro / greeting" }],
          misses: [],
          recognizedConcepts: [{ id: "intro-greeting", label: "intro / greeting" }],
          outOfCoverageConcepts: [],
          insufficientExampleConcepts: [{ id: "intro-greeting", label: "intro / greeting" }],
          coverageRate: 1,
        },
        debug: {
          framesAnalyzed: 10,
          skippedFrames: 1,
          detectorFailures: 0,
          extractorKind: "mock",
          firstTimestampMs: 0,
          lastTimestampMs: 1600,
        },
      },
      {
        id: "seg-02",
        startMs: 1600,
        endMs: 3200,
        expected: "drinks coffee",
        expectedConceptIds: ["drink-coffee"],
        modelOutput: "uncertain: no stable candidate",
        predictedLabel: null,
        confidence: 0,
        alternatives: [],
        debtLabel: "Debt: motion too short",
        uncertaintyReason: "Segment stayed uncertain because the candidate set is too small.",
        matchResult: "uncertain",
        coverageStatus: "out-of-coverage",
        comparisonReason:
          "Expected reference concepts sit outside current recognizer vocabulary.",
        candidateSetSize: 5,
        usedForCalibration: false,
        conceptEvaluation: {
          topConceptLabel: null,
          confidence: 0,
          uncertaintyReason: "Segment stayed uncertain because the candidate set is too small.",
          result: "insufficient-examples",
          expectedConcepts: [{ id: "drink-coffee", label: "drink / coffee" }],
          hits: [],
          misses: [{ id: "drink-coffee", label: "drink / coffee" }],
          recognizedConcepts: [],
          outOfCoverageConcepts: [],
          insufficientExampleConcepts: [{ id: "drink-coffee", label: "drink / coffee" }],
          coverageRate: 0,
        },
        debug: {
          framesAnalyzed: 8,
          skippedFrames: 2,
          detectorFailures: 1,
          extractorKind: "mock",
          firstTimestampMs: 1600,
          lastTimestampMs: 3200,
        },
      },
    ],
    debug: {
      detectorInitStatus: "mock-fallback",
      totalFramesRequested: 20,
      framesAnalyzed: 18,
      framesSkipped: 2,
      duplicateTimestampsSkipped: 0,
      invalidTimestampsSkipped: 0,
      detectorFailures: 1,
      firstTimestampMs: 0,
      lastTimestampMs: 3200,
      warningsCount: 1,
      runtimeLogCount: 1,
      analysisWarnings: ["Fixture warning."],
    },
    persisted: false,
  });

  return {
    ...base,
    ...overrides,
    reference: {
      ...base.reference,
      ...overrides?.reference,
      segments: overrides?.reference?.segments ?? base.reference.segments,
    },
    segments: overrides?.segments ?? base.segments,
    summary: {
      ...base.summary,
      ...overrides?.summary,
    },
    calibration: {
      ...base.calibration,
      ...overrides?.calibration,
    },
    coverage: {
      ...base.coverage,
      ...overrides?.coverage,
    },
    vocabularyPack: {
      ...base.vocabularyPack,
      ...overrides?.vocabularyPack,
      concepts: overrides?.vocabularyPack?.concepts ?? base.vocabularyPack.concepts,
    },
    conceptSummary: {
      ...base.conceptSummary,
      ...overrides?.conceptSummary,
    },
    debug: {
      ...base.debug,
      ...overrides?.debug,
    },
    privacy: {
      ...base.privacy,
      ...overrides?.privacy,
    },
  };
}

export function createBlindInferenceReport(
  overrides?: Partial<BlindInferenceReport>,
): BlindInferenceReport {
  const recognition = createRecognitionResult({
    topK: [
      {
        ...createCandidatePrototype("hello"),
        confidence: 0.48,
        distance: 0.22,
        baseConfidence: 0.48,
      },
      {
        ...createCandidatePrototype("thank-you"),
        confidence: 0.44,
        distance: 0.24,
        baseConfidence: 0.44,
      },
      {
        ...createCandidatePrototype("no"),
        confidence: 0.31,
        distance: 0.3,
        baseConfidence: 0.31,
      },
    ],
    top1: {
      ...createCandidatePrototype("hello"),
      confidence: 0.48,
      distance: 0.22,
      baseConfidence: 0.48,
    },
    top2: {
      ...createCandidatePrototype("thank-you"),
      confidence: 0.44,
      distance: 0.24,
      baseConfidence: 0.44,
    },
    candidateSetSize: 5,
    encoded: createEncodedSequence({
      handPoseVector: [0, 0, 0, 0, 0, 0, 0, 0, 0.34, 0.16, 0.18, 0.12],
      handVelocityVector: [0.02, 0.19, 0.84, 0.92],
      mouthShapeVector: [0.1, 0.12, 0.08, 0.18],
      facialCueVector: [0.08, 0.07, 0.06, 0.08],
      motionMaskSummary: [0.92, 0.84, 0.12, 1],
      visibilityMask: [0.88, 0.82, 0.74, 0.8],
      quality: {
        extractorKind: "mock",
        isDemoMode: true,
        validFrameCount: 32,
        validFrameRatio: 1,
        handVisibleRatio: 0.88,
        faceVisibleRatio: 0.82,
        poseVisibleRatio: 0.74,
        occlusionRatio: 0.2,
        motionEnergy: 0.84,
        mouthStability: 0.18,
      },
    }),
  });
  const decision = createUncertaintyDecision({
    debtType: "ambiguous",
    debtLabel: "Debt: competing candidates",
    message: "I'm not sure. Top known candidates are too close to trust one answer.",
    primaryCandidate: recognition.top1,
    alternatives: recognition.topK,
    confidence: recognition.top1?.confidence ?? 0.48,
    margin:
      (recognition.top1?.confidence ?? 0.48) - (recognition.top2?.confidence ?? 0.44),
  });
  const segment = createBlindInferenceSegment({
    id: "seg-01",
    startMs: 0,
    endMs: 1400,
    recognition,
    decision,
    eventFamily: {
      label: "chop/cut-like",
      confidence: 0.76,
      reason: "Fixture event-family hypothesis.",
      channels: ["motion", "handshape", "timing"],
      genericUnknown: false,
    },
    eventAlternatives: [
      {
        label: "repeated-tool-use-like",
        confidence: 0.72,
        reason: "Fixture alternate event-family hypothesis.",
        channels: ["motion", "handshape", "placement"],
        genericUnknown: false,
      },
    ],
    runnerUpFamily: {
      label: "repeated-tool-use-like",
      confidence: 0.72,
      reason: "Fixture alternate event-family hypothesis.",
      channels: ["motion", "handshape", "placement"],
      genericUnknown: false,
    },
    motifClusterId: "motif-01",
    lexemeIds: ["lexeme-01", "lexeme-02"],
    repeatedCycleCount: 2,
    confidenceMargin: 0.08,
    localTransitionSupport: 0.18,
    confidenceBreakdown: {
      motion: 0.34,
      handshape: 0.2,
      placement: 0.18,
      pose: 0.14,
      mouthFace: 0.14,
    },
    phases: [
      {
        id: "seg-01-setup-1",
        kind: "setup",
        role: "setup",
        startMs: 0,
        endMs: 400,
        strokeCount: 0,
        confidence: 0.62,
        dominantEventFamily: "chop/cut-like",
        lexemeId: "lexeme-01",
        dominantChannels: ["placement", "pose", "timing"],
        confidenceBreakdown: {
          motion: 0.16,
          handshape: 0.18,
          placement: 0.28,
          pose: 0.22,
          mouthFace: 0.16,
        },
      },
      {
        id: "seg-01-loop-2",
        kind: "repeated-action-loop",
        role: "peak-action",
        startMs: 400,
        endMs: 1200,
        strokeCount: 2,
        confidence: 0.76,
        dominantEventFamily: "chop/cut-like",
        lexemeId: "lexeme-02",
        dominantChannels: ["motion", "handshape", "placement"],
        confidenceBreakdown: {
          motion: 0.42,
          handshape: 0.24,
          placement: 0.16,
          pose: 0.1,
          mouthFace: 0.08,
        },
      },
    ],
    debug: {
      framesAnalyzed: 10,
      skippedFrames: 0,
      detectorFailures: 0,
      extractorKind: "mock",
      firstTimestampMs: 0,
      lastTimestampMs: 1400,
    },
  });
  const base = createBlindInferenceReportBase({
    clipName: "sample clip.mp4",
    clipDurationMs: 4200,
    notes: "Blind inference fixture.",
    candidateSetSize: 5,
    segments: [
      segment,
      { ...segment, id: "seg-02", startMs: 1500, endMs: 2800 },
      {
        ...segment,
        id: "seg-03",
        startMs: 2900,
        endMs: 4200,
        bestHypothesis: "repeated-tool-use-like",
        actionHypothesis: "repeated-tool-use-like",
        eventFamilyHypothesis: "repeated-tool-use-like",
        motifClusterId: "motif-01",
      },
    ],
    debug: {
      detectorInitStatus: "mock-fallback",
      totalFramesRequested: 24,
      framesAnalyzed: 24,
      framesSkipped: 0,
      duplicateTimestampsSkipped: 0,
      invalidTimestampsSkipped: 0,
      detectorFailures: 0,
      firstTimestampMs: 0,
      lastTimestampMs: 4200,
      warningsCount: 0,
      runtimeLogCount: 0,
      analysisWarnings: [],
    },
    lexemes: [
      {
        id: "lexeme-01",
        centroid: [0.1, 0.2, 0.3],
        count: 2,
        averageConfidence: 0.68,
        dominantEventFamily: "chop/cut-like",
        exampleSegmentIds: ["seg-01", "seg-02"],
      },
      {
        id: "lexeme-02",
        centroid: [0.2, 0.3, 0.4],
        count: 1,
        averageConfidence: 0.76,
        dominantEventFamily: "repeated-tool-use-like",
        exampleSegmentIds: ["seg-01"],
      },
    ],
    eventSummary: {
      genericUnknownRatio: 0,
      resolvedEventFamilyRatio: 1,
      repeatedMotifCount: 1,
      specificEventFamilyCount: 3,
      unresolvedSegmentsCount: 0,
      refinementCount: 0,
      averageConfidenceByEventFamily: [
        {
          label: "chop/cut-like",
          averageConfidence: 0.76,
        },
      ],
      topEventChain: "chop/cut-like x2 -> repeated-tool-use-like",
      alternateEventChains: [
        "repeated-tool-use-like x2 -> chop/cut-like",
      ],
      topLexemeChain: "lexeme-01 -> lexeme-02",
      alternateLexemeChains: ["lexeme-01 -> lexeme-01"],
      repeatedActionCycles: 2,
      likelyTransitionPoints: [
        {
          segmentId: "seg-01",
          timeMs: 400,
          fromPhase: "setup",
          toPhase: "repeated-action-loop",
        },
      ],
      lexemeCount: 2,
      repeatedPatterns: [
        {
          label: "chop/cut-like",
          count: 2,
          segmentIds: ["seg-01", "seg-02"],
        },
      ],
    },
  });

  return {
    ...base,
    ...overrides,
    segments: overrides?.segments ?? base.segments,
    summary: {
      ...base.summary,
      ...overrides?.summary,
    },
    debug: {
      ...base.debug,
      ...overrides?.debug,
    },
    privacy: {
      ...base.privacy,
      ...overrides?.privacy,
    },
  };
}
