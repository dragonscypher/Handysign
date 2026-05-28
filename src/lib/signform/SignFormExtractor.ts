import { clamp01, mean } from "@/lib/features/normalize";
import type { RecognitionResult, EncodedSequence } from "@/lib/recognition/types";
import type { MotionReceipt, ReceiptReplayFrame, ReceiptReplayHand } from "@/lib/receipts/MotionReceipt";
import type { UncertaintyDecision } from "@/lib/uncertainty/UncertaintyEngine";
import type {
  SignFormLedger,
  SignFormSlot,
  SignFormSlotName,
  SignFormSlotStatus,
  SignFormSlots,
} from "@/lib/signform/SignFormLedger";

interface SignFormExtractorInput {
  receiptId: string;
  receipt: Pick<MotionReceipt, "replayFrames" | "translationDebt" | "channelSummary">;
  encodedSequence: EncodedSequence;
  recognition: RecognitionResult;
  decision: UncertaintyDecision;
}

function createLedgerId(receiptId: string) {
  return `ledger-${receiptId}`;
}

function round(value: number) {
  return Number(value.toFixed(4));
}

function statusFromScore(score: number, missingBelow = 0.2, weakBelow = 0.55): SignFormSlotStatus {
  if (score <= missingBelow) {
    return "missing";
  }

  if (score <= weakBelow) {
    return "weak";
  }

  return "observed";
}

function createSlot(
  name: SignFormSlotName,
  valueLabel: string,
  evidenceScore: number,
  explanation: string,
  landmarksUsed: string[],
  forceStatus?: SignFormSlotStatus,
): SignFormSlot {
  return {
    name,
    valueLabel,
    evidenceScore: round(clamp01(evidenceScore)),
    status: forceStatus ?? statusFromScore(evidenceScore),
    explanation,
    landmarksUsed,
    userEditable: true,
  };
}

function currentHands(frames: ReceiptReplayFrame[]) {
  return frames
    .map((frame) => frame.hands[0])
    .filter((hand): hand is ReceiptReplayHand => Boolean(hand));
}

function averageWristY(frames: ReceiptReplayFrame[]) {
  const wrists = currentHands(frames)
    .map((hand) => hand.points[0]?.[1])
    .filter((value): value is number => typeof value === "number");

  return wrists.length ? mean(wrists) : null;
}

function averageAbsZ(points: ReceiptReplayHand[]) {
  const values = points
    .flatMap((hand) => hand.points)
    .map((point) => Math.abs(point[2] ?? 0))
    .filter((value) => Number.isFinite(value));

  return values.length ? mean(values) : 0;
}

function handPathExtent(frames: ReceiptReplayFrame[]) {
  const wrists = currentHands(frames)
    .map((hand) => hand.points[0])
    .filter((point): point is [number, number, number] => Boolean(point));

  if (!wrists.length) {
    return 0;
  }

  const xs = wrists.map((point) => point[0]);
  const ys = wrists.map((point) => point[1]);

  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

function movementDirectionChanges(frames: ReceiptReplayFrame[]) {
  const wrists = currentHands(frames)
    .map((hand) => hand.points[0])
    .filter((point): point is [number, number, number] => Boolean(point));

  let changes = 0;
  let previousDirection = 0;

  for (let index = 1; index < wrists.length; index += 1) {
    const delta = wrists[index]![0] - wrists[index - 1]![0];
    const direction = delta === 0 ? 0 : delta > 0 ? 1 : -1;

    if (direction !== 0 && previousDirection !== 0 && direction !== previousDirection) {
      changes += 1;
    }

    if (direction !== 0) {
      previousDirection = direction;
    }
  }

  return changes;
}

function endingHoldScore(frames: ReceiptReplayFrame[]) {
  const tail = frames.slice(-4);
  const wrists = currentHands(tail)
    .map((hand) => hand.points[0])
    .filter((point): point is [number, number, number] => Boolean(point));

  if (wrists.length < 2) {
    return 0;
  }

  const deltas = wrists.slice(1).map((point, index) => {
    const previous = wrists[index]!;

    return Math.hypot(point[0] - previous[0], point[1] - previous[1]);
  });

  return clamp01(1 - mean(deltas) * 20);
}

function extractHandshape(
  encodedSequence: EncodedSequence,
  frames: ReceiptReplayFrame[],
) {
  const handOpen = encodedSequence.handPoseVector[8] ?? 0;
  const fingerSpread = encodedSequence.handPoseVector[9] ?? 0;
  const visibility = encodedSequence.quality.handVisibleRatio;
  const frameHands = currentHands(frames);

  if (!frameHands.length || visibility < 0.45) {
    return createSlot(
      "handshape",
      "unknown",
      visibility * 0.4,
      "Dominant hand landmarks were too sparse for coarse handshape read.",
      ["wrist", "thumb tip", "index tip", "middle tip", "ring tip", "pinky tip"],
      "missing",
    );
  }

  let valueLabel = "unknown";

  if (handOpen >= 0.7 && fingerSpread >= 0.3) {
    valueLabel = "open-ish";
  } else if (handOpen <= 0.4) {
    valueLabel = "closed-ish";
  } else if (fingerSpread <= 0.18 && handOpen >= 0.48) {
    valueLabel = "pointing-ish";
  } else if (handOpen >= 0.42 && handOpen <= 0.7 && fingerSpread <= 0.28) {
    valueLabel = "flat-ish";
  }

  return createSlot(
    "handshape",
    valueLabel,
    visibility,
    "Coarse finger curl and spread proxy from landmark spacing. Not official ASL handshape analysis.",
    ["thumb tip", "index tip", "middle tip", "ring tip", "pinky tip"],
    valueLabel === "unknown" ? "unknown" : undefined,
  );
}

function extractPalmOrientation(
  encodedSequence: EncodedSequence,
  frames: ReceiptReplayFrame[],
) {
  const hands = currentHands(frames);
  const first = hands[0];
  const visibility = encodedSequence.quality.handVisibleRatio;

  if (!first || visibility < 0.45) {
    return createSlot(
      "palmOrientation",
      "unknown",
      visibility * 0.4,
      "Hand landmarks were too weak for rough palm orientation estimate.",
      ["wrist", "index tip", "pinky tip"],
      "missing",
    );
  }

  const wrist = first.points[0];
  const indexTip = first.points[2];
  const pinkyTip = first.points[5] ?? first.points[4];
  const meanZ = averageAbsZ(hands);
  const horizontalSpread = Math.abs((indexTip?.[0] ?? 0) - (pinkyTip?.[0] ?? 0));
  const verticalReach = Math.abs((indexTip?.[1] ?? 0) - (wrist?.[1] ?? 0));
  let valueLabel = "away/side";

  if (meanZ > 0.05) {
    valueLabel = "toward camera";
  } else if (verticalReach > horizontalSpread * 1.4) {
    valueLabel = "down/up-ish";
  }

  return createSlot(
    "palmOrientation",
    valueLabel,
    visibility * 0.9,
    "Rough palm/orientation cue from wrist-to-finger direction and landmark depth. Coarse only.",
    ["wrist", "index tip", "pinky tip"],
  );
}

function extractLocation(
  encodedSequence: EncodedSequence,
  frames: ReceiptReplayFrame[],
) {
  const wristY = averageWristY(frames);
  const nearFace = encodedSequence.handPoseVector[11] ?? 0;
  const visibility = encodedSequence.quality.handVisibleRatio;

  if (wristY === null || visibility < 0.4) {
    return createSlot(
      "location",
      "unknown",
      visibility * 0.4,
      "Hand location could not be placed into coarse body zone from visible landmarks.",
      ["wrist", "pose shoulders", "face center"],
      "missing",
    );
  }

  let valueLabel = "neutral signing space";

  if (visibility < 0.55 || wristY > 0.74) {
    valueLabel = "low/out of frame";
  } else if (nearFace >= 0.6 || wristY <= 0.44) {
    valueLabel = "face zone";
  } else if (wristY <= 0.63) {
    valueLabel = "chest zone";
  }

  return createSlot(
    "location",
    valueLabel,
    visibility,
    "Body-zone estimate from wrist position relative to face and torso landmarks.",
    ["wrist", "pose shoulders", "mouth center"],
  );
}

function extractMovement(
  encodedSequence: EncodedSequence,
  frames: ReceiptReplayFrame[],
) {
  const motionEnergy = encodedSequence.quality.motionEnergy;
  const extent = handPathExtent(frames);
  const directionChanges = movementDirectionChanges(frames);
  let valueLabel = "unknown";
  let status: SignFormSlotStatus | undefined;

  if (encodedSequence.quality.handVisibleRatio < 0.45) {
    status = "missing";
  } else if (motionEnergy < 0.08) {
    valueLabel = "mostly still";
  } else if (directionChanges >= 2) {
    valueLabel = "repeated motion";
  } else if (extent >= 0.22) {
    valueLabel = "long path";
  } else {
    valueLabel = "short path";
  }

  return createSlot(
    "movement",
    valueLabel,
    Math.max(motionEnergy, encodedSequence.quality.handVisibleRatio * 0.6),
    "Movement path estimated from wrist travel through last decision window.",
    ["wrist path"],
    status ?? (valueLabel === "unknown" ? "unknown" : undefined),
  );
}

function extractTiming(
  encodedSequence: EncodedSequence,
  frames: ReceiptReplayFrame[],
) {
  const validFrames = encodedSequence.quality.validFrameCount;
  const holdScore = endingHoldScore(frames);
  let valueLabel = "unknown";
  let evidenceScore = clamp01(validFrames / 32);

  if (validFrames < 24) {
    valueLabel = "too short";
    evidenceScore = clamp01(validFrames / 24);
  } else if (holdScore >= 0.72) {
    valueLabel = "held ending";
    evidenceScore = holdScore;
  } else {
    valueLabel = "stable window";
  }

  return createSlot(
    "timing",
    valueLabel,
    evidenceScore,
    "Timing/hold cue estimated from window length and stability of ending frames.",
    ["frame timestamps", "ending wrist path"],
    valueLabel === "too short" ? "weak" : undefined,
  );
}

function extractMouthCue(encodedSequence: EncodedSequence) {
  const faceVisible = encodedSequence.quality.faceVisibleRatio;
  const mouthStability = encodedSequence.quality.mouthStability;

  if (faceVisible < 0.35) {
    return createSlot(
      "mouthCue",
      "missing",
      faceVisible * 0.4,
      "Face landmarks were not stable enough to inspect mouth cue.",
      ["upper lip", "lower lip", "mouth corners"],
      "missing",
    );
  }

  if (mouthStability >= 0.55) {
    return createSlot(
      "mouthCue",
      "visible/stable",
      mouthStability,
      "Mouth cue stayed visible enough for coarse inspection.",
      ["upper lip", "lower lip", "mouth corners"],
    );
  }

  if (mouthStability >= 0.2) {
    return createSlot(
      "mouthCue",
      "visible/unstable",
      mouthStability,
      "Mouth cue appeared, but stability stayed weak across decision window.",
      ["upper lip", "lower lip", "mouth corners"],
      "weak",
    );
  }

  return createSlot(
    "mouthCue",
    "missing",
    mouthStability,
    "Mouth cue stayed missing or too unstable for this window.",
    ["upper lip", "lower lip", "mouth corners"],
    "missing",
  );
}

function extractFacialCue(encodedSequence: EncodedSequence) {
  const faceVisible = encodedSequence.quality.faceVisibleRatio;
  const cueStrength = mean(encodedSequence.facialCueVector);

  if (faceVisible < 0.35) {
    return createSlot(
      "facialCue",
      "missing",
      faceVisible * 0.4,
      "Non-manual face cue could not be inspected because face landmarks were missing.",
      ["brow", "eyes", "jaw"],
      "missing",
    );
  }

  if (cueStrength >= 0.14) {
    return createSlot(
      "facialCue",
      "visible",
      Math.max(faceVisible, cueStrength),
      "Face/non-manual cue was visible enough for coarse inspection.",
      ["brow", "eyes", "jaw"],
    );
  }

  return createSlot(
    "facialCue",
    "weak",
    cueStrength,
    "Non-manual face cue stayed weak in this landmark window.",
    ["brow", "eyes", "jaw"],
    "weak",
  );
}

function extractVisibility(encodedSequence: EncodedSequence) {
  const handVisible = encodedSequence.quality.handVisibleRatio;
  const faceVisible = encodedSequence.quality.faceVisibleRatio;
  const clearScore = clamp01(
    (handVisible + faceVisible + clamp01(1 - encodedSequence.quality.occlusionRatio)) / 3,
  );

  if (handVisible < 0.55 || faceVisible < 0.35) {
    return createSlot(
      "visibility",
      "missing hand/face",
      clearScore,
      "One or more required landmark groups dropped out during this window.",
      ["hand landmarks", "face landmarks", "pose landmarks"],
      "missing",
    );
  }

  if (encodedSequence.quality.occlusionRatio > 0.2 || clearScore < 0.75) {
    return createSlot(
      "visibility",
      "partial occlusion",
      clearScore,
      "Landmark visibility was usable, but occlusion still affected confidence.",
      ["hand landmarks", "face landmarks", "pose landmarks"],
      "weak",
    );
  }

  return createSlot(
    "visibility",
    "clear",
    clearScore,
    "Required landmark groups stayed visible enough for coarse inspection.",
    ["hand landmarks", "face landmarks", "pose landmarks"],
  );
}

function collectWarnings(
  slots: SignFormSlots,
  decision: UncertaintyDecision,
  recognition: RecognitionResult,
) {
  const warnings = new Set<string>();

  if (decision.mode === "repair") {
    warnings.add(decision.message);
  }

  if (slots.mouthCue.status === "missing" || slots.mouthCue.status === "weak") {
    warnings.add("Mouth cue evidence stayed limited in this window.");
  }

  if (slots.visibility.status === "missing" || slots.visibility.status === "weak") {
    warnings.add("Visibility or occlusion limited what the ledger could inspect.");
  }

  if (!recognition.top1) {
    warnings.add("No known candidate cleared enough evidence to anchor a demo comparison.");
  }

  return Array.from(warnings);
}

export class SignFormExtractor {
  extract({
    receiptId,
    receipt,
    encodedSequence,
    recognition,
    decision,
  }: SignFormExtractorInput): SignFormLedger {
    const frames = receipt.replayFrames;
    const slots: SignFormSlots = {
      handshape: extractHandshape(encodedSequence, frames),
      palmOrientation: extractPalmOrientation(encodedSequence, frames),
      location: extractLocation(encodedSequence, frames),
      movement: extractMovement(encodedSequence, frames),
      timing: extractTiming(encodedSequence, frames),
      mouthCue: extractMouthCue(encodedSequence),
      facialCue: extractFacialCue(encodedSequence),
      visibility: extractVisibility(encodedSequence),
    };
    const missingSlots = (Object.values(slots) as SignFormSlot[])
      .filter((slot) => slot.status === "missing")
      .map((slot) => slot.name);
    const confidence = round(
      mean((Object.values(slots) as SignFormSlot[]).map((slot) => slot.evidenceScore)),
    );

    return {
      id: createLedgerId(receiptId),
      createdAt: new Date().toISOString(),
      sourceReceiptId: receiptId,
      candidateId: recognition.top1?.id,
      candidateLabel: recognition.top1?.label,
      slots,
      confidence,
      missingSlots,
      warnings: collectWarnings(slots, decision, recognition),
      privacy: {
        landmarkOnly: true,
        rawVideoStored: false,
        pixelDataStored: false,
      },
    };
  }
}

export const signFormExtractor = new SignFormExtractor();
