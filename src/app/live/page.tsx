import LiveInterpreter from "@/components/LiveInterpreter";
import { readLiveE2EFlags } from "@/lib/testing/e2eFlags";

export default async function LivePage({
  searchParams,
}: {
  searchParams: Promise<{
    forceMockLandmarks?: string | string[];
    e2eScenario?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const flags = readLiveE2EFlags(params);

  return (
    <LiveInterpreter
      forceMockLandmarks={flags.forceMockLandmarks}
      e2eScenario={flags.scenario}
    />
  );
}
