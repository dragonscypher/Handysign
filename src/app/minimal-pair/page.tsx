import MinimalPairLab from "@/components/MinimalPairLab";
import { readLiveE2EFlags } from "@/lib/testing/e2eFlags";

export default async function MinimalPairPage({
  searchParams,
}: {
  searchParams: Promise<{
    candidateAId?: string | string[];
    candidateBId?: string | string[];
    forceMockLandmarks?: string | string[];
    e2eScenario?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const flags = readLiveE2EFlags(params);
  const candidateAId = Array.isArray(params.candidateAId)
    ? params.candidateAId[0]
    : params.candidateAId;
  const candidateBId = Array.isArray(params.candidateBId)
    ? params.candidateBId[0]
    : params.candidateBId;

  return (
    <MinimalPairLab
      initialCandidateAId={candidateAId ?? ""}
      initialCandidateBId={candidateBId ?? ""}
      forceMockLandmarks={flags.forceMockLandmarks}
      e2eScenario={flags.scenario}
    />
  );
}
