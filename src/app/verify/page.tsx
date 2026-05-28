import VerifyUploader from "@/components/VerifyUploader";
import { readLiveE2EFlags } from "@/lib/testing/e2eFlags";

export default async function VerifyPage({
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
    <VerifyUploader
      forceMockLandmarks={flags.forceMockLandmarks}
      forceMockVerification={flags.forceMockVerification}
    />
  );
}
