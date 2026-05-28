import type { VerificationReference } from "@/lib/video/VerificationReport";

export async function loadBundledVerificationReference() {
  const referenceModule = await import("@/lib/benchmarks/sampleClip.reference.json");
  return referenceModule.default as VerificationReference;
}
