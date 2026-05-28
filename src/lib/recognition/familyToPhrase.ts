/**
 * Family-to-phrase rendering used by the Baseline recognizer.
 *
 * This is NOT a transcript answer key. It is a deterministic, human-readable
 * description of the event-family hypothesis the blind decoder produced.
 * Until a real pretrained sign model is wired in, normal-mode transcripts are
 * coarse phrases of the form "[chop/cut-like motion]". The UI must clearly
 * mark these as low-confidence guesses.
 */

const FAMILY_PHRASES: Record<string, string> = {
    "chop/cut-like": "chopping or cutting motion",
    "repeated-tool-use-like": "repeated tool-use motion",
    "big-fall-like": "release-and-fall motion",
    "impact/bounce-like": "impact or bounce motion",
    "fingerspell/emphatic-letter-sequence-like":
        "fingerspell or emphatic letter sequence",
    "drink-like": "drinking motion",
    "phone/call-like": "phone or call gesture",
    "inspect/listen-like": "inspecting or listening gesture",
    "walk/continue-like": "continuous walking motion",
};

export function renderFamilyAsPhrase(family: string): string {
    const trimmed = family.trim();
    if (!trimmed) return "(no motion family detected)";
    const direct = FAMILY_PHRASES[trimmed];
    if (direct) return `[${direct}]`;
    // Unknown family: render with brackets so the UI does not present an
    // unfamiliar token as authoritative transcript text.
    return `[${trimmed.replace(/-like$/, "").replace(/[-/]/g, " ")} motion]`;
}

/** Convenience join used by the assembler. */
export function joinFamilyPhrases(phrases: string[]): string {
    return phrases.filter(Boolean).join(" ");
}
