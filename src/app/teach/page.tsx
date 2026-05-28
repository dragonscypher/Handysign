import TeachMode from "@/components/TeachMode";

export default async function TeachPage({
  searchParams,
}: {
  searchParams: Promise<{
    label?: string | string[];
    confusedLabel?: string | string[];
    confusedCandidateId?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const label = Array.isArray(params.label) ? params.label[0] : params.label;
  const confusedLabel = Array.isArray(params.confusedLabel)
    ? params.confusedLabel[0]
    : params.confusedLabel;
  const confusedCandidateId = Array.isArray(params.confusedCandidateId)
    ? params.confusedCandidateId[0]
    : params.confusedCandidateId;

  return (
    <TeachMode
      initialLabel={label ?? ""}
      confusedLabel={confusedLabel ?? ""}
      confusedCandidateId={confusedCandidateId ?? ""}
    />
  );
}
