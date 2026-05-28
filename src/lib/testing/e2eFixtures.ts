import { buildCentroid } from "@/lib/features/normalize";
import type {
  FaceLandmarkSet,
  LandmarkFrame,
  LandmarkSnapshot,
  Point3D,
  PoseLandmarkSet,
} from "@/lib/landmarks/types";
import type { EncodedSequence } from "@/lib/recognition/types";
import type { LiveE2EScenario } from "@/lib/testing/e2eFlags";

type E2ECapturePhase = "before" | "after";

function point(x: number, y: number, z = 0): Point3D {
  return { x, y, z };
}

function createHandLandmarks(
  wristX: number,
  wristY: number,
  openness = 0.08,
  spread = 0.04,
) {
  return [
    point(wristX, wristY),
    point(wristX + 0.015, wristY - 0.01),
    point(wristX + 0.025, wristY - 0.03),
    point(wristX + 0.035, wristY - 0.05),
    point(wristX + 0.05, wristY - 0.07),
    point(wristX + 0.01, wristY - 0.03),
    point(wristX + 0.015, wristY - 0.06),
    point(wristX + 0.02, wristY - 0.09),
    point(wristX + spread, wristY - openness * 1.2),
    point(wristX, wristY - 0.03),
    point(wristX, wristY - 0.06),
    point(wristX, wristY - 0.09),
    point(wristX, wristY - openness * 1.3),
    point(wristX - 0.01, wristY - 0.03),
    point(wristX - 0.015, wristY - 0.06),
    point(wristX - 0.02, wristY - 0.09),
    point(wristX - spread * 0.7, wristY - openness * 1.15),
    point(wristX - 0.02, wristY - 0.02),
    point(wristX - 0.03, wristY - 0.04),
    point(wristX - 0.04, wristY - 0.06),
    point(wristX - spread, wristY - openness),
  ];
}

function createFace(mouthOpen = 0.02, emphasis = 0.18): FaceLandmarkSet {
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
      browInnerUp: emphasis,
      eyeBlinkLeft: 0.08,
      eyeBlinkRight: 0.08,
      mouthSmileLeft: 0.18,
      mouthSmileRight: 0.18,
    },
  };
}

function createPose(compact = false): PoseLandmarkSet {
  const landmarks = Array.from({ length: 33 }, () => point(0.5, 0.5));
  const shoulderSpread = compact ? 0.06 : 0.08;

  landmarks[11] = point(0.5 - shoulderSpread, 0.44);
  landmarks[12] = point(0.5 + shoulderSpread, 0.44);
  landmarks[23] = point(0.46, 0.72);
  landmarks[24] = point(0.54, 0.72);

  return { landmarks };
}

function createSnapshot(options?: {
  frameCount?: number;
  motion?: "dynamic" | "static";
  occludedTailCount?: number;
  mouthOpen?: number;
  compactBody?: boolean;
  handOpen?: number;
  startIndex?: number;
}): LandmarkSnapshot {
  const {
    frameCount = 32,
    motion = "dynamic",
    occludedTailCount = 0,
    mouthOpen = 0.02,
    compactBody = false,
    handOpen = 0.08,
    startIndex = 0,
  } = options ?? {};
  const buffer: LandmarkFrame[] = [];

  for (let index = 0; index < frameCount; index += 1) {
    const absoluteIndex = startIndex + index;
    const isOccluded = index >= frameCount - occludedTailCount;
    const drift = motion === "dynamic" ? index * 0.03 : 0;
    const bounce = motion === "dynamic" ? Math.sin(index / 4) * 0.04 : 0;
    const face = isOccluded ? createFace(0.001, 0.04) : createFace(mouthOpen);
    const hands = isOccluded
      ? []
      : [
          {
            handedness: "right" as const,
            landmarks: createHandLandmarks(0.56 + drift, 0.44 + bounce, handOpen),
          },
        ];
    const pose = compactBody && isOccluded ? null : createPose(compactBody);

    buffer.push({
      timestamp: absoluteIndex * 90,
      hands,
      face,
      mouth: face.landmarks
        .filter((_, landmarkIndex) =>
          [13, 14, 61, 291, 78, 308, 82, 312, 87, 317].includes(landmarkIndex),
        )
        .slice(0, 10),
      pose,
      quality: {
        extractorKind: "mock",
        isDemoMode: true,
        handVisible: hands.length > 0,
        faceVisible: Boolean(face),
        poseVisible: Boolean(pose),
      },
      frameIndex: absoluteIndex,
      mirrored: true,
    });
  }

  return {
    ...buffer.at(-1)!,
    buffer,
  };
}

function buildSequence(parts: {
  handPoseVector: number[];
  handVelocityVector: number[];
  mouthShapeVector: number[];
  facialCueVector: number[];
  motionMaskSummary: number[];
  visibilityMask: number[];
  frameCount: number;
  quality: EncodedSequence["quality"];
}): EncodedSequence {
  return {
    handPoseVector: parts.handPoseVector,
    handVelocityVector: parts.handVelocityVector,
    mouthShapeVector: parts.mouthShapeVector,
    facialCueVector: parts.facialCueVector,
    motionMaskSummary: parts.motionMaskSummary,
    visibilityMask: parts.visibilityMask,
    dominantHand: "right",
    frameCount: parts.frameCount,
    centroid: buildCentroid([
      parts.handPoseVector,
      parts.handVelocityVector,
      parts.mouthShapeVector,
      parts.facialCueVector,
      parts.motionMaskSummary,
      parts.visibilityMask,
    ]),
    quality: parts.quality,
  };
}

export function createE2EConfusionTwinSnapshot() {
  return createSnapshot();
}

export function createE2ECuePatchSnapshot(
  scenario: Exclude<LiveE2EScenario, "confusion-twin" | null>,
  phase: E2ECapturePhase,
) {
  switch (scenario) {
    case "cue-patch-mouth":
      return createSnapshot({
        mouthOpen: phase === "after" ? 0.03 : 0.004,
        handOpen: 0.08,
        motion: "dynamic",
        startIndex: phase === "after" ? 40 : 0,
      });
    case "cue-patch-hand":
    default:
      return createSnapshot({
        mouthOpen: 0.02,
        handOpen: 0.08,
        motion: "dynamic",
        occludedTailCount: phase === "after" ? 0 : 12,
        compactBody: phase === "before",
        startIndex: phase === "after" ? 40 : 0,
      });
  }
}

export function createE2EEncodedSequence(
  scenario: LiveE2EScenario = "confusion-twin",
  phase: E2ECapturePhase = "before",
): EncodedSequence {
  if (scenario === "cue-patch-mouth") {
    return buildSequence({
      handPoseVector: [
        0.25, -0.18, 0.53, -0.12, 0.12, -0.06, 0.61, -0.08, 0.66, 0.46, 0.42,
        0.98,
      ],
      handVelocityVector: [0.24, -0.08, 0.28, 0.26],
      mouthShapeVector:
        phase === "after" ? [0.16, 0.36, 0.24, 0.7] : [0.02, 0.06, 0.01, 0.08],
      facialCueVector: [0.14, 0.08, 0.24, 0.16],
      motionMaskSummary: [0.82, 0.28, 0.94, 1],
      visibilityMask: [0.9, 0.96, 0.92, 0.9],
      frameCount: 32,
      quality: {
        extractorKind: "mock",
        isDemoMode: true,
        validFrameCount: 32,
        validFrameRatio: 1,
        handVisibleRatio: 1,
        faceVisibleRatio: 1,
        poseVisibleRatio: 1,
        occlusionRatio: 0,
        motionEnergy: 0.28,
        mouthStability: phase === "after" ? 0.76 : 0.18,
      },
    });
  }

  if (scenario === "cue-patch-hand") {
    return buildSequence({
      handPoseVector: [
        0.54, -0.5, 0.75, -0.58, 0.3, -0.42, 0.82, -0.5, 0.62, 0.58, 0.78, 0.86,
      ],
      handVelocityVector: [0.18, 0.02, 0.32, 0.34],
      mouthShapeVector: [0.12, 0.34, 0.18, 0.78],
      facialCueVector: [0.16, 0.1, 0.22, 0.12],
      motionMaskSummary: [0.86, 0.32, 0.82, 1],
      visibilityMask:
        phase === "after" ? [0.92, 0.95, 0.93, 0.9] : [0.48, 0.44, 0.42, 0.38],
      frameCount: 32,
      quality: {
        extractorKind: "mock",
        isDemoMode: true,
        validFrameCount: 32,
        validFrameRatio: 1,
        handVisibleRatio: phase === "after" ? 0.96 : 0.5,
        faceVisibleRatio: 0.9,
        poseVisibleRatio: phase === "after" ? 0.92 : 0.42,
        occlusionRatio: phase === "after" ? 0 : 0.48,
        motionEnergy: 0.3,
        mouthStability: 0.74,
      },
    });
  }

  return buildSequence({
    handPoseVector: [0.38, -0.34, 0.62, -0.3, 0.2, -0.24, 0.72, -0.28, 0.65, 0.52, 0.59, 0.92],
    handVelocityVector: [0.21, -0.03, 0.29, 0.3],
    mouthShapeVector: [0.14, 0.35, 0.21, 0.74],
    facialCueVector: [0.15, 0.09, 0.23, 0.14],
    motionMaskSummary: [0.84, 0.3, 0.88, 1],
    visibilityMask: [0.92, 0.95, 0.93, 0.9],
    frameCount: 32,
    quality: {
      extractorKind: "mock",
      isDemoMode: true,
      validFrameCount: 32,
      validFrameRatio: 1,
      handVisibleRatio: 1,
      faceVisibleRatio: 1,
      poseVisibleRatio: 1,
      occlusionRatio: 0,
      motionEnergy: 0.29,
      mouthStability: 0.74,
    },
  });
}
