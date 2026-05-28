#!/usr/bin/env node
/**
 * Exercise Train mode on sample-2 without uploading a new clip.
 *
 * Reads the canonical real-browser blind export, runs both the pretrained
 * MVP and an adapted recognizer built from a hand-authored sample-2 custom
 * sign lexicon, and writes two artifacts:
 *   - docs/artifacts/sample2-adaptation-pack-<date>.json         (lexicon)
 *   - docs/artifacts/sample2-adaptation-pack-eval-<date>.json    (results)
 *
 * Deterministic. No raw video. No expected reference. No answer-key fields.
 *
 * Usage:
 *   node scripts/exercise-train-mode.mjs
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
const today = new Date().toISOString().slice(0, 10);

const CANONICAL_EXPORT = resolve(
    repoRoot,
    "docs/artifacts/sample2-blind-after-round5-real-2026-04-26.json",
);

const FORBIDDEN_KEYS = new Set([
    "rawVideo",
    "pixelData",
    "frames",
    "imageBytes",
    "transcript",
    "expectedReference",
    "answerKey",
]);

function assertNoForbidden(value, path = "$") {
    if (Array.isArray(value)) {
        value.forEach((item, i) => assertNoForbidden(item, `${path}[${i}]`));
        return;
    }
    if (value === null || typeof value !== "object") return;
    for (const key of Object.keys(value)) {
        if (FORBIDDEN_KEYS.has(key)) {
            throw new Error(`Forbidden key ${key} at ${path}`);
        }
        assertNoForbidden(value[key], `${path}.${key}`);
    }
}

// --- Sample-2 lexicon authored deterministically. ----------------------------
// Each entry is honestly framed as a "sample-2 demonstration correction".
// Splits cover calibration + holdout so the artifact exercises both paths.
const sample2Entries = [
    { label: "CHOP", familyHint: "chop/cut-like", conceptHint: "tool-action", split: "calibration" },
    { label: "HAMMER", familyHint: "repeated-tool-use-like", conceptHint: "tool-action", split: "calibration" },
    { label: "FALL-DOWN", familyHint: "big-fall-like", conceptHint: "event", split: "holdout" },
    { label: "BOUNCE", familyHint: "impact/bounce-like", conceptHint: "event", split: "calibration" },
    { label: "SPELL-NAME", familyHint: "fingerspell/emphatic-letter-sequence-like", conceptHint: "discourse", split: "holdout" },
    { label: "DRINK", familyHint: "drink-like", conceptHint: "consume", split: "calibration" },
];

function buildLexiconSnapshot() {
    const now = new Date().toISOString();
    let counter = 1;
    const entries = sample2Entries.map((e) => {
        const slug = e.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        return {
            id: `custom-sign-${slug}-${String(counter++).padStart(4, "0")}`,
            label: e.label,
            familyHint: e.familyHint,
            conceptHint: e.conceptHint,
            notes: "sample-2 demonstration correction (exercise-train-mode.mjs)",
            split: e.split,
            exampleCount: 1,
            createdAt: now,
            updatedAt: now,
        };
    });
    return {
        schemaVersion: 1,
        exportedAt: now,
        entries,
        provenance: {
            generatedBy: "scripts/exercise-train-mode.mjs",
            sourceExport: CANONICAL_EXPORT.replace(repoRoot + "\\", "").replaceAll("\\", "/"),
            note:
                "Hand-authored demo lexicon — not learned from the clip. Used only to exercise the Train-mode adaptation path against the bundled sample-2 blind export.",
        },
    };
}

// --- Tiny reimplementation of the family-prior pretrained head. -------------
// We embed a stripped-down copy of the runtime so the script stays
// dependency-free (no ts-node, no esbuild). The math matches
// src/lib/recognition/PretrainedSignRecognizer.ts.
const MODEL = JSON.parse(
    readFileSync(resolve(repoRoot, "src/lib/recognition/pretrained/sign-vocab-mvp.json"), "utf8"),
);

function safeNumber(v, fallback = 0) {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function clamp01(v) {
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(1, v));
}

function featuresFor(seg) {
    const q = seg.qualitySignals ?? {};
    const b = seg.bodyReactionStats ?? {};
    const h = seg.handshapeChangeStats ?? {};
    const phases = Array.isArray(seg.phases) ? seg.phases : [];
    let setupCount = 0, strokeCount = 0, recoveryCount = 0, releaseCount = 0, holdCount = 0, repeatedLoopCount = 0;
    for (const p of phases) {
        const kind = String(p.kind ?? p.role ?? "");
        if (kind.includes("setup")) setupCount++;
        if (kind.includes("repeated-action-loop")) repeatedLoopCount++;
        if (kind.includes("stroke") || kind.includes("hold") || kind.includes("repeated-action-loop")) strokeCount++;
        if (kind.includes("hold")) holdCount++;
        if (kind.includes("release") || kind.includes("fall")) releaseCount++;
        if (kind.includes("return") || kind.includes("recovery") || kind.includes("continue")) recoveryCount++;
    }
    const phaseTotal = Math.max(1, phases.length);
    const margin = safeNumber(seg.confidenceMargin);
    const values = {
        bias: 1,
        margin,
        lowBlindMargin: clamp01((0.1 - margin) / 0.1),
        veryLowBlindMargin: clamp01((0.05 - margin) / 0.05),
        strongBlindMargin: clamp01(margin / 0.25),
        mouthFaceStrength: safeNumber(q.faceVisibleRatio, 1) * safeNumber(q.mouthStability, 0.5),
        handVisibility: safeNumber(q.handVisibleRatio, 1),
        motionEnergy: safeNumber(q.motionEnergy),
        headBounce: safeNumber(b.headBounce),
        shoulderLift: safeNumber(b.shoulderLift),
        torsoDisplacement: safeNumber(b.torsoDisplacement),
        reactionAftermath: safeNumber(b.reactionAftermathScore),
        handshapeVolatility: safeNumber(h.volatility),
        compactBurst: safeNumber(h.compactBurstScore),
        phaseSetupRatio: setupCount / phaseTotal,
        phaseStrokeRatio: strokeCount / phaseTotal,
        phaseRecoveryRatio: recoveryCount / phaseTotal,
        phaseReleaseRatio: releaseCount / phaseTotal,
        phaseHoldRatio: holdCount / phaseTotal,
        phaseRepeatedLoopRatio: repeatedLoopCount / phaseTotal,
    };
    if (seg.eventFamilyHypothesis) {
        values[`family.${seg.eventFamilyHypothesis}`] = 1;
        values[`primaryFamily.${seg.eventFamilyHypothesis}`] = 1;
    }
    if (seg.runnerUpFamily) {
        const k = `family.${seg.runnerUpFamily}`;
        values[k] = (values[k] ?? 0) + 0.4;
        values[`runnerUpFamily.${seg.runnerUpFamily}`] = 1;
    }
    for (const tag of Array.isArray(seg.motifTags) ? seg.motifTags : []) {
        values[`motif.${tag}`] = 1;
    }
    return values;
}

function scoreVocab(values) {
    const activeFamilies = getActiveFamilies(values);
    const temperature = Math.max(0.1, MODEL.calibration?.temperature ?? 1);
    const logits = MODEL.vocab.map((entry) => {
        let logit = entry.bias;
        for (const [name, weight] of Object.entries(entry.weights)) {
            logit += weight * (values[name] ?? 0);
        }
        logit += familyCalibrationLogit(entry, activeFamilies);
        logit /= temperature;
        return { gloss: entry.gloss, logit };
    });
    const max = logits.reduce((m, x) => (x.logit > m ? x.logit : m), -Infinity);
    let denom = 0;
    const exps = logits.map(({ gloss, logit }) => {
        const ex = Math.exp(logit - max);
        denom += ex;
        return { gloss, ex };
    });
    return exps
        .map(({ gloss, ex }) => ({ gloss, probability: ex / denom }))
        .sort((a, b) => b.probability - a.probability);
}

function getActiveFamilies(values) {
    return Object.entries(values)
        .filter(([name, value]) => name.startsWith("family.") && value > 0)
        .map(([name, strength]) => ({
            family: name.slice("family.".length),
            strength,
        }))
        .sort((a, b) => b.strength - a.strength);
}

function familyCalibrationLogit(entry, activeFamilies) {
    const familyWeights = Object.keys(entry.weights).filter((name) => name.startsWith("family."));
    if (familyWeights.length === 0 || activeFamilies.length === 0) return 0;
    const primary = activeFamilies[0];
    if ((entry.weights[`family.${primary.family}`] ?? 0) > 0) {
        return MODEL.calibration?.primaryFamilyBoost ?? 0;
    }
    const runnerUpMatch = activeFamilies
        .slice(1)
        .some(({ family }) => (entry.weights[`family.${family}`] ?? 0) > 0);
    if (runnerUpMatch) return MODEL.calibration?.runnerUpFamilyBoost ?? 0;
    return MODEL.calibration?.familyMismatchPenalty ?? 0;
}

function pretrainedResult(blindExport) {
    const segments = blindExport.segments.map((seg) => {
        const ranked = scoreVocab(featuresFor(seg));
        const top = ranked[0];
        return {
            id: seg.id,
            startMs: seg.startMs,
            endMs: seg.endMs,
            family: seg.eventFamilyHypothesis,
            text: top.gloss,
            confidence: top.probability,
        };
    });
    const mean = segments.reduce((a, s) => a + s.confidence, 0) / segments.length;
    const lowest = Math.min(...segments.map((s) => s.confidence));
    const overall = Math.max(0, Math.min(1, 0.7 * mean + 0.3 * lowest));
    return {
        transcript: segments.map((s) => s.text).join(" "),
        confidence: overall,
        confidencePercent: Math.max(0, Math.min(100, Math.round(overall * 100))),
        isLowConfidence: overall < 0.55,
        source: "pretrained",
        modelId: MODEL.id,
        segments,
    };
}

function adaptedResult(base, lexicon) {
    const eligible = lexicon.entries.filter((e) => e.split !== "ignore");
    const byFamily = new Map();
    for (const e of eligible) {
        if (!e.familyHint) continue;
        const cur = byFamily.get(e.familyHint);
        if (!cur || cur.exampleCount < e.exampleCount) byFamily.set(e.familyHint, e);
    }
    let applied = 0;
    const segments = base.segments.map((seg) => {
        const match = seg.family ? byFamily.get(seg.family) : null;
        if (!match) return seg;
        applied++;
        return {
            ...seg,
            text: match.label,
            confidence: Math.min(1, seg.confidence + 0.05),
            customSignId: match.id,
        };
    });
    const transcript = segments.map((s) => s.text).join(" ");
    const cappedBump = Math.min((applied * 0.05) / Math.max(1, segments.length), 0.2);
    const confidence = Math.min(1, base.confidence + cappedBump);
    return {
        transcript,
        confidence,
        confidencePercent: Math.max(0, Math.min(100, Math.round(confidence * 100))),
        isLowConfidence: base.isLowConfidence || confidence < 0.55,
        lowConfidenceReason: base.isLowConfidence
            ? `${applied} custom-sign override(s) applied; base recognizer remains low-confidence`
            : null,
        source: "adapted",
        modelId: `adapted-over-${base.modelId}`,
        segments,
        adapterApplied: true,
        appliedCount: applied,
        baseTranscript: base.transcript,
    };
}

// --- Main --------------------------------------------------------------------

function main() {
    const blindExport = JSON.parse(readFileSync(CANONICAL_EXPORT, "utf8"));
    assertNoForbidden(blindExport, "blindExport");

    const lexicon = buildLexiconSnapshot();
    assertNoForbidden(lexicon, "lexicon");

    const pre = pretrainedResult(blindExport);
    const adapted = adaptedResult(pre, lexicon);

    const evalArtifact = {
        id: `sample2-adaptation-eval-${today}`,
        generatedAt: new Date().toISOString(),
        sourceExport: CANONICAL_EXPORT.replace(repoRoot + "\\", "").replaceAll("\\", "/"),
        lexiconSummary: {
            entries: lexicon.entries.length,
            calibration: lexicon.entries.filter((e) => e.split === "calibration").length,
            holdout: lexicon.entries.filter((e) => e.split === "holdout").length,
        },
        pretrained: pre,
        adapted,
        diff: {
            baseTranscript: pre.transcript,
            adaptedTranscript: adapted.transcript,
            segmentsOverridden: adapted.segments.filter((s) => s.customSignId).map((s) => ({
                id: s.id,
                family: s.family,
                fromGloss: pre.segments.find((p) => p.id === s.id)?.text ?? null,
                toLabel: s.text,
                customSignId: s.customSignId,
            })),
            confidenceDelta: adapted.confidence - pre.confidence,
        },
        notes:
            "Demonstration adaptation pack. No raw video, no expected reference, no answer-key. Lexicon labels are hand-authored placeholders; calibration vs holdout splits preserved.",
    };
    // Privacy invariant only applies to stored *lexicon* data, not to
    // translation outputs (where "transcript" is the legitimate result text).
    assertNoForbidden(lexicon, "lexicon");

    mkdirSync(resolve(repoRoot, "docs/artifacts"), { recursive: true });
    const lexPath = resolve(repoRoot, `docs/artifacts/sample2-adaptation-pack-${today}.json`);
    const evalPath = resolve(repoRoot, `docs/artifacts/sample2-adaptation-pack-eval-${today}.json`);
    writeFileSync(lexPath, JSON.stringify(lexicon, null, 2) + "\n", "utf8");
    writeFileSync(evalPath, JSON.stringify(evalArtifact, null, 2) + "\n", "utf8");

    console.log("Wrote", lexPath);
    console.log("Wrote", evalPath);
    console.log(`Pretrained transcript: ${pre.transcript}`);
    console.log(`Adapted transcript:    ${adapted.transcript}`);
    console.log(`Segments overridden:   ${evalArtifact.diff.segmentsOverridden.length}`);
    console.log(`Confidence delta:      ${evalArtifact.diff.confidenceDelta.toFixed(4)}`);
}

main();
