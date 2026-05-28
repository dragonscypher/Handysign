/**
 * Tiny pretrained-style sign vocab model.
 *
 * Architecture:
 *  - Featurize a blind-export segment into a fixed-length numeric vector.
 *  - Run a linear classifier (per-vocab dot(weights, features) + bias).
 *  - Softmax over vocab → top-K English glosses with probabilities.
 *
 * The "weights" are bundled as JSON (sign-vocab-mvp.json). They are tuned to
 * match public ASL family→gloss frequency priors so the pipeline behaves like
 * a real (small) pretrained head; the same wrapper can later load a real
 * ONNX / WASM-served softmax head without changing the rest of the app.
 *
 * Privacy contract:
 *  - Pure in-process computation. No fetch(), no network.
 *  - Reads only features the blind export already exposes locally.
 *  - Never inspects rawVideo / pixelData / answer keys.
 */

import type { BlindExportLike } from "@/lib/labels/labelPack";
import learnedSubsetWeights from "./sign-vocab-learned-subset.json";
import bundledWeights from "./sign-vocab-mvp.json";

export interface SignVocabEntry {
    gloss: string;
    bias: number;
    weights: Record<string, number>;
    priorConcept?: string;
}

export interface SignVocabModel {
    id: string;
    version: number;
    description: string;
    createdAt: string;
    featureNames: string[];
    calibration?: {
        temperature?: number;
        primaryFamilyBoost?: number;
        runnerUpFamilyBoost?: number;
        familyMismatchPenalty?: number;
    };
    deployment?: {
        status?: "active" | "candidate" | "blocked";
        activeFallbackModelId?: string;
        blocker?: string;
    };
    training?: Record<string, unknown>;
    vocab: SignVocabEntry[];
}

export interface SegmentFeatureVector {
    /** Sparse map: featureName → value. Missing names default to 0. */
    values: Record<string, number>;
}

export interface VocabPrediction {
    gloss: string;
    probability: number;
}

interface BlindSegmentDetail {
    id: string;
    startMs: number;
    endMs: number;
    eventFamilyHypothesis: string;
    runnerUpFamily: string | null;
    confidenceMargin: number;
    qualitySignals?: {
        handVisibleRatio?: number;
        faceVisibleRatio?: number;
        motionEnergy?: number;
        mouthStability?: number;
    };
    bodyReactionStats?: {
        torsoDisplacement?: number;
        shoulderLift?: number;
        headBounce?: number;
        reactionAftermathScore?: number;
    };
    handshapeChangeStats?: {
        volatility?: number;
        compactBurstScore?: number;
    };
    motifTags?: string[];
    phases?: Array<{ kind?: string; role?: string }>;
}

function safeNumber(value: unknown, fallback = 0): number {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function clamp01(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
}

/** Build a feature vector for a single blind segment. */
export function buildSegmentFeatures(
    segment: BlindExportLike["segments"][number],
): SegmentFeatureVector {
    const seg = segment as unknown as BlindSegmentDetail;
    const quality = seg.qualitySignals ?? {};
    const body = seg.bodyReactionStats ?? {};
    const hand = seg.handshapeChangeStats ?? {};
    const phases = Array.isArray(seg.phases) ? seg.phases : [];

    let setupCount = 0;
    let strokeCount = 0;
    let recoveryCount = 0;
    let releaseCount = 0;
    let holdCount = 0;
    let repeatedLoopCount = 0;
    for (const phase of phases) {
        const kind = String(phase.kind ?? phase.role ?? "");
        if (kind.includes("setup")) setupCount++;
        if (kind.includes("repeated-action-loop")) repeatedLoopCount++;
        if (kind.includes("stroke") || kind.includes("hold") || kind.includes("repeated-action-loop")) strokeCount++;
        if (kind.includes("hold")) holdCount++;
        if (kind.includes("release") || kind.includes("fall")) releaseCount++;
        if (kind.includes("return") || kind.includes("recovery") || kind.includes("continue")) recoveryCount++;
    }
    const phaseTotal = Math.max(1, phases.length);
    const margin = safeNumber(seg.confidenceMargin);

    const values: Record<string, number> = {
        bias: 1,
        margin,
        lowBlindMargin: clamp01((0.1 - margin) / 0.1),
        veryLowBlindMargin: clamp01((0.05 - margin) / 0.05),
        strongBlindMargin: clamp01(margin / 0.25),
        mouthFaceStrength: safeNumber(quality.faceVisibleRatio, 1) * safeNumber(quality.mouthStability, 0.5),
        handVisibility: safeNumber(quality.handVisibleRatio, 1),
        motionEnergy: safeNumber(quality.motionEnergy),
        headBounce: safeNumber(body.headBounce),
        shoulderLift: safeNumber(body.shoulderLift),
        torsoDisplacement: safeNumber(body.torsoDisplacement),
        reactionAftermath: safeNumber(body.reactionAftermathScore),
        handshapeVolatility: safeNumber(hand.volatility),
        compactBurst: safeNumber(hand.compactBurstScore),
        phaseSetupRatio: setupCount / phaseTotal,
        phaseStrokeRatio: strokeCount / phaseTotal,
        phaseRecoveryRatio: recoveryCount / phaseTotal,
        phaseReleaseRatio: releaseCount / phaseTotal,
        phaseHoldRatio: holdCount / phaseTotal,
        phaseRepeatedLoopRatio: repeatedLoopCount / phaseTotal,
    };

    const family = seg.eventFamilyHypothesis;
    if (family) {
        values[`family.${family}`] = 1;
        values[`primaryFamily.${family}`] = 1;
    }
    const runnerUp = seg.runnerUpFamily;
    if (runnerUp) values[`family.${runnerUp}`] = (values[`family.${runnerUp}`] ?? 0) + 0.4;
    if (runnerUp) values[`runnerUpFamily.${runnerUp}`] = 1;
    for (const tag of Array.isArray(seg.motifTags) ? seg.motifTags : []) {
        values[`motif.${tag}`] = 1;
    }

    return { values };
}

/** Score a feature vector against the linear classifier head. */
export function scoreSegment(
    model: SignVocabModel,
    features: SegmentFeatureVector,
): VocabPrediction[] {
    const activeFamilies = getActiveFamilies(features);
    const temperature = Math.max(0.1, model.calibration?.temperature ?? 1);
    const logits = model.vocab.map((entry) => {
        let logit = entry.bias;
        for (const [name, weight] of Object.entries(entry.weights)) {
            logit += weight * (features.values[name] ?? 0);
        }
        logit += familyCalibrationLogit(model, entry, activeFamilies);
        logit /= temperature;
        return { gloss: entry.gloss, logit };
    });
    const maxLogit = logits.reduce((m, x) => (x.logit > m ? x.logit : m), -Infinity);
    let denom = 0;
    const exps = logits.map(({ gloss, logit }) => {
        const ex = Math.exp(logit - maxLogit);
        denom += ex;
        return { gloss, ex };
    });
    if (!Number.isFinite(denom) || denom === 0) {
        return model.vocab.map((entry) => ({ gloss: entry.gloss, probability: 1 / model.vocab.length }));
    }
    return exps
        .map(({ gloss, ex }) => ({ gloss, probability: ex / denom }))
        .sort((a, b) => b.probability - a.probability);
}

function getActiveFamilies(features: SegmentFeatureVector): Array<{
    family: string;
    strength: number;
}> {
    return Object.entries(features.values)
        .filter(([name, value]) => name.startsWith("family.") && value > 0)
        .map(([name, strength]) => ({
            family: name.slice("family.".length),
            strength,
        }))
        .sort((a, b) => b.strength - a.strength);
}

function familyCalibrationLogit(
    model: SignVocabModel,
    entry: SignVocabEntry,
    activeFamilies: Array<{ family: string; strength: number }>,
): number {
    const familyWeights = Object.entries(entry.weights).filter(([name]) =>
        name.startsWith("family."),
    );
    if (familyWeights.length === 0 || activeFamilies.length === 0) return 0;

    const primary = activeFamilies[0];
    const primaryWeight = entry.weights[`family.${primary.family}`] ?? 0;
    if (primaryWeight > 0) {
        return model.calibration?.primaryFamilyBoost ?? 0;
    }

    const runnerUpMatch = activeFamilies
        .slice(1)
        .some(({ family }) => (entry.weights[`family.${family}`] ?? 0) > 0);
    if (runnerUpMatch) {
        return model.calibration?.runnerUpFamilyBoost ?? 0;
    }

    return model.calibration?.familyMismatchPenalty ?? 0;
}

let bundledModelCache: SignVocabModel | null = null;
let learnedSubsetModelCache: SignVocabModel | null = null;

function assertUsableModel(model: SignVocabModel, label: string): void {
    if (!Array.isArray(model.vocab) || model.vocab.length === 0) {
        throw new Error(`${label} sign vocab model is empty`);
    }
}

/** Returns the bundled MVP model. Cached after first call. */
export function loadBundledSignVocabModel(): SignVocabModel {
    if (bundledModelCache) return bundledModelCache;
    const model = bundledWeights as unknown as SignVocabModel;
    assertUsableModel(model, "Bundled active");
    bundledModelCache = model;
    return model;
}

/** Returns the local learned subset probe candidate. It is not active by default. */
export function loadBundledLearnedSubsetModel(): SignVocabModel {
    if (learnedSubsetModelCache) return learnedSubsetModelCache;
    const model = learnedSubsetWeights as unknown as SignVocabModel;
    assertUsableModel(model, "Bundled learned subset candidate");
    learnedSubsetModelCache = model;
    return model;
}

/** Lists bundled local heads in evaluation order: candidate first, active fallback second. */
export function listBundledSignVocabModels(): SignVocabModel[] {
    return [loadBundledLearnedSubsetModel(), loadBundledSignVocabModel()];
}
