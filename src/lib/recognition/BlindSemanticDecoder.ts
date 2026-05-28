import { clamp01, euclideanDistance, mean } from "@/lib/features/normalize";
import type { LandmarkFrame } from "@/lib/landmarks/types";
import type {
    BlindEventFamilyHypothesis,
    BlindEventFamilyLabel,
    BlindMotifCluster,
} from "@/lib/recognition/EventFamilyInference";
import type { EncodedSequence } from "@/lib/recognition/types";

export type BlindPhaseKind =
    | "setup"
    | "approach"
    | "repeated-action-loop"
    | "release/fall"
    | "hold"
    | "return/continue";

export type BlindPhaseRole =
    | "setup"
    | "action-loop"
    | "peak-action"
    | "release"
    | "hold"
    | "recovery/continue";

export interface BlindConfidenceBreakdown {
    motion: number;
    handshape: number;
    placement: number;
    pose: number;
    mouthFace: number;
}

export interface BlindHandshapeChangeStats {
    volatility: number;
    changeCount: number;
    compactBurstScore: number;
}

export interface BlindBodyReactionStats {
    torsoDisplacement: number;
    shoulderLift: number;
    headBounce: number;
    armSpreadChange: number;
    reactionAftermathScore: number;
}

export interface BlindSegmentPhase {
    id: string;
    kind: BlindPhaseKind;
    role: BlindPhaseRole;
    startMs: number;
    endMs: number;
    strokeCount: number;
    confidence: number;
    dominantEventFamily: BlindEventFamilyLabel;
    lexemeId: string | null;
    dominantChannels: string[];
    confidenceBreakdown: BlindConfidenceBreakdown;
}

export interface BlindDiscoveredLexeme {
    id: string;
    centroid: number[];
    count: number;
    averageConfidence: number;
    dominantEventFamily: BlindEventFamilyLabel;
    exampleSegmentIds: string[];
}

export interface BlindLexemeMemory {
    id: string;
    createdAt: string;
    updatedAt: string;
    lexemes: BlindDiscoveredLexeme[];
    clipNames: string[];
    privacy: {
        landmarkOnly: true;
        rawVideoStored: false;
        pixelDataStored: false;
    };
}

export interface BlindTransitionPoint {
    segmentId: string;
    timeMs: number;
    fromPhase: BlindPhaseKind;
    toPhase: BlindPhaseKind;
}

export interface BlindSemanticSegment {
    id: string;
    primary: BlindEventFamilyHypothesis;
    runnerUp: BlindEventFamilyHypothesis | null;
    alternatives: BlindEventFamilyHypothesis[];
    motifClusterId: string | null;
    phases: BlindSegmentPhase[];
    lexemeIds: string[];
    repeatedCycleCount: number;
    confidenceBreakdown: BlindConfidenceBreakdown;
    handshapeChangeStats: BlindHandshapeChangeStats;
    bodyReactionStats: BlindBodyReactionStats;
    phaseFamilyVotes: Array<{
        label: BlindEventFamilyLabel;
        score: number;
    }>;
    motifTags: string[];
    confidenceMargin: number;
    localTransitionSupport: number;
    refinedFromFamily: BlindEventFamilyLabel | null;
    refinementReason: string | null;
}

export interface BlindSemanticSummary {
    topEventChain: string;
    alternateEventChains: string[];
    repeatedMotifs: BlindMotifCluster[];
    topLexemeChain: string;
    alternateLexemeChains: string[];
    repeatedActionCycles: number;
    likelyTransitionPoints: BlindTransitionPoint[];
    motifTags: string[];
    genericUnknownRatio: number;
    resolvedEventFamilyRatio: number;
    specificEventFamilyCount: number;
    unresolvedSegmentsCount: number;
    refinementCount: number;
    averageConfidenceByEventFamily: Array<{
        label: BlindEventFamilyLabel;
        averageConfidence: number;
    }>;
}

export interface BlindSemanticDecoderInput {
    segments: Array<{
        id: string;
        startMs: number;
        endMs: number;
        frames: LandmarkFrame[];
        encoded: EncodedSequence;
        primary: BlindEventFamilyHypothesis;
        alternatives: BlindEventFamilyHypothesis[];
        motifClusterId: string | null;
    }>;
    savedLexemeMemories?: BlindLexemeMemory[];
}

export interface BlindSemanticDecoderResult {
    segments: BlindSemanticSegment[];
    lexemes: BlindDiscoveredLexeme[];
    summary: BlindSemanticSummary;
}

interface FamilyScoreDetail {
    score: number;
    reason: string;
    channels: Set<string>;
    genericUnknown: boolean;
}

interface PhaseStats {
    totalDurationMs: number;
    setupRatio: number;
    actionRatio: number;
    releaseRatio: number;
    holdRatio: number;
    recoveryRatio: number;
    repeatedStrokeCount: number;
    actionToReleaseRatio: number;
    releaseTailRatio: number;
    mouthApproachCount: number;
    mouthHoldRatio: number;
    holdRoundSupport: number;
    setupStillScore: number;
    carrySupport: number;
    travelSupport: number;
    ingestSupport: number;
    sideFaceHoldRatio: number;
    sideFaceDominance: number;
    sustainedAttentionScore: number;
    bilateralAsymmetry: number;
    handshapeVolatility: number;
    handshapeChangeCount: number;
    compactShapeBurstScore: number;
    torsoDisplacement: number;
    shoulderLift: number;
    headBounce: number;
    armSpreadChange: number;
    reactionAftermathScore: number;
    finalPoseLift: number;
    directionalStrokeConsistency: number;
    strokeAmplitudeConsistency: number;
    actionLoopRegularity: number;
    endStateStabilization: number;
    contradictionScore: number;
    nearFace: number;
    openHand: number;
    fingerSpread: number;
    mouthStable: number;
    faceCue: number;
    visible: number;
    motionEnergy: number;
    horizontalTravel: number;
    verticalTravel: number;
    verticalBias: number;
    closedHand: number;
}

interface BlindScoringState {
    id: string;
    motifClusterId: string | null;
    phases: BlindSegmentPhase[];
    lexemeIds: string[];
    repeatedCycleCount: number;
    confidenceBreakdown: BlindConfidenceBreakdown;
    handshapeChangeStats: BlindHandshapeChangeStats;
    bodyReactionStats: BlindBodyReactionStats;
    phaseFamilyVotes: Array<{
        label: BlindEventFamilyLabel;
        score: number;
    }>;
    motifTags: string[];
    stats: PhaseStats;
    scoreMap: Map<BlindEventFamilyLabel, FamilyScoreDetail>;
    primary: BlindEventFamilyHypothesis;
    runnerUp: BlindEventFamilyHypothesis | null;
    alternatives: BlindEventFamilyHypothesis[];
    confidenceMargin: number;
    localTransitionSupport: number;
    refinedFromFamily: BlindEventFamilyLabel | null;
    refinementReason: string | null;
}

function round(value: number) {
    return Number(value.toFixed(4));
}

function compactChain(parts: string[]) {
    const compacted: string[] = [];

    for (const part of parts) {
        const last = compacted.at(-1);

        if (last === part) {
            compacted[compacted.length - 1] = `${part} x2`;
            continue;
        }

        if (last?.startsWith(`${part} x`)) {
            const count = Number.parseInt(last.split(" x")[1] ?? "1", 10);
            compacted[compacted.length - 1] = `${part} x${count + 1}`;
            continue;
        }

        compacted.push(part);
    }

    return compacted.join(" -> ");
}

function familyGroup(label: BlindEventFamilyLabel) {
    if (
        label.includes("tool") ||
        label.includes("cut") ||
        label.includes("fall") ||
        label.includes("throw-away")
    ) {
        return "tool";
    }

    if (label.includes("phone") || label.includes("listen") || label.includes("confusion")) {
        return "attention";
    }

    if (
        label.includes("eat") ||
        label.includes("drink") ||
        label.includes("round-object") ||
        label.includes("container")
    ) {
        return "ingest";
    }

    if (label.includes("fingerspell")) {
        return "signal";
    }

    if (label.includes("carry") || label.includes("walk") || label.includes("travel")) {
        return "travel";
    }

    if (label.includes("intro") || label.includes("setup")) {
        return "intro";
    }

    if (label.includes("approval") || label.includes("celebration")) {
        return "celebration";
    }

    if (label.includes("sit") || label.includes("pause")) {
        return "pause";
    }

    return "other";
}

function wrist(frame: LandmarkFrame) {
    return frame.hands[0]?.landmarks[0] ?? null;
}

function mouthCenter(frame: LandmarkFrame) {
    const topLip = frame.mouth[0];
    const bottomLip = frame.mouth[1];

    if (!topLip || !bottomLip) {
        return null;
    }

    return {
        x: (topLip.x + bottomLip.x) / 2,
        y: (topLip.y + bottomLip.y) / 2,
        z: (topLip.z + bottomLip.z) / 2,
    };
}

function posePoint(frame: LandmarkFrame, index: number) {
    return frame.pose?.landmarks[index] ?? null;
}

function shoulderCenter(frame: LandmarkFrame) {
    const left = posePoint(frame, 11);
    const right = posePoint(frame, 12);

    if (!left || !right) {
        return null;
    }

    return {
        x: (left.x + right.x) / 2,
        y: (left.y + right.y) / 2,
        z: (left.z + right.z) / 2,
    };
}

function hipCenter(frame: LandmarkFrame) {
    const left = posePoint(frame, 23);
    const right = posePoint(frame, 24);

    if (!left || !right) {
        return null;
    }

    return {
        x: (left.x + right.x) / 2,
        y: (left.y + right.y) / 2,
        z: (left.z + right.z) / 2,
    };
}

function headCenter(frame: LandmarkFrame) {
    const poseHead = posePoint(frame, 0);

    if (poseHead) {
        return poseHead;
    }

    return frame.face?.landmarks[1] ?? mouthCenter(frame);
}

function sideFaceTargets(frame: LandmarkFrame) {
    const leftEar = posePoint(frame, 7) ?? frame.face?.landmarks[234] ?? null;
    const rightEar = posePoint(frame, 8) ?? frame.face?.landmarks[454] ?? null;
    const mouth = mouthCenter(frame);

    return {
        left:
            leftEar ??
            (mouth
                ? { x: mouth.x - 0.08, y: mouth.y - 0.04, z: mouth.z }
                : null),
        right:
            rightEar ??
            (mouth
                ? { x: mouth.x + 0.08, y: mouth.y - 0.04, z: mouth.z }
                : null),
        mouth,
    };
}

function handOpenValue(frame: LandmarkFrame) {
    const hand = frame.hands[0];

    if (!hand?.landmarks.length) {
        return 0;
    }

    const wristPoint = hand.landmarks[0]!;
    const indexTip = hand.landmarks[8]!;
    const pinkyTip = hand.landmarks[20]!;

    return clamp01(
        (Math.hypot(indexTip.x - wristPoint.x, indexTip.y - wristPoint.y) +
            Math.hypot(pinkyTip.x - wristPoint.x, pinkyTip.y - wristPoint.y)) /
        0.22,
    );
}

function fingerSpreadValue(frame: LandmarkFrame) {
    const hand = frame.hands[0];

    if (!hand?.landmarks.length) {
        return 0;
    }

    const indexTip = hand.landmarks[8]!;
    const pinkyTip = hand.landmarks[20]!;

    return clamp01(Math.hypot(indexTip.x - pinkyTip.x, indexTip.y - pinkyTip.y) / 0.18);
}

function handshapeSignal(frame: LandmarkFrame) {
    return {
        open: handOpenValue(frame),
        spread: fingerSpreadValue(frame),
    };
}

function sideFaceHoldValue(frame: LandmarkFrame) {
    const hand = frame.hands[0];

    if (!hand?.landmarks.length) {
        return 0;
    }

    const wristPoint = hand.landmarks[0]!;
    const { left, right, mouth } = sideFaceTargets(frame);
    const targets = [left, right].filter(Boolean);

    if (!targets.length) {
        return 0;
    }

    const best = targets.reduce((max, target) => {
        const dx = Math.abs(wristPoint.x - target!.x);
        const dy = Math.abs(wristPoint.y - target!.y);
        const distance = Math.hypot(dx, dy);
        const sideBias = dx >= 0.03 ? 1 : 0;
        const mouthPenalty =
            mouth && Math.hypot(wristPoint.x - mouth.x, wristPoint.y - mouth.y) <= 0.1 ? 0.12 : 0;

        return Math.max(max, clamp01((1 - distance / 0.18) * 0.88 + sideBias * 0.24 - mouthPenalty));
    }, 0);

    return clamp01(best);
}

function oneHandAsymmetry(frames: LandmarkFrame[]) {
    const oneHandFrames = frames.filter((frame) => frame.hands.length === 1).length;
    return clamp01(oneHandFrames / Math.max(frames.length, 1));
}

function bodyReactionStats(frames: LandmarkFrame[], releaseStartMs: number | null): BlindBodyReactionStats {
    const torsoCenters = frames.map((frame) => shoulderCenter(frame)).filter(Boolean);
    const hipCenters = frames.map((frame) => hipCenter(frame)).filter(Boolean);
    const headCenters = frames.map((frame) => headCenter(frame)).filter(Boolean);
    const shoulderY = frames
        .map((frame) => {
            const left = posePoint(frame, 11);
            const right = posePoint(frame, 12);
            return left && right ? (left.y + right.y) / 2 : null;
        })
        .filter((value): value is number => value !== null);
    const wristToTorso = frames
        .map((frame) => {
            const wristPoint = wrist(frame);
            const torso = shoulderCenter(frame);
            return wristPoint && torso
                ? Math.hypot(wristPoint.x - torso.x, wristPoint.y - torso.y)
                : null;
        })
        .filter((value): value is number => value !== null);

    const torsoBase = torsoCenters[0];
    const hipBase = hipCenters[0];
    const headYValues = headCenters.map((point) => point!.y);
    const torsoDisplacement = torsoBase
        ? clamp01(
            mean(
                torsoCenters.map((center) =>
                    Math.hypot(center!.x - torsoBase.x, center!.y - torsoBase.y),
                ),
            ) / 0.12,
        )
        : 0;
    const hipDisplacement = hipBase
        ? mean(
            hipCenters.map((center) =>
                Math.hypot(center!.x - hipBase.x, center!.y - hipBase.y),
            ),
        ) / 0.12
        : 0;
    const shoulderLift =
        shoulderY.length >= 2 ? clamp01((Math.max(...shoulderY) - Math.min(...shoulderY)) / 0.12) : 0;
    const headBounce =
        headYValues.length >= 2
            ? clamp01((Math.max(...headYValues) - Math.min(...headYValues)) / 0.12)
            : 0;
    const armSpreadChange =
        wristToTorso.length >= 2
            ? clamp01((Math.max(...wristToTorso) - Math.min(...wristToTorso)) / 0.18)
            : 0;
    const aftermathFrames =
        releaseStartMs === null
            ? []
            : frames.filter((frame) => frame.timestamp >= releaseStartMs);
    const aftermathTorsoMotion =
        aftermathFrames.length >= 2
            ? clamp01(
                mean(
                    aftermathFrames.slice(1).map((frame, index) => {
                        const previous = shoulderCenter(aftermathFrames[index]!);
                        const current = shoulderCenter(frame);
                        return previous && current
                            ? Math.hypot(current.x - previous.x, current.y - previous.y) / 0.06
                            : 0;
                    }),
                ),
            )
            : 0;

    return {
        torsoDisplacement: round(clamp01(torsoDisplacement + hipDisplacement * 0.35)),
        shoulderLift: round(shoulderLift),
        headBounce: round(headBounce),
        armSpreadChange: round(armSpreadChange),
        reactionAftermathScore: round(
            clamp01(aftermathTorsoMotion * 0.46 + headBounce * 0.28 + shoulderLift * 0.16 + armSpreadChange * 0.1),
        ),
    };
}

function handshapeChangeStats(
    frames: LandmarkFrame[],
    horizontalTravel: number,
    verticalTravel: number,
): BlindHandshapeChangeStats {
    const signals = frames.map((frame) => handshapeSignal(frame));
    const deltas: number[] = [];
    let changeCount = 0;

    for (let index = 1; index < signals.length; index += 1) {
        const previous = signals[index - 1]!;
        const current = signals[index]!;
        const delta =
            Math.abs(current.open - previous.open) * 0.58 +
            Math.abs(current.spread - previous.spread) * 0.42;

        deltas.push(delta);
        if (delta >= 0.12) {
            changeCount += 1;
        }
    }

    const volatility = clamp01(mean(deltas) * 4.2);
    const compactBurstScore = clamp01(
        clamp01(changeCount / 5) * 0.64 +
        volatility * 0.26 +
        (1 - clamp01(horizontalTravel * 0.8 + verticalTravel * 0.8)) * 0.1,
    );

    return {
        volatility: round(volatility),
        changeCount,
        compactBurstScore: round(compactBurstScore),
    };
}

function buildMotionSteps(frames: LandmarkFrame[]) {
    const steps: Array<{
        index: number;
        timestamp: number;
        magnitude: number;
        dx: number;
        dy: number;
        nearFace: number;
        handOpen: number;
    }> = [];

    for (let index = 1; index < frames.length; index += 1) {
        const previousWrist = wrist(frames[index - 1]!);
        const currentWrist = wrist(frames[index]!);

        if (!previousWrist || !currentWrist) {
            continue;
        }

        const dx = currentWrist.x - previousWrist.x;
        const dy = currentWrist.y - previousWrist.y;
        const mouth = mouthCenter(frames[index]!);
        const nearFace = mouth
            ? clamp01(1 - Math.hypot(currentWrist.x - mouth.x, currentWrist.y - mouth.y) / 0.32)
            : 0;

        steps.push({
            index,
            timestamp: frames[index]!.timestamp,
            magnitude: Math.hypot(dx, dy),
            dx,
            dy,
            nearFace,
            handOpen: handOpenValue(frames[index]!),
        });
    }

    return steps;
}

function breakdownFromEncoded(encoded: EncodedSequence): BlindConfidenceBreakdown {
    const motion = clamp01(
        (encoded.quality.motionEnergy + Math.abs(encoded.handVelocityVector[1] ?? 0) * 2) / 2,
    );
    const handshape = clamp01(
        Math.abs((encoded.handPoseVector[8] ?? 0) - 0.5) + (encoded.handPoseVector[9] ?? 0) * 0.6,
    );
    const placement = clamp01(
        (encoded.handPoseVector[10] ?? 0) * 0.35 + (encoded.handPoseVector[11] ?? 0) * 0.65,
    );
    const pose = clamp01(
        mean([encoded.visibilityMask[2] ?? 0, Math.abs(encoded.handVelocityVector[0] ?? 0) * 2]),
    );
    const mouthFace = clamp01(
        mean([
            encoded.quality.mouthStability,
            mean(encoded.facialCueVector) * 1.8,
            mean(encoded.mouthShapeVector),
        ]),
    );
    const total = motion + handshape + placement + pose + mouthFace || 1;

    return {
        motion: round(motion / total),
        handshape: round(handshape / total),
        placement: round(placement / total),
        pose: round(pose / total),
        mouthFace: round(mouthFace / total),
    };
}

function phaseRoleFor(kind: BlindPhaseKind, strokeCount: number, confidence: number): BlindPhaseRole {
    if (kind === "setup" || kind === "approach") {
        return "setup";
    }

    if (kind === "repeated-action-loop") {
        return strokeCount >= 2 || confidence >= 0.72 ? "peak-action" : "action-loop";
    }

    if (kind === "release/fall") {
        return "release";
    }

    if (kind === "hold") {
        return "hold";
    }

    return "recovery/continue";
}

function phaseBreakdown(base: BlindConfidenceBreakdown, role: BlindPhaseRole) {
    const weights = {
        motion: base.motion,
        handshape: base.handshape,
        placement: base.placement,
        pose: base.pose,
        mouthFace: base.mouthFace,
    };

    if (role === "peak-action") {
        weights.motion += 0.28;
        weights.handshape += 0.12;
    } else if (role === "action-loop") {
        weights.motion += 0.18;
        weights.handshape += 0.08;
    } else if (role === "release") {
        weights.motion += 0.2;
        weights.pose += 0.14;
    } else if (role === "hold") {
        weights.handshape += 0.16;
        weights.placement += 0.12;
        weights.mouthFace += 0.12;
    } else if (role === "recovery/continue") {
        weights.motion += 0.14;
        weights.pose += 0.14;
    } else {
        weights.placement += 0.1;
        weights.pose += 0.08;
    }

    const total =
        weights.motion +
        weights.handshape +
        weights.placement +
        weights.pose +
        weights.mouthFace;

    return {
        motion: round(weights.motion / total),
        handshape: round(weights.handshape / total),
        placement: round(weights.placement / total),
        pose: round(weights.pose / total),
        mouthFace: round(weights.mouthFace / total),
    } satisfies BlindConfidenceBreakdown;
}

function phaseChannels(breakdown: BlindConfidenceBreakdown) {
    return Object.entries(breakdown)
        .sort((left, right) => right[1] - left[1])
        .slice(0, 3)
        .map(([channel]) => channel);
}

function buildPhases(
    segment: BlindSemanticDecoderInput["segments"][number],
): BlindSegmentPhase[] {
    const steps = buildMotionSteps(segment.frames);
    const baseBreakdown = breakdownFromEncoded(segment.encoded);
    const averageMagnitude = mean(steps.map((step) => step.magnitude));
    const lowThreshold = Math.max(averageMagnitude * 0.7, 0.004);
    const highThreshold = Math.max(averageMagnitude * 1.3, 0.012);
    const approachCount = steps.filter(
        (step) => step.nearFace >= 0.55 && step.magnitude >= lowThreshold,
    ).length;
    const highSteps = steps.filter((step) => step.magnitude >= highThreshold);
    const repeatedStrokeCount = Math.max(
        0,
        segment.primary.label === "repeated-tool-use-like" || segment.primary.label === "chop/cut-like"
            ? Math.max(2, Math.round(highSteps.length / 2))
            : highSteps.length >= 4
                ? 2
                : 0,
    );
    const hasRelease =
        steps
            .slice(-3)
            .some((step) => Math.abs(step.dy) >= 0.03 || step.magnitude >= highThreshold * 1.1) ||
        segment.primary.label === "object-fall-like";
    const tailHold = steps.slice(-3).every((step) => step.magnitude <= lowThreshold * 1.1);
    const averageNearFace = mean(steps.map((step) => step.nearFace));
    const averageOpen = mean(steps.map((step) => step.handOpen));
    const verticalBias = (segment.encoded.handVelocityVector[3] ?? 0) >= 0.72;
    const phases: BlindSegmentPhase[] = [];

    const pushPhase = (
        kind: BlindPhaseKind,
        startMs: number,
        endMs: number,
        strokeCount: number,
        confidence: number,
        dominantEventFamily: BlindEventFamilyLabel,
    ) => {
        const role = phaseRoleFor(kind, strokeCount, confidence);
        const breakdown = phaseBreakdown(baseBreakdown, role);
        phases.push({
            id: `${segment.id}-${kind}-${phases.length + 1}`,
            kind,
            role,
            startMs,
            endMs,
            strokeCount,
            confidence: round(confidence),
            dominantEventFamily,
            lexemeId: null,
            dominantChannels: phaseChannels(breakdown),
            confidenceBreakdown: breakdown,
        });
    };

    if (segment.frames.length < 4) {
        pushPhase(
            "hold",
            segment.startMs,
            segment.endMs,
            0,
            Math.max(segment.primary.confidence, 0.5),
            segment.primary.label,
        );
        return phases;
    }

    const quarter = Math.max(
        segment.startMs + (segment.endMs - segment.startMs) * 0.25,
        segment.startMs,
    );
    const midpoint = segment.startMs + (segment.endMs - segment.startMs) * 0.55;

    if (averageMagnitude <= lowThreshold * 1.15) {
        pushPhase(
            averageNearFace >= 0.58 ? "hold" : "setup",
            segment.startMs,
            segment.endMs,
            0,
            Math.max(segment.primary.confidence, 0.56),
            segment.primary.label,
        );
        return phases;
    }

    pushPhase("setup", segment.startMs, quarter, 0, 0.58, segment.primary.label);

    if (approachCount >= 2 || averageNearFace >= 0.5) {
        pushPhase(
            "approach",
            quarter,
            Math.max(quarter, midpoint - 120),
            0,
            0.62,
            averageNearFace >= 0.55 ? "drink-like" : segment.primary.label,
        );
    }

    if (repeatedStrokeCount >= 2) {
        pushPhase(
            "repeated-action-loop",
            Math.max(quarter, midpoint - 120),
            Math.min(segment.endMs - 220, segment.endMs),
            repeatedStrokeCount,
            Math.max(segment.primary.confidence, 0.66),
            segment.primary.label === "repeated-tool-use-like" ? "chop/cut-like" : segment.primary.label,
        );
    } else if (averageNearFace >= 0.56 && averageOpen >= 0.5) {
        pushPhase(
            "hold",
            midpoint - 80,
            segment.endMs - 180,
            0,
            Math.max(segment.primary.confidence, 0.62),
            "hold-round-object-like",
        );
    }

    if (hasRelease || (repeatedStrokeCount >= 2 && verticalBias)) {
        pushPhase(
            "release/fall",
            Math.max(midpoint, segment.endMs - 260),
            segment.endMs,
            1,
            Math.max(segment.primary.confidence, 0.64),
            averageNearFace >= 0.5 ? "discard/throw-away-like" : "object-fall-like",
        );
    } else if (tailHold) {
        pushPhase(
            "hold",
            Math.max(midpoint, segment.endMs - 260),
            segment.endMs,
            0,
            Math.max(segment.primary.confidence, 0.6),
            averageNearFace >= 0.55 ? "drink-like" : segment.primary.label,
        );
    } else {
        pushPhase(
            "return/continue",
            Math.max(midpoint, segment.endMs - 260),
            segment.endMs,
            0,
            Math.max(segment.primary.confidence, 0.58),
            segment.primary.label === "carry/hold-object-like" ? "walk/continue-like" : segment.primary.label,
        );
    }

    return phases;
}

function hypothesisFor(
    label: BlindEventFamilyLabel,
    score: number,
    reason: string,
    channels: string[],
) {
    return {
        label,
        confidence: round(clamp01(score)),
        reason,
        channels,
        genericUnknown: label.startsWith("unknown-"),
    } satisfies BlindEventFamilyHypothesis;
}

function boostScore(
    scoreMap: Map<BlindEventFamilyLabel, FamilyScoreDetail>,
    label: BlindEventFamilyLabel,
    delta: number,
    reason: string,
    channels: string[],
) {
    const current = scoreMap.get(label) ?? {
        score: 0,
        reason,
        channels: new Set<string>(),
        genericUnknown: label.startsWith("unknown-"),
    };

    for (const channel of channels) {
        current.channels.add(channel);
    }

    current.score = round(clamp01(current.score + delta));

    if (Math.abs(delta) >= 0.05) {
        current.reason = reason;
    }

    scoreMap.set(label, current);
}

function rankHypotheses(scoreMap: Map<BlindEventFamilyLabel, FamilyScoreDetail>) {
    return Array.from(scoreMap.entries())
        .map(([label, detail]) =>
            hypothesisFor(
                label,
                detail.score,
                detail.reason,
                Array.from(detail.channels).slice(0, 3),
            ),
        )
        .filter((item) => item.confidence > 0)
        .sort((left, right) => right.confidence - left.confidence || left.label.localeCompare(right.label));
}

function buildPhaseStats(
    segment: BlindSemanticDecoderInput["segments"][number],
    phases: BlindSegmentPhase[],
): PhaseStats {
    const totalDurationMs = Math.max(segment.endMs - segment.startMs, 1);
    const roleDuration = (role: BlindPhaseRole) =>
        phases
            .filter((phase) => phase.role === role)
            .reduce((sum, phase) => sum + (phase.endMs - phase.startMs), 0);
    const actionDuration = roleDuration("action-loop") + roleDuration("peak-action");
    const releaseDuration = roleDuration("release");
    const holdDuration = roleDuration("hold");
    const recoveryDuration = roleDuration("recovery/continue");
    const setupDuration = roleDuration("setup");
    const repeatedStrokeCount = phases.reduce(
        (sum, phase) =>
            phase.role === "action-loop" || phase.role === "peak-action"
                ? sum + Math.max(phase.strokeCount, 1)
                : sum,
        0,
    );
    const nearFace = clamp01(segment.encoded.handPoseVector[11] ?? 0);
    const openHand = clamp01(segment.encoded.handPoseVector[8] ?? 0);
    const fingerSpread = clamp01(segment.encoded.handPoseVector[9] ?? 0);
    const mouthStable = clamp01(segment.encoded.quality.mouthStability);
    const faceCue = clamp01(mean(segment.encoded.facialCueVector) * 2);
    const visible = clamp01(mean(segment.encoded.visibilityMask));
    const motionEnergy = clamp01(segment.encoded.quality.motionEnergy);
    const horizontalTravel = clamp01(Math.abs(segment.encoded.handVelocityVector[0] ?? 0) / 0.18);
    const verticalTravel = clamp01(Math.abs(segment.encoded.handVelocityVector[1] ?? 0) / 0.18);
    const verticalBias = clamp01(segment.encoded.handVelocityVector[3] ?? 0);
    const steps = buildMotionSteps(segment.frames);
    const averageMagnitude = mean(steps.map((step) => step.magnitude));
    const highThreshold = Math.max(averageMagnitude * 1.25, 0.012);
    const actionSteps = steps.filter((step) => step.magnitude >= highThreshold);
    const mouthApproachCount =
        phases.filter((phase) => phase.kind === "approach").length +
        (nearFace >= 0.55 ? phases.filter((phase) => phase.role === "peak-action").length : 0) +
        (nearFace >= 0.72 && motionEnergy >= 0.48 ? 1 : 0);
    const mouthHoldRatio =
        nearFace >= 0.5
            ? clamp01(holdDuration / totalDurationMs)
            : 0;
    const holdRoundSupport = clamp01(openHand * 0.55 + fingerSpread * 0.45);
    const sideFaceHoldRatio = clamp01(mean(segment.frames.map((frame) => sideFaceHoldValue(frame))));
    const sideFaceDominance = clamp01(sideFaceHoldRatio - mouthHoldRatio * 0.6);
    const bilateralAsymmetry = oneHandAsymmetry(segment.frames);
    const shapeChange = handshapeChangeStats(
        segment.frames,
        horizontalTravel,
        verticalTravel,
    );
    const actionRatio = clamp01(actionDuration / totalDurationMs);
    const releaseRatio = clamp01(releaseDuration / totalDurationMs);
    const holdRatio = clamp01(holdDuration / totalDurationMs);
    const recoveryRatio = clamp01(recoveryDuration / totalDurationMs);
    const setupRatio = clamp01(setupDuration / totalDurationMs);
    const setupStillScore = clamp01(
        setupRatio * 0.32 +
        (1 - motionEnergy) * 0.18 +
        nearFace * 0.18 +
        faceCue * 0.14 +
        visible * 0.1 +
        (1 - horizontalTravel) * 0.08,
    );
    const carrySupport = clamp01(
        holdRatio * 0.28 +
        (1 - nearFace) * 0.18 +
        (1 - openHand) * 0.14 +
        (1 - motionEnergy) * 0.16 +
        visible * 0.12 +
        recoveryRatio * 0.12,
    );
    const travelSupport = clamp01(
        horizontalTravel * 0.34 +
        recoveryRatio * 0.22 +
        motionEnergy * 0.12 +
        (1 - nearFace) * 0.12 +
        visible * 0.1 +
        actionRatio * 0.1,
    );
    const ingestSupport = clamp01(
        nearFace * 0.28 +
        mouthStable * 0.22 +
        mouthHoldRatio * 0.18 +
        clamp01(mouthApproachCount / 3) * 0.16 +
        visible * 0.08 +
        faceCue * 0.08,
    );
    const sustainedAttentionScore = clamp01(
        sideFaceHoldRatio * 0.34 +
        sideFaceDominance * 0.18 +
        holdRatio * 0.16 +
        (1 - motionEnergy) * 0.12 +
        faceCue * 0.1 +
        bilateralAsymmetry * 0.1,
    );
    const releasePhase = phases.find((phase) => phase.role === "release") ?? null;
    const bodyReaction = bodyReactionStats(segment.frames, releasePhase?.startMs ?? null);
    const finalPoseLift = clamp01(
        mean(
            segment.frames.slice(-3).map((frame) => {
                const wristPoint = wrist(frame);
                const torso = shoulderCenter(frame);
                return wristPoint && torso ? clamp01((torso.y - wristPoint.y) / 0.22) : 0;
            }),
        ),
    );
    const directionalStrokeConsistency =
        actionSteps.length >= 2
            ? clamp01(
                mean(
                    actionSteps.map((step) => {
                        const magnitude = Math.max(step.magnitude, 0.0001);
                        const verticalAlignment = Math.abs(step.dy) / magnitude;
                        const horizontalPenalty = Math.abs(step.dx) / magnitude;
                        return clamp01(verticalAlignment * 0.78 + (1 - horizontalPenalty) * 0.22);
                    }),
                ),
            )
            : 0;
    const strokeAmplitudeConsistency =
        actionSteps.length >= 2
            ? (() => {
                const magnitudes = actionSteps.map((step) => step.magnitude);
                const meanMagnitude = Math.max(mean(magnitudes), 0.0001);
                const deviation = mean(magnitudes.map((value) => Math.abs(value - meanMagnitude)));
                return clamp01(1 - deviation / Math.max(meanMagnitude * 0.9, 0.01));
            })()
            : 0;
    const actionLoopRegularity =
        actionSteps.length >= 3
            ? (() => {
                const intervals = actionSteps
                    .slice(1)
                    .map((step, index) => step.timestamp - actionSteps[index]!.timestamp);
                const meanInterval = Math.max(mean(intervals), 1);
                const deviation = mean(intervals.map((value) => Math.abs(value - meanInterval)));
                return clamp01(1 - deviation / Math.max(meanInterval * 0.9, 45));
            })()
            : 0;
    const endSteps = steps.slice(-4);
    const endLowMotion =
        endSteps.length
            ? clamp01(1 - mean(endSteps.map((step) => step.magnitude)) / 0.02)
            : 0;
    const finalHoldRole = phases.at(-1)?.role === "hold" ? 1 : phases.at(-1)?.role === "recovery/continue" ? 0.45 : 0;
    const endStateStabilization = clamp01(
        endLowMotion * 0.42 +
        finalHoldRole * 0.2 +
        finalPoseLift * 0.18 +
        holdRatio * 0.1 +
        clamp01(1 - bodyReaction.reactionAftermathScore) * 0.1,
    );
    const contradictionScore = clamp01(
        Math.min(actionRatio, mouthHoldRatio) * 0.4 +
        Math.min(setupRatio, actionRatio) * 0.24 +
        Math.min(releaseRatio, mouthHoldRatio) * 0.18 +
        Math.min(travelSupport, ingestSupport) * 0.18 +
        Math.min(sustainedAttentionScore, ingestSupport) * 0.14,
    );

    return {
        totalDurationMs,
        setupRatio,
        actionRatio,
        releaseRatio,
        holdRatio,
        recoveryRatio,
        repeatedStrokeCount,
        actionToReleaseRatio: round(actionDuration / Math.max(releaseDuration, 120)),
        releaseTailRatio: clamp01(releaseDuration / totalDurationMs),
        mouthApproachCount,
        mouthHoldRatio,
        holdRoundSupport,
        setupStillScore,
        carrySupport,
        travelSupport,
        ingestSupport,
        sideFaceHoldRatio,
        sideFaceDominance,
        sustainedAttentionScore,
        bilateralAsymmetry,
        handshapeVolatility: shapeChange.volatility,
        handshapeChangeCount: shapeChange.changeCount,
        compactShapeBurstScore: shapeChange.compactBurstScore,
        torsoDisplacement: bodyReaction.torsoDisplacement,
        shoulderLift: bodyReaction.shoulderLift,
        headBounce: bodyReaction.headBounce,
        armSpreadChange: bodyReaction.armSpreadChange,
        reactionAftermathScore: bodyReaction.reactionAftermathScore,
        finalPoseLift,
        directionalStrokeConsistency: round(directionalStrokeConsistency),
        strokeAmplitudeConsistency: round(strokeAmplitudeConsistency),
        actionLoopRegularity: round(actionLoopRegularity),
        endStateStabilization: round(endStateStabilization),
        contradictionScore,
        nearFace,
        openHand,
        fingerSpread,
        mouthStable,
        faceCue,
        visible,
        motionEnergy,
        horizontalTravel,
        verticalTravel,
        verticalBias,
        closedHand: clamp01(1 - openHand),
    };
}

function buildPhaseFamilyVotes(stats: PhaseStats, phases: BlindSegmentPhase[]) {
    const votes = new Map<BlindEventFamilyLabel, number>();
    const add = (label: BlindEventFamilyLabel, score: number) => {
        votes.set(label, round((votes.get(label) ?? 0) + score));
    };

    const orderedKinds = phases.map((phase) => phase.kind).join(" -> ");

    if (
        orderedKinds.includes("setup") &&
        orderedKinds.includes("repeated-action-loop") &&
        orderedKinds.includes("release/fall")
    ) {
        add("repeated-tool-use-like", 0.26);
        add("chop/cut-like", 0.24);
    }

    if (
        orderedKinds.includes("setup") &&
        orderedKinds.includes("approach") &&
        orderedKinds.includes("hold") &&
        stats.sideFaceHoldRatio >= 0.42
    ) {
        add("phone/call-like", 0.3);
        add("inspect/listen-like", 0.24);
    }

    if (
        stats.compactShapeBurstScore >= 0.48 &&
        stats.repeatedStrokeCount <= 1 &&
        stats.travelSupport <= 0.34
    ) {
        add("fingerspell/emphatic-letter-sequence-like", 0.32);
    }

    if (stats.releaseRatio >= 0.18 && stats.reactionAftermathScore >= 0.42) {
        add("big-fall-like", 0.3);
        add("impact/bounce-like", 0.22);
    }

    if (
        stats.finalPoseLift >= 0.42 &&
        stats.endStateStabilization >= 0.5 &&
        (stats.headBounce >= 0.08 || stats.armSpreadChange >= 0.12)
    ) {
        add("approval/celebration-like", 0.28);
    } else if (
        stats.finalPoseLift >= 0.36 &&
        stats.endStateStabilization >= 0.36 &&
        stats.headBounce >= 0.42 &&
        stats.armSpreadChange >= 0.68
    ) {
        add("approval/celebration-like", 0.2);
    }

    return Array.from(votes.entries())
        .map(([label, score]) => ({ label, score }))
        .sort((left, right) => right.score - left.score)
        .slice(0, 5);
}

function motifTagsForState(
    stats: PhaseStats,
    phaseFamilyVotes: Array<{ label: BlindEventFamilyLabel; score: number }>,
    phases: BlindSegmentPhase[],
) {
    const tags: string[] = [];

    if (stats.repeatedStrokeCount >= 2) {
        tags.push("repeated-action-loop");
    }

    if (stats.compactShapeBurstScore >= 0.5) {
        tags.push("repeated-compact-handshape-sequence");
    }

    if (stats.reactionAftermathScore >= 0.4) {
        tags.push("impact-rebound");
    }

    if (
        phaseFamilyVotes.some((vote) => vote.label === "approval/celebration-like") &&
        phases.at(-1)?.role === "hold"
    ) {
        tags.push("final-approval-like");
    }

    if (
        phaseFamilyVotes.some(
            (vote) =>
                vote.label === "phone/call-like" || vote.label === "inspect/listen-like",
        )
    ) {
        tags.push("attention-hold");
    }

    return tags;
}

function buildInitialScoreMap(
    segment: BlindSemanticDecoderInput["segments"][number],
    phases: BlindSegmentPhase[],
    stats: PhaseStats,
    phaseFamilyVotes: Array<{ label: BlindEventFamilyLabel; score: number }>,
) {
    const scoreMap = new Map<BlindEventFamilyLabel, FamilyScoreDetail>();

    boostScore(
        scoreMap,
        segment.primary.label,
        segment.primary.confidence * 0.54,
        "Seed from first-pass event-family decoder.",
        segment.primary.channels,
    );

    for (const alternative of segment.alternatives.slice(0, 4)) {
        boostScore(
            scoreMap,
            alternative.label,
            alternative.confidence * 0.32,
            "Seed from first-pass alternate family.",
            alternative.channels,
        );
    }

    const releaseIsolated = clamp01(
        stats.releaseRatio * 0.7 + (stats.actionRatio <= 0.18 ? 0.22 : 0),
    );
    const toolActionDominance = clamp01(
        stats.actionRatio * 0.5 +
        clamp01(stats.repeatedStrokeCount / 3) * 0.24 +
        stats.verticalBias * 0.14 +
        stats.closedHand * 0.12,
    );
    const chopScore = clamp01(
        toolActionDominance * 0.68 +
        stats.verticalBias * 0.12 +
        (stats.actionToReleaseRatio >= 1.2 ? 0.1 : 0) +
        (stats.releaseTailRatio <= 0.28 ? 0.06 : 0),
    );
    const repeatedToolScore = clamp01(
        toolActionDominance * 0.62 +
        (1 - stats.verticalBias) * 0.1 +
        stats.setupRatio * 0.08 +
        stats.recoveryRatio * 0.08 -
        stats.releaseRatio * 0.12,
    );
    const objectFallScore = clamp01(
        releaseIsolated * 0.66 +
        stats.releaseRatio * 0.18 +
        (stats.releaseTailRatio >= 0.35 ? 0.08 : 0) -
        stats.actionRatio * 0.18 -
        (stats.repeatedStrokeCount >= 2 ? 0.06 : 0),
    );

    boostScore(
        scoreMap,
        "repeated-tool-use-like",
        repeatedToolScore,
        "Repeated action phases dominated without enough isolated release to call full drop event.",
        ["motion", "handshape", "timing"],
    );
    boostScore(
        scoreMap,
        "chop/cut-like",
        chopScore,
        "Peak action plus repeated vertical strokes favored chop-or-cut over broader tool-use.",
        ["motion", "timing", "handshape"],
    );
    boostScore(
        scoreMap,
        "object-fall-like",
        objectFallScore,
        "Release looked strong enough to score object-fall-like, but action-to-release ratio still matters.",
        ["motion", "timing", "visibility"],
    );

    const repeatedMouthApproaches = clamp01(stats.mouthApproachCount / 3);
    const eatScore = clamp01(
        stats.ingestSupport * 0.3 +
        repeatedMouthApproaches * 0.28 +
        stats.actionRatio * 0.16 +
        stats.openHand * 0.12 +
        stats.mouthStable * 0.14,
    );
    const drinkScore = clamp01(
        stats.ingestSupport * 0.26 +
        stats.mouthHoldRatio * 0.24 +
        stats.mouthStable * 0.16 +
        stats.closedHand * 0.14 +
        (stats.mouthApproachCount <= 1 ? 0.08 : 0),
    );
    const holdRoundScore = clamp01(
        stats.ingestSupport * 0.22 +
        stats.mouthHoldRatio * 0.22 +
        stats.holdRoundSupport * 0.24 +
        (stats.actionRatio <= 0.18 ? 0.1 : 0),
    );

    boostScore(
        scoreMap,
        "eat-like",
        eatScore,
        "Repeated mouth-adjacent approaches favored eat-like ingestion pattern.",
        ["mouthCue", "motion", "handshape"],
    );
    boostScore(
        scoreMap,
        "drink-like",
        drinkScore,
        "Sustained mouth-adjacent hold favored drink-like motion more than broad ingest.",
        ["mouthCue", "timing", "placement"],
    );
    boostScore(
        scoreMap,
        "hold-round-object-like",
        holdRoundScore,
        "Open, rounded handshape with mouth-adjacent hold favored held-object interpretation.",
        ["handshape", "placement", "timing"],
    );

    const personSetupScore = clamp01(
        stats.setupStillScore * 0.72 +
        (stats.actionRatio >= 0.2 ? -0.12 : 0) +
        (stats.travelSupport >= 0.45 ? -0.08 : 0),
    );
    const carryScore = clamp01(
        stats.carrySupport * 0.78 +
        (stats.actionRatio >= 0.2 ? -0.08 : 0),
    );
    const walkScore = clamp01(
        stats.travelSupport * 0.84 +
        (stats.setupStillScore >= 0.58 ? -0.06 : 0),
    );

    boostScore(
        scoreMap,
        "person/setup-like",
        personSetupScore,
        "Face-framed setup stillness stayed visible before stronger action began.",
        ["placement", "facialCue", "timing"],
    );
    boostScore(
        scoreMap,
        "carry/hold-object-like",
        carryScore,
        "Lower-motion hold posture away from face favored carry-or-hold-object.",
        ["handshape", "placement", "timing"],
    );
    boostScore(
        scoreMap,
        "walk/continue-like",
        walkScore,
        "Horizontal path continuity plus recovery motion favored walk-or-continue.",
        ["motion", "pose", "timing"],
    );

    const phoneScore = clamp01(
        stats.sideFaceHoldRatio * 0.28 +
        stats.sideFaceDominance * 0.2 +
        stats.bilateralAsymmetry * 0.14 +
        stats.holdRatio * 0.14 +
        (1 - clamp01(stats.mouthApproachCount / 3)) * 0.14 +
        (1 - stats.travelSupport) * 0.1,
    );
    const inspectScore = clamp01(
        stats.sustainedAttentionScore * 0.42 +
        stats.holdRatio * 0.16 +
        stats.faceCue * 0.1 +
        (1 - stats.travelSupport) * 0.12 +
        (1 - stats.actionRatio) * 0.1 +
        stats.sideFaceDominance * 0.1,
    );
    const fingerSpellScore = clamp01(
        stats.compactShapeBurstScore * 0.42 +
        clamp01(stats.handshapeChangeCount / 6) * 0.22 +
        stats.handshapeVolatility * 0.14 +
        (1 - stats.travelSupport) * 0.12 +
        (stats.repeatedStrokeCount <= 1 ? 0.1 : 0) -
        stats.actionRatio * 0.14 -
        stats.releaseRatio * 0.12 -
        stats.reactionAftermathScore * 0.16 -
        (stats.motionEnergy >= 0.38 ? clamp01(stats.repeatedStrokeCount / 3) * 0.12 : 0) -
        (stats.actionRatio >= 0.18 ? stats.verticalBias * 0.08 : 0),
    );
    const confusionScore = clamp01(
        stats.handshapeVolatility * 0.2 +
        stats.contradictionScore * 0.22 +
        stats.faceCue * 0.16 +
        stats.setupRatio * 0.14 +
        stats.sideFaceDominance * 0.1,
    );
    const impactScore = clamp01(
        stats.reactionAftermathScore * 0.38 +
        stats.releaseRatio * 0.18 +
        stats.headBounce * 0.16 +
        stats.shoulderLift * 0.14 +
        stats.armSpreadChange * 0.14,
    );
    const bigFallScore = clamp01(
        stats.actionRatio * 0.18 +
        stats.releaseRatio * 0.18 +
        stats.reactionAftermathScore * 0.28 +
        stats.headBounce * 0.12 +
        stats.verticalBias * 0.12 +
        (stats.releaseTailRatio >= 0.3 ? 0.12 : 0) +
        (1 - stats.endStateStabilization) * 0.08,
    );
    const approvalScore = clamp01(
        stats.endStateStabilization * 0.3 +
        stats.finalPoseLift * 0.2 +
        stats.headBounce * 0.12 +
        stats.armSpreadChange * 0.12 +
        stats.faceCue * 0.12 +
        stats.visible * 0.12 +
        stats.recoveryRatio * 0.08 +
        (phases.at(-1)?.role === "hold" ? 0.1 : 0),
    );

    boostScore(
        scoreMap,
        "phone/call-like",
        phoneScore,
        "Side-of-face hold with one active hand and low ingest pattern favored phone-or-call family.",
        ["placement", "handshape", "timing"],
    );
    boostScore(
        scoreMap,
        "inspect/listen-like",
        inspectScore,
        "Sustained attention hold near face or ear favored inspect-or-listen family.",
        ["placement", "facialCue", "pose"],
    );
    boostScore(
        scoreMap,
        "fingerspell/emphatic-letter-sequence-like",
        fingerSpellScore,
        "Compact repeated handshape changes with low travel favored fingerspell-or-emphatic-sequence family.",
        ["handshape", "motion", "timing"],
    );
    boostScore(
        scoreMap,
        "confusion/realization-like",
        confusionScore,
        "Contradictory face-and-hand timing with shape changes favored confusion-or-realization family.",
        ["facialCue", "handshape", "timing"],
    );
    boostScore(
        scoreMap,
        "impact/bounce-like",
        impactScore,
        "Body bounce and rebound after release favored impact-or-bounce family.",
        ["pose", "motion", "timing"],
    );
    boostScore(
        scoreMap,
        "big-fall-like",
        bigFallScore,
        "Longer build-up plus stronger release aftermath favored big-fall over short release tail.",
        ["motion", "pose", "timing"],
    );
    boostScore(
        scoreMap,
        "approval/celebration-like",
        approvalScore,
        "Lifted final pose with visible body reaction favored approval-or-celebration family.",
        ["pose", "facialCue", "motion"],
    );

    for (const vote of phaseFamilyVotes) {
        boostScore(
            scoreMap,
            vote.label,
            vote.score,
            "Phase-family voting reinforced this family from segment-internal phase order.",
            ["timing", "motion", "placement"],
        );
    }

    if (stats.repeatedStrokeCount >= 2 && stats.releaseTailRatio <= 0.28) {
        boostScore(
            scoreMap,
            "chop/cut-like",
            0.08,
            "Release stayed short tail after repeated strokes, so cut-like action stayed stronger than standalone fall.",
            ["motion", "timing"],
        );
        boostScore(
            scoreMap,
            "object-fall-like",
            -0.12,
            "Short tail release should not outweigh repeated action loop.",
            ["timing"],
        );
    }

    if (stats.repeatedStrokeCount >= 2) {
        const cutDirectionalScore = clamp01(
            stats.directionalStrokeConsistency * 0.34 +
            stats.strokeAmplitudeConsistency * 0.2 +
            stats.actionLoopRegularity * 0.16 +
            stats.verticalBias * 0.14 +
            stats.actionRatio * 0.1 +
            stats.releaseRatio * 0.06,
        );
        const broadToolScore = clamp01(
            stats.actionRatio * 0.26 +
            clamp01(stats.repeatedStrokeCount / 4) * 0.18 +
            (1 - stats.directionalStrokeConsistency) * 0.18 +
            (1 - stats.strokeAmplitudeConsistency) * 0.12 +
            stats.motionEnergy * 0.14 +
            stats.recoveryRatio * 0.12,
        );

        if (cutDirectionalScore >= broadToolScore + 0.06) {
            boostScore(
                scoreMap,
                "chop/cut-like",
                0.16,
                "Directional stroke consistency and regular release pattern favored chop-or-cut over broader tool-use.",
                ["motion", "timing"],
            );
            boostScore(
                scoreMap,
                "repeated-tool-use-like",
                -0.06,
                "Narrow repeated stroke pattern reduced broader tool-use reading.",
                ["motion"],
            );
        } else if (broadToolScore >= cutDirectionalScore + 0.04) {
            boostScore(
                scoreMap,
                "repeated-tool-use-like",
                0.14,
                "Broader repeated action with less directional narrowness favored repeated-tool-use over chop-or-cut.",
                ["motion", "timing"],
            );
            boostScore(
                scoreMap,
                "chop/cut-like",
                -0.05,
                "Weaker directional regularity reduced sharper cut-like reading.",
                ["motion"],
            );
        }

    }

    if (stats.repeatedStrokeCount >= 2 && stats.verticalBias >= 0.72) {
        boostScore(
            scoreMap,
            "chop/cut-like",
            0.12,
            "Repeated vertical strokes plus peak-action weighting sharpened broad tool-use into chop-or-cut family.",
            ["motion", "timing", "handshape"],
        );
        boostScore(
            scoreMap,
            "repeated-tool-use-like",
            -0.04,
            "Stronger directional action pushed broad tool-use toward chop-or-cut family.",
            ["timing"],
        );
    }

    if (stats.repeatedStrokeCount >= 2 && stats.actionRatio >= 0.22) {
        boostScore(
            scoreMap,
            "repeated-tool-use-like",
            0.14,
            "Peak-action phases repeated enough to outweigh setup-only interpretation.",
            ["motion", "timing", "handshape"],
        );
        boostScore(
            scoreMap,
            "chop/cut-like",
            0.08,
            "Repeated action-loop phases supported sharper cut-like family.",
            ["motion", "timing"],
        );
        boostScore(
            scoreMap,
            "person/setup-like",
            -0.12,
            "Setup family should decay once repeated peak-action dominates the segment.",
            ["timing"],
        );
    }

    if (
        stats.repeatedStrokeCount >= 2 &&
        stats.compactShapeBurstScore <= 0.4 &&
        stats.reactionAftermathScore <= 0.32 &&
        stats.releaseTailRatio <= 0.24 &&
        stats.verticalBias <= 0.68
    ) {
        boostScore(
            scoreMap,
            "repeated-tool-use-like",
            0.12,
            "Stable repeated loop with weaker rebound stayed broader tool-use rather than sharper cut-like action.",
            ["motion", "timing"],
        );
        boostScore(
            scoreMap,
            "chop/cut-like",
            -0.08,
            "Lower burst density and weaker rebound reduced sharper cut-like reading.",
            ["motion"],
        );
    }

    if (stats.mouthApproachCount >= 2 && stats.mouthHoldRatio <= 0.42) {
        boostScore(
            scoreMap,
            "eat-like",
            0.16,
            "Repeated mouth approaches outweighed sustained sip-like hold.",
            ["mouthCue", "motion"],
        );
        boostScore(
            scoreMap,
            "drink-like",
            -0.06,
            "Repeated approach pattern pulled away from sustained drink-like hold.",
            ["motion"],
        );
    }

    if (stats.mouthHoldRatio >= 0.32 && stats.mouthApproachCount <= 1) {
        boostScore(
            scoreMap,
            stats.holdRoundSupport >= 0.58 ? "hold-round-object-like" : "drink-like",
            0.08,
            "Sustained mouth-adjacent hold outweighed travel fallback.",
            ["handshape", "timing", "placement"],
        );
        boostScore(
            scoreMap,
            "walk/continue-like",
            -0.08,
            "Mouth-adjacent hold should not fall back to travel without stronger path evidence.",
            ["placement"],
        );
    }

    if (stats.mouthApproachCount === 0 && stats.mouthHoldRatio <= 0.16) {
        boostScore(
            scoreMap,
            "drink-like",
            -0.1,
            "No mouth-adjacent approach or hold support, so drink-like score should decay.",
            ["mouthCue"],
        );
        boostScore(
            scoreMap,
            "eat-like",
            -0.08,
            "No repeated mouth approach support, so eat-like score should decay.",
            ["motion"],
        );
        boostScore(
            scoreMap,
            "hold-round-object-like",
            -0.08,
            "No sustained mouth-adjacent hold support, so held-object ingest should decay.",
            ["placement"],
        );
    }

    if (stats.sideFaceHoldRatio >= 0.42 && stats.mouthApproachCount <= 1) {
        boostScore(
            scoreMap,
            "phone/call-like",
            0.14,
            "Side-of-face hold dominated without repeated ingest approach.",
            ["placement", "timing"],
        );
        boostScore(
            scoreMap,
            "drink-like",
            -0.08,
            "Side-of-face hold should not collapse into drink-like without mouth approach pattern.",
            ["mouthCue"],
        );
        boostScore(
            scoreMap,
            "person/setup-like",
            -0.06,
            "Sustained side-face placement added more than neutral setup evidence.",
            ["placement"],
        );
    }

    if (
        stats.sideFaceHoldRatio >= 0.38 &&
        stats.holdRoundSupport >= 0.56 &&
        stats.mouthApproachCount === 0 &&
        stats.actionRatio <= 0.18
    ) {
        boostScore(
            scoreMap,
            "inspect/listen-like",
            0.28,
            "Open sustained attention hold near side of face favored inspect-or-listen over phone-call-like.",
            ["placement", "handshape", "timing"],
        );
        boostScore(
            scoreMap,
            "phone/call-like",
            -0.12,
            "Broader open attention hold reduced tighter phone-call reading.",
            ["handshape"],
        );
    }

    if (stats.sustainedAttentionScore >= 0.48 && stats.travelSupport <= 0.34) {
        boostScore(
            scoreMap,
            stats.holdRoundSupport >= 0.62 ? "hold-round-object-like" : "inspect/listen-like",
            0.12,
            "Sustained attention pose with low travel favored inspect-or-listen over generic setup.",
            ["placement", "pose", "timing"],
        );
    }

    if (stats.compactShapeBurstScore >= 0.52 && stats.repeatedStrokeCount <= 1) {
        boostScore(
            scoreMap,
            "fingerspell/emphatic-letter-sequence-like",
            0.24,
            "Compact discrete handshape bursts outweighed large-loop tool-use reading.",
            ["handshape", "timing"],
        );
        boostScore(
            scoreMap,
            "repeated-tool-use-like",
            -0.08,
            "Low-travel compact sequence should not read as broad repeated tool-use.",
            ["motion"],
        );
        boostScore(
            scoreMap,
            "carry/hold-object-like",
            -0.16,
            "Frequent discrete shape changes should not collapse into passive carry family.",
            ["handshape"],
        );
        boostScore(
            scoreMap,
            "person/setup-like",
            -0.08,
            "Frequent discrete shape changes should not collapse into neutral setup family.",
            ["handshape"],
        );
    }

    if (stats.handshapeChangeCount >= 6 && stats.compactShapeBurstScore >= 0.44) {
        boostScore(
            scoreMap,
            "fingerspell/emphatic-letter-sequence-like",
            0.38,
            "Many discrete compact handshape changes strongly favored fingerspell-or-emphatic-sequence family.",
            ["handshape", "timing", "motion"],
        );
        boostScore(
            scoreMap,
            "person/setup-like",
            -0.14,
            "Dense compact shape changes reduced neutral setup reading.",
            ["handshape"],
        );
    }

    if (
        stats.compactShapeBurstScore >= 0.48 &&
        stats.motionEnergy >= 0.42 &&
        (stats.repeatedStrokeCount >= 2 || stats.actionRatio >= 0.24) &&
        stats.releaseRatio >= 0.12
    ) {
        boostScore(
            scoreMap,
            "fingerspell/emphatic-letter-sequence-like",
            -0.22,
            "Repeated action loop plus release tail should outweigh compact-sequence reading.",
            ["motion", "timing"],
        );
        boostScore(
            scoreMap,
            stats.verticalBias >= 0.64 ? "chop/cut-like" : "repeated-tool-use-like",
            0.16,
            "Repeated action and release pattern reinforced tool-use family over compact sequence.",
            ["motion", "timing", "pose"],
        );
    }

    if (stats.reactionAftermathScore >= 0.3 && stats.releaseRatio >= 0.14) {
        boostScore(
            scoreMap,
            "big-fall-like",
            0.42,
            "Release followed by rebound and body reaction favored big-fall over plain release.",
            ["pose", "timing", "motion"],
        );
        boostScore(
            scoreMap,
            "impact/bounce-like",
            0.16,
            "Rebound after release favored impact-or-bounce family.",
            ["pose", "motion"],
        );
        boostScore(
            scoreMap,
            "object-fall-like",
            -0.08,
            "Short release-only family should decay when aftermath stays strong.",
            ["timing"],
        );
        boostScore(
            scoreMap,
            "chop/cut-like",
            -0.28,
            "Aftermath body reaction reduced pure cut-like reading.",
            ["pose"],
        );
        boostScore(
            scoreMap,
            "repeated-tool-use-like",
            -0.08,
            "Large aftermath reduced plain repeated-tool-use reading.",
            ["pose"],
        );
    }

    if (
        stats.compactShapeBurstScore >= 0.5 &&
        stats.releaseRatio >= 0.18 &&
        stats.reactionAftermathScore >= 0.34
    ) {
        boostScore(
            scoreMap,
            "fingerspell/emphatic-letter-sequence-like",
            -0.18,
            "Compact bursts should decay when release aftermath and rebound dominate the segment.",
            ["pose", "timing"],
        );
        boostScore(
            scoreMap,
            "big-fall-like",
            0.12,
            "Strong rebound tail kept drop aftermath more plausible than compact sequence.",
            ["pose", "motion", "timing"],
        );
        boostScore(
            scoreMap,
            "impact/bounce-like",
            0.08,
            "Rebound body motion reinforced impact-like reading over compact sequence.",
            ["pose", "motion"],
        );
    }

    if (
        stats.reactionAftermathScore >= 0.24 &&
        stats.releaseRatio >= 0.12 &&
        ((scoreMap.get("big-fall-like")?.score ?? 0) >=
            (scoreMap.get("chop/cut-like")?.score ?? 0) - 0.14)
    ) {
        boostScore(
            scoreMap,
            "big-fall-like",
            0.26,
            "Release plus aftermath stayed strong enough to sharpen broad cut-or-drop reading into big-fall family.",
            ["pose", "timing", "motion"],
        );
        boostScore(
            scoreMap,
            "chop/cut-like",
            -0.18,
            "Large aftermath should pull away from pure cut-like family when drop aftermath stays dominant.",
            ["pose"],
        );
    }

    if (
        stats.finalPoseLift >= 0.44 &&
        stats.openHand >= 0.6 &&
        stats.endStateStabilization >= 0.5 &&
        (stats.headBounce >= 0.08 || stats.armSpreadChange >= 0.12)
    ) {
        boostScore(
            scoreMap,
            "approval/celebration-like",
            0.24,
            "Final uplift plus bounce reinforced approval-or-celebration family.",
            ["pose", "motion"],
        );
        boostScore(
            scoreMap,
            "person/setup-like",
            -0.06,
            "Positive final body reaction added more than neutral setup hold.",
            ["pose"],
        );
    }

    if (
        stats.finalPoseLift >= 0.24 &&
        stats.endStateStabilization >= 0.46 &&
        (stats.headBounce >= 0.3 || stats.armSpreadChange >= 0.45) &&
        (scoreMap.get("approval/celebration-like")?.score ?? 0) >=
        (scoreMap.get("fingerspell/emphatic-letter-sequence-like")?.score ?? 0) - 0.12
    ) {
        boostScore(
            scoreMap,
            "approval/celebration-like",
            0.18,
            "Strong uplift and rebound kept approval-like reading ahead of compact-sequence fallback.",
            ["pose", "motion"],
        );
        boostScore(
            scoreMap,
            "fingerspell/emphatic-letter-sequence-like",
            -0.12,
            "High body reaction reduced compact-sequence fallback.",
            ["pose"],
        );
    }

    if (
        stats.endStateStabilization >= 0.56 &&
        stats.finalPoseLift >= 0.24 &&
        stats.reactionAftermathScore <= 0.34
    ) {
        boostScore(
            scoreMap,
            "approval/celebration-like",
            0.16,
            "Stable uplifted end-state favored approval-or-celebration over rebound-driven families.",
            ["pose", "timing"],
        );
        boostScore(
            scoreMap,
            "big-fall-like",
            -0.08,
            "Stable end-state reduced big-fall reading.",
            ["timing"],
        );
    }

    if (
        stats.reactionAftermathScore >= 0.36 &&
        stats.releaseRatio >= 0.16 &&
        stats.endStateStabilization <= 0.42
    ) {
        boostScore(
            scoreMap,
            "big-fall-like",
            0.14,
            "Strong rebound aftermath with weak end-state stabilization favored big-fall family.",
            ["pose", "motion", "timing"],
        );
        boostScore(
            scoreMap,
            "approval/celebration-like",
            -0.08,
            "Chaotic aftermath reduced approval-like end-state reading.",
            ["pose"],
        );
    }

    if (
        stats.finalPoseLift >= 0.36 &&
        stats.endStateStabilization >= 0.34 &&
        stats.headBounce >= 0.42 &&
        stats.armSpreadChange >= 0.68 &&
        stats.reactionAftermathScore <= 0.48
    ) {
        boostScore(
            scoreMap,
            "approval/celebration-like",
            0.12,
            "Lifted end-state with wider body spread stayed stable enough to favor approval-like reading.",
            ["pose", "timing"],
        );
        boostScore(
            scoreMap,
            "big-fall-like",
            -0.08,
            "Stable uplifted end-state reduced pure big-fall reading.",
            ["pose"],
        );
    }

    return scoreMap;
}

function rerankState(state: BlindScoringState) {
    const ranked = rankHypotheses(state.scoreMap);
    const [primary, runnerUp] = ranked;
    const contradictionPenalty = state.stats.contradictionScore * 0.12;
    const agreementBoost =
        clamp01(
            (state.localTransitionSupport > 0 ? state.localTransitionSupport * 0.12 : 0) +
            (state.motifClusterId ? 0.04 : 0),
        ) || 0;

    state.primary = hypothesisFor(
        primary?.label ?? "unknown-person-intro-like",
        clamp01((primary?.confidence ?? 0.44) + agreementBoost - contradictionPenalty),
        primary?.reason ?? "No stable family score yet.",
        primary?.channels ?? ["motion"],
    );
    state.runnerUp = runnerUp
        ? hypothesisFor(
            runnerUp.label,
            clamp01(runnerUp.confidence - contradictionPenalty * 0.5),
            runnerUp.reason,
            runnerUp.channels,
        )
        : null;
    state.alternatives = ranked.slice(1, 5).map((alternative, index) =>
        index === 0 && state.runnerUp
            ? state.runnerUp
            : alternative,
    );
    state.confidenceMargin = round(
        clamp01(state.primary.confidence - (state.runnerUp?.confidence ?? 0)),
    );

    const bigFallScore = state.scoreMap.get("big-fall-like")?.score ?? 0;
    const fingerSpellScore =
        state.scoreMap.get("fingerspell/emphatic-letter-sequence-like")?.score ?? 0;
    const approvalScore = state.scoreMap.get("approval/celebration-like")?.score ?? 0;
    const chopScore = state.scoreMap.get("chop/cut-like")?.score ?? 0;
    const repeatedToolScore = state.scoreMap.get("repeated-tool-use-like")?.score ?? 0;
    const phoneScore = state.scoreMap.get("phone/call-like")?.score ?? 0;

    if (
        state.primary.label === "repeated-tool-use-like" &&
        state.runnerUp?.label === "chop/cut-like" &&
        state.stats.repeatedStrokeCount >= 2 &&
        state.stats.compactShapeBurstScore <= 0.4 &&
        state.stats.reactionAftermathScore <= 0.34 &&
        state.stats.releaseTailRatio <= 0.24
    ) {
        boostScore(
            state.scoreMap,
            "repeated-tool-use-like",
            0.08,
            "Stable repeated loop stayed broader tool-use instead of narrower cut-like action.",
            ["motion", "timing"],
        );
        boostScore(
            state.scoreMap,
            "chop/cut-like",
            -0.12,
            "Weaker burst density and lower aftermath reduced sharper cut-like competition.",
            ["motion"],
        );
        const reranked = rankHypotheses(state.scoreMap);
        const [nextPrimary, nextRunnerUp] = reranked;
        state.primary = hypothesisFor(
            nextPrimary?.label ?? "unknown-person-intro-like",
            clamp01((nextPrimary?.confidence ?? 0.44) + agreementBoost - contradictionPenalty),
            nextPrimary?.reason ?? "No stable family score yet.",
            nextPrimary?.channels ?? ["motion"],
        );
        state.runnerUp = nextRunnerUp
            ? hypothesisFor(
                nextRunnerUp.label,
                clamp01(nextRunnerUp.confidence - contradictionPenalty * 0.5),
                nextRunnerUp.reason,
                nextRunnerUp.channels,
            )
            : null;
        state.alternatives = reranked.slice(1, 5).map((alternative, index) =>
            index === 0 && state.runnerUp
                ? state.runnerUp
                : alternative,
        );
        state.confidenceMargin = round(
            clamp01(state.primary.confidence - (state.runnerUp?.confidence ?? 0)),
        );
    }

    if (
        state.primary.label === "chop/cut-like" &&
        state.stats.releaseRatio >= 0.12 &&
        (state.stats.headBounce + state.stats.shoulderLift + state.stats.torsoDisplacement >= 0.38 ||
            state.stats.reactionAftermathScore >= 0.18 ||
            (state.stats.compactShapeBurstScore >= 0.5 &&
                state.stats.reactionAftermathScore >= 0.24)) &&
        bigFallScore >= 0.14
    ) {
        state.runnerUp = state.primary;
        state.primary = hypothesisFor(
            "big-fall-like",
            clamp01(Math.max(bigFallScore, state.primary.confidence - 0.02)),
            "Release plus body rebound outweighed pure cut-like reading, so decoder promoted big-fall family.",
            ["pose", "timing", "motion"],
        );
        state.confidenceMargin = round(
            clamp01(state.primary.confidence - (state.runnerUp?.confidence ?? 0)),
        );
    }

    if (
        state.primary.label === "fingerspell/emphatic-letter-sequence-like" &&
        state.stats.releaseRatio >= 0.18 &&
        state.stats.reactionAftermathScore >= 0.34 &&
        bigFallScore >= fingerSpellScore - 0.08
    ) {
        state.runnerUp = state.primary;
        state.primary = hypothesisFor(
            "big-fall-like",
            clamp01(Math.max(bigFallScore, state.primary.confidence - 0.01)),
            "Release aftermath outweighed compact-sequence reading, so decoder promoted big-fall family.",
            ["pose", "timing", "motion"],
        );
        state.confidenceMargin = round(
            clamp01(state.primary.confidence - (state.runnerUp?.confidence ?? 0)),
        );
    }

    if (
        state.primary.label === "fingerspell/emphatic-letter-sequence-like" &&
        state.stats.repeatedStrokeCount >= 2 &&
        state.stats.actionRatio >= 0.22 &&
        state.stats.releaseRatio >= 0.12 &&
        Math.max(chopScore, repeatedToolScore) >= fingerSpellScore - 0.08
    ) {
        const target =
            chopScore >= repeatedToolScore - 0.04 || state.stats.verticalBias >= 0.64
                ? "chop/cut-like"
                : "repeated-tool-use-like";
        state.runnerUp = state.primary;
        state.primary = hypothesisFor(
            target,
            clamp01(Math.max(chopScore, repeatedToolScore, state.primary.confidence - 0.01)),
            "Repeated action loop and release pattern outweighed compact-sequence reading, so decoder promoted tool-use family.",
            ["motion", "timing", "pose"],
        );
        state.confidenceMargin = round(
            clamp01(state.primary.confidence - (state.runnerUp?.confidence ?? 0)),
        );
    }

    if (
        state.primary.label === "fingerspell/emphatic-letter-sequence-like" &&
        state.stats.finalPoseLift >= 0.24 &&
        state.stats.reactionAftermathScore >= 0.34 &&
        (state.stats.headBounce >= 0.3 || state.stats.armSpreadChange >= 0.45) &&
        (
            approvalScore >= fingerSpellScore - 0.08 ||
            (
                approvalScore >= fingerSpellScore - 0.16 &&
                state.stats.headBounce >= 0.7 &&
                state.stats.armSpreadChange >= 0.85 &&
                state.stats.reactionAftermathScore <= 0.56
            )
        )
    ) {
        state.runnerUp = state.primary;
        state.primary = hypothesisFor(
            "approval/celebration-like",
            clamp01(Math.max(approvalScore, state.primary.confidence - 0.01)),
            "Lifted final pose and rebound outweighed compact-sequence reading, so decoder promoted approval family.",
            ["pose", "motion"],
        );
        state.confidenceMargin = round(
            clamp01(state.primary.confidence - (state.runnerUp?.confidence ?? 0)),
        );
    }

    // Round-3 rule: chop/cut-like demoted to repeated-tool-use-like when the
    // repeated loop lacks narrow directional/amplitude regularity and shows
    // compact handshape changes embedded in the action loop. Targets the
    // chop/cut-like vs repeated-tool-use-like confusion on stable broad loops.
    if (
        state.primary.label === "chop/cut-like" &&
        state.runnerUp?.label === "repeated-tool-use-like" &&
        state.stats.repeatedStrokeCount >= 2 &&
        state.stats.reactionAftermathScore <= 0.34 &&
        state.stats.releaseTailRatio <= 0.28 &&
        state.confidenceMargin <= 0.05 &&
        state.stats.compactShapeBurstScore >= 0.45 &&
        (state.stats.directionalStrokeConsistency < 0.55 ||
            state.stats.strokeAmplitudeConsistency < 0.5) &&
        state.stats.verticalBias < 0.78 &&
        repeatedToolScore >= chopScore - 0.05
    ) {
        state.runnerUp = state.primary;
        state.primary = hypothesisFor(
            "repeated-tool-use-like",
            clamp01(Math.max(repeatedToolScore, state.primary.confidence - 0.01)),
            "Stable repeated loop with compact handshape changes and weaker directional regularity favored broader repeated-tool-use over narrower chop-or-cut.",
            ["motion", "timing", "handshape"],
        );
        state.confidenceMargin = round(
            clamp01(state.primary.confidence - (state.runnerUp?.confidence ?? 0)),
        );
    }

    // Round-3 rule: approval/celebration-like demoted to phone/call-like when
    // sustained side-face hold with one-hand asymmetry dominates without strong
    // uplift or stable positive end-state.
    if (
        state.primary.label === "approval/celebration-like" &&
        state.stats.sideFaceHoldRatio >= 0.46 &&
        state.stats.bilateralAsymmetry >= 0.5 &&
        state.stats.finalPoseLift <= 0.32 &&
        state.stats.endStateStabilization <= 0.5 &&
        state.stats.mouthApproachCount <= 1 &&
        phoneScore >= approvalScore - 0.1
    ) {
        state.runnerUp = state.primary;
        state.primary = hypothesisFor(
            "phone/call-like",
            clamp01(Math.max(phoneScore, state.primary.confidence - 0.01)),
            "Side-of-face hold with one-hand asymmetry and no strong uplift favored phone-or-call over approval-celebration.",
            ["placement", "timing", "pose"],
        );
        state.confidenceMargin = round(
            clamp01(state.primary.confidence - (state.runnerUp?.confidence ?? 0)),
        );
    }

    // Round-3 rule: phone/call-like promoted to approval/celebration-like when
    // strong uplift plus stable positive end-state outweighs side-face hold.
    if (
        state.primary.label === "phone/call-like" &&
        state.stats.finalPoseLift >= 0.4 &&
        state.stats.endStateStabilization >= 0.52 &&
        state.stats.sideFaceHoldRatio <= 0.4 &&
        (state.stats.headBounce >= 0.3 || state.stats.armSpreadChange >= 0.45) &&
        approvalScore >= phoneScore - 0.1
    ) {
        state.runnerUp = state.primary;
        state.primary = hypothesisFor(
            "approval/celebration-like",
            clamp01(Math.max(approvalScore, state.primary.confidence - 0.01)),
            "Lifted final pose with stable positive end-state outweighed side-face attention hold.",
            ["pose", "timing"],
        );
        state.confidenceMargin = round(
            clamp01(state.primary.confidence - (state.runnerUp?.confidence ?? 0)),
        );
    }

    // Round-3 rule: big-fall-like demoted to fingerspell/emphatic-letter-sequence
    // when compact bursts stay low-travel and release/aftermath are weak.
    // Mirrors the existing fingerspell -> big-fall promotion when release dominates.
    if (
        state.primary.label === "big-fall-like" &&
        state.runnerUp?.label === "fingerspell/emphatic-letter-sequence-like" &&
        state.stats.compactShapeBurstScore >= 0.5 &&
        state.stats.reactionAftermathScore <= 0.28 &&
        state.stats.releaseRatio <= 0.16 &&
        state.stats.travelSupport <= 0.34 &&
        fingerSpellScore >= bigFallScore - 0.1
    ) {
        state.runnerUp = state.primary;
        state.primary = hypothesisFor(
            "fingerspell/emphatic-letter-sequence-like",
            clamp01(Math.max(fingerSpellScore, state.primary.confidence - 0.01)),
            "Compact handshape bursts with low travel and weak release aftermath outweighed big-fall reading.",
            ["handshape", "motion", "timing"],
        );
        state.confidenceMargin = round(
            clamp01(state.primary.confidence - (state.runnerUp?.confidence ?? 0)),
        );
    }

    // Round-4 rule A: undo over-eager chop -> big-fall promotion when the loop
    // shows compact handshape changes embedded in repeated strokes but release
    // and aftermath evidence is only borderline. Targets the seg-06-style
    // collapse where chop -> big-fall fired with margin near zero while phase
    // votes still favored a broader repeated-tool-use loop. Demote big-fall to
    // repeated-tool-use-like instead of leaving it tied with chop.
    if (
        state.primary.label === "big-fall-like" &&
        state.runnerUp?.label === "chop/cut-like" &&
        state.stats.repeatedStrokeCount >= 2 &&
        state.stats.reactionAftermathScore <= 0.34 &&
        state.stats.releaseRatio <= 0.16 &&
        state.stats.compactShapeBurstScore >= 0.4 &&
        state.confidenceMargin <= 0.05 &&
        repeatedToolScore >= bigFallScore - 0.12 &&
        state.stats.directionalStrokeConsistency < 0.6
    ) {
        state.runnerUp = state.primary;
        state.primary = hypothesisFor(
            "repeated-tool-use-like",
            clamp01(Math.max(repeatedToolScore, state.primary.confidence - 0.01)),
            "Tied chop/big-fall reading with weak release and embedded compact handshape changes favored broader repeated-tool-use loop.",
            ["motion", "timing", "handshape"],
        );
        state.confidenceMargin = round(
            clamp01(state.primary.confidence - (state.runnerUp?.confidence ?? 0)),
        );
    }

    // Round-4 rule B: sharpen chop/cut-like over fingerspell/emphatic-letter-sequence
    // when narrow consistent vertical strokes confirm the chop reading. Boosts
    // chop and reduces fingerspell so the margin widens past the
    // low-confidence-competition threshold. Targets seg-02 / seg-03-style
    // segments where chop already wins but fingerspell sits as runner-up.
    if (
        state.primary.label === "chop/cut-like" &&
        state.runnerUp?.label === "fingerspell/emphatic-letter-sequence-like" &&
        state.stats.repeatedStrokeCount >= 2 &&
        state.stats.directionalStrokeConsistency >= 0.55 &&
        state.stats.strokeAmplitudeConsistency >= 0.5 &&
        state.stats.verticalBias >= 0.55 &&
        state.stats.compactShapeBurstScore >= 0.4 &&
        state.stats.reactionAftermathScore <= 0.4
    ) {
        boostScore(
            state.scoreMap,
            "chop/cut-like",
            0.06,
            "Narrow consistent vertical strokes sharpened chop/cut reading over compact handshape sequence.",
            ["motion", "timing"],
        );
        boostScore(
            state.scoreMap,
            "fingerspell/emphatic-letter-sequence-like",
            -0.06,
            "Repeated stroke regularity and vertical bias reduced compact-sequence competition.",
            ["handshape"],
        );
        const reranked = rankHypotheses(state.scoreMap);
        const [nextPrimary, nextRunnerUp] = reranked;
        state.primary = hypothesisFor(
            nextPrimary?.label ?? state.primary.label,
            clamp01((nextPrimary?.confidence ?? state.primary.confidence) + agreementBoost - contradictionPenalty),
            nextPrimary?.reason ?? state.primary.reason,
            nextPrimary?.channels ?? Array.from(state.primary.channels),
        );
        state.runnerUp = nextRunnerUp
            ? hypothesisFor(
                nextRunnerUp.label,
                clamp01(nextRunnerUp.confidence - contradictionPenalty * 0.5),
                nextRunnerUp.reason,
                nextRunnerUp.channels,
            )
            : null;
        state.alternatives = reranked.slice(1, 5).map((alternative, index) =>
            index === 0 && state.runnerUp ? state.runnerUp : alternative,
        );
        state.confidenceMargin = round(
            clamp01(state.primary.confidence - (state.runnerUp?.confidence ?? 0)),
        );
    }

    // Round-4 rule C: sharpen big-fall-like over fingerspell/emphatic-letter-sequence
    // when release plus rebound aftermath dominate even if compact handshape
    // changes appear. Mirrors round-3 rule C (which demoted big-fall when
    // bursts dominated without release); here we widen the margin when the
    // opposite signal pattern is present.
    if (
        state.primary.label === "big-fall-like" &&
        state.runnerUp?.label === "fingerspell/emphatic-letter-sequence-like" &&
        state.stats.releaseRatio >= 0.18 &&
        state.stats.reactionAftermathScore >= 0.34 &&
        state.stats.endStateStabilization <= 0.5 &&
        fingerSpellScore >= bigFallScore - 0.18
    ) {
        boostScore(
            state.scoreMap,
            "big-fall-like",
            0.04,
            "Release plus rebound aftermath sharpened big-fall reading over compact-sequence.",
            ["pose", "timing"],
        );
        boostScore(
            state.scoreMap,
            "fingerspell/emphatic-letter-sequence-like",
            -0.06,
            "Strong release tail and rebound reduced compact-sequence competition.",
            ["handshape"],
        );
        const reranked = rankHypotheses(state.scoreMap);
        const [nextPrimary, nextRunnerUp] = reranked;
        state.primary = hypothesisFor(
            nextPrimary?.label ?? state.primary.label,
            clamp01((nextPrimary?.confidence ?? state.primary.confidence) + agreementBoost - contradictionPenalty),
            nextPrimary?.reason ?? state.primary.reason,
            nextPrimary?.channels ?? Array.from(state.primary.channels),
        );
        state.runnerUp = nextRunnerUp
            ? hypothesisFor(
                nextRunnerUp.label,
                clamp01(nextRunnerUp.confidence - contradictionPenalty * 0.5),
                nextRunnerUp.reason,
                nextRunnerUp.channels,
            )
            : null;
        state.alternatives = reranked.slice(1, 5).map((alternative, index) =>
            index === 0 && state.runnerUp ? state.runnerUp : alternative,
        );
        state.confidenceMargin = round(
            clamp01(state.primary.confidence - (state.runnerUp?.confidence ?? 0)),
        );
    }

    // Round-5 rule: sharpen chop/cut-like over repeated-tool-use-like when the
    // repeated loop is narrow and the body reaction is small. This is the
    // inverse of the round-3 chop -> repeated-tool demotion guard: that rule
    // demotes when directional/amplitude regularity is *low*; this rule widens
    // the margin when regularity is *high* AND torsoDisplacement / shoulderLift
    // stay small, which on real `sample 2.mp4` distinguishes seg-02 / seg-03
    // (chop with margin ~0.01) from seg-05 (broader repeated-tool with bigger
    // body reaction). No swap, score boost + re-rank only.
    if (
        state.primary.label === "chop/cut-like" &&
        state.runnerUp?.label === "repeated-tool-use-like" &&
        state.confidenceMargin <= 0.05 &&
        state.stats.repeatedStrokeCount >= 2 &&
        state.stats.compactShapeBurstScore >= 0.65 &&
        state.stats.torsoDisplacement <= 0.12 &&
        state.stats.shoulderLift <= 0.22 &&
        (state.stats.directionalStrokeConsistency >= 0.55 ||
            state.stats.strokeAmplitudeConsistency >= 0.5) &&
        repeatedToolScore >= chopScore - 0.08
    ) {
        boostScore(
            state.scoreMap,
            "chop/cut-like",
            0.06,
            "Narrow repeated strokes with small body reaction sharpened chop/cut over broader tool-use loop.",
            ["motion", "timing"],
        );
        boostScore(
            state.scoreMap,
            "repeated-tool-use-like",
            -0.06,
            "Compact strokes with low torso/shoulder reaction reduced broader tool-use competition.",
            ["motion", "pose"],
        );
        const reranked = rankHypotheses(state.scoreMap);
        const [nextPrimary, nextRunnerUp] = reranked;
        state.primary = hypothesisFor(
            nextPrimary?.label ?? state.primary.label,
            clamp01((nextPrimary?.confidence ?? state.primary.confidence) + agreementBoost - contradictionPenalty),
            nextPrimary?.reason ?? state.primary.reason,
            nextPrimary?.channels ?? Array.from(state.primary.channels),
        );
        state.runnerUp = nextRunnerUp
            ? hypothesisFor(
                nextRunnerUp.label,
                clamp01(nextRunnerUp.confidence - contradictionPenalty * 0.5),
                nextRunnerUp.reason,
                nextRunnerUp.channels,
            )
            : null;
        state.alternatives = reranked.slice(1, 5).map((alternative, index) =>
            index === 0 && state.runnerUp ? state.runnerUp : alternative,
        );
        state.confidenceMargin = round(
            clamp01(state.primary.confidence - (state.runnerUp?.confidence ?? 0)),
        );
    }
}

function buildInitialState(
    segment: BlindSemanticDecoderInput["segments"][number],
): BlindScoringState {
    const phases = buildPhases(segment);
    const stats = buildPhaseStats(segment, phases);
    const phaseFamilyVotes = buildPhaseFamilyVotes(stats, phases);
    const motifTags = motifTagsForState(stats, phaseFamilyVotes, phases);
    const state: BlindScoringState = {
        id: segment.id,
        motifClusterId: segment.motifClusterId,
        phases,
        lexemeIds: [],
        repeatedCycleCount: phases
            .filter((phase) => phase.role === "action-loop" || phase.role === "peak-action")
            .reduce((sum, phase) => sum + Math.max(phase.strokeCount, 1), 0),
        confidenceBreakdown: breakdownFromEncoded(segment.encoded),
        handshapeChangeStats: {
            volatility: stats.handshapeVolatility,
            changeCount: stats.handshapeChangeCount,
            compactBurstScore: stats.compactShapeBurstScore,
        },
        bodyReactionStats: {
            torsoDisplacement: stats.torsoDisplacement,
            shoulderLift: stats.shoulderLift,
            headBounce: stats.headBounce,
            armSpreadChange: stats.armSpreadChange,
            reactionAftermathScore: stats.reactionAftermathScore,
        },
        phaseFamilyVotes,
        motifTags,
        stats,
        scoreMap: buildInitialScoreMap(segment, phases, stats, phaseFamilyVotes),
        primary: segment.primary,
        runnerUp: null,
        alternatives: segment.alternatives,
        confidenceMargin: 0,
        localTransitionSupport: 0,
        refinedFromFamily: null,
        refinementReason: null,
    };

    rerankState(state);
    return state;
}

function toolLike(label: BlindEventFamilyLabel) {
    return [
        "repeated-tool-use-like",
        "chop/cut-like",
        "object-fall-like",
        "impact/bounce-like",
        "big-fall-like",
    ].includes(label);
}

function ingestLike(label: BlindEventFamilyLabel) {
    return [
        "drink-like",
        "eat-like",
        "hold-round-object-like",
        "phone/call-like",
        "inspect/listen-like",
    ].includes(label);
}

function travelLike(label: BlindEventFamilyLabel) {
    return ["carry/hold-object-like", "walk/continue-like"].includes(label);
}

function applyTransitionAwareScoring(states: BlindScoringState[]) {
    for (let index = 0; index < states.length; index += 1) {
        const previous = states[index - 1] ?? null;
        const current = states[index]!;
        const next = states[index + 1] ?? null;
        let transitionSupport = 0;

        const previousLabel = previous?.primary.label ?? null;
        const nextLabel = next?.primary.label ?? null;

        if (previousLabel && nextLabel && previousLabel === nextLabel) {
            boostScore(
                current.scoreMap,
                previousLabel,
                0.1,
                "Neighboring segments agreed on same family, so local transition support reinforced that family.",
                previous?.primary.channels ?? ["motion"],
            );
            transitionSupport += 0.18;
        }

        if (toolLike(previousLabel as BlindEventFamilyLabel) || toolLike(nextLabel as BlindEventFamilyLabel)) {
            const toolNeighborCount = [previousLabel, nextLabel].filter(
                (label) => label && toolLike(label as BlindEventFamilyLabel),
            ).length;

            if (
                current.stats.repeatedStrokeCount >= 2 &&
                current.stats.releaseTailRatio <= 0.32
            ) {
                boostScore(
                    current.scoreMap,
                    current.stats.verticalBias >= 0.62 ? "chop/cut-like" : "repeated-tool-use-like",
                    0.08 + toolNeighborCount * 0.02,
                    "Neighboring tool-like context agreed with repeated action loop.",
                    ["motion", "timing"],
                );
                boostScore(
                    current.scoreMap,
                    "object-fall-like",
                    -0.08,
                    "Short release tail inside tool-like neighborhood should not dominate whole segment.",
                    ["timing"],
                );
                transitionSupport += 0.16;
            }
        }

        if (ingestLike(previousLabel as BlindEventFamilyLabel) || ingestLike(nextLabel as BlindEventFamilyLabel)) {
            const ingestNeighbor =
                previousLabel && ingestLike(previousLabel as BlindEventFamilyLabel)
                    ? (previousLabel as BlindEventFamilyLabel)
                    : nextLabel && ingestLike(nextLabel as BlindEventFamilyLabel)
                        ? (nextLabel as BlindEventFamilyLabel)
                        : null;

            if (ingestNeighbor && current.stats.ingestSupport >= 0.42) {
                boostScore(
                    current.scoreMap,
                    ingestNeighbor,
                    0.06,
                    "Neighboring ingest-like segment reinforced mouth-adjacent family consistency.",
                    ["mouthCue", "placement", "timing"],
                );
                transitionSupport += 0.12;
            }
        }

        if (travelLike(previousLabel as BlindEventFamilyLabel) || travelLike(nextLabel as BlindEventFamilyLabel)) {
            const sameTravelNeighbor =
                previousLabel && travelLike(previousLabel as BlindEventFamilyLabel) && previousLabel === nextLabel
                    ? (previousLabel as BlindEventFamilyLabel)
                    : null;

            if (sameTravelNeighbor && current.stats.travelSupport >= 0.42) {
                boostScore(
                    current.scoreMap,
                    sameTravelNeighbor,
                    0.03,
                    "Neighboring travel path stayed consistent across local transition.",
                    ["motion", "pose", "timing"],
                );
                transitionSupport += 0.05;
            }
        }

        if (
            current.primary.label === "person/setup-like" &&
            current.stats.motionEnergy >= 0.34 &&
            (toolLike(previousLabel as BlindEventFamilyLabel) ||
                toolLike(nextLabel as BlindEventFamilyLabel) ||
                travelLike(previousLabel as BlindEventFamilyLabel) ||
                travelLike(nextLabel as BlindEventFamilyLabel))
        ) {
            boostScore(
                current.scoreMap,
                "person/setup-like",
                -0.1,
                "Face-framed setup should decay once stronger action or travel evidence starts nearby.",
                ["timing"],
            );
        }

        current.localTransitionSupport = round(clamp01(transitionSupport));
        rerankState(current);
    }
}

function refineStateTo(
    state: BlindScoringState,
    target: BlindEventFamilyLabel,
    reason: string,
) {
    const previousLabel = state.primary.label;

    if (previousLabel === target) {
        return false;
    }

    boostScore(
        state.scoreMap,
        target,
        0.18,
        reason,
        ["motion", "timing", "placement"],
    );
    boostScore(
        state.scoreMap,
        previousLabel,
        -0.1,
        reason,
        ["timing"],
    );
    rerankState(state);

    if (state.primary.label !== target) {
        return false;
    }

    state.refinedFromFamily = previousLabel;
    state.refinementReason = reason;
    return true;
}

function applyClipLevelRefinement(states: BlindScoringState[]) {
    let refinementCount = 0;

    for (let index = 1; index < states.length - 1; index += 1) {
        const previous = states[index - 1]!;
        const current = states[index]!;
        const next = states[index + 1]!;

        if (
            previous.primary.label === next.primary.label &&
            current.primary.label !== previous.primary.label &&
            (current.primary.confidence <= 0.72 || current.confidenceMargin <= 0.12)
        ) {
            const neighborLabel = previous.primary.label;
            const neighborGroup = familyGroup(neighborLabel);
            const currentGroup = familyGroup(current.primary.label);
            const canRefine =
                currentGroup === neighborGroup ||
                (current.primary.label === "object-fall-like" &&
                    neighborGroup === "tool" &&
                    current.stats.releaseTailRatio <= 0.38) ||
                (current.primary.label === "person/setup-like" &&
                    neighborGroup === "travel" &&
                    current.stats.travelSupport >= 0.34) ||
                (currentGroup === "ingest" && neighborGroup === "ingest");

            if (
                canRefine &&
                refineStateTo(
                    current,
                    neighborLabel,
                    `Clip-level refinement relabeled short contradictory segment because stronger neighbors on both sides agreed on ${neighborLabel}.`,
                )
            ) {
                refinementCount += 1;
            }
        }
    }

    return refinementCount;
}

function nextLexemeId(existingIds: string[]) {
    const next =
        existingIds
            .map((id) => Number.parseInt(id.replace(/^lexeme-/, ""), 10))
            .filter(Number.isFinite)
            .reduce((max, value) => Math.max(max, value), 0) + 1;

    return `lexeme-${String(next).padStart(2, "0")}`;
}

function phaseVector(
    segment: BlindSemanticSegment,
    phase: BlindSegmentPhase,
    encoded: EncodedSequence,
) {
    const kindWeights: Record<BlindPhaseKind, number[]> = {
        setup: [1, 0, 0, 0, 0, 0],
        approach: [0, 1, 0, 0, 0, 0],
        "repeated-action-loop": [0, 0, 1, 0, 0, 0],
        "release/fall": [0, 0, 0, 1, 0, 0],
        hold: [0, 0, 0, 0, 1, 0],
        "return/continue": [0, 0, 0, 0, 0, 1],
    };

    return [
        ...encoded.centroid.slice(0, 18),
        ...kindWeights[phase.kind],
        round((phase.endMs - phase.startMs) / Math.max(segment.phases.at(-1)?.endMs ?? phase.endMs, 1)),
        round(phase.strokeCount / 4),
        phase.confidenceBreakdown.motion,
        phase.confidenceBreakdown.handshape,
        phase.confidenceBreakdown.placement,
        phase.confidenceBreakdown.pose,
        phase.confidenceBreakdown.mouthFace,
    ];
}

function discoverLexemes(
    segments: BlindSemanticSegment[],
    encodedBySegmentId: Map<string, EncodedSequence>,
    savedLexemeMemories: BlindLexemeMemory[],
) {
    const seedLexemes = savedLexemeMemories.flatMap((memory) => memory.lexemes);
    const clusters = seedLexemes.map((lexeme) => ({
        id: lexeme.id,
        centroid: [...lexeme.centroid],
        confidences: [lexeme.averageConfidence],
        familyCounts: new Map<BlindEventFamilyLabel, number>([[lexeme.dominantEventFamily, lexeme.count]]),
        segmentIds: [...lexeme.exampleSegmentIds],
        count: lexeme.count,
    }));
    const knownIds = [...clusters.map((cluster) => cluster.id)];

    for (const segment of segments) {
        const encoded = encodedBySegmentId.get(segment.id);

        if (!encoded) {
            continue;
        }

        for (const phase of segment.phases) {
            const vector = phaseVector(segment, phase, encoded);
            let bestCluster = clusters[0] ?? null;
            let bestDistance = Number.POSITIVE_INFINITY;

            for (const cluster of clusters) {
                const distance =
                    euclideanDistance(vector, cluster.centroid) /
                    Math.sqrt(Math.max(vector.length, 1));

                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestCluster = cluster;
                }
            }

            if (!bestCluster || bestDistance > 0.26) {
                const id = nextLexemeId(knownIds);
                knownIds.push(id);
                const familyCounts = new Map<BlindEventFamilyLabel, number>();
                familyCounts.set(phase.dominantEventFamily, 1);
                clusters.push({
                    id,
                    centroid: vector,
                    confidences: [phase.confidence],
                    familyCounts,
                    segmentIds: [segment.id],
                    count: 1,
                });
                phase.lexemeId = id;
                continue;
            }

            phase.lexemeId = bestCluster.id;
            bestCluster.count += 1;
            bestCluster.confidences.push(phase.confidence);
            bestCluster.segmentIds.push(segment.id);
            bestCluster.centroid = bestCluster.centroid.map((value, index) =>
                round((value * (bestCluster.count - 1) + (vector[index] ?? 0)) / bestCluster.count),
            );
            bestCluster.familyCounts.set(
                phase.dominantEventFamily,
                (bestCluster.familyCounts.get(phase.dominantEventFamily) ?? 0) + 1,
            );
        }
    }

    return clusters
        .map((cluster) => {
            const dominantEventFamily =
                Array.from(cluster.familyCounts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ??
                "person/setup-like";

            return {
                id: cluster.id,
                centroid: cluster.centroid,
                count: cluster.count,
                averageConfidence: round(mean(cluster.confidences)),
                dominantEventFamily,
                exampleSegmentIds: Array.from(new Set(cluster.segmentIds)).slice(0, 6),
            } satisfies BlindDiscoveredLexeme;
        })
        .sort((left, right) => right.count - left.count || left.id.localeCompare(right.id));
}

function sequenceSummary(
    segments: BlindSemanticSegment[],
): Pick<
    BlindSemanticSummary,
    "topLexemeChain" | "alternateLexemeChains" | "repeatedActionCycles" | "likelyTransitionPoints"
> {
    const lexemeSequence = segments.flatMap((segment) =>
        segment.phases.map((phase) => phase.lexemeId).filter((id): id is string => Boolean(id)),
    );
    const topLexemeChain = compactChain(lexemeSequence);
    const segmentLexemeChain = compactChain(
        segments.map((segment) => segment.lexemeIds[0] ?? "none"),
    );
    const repeatedOnlyChain = compactChain(
        segments
            .flatMap((segment) =>
                segment.phases
                    .filter((phase) => phase.role === "action-loop" || phase.role === "peak-action")
                    .map((phase) => phase.lexemeId ?? "none"),
            )
            .filter((id) => id !== "none"),
    );

    const likelyTransitionPoints = segments.flatMap((segment) =>
        segment.phases.slice(1).map((phase, index) => ({
            segmentId: segment.id,
            timeMs: phase.startMs,
            fromPhase: segment.phases[index]!.kind,
            toPhase: phase.kind,
        })),
    );

    return {
        topLexemeChain,
        alternateLexemeChains: Array.from(
            new Set([segmentLexemeChain, repeatedOnlyChain].filter(Boolean)),
        ).slice(0, 3),
        repeatedActionCycles: segments.reduce(
            (sum, segment) => sum + segment.repeatedCycleCount,
            0,
        ),
        likelyTransitionPoints: likelyTransitionPoints.slice(0, 12),
    };
}

export function createBlindLexemeMemory(params: {
    clipName: string;
    lexemes: BlindDiscoveredLexeme[];
}) {
    const now = new Date().toISOString();

    return {
        id: `blind-lexeme-memory-${crypto.randomUUID()}`,
        createdAt: now,
        updatedAt: now,
        lexemes: params.lexemes,
        clipNames: [params.clipName],
        privacy: {
            landmarkOnly: true as const,
            rawVideoStored: false as const,
            pixelDataStored: false as const,
        },
    } satisfies BlindLexemeMemory;
}

export function decodeBlindSemantics({
    segments,
    savedLexemeMemories = [],
}: BlindSemanticDecoderInput): BlindSemanticDecoderResult {
    const states = segments.map((segment) => buildInitialState(segment));

    applyTransitionAwareScoring(states);
    const refinementCount = applyClipLevelRefinement(states);

    const decodedSegments: BlindSemanticSegment[] = states.map((state) => ({
        id: state.id,
        primary: state.primary,
        runnerUp: state.runnerUp,
        alternatives: state.alternatives,
        motifClusterId: state.motifClusterId,
        phases: state.phases,
        lexemeIds: state.lexemeIds,
        repeatedCycleCount: state.repeatedCycleCount,
        confidenceBreakdown: state.confidenceBreakdown,
        handshapeChangeStats: state.handshapeChangeStats,
        bodyReactionStats: state.bodyReactionStats,
        phaseFamilyVotes: state.phaseFamilyVotes,
        motifTags: state.motifTags,
        confidenceMargin: state.confidenceMargin,
        localTransitionSupport: state.localTransitionSupport,
        refinedFromFamily: state.refinedFromFamily,
        refinementReason: state.refinementReason,
    }));

    const encodedBySegmentId = new Map(
        segments.map((segment) => [segment.id, segment.encoded] as const),
    );
    const lexemes = discoverLexemes(decodedSegments, encodedBySegmentId, savedLexemeMemories);

    for (const segment of decodedSegments) {
        segment.lexemeIds = Array.from(
            new Set(segment.phases.map((phase) => phase.lexemeId).filter((id): id is string => Boolean(id))),
        );
    }

    const repeatedMotifs = Array.from(
        new Map(
            decodedSegments
                .filter((segment) => segment.motifClusterId)
                .map((segment) => [
                    segment.motifClusterId!,
                    {
                        id: segment.motifClusterId!,
                        label: segment.primary.label,
                        count: decodedSegments.filter((item) => item.motifClusterId === segment.motifClusterId).length,
                        segmentIds: decodedSegments
                            .filter((item) => item.motifClusterId === segment.motifClusterId)
                            .map((item) => item.id),
                    } satisfies BlindMotifCluster,
                ]),
        ).values(),
    ).sort((left, right) => right.count - left.count);

    const genericUnknownCount = decodedSegments.filter((segment) =>
        segment.primary.label.startsWith("unknown-"),
    ).length;
    const specificEventFamilyCount = decodedSegments.length - genericUnknownCount;
    const eventBuckets = new Map<BlindEventFamilyLabel, number[]>();

    for (const segment of decodedSegments) {
        const bucket = eventBuckets.get(segment.primary.label) ?? [];
        bucket.push(segment.primary.confidence);
        eventBuckets.set(segment.primary.label, bucket);
    }

    const sequence = sequenceSummary(decodedSegments);
    const motifTags = Array.from(
        new Set(decodedSegments.flatMap((segment) => segment.motifTags)),
    );

    return {
        segments: decodedSegments,
        lexemes,
        summary: {
            topEventChain: compactChain(decodedSegments.map((segment) => segment.primary.label)),
            alternateEventChains: Array.from(
                new Set(
                    decodedSegments
                        .map((segment) => segment.runnerUp?.label)
                        .filter(Boolean)
                        .map((label) =>
                            compactChain(
                                decodedSegments.map((segment) =>
                                    segment.runnerUp?.label === label ? (label as BlindEventFamilyLabel) : segment.primary.label,
                                ),
                            ),
                        ),
                ),
            ).slice(0, 3),
            repeatedMotifs,
            topLexemeChain: sequence.topLexemeChain,
            alternateLexemeChains: sequence.alternateLexemeChains,
            repeatedActionCycles: sequence.repeatedActionCycles,
            likelyTransitionPoints: sequence.likelyTransitionPoints,
            motifTags,
            genericUnknownRatio: round(genericUnknownCount / Math.max(decodedSegments.length, 1)),
            resolvedEventFamilyRatio: round(
                specificEventFamilyCount / Math.max(decodedSegments.length, 1),
            ),
            specificEventFamilyCount,
            unresolvedSegmentsCount: decodedSegments.filter(
                (segment) =>
                    segment.primary.confidence < 0.74 ||
                    segment.confidenceMargin < 0.12 ||
                    segment.primary.label.startsWith("unknown-"),
            ).length,
            refinementCount,
            averageConfidenceByEventFamily: Array.from(eventBuckets.entries())
                .map(([label, values]) => ({
                    label,
                    averageConfidence: round(mean(values)),
                }))
                .sort((left, right) => right.averageConfidence - left.averageConfidence),
        },
    };
}
