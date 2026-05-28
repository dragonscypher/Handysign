import type { LandmarkFrame, Point3D } from "@/lib/landmarks/types";
import { decodeBlindSemantics } from "@/lib/recognition/BlindSemanticDecoder";
import {
    createBufferSnapshot,
    createEncodedSequence,
} from "./testUtils";

function point(x: number, y: number, z = 0): Point3D {
    return { x, y, z };
}

function setHandAt(frame: LandmarkFrame, wristX: number, wristY: number, open = 0.42, spread = 0.34) {
    if (!frame.hands[0]) {
        return;
    }

    const hand = frame.hands[0]!;
    const direction = open >= 0.5 ? 1 : 0.72;
    hand.landmarks = hand.landmarks.map((landmark, index) => {
        if (index === 0) {
            return point(wristX, wristY, landmark.z);
        }

        const fingerIndex = index % 4;
        const side =
            index >= 17 ? -1.1 : index >= 13 ? -0.7 : index >= 9 ? -0.15 : index >= 5 ? 0.35 : 0.75;
        const step = fingerIndex + 1;
        return point(
            wristX + side * spread * 0.02 * step,
            wristY - direction * 0.018 * step,
            landmark.z,
        );
    });
}

function setPoseFaceTargets(frame: LandmarkFrame, targets: {
    rightEar?: { x: number; y: number };
    leftEar?: { x: number; y: number };
    nose?: { x: number; y: number };
    shoulderY?: number;
    torsoShiftX?: number;
}) {
    if (!frame.pose) {
        return;
    }

    const rightEar = targets.rightEar ?? { x: 0.66, y: 0.34 };
    const leftEar = targets.leftEar ?? { x: 0.34, y: 0.34 };
    const nose = targets.nose ?? { x: 0.5, y: 0.34 };
    const shoulderY = targets.shoulderY ?? 0.44;
    const torsoShiftX = targets.torsoShiftX ?? 0;

    frame.pose.landmarks[0] = point(nose.x, nose.y);
    frame.pose.landmarks[7] = point(leftEar.x + torsoShiftX, leftEar.y);
    frame.pose.landmarks[8] = point(rightEar.x + torsoShiftX, rightEar.y);
    frame.pose.landmarks[11] = point(0.42 + torsoShiftX, shoulderY);
    frame.pose.landmarks[12] = point(0.58 + torsoShiftX, shoulderY);
    frame.pose.landmarks[23] = point(0.46 + torsoShiftX, 0.72);
    frame.pose.landmarks[24] = point(0.54 + torsoShiftX, 0.72);
}

describe("BlindSemanticDecoder", () => {
    it("discovers blind lexemes from repeated similar segments", () => {
        const snapshotA = createBufferSnapshot({ frameCount: 18, motion: "dynamic" });
        const snapshotB = createBufferSnapshot({ frameCount: 18, motion: "dynamic" });
        const result = decodeBlindSemantics({
            segments: [
                {
                    id: "seg-01",
                    startMs: 0,
                    endMs: 1600,
                    frames: snapshotA.buffer,
                    encoded: createEncodedSequence({
                        handPoseVector: [0, 0, 0, 0, 0, 0, 0, 0, 0.26, 0.18, 0.24, 0.08],
                        handVelocityVector: [0.02, 0.19, 0.82, 0.88],
                        quality: {
                            motionEnergy: 0.82,
                            mouthStability: 0.12,
                        },
                    }),
                    primary: {
                        label: "repeated-tool-use-like",
                        confidence: 0.72,
                        reason: "fixture",
                        channels: ["motion"],
                        genericUnknown: false,
                    },
                    alternatives: [],
                    motifClusterId: "motif-01",
                },
                {
                    id: "seg-02",
                    startMs: 1700,
                    endMs: 3300,
                    frames: snapshotB.buffer,
                    encoded: createEncodedSequence({
                        handPoseVector: [0, 0, 0, 0, 0, 0, 0, 0, 0.24, 0.16, 0.22, 0.09],
                        handVelocityVector: [0.02, 0.2, 0.84, 0.9],
                        quality: {
                            motionEnergy: 0.84,
                            mouthStability: 0.1,
                        },
                    }),
                    primary: {
                        label: "repeated-tool-use-like",
                        confidence: 0.74,
                        reason: "fixture",
                        channels: ["motion"],
                        genericUnknown: false,
                    },
                    alternatives: [],
                    motifClusterId: "motif-01",
                },
            ],
        });

        expect(result.lexemes.length).toBeGreaterThan(0);
        expect(result.segments[0]?.lexemeIds[0]).toBe(result.segments[1]?.lexemeIds[0]);
        expect(result.summary.topLexemeChain).toContain("lexeme-");
    });

    it("splits segment into phases and sharpens tool-use into cut-like when release appears", () => {
        const snapshot = createBufferSnapshot({ frameCount: 24, motion: "dynamic" });
        const result = decodeBlindSemantics({
            segments: [
                {
                    id: "seg-01",
                    startMs: 0,
                    endMs: 2100,
                    frames: snapshot.buffer,
                    encoded: createEncodedSequence({
                        handPoseVector: [0, 0, 0, 0, 0, 0, 0, 0, 0.24, 0.18, 0.2, 0.08],
                        handVelocityVector: [0.03, 0.22, 0.86, 0.94],
                        quality: {
                            motionEnergy: 0.86,
                            mouthStability: 0.08,
                        },
                    }),
                    primary: {
                        label: "repeated-tool-use-like",
                        confidence: 0.7,
                        reason: "fixture",
                        channels: ["motion"],
                        genericUnknown: false,
                    },
                    alternatives: [],
                    motifClusterId: null,
                },
            ],
        });

        expect(result.segments[0]?.phases.length).toBeGreaterThan(1);
        expect(result.segments[0]?.primary.label).toBe("chop/cut-like");
        expect(result.segments[0]?.primary.label).not.toBe("object-fall-like");
        expect(result.segments[0]?.phases.some((phase) => phase.kind === "release/fall")).toBe(true);
    });

    it("sharpens ingest segment beyond broad drink-or-eat family", () => {
        const snapshot = createBufferSnapshot({ frameCount: 20, motion: "dynamic", mouthOpen: 0.03 });
        const result = decodeBlindSemantics({
            segments: [
                {
                    id: "seg-01",
                    startMs: 0,
                    endMs: 1800,
                    frames: snapshot.buffer,
                    encoded: createEncodedSequence({
                        handPoseVector: [0, 0, 0, 0, 0, 0, 0, 0, 0.22, 0.14, 0.18, 0.82],
                        handVelocityVector: [0.02, 0.08, 0.44, 0.34],
                        quality: {
                            motionEnergy: 0.44,
                            mouthStability: 0.78,
                        },
                    }),
                    primary: {
                        label: "drink-like",
                        confidence: 0.66,
                        reason: "fixture",
                        channels: ["mouthCue"],
                        genericUnknown: false,
                    },
                    alternatives: [],
                    motifClusterId: null,
                },
            ],
        });

        expect(["drink-like", "eat-like", "hold-round-object-like"]).toContain(
            result.segments[0]?.primary.label,
        );
        expect(result.segments[0]?.phases.length).toBeGreaterThan(0);
    });

    it("uses phase-level ingest evidence instead of falling back to travel-like", () => {
        const snapshot = createBufferSnapshot({ frameCount: 20, motion: "dynamic", mouthOpen: 0.03 });
        const result = decodeBlindSemantics({
            segments: [
                {
                    id: "seg-01",
                    startMs: 0,
                    endMs: 1800,
                    frames: snapshot.buffer,
                    encoded: createEncodedSequence({
                        handPoseVector: [0, 0, 0, 0, 0, 0, 0, 0, 0.64, 0.2, 0.18, 0.18],
                        handVelocityVector: [0.08, 0.04, 0.36, 0.24],
                        quality: {
                            motionEnergy: 0.38,
                            mouthStability: 0.74,
                        },
                    }),
                    primary: {
                        label: "drink-like",
                        confidence: 0.64,
                        reason: "fixture",
                        channels: ["mouthCue"],
                        genericUnknown: false,
                    },
                    alternatives: [],
                    motifClusterId: null,
                },
            ],
        });

        expect(["drink-like", "hold-round-object-like"]).toContain(result.segments[0]?.primary.label);
        expect(result.segments[0]?.primary.label).not.toBe("walk/continue-like");
    });

    it("prefers eat-like when repeated mouth approaches beat sustained sip hold", () => {
        const snapshot = createBufferSnapshot({ frameCount: 24, motion: "dynamic", mouthOpen: 0.035 });
        const result = decodeBlindSemantics({
            segments: [
                {
                    id: "seg-01",
                    startMs: 0,
                    endMs: 2100,
                    frames: snapshot.buffer,
                    encoded: createEncodedSequence({
                        handPoseVector: [0, 0, 0, 0, 0, 0, 0, 0, 0.66, 0.24, 0.18, 0.84],
                        handVelocityVector: [0.03, 0.12, 0.54, 0.42],
                        quality: {
                            motionEnergy: 0.58,
                            mouthStability: 0.76,
                        },
                    }),
                    primary: {
                        label: "drink-like",
                        confidence: 0.64,
                        reason: "fixture",
                        channels: ["mouthCue"],
                        genericUnknown: false,
                    },
                    alternatives: [],
                    motifClusterId: null,
                },
            ],
        });

        expect(result.segments[0]?.primary.label).toBe("eat-like");
        expect(result.segments[0]?.runnerUp?.label).toBe("drink-like");
    });

    it("refines weak contradictory travel segment to match stronger neighbors", () => {
        const travelSnapshot = createBufferSnapshot({ frameCount: 18, motion: "dynamic" });
        const weakSnapshot = createBufferSnapshot({ frameCount: 14, motion: "dynamic" });
        const result = decodeBlindSemantics({
            segments: [
                {
                    id: "seg-01",
                    startMs: 0,
                    endMs: 1500,
                    frames: travelSnapshot.buffer,
                    encoded: createEncodedSequence({
                        handPoseVector: [0, 0, 0, 0, 0, 0, 0, 0, 0.32, 0.12, 0.18, 0.14],
                        handVelocityVector: [0.14, 0.03, 0.32, 0.18],
                        quality: {
                            motionEnergy: 0.34,
                            mouthStability: 0.18,
                        },
                    }),
                    primary: {
                        label: "walk/continue-like",
                        confidence: 0.72,
                        reason: "fixture",
                        channels: ["motion"],
                        genericUnknown: false,
                    },
                    alternatives: [],
                    motifClusterId: null,
                },
                {
                    id: "seg-02",
                    startMs: 1600,
                    endMs: 2500,
                    frames: weakSnapshot.buffer,
                    encoded: createEncodedSequence({
                        handPoseVector: [0, 0, 0, 0, 0, 0, 0, 0, 0.34, 0.12, 0.18, 0.16],
                        handVelocityVector: [0.07, 0.02, 0.26, 0.16],
                        quality: {
                            motionEnergy: 0.28,
                            mouthStability: 0.16,
                        },
                    }),
                    primary: {
                        label: "person/setup-like",
                        confidence: 0.58,
                        reason: "fixture",
                        channels: ["placement"],
                        genericUnknown: false,
                    },
                    alternatives: [],
                    motifClusterId: null,
                },
                {
                    id: "seg-03",
                    startMs: 2600,
                    endMs: 4100,
                    frames: travelSnapshot.buffer,
                    encoded: createEncodedSequence({
                        handPoseVector: [0, 0, 0, 0, 0, 0, 0, 0, 0.32, 0.12, 0.18, 0.14],
                        handVelocityVector: [0.14, 0.03, 0.32, 0.18],
                        quality: {
                            motionEnergy: 0.34,
                            mouthStability: 0.18,
                        },
                    }),
                    primary: {
                        label: "walk/continue-like",
                        confidence: 0.72,
                        reason: "fixture",
                        channels: ["motion"],
                        genericUnknown: false,
                    },
                    alternatives: [],
                    motifClusterId: null,
                },
            ],
        });

        expect(result.segments[1]?.primary.label).toBe("walk/continue-like");
        expect(result.segments[1]?.refinedFromFamily).toBe("person/setup-like");
        expect(result.summary.refinementCount).toBeGreaterThan(0);
    });

    it("prefers phone-call-like over drink-like on sustained side-face hold", () => {
        const snapshot = createBufferSnapshot({ frameCount: 18, motion: "static", mouthOpen: 0.02 });
        snapshot.buffer.forEach((frame, index) => {
            setPoseFaceTargets(frame, { rightEar: { x: 0.67, y: 0.35 }, shoulderY: 0.44 });
            setHandAt(frame, 0.66 + index * 0.002, 0.36, 0.26, 0.14);
        });

        const result = decodeBlindSemantics({
            segments: [
                {
                    id: "seg-call",
                    startMs: 0,
                    endMs: 1500,
                    frames: snapshot.buffer,
                    encoded: createEncodedSequence({
                        handPoseVector: [0, 0, 0, 0, 0, 0, 0, 0, 0.22, 0.18, 0.16, 0.74],
                        handVelocityVector: [0.01, 0.01, 0.18, 0.1],
                        quality: {
                            motionEnergy: 0.18,
                            mouthStability: 0.72,
                        },
                    }),
                    primary: {
                        label: "drink-like",
                        confidence: 0.62,
                        reason: "fixture",
                        channels: ["mouthCue"],
                        genericUnknown: false,
                    },
                    alternatives: [],
                    motifClusterId: null,
                },
            ],
        });

        expect(result.segments[0]?.primary.label).toBe("phone/call-like");
        expect(result.segments[0]?.runnerUp?.label).not.toBe("drink-like");
    });

    it("prefers inspect-listen-like over person-setup-like on sustained attention hold", () => {
        const snapshot = createBufferSnapshot({ frameCount: 18, motion: "static", mouthOpen: 0.02 });
        snapshot.buffer.forEach((frame) => {
            setPoseFaceTargets(frame, { rightEar: { x: 0.64, y: 0.35 }, shoulderY: 0.43 });
            setHandAt(frame, 0.59, 0.35, 0.86, 0.62);
        });

        const result = decodeBlindSemantics({
            segments: [
                {
                    id: "seg-listen",
                    startMs: 0,
                    endMs: 1600,
                    frames: snapshot.buffer,
                    encoded: createEncodedSequence({
                        handPoseVector: [0, 0, 0, 0, 0, 0, 0, 0, 0.84, 0.66, 0.18, 0.62],
                        handVelocityVector: [0.01, 0.01, 0.1, 0.06],
                        quality: {
                            motionEnergy: 0.12,
                            mouthStability: 0.34,
                        },
                    }),
                    primary: {
                        label: "person/setup-like",
                        confidence: 0.6,
                        reason: "fixture",
                        channels: ["placement"],
                        genericUnknown: false,
                    },
                    alternatives: [],
                    motifClusterId: null,
                },
            ],
        });

        expect(result.segments[0]?.primary.label).toBe("inspect/listen-like");
    });

    it("prefers fingerspell-like over repeated-tool-use-like on compact shape bursts", () => {
        const snapshot = createBufferSnapshot({ frameCount: 20, motion: "static" });
        snapshot.buffer.forEach((frame, index) => {
            setPoseFaceTargets(frame, { shoulderY: 0.44 });
            setHandAt(
                frame,
                0.5 + Math.sin(index / 3) * 0.002,
                0.56 + Math.cos(index / 4) * 0.002,
                index % 2 === 0 ? 0.12 : 0.92,
                index % 3 === 0 ? 0.1 : 0.84,
            );
        });

        const result = decodeBlindSemantics({
            segments: [
                {
                    id: "seg-spell",
                    startMs: 0,
                    endMs: 1700,
                    frames: snapshot.buffer,
                    encoded: createEncodedSequence({
                        handPoseVector: [0, 0, 0, 0, 0, 0, 0, 0, 0.88, 0.82, 0.18, 0.18],
                        handVelocityVector: [0.01, 0.01, 0.18, 0.08],
                        quality: {
                            motionEnergy: 0.18,
                            mouthStability: 0.22,
                        },
                    }),
                    primary: {
                        label: "repeated-tool-use-like",
                        confidence: 0.48,
                        reason: "fixture",
                        channels: ["motion"],
                        genericUnknown: false,
                    },
                    alternatives: [
                        {
                            label: "fingerspell/emphatic-letter-sequence-like",
                            confidence: 0.62,
                            reason: "fixture alt",
                            channels: ["handshape", "timing"],
                            genericUnknown: false,
                        },
                    ],
                    motifClusterId: null,
                },
            ],
        });

        expect(result.segments[0]?.primary.label).toBe(
            "fingerspell/emphatic-letter-sequence-like",
        );
    });

    it("prefers fingerspell-like over chop-cut-like when compact bursts stay low-travel", () => {
        const snapshot = createBufferSnapshot({ frameCount: 20, motion: "static" });
        snapshot.buffer.forEach((frame, index) => {
            setPoseFaceTargets(frame, { shoulderY: 0.44 });
            setHandAt(
                frame,
                0.5 + Math.sin(index / 3) * 0.002,
                0.56 + Math.cos(index / 4) * 0.002,
                index % 2 === 0 ? 0.12 : 0.9,
                index % 3 === 0 ? 0.1 : 0.84,
            );
        });

        const result = decodeBlindSemantics({
            segments: [
                {
                    id: "seg-spell-vs-cut",
                    startMs: 0,
                    endMs: 1500,
                    frames: snapshot.buffer,
                    encoded: createEncodedSequence({
                        handPoseVector: [0, 0, 0, 0, 0, 0, 0, 0, 0.88, 0.82, 0.18, 0.18],
                        handVelocityVector: [0.01, 0.01, 0.18, 0.08],
                        quality: {
                            motionEnergy: 0.16,
                            mouthStability: 0.18,
                        },
                    }),
                    primary: {
                        label: "fingerspell/emphatic-letter-sequence-like",
                        confidence: 0.52,
                        reason: "fixture",
                        channels: ["handshape"],
                        genericUnknown: false,
                    },
                    alternatives: [
                        {
                            label: "chop/cut-like",
                            confidence: 0.54,
                            reason: "fixture alt",
                            channels: ["motion"],
                            genericUnknown: false,
                        },
                    ],
                    motifClusterId: null,
                },
            ],
        });

        expect(result.segments[0]?.primary.label).toBe(
            "fingerspell/emphatic-letter-sequence-like",
        );
    });

    it("keeps tool-use family over fingerspell when compact bursts sit inside repeated action loop", () => {
        const snapshot = createBufferSnapshot({ frameCount: 24, motion: "static" });
        snapshot.buffer.forEach((frame, index) => {
            const action = index >= 7 && index < 18;
            const release = index >= 18;
            setPoseFaceTargets(frame, { shoulderY: 0.44 });
            setHandAt(
                frame,
                0.5 + (action ? Math.sin(index * 1.6) * 0.02 : 0),
                release ? 0.66 : action ? 0.42 + Math.cos(index * 1.4) * 0.08 : 0.46,
                index % 2 === 0 ? 0.14 : 0.9,
                index % 3 === 0 ? 0.12 : 0.82,
            );
        });

        const result = decodeBlindSemantics({
            segments: [
                {
                    id: "seg-tool-bursts",
                    startMs: 0,
                    endMs: 2100,
                    frames: snapshot.buffer,
                    encoded: createEncodedSequence({
                        handPoseVector: [0, 0, 0, 0, 0, 0, 0, 0, 0.86, 0.8, 0.22, 0.18],
                        handVelocityVector: [0.02, 0.18, 0.72, 0.82],
                        quality: {
                            motionEnergy: 0.74,
                            mouthStability: 0.18,
                        },
                    }),
                    primary: {
                        label: "repeated-tool-use-like",
                        confidence: 0.58,
                        reason: "fixture",
                        channels: ["motion"],
                        genericUnknown: false,
                    },
                    alternatives: [
                        {
                            label: "fingerspell/emphatic-letter-sequence-like",
                            confidence: 0.62,
                            reason: "fixture alt",
                            channels: ["handshape", "timing"],
                            genericUnknown: false,
                        },
                    ],
                    motifClusterId: null,
                },
            ],
        });

        expect(["repeated-tool-use-like", "chop/cut-like"]).toContain(
            result.segments[0]?.primary.label,
        );
        expect(result.segments[0]?.primary.label).not.toBe(
            "fingerspell/emphatic-letter-sequence-like",
        );
    });

    it("pulls rebound-heavy release case away from plain object-fall-like", () => {
        const snapshot = createBufferSnapshot({ frameCount: 24, motion: "static" });
        snapshot.buffer.forEach((frame, index) => {
            const mid = index >= 10 && index < 13;
            const release = index >= 13 && index < 16;
            const late = index >= 16;
            setPoseFaceTargets(frame, {
                shoulderY: late ? 0.34 + Math.sin(index) * 0.03 : 0.44,
                torsoShiftX: late ? 0.08 : 0,
            });
            setHandAt(
                frame,
                late ? 0.64 + Math.sin(index) * 0.04 : release ? 0.56 : mid ? 0.5 : 0.48,
                late ? 0.58 : release ? 0.62 : mid ? 0.48 : 0.42,
                0.28,
                0.18,
            );
        });

        const result = decodeBlindSemantics({
            segments: [
                {
                    id: "seg-fall",
                    startMs: 0,
                    endMs: 2200,
                    frames: snapshot.buffer,
                    encoded: createEncodedSequence({
                        handPoseVector: [0, 0, 0, 0, 0, 0, 0, 0, 0.24, 0.18, 0.18, 0.18],
                        handVelocityVector: [0.02, 0.14, 0.3, 0.34],
                        quality: {
                            motionEnergy: 0.58,
                            mouthStability: 0.12,
                        },
                    }),
                    primary: {
                        label: "object-fall-like",
                        confidence: 0.62,
                        reason: "fixture",
                        channels: ["motion"],
                        genericUnknown: false,
                    },
                    alternatives: [
                        {
                            label: "big-fall-like",
                            confidence: 0.66,
                            reason: "fixture alt",
                            channels: ["pose", "timing"],
                            genericUnknown: false,
                        },
                    ],
                    motifClusterId: null,
                },
            ],
        });

        expect(result.segments[0]?.primary.label).not.toBe("object-fall-like");
        expect(result.segments[0]?.bodyReactionStats.reactionAftermathScore).toBeGreaterThan(0);
    });

    it("prefers big-fall-like over fingerspell fallback when release, aftermath, and rebound dominate", () => {
        const snapshot = createBufferSnapshot({ frameCount: 24, motion: "static" });
        snapshot.buffer.forEach((frame, index) => {
            const compact = index >= 5 && index < 10;
            const release = index >= 10 && index < 14;
            const rebound = index >= 14;
            setPoseFaceTargets(frame, {
                shoulderY: rebound ? 0.35 + Math.sin(index) * 0.03 : 0.44,
                torsoShiftX: rebound ? 0.08 : 0,
            });
            setHandAt(
                frame,
                rebound ? 0.64 + Math.sin(index) * 0.04 : compact ? 0.5 + Math.sin(index) * 0.006 : 0.48,
                rebound ? 0.6 : release ? 0.68 : compact ? 0.46 + Math.cos(index) * 0.01 : 0.44,
                index % 2 === 0 ? 0.14 : 0.88,
                index % 3 === 0 ? 0.12 : 0.8,
            );
        });

        const result = decodeBlindSemantics({
            segments: [
                {
                    id: "seg-big-fall-vs-spell",
                    startMs: 0,
                    endMs: 2200,
                    frames: snapshot.buffer,
                    encoded: createEncodedSequence({
                        handPoseVector: [0, 0, 0, 0, 0, 0, 0, 0, 0.88, 0.82, 0.2, 0.18],
                        handVelocityVector: [0.02, 0.12, 0.44, 0.54],
                        quality: {
                            motionEnergy: 0.54,
                            mouthStability: 0.14,
                        },
                    }),
                    primary: {
                        label: "big-fall-like",
                        confidence: 0.58,
                        reason: "fixture",
                        channels: ["pose"],
                        genericUnknown: false,
                    },
                    alternatives: [
                        {
                            label: "fingerspell/emphatic-letter-sequence-like",
                            confidence: 0.62,
                            reason: "fixture alt",
                            channels: ["handshape", "timing"],
                            genericUnknown: false,
                        },
                    ],
                    motifClusterId: null,
                },
            ],
        });

        expect(result.segments[0]?.primary.label).toBe("big-fall-like");
        expect(result.segments[0]?.bodyReactionStats.reactionAftermathScore).toBeGreaterThan(0.2);
    });

    it("prefers approval-celebration-like when final lifted pose and bounce dominate", () => {
        const snapshot = createBufferSnapshot({ frameCount: 20, motion: "dynamic" });
        snapshot.buffer.forEach((frame, index) => {
            const late = index >= 14;
            setPoseFaceTargets(frame, { shoulderY: late ? 0.39 : 0.44 });
            setHandAt(
                frame,
                late ? 0.52 : 0.48,
                late ? 0.2 + Math.sin(index) * 0.01 : 0.42,
                0.84,
                0.72,
            );
        });

        const result = decodeBlindSemantics({
            segments: [
                {
                    id: "seg-approve",
                    startMs: 0,
                    endMs: 1800,
                    frames: snapshot.buffer,
                    encoded: createEncodedSequence({
                        handPoseVector: [0, 0, 0, 0, 0, 0, 0, 0, 0.82, 0.74, 0.72, 0.36],
                        handVelocityVector: [0.03, 0.08, 0.36, 0.24],
                        quality: {
                            motionEnergy: 0.36,
                            mouthStability: 0.24,
                        },
                    }),
                    primary: {
                        label: "person/setup-like",
                        confidence: 0.56,
                        reason: "fixture",
                        channels: ["placement"],
                        genericUnknown: false,
                    },
                    alternatives: [],
                    motifClusterId: null,
                },
            ],
        });

        expect(result.segments[0]?.primary.label).toBe("approval/celebration-like");
    });

    it("prefers approval-celebration-like over big-fall-like when uplift settles into stable end hold", () => {
        const snapshot = createBufferSnapshot({ frameCount: 24, motion: "dynamic" });
        snapshot.buffer.forEach((frame, index) => {
            const uplift = index >= 12;
            const settle = index >= 18;
            setPoseFaceTargets(frame, { shoulderY: uplift ? 0.39 : 0.44 });
            setHandAt(
                frame,
                settle ? 0.54 : uplift ? 0.52 + Math.sin(index) * 0.008 : 0.48,
                settle ? 0.22 : uplift ? 0.24 + Math.sin(index) * 0.012 : 0.42,
                0.84,
                0.72,
            );
        });

        const result = decodeBlindSemantics({
            segments: [
                {
                    id: "seg-approve-vs-fall",
                    startMs: 0,
                    endMs: 2100,
                    frames: snapshot.buffer,
                    encoded: createEncodedSequence({
                        handPoseVector: [0, 0, 0, 0, 0, 0, 0, 0, 0.82, 0.74, 0.72, 0.28],
                        handVelocityVector: [0.02, 0.06, 0.28, 0.22],
                        quality: {
                            motionEnergy: 0.3,
                            mouthStability: 0.24,
                        },
                    }),
                    primary: {
                        label: "big-fall-like",
                        confidence: 0.54,
                        reason: "fixture",
                        channels: ["pose"],
                        genericUnknown: false,
                    },
                    alternatives: [],
                    motifClusterId: null,
                },
            ],
        });

        expect(result.segments[0]?.primary.label).toBe("approval/celebration-like");
    });

    it("round-3: demotes chop/cut-like to repeated-tool-use-like when compact loop lacks narrow directional regularity", () => {
        const snapshot = createBufferSnapshot({ frameCount: 24, motion: "static" });
        snapshot.buffer.forEach((frame, index) => {
            const action = index >= 6 && index < 20;
            setPoseFaceTargets(frame, { shoulderY: 0.44 });
            // Broad, irregular loop: large horizontal drift, varying amplitude, frequent
            // compact handshape changes mixed in. No strong vertical chopping.
            setHandAt(
                frame,
                0.5 + (action ? Math.sin(index * 0.9) * 0.05 + (index % 4) * 0.008 : 0),
                0.5 + (action ? Math.cos(index * 0.8) * 0.02 : 0),
                index % 2 === 0 ? 0.18 : 0.86,
                index % 3 === 0 ? 0.14 : 0.78,
            );
        });

        const result = decodeBlindSemantics({
            segments: [
                {
                    id: "seg-broad-loop",
                    startMs: 0,
                    endMs: 2100,
                    frames: snapshot.buffer,
                    encoded: createEncodedSequence({
                        handPoseVector: [0, 0, 0, 0, 0, 0, 0, 0, 0.86, 0.78, 0.22, 0.18],
                        // Low vertical bias (verticalBias = 0.42) so chop should not dominate.
                        handVelocityVector: [0.18, 0.06, 0.62, 0.42],
                        quality: {
                            motionEnergy: 0.66,
                            mouthStability: 0.18,
                        },
                    }),
                    primary: {
                        label: "chop/cut-like",
                        confidence: 0.56,
                        reason: "fixture",
                        channels: ["motion"],
                        genericUnknown: false,
                    },
                    alternatives: [
                        {
                            label: "repeated-tool-use-like",
                            confidence: 0.55,
                            reason: "fixture alt",
                            channels: ["motion", "timing"],
                            genericUnknown: false,
                        },
                    ],
                    motifClusterId: null,
                },
            ],
        });

        // Either the new rerank rule promotes repeated-tool-use, or the broader
        // tool family is preferred via the existing cut-vs-broad mediation.
        // The key invariant: chop/cut-like should not be primary for a loop with
        // low vertical bias, irregular amplitude, and embedded compact bursts.
        expect(result.segments[0]?.primary.label).not.toBe("chop/cut-like");
        expect([
            "repeated-tool-use-like",
            "fingerspell/emphatic-letter-sequence-like",
        ]).toContain(result.segments[0]?.primary.label);
    });

    it("round-3: prefers phone/call-like over approval/celebration-like on sustained side-face hold without uplift", () => {
        const snapshot = createBufferSnapshot({ frameCount: 20, motion: "static", mouthOpen: 0.02 });
        snapshot.buffer.forEach((frame, index) => {
            // One-hand only side-face hold, no uplift, no end-state celebration.
            frame.hands = frame.hands.slice(0, 1);
            setPoseFaceTargets(frame, { rightEar: { x: 0.67, y: 0.35 }, shoulderY: 0.44 });
            setHandAt(frame, 0.66 + index * 0.0015, 0.36, 0.26, 0.16);
        });

        const result = decodeBlindSemantics({
            segments: [
                {
                    id: "seg-phone-vs-approval",
                    startMs: 0,
                    endMs: 1700,
                    frames: snapshot.buffer,
                    encoded: createEncodedSequence({
                        handPoseVector: [0, 0, 0, 0, 0, 0, 0, 0, 0.22, 0.18, 0.16, 0.74],
                        handVelocityVector: [0.01, 0.01, 0.16, 0.1],
                        quality: {
                            motionEnergy: 0.16,
                            mouthStability: 0.72,
                        },
                    }),
                    primary: {
                        label: "approval/celebration-like",
                        confidence: 0.54,
                        reason: "fixture",
                        channels: ["pose"],
                        genericUnknown: false,
                    },
                    alternatives: [
                        {
                            label: "phone/call-like",
                            confidence: 0.6,
                            reason: "fixture alt",
                            channels: ["placement", "timing"],
                            genericUnknown: false,
                        },
                    ],
                    motifClusterId: null,
                },
            ],
        });

        expect(result.segments[0]?.primary.label).toBe("phone/call-like");
    });

    it("round-3: demotes big-fall-like to fingerspell when compact bursts dominate without release/aftermath", () => {
        const snapshot = createBufferSnapshot({ frameCount: 22, motion: "static" });
        snapshot.buffer.forEach((frame, index) => {
            setPoseFaceTargets(frame, { shoulderY: 0.44 });
            setHandAt(
                frame,
                0.5 + Math.sin(index / 3) * 0.002,
                0.54 + Math.cos(index / 4) * 0.002,
                index % 2 === 0 ? 0.12 : 0.92,
                index % 3 === 0 ? 0.1 : 0.84,
            );
        });

        const result = decodeBlindSemantics({
            segments: [
                {
                    id: "seg-spell-vs-fall",
                    startMs: 0,
                    endMs: 1900,
                    frames: snapshot.buffer,
                    encoded: createEncodedSequence({
                        handPoseVector: [0, 0, 0, 0, 0, 0, 0, 0, 0.88, 0.82, 0.18, 0.18],
                        handVelocityVector: [0.01, 0.01, 0.18, 0.08],
                        quality: {
                            motionEnergy: 0.18,
                            mouthStability: 0.22,
                        },
                    }),
                    primary: {
                        label: "big-fall-like",
                        confidence: 0.66,
                        reason: "fixture",
                        channels: ["pose"],
                        genericUnknown: false,
                    },
                    alternatives: [
                        {
                            label: "fingerspell/emphatic-letter-sequence-like",
                            confidence: 0.62,
                            reason: "fixture alt",
                            channels: ["handshape", "timing"],
                            genericUnknown: false,
                        },
                    ],
                    motifClusterId: null,
                },
            ],
        });

        // Either fingerspell becomes primary (preferred), or at minimum big-fall is
        // not retained when there is no release tail and no rebound aftermath.
        expect(result.segments[0]?.primary.label).not.toBe("big-fall-like");
    });

    it("round-4: undoes chop -> big-fall flip when release/aftermath are weak and repeated-tool loop is plausible", () => {
        const snapshot = createBufferSnapshot({ frameCount: 26, motion: "dynamic" });
        snapshot.buffer.forEach((frame, index) => {
            setPoseFaceTargets(frame, { shoulderY: 0.46 });
            // Broad horizontal-leaning loop (low directional consistency)
            setHandAt(
                frame,
                0.5 + Math.sin(index / 2) * 0.06,
                0.5 + Math.cos(index / 4) * 0.012,
                index % 2 === 0 ? 0.18 : 0.74,
                index % 3 === 0 ? 0.16 : 0.72,
            );
        });

        const result = decodeBlindSemantics({
            segments: [
                {
                    id: "seg-r4-bigfall-vs-tooluse",
                    startMs: 0,
                    endMs: 2300,
                    frames: snapshot.buffer,
                    encoded: createEncodedSequence({
                        handPoseVector: [0, 0, 0, 0, 0, 0, 0, 0, 0.34, 0.32, 0.3, 0.18],
                        handVelocityVector: [0.06, 0.18, 0.24, 0.12],
                        quality: {
                            motionEnergy: 0.6,
                            mouthStability: 0.4,
                        },
                    }),
                    primary: {
                        label: "big-fall-like",
                        confidence: 0.6,
                        reason: "fixture",
                        channels: ["pose", "timing"],
                        genericUnknown: false,
                    },
                    alternatives: [
                        {
                            label: "chop/cut-like",
                            confidence: 0.6,
                            reason: "fixture alt",
                            channels: ["motion"],
                            genericUnknown: false,
                        },
                    ],
                    motifClusterId: null,
                },
            ],
        });

        // big-fall must not be retained when chop runner-up is tied without
        // strong release / rebound aftermath.
        expect(result.segments[0]?.primary.label).not.toBe("big-fall-like");
    });

    it("round-4: keeps chop/cut-like and widens margin against fingerspell when narrow vertical strokes are consistent", () => {
        const snapshot = createBufferSnapshot({ frameCount: 24, motion: "dynamic" });
        snapshot.buffer.forEach((frame, index) => {
            setPoseFaceTargets(frame, { shoulderY: 0.46 });
            // Narrow vertical chop pattern: tight vertical oscillation, near-zero horizontal travel.
            setHandAt(
                frame,
                0.5 + Math.sin(index / 6) * 0.004,
                0.46 + Math.sin(index / 2) * 0.05,
                index % 2 === 0 ? 0.18 : 0.7,
                index % 3 === 0 ? 0.18 : 0.6,
            );
        });

        const result = decodeBlindSemantics({
            segments: [
                {
                    id: "seg-r4-chop-sharpen",
                    startMs: 0,
                    endMs: 2200,
                    frames: snapshot.buffer,
                    encoded: createEncodedSequence({
                        handPoseVector: [0, 0, 0, 0, 0, 0, 0, 0, 0.18, 0.16, 0.16, 0.12],
                        handVelocityVector: [0.02, 0.6, 0.14, 0.06],
                        quality: {
                            motionEnergy: 0.7,
                            mouthStability: 0.4,
                        },
                    }),
                    primary: {
                        label: "chop/cut-like",
                        confidence: 0.62,
                        reason: "fixture",
                        channels: ["motion", "timing"],
                        genericUnknown: false,
                    },
                    alternatives: [
                        {
                            label: "fingerspell/emphatic-letter-sequence-like",
                            confidence: 0.55,
                            reason: "fixture alt",
                            channels: ["handshape"],
                            genericUnknown: false,
                        },
                    ],
                    motifClusterId: null,
                },
            ],
        });

        // chop/cut-like must remain primary; the rule must not flip to fingerspell.
        expect(result.segments[0]?.primary.label).toBe("chop/cut-like");
    });

    it("round-4: keeps big-fall-like over fingerspell when release plus rebound aftermath dominate", () => {
        const snapshot = createBufferSnapshot({ frameCount: 26, motion: "dynamic" });
        snapshot.buffer.forEach((frame, index) => {
            // Strong torso/shoulder rebound late in the clip
            const reboundY = index < 18 ? 0.46 : 0.46 + (index - 18) * 0.012;
            setPoseFaceTargets(frame, { shoulderY: reboundY });
            setHandAt(
                frame,
                0.5 + (index < 18 ? 0 : (index - 18) * 0.012),
                0.46 + Math.sin(index / 4) * 0.05,
                index % 2 === 0 ? 0.18 : 0.6,
                index % 3 === 0 ? 0.16 : 0.5,
            );
        });

        const result = decodeBlindSemantics({
            segments: [
                {
                    id: "seg-r4-bigfall-sharpen",
                    startMs: 0,
                    endMs: 2400,
                    frames: snapshot.buffer,
                    encoded: createEncodedSequence({
                        handPoseVector: [0, 0, 0, 0, 0, 0, 0, 0, 0.32, 0.28, 0.24, 0.2],
                        handVelocityVector: [0.18, 0.22, 0.6, 0.4],
                        quality: {
                            motionEnergy: 0.74,
                            mouthStability: 0.3,
                        },
                    }),
                    primary: {
                        label: "big-fall-like",
                        confidence: 0.66,
                        reason: "fixture",
                        channels: ["pose", "timing"],
                        genericUnknown: false,
                    },
                    alternatives: [
                        {
                            label: "fingerspell/emphatic-letter-sequence-like",
                            confidence: 0.6,
                            reason: "fixture alt",
                            channels: ["handshape"],
                            genericUnknown: false,
                        },
                    ],
                    motifClusterId: null,
                },
            ],
        });

        // Round-4 rule C must not over-demote big-fall to fingerspell here:
        // release + aftermath are high, so fingerspell should never beat big-fall.
        expect(result.segments[0]?.primary.label).not.toBe(
            "fingerspell/emphatic-letter-sequence-like",
        );
    });

    it("round-5: keeps chop/cut-like primary and widens margin against repeated-tool when strokes are narrow and body reaction is small", () => {
        // Mirrors real `sample 2.mp4` seg-02 / seg-03 stats:
        // narrow vertical chop loop, low torso/shoulder, high compact-burst.
        const snapshot = createBufferSnapshot({ frameCount: 24, motion: "dynamic" });
        snapshot.buffer.forEach((frame, index) => {
            setPoseFaceTargets(frame, { shoulderY: 0.46 });
            setHandAt(
                frame,
                0.5 + Math.sin(index / 6) * 0.004,
                0.46 + Math.sin(index / 2) * 0.05,
                index % 2 === 0 ? 0.18 : 0.7,
                index % 3 === 0 ? 0.18 : 0.6,
            );
        });

        const result = decodeBlindSemantics({
            segments: [
                {
                    id: "seg-r5-chop-vs-tooluse",
                    startMs: 0,
                    endMs: 2400,
                    frames: snapshot.buffer,
                    encoded: createEncodedSequence({
                        handPoseVector: [0, 0, 0, 0, 0, 0, 0, 0, 0.18, 0.16, 0.16, 0.12],
                        handVelocityVector: [0.02, 0.6, 0.14, 0.06],
                        quality: {
                            motionEnergy: 0.7,
                            mouthStability: 0.4,
                        },
                    }),
                    primary: {
                        label: "chop/cut-like",
                        confidence: 0.62,
                        reason: "fixture",
                        channels: ["motion", "timing"],
                        genericUnknown: false,
                    },
                    alternatives: [
                        {
                            label: "repeated-tool-use-like",
                            confidence: 0.61,
                            reason: "fixture alt",
                            channels: ["motion", "timing"],
                            genericUnknown: false,
                        },
                    ],
                    motifClusterId: null,
                },
            ],
        });

        // chop/cut-like must remain primary; the rule must not flip to repeated-tool.
        expect(result.segments[0]?.primary.label).toBe("chop/cut-like");
    });
});
