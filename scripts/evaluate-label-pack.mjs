#!/usr/bin/env node
/**
 * Compare a blind inference export against a manually edited label pack.
 * Reports family match rate, calibration vs holdout coverage, confusion
 * hotspots, weak/occluded counts, and segments still needing labels.
 *
 * Usage:
 *   node scripts/evaluate-label-pack.mjs <blindExport.json> <labelPack.json> <evaluationOut.json>
 *
 * This evaluator never reads transcripts or hidden answer keys. It only
 * compares the user's explicit labels against the blind export's predicted
 * fields.
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

async function main() {
    const exportPath = resolve(process.argv[2]);
    const packPath = resolve(process.argv[3]);
    const outPath = resolve(process.argv[4]);
    const blindExport = JSON.parse(await readFile(exportPath, "utf8"));
    const pack = JSON.parse(await readFile(packPath, "utf8"));
    if (!Array.isArray(blindExport.segments)) {
        throw new Error("blindExport has no segments[]");
    }
    if (!Array.isArray(pack.segmentLabels)) {
        throw new Error("labelPack has no segmentLabels[]");
    }
    const exportSegments = new Map(blindExport.segments.map((s) => [s.id, s]));
    let labeledSegments = 0;
    let calibrationCount = 0;
    let holdoutCount = 0;
    let ignoredCount = 0;
    let weakOrOccludedCount = 0;
    let familyMatches = 0;
    let familyEvaluable = 0;
    let conceptMatches = 0;
    let conceptEvaluable = 0;
    const hotspotMap = new Map();
    const calibrationConcepts = new Set();
    const holdoutConcepts = new Set();
    const segmentsNeedingLabels = [];

    for (const label of pack.segmentLabels) {
        if (label.split === "calibration") calibrationCount++;
        else if (label.split === "holdout") holdoutCount++;
        else ignoredCount++;
        if (label.quality !== "usable") weakOrOccludedCount++;
        const exportSegment = exportSegments.get(label.segmentId);
        const livePredictedFamily =
            exportSegment?.eventFamilyHypothesis ?? label.predictedFamily;
        const hasFamilyLabel = label.familyLabel !== "";
        if (hasFamilyLabel) labeledSegments++;
        else if (label.split !== "ignore") segmentsNeedingLabels.push(label.segmentId);
        if (hasFamilyLabel && label.quality === "usable" && label.split !== "ignore") {
            familyEvaluable++;
            if (livePredictedFamily === label.familyLabel) {
                familyMatches++;
            } else {
                const key = `${livePredictedFamily}__${label.familyLabel}`;
                const existing = hotspotMap.get(key);
                if (existing) existing.segmentIds.push(label.segmentId);
                else
                    hotspotMap.set(key, {
                        predictedFamily: livePredictedFamily,
                        familyLabel: label.familyLabel,
                        segmentIds: [label.segmentId],
                    });
            }
        }
        if (label.conceptLabel && label.split !== "ignore") {
            conceptEvaluable++;
            if (
                exportSegment?.exactLabelGuess &&
                exportSegment.exactLabelGuess === label.conceptLabel
            ) {
                conceptMatches++;
            }
            if (label.split === "calibration") calibrationConcepts.add(label.conceptLabel);
            if (label.split === "holdout") holdoutConcepts.add(label.conceptLabel);
        }
    }

    const confusionHotspots = [...hotspotMap.values()]
        .map((entry) => ({
            predictedFamily: entry.predictedFamily,
            familyLabel: entry.familyLabel,
            count: entry.segmentIds.length,
            segmentIds: [...entry.segmentIds],
        }))
        .sort(
            (a, b) =>
                b.count - a.count || a.predictedFamily.localeCompare(b.predictedFamily),
        );
    const uncoveredConcepts = [];
    for (const concept of calibrationConcepts)
        if (!holdoutConcepts.has(concept)) uncoveredConcepts.push(concept);
    for (const concept of holdoutConcepts)
        if (!calibrationConcepts.has(concept)) uncoveredConcepts.push(concept);
    uncoveredConcepts.sort();

    const familyMatchRate =
        familyEvaluable === 0 ? 0 : Number((familyMatches / familyEvaluable).toFixed(4));
    const conceptMatchRate =
        conceptEvaluable === 0
            ? null
            : Number((conceptMatches / conceptEvaluable).toFixed(4));

    const evaluation = {
        packId: pack.packId,
        clipName: pack.clipName,
        segmentCount: pack.segmentLabels.length,
        labeledSegments,
        calibrationCount,
        holdoutCount,
        ignoredCount,
        weakOrOccludedCount,
        familyMatchRate,
        conceptMatchRate,
        confusionHotspots,
        uncoveredConcepts,
        segmentsNeedingLabels,
    };
    await writeFile(outPath, JSON.stringify(evaluation, null, 2) + "\n");
    console.log(
        `[labelpack:evaluate] ${labeledSegments}/${pack.segmentLabels.length} labeled, family match ${familyMatchRate}, concept match ${conceptMatchRate ?? "n/a"}, hotspots ${confusionHotspots.length}`,
    );
}

main().catch((error) => {
    console.error("[labelpack:evaluate] FAILED:", error);
    process.exit(1);
});
