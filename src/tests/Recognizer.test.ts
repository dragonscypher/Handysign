import type { BlindExportLike } from "@/lib/labels/labelPack";
import { AdaptedRecognizer } from "@/lib/recognition/AdaptedRecognizer";
import { BaselineRecognizer, toBlindExportLike } from "@/lib/recognition/BaselineRecognizer";
import { CustomSignLexicon } from "@/lib/recognition/CustomSignLexicon";
import { PretrainedRecognizerStub } from "@/lib/recognition/PretrainedRecognizerStub";
import { LOW_CONFIDENCE_THRESHOLD, toConfidencePercent } from "@/lib/recognition/Recognizer";
import { RecognizerRegistry } from "@/lib/recognition/RecognizerRegistry";
import { describe, expect, it } from "vitest";

function makeExport(margins: number[]): BlindExportLike {
    return {
        id: "blind-test",
        clipName: "test.mp4",
        segments: margins.map((margin, index) => ({
            id: `seg-${String(index + 1).padStart(2, "0")}`,
            startMs: index * 1000,
            endMs: index * 1000 + 800,
            eventFamilyHypothesis: "chop/cut-like",
            runnerUpFamily: "repeated-tool-use-like",
            confidenceMargin: margin,
        })),
    };
}

describe("toConfidencePercent", () => {
    it("clamps to 0..100", () => {
        expect(toConfidencePercent(-0.5)).toBe(0);
        expect(toConfidencePercent(1.5)).toBe(100);
        expect(toConfidencePercent(0.732)).toBe(73);
    });
});

describe("BaselineRecognizer", () => {
    it("returns null on missing blind export", async () => {
        const r = new BaselineRecognizer();
        expect(await r.recognize({ clipName: "x" })).toBeNull();
    });

    it("emits transcript + per-segment confidence and flags low confidence on tight margins", async () => {
        const r = new BaselineRecognizer();
        const out = await r.recognize({
            clipName: "tight.mp4",
            blindExport: makeExport([0.05, 0.07, 0.06]),
            nowIso: "2026-05-18T00:00:00Z",
        });
        expect(out).not.toBeNull();
        expect(out!.source).toBe("baseline");
        expect(out!.segments).toHaveLength(3);
        expect(out!.transcript).toContain("chopping or cutting motion");
        expect(out!.confidence).toBeLessThan(LOW_CONFIDENCE_THRESHOLD);
        expect(out!.isLowConfidence).toBe(true);
        expect(out!.lowConfidenceReason).toMatch(/margin|low|weak|pretrained/);
        expect(out!.confidencePercent).toBe(toConfidencePercent(out!.confidence));
    });

    it("reports stronger confidence on wide margins", async () => {
        const r = new BaselineRecognizer();
        const out = await r.recognize({
            clipName: "wide.mp4",
            blindExport: makeExport([0.4, 0.5, 0.6]),
        });
        expect(out!.confidence).toBeGreaterThan(0.6);
        expect(out!.isLowConfidence).toBe(false);
    });
});

describe("CustomSignLexicon", () => {
    it("rejects empty labels", () => {
        const lex = new CustomSignLexicon();
        expect(() => lex.upsert({ label: "  " })).toThrow();
    });

    it("upserts and finds by family hint, ignoring 'ignore' split", () => {
        const lex = new CustomSignLexicon();
        const a = lex.upsert({ label: "chop", familyHint: "chop/cut-like" });
        lex.upsert({ label: "ignored", familyHint: "chop/cut-like", split: "ignore" });
        const match = lex.findForFamily("chop/cut-like");
        expect(match?.id).toBe(a.id);
    });

    it("snapshot round-trips through validation", () => {
        const lex = new CustomSignLexicon();
        lex.upsert({ label: "fall", familyHint: "big-fall-like" });
        const snap = lex.toSnapshot();
        const lex2 = new CustomSignLexicon();
        lex2.loadSnapshot(snap);
        expect(lex2.size()).toBe(1);
    });

    it("rejects snapshots with forbidden keys", () => {
        const lex = new CustomSignLexicon();
        expect(() =>
            lex.loadSnapshot({
                schemaVersion: 1,
                exportedAt: "2026-05-18T00:00:00Z",
                // @ts-expect-error injecting forbidden key for test
                transcript: "hidden answer",
                entries: [],
            }),
        ).toThrow(/forbidden|transcript/);
    });
});

describe("AdaptedRecognizer", () => {
    it("rewrites matching segments with custom sign labels and bumps confidence", async () => {
        const lex = new CustomSignLexicon();
        lex.upsert({ label: "CHOP-WOOD", familyHint: "chop/cut-like" });
        const baseline = new BaselineRecognizer();
        const adapted = new AdaptedRecognizer({ base: baseline, lexicon: lex });
        const out = await adapted.recognize({
            clipName: "x.mp4",
            blindExport: makeExport([0.2, 0.2, 0.2]),
        });
        expect(out).not.toBeNull();
        expect(out!.source).toBe("adapted");
        expect(out!.adapterApplied).toBe(true);
        expect(out!.transcript).toContain("CHOP-WOOD");
        expect(out!.alternatives.some((alt) => alt.source === "baseline")).toBe(true);
    });

    it("passes through baseline result when lexicon empty", async () => {
        const lex = new CustomSignLexicon();
        const baseline = new BaselineRecognizer();
        const adapted = new AdaptedRecognizer({ base: baseline, lexicon: lex });
        const out = await adapted.recognize({
            clipName: "x.mp4",
            blindExport: makeExport([0.2]),
        });
        expect(out!.source).toBe("baseline");
        expect(out!.adapterApplied).toBe(false);
    });
});

describe("RecognizerRegistry", () => {
    it("skips not-ready recognizers and falls through to baseline", async () => {
        const lex = new CustomSignLexicon();
        const baseline = new BaselineRecognizer();
        const adapted = new AdaptedRecognizer({ base: baseline, lexicon: lex });
        const pretrained = new PretrainedRecognizerStub();
        const registry = new RecognizerRegistry([
            { recognizer: pretrained },
            { recognizer: adapted },
            { recognizer: baseline },
        ]);
        const out = await registry.translate({
            clipName: "x.mp4",
            blindExport: makeExport([0.2]),
        });
        expect(out).not.toBeNull();
        // Empty lexicon makes adapted pass through to baseline:
        expect(out!.source).toBe("baseline");
    });

    it("returns null when no recognizer can produce output", async () => {
        const pretrained = new PretrainedRecognizerStub();
        const registry = new RecognizerRegistry([{ recognizer: pretrained }]);
        const out = await registry.translate({ clipName: "x.mp4" });
        expect(out).toBeNull();
    });
});

describe("toBlindExportLike", () => {
    it("normalizes raw JSON into a BlindExportLike", () => {
        const raw = {
            id: "id1",
            clipName: "y.mp4",
            segments: [
                {
                    id: "seg-01",
                    startMs: "0",
                    endMs: "1000",
                    eventFamilyHypothesis: "chop/cut-like",
                    runnerUpFamily: null,
                    confidenceMargin: "0.2",
                },
            ],
        };
        const out = toBlindExportLike(raw);
        expect(out?.segments[0].startMs).toBe(0);
        expect(out?.segments[0].confidenceMargin).toBeCloseTo(0.2);
    });

    it("rejects non-objects", () => {
        expect(toBlindExportLike(null)).toBeNull();
        expect(toBlindExportLike(42)).toBeNull();
    });
});
