import {
  buildVocabularyPackSummary,
  compareExpectedConceptsToRecognition,
} from "@/lib/video/VerificationReport";
import {
  DEFAULT_BENCHMARK_VOCABULARY_PACK_ID,
  getBenchmarkVocabularyPack,
  listBenchmarkVocabularyPacks,
  matchConceptsForText,
} from "@/lib/benchmarks/vocabularyPacks";
import {
  createRecognitionResult,
  createUncertaintyDecision,
} from "./testUtils";

describe("benchmark vocabulary packs", () => {
  it("loads default sample benchmark pack with constrained concept set", () => {
    const packs = listBenchmarkVocabularyPacks();
    const pack = getBenchmarkVocabularyPack(DEFAULT_BENCHMARK_VOCABULARY_PACK_ID);

    expect(packs.length).toBeGreaterThan(3);
    expect(pack.id).toBe("sample-clip-benchmark");
    expect(pack.concepts.some((concept) => concept.id === "intro-greeting")).toBe(true);
    expect(pack.concepts.some((concept) => concept.id === "drink-coffee")).toBe(true);
  });

  it("matches concept aliases from constrained labels", () => {
    const pack = getBenchmarkVocabularyPack("sample-clip-benchmark");

    expect(matchConceptsForText(pack, "hello").map((concept) => concept.id)).toContain(
      "intro-greeting",
    );
    expect(
      matchConceptsForText(pack, "drink / coffee").map((concept) => concept.id),
    ).toContain("drink-coffee");
  });

  it("reports concept-level hits and insufficient examples separately", () => {
    const recognition = createRecognitionResult({
      topK: [
        {
          id: "session-intro",
          label: "intro / greeting",
          source: "session",
          centroid: [],
          metadata: {},
          examplesCount: 1,
          updatedAt: new Date().toISOString(),
          confidence: 0.7,
          distance: 0.2,
        },
      ],
      top1: {
        id: "session-intro",
        label: "intro / greeting",
        source: "session",
        centroid: [],
        metadata: {},
        examplesCount: 1,
        updatedAt: new Date().toISOString(),
        confidence: 0.7,
        distance: 0.2,
      },
    });
    const decision = createUncertaintyDecision({
      mode: "accept",
      primaryCandidate: recognition.top1,
      alternatives: recognition.topK,
    });
    const evaluation = compareExpectedConceptsToRecognition({
      expectedConceptIds: ["intro-greeting"],
      vocabularyPack: buildVocabularyPackSummary("sample-clip-benchmark", {
        "intro-greeting": 1,
      }),
      recognition,
      decision,
    });

    expect(evaluation.hits.map((concept) => concept.id)).toEqual(["intro-greeting"]);
    expect(evaluation.result).toBe("insufficient-examples");
  });
});
