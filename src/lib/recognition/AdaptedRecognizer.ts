/**
 * Adapter recognizer.
 *
 * Wraps any base Recognizer and applies the user's CustomSignLexicon to its
 * segment-level output. The adapter never invents content; it only rewrites
 * a segment's text when the user has explicitly registered a custom sign for
 * the same predicted family. Confidence is bumped per applied entry within a
 * small, bounded range so honest-uncertainty is preserved.
 */

import type { CustomSignLexicon } from "@/lib/recognition/CustomSignLexicon";
import {
    LOW_CONFIDENCE_THRESHOLD,
    toConfidencePercent,
    type Recognizer,
    type RecognizerInput,
    type TranslationResult,
    type TranslationSegment,
} from "@/lib/recognition/Recognizer";

export interface AdaptedRecognizerOptions {
    base: Recognizer;
    lexicon: CustomSignLexicon;
    id?: string;
    description?: string;
    /** Per-application confidence bump. Capped overall at 0.2. */
    perMatchBump?: number;
}

export class AdaptedRecognizer implements Recognizer {
    readonly id: string;
    readonly kind = "adapted" as const;
    readonly description: string;

    private readonly base: Recognizer;
    private readonly lexicon: CustomSignLexicon;
    private readonly perMatchBump: number;

    constructor(options: AdaptedRecognizerOptions) {
        this.base = options.base;
        this.lexicon = options.lexicon;
        this.id = options.id ?? `adapted-over-${options.base.id}`;
        this.description =
            options.description ??
            "Baseline recognizer overlaid with the user's local custom sign lexicon.";
        this.perMatchBump = Math.max(0, Math.min(0.1, options.perMatchBump ?? 0.05));
    }

    async recognize(input: RecognizerInput): Promise<TranslationResult | null> {
        const baseResult = await this.base.recognize(input);
        if (!baseResult) return null;
        if (this.lexicon.size() === 0) return baseResult;

        let totalBump = 0;
        let appliedCount = 0;
        const segments: TranslationSegment[] = baseResult.segments.map((segment) => {
            if (!segment.family) return segment;
            const match = this.lexicon.findForFamily(segment.family);
            if (!match) return segment;
            appliedCount++;
            totalBump += this.perMatchBump;
            return {
                ...segment,
                text: match.label,
                confidence: Math.min(1, segment.confidence + this.perMatchBump),
                customSignId: match.id,
            };
        });

        if (appliedCount === 0) return baseResult;

        const transcript = segments.map((s) => s.text).join(" ");
        const cappedBump = Math.min(totalBump / Math.max(1, segments.length), 0.2);
        const confidence = Math.min(1, baseResult.confidence + cappedBump);
        const isLowConfidence =
            baseResult.isLowConfidence || confidence < LOW_CONFIDENCE_THRESHOLD;
        const lowConfidenceReason = isLowConfidence
            ? `${appliedCount} custom-sign override(s) applied; ${baseResult.lowConfidenceReason ?? "base recognizer remains low-confidence"}`
            : null;

        const alternatives = [
            {
                text: baseResult.transcript,
                confidence: baseResult.confidence,
                source: baseResult.source,
            },
            ...baseResult.alternatives,
        ];

        return {
            transcript,
            confidence,
            confidencePercent: toConfidencePercent(confidence),
            isLowConfidence,
            lowConfidenceReason,
            alternatives,
            source: "adapted",
            modelId: this.id,
            segments,
            generatedAt: input.nowIso ?? new Date().toISOString(),
            adapterApplied: true,
        };
    }
}
