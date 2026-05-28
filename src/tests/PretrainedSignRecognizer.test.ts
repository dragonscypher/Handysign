import type { BlindExportLike } from "@/lib/labels/labelPack";
import {
    PRETRAINED_RECOGNIZER_ID,
    PretrainedSignRecognizer,
} from "@/lib/recognition/PretrainedSignRecognizer";
import {
    buildSegmentFeatures,
    listBundledSignVocabModels,
    loadBundledLearnedSubsetModel,
    loadBundledSignVocabModel,
    scoreSegment,
} from "@/lib/recognition/pretrained/SignVocabModel";
import { describe, expect, it } from "vitest";

function makeSegment(
    id: string,
    family: string,
    runnerUp: string | null,
    margin: number,
    overrides: Record<string, unknown> = {},
): BlindExportLike["segments"][number] {
    return {
        id,
        startMs: 0,
        endMs: 1000,
        eventFamilyHypothesis: family,
        runnerUpFamily: runnerUp,
        confidenceMargin: margin,
        ...overrides,
    } as BlindExportLike["segments"][number];
}

describe("SignVocabModel", () => {
    it("bundled model loads with a non-empty vocab", () => {
        const m = loadBundledSignVocabModel();
        expect(m.vocab.length).toBeGreaterThan(0);
        expect(m.id).toMatch(/sign-vocab/);
    });

    it("loads the learned subset candidate without replacing the active fallback", () => {
        const active = loadBundledSignVocabModel();
        const candidate = loadBundledLearnedSubsetModel();
        expect(candidate.id).toBe("sign-vocab-learned-subset@1");
        expect(candidate.deployment?.status).toBe("candidate");
        expect(candidate.deployment?.activeFallbackModelId).toBe(active.id);
        expect(candidate.training?.sample3Excluded).toBe(true);
        expect(candidate.training?.sourceManifest).toBe(
            "docs/artifacts/local-head-training-manifest-2026-05-28.json",
        );
        expect(candidate.training?.readyForActivation).toBe(false);
        expect(listBundledSignVocabModels().map((model) => model.id)).toEqual([
            candidate.id,
            active.id,
        ]);
    });

    it("scoreSegment returns a normalized probability distribution sorted desc", () => {
        const m = loadBundledSignVocabModel();
        const features = buildSegmentFeatures(
            makeSegment("seg", "chop/cut-like", "repeated-tool-use-like", 0.2),
        );
        const ranked = scoreSegment(m, features);
        expect(ranked.length).toBe(m.vocab.length);
        const total = ranked.reduce((acc, x) => acc + x.probability, 0);
        expect(total).toBeCloseTo(1, 5);
        for (let i = 1; i < ranked.length; i++) {
            expect(ranked[i - 1].probability).toBeGreaterThanOrEqual(ranked[i].probability);
        }
    });

    it("family signal dominates: chop family ranks a chop-related gloss above unrelated glosses", () => {
        const m = loadBundledSignVocabModel();
        const features = buildSegmentFeatures(
            makeSegment("seg", "chop/cut-like", "repeated-tool-use-like", 0.3),
        );
        const ranked = scoreSegment(m, features);
        const top = ranked[0].gloss;
        expect(["CHOP", "HAMMER", "WORK"]).toContain(top);
        const drinkRank = ranked.findIndex((p) => p.gloss === "DRINK");
        const chopRank = ranked.findIndex((p) => p.gloss === "CHOP");
        expect(chopRank).toBeLessThan(drinkRank);
    });

    it("family calibration prevents unrelated glosses from diluting an unseen-style segment", () => {
        const m = loadBundledSignVocabModel();
        const features = buildSegmentFeatures(
            makeSegment("seg", "object-fall-like", "carry/hold-object-like", 0.07, {
                bodyReactionStats: { headBounce: 0.14, torsoDisplacement: 0.16 },
                qualitySignals: { faceVisibleRatio: 1, mouthStability: 0.98 },
            }),
        );
        const ranked = scoreSegment(m, features);
        expect(ranked[0].gloss).toBe("FALL");
        expect(ranked[0].probability).toBeGreaterThan(0.55);
    });

    it("uses motif and weak-margin signals to pick broader semantic glosses", () => {
        const m = loadBundledSignVocabModel();
        const features = buildSegmentFeatures(
            makeSegment("seg", "repeated-tool-use-like", "chop/cut-like", 0.02, {
                qualitySignals: { faceVisibleRatio: 1, mouthStability: 0.99, motionEnergy: 0.12 },
                handshapeChangeStats: { volatility: 0.4, compactBurstScore: 0.7 },
                motifTags: ["repeated-action-loop", "repeated-compact-handshape-sequence"],
                phases: [
                    { kind: "setup" },
                    { kind: "repeated-action-loop" },
                    { kind: "release/fall" },
                ],
            }),
        );
        const ranked = scoreSegment(m, features);
        expect(["EXPLAIN", "TELL", "LEARN"]).toContain(ranked[0].gloss);
        expect(ranked.findIndex((p) => p.gloss === ranked[0].gloss)).toBeLessThan(
            ranked.findIndex((p) => p.gloss === "HAMMER"),
        );
    });
});

describe("PretrainedSignRecognizer", () => {
    it("isReady returns true with the bundled model", () => {
        const r = new PretrainedSignRecognizer();
        expect(r.isReady()).toBe(true);
        expect(r.id).toBe(PRETRAINED_RECOGNIZER_ID);
        expect(r.kind).toBe("pretrained");
    });

    it("produces real per-segment glosses and a transcript", async () => {
        const r = new PretrainedSignRecognizer();
        const blindExport: BlindExportLike = {
            id: "blind-1",
            clipName: "t.mp4",
            segments: [
                makeSegment("seg-01", "chop/cut-like", "repeated-tool-use-like", 0.25),
                makeSegment("seg-02", "drink-like", "phone/call-like", 0.4, {
                    qualitySignals: { faceVisibleRatio: 1, mouthStability: 0.9 },
                }),
                makeSegment("seg-03", "big-fall-like", "impact/bounce-like", 0.3, {
                    bodyReactionStats: { headBounce: 0.6, torsoDisplacement: 0.5 },
                }),
            ],
        };
        const out = await r.recognize({ clipName: "t.mp4", blindExport, nowIso: "2026-05-18T00:00:00Z" });
        expect(out).not.toBeNull();
        expect(out!.source).toBe("pretrained");
        expect(out!.modelId).toBe(PRETRAINED_RECOGNIZER_ID);
        expect(out!.segments).toHaveLength(3);
        // top gloss in seg-02 should be drink-related; seg-03 fall-related
        const seg2 = out!.segments[1].text;
        const seg3 = out!.segments[2].text;
        expect(["DRINK", "PHONE"]).toContain(seg2);
        expect(["FALL", "DROP", "BOUNCE", "HIT"]).toContain(seg3);
        expect(out!.transcript.split(" ")).toHaveLength(3);
    });

    it("returns null on missing blind export", async () => {
        const r = new PretrainedSignRecognizer();
        expect(await r.recognize({ clipName: "x" })).toBeNull();
    });

    it("flags low confidence with a reason when the top probability per segment is small", async () => {
        const r = new PretrainedSignRecognizer();
        // A made-up family the bundled vocab has no strong weight for.
        const blindExport: BlindExportLike = {
            id: "blind-2",
            clipName: "u.mp4",
            segments: [
                makeSegment("seg-01", "totally-unknown-family", null, 0.0),
                makeSegment("seg-02", "another-unknown-family", null, 0.0),
            ],
        };
        const out = await r.recognize({ clipName: "u.mp4", blindExport });
        expect(out!.isLowConfidence).toBe(true);
        expect(out!.lowConfidenceReason).toMatch(/probability|out-of-vocab|MVP/i);
    });

    it("keeps low-confidence warning when blind margins are weak", async () => {
        const r = new PretrainedSignRecognizer();
        const blindExport: BlindExportLike = {
            id: "blind-3",
            clipName: "sample3-like.mp4",
            segments: [
                makeSegment("seg-01", "object-fall-like", "carry/hold-object-like", 0.07),
                makeSegment("seg-02", "repeated-tool-use-like", "chop/cut-like", 0.0),
                makeSegment("seg-03", "carry/hold-object-like", "sit/pause-like", 0.08),
            ],
        };
        const out = await r.recognize({ clipName: "sample3-like.mp4", blindExport });
        expect(out).not.toBeNull();
        expect(out!.segments.every((segment) => segment.text !== "[unknown]")).toBe(true);
        expect(out!.confidence).toBeGreaterThan(0.25);
        expect(out!.isLowConfidence).toBe(true);
        expect(out!.lowConfidenceReason).toMatch(/blind-family margins/i);
    });
});
