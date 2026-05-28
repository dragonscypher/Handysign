/**
 * Privacy-safe local lexicon of user-defined custom signs.
 *
 * Each entry is a user correction or a newly defined sign. Entries are stored
 * in memory by default and can be serialized to JSON for export / round-trip.
 * No raw video, no pixel data, no answer-key reference is stored. Just the
 * user's chosen English label and a few optional hints that bias the adapter
 * recognizer toward applying the label.
 *
 * Storage model:
 *  - in-memory by default
 *  - export / import via JSON (caller-owned persistence)
 *  - same forbidden-key invariants as the label pack: rawVideo, pixelData,
 *    frames, imageBytes, transcript, expectedReference, answerKey are
 *    rejected by the schema check.
 */

export const CUSTOM_SIGN_LEXICON_VERSION = 1 as const;

export type CustomSignSplit = "calibration" | "holdout" | "ignore";

export interface CustomSignEntry {
    id: string;
    label: string;
    /** Optional hint: predicted family this sign tends to be confused with. */
    familyHint: string;
    /** Optional broader concept tag (e.g. "tool-use"). */
    conceptHint: string;
    /** Optional free-form user notes. No transcript dumps. */
    notes: string;
    /** Calibration vs holdout vs ignore. */
    split: CustomSignSplit;
    /** Increments each time the user re-asserts the same correction. */
    exampleCount: number;
    createdAt: string;
    updatedAt: string;
}

export interface CustomSignLexiconSnapshot {
    schemaVersion: typeof CUSTOM_SIGN_LEXICON_VERSION;
    exportedAt: string;
    entries: CustomSignEntry[];
}

export interface CustomSignValidationResult {
    ok: boolean;
    errors: string[];
}

const FORBIDDEN_KEYS = new Set([
    "rawVideo",
    "pixelData",
    "frames",
    "imageBytes",
    "transcript",
    "expectedReference",
    "answerKey",
]);

const VALID_SPLITS: ReadonlySet<CustomSignSplit> = new Set([
    "calibration",
    "holdout",
    "ignore",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNoForbidden(value: unknown, errors: string[], path: string): void {
    if (Array.isArray(value)) {
        value.forEach((item, index) =>
            assertNoForbidden(item, errors, `${path}[${index}]`),
        );
        return;
    }
    if (!isPlainObject(value)) return;
    for (const key of Object.keys(value)) {
        if (FORBIDDEN_KEYS.has(key)) {
            errors.push(`${path}.${key} forbidden`);
        }
        assertNoForbidden(value[key], errors, `${path}.${key}`);
    }
}

export function validateCustomSignLexicon(
    value: unknown,
): CustomSignValidationResult {
    const errors: string[] = [];
    if (!isPlainObject(value)) {
        return { ok: false, errors: ["lexicon must be an object"] };
    }
    assertNoForbidden(value, errors, "$");
    if (value.schemaVersion !== CUSTOM_SIGN_LEXICON_VERSION) {
        errors.push(
            `schemaVersion must equal ${CUSTOM_SIGN_LEXICON_VERSION} (got ${String(value.schemaVersion)})`,
        );
    }
    if (typeof value.exportedAt !== "string" || value.exportedAt === "") {
        errors.push("exportedAt must be a non-empty string");
    }
    if (!Array.isArray(value.entries)) {
        errors.push("entries must be an array");
        return { ok: errors.length === 0, errors };
    }
    const seenIds = new Set<string>();
    value.entries.forEach((rawEntry, index) => {
        if (!isPlainObject(rawEntry)) {
            errors.push(`entries[${index}] must be an object`);
            return;
        }
        const id = rawEntry.id;
        if (typeof id !== "string" || id === "") {
            errors.push(`entries[${index}].id must be a non-empty string`);
        } else if (seenIds.has(id)) {
            errors.push(`entries[${index}].id is duplicated: ${id}`);
        } else {
            seenIds.add(id);
        }
        for (const strField of [
            "label",
            "familyHint",
            "conceptHint",
            "notes",
            "createdAt",
            "updatedAt",
        ] as const) {
            if (typeof rawEntry[strField] !== "string") {
                errors.push(`entries[${index}].${strField} must be a string`);
            }
        }
        if (typeof rawEntry.label === "string" && rawEntry.label.trim() === "") {
            errors.push(`entries[${index}].label must not be empty`);
        }
        if (
            typeof rawEntry.split !== "string" ||
            !VALID_SPLITS.has(rawEntry.split as CustomSignSplit)
        ) {
            errors.push(
                `entries[${index}].split must be one of calibration|holdout|ignore`,
            );
        }
        if (
            typeof rawEntry.exampleCount !== "number" ||
            !Number.isFinite(rawEntry.exampleCount) ||
            rawEntry.exampleCount < 0
        ) {
            errors.push(`entries[${index}].exampleCount must be a non-negative number`);
        }
    });
    return { ok: errors.length === 0, errors };
}

export class CustomSignLexicon {
    private entries = new Map<string, CustomSignEntry>();

    list(): CustomSignEntry[] {
        return [...this.entries.values()].sort((a, b) =>
            a.label.localeCompare(b.label),
        );
    }

    upsert(
        partial: Partial<CustomSignEntry> & { label: string },
        nowIso = new Date().toISOString(),
    ): CustomSignEntry {
        const label = partial.label.trim();
        if (label === "") {
            throw new Error("custom sign label must not be empty");
        }
        const existing = partial.id ? this.entries.get(partial.id) : undefined;
        const id =
            partial.id ??
            `custom-sign-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${nowIso.replace(/[^0-9]/g, "").slice(0, 12) || "0"}`;
        const entry: CustomSignEntry = {
            id,
            label,
            familyHint: partial.familyHint ?? existing?.familyHint ?? "",
            conceptHint: partial.conceptHint ?? existing?.conceptHint ?? "",
            notes: partial.notes ?? existing?.notes ?? "",
            split: partial.split ?? existing?.split ?? "calibration",
            exampleCount:
                partial.exampleCount ??
                (existing ? existing.exampleCount + 1 : 1),
            createdAt: existing?.createdAt ?? nowIso,
            updatedAt: nowIso,
        };
        this.entries.set(id, entry);
        return entry;
    }

    remove(id: string): boolean {
        return this.entries.delete(id);
    }

    get(id: string): CustomSignEntry | undefined {
        return this.entries.get(id);
    }

    /** Find best entry that matches a predicted family, if any. */
    findForFamily(family: string): CustomSignEntry | null {
        if (!family) return null;
        const matches = [...this.entries.values()].filter(
            (entry) => entry.familyHint === family && entry.split !== "ignore",
        );
        if (matches.length === 0) return null;
        matches.sort((a, b) => b.exampleCount - a.exampleCount);
        return matches[0];
    }

    toSnapshot(nowIso = new Date().toISOString()): CustomSignLexiconSnapshot {
        return {
            schemaVersion: CUSTOM_SIGN_LEXICON_VERSION,
            exportedAt: nowIso,
            entries: this.list(),
        };
    }

    loadSnapshot(snapshot: CustomSignLexiconSnapshot): void {
        const validation = validateCustomSignLexicon(snapshot);
        if (!validation.ok) {
            throw new Error(
                `invalid custom sign lexicon: ${validation.errors.join("; ")}`,
            );
        }
        this.entries.clear();
        for (const entry of snapshot.entries) {
            this.entries.set(entry.id, { ...entry });
        }
    }

    clear(): void {
        this.entries.clear();
    }

    size(): number {
        return this.entries.size;
    }
}
