import type {
  Classifications,
  HolisticLandmarker as MediaPipeHolisticLandmarker,
  HolisticLandmarkerResult,
} from "@mediapipe/tasks-vision";
import type {
  ExtractorKind,
  FaceLandmarkSet,
  HandLandmarkSet,
  LandmarkExtractor,
  LandmarkFrame,
  LandmarkListener,
  LandmarkSnapshot,
  Point3D,
  PoseLandmarkSet,
} from "@/lib/landmarks/types";

const FRAME_INTERVAL_MS = 1000 / 12;
const BUFFER_LIMIT = 64;

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
      worldLandmarks: result.leftHandWorldLandmarks[0]?.map((point) =>
        toPoint(point),
      ),
    });
  }

  if (result.rightHandLandmarks[0]?.length) {
    hands.push({
      handedness: "right",
      landmarks: result.rightHandLandmarks[0].map((point) => toPoint(point)),
      worldLandmarks: result.rightHandWorldLandmarks[0]?.map((point) =>
        toPoint(point),
      ),
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

function createFrame(
  result: HolisticLandmarkerResult,
  timestamp: number,
  frameIndex: number,
  extractorKind: ExtractorKind,
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

function blankFace() {
  return Array.from({ length: 478 }, () => ({
    x: 0.5,
    y: 0.36,
    z: 0,
  }));
}

function createMockFace(mode: string, phase: number): FaceLandmarkSet {
  const face = blankFace();
  const mouthOpen =
    mode === "thank-you"
      ? 0.028
      : mode === "no"
        ? 0.024
        : 0.015 + Math.abs(Math.sin(phase)) * 0.01;
  const mouthWidth = mode === "hello" ? 0.08 : 0.07;
  const smileLift = mode === "hello" ? 0.012 : 0.006;

  face[1] = { x: 0.5, y: 0.34, z: 0 };
  face[13] = { x: 0.5, y: 0.39 - mouthOpen / 2, z: 0 };
  face[14] = { x: 0.5, y: 0.39 + mouthOpen / 2, z: 0 };
  face[61] = { x: 0.5 - mouthWidth / 2, y: 0.39 - smileLift, z: 0 };
  face[291] = { x: 0.5 + mouthWidth / 2, y: 0.39 - smileLift, z: 0 };
  face[78] = { x: 0.5 - mouthWidth / 2, y: 0.39 - smileLift, z: 0 };
  face[308] = { x: 0.5 + mouthWidth / 2, y: 0.39 - smileLift, z: 0 };
  face[82] = { x: 0.48, y: 0.388, z: 0 };
  face[312] = { x: 0.52, y: 0.388, z: 0 };
  face[87] = { x: 0.485, y: 0.398, z: 0 };
  face[317] = { x: 0.515, y: 0.398, z: 0 };
  face[70] = { x: 0.44, y: 0.27, z: 0 };
  face[300] = { x: 0.56, y: 0.27, z: 0 };
  face[159] = { x: 0.45, y: 0.33, z: 0 };
  face[145] = { x: 0.45, y: 0.342, z: 0 };
  face[386] = { x: 0.55, y: 0.33, z: 0 };
  face[374] = { x: 0.55, y: 0.342, z: 0 };

  return {
    landmarks: face,
    blendshapes: {
      jawOpen: Math.min(mouthOpen * 10, 1),
      browInnerUp: mode === "help" ? 0.22 : 0.12,
      eyeBlinkLeft: 0.08,
      eyeBlinkRight: 0.08,
      mouthSmileLeft: mode === "hello" ? 0.26 : 0.08,
      mouthSmileRight: mode === "hello" ? 0.26 : 0.08,
    },
  };
}

function createMockPose(): PoseLandmarkSet {
  const pose = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0 }));

  pose[11] = { x: 0.42, y: 0.44, z: 0 };
  pose[12] = { x: 0.58, y: 0.44, z: 0 };
  pose[13] = { x: 0.39, y: 0.57, z: 0 };
  pose[14] = { x: 0.61, y: 0.57, z: 0 };
  pose[15] = { x: 0.38, y: 0.68, z: 0 };
  pose[16] = { x: 0.62, y: 0.68, z: 0 };
  pose[23] = { x: 0.46, y: 0.72, z: 0 };
  pose[24] = { x: 0.54, y: 0.72, z: 0 };

  return { landmarks: pose };
}

function handPoint(x: number, y: number): Point3D {
  return { x, y, z: 0 };
}

function createMockHand(
  mode: string,
  phase: number,
  handedness: "left" | "right" = "right",
): HandLandmarkSet {
  const wave = Math.sin(phase);
  const bounce = Math.sin(phase * 1.6);
  let wristX = 0.62;
  let wristY = 0.42;
  let openness = 0.08;
  let spread = 0.04;

  switch (mode) {
    case "hello":
      wristX = 0.65 + wave * 0.035;
      wristY = 0.32 + wave * 0.015;
      openness = 0.09;
      spread = 0.06;
      break;
    case "thank-you":
      wristX = 0.56 + Math.abs(wave) * 0.08;
      wristY = 0.39 - wave * 0.01;
      openness = 0.09;
      spread = 0.04;
      break;
    case "yes":
      wristX = 0.58;
      wristY = 0.46 + bounce * 0.035;
      openness = 0.04;
      spread = 0.02;
      break;
    case "no":
      wristX = 0.56 + wave * 0.02;
      wristY = 0.4;
      openness = 0.05;
      spread = 0.03;
      break;
    case "help":
      wristX = 0.52;
      wristY = 0.56;
      openness = 0.045;
      spread = 0.025;
      break;
    default:
      break;
  }

  const direction = handedness === "right" ? 1 : -1;

  const landmarks = [
    handPoint(wristX, wristY),
    handPoint(wristX + 0.02 * direction, wristY - 0.01),
    handPoint(wristX + 0.03 * direction, wristY - 0.03),
    handPoint(wristX + 0.04 * direction, wristY - 0.05),
    handPoint(wristX + 0.05 * direction, wristY - 0.07),
    handPoint(wristX + 0.01 * direction, wristY - 0.03),
    handPoint(wristX + 0.02 * direction, wristY - 0.06),
    handPoint(wristX + 0.03 * direction, wristY - 0.09),
    handPoint(wristX + spread * direction, wristY - openness * 1.2),
    handPoint(wristX, wristY - 0.03),
    handPoint(wristX, wristY - 0.07),
    handPoint(wristX, wristY - 0.1),
    handPoint(wristX, wristY - openness * 1.32),
    handPoint(wristX - 0.01 * direction, wristY - 0.03),
    handPoint(wristX - 0.015 * direction, wristY - 0.06),
    handPoint(wristX - 0.02 * direction, wristY - 0.09),
    handPoint(wristX - spread * 0.7 * direction, wristY - openness * 1.18),
    handPoint(wristX - 0.02 * direction, wristY - 0.02),
    handPoint(wristX - 0.03 * direction, wristY - 0.04),
    handPoint(wristX - 0.04 * direction, wristY - 0.06),
    handPoint(wristX - spread * direction, wristY - openness),
  ];

  return {
    handedness,
    landmarks,
  };
}

function createMockFrame(timestamp: number, frameIndex: number): LandmarkFrame {
  const modes = ["hello", "thank-you", "yes", "no", "help"] as const;
  const mode = modes[Math.floor(timestamp / 4000) % modes.length];
  const phase = timestamp / 420;
  const face = createMockFace(mode, phase);
  const hands = [createMockHand(mode, phase)];
  const pose = createMockPose();

  return {
    timestamp,
    hands,
    face,
    mouth: extractMouth(face.landmarks),
    pose,
    quality: {
      extractorKind: "mock",
      isDemoMode: true,
      handVisible: true,
      faceVisible: true,
      poseVisible: true,
    },
    frameIndex,
    mirrored: true,
  };
}

abstract class BaseExtractor implements LandmarkExtractor {
  protected readonly listeners = new Set<LandmarkListener>();
  protected readonly buffer: LandmarkFrame[] = [];
  protected frameIndex = 0;

  subscribe(listener: LandmarkListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  protected emit(frame: LandmarkFrame) {
    this.buffer.push(frame);

    if (this.buffer.length > BUFFER_LIMIT) {
      this.buffer.shift();
    }

    const snapshot: LandmarkSnapshot = {
      ...frame,
      buffer: [...this.buffer],
    };

    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  abstract start(video: HTMLVideoElement): Promise<void>;
  abstract stop(): void;
  abstract getKind(): ExtractorKind;
}

export class HolisticLandmarkExtractor extends BaseExtractor {
  private running = false;
  private frameHandle: number | null = null;
  private lastVideoTime = -1;
  private lastInferenceAt = 0;
  private detector: MediaPipeHolisticLandmarker | null = null;

  async start(video: HTMLVideoElement) {
    const { FilesetResolver, HolisticLandmarker } = await import(
      "@mediapipe/tasks-vision"
    );

    const fileset = await FilesetResolver.forVisionTasks(MEDIA_PIPE_WASM_ROOT);
    this.detector = await HolisticLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: MEDIA_PIPE_MODEL_ASSET_PATH,
      },
      runningMode: "VIDEO",
      outputFaceBlendshapes: true,
      minPoseDetectionConfidence: 0.45,
      minPosePresenceConfidence: 0.45,
      minHandLandmarksConfidence: 0.45,
    });

    this.running = true;

    const step = () => {
      if (!this.running || !this.detector) {
        return;
      }

      const now = performance.now();

      if (
        video.readyState >= 2 &&
        video.currentTime !== this.lastVideoTime &&
        now - this.lastInferenceAt >= FRAME_INTERVAL_MS
      ) {
        this.lastVideoTime = video.currentTime;
        this.lastInferenceAt = now;

        const result = this.detector.detectForVideo(video, now);
        const frame = createFrame(result, now, this.frameIndex, "holistic");

        this.frameIndex += 1;
        this.emit(frame);
      }

      this.frameHandle = window.requestAnimationFrame(step);
    };

    step();
  }

  stop() {
    this.running = false;

    if (this.frameHandle !== null) {
      window.cancelAnimationFrame(this.frameHandle);
      this.frameHandle = null;
    }

    this.detector?.close?.();
    this.detector = null;
    this.buffer.length = 0;
    this.lastVideoTime = -1;
    this.frameIndex = 0;
  }

  getKind() {
    return "holistic" as const;
  }
}

export class MockLandmarkExtractor extends BaseExtractor {
  private running = false;
  private timer: number | null = null;

  async start(video: HTMLVideoElement) {
    void video;
    this.running = true;

    const tick = () => {
      if (!this.running) {
        return;
      }

      const now = performance.now();
      const frame = createMockFrame(now, this.frameIndex);

      this.frameIndex += 1;
      this.emit(frame);
      this.timer = window.setTimeout(tick, FRAME_INTERVAL_MS);
    };

    tick();
  }

  stop() {
    this.running = false;

    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }

    this.buffer.length = 0;
    this.frameIndex = 0;
  }

  getKind() {
    return "mock" as const;
  }
}
