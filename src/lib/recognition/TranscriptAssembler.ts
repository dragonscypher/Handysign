import type { VerificationSegmentResult } from "@/lib/video/VerificationReport";

export function assembleVerificationTranscript(
  segments: Pick<VerificationSegmentResult, "modelOutput">[],
) {
  return segments.map((segment) => segment.modelOutput.trim()).filter(Boolean).join(" / ");
}
