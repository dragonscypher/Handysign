"use client";

import {
    evaluateLabelPackAgainstExport,
    validateLabelPack,
    type BlindExportLike,
    type LabelPack,
    type LabelPackEvaluation,
    type LabelPackSegmentLabel,
    type LabelQuality,
    type LabelSplit,
} from "@/lib/labels/labelPack";
import { useMemo, useRef, useState } from "react";

interface ExportSegmentExtras {
    failureTags?: string[];
    motifTags?: string[];
    repeatedCycleCount?: number;
    hypothesisReason?: string;
}

type ExtraSegment = BlindExportLike["segments"][number] & ExportSegmentExtras;

const PRIORITY_SEGMENTS = new Set(["seg-02", "seg-03", "seg-04", "seg-05", "seg-08", "seg-09"]);

const SPLIT_OPTIONS: LabelSplit[] = ["calibration", "holdout", "ignore"];
const QUALITY_OPTIONS: LabelQuality[] = ["usable", "weak", "occluded"];

async function readJsonFile<T>(file: File): Promise<T> {
    const payload =
        typeof file.text === "function"
            ? await file.text()
            : await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onerror = () => reject(new Error("Could not read JSON file."));
                reader.onload = () => resolve(String(reader.result ?? ""));
                reader.readAsText(file as Blob);
            });
    return JSON.parse(payload) as T;
}

function downloadJson(filename: string, value: unknown) {
    const blob = new Blob([JSON.stringify(value, null, 2) + "\n"], {
        type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function formatTime(ms: number): string {
    if (!Number.isFinite(ms)) return "--";
    const seconds = ms / 1000;
    return `${seconds.toFixed(2)}s`;
}

export default function LabelPackReviewer() {
    const [pack, setPack] = useState<LabelPack | null>(null);
    const [packError, setPackError] = useState<string | null>(null);
    const [exportSegmentExtras, setExportSegmentExtras] = useState<Map<string, ExtraSegment>>(
        new Map(),
    );
    const [exportForEval, setExportForEval] = useState<BlindExportLike | null>(null);
    const [exportError, setExportError] = useState<string | null>(null);
    const [evaluation, setEvaluation] = useState<LabelPackEvaluation | null>(null);
    const packInputRef = useRef<HTMLInputElement>(null);
    const exportInputRef = useRef<HTMLInputElement>(null);

    const handleLoadPack = async (file: File | null) => {
        if (!file) return;
        setPackError(null);
        setEvaluation(null);
        try {
            const parsed = await readJsonFile<unknown>(file);
            const validation = validateLabelPack(parsed);
            if (!validation.ok) {
                setPackError(validation.errors.join("; "));
                setPack(null);
                return;
            }
            setPack(parsed as LabelPack);
        } catch (error) {
            setPackError(error instanceof Error ? error.message : String(error));
            setPack(null);
        }
    };

    const handleLoadExport = async (file: File | null) => {
        if (!file) return;
        setExportError(null);
        setEvaluation(null);
        try {
            const parsed = await readJsonFile<{
                id?: string;
                clipName?: string;
                segments?: ExtraSegment[];
            }>(file);
            if (!parsed || !Array.isArray(parsed.segments)) {
                throw new Error("Export JSON has no segments[] array.");
            }
            const map = new Map<string, ExtraSegment>();
            for (const segment of parsed.segments) {
                if (segment && typeof segment.id === "string") {
                    map.set(segment.id, segment);
                }
            }
            setExportSegmentExtras(map);
            setExportForEval({
                id: parsed.id,
                clipName: parsed.clipName,
                segments: parsed.segments.map((segment) => ({
                    id: segment.id,
                    startMs: segment.startMs,
                    endMs: segment.endMs,
                    eventFamilyHypothesis: segment.eventFamilyHypothesis,
                    runnerUpFamily: segment.runnerUpFamily ?? null,
                    confidenceMargin: segment.confidenceMargin,
                })),
            });
        } catch (error) {
            setExportError(error instanceof Error ? error.message : String(error));
            setExportSegmentExtras(new Map());
            setExportForEval(null);
        }
    };

    const updateSegment = (segmentId: string, patch: Partial<LabelPackSegmentLabel>) => {
        setEvaluation(null);
        setPack((current) => {
            if (!current) return current;
            return {
                ...current,
                segmentLabels: current.segmentLabels.map((label) =>
                    label.segmentId === segmentId ? { ...label, ...patch } : label,
                ),
            };
        });
    };

    const handleExport = () => {
        if (!pack) return;
        const validation = validateLabelPack(pack);
        if (!validation.ok) {
            setPackError(`cannot export: ${validation.errors.join("; ")}`);
            return;
        }
        const filename = `${pack.packId || "labelpack"}-${new Date().toISOString().slice(0, 10)}.json`;
        downloadJson(filename, pack);
    };

    const handleEvaluate = () => {
        if (!pack || !exportForEval) return;
        const validation = validateLabelPack(pack);
        if (!validation.ok) {
            setPackError(`cannot evaluate: ${validation.errors.join("; ")}`);
            return;
        }
        setEvaluation(evaluateLabelPackAgainstExport(pack, exportForEval));
    };

    const orderedLabels = useMemo(() => {
        if (!pack) return [] as LabelPackSegmentLabel[];
        return [...pack.segmentLabels].sort((a, b) => {
            const priorityA = PRIORITY_SEGMENTS.has(a.segmentId) ? 0 : 1;
            const priorityB = PRIORITY_SEGMENTS.has(b.segmentId) ? 0 : 1;
            if (priorityA !== priorityB) return priorityA - priorityB;
            return a.segmentId.localeCompare(b.segmentId);
        });
    }, [pack]);

    return (
        <main
            style={{
                maxWidth: 1080,
                margin: "0 auto",
                padding: "24px 20px 64px",
                color: "var(--ink)",
                fontFamily: "var(--font-display), system-ui, sans-serif",
            }}
        >
            <header style={{ marginBottom: 16 }}>
                <h1 style={{ margin: 0, fontSize: 28 }}>Label pack review</h1>
                <p style={{ marginTop: 6, color: "var(--muted)", lineHeight: 1.4 }}>
                    Privacy-safe segment labeling for blind inference exports. No raw video,
                    no transcript, no answer key. Blind mode does not load this pack.
                    Edits stay in browser memory until you export the JSON.
                </p>
            </header>

            <section
                style={{
                    background: "var(--panel-strong)",
                    borderRadius: "var(--radius-md)",
                    padding: 16,
                    boxShadow: "var(--shadow)",
                    marginBottom: 16,
                }}
            >
                <h2 style={{ margin: 0, fontSize: 18 }}>1. Load files</h2>
                <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                    <label
                        data-testid="label-pack-input-row"
                        style={{ display: "flex", flexDirection: "column", gap: 4 }}
                    >
                        <span>Label pack JSON (starter or in-progress)</span>
                        <input
                            ref={packInputRef}
                            data-testid="label-pack-input"
                            type="file"
                            accept="application/json,.json"
                            onChange={(event) => {
                                const file = event.target.files?.[0] ?? null;
                                void handleLoadPack(file);
                            }}
                        />
                        {pack ? (
                            <span style={{ color: "var(--success)", fontSize: 13 }}>
                                Loaded {pack.packId} ({pack.segmentLabels.length} segments,{" "}
                                clip {pack.clipName}).
                            </span>
                        ) : null}
                        {packError ? (
                            <span style={{ color: "var(--warn)", fontSize: 13 }}>{packError}</span>
                        ) : null}
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span>(Optional) blind export JSON for context + evaluation</span>
                        <input
                            ref={exportInputRef}
                            data-testid="label-pack-export-input"
                            type="file"
                            accept="application/json,.json"
                            onChange={(event) => {
                                const file = event.target.files?.[0] ?? null;
                                void handleLoadExport(file);
                            }}
                        />
                        {exportForEval ? (
                            <span style={{ color: "var(--success)", fontSize: 13 }}>
                                Loaded export for {exportForEval.clipName} (
                                {exportForEval.segments.length} segments).
                            </span>
                        ) : null}
                        {exportError ? (
                            <span style={{ color: "var(--warn)", fontSize: 13 }}>{exportError}</span>
                        ) : null}
                    </label>
                </div>
            </section>

            {pack ? (
                <section
                    style={{
                        background: "var(--panel-strong)",
                        borderRadius: "var(--radius-md)",
                        padding: 16,
                        boxShadow: "var(--shadow)",
                        marginBottom: 16,
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                            flexWrap: "wrap",
                        }}
                    >
                        <h2 style={{ margin: 0, fontSize: 18 }}>2. Edit segment labels</h2>
                        <div style={{ display: "flex", gap: 8 }}>
                            <button
                                data-testid="label-pack-evaluate"
                                type="button"
                                onClick={handleEvaluate}
                                disabled={!exportForEval}
                                style={buttonStyle(!exportForEval)}
                            >
                                Evaluate vs export
                            </button>
                            <button
                                data-testid="label-pack-export"
                                type="button"
                                onClick={handleExport}
                                style={buttonStyle(false)}
                            >
                                Export pack JSON
                            </button>
                        </div>
                    </div>
                    <p
                        style={{
                            marginTop: 8,
                            marginBottom: 12,
                            color: "var(--muted)",
                            fontSize: 13,
                        }}
                    >
                        Priority review segments (sample 2 dominant confusions): seg-02, seg-03,
                        seg-04, seg-05, seg-08, seg-09. They are sorted to the top.
                    </p>
                    <ul
                        data-testid="label-pack-segment-list"
                        style={{
                            listStyle: "none",
                            padding: 0,
                            margin: 0,
                            display: "grid",
                            gap: 12,
                        }}
                    >
                        {orderedLabels.map((label) => {
                            const extras = exportSegmentExtras.get(label.segmentId);
                            const isPriority = PRIORITY_SEGMENTS.has(label.segmentId);
                            return (
                                <li
                                    key={label.segmentId}
                                    data-testid={`label-pack-segment-${label.segmentId}`}
                                    data-priority={isPriority ? "true" : "false"}
                                    style={{
                                        border: `1px solid ${isPriority ? "var(--brand)" : "var(--line)"}`,
                                        background: isPriority ? "var(--brand-soft)" : "var(--panel)",
                                        borderRadius: "var(--radius-sm)",
                                        padding: 12,
                                    }}
                                >
                                    <div
                                        style={{
                                            display: "flex",
                                            flexWrap: "wrap",
                                            gap: 12,
                                            alignItems: "baseline",
                                            marginBottom: 8,
                                        }}
                                    >
                                        <strong style={{ fontSize: 15 }}>{label.segmentId}</strong>
                                        <span style={{ color: "var(--muted)", fontSize: 13 }}>
                                            {formatTime(label.startMs)} – {formatTime(label.endMs)}
                                        </span>
                                        <span style={{ fontSize: 13 }}>
                                            predicted <code>{label.predictedFamily}</code> vs runner-up{" "}
                                            <code>{label.runnerUpFamily ?? "—"}</code> · margin{" "}
                                            {label.confidenceMargin.toFixed(4)}
                                        </span>
                                        {isPriority ? (
                                            <span
                                                style={{
                                                    marginLeft: "auto",
                                                    fontSize: 11,
                                                    padding: "2px 6px",
                                                    borderRadius: 999,
                                                    background: "var(--brand)",
                                                    color: "white",
                                                }}
                                            >
                                                priority review
                                            </span>
                                        ) : null}
                                    </div>
                                    {extras ? (
                                        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
                                            <div>
                                                repeatedCycles: {extras.repeatedCycleCount ?? "—"} · failureTags:{" "}
                                                {(extras.failureTags ?? []).join(", ") || "—"} · motifTags:{" "}
                                                {(extras.motifTags ?? []).join(", ") || "—"}
                                            </div>
                                            {extras.hypothesisReason ? (
                                                <div style={{ fontStyle: "italic" }}>
                                                    {extras.hypothesisReason}
                                                </div>
                                            ) : null}
                                        </div>
                                    ) : null}
                                    <div
                                        style={{
                                            display: "grid",
                                            gap: 8,
                                            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                                        }}
                                    >
                                        <FieldText
                                            label="familyLabel"
                                            testId={`label-pack-family-${label.segmentId}`}
                                            value={label.familyLabel}
                                            onChange={(value) =>
                                                updateSegment(label.segmentId, { familyLabel: value })
                                            }
                                        />
                                        <FieldText
                                            label="conceptLabel (optional)"
                                            testId={`label-pack-concept-${label.segmentId}`}
                                            value={label.conceptLabel}
                                            onChange={(value) =>
                                                updateSegment(label.segmentId, { conceptLabel: value })
                                            }
                                        />
                                        <FieldText
                                            label="exactLabel (optional)"
                                            testId={`label-pack-exact-${label.segmentId}`}
                                            value={label.exactLabel}
                                            onChange={(value) =>
                                                updateSegment(label.segmentId, { exactLabel: value })
                                            }
                                        />
                                        <FieldSelect
                                            label="split"
                                            testId={`label-pack-split-${label.segmentId}`}
                                            value={label.split}
                                            options={SPLIT_OPTIONS}
                                            onChange={(value) =>
                                                updateSegment(label.segmentId, { split: value as LabelSplit })
                                            }
                                        />
                                        <FieldSelect
                                            label="quality"
                                            testId={`label-pack-quality-${label.segmentId}`}
                                            value={label.quality}
                                            options={QUALITY_OPTIONS}
                                            onChange={(value) =>
                                                updateSegment(label.segmentId, { quality: value as LabelQuality })
                                            }
                                        />
                                    </div>
                                    <label
                                        style={{
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: 4,
                                            marginTop: 8,
                                        }}
                                    >
                                        <span style={{ fontSize: 12, color: "var(--muted)" }}>
                                            notes (no transcripts)
                                        </span>
                                        <textarea
                                            data-testid={`label-pack-notes-${label.segmentId}`}
                                            rows={2}
                                            value={label.notes}
                                            onChange={(event) =>
                                                updateSegment(label.segmentId, { notes: event.target.value })
                                            }
                                            style={{
                                                resize: "vertical",
                                                fontFamily: "inherit",
                                                fontSize: 13,
                                                padding: 6,
                                            }}
                                        />
                                    </label>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            ) : null}

            {evaluation ? (
                <section
                    data-testid="label-pack-evaluation"
                    style={{
                        background: "var(--panel-strong)",
                        borderRadius: "var(--radius-md)",
                        padding: 16,
                        boxShadow: "var(--shadow)",
                    }}
                >
                    <h2 style={{ margin: 0, fontSize: 18 }}>3. Evaluation</h2>
                    <ul style={{ marginTop: 8, paddingLeft: 18, lineHeight: 1.6 }}>
                        <li>segments: {evaluation.segmentCount}</li>
                        <li>labeled: {evaluation.labeledSegments}</li>
                        <li>calibration: {evaluation.calibrationCount}</li>
                        <li>holdout: {evaluation.holdoutCount}</li>
                        <li>ignored: {evaluation.ignoredCount}</li>
                        <li>weak/occluded: {evaluation.weakOrOccludedCount}</li>
                        <li>family match rate: {evaluation.familyMatchRate}</li>
                        <li>
                            concept match rate:{" "}
                            {evaluation.conceptMatchRate === null
                                ? "n/a"
                                : evaluation.conceptMatchRate}
                        </li>
                        <li>
                            segments still needing labels:{" "}
                            {evaluation.segmentsNeedingLabels.join(", ") || "none"}
                        </li>
                        <li>
                            uncovered concepts:{" "}
                            {evaluation.uncoveredConcepts.join(", ") || "none"}
                        </li>
                    </ul>
                    {evaluation.confusionHotspots.length > 0 ? (
                        <>
                            <h3 style={{ marginBottom: 4, fontSize: 15 }}>Confusion hotspots</h3>
                            <ul style={{ paddingLeft: 18, lineHeight: 1.5 }}>
                                {evaluation.confusionHotspots.map((hotspot) => (
                                    <li key={`${hotspot.predictedFamily}__${hotspot.familyLabel}`}>
                                        predicted <code>{hotspot.predictedFamily}</code> but labeled{" "}
                                        <code>{hotspot.familyLabel}</code> (×{hotspot.count}; segments{" "}
                                        {hotspot.segmentIds.join(", ")})
                                    </li>
                                ))}
                            </ul>
                        </>
                    ) : null}
                </section>
            ) : null}
        </main>
    );
}

function buttonStyle(disabled: boolean): React.CSSProperties {
    return {
        padding: "8px 14px",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--brand)",
        background: disabled ? "var(--line)" : "var(--brand)",
        color: disabled ? "var(--muted)" : "white",
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 13,
    };
}

interface FieldTextProps {
    label: string;
    testId: string;
    value: string;
    onChange: (value: string) => void;
}

function FieldText({ label, testId, value, onChange }: FieldTextProps) {
    return (
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{label}</span>
            <input
                data-testid={testId}
                type="text"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                style={{ padding: 6, fontSize: 13, fontFamily: "inherit" }}
            />
        </label>
    );
}

interface FieldSelectProps {
    label: string;
    testId: string;
    value: string;
    options: readonly string[];
    onChange: (value: string) => void;
}

function FieldSelect({ label, testId, value, options, onChange }: FieldSelectProps) {
    return (
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{label}</span>
            <select
                data-testid={testId}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                style={{ padding: 6, fontSize: 13, fontFamily: "inherit" }}
            >
                {options.map((option) => (
                    <option key={option} value={option}>
                        {option}
                    </option>
                ))}
            </select>
        </label>
    );
}
