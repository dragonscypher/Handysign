import ConsentScreen from "@/components/ConsentScreen";
import {
  readLiveE2EFlags,
  serializeLiveE2EQuery,
} from "@/lib/testing/e2eFlags";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    forceMockLandmarks?: string | string[];
    e2eScenario?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const liveHref = `/live${serializeLiveE2EQuery(readLiveE2EFlags(params))}`;

  return <ConsentScreen liveHref={liveHref} />;
}
