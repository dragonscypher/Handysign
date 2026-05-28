/**
 * Privacy-safe segment label pack format and helpers.
 *
 * A label pack is a manually curated annotation of a blind inference export.
 * It NEVER contains raw video, pixel data, transcripts, or hidden answer keys.
 * It is OPT-IN evaluation evidence: blind mode must remain reference-free, so
 * label packs are loaded only by explicit user action (CLI or evaluation tool).
 *
 * Schema is intentionally minimal. Fields:
 *  - packId: stable id for this pack
 *  - createdAt: ISO timestamp
 *  - sourceBlindExportId: id of the blind export the pack was derived from
 *  - clipName: e.g. "sample 2.mp4"
 *  - segmentLabels[]: per-segment user labels with optional notes / split / quality
 *
 * Forbidden fields (rejected by validation): rawVideo, pixelData, frames,
 * imageBytes, transcript, expectedReference, answerKey.
 */

export const LABEL_PACK_VERSION = 1 as const;

export type LabelSplit = "calibration" | "holdout" | "ignore";
export type LabelQuality = "usable" | "weak" | "occluded";

export interface LabelPackSegmentLabel {
    segmentId: string;
    startMs: number;
    endMs: number;
    /** Family the blind decoder predicted at pack-creation time. */
    predictedFamily: string;
    /** Runner-up family the blind decoder predicted at pack-creation time. */
    runnerUpFamily: string | null;
    /** Confidence margin from the blind export. */
    confidenceMargin: number;
    /** User-supplied family label. Empty string when not yet labeled. */
    familyLabel: string;
    /** Optional user-supplied concept-level label. */
    conceptLabel: string;
    /** Optional user-supplied exact label. Use sparingly. */
    exactLabel: string;
    /** Free-form user notes. No transcript dump. */
    notes: string;
    /** Calibration vs holdout vs ignore. Default 'ignore' until set. */
    split: LabelSplit;
    /** Quality flag. Default 'usable' until set. */
    quality: LabelQuality;
}

export interface LabelPack {
    schemaVersion: typeof LABEL_PACK_VERSION;
    packId: string;
    createdAt: string;
    sourceBlindExportId: string;
    clipName: string;
    notes: string;
    segmentLabels: LabelPackSegmentLabel[];
}

/** Subset of the blind inference export we actually need to seed a pack. */
export interface BlindExportLike {
    id?: string;
    clipName?: string;
    segments: Array<{
        id: string;
        startMs: number;
        endMs: number;
        eventFamilyHypothesis: string;
        runnerUpFamily: string | null;
        confidenceMargin: number;
        qualitySignals?: Record<string, number>;
        bodyReactionStats?: Record<string, number>;
        handshapeChangeStats?: Record<string, number>;
        motifTags?: string[];
        phases?: Array<Record<string, unknown>>;
    }>;
}

const FORBIDDEN_TOP_LEVEL_KEYS = new Set([
    "rawVideo",
    "pixelData",
    "frames",
    "imageBytes",
    "transcript",
    "expectedReference",
    "answerKey",
]);

const FORBIDDEN_SEGMENT_KEYS = new Set([
    "rawVideo",
    "pixelData",
    "frames",
    "imageBytes",
    "transcript",
    "expectedReference",
    "answerKey",
]);

const VALID_SPLITS: ReadonlySet<LabelSplit> = new Set([
    "calibration",
    "holdout",
    "ignore",
]);

const VALID_QUALITIES: ReadonlySet<LabelQuality> = new Set([
    "usable",
    "weak",
    "occluded",
]);

export interface LabelPackValidationResult {
    ok: boolean;
    errors: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Build a starter pack from a blind export. All user labels start blank. */
export function createStarterLabelPack(
    blindExport: BlindExportLike,
    options: { packId?: string; createdAt?: string; notes?: string } = {},
): LabelPack {
    const sourceId = blindExport.id ?? "blind-export-unknown";
    const clipName = blindExport.clipName ?? "unknown-clip";
    const packId = options.packId ?? `labelpack-${sourceId}`;
    const createdAt = options.createdAt ?? new Date().toISOString();
    const segmentLabels: LabelPackSegmentLabel[] = blindExport.segments.map(
        (segment) => ({
            segmentId: segment.id,
            startMs: segment.startMs,
            endMs: segment.endMs,
            predictedFamily: segment.eventFamilyHypothesis,
            runnerUpFamily: segment.runnerUpFamily,
            confidenceMargin: segment.confidenceMargin,
            familyLabel: "",
            conceptLabel: "",
            exactLabel: "",
            notes: "",
            split: "ignore",
            quality: "usable",
        }),
    );
    return {
        schemaVersion: LABEL_PACK_VERSION,
        packId,
        createdAt,
        sourceBlindExportId: sourceId,
        clipName,
        notes: options.notes ?? "",
        segmentLabels,
    };
}

/** Validate that a parsed JSON value is a well-formed, privacy-safe label pack. */
export function validateLabelPack(value: unknown): LabelPackValidationResult {
    const errors: string[] = [];
    if (!isPlainObject(value)) {
        return { ok: false, errors: ["pack must be an object"] };
    }
    for (const key of Object.keys(value)) {
        if (FORBIDDEN_TOP_LEVEL_KEYS.has(key)) {
            errors.push(`forbidden top-level key: ${key}`);
        }
    }
    if (value.schemaVersion !== LABEL_PACK_VERSION) {
        errors.push(
            `schemaVersion must equal ${LABEL_PACK_VERSION} (got ${String(value.schemaVersion)})`,
        );
    }
    for (const field of [
        "packId",
        "createdAt",
        "sourceBlindExportId",
        "clipName",
    ] as const) {
        if (typeof value[field] !== "string" || value[field] === "") {
            errors.push(`${field} must be a non-empty string`);
        }
    }
    if (typeof value.notes !== "string") {
        errors.push("notes must be a string");
    }
    if (!Array.isArray(value.segmentLabels)) {
        errors.push("segmentLabels must be an array");
        return { ok: errors.length === 0, errors };
    }
    const seenSegmentIds = new Set<string>();
    value.segmentLabels.forEach((rawLabel, index) => {
        if (!isPlainObject(rawLabel)) {
            errors.push(`segmentLabels[${index}] must be an object`);
            return;
        }
        for (const key of Object.keys(rawLabel)) {
            if (FORBIDDEN_SEGMENT_KEYS.has(key)) {
                errors.push(`segmentLabels[${index}] has forbidden key: ${key}`);
            }
        }
        const segmentId = rawLabel.segmentId;
        if (typeof segmentId !== "string" || segmentId === "") {
            errors.push(`segmentLabels[${index}].segmentId must be a non-empty string`);
        } else if (seenSegmentIds.has(segmentId)) {
            errors.push(`segmentLabels[${index}].segmentId is duplicated: ${segmentId}`);
        } else {
            seenSegmentIds.add(segmentId);
        }
        for (const numField of ["startMs", "endMs", "confidenceMargin"] as const) {
            if (typeof rawLabel[numField] !== "number" || Number.isNaN(rawLabel[numField] as number)) {
                errors.push(`segmentLabels[${index}].${numField} must be a finite number`);
            }
        }
        for (const strField of [
            "predictedFamily",
            "familyLabel",
            "conceptLabel",
            "exactLabel",
            "notes",
        ] as const) {
            if (typeof rawLabel[strField] !== "string") {
                errors.push(`segmentLabels[${index}].${strField} must be a string`);
            }
        }
        if (
            rawLabel.runnerUpFamily !== null &&
            typeof rawLabel.runnerUpFamily !== "string"
        ) {
            errors.push(`segmentLabels[${index}].runnerUpFamily must be string or null`);
        }
        if (typeof rawLabel.split !== "string" || !VALID_SPLITS.has(rawLabel.split as LabelSplit)) {
            errors.push(
                `segmentLabels[${index}].split must be one of calibration|holdout|ignore`,
            );
        }
        if (
            typeof rawLabel.quality !== "string" ||
            !VALID_QUALITIES.has(rawLabel.quality as LabelQuality)
        ) {
            errors.push(
                `segmentLabels[${index}].quality must be one of usable|weak|occluded`,
            );
        }
    });
    return { ok: errors.length === 0, errors };
}

export interface LabelPackEvaluation {
    packId: string;
    clipName: string;
    segmentCount: number;
    labeledSegments: number;
    calibrationCount: number;
    holdoutCount: number;
    ignoredCount: number;
    weakOrOccludedCount: number;
    /** Family-level match rate over labeled segments with usable quality. */
    familyMatchRate: number;
    /** Concept match rate over labeled segments that supplied conceptLabel. */
    conceptMatchRate: number | null;
    /** Per-pair counts where (predictedFamily, familyLabel) disagree. */
    confusionHotspots: Array<{
        predictedFamily: string;
        familyLabel: string;
        count: number;
        segmentIds: string[];
    }>;
    /** Concept labels that appear only in 'calibration' or only in 'holdout'. */
    uncoveredConcepts: string[];
    /** Segments still needing labels (familyLabel empty and split !== 'ignore'). */
    segmentsNeedingLabels: string[];
}

/** Evaluate a blind export against a user-supplied label pack. */
export function evaluateLabelPackAgainstExport(
    pack: LabelPack,
    blindExport: BlindExportLike,
): LabelPackEvaluation {
    const exportSegments = new Map(
        blindExport.segments.map((s) => [s.id, s]),
    );
    let labeledSegments = 0;
    let calibrationCount = 0;
    let holdoutCount = 0;
    let ignoredCount = 0;
    let weakOrOccludedCount = 0;
    let familyMatches = 0;
    let familyEvaluable = 0;
    let conceptMatches = 0;
    let conceptEvaluable = 0;
    const hotspotMap = new Map<
        string,
        { predictedFamily: string; familyLabel: string; segmentIds: string[] }
    >();
    const calibrationConcepts = new Set<string>();
    const holdoutConcepts = new Set<string>();
    const segmentsNeedingLabels: string[] = [];

    for (const label of pack.segmentLabels) {
        if (label.split === "calibration") calibrationCount++;
        else if (label.split === "holdout") holdoutCount++;
        else ignoredCount++;
        if (label.quality !== "usable") weakOrOccludedCount++;
        const exportSegment = exportSegments.get(label.segmentId);
        const livePredictedFamily = exportSegment?.eventFamilyHypothesis ?? label.predictedFamily;
        const hasFamilyLabel = label.familyLabel !== "";
        if (hasFamilyLabel) labeledSegments++;
        else if (label.split !== "ignore") {
            segmentsNeedingLabels.push(label.segmentId);
        }
        if (
            hasFamilyLabel &&
            label.quality === "usable" &&
            label.split !== "ignore"
        ) {
            familyEvaluable++;
            if (livePredictedFamily === label.familyLabel) {
                familyMatches++;
            } else {
                const key = `${livePredictedFamily}__${label.familyLabel}`;
                const existing = hotspotMap.get(key);
                if (existing) {
                    existing.segmentIds.push(label.segmentId);
                } else {
                    hotspotMap.set(key, {
                        predictedFamily: livePredictedFamily,
                        familyLabel: label.familyLabel,
                        segmentIds: [label.segmentId],
                    });
                }
            }
        }
        if (label.conceptLabel !== "" && label.split !== "ignore") {
            conceptEvaluable++;
            const exactGuess = (
                exportSegment as { exactLabelGuess?: string | null } | undefined
            )?.exactLabelGuess;
            if (typeof exactGuess === "string" && exactGuess === label.conceptLabel) {
                conceptMatches++;
            }
            if (label.split === "calibration") calibrationConcepts.add(label.conceptLabel);
            if (label.split === "holdout") holdoutConcepts.add(label.conceptLabel);
        }
    }

    const confusionHotspots = [...hotspotMap.values()]
        .map((entry) => ({
            predictedFamily: entry.predictedFamily,
            familyLabel: entry.familyLabel,
            count: entry.segmentIds.length,
            segmentIds: [...entry.segmentIds],
        }))
        .sort((a, b) => b.count - a.count || a.predictedFamily.localeCompare(b.predictedFamily));

    const uncoveredConcepts: string[] = [];
    for (const concept of calibrationConcepts) {
        if (!holdoutConcepts.has(concept)) uncoveredConcepts.push(concept);
    }
    for (const concept of holdoutConcepts) {
        if (!calibrationConcepts.has(concept)) uncoveredConcepts.push(concept);
    }
    uncoveredConcepts.sort();

    const familyMatchRate = familyEvaluable === 0 ? 0 : familyMatches / familyEvaluable;
    const conceptMatchRate =
        conceptEvaluable === 0 ? null : conceptMatches / conceptEvaluable;

    return {
        packId: pack.packId,
        clipName: pack.clipName,
        segmentCount: pack.segmentLabels.length,
        labeledSegments,
        calibrationCount,
        holdoutCount,
        ignoredCount,
        weakOrOccludedCount,
        familyMatchRate: Number(familyMatchRate.toFixed(4)),
        conceptMatchRate:
            conceptMatchRate === null ? null : Number(conceptMatchRate.toFixed(4)),
        confusionHotspots,
        uncoveredConcepts,
        segmentsNeedingLabels,
    };
}

/**
 * Sanity check that an arbitrary parsed JSON value passed to evaluation does not
 * carry raw video / pixel / transcript fields. Used by the evaluator script as
 * an extra defensive guard.
 */
export function assertNoForbiddenFields(value: unknown, path = "$"): string[] {
    const errors: string[] = [];
    if (Array.isArray(value)) {
        value.forEach((item, index) => {
            errors.push(...assertNoForbiddenFields(item, `${path}[${index}]`));
        });
        return errors;
    }
    if (!isPlainObject(value)) return errors;
    for (const key of Object.keys(value)) {
        if (FORBIDDEN_TOP_LEVEL_KEYS.has(key)) {
            errors.push(`${path}.${key} forbidden`);
        }
        errors.push(...assertNoForbiddenFields(value[key], `${path}.${key}`));
    }
    return errors;
}
