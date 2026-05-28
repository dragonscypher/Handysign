#!/usr/bin/env node
/**
 * Validate the translation product path on the sample-3 blind export.
 *
 * Sample-3 is treated as the first unseen validation clip for the
 * translation product. **No transcript** is read, requested, or compared.
 * We only consume the on-device blind inference JSON (`segments[]`,
 * `qualitySignals`, family hypotheses, etc.) and measure:
 *
 *   - Normal-mode pretrained behavior (real glosses + per-segment confidence)
 *   - Adapted behavior when the sample-2 demonstration lexicon is loaded
 *     (so we can see exactly which family overrides would fire on an
 *     unseen clip — a leakage / over-eager-adaptation check)
 *   - Honest aggregate confidence and low-confidence reasons
 *
 * Writes:
 *   docs/artifacts/sample3-blind-eval-<date>.json
 *
 * Deterministic. No raw video. No expected reference. No answer-key.
 *
 * Usage:
 *   node scripts/validate-sample3.mjs
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
const today = new Date().toISOString().slice(0, 10);

const SAMPLE3_EXPORT = resolve(
    repoRoot,
    "docs/artifacts/sample3-blind-2026-05-21.json",
);
const SAMPLE2_LEXICON = resolve(
    repoRoot,
    "docs/artifacts/sample2-adaptation-pack-2026-05-18.json",
);

const FORBIDDEN_KEYS = new Set([
    "rawVideo",
    "pixelData",
    "frames",
    "imageBytes",
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

const ACTIVE_MODEL_PATH = resolve(repoRoot, "src/lib/recognition/pretrained/sign-vocab-mvp.json");
const LEARNED_SUBSET_MODEL_PATH = resolve(repoRoot, "src/lib/recognition/pretrained/sign-vocab-learned-subset.json");
const ACTIVE_MODEL = JSON.parse(readFileSync(ACTIVE_MODEL_PATH, "utf8"));
const LEARNED_SUBSET_MODEL = existsSync(LEARNED_SUBSET_MODEL_PATH)
    ? JSON.parse(readFileSync(LEARNED_SUBSET_MODEL_PATH, "utf8"))
    : null;

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

function scoreVocab(values, model) {
    const activeFamilies = getActiveFamilies(values);
    const temperature = Math.max(0.1, model.calibration?.temperature ?? 1);
    const logits = model.vocab.map((entry) => {
        let logit = entry.bias;
        for (const [name, weight] of Object.entries(entry.weights)) {
            logit += weight * (values[name] ?? 0);
        }
        logit += familyCalibrationLogit(model, entry, activeFamilies);
        logit /= temperature;
        return { gloss: entry.gloss, priorConcept: entry.priorConcept ?? "unknown", logit };
    });
    const max = logits.reduce((m, x) => (x.logit > m ? x.logit : m), -Infinity);
    let denom = 0;
    const exps = logits.map(({ gloss, priorConcept, logit }) => {
        const ex = Math.exp(logit - max);
        denom += ex;
        return { gloss, priorConcept, ex };
    });
    return exps
        .map(({ gloss, priorConcept, ex }) => ({ gloss, priorConcept, probability: ex / denom }))
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

function familyCalibrationLogit(model, entry, activeFamilies) {
    const familyWeights = Object.keys(entry.weights).filter((name) => name.startsWith("family."));
    if (familyWeights.length === 0 || activeFamilies.length === 0) return 0;
    const primary = activeFamilies[0];
    if ((entry.weights[`family.${primary.family}`] ?? 0) > 0) {
        return model.calibration?.primaryFamilyBoost ?? 0;
    }
    const runnerUpMatch = activeFamilies
        .slice(1)
        .some(({ family }) => (entry.weights[`family.${family}`] ?? 0) > 0);
    if (runnerUpMatch) return model.calibration?.runnerUpFamilyBoost ?? 0;
    return model.calibration?.familyMismatchPenalty ?? 0;
}

function pretrainedResult(blindExport, model) {
    const segments = blindExport.segments.map((seg) => {
        const ranked = scoreVocab(featuresFor(seg), model);
        const top = ranked[0];
        const runner = ranked[1];
        return {
            id: seg.id,
            startMs: seg.startMs,
            endMs: seg.endMs,
            family: seg.eventFamilyHypothesis,
            runnerUpFamily: seg.runnerUpFamily,
            blindConfidenceMargin: seg.confidenceMargin,
            text: top.gloss,
            priorConcept: top.priorConcept ?? "unknown",
            confidence: top.probability,
            runnerUpGloss: runner?.gloss ?? null,
            runnerUpPriorConcept: runner?.priorConcept ?? null,
            runnerUpProbability: runner?.probability ?? null,
        };
    });
    const mean = segments.reduce((a, s) => a + s.confidence, 0) / segments.length;
    const lowest = Math.min(...segments.map((s) => s.confidence));
    const tightBlindMarginCount = segments.filter((s) => (s.blindConfidenceMargin ?? 0) < 0.1).length;
    const lowestBlindMargin = Math.min(...segments.map((s) => s.blindConfidenceMargin ?? 0));
    const overall = Math.max(0, Math.min(1, 0.7 * mean + 0.3 * lowest));
    const isLow =
        overall < 0.55 ||
        segments.some((s) => s.confidence < 0.25) ||
        tightBlindMarginCount >= Math.ceil(segments.length / 2);
    return {
        transcript: segments.map((s) => s.text).join(" "),
        confidence: overall,
        confidencePercent: Math.max(0, Math.min(100, Math.round(overall * 100))),
        isLowConfidence: isLow,
        lowConfidenceReason: isLow
            ? `Local head still has a compact ${model.vocab.length}-word vocabulary and ${tightBlindMarginCount}/${segments.length} blind-family margins are below 0.10 (lowest ${lowestBlindMargin.toFixed(3)}).`
            : null,
        source: "pretrained",
        modelId: model.id,
        segments,
        tightBlindMarginCount,
        lowestBlindMargin,
    };
}

function segmentConfidenceSummary(segments) {
    return {
        above55: segments.filter((s) => s.confidence >= 0.55).length,
        below55: segments.filter((s) => s.confidence < 0.55).length,
        below25: segments.filter((s) => s.confidence < 0.25).length,
    };
}

function candidateGate(active, activeBreadth, candidate, candidateBreadth) {
    const activeSummary = segmentConfidenceSummary(active.segments);
    const candidateSummary = segmentConfidenceSummary(candidate.segments);
    const checks = {
        preservesConfidence: candidate.confidence >= active.confidence,
        preservesSegmentsAbove55: candidateSummary.above55 >= activeSummary.above55,
        preservesSemanticBreadth: candidateBreadth.collapseRisk === false,
        trainedWithoutSample3: LEARNED_SUBSET_MODEL?.training?.sample3Excluded === true,
    };
    return {
        selectedModelId: Object.values(checks).every(Boolean) ? candidate.modelId : active.modelId,
        activeFallbackModelId: active.modelId,
        candidateModelId: candidate.modelId,
        checks,
        activeConfidence: active.confidence,
        candidateConfidence: candidate.confidence,
        activeSegmentsAbove55: activeSummary.above55,
        candidateSegmentsAbove55: candidateSummary.above55,
        activeCollapseRisk: activeBreadth.collapseRisk,
        candidateCollapseRisk: candidateBreadth.collapseRisk,
        reason: Object.values(checks).every(Boolean)
            ? "Learned subset candidate passes the current structural gates."
            : "Learned subset candidate remains a non-active probe because it does not yet preserve the round-13 sample-3 confidence/semantic-breadth gates.",
    };
}

function adaptedResult(base, lexiconSnapshot) {
    const eligible = (lexiconSnapshot.entries ?? []).filter((e) => e.split !== "ignore");
    const byFamily = new Map();
    for (const e of eligible) {
        if (!e.familyHint) continue;
        const cur = byFamily.get(e.familyHint);
        if (!cur || (cur.exampleCount ?? 0) < (e.exampleCount ?? 0)) byFamily.set(e.familyHint, e);
    }
    let applied = 0;
    const segments = base.segments.map((seg) => {
        const match = seg.family ? byFamily.get(seg.family) : null;
        if (!match) return seg;
        applied++;
        return {
            ...seg,
            text: match.label,
            priorConcept: match.conceptHint || seg.priorConcept,
            confidence: Math.min(1, seg.confidence + 0.05),
            customSignId: match.id,
            customSignSplit: match.split,
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
            ? `${applied} custom-sign override(s) applied; ${base.lowConfidenceReason ?? "base recognizer remains low-confidence"}`
            : null,
        source: "adapted",
        modelId: `adapted-over-${base.modelId}`,
        segments,
        adapterApplied: applied > 0,
        appliedCount: applied,
        baseTranscript: base.transcript,
    };
}

function familyMix(segments) {
    const counts = new Map();
    for (const s of segments) {
        const k = s.eventFamilyHypothesis ?? s.family ?? "unknown";
        counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([family, count]) => ({ family, count }));
}

const COARSE_CONCEPTS = new Set(["tool-action", "event", "object-relation", "activity", "motion"]);

function countBy(items, keyFor) {
    const counts = new Map();
    for (const item of items) {
        const key = keyFor(item);
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count }));
}

function maxConsecutiveRun(values) {
    let max = 0;
    let current = 0;
    let previous = null;
    for (const value of values) {
        current = value === previous ? current + 1 : 1;
        previous = value;
        if (current > max) max = current;
    }
    return max;
}

function semanticBreadth(segments) {
    const concepts = segments.map((s) => s.priorConcept ?? "unknown");
    const glosses = segments.map((s) => s.text);
    const coarseCount = concepts.filter((concept) => COARSE_CONCEPTS.has(concept)).length;
    const glossCounts = countBy(segments, (s) => s.text);
    const semanticClassMix = countBy(segments, (s) => s.priorConcept ?? "unknown");
    const uniqueGlossCount = new Set(glosses).size;
    const uniqueSemanticClassCount = new Set(concepts).size;
    const coarseActionToolObjectShare = coarseCount / Math.max(1, segments.length);
    const maxRepeatedGlossCount = glossCounts[0]?.count ?? 0;
    const maxRepeatedSemanticClassCount = semanticClassMix[0]?.count ?? 0;
    const collapseRisk =
        coarseActionToolObjectShare >= 0.8 ||
        uniqueGlossCount <= 4 ||
        maxRepeatedGlossCount >= Math.ceil(segments.length / 3) ||
        maxRepeatedSemanticClassCount >= Math.ceil(segments.length * 0.7);
    return {
        uniqueGlossCount,
        uniqueSemanticClassCount,
        coarseActionToolObjectShare: Number(coarseActionToolObjectShare.toFixed(4)),
        broaderSemanticShare: Number((1 - coarseActionToolObjectShare).toFixed(4)),
        maxRepeatedGlossCount,
        maxConsecutiveGlossRun: maxConsecutiveRun(glosses),
        maxRepeatedSemanticClassCount,
        glossCounts,
        semanticClassMix,
        collapseRisk,
        collapseRiskReason: collapseRisk
            ? "Top transcript still over-concentrates in coarse action/tool/object classes or repeats too few glosses."
            : "Top transcript includes enough non-coarse semantic classes to avoid the previous action/tool/object collapse signal.",
    };
}

function main() {
    const blindExport = JSON.parse(readFileSync(SAMPLE3_EXPORT, "utf8"));
    // Sample-3 blind exports legitimately carry segmentHypothesisTranscript
    // (family chain). It is NOT a real transcript — it is the model's own
    // family-hypothesis chain. We still avoid stripping it because it is a
    // diagnostic, but we do not include it in any "transcript" comparison.
    if ("expectedReference" in blindExport || "answerKey" in blindExport) {
        throw new Error("Sample-3 export must not carry expectedReference/answerKey.");
    }
    assertNoForbidden(blindExport, "blindExport");

    const lexicon = JSON.parse(readFileSync(SAMPLE2_LEXICON, "utf8"));
    assertNoForbidden(lexicon, "lexicon");

    const pre = pretrainedResult(blindExport, ACTIVE_MODEL);
    const adapted = adaptedResult(pre, lexicon);
    const semanticBreadthDiagnostics = semanticBreadth(pre.segments);
    const learnedCandidateResult = LEARNED_SUBSET_MODEL
        ? pretrainedResult(blindExport, LEARNED_SUBSET_MODEL)
        : null;
    const learnedCandidateBreadth = learnedCandidateResult
        ? semanticBreadth(learnedCandidateResult.segments)
        : null;
    const learnedCandidate = learnedCandidateResult && learnedCandidateBreadth
        ? {
            ...learnedCandidateResult,
            deployment: LEARNED_SUBSET_MODEL.deployment ?? null,
            training: LEARNED_SUBSET_MODEL.training ?? null,
            diagnostics: {
                ...segmentConfidenceSummary(learnedCandidateResult.segments),
                semanticBreadth: learnedCandidateBreadth,
            },
        }
        : null;
    const modelSelection = learnedCandidateResult && learnedCandidateBreadth
        ? candidateGate(pre, semanticBreadthDiagnostics, learnedCandidateResult, learnedCandidateBreadth)
        : {
            selectedModelId: pre.modelId,
            activeFallbackModelId: pre.modelId,
            candidateModelId: null,
            checks: {
                candidatePresent: false,
            },
            reason: "No learned subset candidate artifact is present.",
        };

    // Confidence honesty checks (no transcript involved):
    const segmentsBelow55 = pre.segments.filter((s) => s.confidence < 0.55).length;
    const segmentsBelow25 = pre.segments.filter((s) => s.confidence < 0.25).length;
    const meanBlindMargin =
        blindExport.segments.reduce((a, s) => a + (s.confidenceMargin ?? 0), 0) /
        blindExport.segments.length;
    const tightBlindMarginCount = blindExport.segments.filter((s) => (s.confidenceMargin ?? 0) < 0.1).length;

    // Adapter-overlay diagnostic (does sample-2 lexicon overreach on sample-3?):
    const sample2FamiliesPresent = [...new Set(blindExport.segments.map((s) => s.eventFamilyHypothesis))]
        .filter((f) => lexicon.entries.some((e) => e.familyHint === f));

    const evalArtifact = {
        id: `sample3-blind-eval-${today}`,
        generatedAt: new Date().toISOString(),
        sourceExport: "docs/artifacts/sample3-blind-2026-05-21.json",
        sourceLexicon: "docs/artifacts/sample2-adaptation-pack-2026-05-18.json",
        clip: {
            name: blindExport.clipName,
            durationMs: blindExport.clipDurationMs,
            segmentCount: blindExport.segments.length,
            mode: blindExport.mode,
            familyMix: familyMix(blindExport.segments),
            meanBlindConfidenceMargin: Number(meanBlindMargin.toFixed(4)),
        },
        usedTranscriptLeakageCheck: {
            usedExpectedReference: false,
            usedAnswerKey: false,
            usedHumanTranscript: false,
            note: "Sample-3 has no labeled transcript in this repo. Validation is structural only.",
        },
        pretrained: pre,
        learnedCandidate,
        modelSelection,
        adapted,
        diagnostics: {
            segmentsBelow55: segmentsBelow55,
            segmentsBelow25: segmentsBelow25,
            sample2FamiliesPresentInSample3: sample2FamiliesPresent,
            adapterAppliedCount: adapted.appliedCount,
            adapterConfidenceDelta: Number((adapted.confidence - pre.confidence).toFixed(4)),
            tightBlindMarginCount,
            semanticBreadth: semanticBreadthDiagnostics,
        },
        readiness: {
            normalModeProducesTranscript: pre.transcript.length > 0,
            normalModeShowsConfidence: typeof pre.confidencePercent === "number",
            normalModeShowsAlternatives: pre.segments.every((s) => s.runnerUpGloss !== null),
            lowConfidenceHonestlyFlagged:
                pre.isLowConfidence ===
                (segmentsBelow55 > 0 || segmentsBelow25 > 0 || tightBlindMarginCount >= Math.ceil(pre.segments.length / 2)),
            adapterRespectsFamilyHints: sample2FamiliesPresent.length === 0
                ? adapted.appliedCount === 0
                : adapted.appliedCount > 0,
            readyForAnotherUnseenUserUpload: false,
            readyForAnotherUnseenUserUploadReason:
                "Semantic-breadth local head reduces the coarse action/tool/object collapse, but sample-3 blind-family margins remain weak. Wait for a learned ONNX/WLASL head before requesting another unseen user clip.",
        },
        notes:
            "Structural validation only. No transcript was read, requested, or compared. Sample-3 is the active unseen validation clip for the translation product.",
    };
    assertNoForbidden(lexicon, "lexicon");

    mkdirSync(resolve(repoRoot, "docs/artifacts"), { recursive: true });
    const evalPath = resolve(repoRoot, `docs/artifacts/sample3-blind-eval-${today}.json`);
    writeFileSync(evalPath, JSON.stringify(evalArtifact, null, 2) + "\n", "utf8");

    console.log("Wrote", evalPath);
    console.log("\nNormal-mode transcript (sample-3, semantic-breadth pretrained head):");
    console.log(" ", pre.transcript);
    console.log(`  confidence ${pre.confidencePercent}%  isLow=${pre.isLowConfidence}`);
    console.log(`  segments<0.55: ${segmentsBelow55}, segments<0.25: ${segmentsBelow25}, blind margins<0.10: ${tightBlindMarginCount}`);
    console.log(`  semantic breadth: unique glosses ${semanticBreadthDiagnostics.uniqueGlossCount}, classes ${semanticBreadthDiagnostics.uniqueSemanticClassCount}, coarse share ${semanticBreadthDiagnostics.coarseActionToolObjectShare}, collapseRisk=${semanticBreadthDiagnostics.collapseRisk}`);
    if (learnedCandidate) {
        console.log("\nLearned subset candidate (sample-2-trained probe, sample-3 excluded):");
        console.log(`  ${learnedCandidate.transcript}`);
        console.log(
            `  confidence ${learnedCandidate.confidencePercent}%  segments>=0.55: ${learnedCandidate.diagnostics.above55}/${learnedCandidate.segments.length}  collapseRisk=${learnedCandidate.diagnostics.semanticBreadth.collapseRisk}`,
        );
        console.log(`  selected model: ${modelSelection.selectedModelId}`);
        console.log(`  gate: ${modelSelection.reason}`);
    }
    console.log("\nAdapted (sample-2 lexicon over sample-3 blind export):");
    console.log(" ", adapted.transcript);
    console.log(`  applied ${adapted.appliedCount}/${adapted.segments.length} segments`);
    console.log(
        `  sample-2 families present in sample-3: ${sample2FamiliesPresent.length ? sample2FamiliesPresent.join(", ") : "(none)"}`,
    );
    console.log("\nReady for another unseen user clip? NO.");
    console.log(`  Reason: ${evalArtifact.readiness.readyForAnotherUnseenUserUploadReason}`);
}

main();
