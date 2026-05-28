import type { BlindInferenceReport } from "@/lib/video/BlindInferenceReport";

export interface BlindCompareMetric {
  baseline: number;
  current: number;
  delta: number;
}

export interface BlindInferenceComparisonResult {
  baselineClipName: string;
  currentClipName: string;
  metrics: {
    segmentCount: BlindCompareMetric;
    lexemeCount: BlindCompareMetric;
    genericUnknownCount: BlindCompareMetric;
    eventFamilyDiversity: BlindCompareMetric;
    repeatedPatternCount: BlindCompareMetric;
    unresolvedSegmentCount: BlindCompareMetric;
    averageConfidenceMargin: BlindCompareMetric;
    refinementCount: BlindCompareMetric;
  };
  familyCounts: Array<{
    label: string;
    baseline: number;
    current: number;
    delta: number;
  }>;
  focusFamilyCounts: {
    fingerspell: BlindCompareMetric;
    bigFall: BlindCompareMetric;
    approval: BlindCompareMetric;
  };
  failureTagCounts: Array<{
    tag: string;
    baseline: number;
    current: number;
    delta: number;
  }>;
  likelyConfusionPairs: Array<{
    pair: string;
    baseline: number;
    current: number;
    delta: number;
  }>;
  topChainDifferences: {
    eventFamily: {
      baseline: string;
      current: string;
      changed: boolean;
    };
    lexeme: {
      baseline: string;
      current: string;
      changed: boolean;
    };
  };
}

function metric(baseline: number, current: number): BlindCompareMetric {
  return {
    baseline,
    current,
    delta: Number((current - baseline).toFixed(4)),
  };
}

function countBy<T extends string>(values: T[]) {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function mergeCounts<TKey extends "label" | "tag" | "pair">(
  baseline: Record<string, number>,
  current: Record<string, number>,
  keyName: TKey,
): Array<
  {
    baseline: number;
    current: number;
    delta: number;
  } & Record<TKey, string>
> {
  return Array.from(new Set([...Object.keys(baseline), ...Object.keys(current)]))
    .sort()
    .map((key) => ({
      [keyName]: key,
      baseline: baseline[key] ?? 0,
      current: current[key] ?? 0,
      delta: (current[key] ?? 0) - (baseline[key] ?? 0),
    })) as Array<
      {
        baseline: number;
        current: number;
        delta: number;
      } & Record<TKey, string>
    >;
}

export function isBlindInferenceReport(value: unknown): value is BlindInferenceReport {
  if (!value || typeof value !== "object") {
    return false;
  }

  const report = value as Partial<BlindInferenceReport>;
  return (
    report.mode === "blind-inference" &&
    typeof report.clipName === "string" &&
    Array.isArray(report.segments) &&
    Boolean(report.summary) &&
    !("reference" in report)
  );
}

export function compareBlindInferenceReports(
  baseline: BlindInferenceReport,
  current: BlindInferenceReport,
): BlindInferenceComparisonResult {
  const baselineFamilyCounts = countBy(
    baseline.segments.map((segment) => segment.eventFamilyHypothesis),
  );
  const currentFamilyCounts = countBy(
    current.segments.map((segment) => segment.eventFamilyHypothesis),
  );
  const baselineFailureCounts = countBy(
    baseline.summary.improveNext.failureTagCounts.flatMap((item) =>
      Array.from({ length: item.count }, () => item.tag),
    ),
  );
  const currentFailureCounts = countBy(
    current.summary.improveNext.failureTagCounts.flatMap((item) =>
      Array.from({ length: item.count }, () => item.tag),
    ),
  );
  const baselineConfusionCounts = Object.fromEntries(
    baseline.summary.improveNext.likelyConfusionPairs.map((item) => [item.pair, item.count]),
  );
  const currentConfusionCounts = Object.fromEntries(
    current.summary.improveNext.likelyConfusionPairs.map((item) => [item.pair, item.count]),
  );

  return {
    baselineClipName: baseline.clipName,
    currentClipName: current.clipName,
    metrics: {
      segmentCount: metric(baseline.segments.length, current.segments.length),
      lexemeCount: metric(baseline.lexemes.length, current.lexemes.length),
      genericUnknownCount: metric(
        baseline.summary.metrics.genericUnknownCount,
        current.summary.metrics.genericUnknownCount,
      ),
      eventFamilyDiversity: metric(
        baseline.summary.metrics.eventFamilyDiversity,
        current.summary.metrics.eventFamilyDiversity,
      ),
      repeatedPatternCount: metric(
        baseline.summary.repeatedPatterns.length,
        current.summary.repeatedPatterns.length,
      ),
      unresolvedSegmentCount: metric(
        baseline.summary.unresolvedSegments.length,
        current.summary.unresolvedSegments.length,
      ),
      averageConfidenceMargin: metric(
        baseline.summary.metrics.averageConfidenceMargin,
        current.summary.metrics.averageConfidenceMargin,
      ),
      refinementCount: metric(
        baseline.summary.metrics.refinementCount,
        current.summary.metrics.refinementCount,
      ),
    },
    familyCounts: mergeCounts(baselineFamilyCounts, currentFamilyCounts, "label"),
    focusFamilyCounts: {
      fingerspell: metric(
        baselineFamilyCounts["fingerspell/emphatic-letter-sequence-like"] ?? 0,
        currentFamilyCounts["fingerspell/emphatic-letter-sequence-like"] ?? 0,
      ),
      bigFall: metric(
        baselineFamilyCounts["big-fall-like"] ?? 0,
        currentFamilyCounts["big-fall-like"] ?? 0,
      ),
      approval: metric(
        baselineFamilyCounts["approval/celebration-like"] ?? 0,
        currentFamilyCounts["approval/celebration-like"] ?? 0,
      ),
    },
    failureTagCounts: mergeCounts(baselineFailureCounts, currentFailureCounts, "tag"),
    likelyConfusionPairs: mergeCounts(baselineConfusionCounts, currentConfusionCounts, "pair"),
    topChainDifferences: {
      eventFamily: {
        baseline: baseline.summary.topEventChain,
        current: current.summary.topEventChain,
        changed: baseline.summary.topEventChain !== current.summary.topEventChain,
      },
      lexeme: {
        baseline: baseline.summary.topLexemeChain,
        current: current.summary.topLexemeChain,
        changed: baseline.summary.topLexemeChain !== current.summary.topLexemeChain,
      },
    },
  };
}
