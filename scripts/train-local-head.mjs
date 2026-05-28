#!/usr/bin/env node
/**
 * Train a tiny local learned subset head from privacy-safe artifacts.
 *
 * Inputs:
 *   - canonical sample-2 real-browser blind export (landmarks/blind features)
 *   - latest sample-2 Train-mode lexicon artifact (local labels by family)
 *
 * Explicitly does NOT read sample 3, human transcripts, expected references,
 * answer keys, raw video, pixels, or frames. The output is a candidate local
 * linear probe; it must pass structural sample-3 gates before becoming active.
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
const today = new Date().toISOString().slice(0, 10);

const ARTIFACT_DIR = resolve(repoRoot, "docs/artifacts");
const CANONICAL_SAMPLE2_EXPORT = resolve(
    ARTIFACT_DIR,
    "sample2-blind-after-round5-real-2026-04-26.json",
);
const ACTIVE_MODEL_PATH = resolve(
    repoRoot,
    "src/lib/recognition/pretrained/sign-vocab-mvp.json",
);
const OUT_MODEL_PATH = resolve(
    repoRoot,
    "src/lib/recognition/pretrained/sign-vocab-learned-subset.json",
);

const ACTIVATION_MINIMUMS = {
    trainingSets: 2,
    labeledSegments: 24,
    uniqueFamilies: 8,
    uniqueLabels: 10,
    uniqueConcepts: 6,
};

const FORBIDDEN_KEYS = new Set([
    "rawVideo",
    "pixelData",
    "frames",
    "imageBytes",
    "expectedReference",
    "answerKey",
]);

function assertNoForbidden(value, path = "$", forbidden = FORBIDDEN_KEYS) {
    if (Array.isArray(value)) {
        value.forEach((item, index) => assertNoForbidden(item, `${path}[${index}]`, forbidden));
        return;
    }
    if (value === null || typeof value !== "object") return;
    for (const key of Object.keys(value)) {
        if (forbidden.has(key)) {
            throw new Error(`Forbidden key ${key} at ${path}`);
        }
        assertNoForbidden(value[key], `${path}.${key}`, forbidden);
    }
}

function latestSample2LexiconPath() {
    const candidates = readdirSync(ARTIFACT_DIR)
        .filter((name) => /^sample2-adaptation-pack-\d{4}-\d{2}-\d{2}\.json$/.test(name))
        .sort();
    const latest = candidates.at(-1);
    if (!latest) {
        throw new Error("No sample2-adaptation-pack-YYYY-MM-DD.json artifact found.");
    }
    return resolve(ARTIFACT_DIR, latest);
}

function latestTrainingManifestPath() {
    const candidates = readdirSync(ARTIFACT_DIR)
        .filter((name) => /^local-head-training-manifest-\d{4}-\d{2}-\d{2}\.json$/.test(name))
        .sort();
    const latest = candidates.at(-1);
    return latest ? resolve(ARTIFACT_DIR, latest) : null;
}

function repoRelativePath(path) {
    return path.replace(`${repoRoot}\\`, "").replaceAll("\\", "/");
}

function resolveRepoRelativePath(value, label) {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error(`${label} must be a non-empty relative path.`);
    }
    if (/^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\")) {
        throw new Error(`${label} must not be an absolute local path.`);
    }
    const resolved = resolve(repoRoot, value);
    if (!resolved.toLowerCase().startsWith(repoRoot.toLowerCase())) {
        throw new Error(`${label} must stay inside the repo.`);
    }
    return resolved;
}

function loadTrainingPlan() {
    const manifestPath = latestTrainingManifestPath();
    if (!manifestPath) {
        const lexiconPath = latestSample2LexiconPath();
        return {
            manifestPath: null,
            manifest: null,
            trainingSets: [
                {
                    id: "legacy-sample2-train-mode",
                    blindExport: repoRelativePath(CANONICAL_SAMPLE2_EXPORT),
                    lexicon: repoRelativePath(lexiconPath),
                    role: "legacy-default",
                },
            ],
        };
    }

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    assertNoForbidden(manifest, "trainingManifest", new Set([...FORBIDDEN_KEYS, "transcript"]));
    const trainingSets = Array.isArray(manifest.trainingSets) ? manifest.trainingSets : [];
    if (trainingSets.length === 0) {
        throw new Error(`${repoRelativePath(manifestPath)} has no trainingSets.`);
    }
    return { manifestPath, manifest, trainingSets };
}

function normalizeLexiconEntries(lexicon, sourceId) {
    return (lexicon.entries ?? [])
        .filter((entry) => entry.split !== "ignore" && entry.label)
        .map((entry) => {
            const segmentIds = new Set();
            if (typeof entry.segmentId === "string") segmentIds.add(entry.segmentId);
            for (const segmentId of Array.isArray(entry.segmentIds) ? entry.segmentIds : []) {
                if (typeof segmentId === "string") segmentIds.add(segmentId);
            }
            return {
                sourceId,
                id: entry.id ?? null,
                label: entry.label,
                familyHint: entry.familyHint ?? null,
                conceptHint: entry.conceptHint || "unknown",
                split: entry.split ?? "unspecified",
                exampleCount: safeNumber(entry.exampleCount, 1),
                segmentIds: [...segmentIds],
            };
        });
}

function entryPriority(entry) {
    const splitPriority = entry.split === "calibration" ? 2 : entry.split === "holdout" ? 1 : 0;
    return [entry.exampleCount, splitPriority, entry.label];
}

function compareEntries(a, b) {
    const left = entryPriority(a);
    const right = entryPriority(b);
    if (right[0] !== left[0]) return right[0] - left[0];
    if (right[1] !== left[1]) return right[1] - left[1];
    return String(left[2]).localeCompare(String(right[2]));
}

function chooseSegmentEntry(entries, segment) {
    const exactMatches = entries.filter((entry) => entry.segmentIds.includes(segment.id));
    if (exactMatches.length > 0) {
        return {
            entry: exactMatches.sort(compareEntries)[0],
            resolution: "segment-id",
            ambiguousFamilyLabels: [],
        };
    }

    const familyMatches = entries.filter((entry) => entry.familyHint === segment.eventFamilyHypothesis);
    if (familyMatches.length === 0) return null;
    const labelOptions = [...new Set(familyMatches.map((entry) => entry.label))];
    return {
        entry: familyMatches.sort(compareEntries)[0],
        resolution: "family-hint",
        ambiguousFamilyLabels: labelOptions.length > 1 ? labelOptions : [],
    };
}

function safeNumber(value, fallback = 0) {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function clamp01(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
}

function featuresFor(segment) {
    const quality = segment.qualitySignals ?? {};
    const body = segment.bodyReactionStats ?? {};
    const hand = segment.handshapeChangeStats ?? {};
    const phases = Array.isArray(segment.phases) ? segment.phases : [];
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
    const margin = safeNumber(segment.confidenceMargin);
    const values = {
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

    if (segment.eventFamilyHypothesis) {
        values[`family.${segment.eventFamilyHypothesis}`] = 1;
    }
    if (segment.runnerUpFamily) {
        const key = `family.${segment.runnerUpFamily}`;
        values[key] = (values[key] ?? 0) + 0.4;
        values[`runnerUpFamily.${segment.runnerUpFamily}`] = 1;
    }
    for (const tag of Array.isArray(segment.motifTags) ? segment.motifTags : []) {
        values[`motif.${tag}`] = 1;
    }
    return values;
}

function softmax(logits) {
    const maxLogit = logits.reduce((max, value) => Math.max(max, value), -Infinity);
    const exps = logits.map((value) => Math.exp(value - maxLogit));
    const denom = exps.reduce((sum, value) => sum + value, 0);
    return exps.map((value) => value / denom);
}

function trainMultinomialLogisticRegression(examples, classLabels, featureNames) {
    const classCount = classLabels.length;
    const featureCount = featureNames.length;
    const weights = Array.from({ length: classCount }, () => Array(featureCount).fill(0));
    const biases = Array(classCount).fill(0);
    const epochs = 2200;
    const baseLearningRate = 0.45;
    const l2 = 0.015;

    for (let epoch = 0; epoch < epochs; epoch++) {
        const gradWeights = Array.from({ length: classCount }, () => Array(featureCount).fill(0));
        const gradBiases = Array(classCount).fill(0);

        for (const example of examples) {
            const logits = weights.map(
                (classWeights, classIndex) =>
                    biases[classIndex] +
                    classWeights.reduce((sum, weight, featureIndex) => sum + weight * example.x[featureIndex], 0),
            );
            const probabilities = softmax(logits);
            for (let classIndex = 0; classIndex < classCount; classIndex++) {
                const expected = classLabels[classIndex] === example.label ? 1 : 0;
                const error = probabilities[classIndex] - expected;
                gradBiases[classIndex] += error;
                for (let featureIndex = 0; featureIndex < featureCount; featureIndex++) {
                    gradWeights[classIndex][featureIndex] += error * example.x[featureIndex];
                }
            }
        }

        const learningRate = baseLearningRate / (1 + epoch / 900);
        const invCount = 1 / examples.length;
        for (let classIndex = 0; classIndex < classCount; classIndex++) {
            biases[classIndex] -= learningRate * gradBiases[classIndex] * invCount;
            for (let featureIndex = 0; featureIndex < featureCount; featureIndex++) {
                const regularizedGradient = gradWeights[classIndex][featureIndex] * invCount + l2 * weights[classIndex][featureIndex];
                weights[classIndex][featureIndex] -= learningRate * regularizedGradient;
            }
        }
    }

    return { weights, biases };
}

function roundWeight(value) {
    const rounded = Number(value.toFixed(6));
    return Object.is(rounded, -0) ? 0 : rounded;
}

function main() {
    const activeModel = JSON.parse(readFileSync(ACTIVE_MODEL_PATH, "utf8"));
    const trainingPlan = loadTrainingPlan();
    const featureNames = activeModel.featureNames.filter((name) => typeof name === "string");
    const labeledSegments = [];
    const trainingSetSummaries = [];
    const labelOrder = [];
    const allLexiconLabels = new Set();
    const ambiguousFamilyLabels = [];

    for (const set of trainingPlan.trainingSets) {
        const sourceId = typeof set.id === "string" && set.id ? set.id : `training-set-${trainingSetSummaries.length + 1}`;
        const blindExportPath = resolveRepoRelativePath(set.blindExport, `${sourceId}.blindExport`);
        const lexiconPath = resolveRepoRelativePath(set.lexicon, `${sourceId}.lexicon`);
        if (blindExportPath.toLowerCase().includes("sample3") || lexiconPath.toLowerCase().includes("sample3")) {
            throw new Error(`${sourceId} must not use sample 3 for training.`);
        }

        const blindExport = JSON.parse(readFileSync(blindExportPath, "utf8"));
        const lexicon = JSON.parse(readFileSync(lexiconPath, "utf8"));

        assertNoForbidden(blindExport, `${sourceId}.blindExport`);
        assertNoForbidden(lexicon, `${sourceId}.lexicon`, new Set([...FORBIDDEN_KEYS, "transcript"]));

        const entries = normalizeLexiconEntries(lexicon, sourceId);
        for (const entry of entries) {
            allLexiconLabels.add(entry.label);
            if (!labelOrder.includes(entry.label)) labelOrder.push(entry.label);
        }

        const sourceSegments = [];
        for (const segment of blindExport.segments ?? []) {
            const resolvedEntry = chooseSegmentEntry(entries, segment);
            if (!resolvedEntry) continue;
            if (resolvedEntry.ambiguousFamilyLabels.length > 0) {
                ambiguousFamilyLabels.push({
                    sourceId,
                    segmentId: segment.id,
                    family: segment.eventFamilyHypothesis,
                    selectedLabel: resolvedEntry.entry.label,
                    labelOptions: resolvedEntry.ambiguousFamilyLabels,
                    note: "Family-only labels were ambiguous; exact segmentIds should be added before this source is trusted for activation.",
                });
            }
            const values = featuresFor(segment);
            const labeled = {
                id: `${sourceId}:${segment.id}`,
                sourceId,
                segmentId: segment.id,
                family: segment.eventFamilyHypothesis,
                label: resolvedEntry.entry.label,
                concept: resolvedEntry.entry.conceptHint,
                split: resolvedEntry.entry.split,
                resolution: resolvedEntry.resolution,
                x: featureNames.map((name) => safeNumber(values[name])),
            };
            labeledSegments.push(labeled);
            sourceSegments.push(labeled);
        }

        trainingSetSummaries.push({
            id: sourceId,
            role: set.role ?? "training",
            blindExport: repoRelativePath(blindExportPath),
            lexicon: repoRelativePath(lexiconPath),
            segmentCount: Array.isArray(blindExport.segments) ? blindExport.segments.length : 0,
            labeledSegments: sourceSegments.length,
            uniqueLabels: new Set(sourceSegments.map((segment) => segment.label)).size,
            uniqueFamilies: new Set(sourceSegments.map((segment) => segment.family)).size,
            exactSegmentLabels: sourceSegments.filter((segment) => segment.resolution === "segment-id").length,
            familyHintLabels: sourceSegments.filter((segment) => segment.resolution === "family-hint").length,
        });
    }

    if (labeledSegments.length < 2) {
        throw new Error("Need at least two labeled segments to train the local head.");
    }

    const usedLabels = new Set(labeledSegments.map((segment) => segment.label));
    const classLabels = labelOrder.filter((label) => usedLabels.has(label));

    const { weights, biases } = trainMultinomialLogisticRegression(
        labeledSegments,
        classLabels,
        featureNames,
    );

    const labelToConcept = new Map(
        labeledSegments.map((segment) => [segment.label, segment.concept]),
    );
    const vocab = classLabels.map((label, classIndex) => {
        const learnedWeights = {};
        featureNames.forEach((name, featureIndex) => {
            const value = roundWeight(weights[classIndex][featureIndex]);
            if (Math.abs(value) >= 0.0005) learnedWeights[name] = value;
        });
        return {
            gloss: label,
            bias: roundWeight(biases[classIndex]),
            weights: learnedWeights,
            priorConcept: labelToConcept.get(label) ?? "unknown",
        };
    });

    const unusedLexiconLabels = [...allLexiconLabels].filter((label) => !usedLabels.has(label));
    const uniqueFamilies = new Set(labeledSegments.map((segment) => segment.family)).size;
    const uniqueConcepts = new Set(labeledSegments.map((segment) => segment.concept)).size;
    const activationBlockers = [];
    if (trainingSetSummaries.length < ACTIVATION_MINIMUMS.trainingSets) {
        activationBlockers.push(`needs at least ${ACTIVATION_MINIMUMS.trainingSets} labeled training sets`);
    }
    if (labeledSegments.length < ACTIVATION_MINIMUMS.labeledSegments) {
        activationBlockers.push(`needs at least ${ACTIVATION_MINIMUMS.labeledSegments} labeled segments`);
    }
    if (uniqueFamilies < ACTIVATION_MINIMUMS.uniqueFamilies) {
        activationBlockers.push(`needs at least ${ACTIVATION_MINIMUMS.uniqueFamilies} unique families`);
    }
    if (classLabels.length < ACTIVATION_MINIMUMS.uniqueLabels) {
        activationBlockers.push(`needs at least ${ACTIVATION_MINIMUMS.uniqueLabels} unique labels`);
    }
    if (uniqueConcepts < ACTIVATION_MINIMUMS.uniqueConcepts) {
        activationBlockers.push(`needs at least ${ACTIVATION_MINIMUMS.uniqueConcepts} unique concepts`);
    }
    if (ambiguousFamilyLabels.length > 0) {
        activationBlockers.push("has family-only ambiguous labels that need exact segmentIds");
    }

    const model = {
        id: "sign-vocab-learned-subset@1",
        version: 1,
        description:
            "Candidate learned local linear probe trained from the canonical sample-2 real-browser blind export plus its local Train-mode labels. This is an honest learned subset path, not the active general recognizer: sample 3 remains excluded from training and the round-13 semantic-confidence head stays the active fallback until this candidate passes structural gates.",
        createdAt: today,
        featureNames,
        calibration: {
            temperature: 1,
            primaryFamilyBoost: 0,
            runnerUpFamilyBoost: 0,
            familyMismatchPenalty: 0,
        },
        deployment: {
            status: "candidate",
            activeFallbackModelId: activeModel.id,
            blocker: activationBlockers.length > 0
                ? `Insufficient supervised breadth (${activationBlockers.join("; ")}). It must also preserve sample-3 confidence and semantic breadth before replacing the active round-13 head.`
                : "It must preserve sample-3 confidence and semantic breadth before replacing the active round-13 head.",
        },
        training: {
            sourceKind: "manifest-local-multinomial-logistic-regression",
            optimizer: "batch-gradient-descent-cross-entropy-l2",
            sourceManifest: trainingPlan.manifestPath ? repoRelativePath(trainingPlan.manifestPath) : null,
            sourceExports: trainingSetSummaries.map((set) => set.blindExport),
            sourceLexicons: trainingSetSummaries.map((set) => set.lexicon),
            sample3Excluded: true,
            usedHumanTranscript: false,
            usedExpectedReference: false,
            usedAnswerKey: false,
            labeledSegments: labeledSegments.length,
            trainingSets: trainingSetSummaries,
            uniqueLabels: classLabels.length,
            uniqueFamilies,
            uniqueConcepts,
            labels: classLabels,
            unusedLexiconLabels,
            segmentLabelResolution: {
                exactSegmentLabels: labeledSegments.filter((segment) => segment.resolution === "segment-id").length,
                familyHintLabels: labeledSegments.filter((segment) => segment.resolution === "family-hint").length,
                ambiguousFamilyLabels,
            },
            activationMinimums: ACTIVATION_MINIMUMS,
            activationBlockers,
            readyForActivation: activationBlockers.length === 0,
        },
        vocab,
    };

    mkdirSync(dirname(OUT_MODEL_PATH), { recursive: true });
    writeFileSync(OUT_MODEL_PATH, `${JSON.stringify(model, null, 2)}\n`, "utf8");

    console.log(`Wrote ${OUT_MODEL_PATH}`);
    console.log(`Training manifest: ${trainingPlan.manifestPath ? repoRelativePath(trainingPlan.manifestPath) : "legacy default"}`);
    console.log(`Trained labels: ${classLabels.join(", ")}`);
    console.log(`Labeled segments: ${labeledSegments.length}`);
    console.log(`Unique families: ${uniqueFamilies}; unique concepts: ${uniqueConcepts}`);
    console.log(`Activation blockers: ${activationBlockers.length ? activationBlockers.join("; ") : "none"}`);
    console.log(`Sample 3 used for training: NO`);
}

main();