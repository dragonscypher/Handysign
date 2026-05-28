#!/usr/bin/env node
/**
 * Create a starter privacy-safe label pack from a blind inference export.
 * Usage:
 *   node scripts/create-label-pack.mjs <blindExport.json> <labelPackOut.json> [packId]
 *
 * The starter pack contains one entry per segment with empty user labels,
 * split='ignore', quality='usable'. Edit the resulting JSON manually to
 * assign familyLabel / conceptLabel / split / quality / notes.
 *
 * The pack never includes raw video, pixel data, transcripts, or hidden
 * answer keys. Blind mode does not load this file automatically.
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const LABEL_PACK_VERSION = 1;

async function main() {
    const inPath = resolve(process.argv[2]);
    const outPath = resolve(process.argv[3]);
    const packId = process.argv[4];
    const report = JSON.parse(await readFile(inPath, "utf8"));
    if (!Array.isArray(report.segments)) {
        throw new Error("input does not look like a blind export (no segments[])");
    }
    const sourceId = report.id ?? "blind-export-unknown";
    const clipName = report.clipName ?? "unknown-clip";
    const pack = {
        schemaVersion: LABEL_PACK_VERSION,
        packId: packId ?? `labelpack-${sourceId}`,
        createdAt: new Date().toISOString(),
        sourceBlindExportId: sourceId,
        clipName,
        notes: "",
        segmentLabels: report.segments.map((segment) => ({
            segmentId: segment.id,
            startMs: segment.startMs,
            endMs: segment.endMs,
            predictedFamily: segment.eventFamilyHypothesis,
            runnerUpFamily: segment.runnerUpFamily ?? null,
            confidenceMargin: segment.confidenceMargin,
            familyLabel: "",
            conceptLabel: "",
            exactLabel: "",
            notes: "",
            split: "ignore",
            quality: "usable",
        })),
    };
    await writeFile(outPath, JSON.stringify(pack, null, 2) + "\n");
    console.log(
        `[labelpack] wrote ${pack.segmentLabels.length} segment slots to ${outPath} (pack ${pack.packId}, clip ${pack.clipName})`,
    );
}

main().catch((error) => {
    console.error("[labelpack] FAILED:", error);
    process.exit(1);
});
