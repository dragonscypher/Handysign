import type { CuePatchKind } from "@/lib/repair/CuePatch";

export type ExtractorKind = "holistic" | "mock";
export type Handedness = "left" | "right";

export interface Point3D {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface HandLandmarkSet {
  handedness: Handedness;
  landmarks: Point3D[];
  worldLandmarks?: Point3D[];
}

export interface FaceLandmarkSet {
  landmarks: Point3D[];
  blendshapes: Record<string, number>;
}

export interface PoseLandmarkSet {
  landmarks: Point3D[];
  worldLandmarks?: Point3D[];
}

export interface FrameQuality {
  extractorKind: ExtractorKind;
  isDemoMode: boolean;
  handVisible: boolean;
  faceVisible: boolean;
  poseVisible: boolean;
}

export interface LandmarkFrame {
  timestamp: number;
  hands: HandLandmarkSet[];
  face: FaceLandmarkSet | null;
  mouth: Point3D[];
  pose: PoseLandmarkSet | null;
  quality: FrameQuality;
  frameIndex: number;
  mirrored: boolean;
}

export interface LandmarkSnapshot extends LandmarkFrame {
  buffer: LandmarkFrame[];
}

export type LandmarkListener = (snapshot: LandmarkSnapshot) => void;

export interface LandmarkExtractor {
  start(video: HTMLVideoElement): Promise<void>;
  stop(): void;
  subscribe(listener: LandmarkListener): () => void;
  getKind(): ExtractorKind;
  requestCuePatch?(kind: CuePatchKind): void;
}
