/**
 * Derive the human-readable *-summary-*.json for a blind inference export.
 * Usage: node scripts/derive-blind-summary.mjs <fullExport.json> <summaryOut.json>
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

async function main() {
    const inPath = resolve(process.argv[2]);
    const outPath = resolve(process.argv[3]);
    const report = JSON.parse(await readFile(inPath, "utf8"));

    const segments = report.segments ?? [];
    const summary = report.summary ?? {};
    const familyCounts = new Map();

    for (const segment of segments) {
        const family = segment.eventFamilyHypothesis;
        familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1);
    }

    const familyCountsList = [...familyCounts.entries()].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );

    const NEW_FAMILIES = new Set([
        "impact/bounce-like",
        "big-fall-like",
        "fingerspell/emphatic-letter-sequence-like",
        "approval/celebration-like",
        "phone/call-like",
        "inspect/listen-like",
        "confusion/realization-like",
    ]);
    const firedNewFamilies = familyCountsList
        .map(([label]) => label)
        .filter((label) => NEW_FAMILIES.has(label));

    const out = {
        segmentCount: segments.length,
        topEventChain: summary.topEventChain ?? null,
        topLexemeChain: summary.topLexemeChain ?? null,
        familyCounts: familyCountsList,
        firedNewFamilies,
        metrics: summary.metrics ?? {},
        failureTagCounts: summary.improveNext?.failureTagCounts ?? [],
        likelyConfusionPairs: summary.improveNext?.likelyConfusionPairs ?? [],
        segments: segments.map((seg) => ({
            id: seg.id,
            family: seg.eventFamilyHypothesis,
            runnerUp: seg.runnerUpFamily,
            margin: seg.confidenceMargin,
            phaseVotes: seg.phaseFamilyVotes ?? [],
            failureTags: seg.failureTags ?? [],
            motifTags: seg.motifTags ?? [],
            reason: seg.hypothesisReason,
        })),
    };

    await writeFile(outPath, JSON.stringify(out, null, 2) + "\n");
    console.log(
        `[summary] wrote ${out.segments.length} segments to ${outPath} (top: ${out.topEventChain})`,
    );
}

main().catch((error) => {
    console.error("[summary] FAILED:", error);
    process.exit(1);
});
