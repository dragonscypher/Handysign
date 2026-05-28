"use client";

import type { VerificationSegmentResult } from "@/lib/video/VerificationReport";
import SegmentReviewCard from "@/components/SegmentReviewCard";

interface VerificationTimelineProps {
  segments: VerificationSegmentResult[];
  onExpectedChange: (segmentId: string, nextExpected: string) => void;
  onCalibrationChange: (segmentId: string, checked: boolean) => void;
  debugEnabled: boolean;
  comparisonMode: "exact" | "concept-level";
}

export default function VerificationTimeline({
  segments,
  onExpectedChange,
  onCalibrationChange,
  debugEnabled,
  comparisonMode,
}: VerificationTimelineProps) {
  return (
    <section className="panel section-stack">
      <div className="split-line">
        <div>
          <h2 className="title-md">Verification timeline</h2>
          <p className="body-sm">
            Review each segment with expected reference, model output, alternatives, and debt.
          </p>
        </div>
        <span className="badge">{segments.length} segments</span>
      </div>

      <div className="memory-list">
        {segments.map((segment) => (
          <SegmentReviewCard
            key={segment.id}
            segment={segment}
            onExpectedChange={onExpectedChange}
            onCalibrationChange={onCalibrationChange}
            debugEnabled={debugEnabled}
            comparisonMode={comparisonMode}
          />
        ))}
      </div>
    </section>
  );
}
