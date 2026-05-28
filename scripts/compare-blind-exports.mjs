/**
 * Pure-JS port of compareBlindInferenceReports for offline comparison of two
 * blind inference exports. Mirrors src/lib/video/BlindInferenceCompare.ts.
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

function metric(baseline, current) {
    return {
        baseline,
        current,
        delta: Number((current - baseline).toFixed(4)),
    };
}

function countBy(values) {
    return values.reduce((acc, value) => {
        acc[value] = (acc[value] ?? 0) + 1;
        return acc;
    }, {});
}

function mergeCounts(baseline, current, keyName) {
    const keys = Array.from(
        new Set([...Object.keys(baseline), ...Object.keys(current)]),
    ).sort();
    return keys.map((key) => ({
        [keyName]: key,
        baseline: baseline[key] ?? 0,
        current: current[key] ?? 0,
        delta: (current[key] ?? 0) - (baseline[key] ?? 0),
    }));
}

function compareBlindInferenceReports(baseline, current) {
    const baselineFamilyCounts = countBy(
        baseline.segments.map((s) => s.eventFamilyHypothesis),
    );
    const currentFamilyCounts = countBy(
        current.segments.map((s) => s.eventFamilyHypothesis),
    );
    const baselineFailureCounts = countBy(
        baseline.summary.improveNext.failureTagCounts.flatMap((i) =>
            Array.from({ length: i.count }, () => i.tag),
        ),
    );
    const currentFailureCounts = countBy(
        current.summary.improveNext.failureTagCounts.flatMap((i) =>
            Array.from({ length: i.count }, () => i.tag),
        ),
    );
    const baselineConfusionCounts = Object.fromEntries(
        baseline.summary.improveNext.likelyConfusionPairs.map((i) => [
            i.pair,
            i.count,
        ]),
    );
    const currentConfusionCounts = Object.fromEntries(
        current.summary.improveNext.likelyConfusionPairs.map((i) => [
            i.pair,
            i.count,
        ]),
    );

    return {
        baselineClipName: baseline.clipName,
        currentClipName: current.clipName,
        metrics: {
            segmentCount: metric(
                baseline.segments.length,
                current.segments.length,
            ),
            lexemeCount: metric(baseline.lexemes.length, current.lexemes.length),
            genericUnknownCount: metric(
                baseline.summary.metrics.genericUnknownCount,
                current.summary.metrics.genericUnknownCount,
            ),
            eventFamilyDiversity: metric(
                baseline.summary.metrics.eventFamilyDiversity,
                current.summary.metrics.eventFamilyDiversity,
            ),
            repeatedPatternCount: metric(
                baseline.summary.repeatedPatterns.length,
                current.summary.repeatedPatterns.length,
            ),
            unresolvedSegmentCount: metric(
                baseline.summary.unresolvedSegments.length,
                current.summary.unresolvedSegments.length,
            ),
            averageConfidenceMargin: metric(
                baseline.summary.metrics.averageConfidenceMargin,
                current.summary.metrics.averageConfidenceMargin,
            ),
            refinementCount: metric(
                baseline.summary.metrics.refinementCount,
                current.summary.metrics.refinementCount,
            ),
        },
        familyCounts: mergeCounts(
            baselineFamilyCounts,
            currentFamilyCounts,
            "label",
        ),
        focusFamilyCounts: {
            fingerspell: metric(
                baselineFamilyCounts["fingerspell/emphatic-letter-sequence-like"] ?? 0,
                currentFamilyCounts["fingerspell/emphatic-letter-sequence-like"] ?? 0,
            ),
            bigFall: metric(
                baselineFamilyCounts["big-fall-like"] ?? 0,
                currentFamilyCounts["big-fall-like"] ?? 0,
            ),
            approval: metric(
                baselineFamilyCounts["approval/celebration-like"] ?? 0,
                currentFamilyCounts["approval/celebration-like"] ?? 0,
            ),
        },
        failureTagCounts: mergeCounts(
            baselineFailureCounts,
            currentFailureCounts,
            "tag",
        ),
        likelyConfusionPairs: mergeCounts(
            baselineConfusionCounts,
            currentConfusionCounts,
            "pair",
        ),
        topChainDifferences: {
            eventFamily: {
                baseline: baseline.summary.topEventChain,
                current: current.summary.topEventChain,
                changed:
                    baseline.summary.topEventChain !== current.summary.topEventChain,
            },
            lexeme: {
                baseline: baseline.summary.topLexemeChain,
                current: current.summary.topLexemeChain,
                changed:
                    baseline.summary.topLexemeChain !== current.summary.topLexemeChain,
            },
        },
    };
}

async function main() {
    const [baselineArg, currentArg, outArg] = process.argv.slice(2);
    if (!baselineArg || !currentArg || !outArg) {
        console.error(
            "Usage: node scripts/compare-blind-exports.mjs <baseline.json> <current.json> <out.json>",
        );
        process.exit(2);
    }
    const baseline = JSON.parse(await readFile(resolve(baselineArg), "utf8"));
    const current = JSON.parse(await readFile(resolve(currentArg), "utf8"));
    const compare = compareBlindInferenceReports(baseline, current);
    await writeFile(resolve(outArg), JSON.stringify(compare, null, 2) + "\n");
    console.log(`[compare] wrote comparison to ${outArg}`);
    console.log(
        `[compare] event chain changed: ${compare.topChainDifferences.eventFamily.changed}`,
    );
    console.log(
        `[compare] avg margin delta: ${compare.metrics.averageConfidenceMargin.delta}`,
    );
}

main().catch((error) => {
    console.error("[compare] FAILED:", error);
    process.exit(1);
});
