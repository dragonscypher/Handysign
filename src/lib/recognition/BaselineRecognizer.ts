/**
 * Baseline recognizer.
 *
 * Wraps the existing blind family inference export and renders it as a
 * coarse English phrase per segment. Used as the floor recognizer: always
 * available when a blind export is present, but should report low confidence
 * unless the export's per-segment margins are healthy.
 *
 * Confidence model:
 *  - Per-segment confidence = sigmoid-like map of confidenceMargin into [0, 1].
 *  - Overall confidence = mean of per-segment confidences, then reduced by:
 *      * low-confidence-competition failure tags (count / N)
 *      * mouth-face-cue-weak / hand-visibility-weak (each reduces by a small
 *        fixed fraction)
 *  - isLowConfidence = (overall < LOW_CONFIDENCE_THRESHOLD) OR any segment
 *    has confidenceMargin < 0.10.
 */

import type { BlindExportLike } from "@/lib/labels/labelPack";
import {
    LOW_CONFIDENCE_THRESHOLD,
    toConfidencePercent,
    type Recognizer,
    type RecognizerInput,
    type TranslationResult,
    type TranslationSegment,
} from "@/lib/recognition/Recognizer";
import {
    joinFamilyPhrases,
    renderFamilyAsPhrase,
} from "@/lib/recognition/familyToPhrase";

interface BlindSegmentWithTags {
    id: string;
    startMs: number;
    endMs: number;
    eventFamilyHypothesis: string;
    runnerUpFamily: string | null;
    confidenceMargin: number;
    failureTags?: string[];
}

function optionalRecord(value: unknown): Record<string, number> | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    return value as Record<string, number>;
}

function optionalPhases(value: unknown): Array<Record<string, unknown>> | undefined {
    if (!Array.isArray(value)) return undefined;
    return value.filter(
        (item): item is Record<string, unknown> =>
            !!item && typeof item === "object" && !Array.isArray(item),
    );
}

function optionalStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    return value.filter((item): item is string => typeof item === "string");
}

export const BASELINE_RECOGNIZER_ID = "baseline-blind-family@1";

export class BaselineRecognizer implements Recognizer {
    readonly id = BASELINE_RECOGNIZER_ID;
    readonly kind = "baseline" as const;
    readonly description =
        "Family-level blind decoder rendered as a coarse English phrase. Honest about being a guess.";

    async recognize(input: RecognizerInput): Promise<TranslationResult | null> {
        const blindExport = input.blindExport;
        if (!blindExport || !Array.isArray(blindExport.segments)) return null;
        if (blindExport.segments.length === 0) return null;

        const segments: TranslationSegment[] = [];
        let sumConfidence = 0;
        let tightMarginCount = 0;
        let lowMarginFlag = false;
        const failureTagCounts = new Map<string, number>();

        for (const rawSegment of blindExport.segments) {
            const segment = rawSegment as BlindSegmentWithTags;
            const margin = Number.isFinite(segment.confidenceMargin)
                ? segment.confidenceMargin
                : 0;
            const segmentConfidence = marginToConfidence(margin);
            if (margin < 0.1) lowMarginFlag = true;
            if (margin < 0.15) tightMarginCount++;
            for (const tag of segment.failureTags ?? []) {
                failureTagCounts.set(tag, (failureTagCounts.get(tag) ?? 0) + 1);
            }
            segments.push({
                id: segment.id,
                startMs: segment.startMs,
                endMs: segment.endMs,
                family: segment.eventFamilyHypothesis,
                text: renderFamilyAsPhrase(segment.eventFamilyHypothesis),
                confidence: segmentConfidence,
            });
            sumConfidence += segmentConfidence;
        }

        const meanConfidence = sumConfidence / segments.length;
        const lowCompetitionShare =
            (failureTagCounts.get("low-confidence-competition") ?? 0) / segments.length;
        const mouthWeak =
            (failureTagCounts.get("mouth-face-cue-weak") ?? 0) / segments.length;
        const handWeak =
            (failureTagCounts.get("hand-visibility-weak") ?? 0) / segments.length;
        const tagPenalty =
            lowCompetitionShare * 0.25 + mouthWeak * 0.1 + handWeak * 0.1;
        const overallConfidence = Math.max(
            0,
            Math.min(1, meanConfidence * (1 - tagPenalty)),
        );

        const transcript = joinFamilyPhrases(segments.map((s) => s.text));
        const runnerUpTranscript = joinFamilyPhrases(
            blindExport.segments.map((segment) =>
                renderFamilyAsPhrase(segment.runnerUpFamily ?? ""),
            ),
        );

        const isLowConfidence =
            overallConfidence < LOW_CONFIDENCE_THRESHOLD ||
            lowMarginFlag ||
            tightMarginCount >= Math.ceil(segments.length / 2);
        const reasons: string[] = [];
        if (lowMarginFlag) {
            reasons.push("at least one segment has a margin below 0.10");
        }
        if (lowCompetitionShare > 0.5) {
            reasons.push(
                `${Math.round(lowCompetitionShare * 100)}% of segments tagged low-confidence-competition`,
            );
        }
        if (mouthWeak > 0) {
            reasons.push("mouth/face cues weak on at least one segment");
        }
        if (handWeak > 0) {
            reasons.push("hand visibility weak on at least one segment");
        }
        if (reasons.length === 0 && isLowConfidence) {
            reasons.push(
                "family-level decoder cannot produce word-accurate transcripts without a pretrained sign model",
            );
        }

        return {
            transcript,
            confidence: overallConfidence,
            confidencePercent: toConfidencePercent(overallConfidence),
            isLowConfidence,
            lowConfidenceReason: reasons.length ? reasons.join("; ") : null,
            alternatives: runnerUpTranscript
                ? [
                    {
                        text: runnerUpTranscript,
                        confidence: Math.max(0, overallConfidence - 0.1),
                        source: "baseline",
                    },
                ]
                : [],
            source: "baseline",
            modelId: this.id,
            segments,
            generatedAt: input.nowIso ?? new Date().toISOString(),
            adapterApplied: false,
        };
    }
}

function marginToConfidence(margin: number): number {
    if (!Number.isFinite(margin) || margin <= 0) return 0.3;
    // Tuned so margin 0.10 -> ~0.45, 0.15 -> ~0.55, 0.30 -> ~0.75, 0.50 -> ~0.88.
    return 1 - Math.exp(-Math.max(margin, 0) * 4);
}

/** Convenience: shape a BlindExportLike object from the JSON download blob. */
export function toBlindExportLike(value: unknown): BlindExportLike | null {
    if (!value || typeof value !== "object") return null;
    const obj = value as Record<string, unknown>;
    if (!Array.isArray(obj.segments)) return null;
    return {
        id: typeof obj.id === "string" ? obj.id : undefined,
        clipName: typeof obj.clipName === "string" ? obj.clipName : undefined,
        segments: obj.segments
            .filter(
                (segment): segment is Record<string, unknown> =>
                    !!segment && typeof segment === "object",
            )
            .map((segment) => ({
                id: String(segment.id ?? ""),
                startMs: Number(segment.startMs ?? 0),
                endMs: Number(segment.endMs ?? 0),
                eventFamilyHypothesis: String(
                    segment.eventFamilyHypothesis ?? "",
                ),
                runnerUpFamily:
                    typeof segment.runnerUpFamily === "string"
                        ? segment.runnerUpFamily
                        : null,
                confidenceMargin: Number(segment.confidenceMargin ?? 0),
                qualitySignals: optionalRecord(segment.qualitySignals),
                bodyReactionStats: optionalRecord(segment.bodyReactionStats),
                handshapeChangeStats: optionalRecord(segment.handshapeChangeStats),
                motifTags: optionalStringArray(segment.motifTags),
                phases: optionalPhases(segment.phases),
            })),
    };
}
