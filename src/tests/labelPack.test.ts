import { describe, expect, it } from "vitest";
import {
    assertNoForbiddenFields,
    createStarterLabelPack,
    evaluateLabelPackAgainstExport,
    LABEL_PACK_VERSION,
    validateLabelPack,
    type BlindExportLike,
    type LabelPack,
} from "../lib/labels/labelPack";

const baseExport: BlindExportLike = {
    id: "blind-export-test-1",
    clipName: "sample 2.mp4",
    segments: [
        {
            id: "seg-01",
            startMs: 0,
            endMs: 1200,
            eventFamilyHypothesis: "impact/bounce-like",
            runnerUpFamily: "walk/continue-like",
            confidenceMargin: 0.0584,
        },
        {
            id: "seg-02",
            startMs: 1200,
            endMs: 2400,
            eventFamilyHypothesis: "chop/cut-like",
            runnerUpFamily: "repeated-tool-use-like",
            confidenceMargin: 0.0702,
        },
        {
            id: "seg-03",
            startMs: 2400,
            endMs: 3600,
            eventFamilyHypothesis: "chop/cut-like",
            runnerUpFamily: "repeated-tool-use-like",
            confidenceMargin: 0.0703,
        },
    ],
};

function buildPack(overrides: Partial<LabelPack> = {}): LabelPack {
    const pack = createStarterLabelPack(baseExport, {
        packId: "labelpack-test-1",
        createdAt: "2026-04-27T00:00:00.000Z",
    });
    return { ...pack, ...overrides };
}

describe("labelPack", () => {
    it("createStarterLabelPack mirrors export segments and leaves user labels blank", () => {
        const pack = buildPack();
        expect(pack.schemaVersion).toBe(LABEL_PACK_VERSION);
        expect(pack.clipName).toBe("sample 2.mp4");
        expect(pack.segmentLabels.map((label) => label.segmentId)).toEqual([
            "seg-01",
            "seg-02",
            "seg-03",
        ]);
        for (const label of pack.segmentLabels) {
            expect(label.familyLabel).toBe("");
            expect(label.conceptLabel).toBe("");
            expect(label.exactLabel).toBe("");
            expect(label.split).toBe("ignore");
            expect(label.quality).toBe("usable");
        }
    });

    it("validateLabelPack accepts a starter pack", () => {
        const pack = buildPack();
        const result = validateLabelPack(pack);
        expect(result.ok).toBe(true);
        expect(result.errors).toEqual([]);
    });

    it("validateLabelPack rejects forbidden fields and bad enums", () => {
        const pack = buildPack() as unknown as Record<string, unknown>;
        pack.transcript = "this is forbidden";
        const result = validateLabelPack(pack);
        expect(result.ok).toBe(false);
        expect(result.errors.some((error) => error.includes("transcript"))).toBe(true);
    });

    it("validateLabelPack rejects an unknown split value", () => {
        const pack = buildPack();
        (pack.segmentLabels[0] as unknown as { split: string }).split = "leak";
        const result = validateLabelPack(pack);
        expect(result.ok).toBe(false);
        expect(result.errors.some((error) => error.includes("split"))).toBe(true);
    });

    it("validateLabelPack rejects duplicate segment ids", () => {
        const pack = buildPack();
        pack.segmentLabels[1].segmentId = "seg-01";
        const result = validateLabelPack(pack);
        expect(result.ok).toBe(false);
        expect(result.errors.some((error) => error.includes("duplicated"))).toBe(true);
    });

    it("evaluateLabelPackAgainstExport reports family match rate and confusion hotspots", () => {
        const pack = buildPack();
        pack.segmentLabels[0].familyLabel = "impact/bounce-like";
        pack.segmentLabels[0].split = "calibration";
        pack.segmentLabels[1].familyLabel = "chop/cut-like";
        pack.segmentLabels[1].split = "holdout";
        pack.segmentLabels[2].familyLabel = "repeated-tool-use-like"; // disagreement
        pack.segmentLabels[2].split = "holdout";
        const evaluation = evaluateLabelPackAgainstExport(pack, baseExport);
        expect(evaluation.segmentCount).toBe(3);
        expect(evaluation.labeledSegments).toBe(3);
        expect(evaluation.calibrationCount).toBe(1);
        expect(evaluation.holdoutCount).toBe(2);
        expect(evaluation.familyMatchRate).toBeCloseTo(2 / 3, 3);
        expect(evaluation.confusionHotspots).toHaveLength(1);
        expect(evaluation.confusionHotspots[0]).toMatchObject({
            predictedFamily: "chop/cut-like",
            familyLabel: "repeated-tool-use-like",
            count: 1,
            segmentIds: ["seg-03"],
        });
    });

    it("evaluateLabelPackAgainstExport flags weak quality and segments still needing labels", () => {
        const pack = buildPack();
        pack.segmentLabels[0].split = "holdout";
        pack.segmentLabels[1].split = "calibration";
        pack.segmentLabels[1].quality = "occluded";
        pack.segmentLabels[1].familyLabel = "chop/cut-like";
        const evaluation = evaluateLabelPackAgainstExport(pack, baseExport);
        expect(evaluation.weakOrOccludedCount).toBe(1);
        expect(evaluation.segmentsNeedingLabels).toContain("seg-01");
        expect(evaluation.familyMatchRate).toBe(0); // seg-01 and seg-02 not eligible/matched
    });

    it("assertNoForbiddenFields catches deeply nested transcript", () => {
        const blob = {
            foo: { bar: { transcript: "leak" } },
        };
        const errors = assertNoForbiddenFields(blob);
        expect(errors).toContain("$.foo.bar.transcript forbidden");
    });
});
