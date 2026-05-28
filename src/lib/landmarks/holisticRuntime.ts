import type {
  Classifications,
  HolisticLandmarker as MediaPipeHolisticLandmarker,
  HolisticLandmarkerResult,
} from "@mediapipe/tasks-vision";
import type {
  ExtractorKind,
  FaceLandmarkSet,
  HandLandmarkSet,
  LandmarkFrame,
  Point3D,
  PoseLandmarkSet,
} from "@/lib/landmarks/types";

export const MEDIA_PIPE_MODEL_ASSET_PATH =
  "https://storage.googleapis.com/mediapipe-models/holistic_landmarker/holistic_landmarker/float16/latest/holistic_landmarker.task";

export const MEDIA_PIPE_WASM_ROOT =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm";

const MOUTH_INDICES = [13, 14, 61, 291, 78, 308, 82, 312, 87, 317] as const;

function toPoint(
  point?: {
    x: number;
    y: number;
    z?: number;
    visibility?: number;
  },
  fallback: Point3D = { x: 0.5, y: 0.5, z: 0 },
): Point3D {
  if (!point) {
    return fallback;
  }

  return {
    x: point.x,
    y: point.y,
    z: point.z ?? 0,
    visibility: point.visibility,
  };
}

function categoriesToMap(classifications?: Classifications) {
  const map: Record<string, number> = {};

  for (const category of classifications?.categories ?? []) {
    map[category.categoryName || category.displayName || `${category.index}`] =
      category.score;
  }

  return map;
}

function extractMouth(face: Point3D[]) {
  return MOUTH_INDICES.map((index) => face[index]).filter(
    (point): point is Point3D => Boolean(point),
  );
}

function createHands(
  result: HolisticLandmarkerResult,
): HandLandmarkSet[] {
  const hands: HandLandmarkSet[] = [];

  if (result.leftHandLandmarks[0]?.length) {
    hands.push({
      handedness: "left",
      landmarks: result.leftHandLandmarks[0].map((point) => toPoint(point)),
      worldLandmarks: result.leftHandWorldLandmarks[0]?.map((point) => toPoint(point)),
    });
  }

  if (result.rightHandLandmarks[0]?.length) {
    hands.push({
      handedness: "right",
      landmarks: result.rightHandLandmarks[0].map((point) => toPoint(point)),
      worldLandmarks: result.rightHandWorldLandmarks[0]?.map((point) => toPoint(point)),
    });
  }

  return hands;
}

function createFace(result: HolisticLandmarkerResult): FaceLandmarkSet | null {
  const face = result.faceLandmarks[0];

  if (!face?.length) {
    return null;
  }

  return {
    landmarks: face.map((point) => toPoint(point)),
    blendshapes: categoriesToMap(result.faceBlendshapes[0]),
  };
}

function createPose(result: HolisticLandmarkerResult): PoseLandmarkSet | null {
  const pose = result.poseLandmarks[0];

  if (!pose?.length) {
    return null;
  }

  return {
    landmarks: pose.map((point) => toPoint(point)),
    worldLandmarks: result.poseWorldLandmarks[0]?.map((point) => toPoint(point)),
  };
}

export function createLandmarkFrameFromHolisticResult(
  result: HolisticLandmarkerResult,
  timestamp: number,
  frameIndex: number,
  extractorKind: ExtractorKind = "holistic",
): LandmarkFrame {
  const face = createFace(result);
  const hands = createHands(result);
  const pose = createPose(result);

  return {
    timestamp,
    hands,
    face,
    mouth: extractMouth(face?.landmarks ?? []),
    pose,
    quality: {
      extractorKind,
      isDemoMode: extractorKind === "mock",
      handVisible: hands.length > 0,
      faceVisible: Boolean(face),
      poseVisible: Boolean(pose),
    },
    frameIndex,
    mirrored: true,
  };
}

export async function createHolisticDetector() {
  const { FilesetResolver, HolisticLandmarker } = await import("@mediapipe/tasks-vision");

  const fileset = await FilesetResolver.forVisionTasks(MEDIA_PIPE_WASM_ROOT);

  return HolisticLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: MEDIA_PIPE_MODEL_ASSET_PATH,
    },
    runningMode: "VIDEO",
    outputFaceBlendshapes: true,
    minPoseDetectionConfidence: 0.45,
    minPosePresenceConfidence: 0.45,
    minHandLandmarksConfidence: 0.45,
  }) as Promise<MediaPipeHolisticLandmarker>;
}
