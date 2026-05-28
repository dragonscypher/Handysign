import { PrototypeStore } from "@/lib/recognition/PrototypeStore";
import { LocalDataStore } from "@/lib/privacy/LocalDataStore";
import { createConfusionPair } from "./testUtils";

describe("ContrastiveMemory", () => {
  it("stores, updates count, deletes, exports, and keeps raw video out", async () => {
    const store = new LocalDataStore(`signrepair-confusion-${crypto.randomUUID()}`);
    const prototypes = new PrototypeStore(store);
    const pair = createConfusionPair();

    await prototypes.saveConfusionPair(pair);
    await prototypes.saveConfusionPair({
      ...pair,
      updatedAt: new Date(Date.now() + 1000).toISOString(),
    });

    const exported = await prototypes.export();

    expect(exported.confusionPairs).toHaveLength(1);
    expect(exported.confusionPairs[0]?.count).toBe(2);
    expect("rawVideo" in exported.confusionPairs[0]!).toBe(false);

    await prototypes.deleteConfusionPair(pair.id);

    const afterDelete = await prototypes.export();

    expect(afterDelete.confusionPairs).toHaveLength(0);
  });
});
