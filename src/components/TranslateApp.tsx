"use client";

import type { BlindExportLike } from "@/lib/labels/labelPack";
import {
    AdaptedRecognizer,
} from "@/lib/recognition/AdaptedRecognizer";
import {
    BaselineRecognizer,
    toBlindExportLike,
} from "@/lib/recognition/BaselineRecognizer";
import {
    CustomSignLexicon,
    type CustomSignEntry,
    type CustomSignSplit,
} from "@/lib/recognition/CustomSignLexicon";
import {
    PretrainedSignRecognizer,
} from "@/lib/recognition/PretrainedSignRecognizer";
import type { TranslationResult } from "@/lib/recognition/Recognizer";
import { RecognizerRegistry } from "@/lib/recognition/RecognizerRegistry";
import { useMemo, useRef, useState } from "react";
import styles from "./TranslateApp.module.css";

type AppMode = "normal" | "train";

const SPLIT_OPTIONS: CustomSignSplit[] = ["calibration", "holdout", "ignore"];

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

function downloadJson(filename: string, value: unknown): void {
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

export default function TranslateApp() {
    const [mode, setMode] = useState<AppMode>("normal");
    const [blindExport, setBlindExport] = useState<BlindExportLike | null>(null);
    const [importedClipName, setImportedClipName] = useState<string>("");
    const [result, setResult] = useState<TranslationResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [lexiconVersion, setLexiconVersion] = useState(0);

    // Draft custom sign form (train mode).
    const [draftLabel, setDraftLabel] = useState("");
    const [draftFamily, setDraftFamily] = useState("");
    const [draftConcept, setDraftConcept] = useState("");
    const [draftSplit, setDraftSplit] = useState<CustomSignSplit>("calibration");
    const [draftNotes, setDraftNotes] = useState("");

    const lexicon = useMemo(() => new CustomSignLexicon(), []);
    const baseline = useMemo(() => new BaselineRecognizer(), []);
    const pretrained = useMemo(() => new PretrainedSignRecognizer(), []);
    const adapted = useMemo(
        () => new AdaptedRecognizer({ base: pretrained, lexicon }),
        [pretrained, lexicon],
    );
    const registry = useMemo(
        () =>
            new RecognizerRegistry([
                { recognizer: adapted, role: "semantic-breadth head + local custom signs" },
                { recognizer: pretrained, role: "local semantic-breadth pretrained head" },
                { recognizer: baseline, role: "blind family fallback" },
            ]),
        [adapted, pretrained, baseline],
    );

    const lexiconEntries = useMemo<CustomSignEntry[]>(() => {
        // lexiconVersion is read to force re-render on mutation.
        void lexiconVersion;
        return lexicon.list();
    }, [lexicon, lexiconVersion]);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const lexiconInputRef = useRef<HTMLInputElement>(null);

    const handleLoadExport = async (file: File | null) => {
        setError(null);
        setResult(null);
        if (!file) return;
        try {
            const raw = await readJsonFile<unknown>(file);
            const exportLike = toBlindExportLike(raw);
            if (!exportLike || exportLike.segments.length === 0) {
                throw new Error(
                    "Export JSON missing a segments[] array. Upload a clip on /verify first to produce one.",
                );
            }
            setBlindExport(exportLike);
            setImportedClipName(exportLike.clipName ?? file.name);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
    };

    const handleTranslate = async () => {
        setError(null);
        if (!blindExport) {
            setError(
                "Load a blind inference export first. Normal mode currently consumes blind exports while the pretrained model is being wired in.",
            );
            return;
        }
        const translation = await registry.translate({
            clipName: importedClipName || "unknown-clip",
            blindExport,
        });
        if (!translation) {
            setError("No recognizer could produce output for this clip.");
            return;
        }
        setResult(translation);
    };

    const handleAddCustomSign = () => {
        if (!draftLabel.trim()) return;
        lexicon.upsert({
            label: draftLabel.trim(),
            familyHint: draftFamily.trim(),
            conceptHint: draftConcept.trim(),
            notes: draftNotes.trim(),
            split: draftSplit,
        });
        setLexiconVersion((v) => v + 1);
        setDraftLabel("");
        setDraftFamily("");
        setDraftConcept("");
        setDraftNotes("");
    };

    const handleCorrectSegment = (segmentId: string, correction: string) => {
        if (!result) return;
        const segment = result.segments.find((s) => s.id === segmentId);
        if (!segment || !segment.family) return;
        const trimmed = correction.trim();
        if (trimmed === "") return;
        lexicon.upsert({
            label: trimmed,
            familyHint: segment.family,
            conceptHint: "",
            notes: `corrected via segment ${segmentId}`,
            split: "calibration",
        });
        setLexiconVersion((v) => v + 1);
    };

    const handleRemoveEntry = (id: string) => {
        lexicon.remove(id);
        setLexiconVersion((v) => v + 1);
    };

    const handleExportLexicon = () => {
        downloadJson(
            `custom-signs-${new Date().toISOString().slice(0, 10)}.json`,
            lexicon.toSnapshot(),
        );
    };

    const handleImportLexicon = async (file: File | null) => {
        if (!file) return;
        try {
            const snapshot = await readJsonFile<Parameters<CustomSignLexicon["loadSnapshot"]>[0]>(
                file,
            );
            lexicon.loadSnapshot(snapshot);
            setLexiconVersion((v) => v + 1);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
    };

    return (
        <main className={styles.shell}>
            <header className={styles.header}>
                <h1 className={styles.title}>Translate</h1>
                <p className={styles.lead}>
                    Normal mode shows a best-effort transcript plus a confidence
                    percentage. Train mode lets you correct the output and register
                    custom signs locally. No raw video is uploaded. No hidden reference
                    transcript is loaded.
                </p>
                <div
                    data-testid="translate-mode-toggle"
                    className={styles.modeToggle}
                >
                    <button
                        type="button"
                        data-testid="translate-mode-normal"
                        onClick={() => setMode("normal")}
                        className={cx(styles.modeButton, mode === "normal" && styles.modeButtonActive)}
                    >
                        Normal mode
                    </button>
                    <button
                        type="button"
                        data-testid="translate-mode-train"
                        onClick={() => setMode("train")}
                        className={cx(styles.modeButton, mode === "train" && styles.modeButtonActive)}
                    >
                        Train mode
                    </button>
                </div>
            </header>

            <section className={styles.panel}>
                <h2 className={styles.panelTitle}>1. Load clip evidence</h2>
                <p className={styles.panelText}>
                    Upload a blind inference export JSON produced by{" "}
                    <code>/verify</code> (or pass landmarks directly when a pretrained
                    backend is wired in).
                </p>
                <input
                    ref={fileInputRef}
                    data-testid="translate-export-input"
                    type="file"
                    accept="application/json,.json"
                    title="Load blind inference export JSON"
                    onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        void handleLoadExport(file);
                    }}
                />
                {blindExport ? (
                    <div className={styles.loaded}>
                        Loaded {importedClipName} ({blindExport.segments.length}{" "}
                        segments).
                    </div>
                ) : null}
                {error ? (
                    <div
                        data-testid="translate-error"
                        className={styles.error}
                    >
                        {error}
                    </div>
                ) : null}
                <div className={styles.buttonRow}>
                    <button
                        type="button"
                        data-testid="translate-run"
                        onClick={() => void handleTranslate()}
                        disabled={!blindExport}
                        className={cx(styles.button, !blindExport && styles.buttonDisabled)}
                    >
                        Translate
                    </button>
                </div>
            </section>

            {result ? (
                <section
                    data-testid="translate-result"
                    className={styles.panel}
                >
                    <h2 className={styles.panelTitle}>2. Result</h2>
                    <div className={styles.resultMeta}>
                        <div
                            data-testid="translate-confidence"
                            className={cx(
                                styles.confidence,
                                result.isLowConfidence ? styles.confidenceWarn : styles.confidenceOk,
                            )}
                        >
                            {result.confidencePercent}%
                        </div>
                        <div className={styles.muted}>
                            confidence · source <code>{result.source}</code> ·{" "}
                            model <code>{result.modelId}</code>
                        </div>
                    </div>
                    <p
                        data-testid="translate-transcript"
                        className={styles.transcript}
                    >
                        {result.transcript || "(empty)"}
                    </p>
                    {result.isLowConfidence ? (
                        <div
                            data-testid="translate-low-confidence"
                            className={styles.lowConfidence}
                        >
                            <strong>Low confidence.</strong>{" "}
                            {result.lowConfidenceReason ??
                                "Treat this transcript as a guess."}
                        </div>
                    ) : null}
                    {result.alternatives.length > 0 ? (
                        <div className={styles.alternatives}>
                            <h3 className={styles.alternativesTitle}>Alternatives</h3>
                            <ul className={styles.alternativeList}>
                                {result.alternatives.map((alt, index) => (
                                    <li key={`${alt.text}-${index}`}>
                                        <code>{alt.source}</code> · {Math.round(alt.confidence * 100)}%
                                        — {alt.text}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : null}
                    <details className={styles.segmentDetails}>
                        <summary className={styles.segmentSummary}>
                            Per-segment breakdown
                        </summary>
                        <ul className={styles.segmentList}>
                            {result.segments.map((segment) => (
                                <li key={segment.id} data-testid={`translate-segment-${segment.id}`}>
                                    <code>{segment.id}</code> ({Math.round(segment.confidence * 100)}%) — {segment.text}
                                    {segment.customSignId ? (
                                        <span className={styles.customBadge}>
                                            {" "}
                                            · custom: {segment.customSignId}
                                        </span>
                                    ) : null}
                                    {mode === "train" && segment.family ? (
                                        <SegmentCorrection
                                            segmentId={segment.id}
                                            family={segment.family}
                                            onSubmit={handleCorrectSegment}
                                        />
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    </details>
                </section>
            ) : null}

            {mode === "train" ? (
                <section
                    data-testid="translate-train-panel"
                    className={cx(styles.panel, styles.trainPanel)}
                >
                    <h2 className={styles.panelTitle}>3. Train: custom signs</h2>
                    <p className={cx(styles.panelText, styles.trainText)}>
                        Add your own signs. They are stored only in this browser tab
                        until you export them as JSON.
                    </p>
                    <div className={styles.trainGrid}>
                        <Field
                            label="English label"
                            testId="custom-sign-label"
                            value={draftLabel}
                            onChange={setDraftLabel}
                        />
                        <Field
                            label="family hint (optional)"
                            testId="custom-sign-family"
                            value={draftFamily}
                            onChange={setDraftFamily}
                        />
                        <Field
                            label="concept hint (optional)"
                            testId="custom-sign-concept"
                            value={draftConcept}
                            onChange={setDraftConcept}
                        />
                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>split</span>
                            <select
                                data-testid="custom-sign-split"
                                value={draftSplit}
                                onChange={(event) =>
                                    setDraftSplit(event.target.value as CustomSignSplit)
                                }
                                className={styles.select}
                            >
                                {SPLIT_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                        {option}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>
                    <label className={styles.notesField}>
                        <span className={styles.fieldLabel}>notes</span>
                        <textarea
                            data-testid="custom-sign-notes"
                            rows={2}
                            value={draftNotes}
                            onChange={(event) => setDraftNotes(event.target.value)}
                            className={styles.textarea}
                        />
                    </label>
                    <div className={styles.actionRow}>
                        <button
                            type="button"
                            data-testid="custom-sign-add"
                            onClick={handleAddCustomSign}
                            disabled={!draftLabel.trim()}
                            className={cx(styles.button, !draftLabel.trim() && styles.buttonDisabled)}
                        >
                            Add custom sign
                        </button>
                        <button
                            type="button"
                            data-testid="custom-sign-export"
                            onClick={handleExportLexicon}
                            disabled={lexiconEntries.length === 0}
                            className={cx(styles.button, lexiconEntries.length === 0 && styles.buttonDisabled)}
                        >
                            Export lexicon JSON
                        </button>
                        <label className={styles.importLabel}>
                            <span className={styles.importText}>
                                Import lexicon
                            </span>
                            <input
                                ref={lexiconInputRef}
                                data-testid="custom-sign-import"
                                type="file"
                                accept="application/json,.json"
                                onChange={(event) => {
                                    const file = event.target.files?.[0] ?? null;
                                    void handleImportLexicon(file);
                                }}
                            />
                        </label>
                    </div>
                    {lexiconEntries.length > 0 ? (
                        <ul
                            data-testid="custom-sign-list"
                            className={styles.lexiconList}
                        >
                            {lexiconEntries.map((entry) => (
                                <li
                                    key={entry.id}
                                    data-testid={`custom-sign-${entry.id}`}
                                    className={styles.lexiconEntry}
                                >
                                    <strong>{entry.label}</strong>
                                    {" · "}
                                    <code>{entry.split}</code>
                                    {entry.familyHint ? (
                                        <> · family <code>{entry.familyHint}</code></>
                                    ) : null}
                                    {entry.conceptHint ? (
                                        <> · concept <code>{entry.conceptHint}</code></>
                                    ) : null}
                                    {" · seen "}
                                    {entry.exampleCount}×
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveEntry(entry.id)}
                                        className={styles.removeButton}
                                    >
                                        remove
                                    </button>
                                    {entry.notes ? (
                                        <div className={styles.entryNotes}>{entry.notes}</div>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className={styles.emptyState}>
                            No custom signs yet. Add one above or correct a segment in the
                            result panel.
                        </p>
                    )}
                </section>
            ) : null}
        </main>
    );
}

interface FieldProps {
    label: string;
    testId: string;
    value: string;
    onChange: (value: string) => void;
}

function Field({ label, testId, value, onChange }: FieldProps) {
    return (
        <label className={styles.field}>
            <span className={styles.fieldLabel}>{label}</span>
            <input
                type="text"
                data-testid={testId}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className={styles.textInput}
            />
        </label>
    );
}

interface SegmentCorrectionProps {
    segmentId: string;
    family: string;
    onSubmit: (segmentId: string, label: string) => void;
}

function SegmentCorrection({ segmentId, family, onSubmit }: SegmentCorrectionProps) {
    const [value, setValue] = useState("");
    return (
        <div className={styles.segmentCorrection}>
            <input
                type="text"
                data-testid={`translate-correct-${segmentId}`}
                placeholder={`correct as (family ${family})`}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                className={styles.correctionInput}
            />
            <button
                type="button"
                data-testid={`translate-correct-submit-${segmentId}`}
                onClick={() => {
                    onSubmit(segmentId, value);
                    setValue("");
                }}
                disabled={!value.trim()}
                className={cx(styles.button, !value.trim() && styles.buttonDisabled)}
            >
                save
            </button>
        </div>
    );
}

function cx(...classes: Array<string | false | null | undefined>): string {
    return classes.filter(Boolean).join(" ");
}
