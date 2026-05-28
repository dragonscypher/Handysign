export type EvidenceHealthStatus = "healthy" | "watch" | "needs-review" | "unknown";

export type EvidenceMemoryType =
  | "personal-sign"
  | "confusion-twin"
  | "motion-receipt"
  | "signform-ledger"
  | "minimal-pair-card";

export type EvidenceHealthActionId =
  | "record-more-examples"
  | "open-minimal-pair-lab"
  | "run-cue-patch"
  | "review-signform-notes"
  | "delete-stale-memory"
  | "keep-observing"
  | "export-for-human-review";

export interface EvidenceHealthAction {
  id: EvidenceHealthActionId;
  title: string;
  instruction: string;
  targetRoute?: string;
  targetId?: string;
}

export interface MemoryHealthSummary {
  memoryType: EvidenceMemoryType;
  memoryId: string;
  label: string;
  status: EvidenceHealthStatus;
  score: number;
  reasons: string[];
  evidenceCounts: Record<string, number>;
  lastUpdated: string;
  recommendedAction: EvidenceHealthAction;
}

export interface DriftWarning {
  id: string;
  targetType: EvidenceMemoryType;
  targetId: string;
  label: string;
  severity: "low" | "medium" | "high";
  reason: string;
  recentEvidenceIds: string[];
  recommendedAction: EvidenceHealthAction;
}

export interface CoverageGap {
  id: string;
  gapType:
    | "too-few-examples"
    | "missing-mouth-cue"
    | "missing-face-cue"
    | "weak-handshape"
    | "weak-location"
    | "repeated-confusion"
    | "stale-memory"
    | "low-visibility";
  label: string;
  why: string;
  recommendedAction: EvidenceHealthAction;
}

export interface EvidenceHealthPrivacy {
  landmarkOnly: true;
  rawVideoStored: false;
  pixelDataStored: false;
  uploaded: false;
}

export interface EvidenceHealthReport {
  id: string;
  createdAt: string;
  overallStatus: EvidenceHealthStatus;
  memorySummaries: MemoryHealthSummary[];
  driftWarnings: DriftWarning[];
  coverageGaps: CoverageGap[];
  recommendedActions: EvidenceHealthAction[];
  privacy: EvidenceHealthPrivacy;
}

export const HEALTH_STATUS_PRIORITY: EvidenceHealthStatus[] = [
  "needs-review",
  "watch",
  "healthy",
  "unknown",
];

export function evidenceHealthStatusLabel(status: EvidenceHealthStatus) {
  switch (status) {
    case "healthy":
      return "Healthy";
    case "watch":
      return "Watch";
    case "needs-review":
      return "Needs review";
    case "unknown":
    default:
      return "Unknown";
  }
}

export function evidenceMemoryTypeLabel(type: EvidenceMemoryType) {
  switch (type) {
    case "personal-sign":
      return "Personal sign";
    case "confusion-twin":
      return "Confusion Twin";
    case "motion-receipt":
      return "Motion receipt";
    case "signform-ledger":
      return "SignForm Ledger";
    case "minimal-pair-card":
      return "Minimal Pair card";
    default:
      return type;
  }
}

export function evidenceHealthSummaryKey(
  memoryType: EvidenceMemoryType,
  memoryId: string,
) {
  return `${memoryType}:${memoryId}`;
}

export function worstEvidenceHealthStatus(
  statuses: EvidenceHealthStatus[],
): EvidenceHealthStatus {
  for (const candidate of HEALTH_STATUS_PRIORITY) {
    if (statuses.includes(candidate)) {
      return candidate;
    }
  }

  return "unknown";
}

export function evidenceHealthCounts(report: EvidenceHealthReport | null | undefined) {
  const counts = {
    healthy: 0,
    watch: 0,
    "needs-review": 0,
    unknown: 0,
  };

  for (const summary of report?.memorySummaries ?? []) {
    counts[summary.status] += 1;
  }

  return counts;
}
