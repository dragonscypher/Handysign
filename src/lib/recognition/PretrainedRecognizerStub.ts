/**
 * Stub for a future pretrained dataset-backed sign recognizer.
 *
 * This file exists to make the integration path explicit in code, not just
 * docs. The stub never produces output; it always reports notReadyReason().
 * When a real pretrained model is wired in, replace the body of recognize()
 * (and isReady()) and keep the rest of the app untouched.
 *
 * Suggested first integration (documented for the next agent):
 *  - Use a pose-based ASL recognizer trained on a public dataset
 *    (e.g. WLASL, MS-ASL, or How2Sign-style landmark features).
 *  - Input: encodedSequence (already produced by the existing landmark
 *    extractor) and/or raw blind export segments.
 *  - Output: TranslationResult with per-segment text, real confidence, and
 *    alternatives ranked by the model's softmax.
 *  - License / privacy: model weights must run locally in-browser
 *    (WebAssembly / WebGPU). No raw video upload.
 */

import type {
    Recognizer,
    RecognizerInput,
    TranslationResult,
} from "@/lib/recognition/Recognizer";

export interface PretrainedRecognizerStubOptions {
    id?: string;
    description?: string;
    notReadyReason?: string;
}

export class PretrainedRecognizerStub implements Recognizer {
    readonly id: string;
    readonly kind = "pretrained" as const;
    readonly description: string;
    private readonly _notReadyReason: string;

    constructor(options: PretrainedRecognizerStubOptions = {}) {
        this.id = options.id ?? "pretrained-stub@0";
        this.description =
            options.description ??
            "Placeholder for a future pose-based pretrained sign recognizer.";
        this._notReadyReason =
            options.notReadyReason ??
            "No pretrained weights bundled. Drop a model wrapper here to enable.";
    }

    isReady(): boolean {
        return false;
    }

    notReadyReason(): string | null {
        return this._notReadyReason;
    }

    async recognize(input: RecognizerInput): Promise<TranslationResult | null> {
        void input;
        return null;
    }
}
