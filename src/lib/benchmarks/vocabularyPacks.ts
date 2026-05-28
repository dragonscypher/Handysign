export type BenchmarkVocabularyPackId =
  | "sample-clip-benchmark"
  | "greetings-basic-interaction"
  | "eating-drinking-actions"
  | "movement-travel-actions"
  | "work-object-actions";

export interface BenchmarkVocabularyConcept {
  id: string;
  label: string;
  aliases: string[];
  cueNotes?: string;
  demoOnly: boolean;
  benchmarkSupported: boolean;
}

export interface BenchmarkVocabularyPack {
  id: BenchmarkVocabularyPackId;
  label: string;
  description: string;
  concepts: BenchmarkVocabularyConcept[];
}

function concept(
  id: string,
  label: string,
  aliases: string[],
  cueNotes: string,
): BenchmarkVocabularyConcept {
  return {
    id,
    label,
    aliases,
    cueNotes,
    demoOnly: false,
    benchmarkSupported: true,
  };
}

const GREETINGS_BASIC_CONCEPTS: BenchmarkVocabularyConcept[] = [
  concept(
    "intro-greeting",
    "intro / greeting",
    ["hello", "hi", "greeting", "intro"],
    "Often needs opening motion plus face-zone context.",
  ),
  concept(
    "person-man",
    "person / man",
    ["person", "man"],
    "Body or head framing can matter more than exact handshape alone.",
  ),
  concept(
    "hat",
    "hat",
    ["hat", "cap"],
    "Head-zone location often matters for this concept.",
  ),
];

const EATING_DRINKING_CONCEPTS: BenchmarkVocabularyConcept[] = [
  concept(
    "lunchbox-food",
    "lunchbox / food",
    ["lunchbox", "food", "meal", "lunch"],
    "Handshape and object-carry path can help here.",
  ),
  concept(
    "eat",
    "eat",
    ["eat", "eats", "eating", "lunch"],
    "Mouth and hand-to-mouth path can both matter.",
  ),
  concept(
    "drink-coffee",
    "drink / coffee",
    ["drink", "drinks", "coffee"],
    "Mouth cue and cup-like path can matter here.",
  ),
  concept(
    "apple",
    "apple",
    ["apple"],
    "Often needs stable handshape near face or mouth zone.",
  ),
];

const MOVEMENT_TRAVEL_CONCEPTS: BenchmarkVocabularyConcept[] = [
  concept(
    "walk-go",
    "walk / go",
    ["walk", "walking", "go", "move"],
    "Motion path matters more than single-frame pose.",
  ),
  concept(
    "continue-go-on",
    "continue / go on",
    ["continue", "continues", "go on"],
    "Timing and repeated forward motion can matter.",
  ),
  concept(
    "forest-trees",
    "forest / trees",
    ["forest", "tree", "trees", "woods"],
    "Signing-space location and repeated vertical forms can matter.",
  ),
  concept(
    "timber-fall",
    "timber / fall",
    ["timber", "fall", "falls", "falling"],
    "Large motion path or fall direction can matter.",
  ),
  concept(
    "big-tree",
    "big tree",
    ["big tree", "bigger tree", "enormous tree", "large tree"],
    "Size emphasis is coarse here, not linguistic authority.",
  ),
];

const WORK_OBJECT_CONCEPTS: BenchmarkVocabularyConcept[] = [
  concept(
    "axe",
    "axe",
    ["axe", "ax"],
    "Object-like handshape and carry path can help.",
  ),
  concept(
    "chop-cut",
    "chop / cut",
    ["chop", "chops", "cut", "cuts", "cutting"],
    "Repeated downward motion usually matters most.",
  ),
  concept(
    "work-gear",
    "work gear",
    ["work gear", "gear", "tools"],
    "Object context is coarse here and often under-specified.",
  ),
];

function uniqueConcepts(concepts: BenchmarkVocabularyConcept[]) {
  const map = new Map<string, BenchmarkVocabularyConcept>();

  for (const item of concepts) {
    map.set(item.id, item);
  }

  return Array.from(map.values());
}

export const BENCHMARK_VOCABULARY_PACKS: BenchmarkVocabularyPack[] = [
  {
    id: "sample-clip-benchmark",
    label: "Sample clip benchmark",
    description:
      "Combined benchmark concepts for sample clip review. Constrained concept coverage only.",
    concepts: uniqueConcepts([
      ...GREETINGS_BASIC_CONCEPTS,
      ...EATING_DRINKING_CONCEPTS,
      ...MOVEMENT_TRAVEL_CONCEPTS,
      ...WORK_OBJECT_CONCEPTS,
    ]),
  },
  {
    id: "greetings-basic-interaction",
    label: "Greetings / basic interaction",
    description: "Greeting and person-level concepts for constrained benchmark review.",
    concepts: GREETINGS_BASIC_CONCEPTS,
  },
  {
    id: "eating-drinking-actions",
    label: "Eating / drinking actions",
    description: "Food and drink concepts for constrained benchmark review.",
    concepts: EATING_DRINKING_CONCEPTS,
  },
  {
    id: "movement-travel-actions",
    label: "Movement / travel actions",
    description: "Motion, travel, and environment concepts for constrained benchmark review.",
    concepts: MOVEMENT_TRAVEL_CONCEPTS,
  },
  {
    id: "work-object-actions",
    label: "Work / object actions",
    description: "Tool and work-action concepts for constrained benchmark review.",
    concepts: WORK_OBJECT_CONCEPTS,
  },
];

export const DEFAULT_BENCHMARK_VOCABULARY_PACK_ID: BenchmarkVocabularyPackId =
  "sample-clip-benchmark";

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]/g, " ")
    .replace(/[/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function listBenchmarkVocabularyPacks() {
  return BENCHMARK_VOCABULARY_PACKS;
}

export function getBenchmarkVocabularyPack(
  packId: BenchmarkVocabularyPackId = DEFAULT_BENCHMARK_VOCABULARY_PACK_ID,
) {
  return (
    BENCHMARK_VOCABULARY_PACKS.find((pack) => pack.id === packId) ??
    BENCHMARK_VOCABULARY_PACKS[0]
  );
}

export function getBenchmarkConceptById(
  pack: BenchmarkVocabularyPack,
  conceptId: string,
) {
  return pack.concepts.find((concept) => concept.id === conceptId) ?? null;
}

export function matchConceptsForText(
  pack: BenchmarkVocabularyPack,
  text: string,
) {
  const normalizedText = ` ${normalize(text)} `;

  return pack.concepts.filter((concept) =>
    [concept.label, ...concept.aliases].some((alias) =>
      normalizedText.includes(` ${normalize(alias)} `),
    ),
  );
}
