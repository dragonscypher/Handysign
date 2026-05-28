#!/usr/bin/env node
/**
 * Validate a label pack against the privacy-safe schema (no raw video, no
 * transcript, no answer key, all required fields present, enums correct).
 * Usage:
 *   node scripts/validate-label-pack.mjs <labelPack.json>
 * Exit code 0 = valid, 1 = invalid.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const LABEL_PACK_VERSION = 1;
const FORBIDDEN = new Set([
    "rawVideo",
    "pixelData",
    "frames",
    "imageBytes",
    "transcript",
    "expectedReference",
    "answerKey",
]);
const VALID_SPLITS = new Set(["calibration", "holdout", "ignore"]);
const VALID_QUALITIES = new Set(["usable", "weak", "occluded"]);

function isPlainObject(value) {
    return value && typeof value === "object" && !Array.isArray(value);
}

function deepCheckForbidden(value, path, errors) {
    if (Array.isArray(value)) {
        value.forEach((item, index) =>
            deepCheckForbidden(item, `${path}[${index}]`, errors),
        );
        return;
    }
    if (!isPlainObject(value)) return;
    for (const key of Object.keys(value)) {
        if (FORBIDDEN.has(key)) errors.push(`${path}.${key} forbidden`);
        deepCheckForbidden(value[key], `${path}.${key}`, errors);
    }
}

function validate(pack) {
    const errors = [];
    if (!isPlainObject(pack)) {
        return ["pack must be an object"];
    }
    if (pack.schemaVersion !== LABEL_PACK_VERSION) {
        errors.push(
            `schemaVersion must equal ${LABEL_PACK_VERSION} (got ${pack.schemaVersion})`,
        );
    }
    for (const field of ["packId", "createdAt", "sourceBlindExportId", "clipName"]) {
        if (typeof pack[field] !== "string" || pack[field] === "") {
            errors.push(`${field} must be a non-empty string`);
        }
    }
    if (typeof pack.notes !== "string") errors.push("notes must be a string");
    if (!Array.isArray(pack.segmentLabels)) {
        errors.push("segmentLabels must be an array");
        return errors;
    }
    const seen = new Set();
    pack.segmentLabels.forEach((label, index) => {
        if (!isPlainObject(label)) {
            errors.push(`segmentLabels[${index}] must be an object`);
            return;
        }
        if (typeof label.segmentId !== "string" || label.segmentId === "") {
            errors.push(`segmentLabels[${index}].segmentId must be a non-empty string`);
        } else if (seen.has(label.segmentId)) {
            errors.push(`segmentLabels[${index}].segmentId duplicated: ${label.segmentId}`);
        } else {
            seen.add(label.segmentId);
        }
        for (const numField of ["startMs", "endMs", "confidenceMargin"]) {
            if (typeof label[numField] !== "number" || Number.isNaN(label[numField])) {
                errors.push(`segmentLabels[${index}].${numField} must be number`);
            }
        }
        for (const strField of [
            "predictedFamily",
            "familyLabel",
            "conceptLabel",
            "exactLabel",
            "notes",
        ]) {
            if (typeof label[strField] !== "string") {
                errors.push(`segmentLabels[${index}].${strField} must be a string`);
            }
        }
        if (label.runnerUpFamily !== null && typeof label.runnerUpFamily !== "string") {
            errors.push(`segmentLabels[${index}].runnerUpFamily must be string or null`);
        }
        if (!VALID_SPLITS.has(label.split)) {
            errors.push(`segmentLabels[${index}].split invalid`);
        }
        if (!VALID_QUALITIES.has(label.quality)) {
            errors.push(`segmentLabels[${index}].quality invalid`);
        }
    });
    deepCheckForbidden(pack, "$", errors);
    return errors;
}

async function main() {
    const inPath = resolve(process.argv[2]);
    const pack = JSON.parse(await readFile(inPath, "utf8"));
    const errors = validate(pack);
    if (errors.length === 0) {
        console.log(
            `[labelpack:validate] OK (${pack.segmentLabels.length} segments, pack ${pack.packId}, clip ${pack.clipName})`,
        );
        return;
    }
    console.error(`[labelpack:validate] ${errors.length} error(s):`);
    for (const error of errors) console.error(` - ${error}`);
    process.exit(1);
}

main().catch((error) => {
    console.error("[labelpack:validate] FAILED:", error);
    process.exit(1);
});
