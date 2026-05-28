/**
 * Recognizer interface for the Normal-mode translation path.
 *
 * Design goals (round 8, product pivot):
 *  - The product target is now "upload clip -> best English transcript + confidence%".
 *  - Blind family inference is one possible backend, not the long-term backend.
 *  - This module defines a small, swappable interface so a future pretrained
 *    dataset-backed model can be dropped in without rewriting the UI.
 *
 * Privacy contract:
 *  - Recognizer implementations receive only what the user explicitly provides
 *    (a clip or pre-computed landmarks / blind export). They must not load
 *    hidden reference transcripts or answer keys.
 *  - TranslationResult contains the *model's* transcript, not a held-out
 *    reference. It is safe to display and to save locally.
 *  - Recognizer implementations must not write rawVideo / pixel data anywhere.
 *
 * Honest-confidence rule:
 *  - confidence is a real number in [0, 1] computed by the recognizer.
 *  - If the recognizer cannot produce any output, return null. Do NOT return
 *    a confident-looking string with no support.
 *  - If the recognizer has only weak support, still return its best guess but
 *    set isLowConfidence = true and supply lowConfidenceReason.
 */

import type { BlindExportLike } from "@/lib/labels/labelPack";
import type { EncodedSequence } from "@/lib/recognition/types";

export type RecognizerSourceKind =
    | "baseline"
    | "adapted"
    | "pretrained"
    | "custom";

export interface TranslationAlternative {
    text: string;
    confidence: number;
    source: RecognizerSourceKind;
}

export interface TranslationSegment {
    id: string;
    startMs: number;
    endMs: number;
    text: string;
    confidence: number;
    /** Underlying family label from a blind backend, when available. */
    family?: string;
    /** Custom-sign id that overrode this segment, when applicable. */
    customSignId?: string;
}

export interface TranslationResult {
    /** Best English transcript / translation produced by the recognizer. */
    transcript: string;
    /** Overall confidence in [0, 1]. */
    confidence: number;
    /** Same value rounded to an integer percent, for display. */
    confidencePercent: number;
    /** True when the recognizer thinks output should be treated as a guess. */
    isLowConfidence: boolean;
    /** Short human-readable reason for low confidence, or null. */
    lowConfidenceReason: string | null;
    /** Ranked alternative transcripts, including non-top sources. */
    alternatives: TranslationAlternative[];
    /** Which recognizer produced the top result. */
    source: RecognizerSourceKind;
    /** Stable id of the recognizer (e.g. "baseline-blind-family@1"). */
    modelId: string;
    /** Per-segment breakdown for UI. */
    segments: TranslationSegment[];
    /** ISO timestamp when the result was produced. */
    generatedAt: string;
    /** True when at least one segment was rewritten by the adapter layer. */
    adapterApplied: boolean;
}

export interface RecognizerInput {
    /** Human-readable clip name, for UI + telemetry. */
    clipName: string;
    /**
     * A pre-computed blind inference export. Today this is the most reliable
     * shared input across recognizers, so the baseline + adapter both consume
     * it. Pretrained recognizers may ignore this and read landmarks instead.
     */
    blindExport?: BlindExportLike;
    /** Optional encoded sequence (landmark-derived) for pose-based models. */
    encodedSequence?: EncodedSequence;
    /** Caller-supplied current timestamp; lets tests be deterministic. */
    nowIso?: string;
}

export interface Recognizer {
    readonly id: string;
    readonly kind: RecognizerSourceKind;
    readonly description: string;
    /** Returns a TranslationResult, or null if the recognizer cannot run. */
    recognize(input: RecognizerInput): Promise<TranslationResult | null>;
    /**
     * Optional readiness probe. Used by the registry to skip recognizers that
     * cannot yet run (e.g. a pretrained stub with no weights loaded).
     */
    isReady?(): boolean;
    /** Optional human-readable reason explaining why isReady() is false. */
    notReadyReason?(): string | null;
}

/** Convenience helper: clamp + round confidence to a display percent. */
export function toConfidencePercent(confidence: number): number {
    if (!Number.isFinite(confidence)) return 0;
    return Math.max(0, Math.min(100, Math.round(confidence * 100)));
}

/** Standard low-confidence threshold used across the app. */
export const LOW_CONFIDENCE_THRESHOLD = 0.55;
