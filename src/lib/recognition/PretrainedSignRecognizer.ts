/**
 * Pretrained-style sign recognizer MVP.
 *
 * Wraps the bundled SignVocabModel (a linear classifier over per-segment
 * blind-export features) and produces per-segment English glosses with real
 * softmax probabilities. This is the first non-stub model-backed recognizer
 * in the registry.
 *
 * Replacement plan when a real ONNX / WLASL model is ready:
 *  - Keep this class. Swap loadBundledSignVocabModel() with a loader that
 *    reads weights from an ONNX runtime / WASM session and returns the same
 *    probability vector per segment.
 *  - Caller-facing TranslationResult shape does not change.
 */

import type { BlindExportLike } from "@/lib/labels/labelPack";
import {
    LOW_CONFIDENCE_THRESHOLD,
    toConfidencePercent,
    type Recognizer,
    type RecognizerInput,
    type TranslationAlternative,
    type TranslationResult,
    type TranslationSegment,
} from "@/lib/recognition/Recognizer";
import {
    buildSegmentFeatures,
    loadBundledSignVocabModel,
    scoreSegment,
    type SignVocabModel,
    type VocabPrediction,
} from "@/lib/recognition/pretrained/SignVocabModel";

export const PRETRAINED_RECOGNIZER_ID = "pretrained-sign-vocab-semantic-confidence@4";

export interface PretrainedSignRecognizerOptions {
    model?: SignVocabModel;
    id?: string;
    description?: string;
}

export class PretrainedSignRecognizer implements Recognizer {
    readonly id: string;
    readonly kind = "pretrained" as const;
    readonly description: string;
    private readonly model: SignVocabModel | null;
    private readonly loadError: string | null;

    constructor(options: PretrainedSignRecognizerOptions = {}) {
        this.id = options.id ?? PRETRAINED_RECOGNIZER_ID;
        this.description =
            options.description ??
            "Local semantic-breadth linear classifier over blind-export features (sign-vocab-semantic-confidence@4). Calibrated broader local head; replace weights with an ONNX/WLASL head to scale.";
        let model: SignVocabModel | null = options.model ?? null;
        let loadError: string | null = null;
        if (!model) {
            try {
                model = loadBundledSignVocabModel();
            } catch (err) {
                loadError = err instanceof Error ? err.message : String(err);
            }
        }
        this.model = model;
        this.loadError = loadError;
    }

    isReady(): boolean {
        return this.model !== null;
    }

    notReadyReason(): string | null {
        if (this.model) return null;
        return this.loadError ?? "Pretrained vocab model failed to load.";
    }

    async recognize(input: RecognizerInput): Promise<TranslationResult | null> {
        if (!this.model) return null;
        const blindExport: BlindExportLike | undefined = input.blindExport;
        if (!blindExport || !Array.isArray(blindExport.segments) || blindExport.segments.length === 0) {
            return null;
        }

        const segments: TranslationSegment[] = [];
        const segmentRunnerUps: Array<VocabPrediction | null> = [];
        let sumConfidence = 0;
        let lowestSegmentConfidence = 1;
        let lowestBlindMargin = 1;
        let tightBlindMarginCount = 0;

        for (const rawSegment of blindExport.segments) {
            const blindMargin = Number(rawSegment.confidenceMargin ?? 0);
            if (Number.isFinite(blindMargin)) {
                lowestBlindMargin = Math.min(lowestBlindMargin, blindMargin);
                if (blindMargin < 0.1) tightBlindMarginCount++;
            }
            const features = buildSegmentFeatures(rawSegment);
            const ranked = scoreSegment(this.model, features);
            const top = ranked[0];
            const second = ranked[1] ?? null;
            const family =
                (rawSegment as { eventFamilyHypothesis?: string }).eventFamilyHypothesis;
            const text = top ? top.gloss : "[unknown]";
            const confidence = top ? top.probability : 0;
            sumConfidence += confidence;
            if (confidence < lowestSegmentConfidence) lowestSegmentConfidence = confidence;
            segments.push({
                id: String(rawSegment.id ?? `seg-${segments.length + 1}`),
                startMs: Number(rawSegment.startMs ?? 0),
                endMs: Number(rawSegment.endMs ?? 0),
                family,
                text,
                confidence,
            });
            segmentRunnerUps.push(second);
        }

        const meanConfidence = sumConfidence / Math.max(1, segments.length);
        // Blend per-segment mean with the worst segment so a single weak
        // segment correctly drags the overall confidence down.
        const overallConfidence = Math.max(0, Math.min(1, 0.7 * meanConfidence + 0.3 * lowestSegmentConfidence));
        const hasWeakBlindMargins = tightBlindMarginCount >= Math.ceil(segments.length / 2);
        const isLowConfidence =
            overallConfidence < LOW_CONFIDENCE_THRESHOLD ||
            lowestSegmentConfidence < 0.25 ||
            hasWeakBlindMargins;

        const transcript = segments.map((s) => s.text).join(" ");

        const alternatives: TranslationAlternative[] = [];
        const runnerUpTranscript = segmentRunnerUps
            .map((alt, i) => alt?.gloss ?? segments[i].text)
            .join(" ");
        if (runnerUpTranscript && runnerUpTranscript !== transcript) {
            const runnerUpConfidence = Math.max(
                0,
                Math.min(
                    overallConfidence,
                    segmentRunnerUps.reduce((acc, alt) => acc + (alt?.probability ?? 0), 0) /
                    Math.max(1, segments.length),
                ),
            );
            alternatives.push({
                text: runnerUpTranscript,
                confidence: runnerUpConfidence,
                source: "pretrained",
            });
        }

        const reasons: string[] = [];
        if (isLowConfidence) {
            if (lowestSegmentConfidence < 0.25) {
                reasons.push(
                    `at least one segment has model probability below 25% (${Math.round(lowestSegmentConfidence * 100)}%)`,
                );
            }
            if (meanConfidence < LOW_CONFIDENCE_THRESHOLD) {
                reasons.push(
                    `mean per-segment model probability is ${Math.round(meanConfidence * 100)}%; local head has a compact ${this.model.vocab.length}-word vocabulary so out-of-vocab segments stay uncertain`,
                );
            }
            if (hasWeakBlindMargins) {
                reasons.push(
                    `${tightBlindMarginCount}/${segments.length} blind-family margins are below 0.10 (lowest ${lowestBlindMargin.toFixed(3)})`,
                );
            }
        }

        return {
            transcript,
            confidence: overallConfidence,
            confidencePercent: toConfidencePercent(overallConfidence),
            isLowConfidence,
            lowConfidenceReason: reasons.length ? reasons.join("; ") : null,
            alternatives,
            source: "pretrained",
            modelId: this.id,
            segments,
            generatedAt: input.nowIso ?? new Date().toISOString(),
            adapterApplied: false,
        };
    }
}
