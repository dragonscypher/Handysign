import { featureEncoder } from "@/lib/features/FeatureEncoder";
import { createBufferSnapshot } from "./testUtils";

describe("FeatureEncoder", () => {
  it("encodes temporal landmark buffers into fixed vectors", () => {
    const snapshot = createBufferSnapshot({ frameCount: 32, motion: "dynamic" });
    const encoded = featureEncoder.encode(snapshot.buffer);

    expect(encoded.frameCount).toBe(32);
    expect(encoded.centroid).toHaveLength(32);
    expect(encoded.quality.motionEnergy).toBeGreaterThan(0.08);
    expect(encoded.quality.handVisibleRatio).toBe(1);
  });

  it("detects weak motion in short static clips", () => {
    const snapshot = createBufferSnapshot({ frameCount: 12, motion: "static" });
    const encoded = featureEncoder.encode(snapshot.buffer);

    expect(encoded.quality.validFrameCount).toBe(12);
    expect(encoded.quality.motionEnergy).toBeLessThan(0.08);
  });
});
