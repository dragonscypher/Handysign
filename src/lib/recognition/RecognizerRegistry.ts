/**
 * Composes recognizers in priority order and returns the best ready one's
 * TranslationResult. Today the chain is:
 *   pretrained (if ready) -> adapted (baseline + custom lexicon) -> baseline.
 * Order is preserved so a future pretrained backend can transparently take
 * over without UI changes.
 */

import type {
    Recognizer,
    RecognizerInput,
    TranslationResult,
} from "@/lib/recognition/Recognizer";

export interface RegistryEntry {
    recognizer: Recognizer;
    /** Optional human-readable reason describing where this fits in the chain. */
    role?: string;
}

export class RecognizerRegistry {
    private readonly entries: RegistryEntry[];

    constructor(entries: RegistryEntry[]) {
        this.entries = entries;
    }

    list(): RegistryEntry[] {
        return [...this.entries];
    }

    /** Run recognizers in order; return the first non-null TranslationResult. */
    async translate(input: RecognizerInput): Promise<TranslationResult | null> {
        for (const entry of this.entries) {
            if (entry.recognizer.isReady && !entry.recognizer.isReady()) continue;
            const result = await entry.recognizer.recognize(input);
            if (result) return result;
        }
        return null;
    }

    /** Collect every recognizer's output (skipping not-ready), useful for QA. */
    async translateAll(input: RecognizerInput): Promise<TranslationResult[]> {
        const out: TranslationResult[] = [];
        for (const entry of this.entries) {
            if (entry.recognizer.isReady && !entry.recognizer.isReady()) continue;
            const result = await entry.recognizer.recognize(input);
            if (result) out.push(result);
        }
        return out;
    }
}
