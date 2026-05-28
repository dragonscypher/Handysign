import { segmentLandmarkFrames } from "@/lib/video/Segmenter";
import { createBufferSnapshot } from "./testUtils";

describe("segmentLandmarkFrames", () => {
  it("splits landmark frames into ordered timeline segments", () => {
    const snapshot = createBufferSnapshot({ frameCount: 36, motion: "dynamic" });

    const segments = segmentLandmarkFrames(snapshot.buffer, {
      targetSegments: 4,
      minFramesPerSegment: 6,
    });

    expect(segments).toHaveLength(4);
    expect(segments[0]?.id).toBe("seg-01");
    expect(segments[3]?.id).toBe("seg-04");
    expect(segments.every((segment) => segment.frames.length > 0)).toBe(true);
    expect(segments[0]!.startMs).toBeLessThan(segments[1]!.startMs);
    expect(segments[1]!.startMs).toBeLessThan(segments[2]!.startMs);
  });
});
