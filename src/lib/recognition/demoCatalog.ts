import { buildCentroid } from "@/lib/features/normalize";
import type { CandidatePrototype } from "@/lib/recognition/types";

function demoPrototype(
  id: string,
  label: string,
  vectors: {
    handPose: number[];
    handVelocity: number[];
    mouthShape: number[];
    facialCue: number[];
    motionMask: number[];
    visibility: number[];
  },
  options?: {
    needsMouthCue?: boolean;
    needsFaceCue?: boolean;
    expectedLocation?: string;
    expectedMovement?: string;
    handshapeHint?: string;
    notes?: string;
  },
): CandidatePrototype {
  const needsMouthCue = options?.needsMouthCue ?? false;
  const needsFaceCue = options?.needsFaceCue ?? false;

  return {
    id,
    label,
    source: "demo",
    centroid: buildCentroid([
      vectors.handPose,
      vectors.handVelocity,
      vectors.mouthShape,
      vectors.facialCue,
      vectors.motionMask,
      vectors.visibility,
    ]),
    metadata: {
      needsMouthCue,
      needsFaceCue,
      demoDisclaimer:
        "Demo prototype only. This label is illustrative, not authoritative ASL coverage.",
      notes: needsMouthCue
        ? "Prototype uses mouth cue as extra disambiguation signal."
        : "Prototype uses hand motion and body context only.",
      expectedFormHints: {
        expectedLocation: options?.expectedLocation,
        expectedMovement: options?.expectedMovement,
        needsMouthCue,
        needsFacialCue: needsFaceCue,
        handshapeHint: options?.handshapeHint,
        notes:
          options?.notes ??
          "Demo hints only. Coarse inspectability cue, not official ASL analysis.",
      },
    },
    examplesCount: 2,
    updatedAt: new Date("2026-04-21T00:00:00.000Z").toISOString(),
  };
}

export const DEMO_PROTOTYPES: CandidatePrototype[] = [
  demoPrototype(
    "demo-hello",
    "hello",
    {
      handPose: [0.54, -0.5, 0.75, -0.58, 0.3, -0.42, 0.82, -0.5, 0.62, 0.58, 0.78, 0.86],
      handVelocity: [0.18, 0.02, 0.32, 0.34],
      mouthShape: [0.12, 0.34, 0.18, 0.78],
      facialCue: [0.16, 0.1, 0.22, 0.12],
      motionMask: [0.86, 0.32, 0.82, 1],
      visibility: [0.92, 0.96, 0.94, 0.9],
    },
    {
      expectedLocation: "face zone",
      expectedMovement: "long path",
      handshapeHint: "open-ish",
    },
  ),
  demoPrototype(
    "demo-thank-you",
    "thank-you",
    {
      handPose: [0.24, -0.18, 0.52, -0.12, 0.1, -0.06, 0.62, -0.08, 0.68, 0.46, 0.4, 0.98],
      handVelocity: [0.24, -0.08, 0.28, 0.26],
      mouthShape: [0.16, 0.36, 0.24, 0.7],
      facialCue: [0.14, 0.08, 0.24, 0.16],
      motionMask: [0.82, 0.28, 0.94, 1],
      visibility: [0.9, 0.96, 0.92, 0.9],
    },
    {
      needsMouthCue: true,
      expectedLocation: "chest zone",
      expectedMovement: "long path",
      handshapeHint: "flat-ish",
      notes: "Demo hint suggests mouth cue may help separate this near miss.",
    },
  ),
  demoPrototype(
    "demo-yes",
    "yes",
    {
      handPose: [0.28, -0.02, 0.34, -0.03, 0.24, 0.04, 0.39, 0.05, 0.24, 0.14, 0.34, 0.76],
      handVelocity: [0.02, 0.3, 0.42, 0.86],
      mouthShape: [0.1, 0.31, 0.1, 0.74],
      facialCue: [0.12, 0.06, 0.08, 0.1],
      motionMask: [0.82, 0.42, 0.74, 1],
      visibility: [0.94, 0.92, 0.94, 0.92],
    },
    {
      expectedLocation: "chest zone",
      expectedMovement: "repeated motion",
      handshapeHint: "closed-ish",
    },
  ),
  demoPrototype(
    "demo-no",
    "no",
    {
      handPose: [0.22, -0.12, 0.48, -0.08, 0.12, -0.04, 0.5, -0.02, 0.42, 0.22, 0.38, 0.92],
      handVelocity: [0.22, 0.02, 0.18, 0.36],
      mouthShape: [0.18, 0.3, 0.08, 0.66],
      facialCue: [0.1, 0.14, 0.04, 0.16],
      motionMask: [0.76, 0.18, 0.9, 1],
      visibility: [0.9, 0.94, 0.9, 0.88],
    },
    {
      needsMouthCue: true,
      expectedLocation: "face zone",
      expectedMovement: "short path",
      handshapeHint: "pointing-ish",
    },
  ),
  demoPrototype(
    "demo-help",
    "help",
    {
      handPose: [0.04, 0.32, 0.16, 0.24, -0.02, 0.28, 0.22, 0.28, 0.28, 0.22, 0.08, 0.4],
      handVelocity: [0.02, -0.02, 0.1, 0.22],
      mouthShape: [0.11, 0.31, 0.12, 0.78],
      facialCue: [0.08, 0.1, 0.06, 0.08],
      motionMask: [0.82, 0.1, 0.34, 1],
      visibility: [0.94, 0.92, 0.96, 0.94],
    },
    {
      expectedLocation: "chest zone",
      expectedMovement: "short path",
      handshapeHint: "closed-ish",
    },
  ),
];
