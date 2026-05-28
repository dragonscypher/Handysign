import { inspectVideoFrameForAnalysis } from "@/lib/video/ClipLoader";

function createVideoState(overrides?: {
  duration?: number;
  currentTime?: number;
  readyState?: number;
  width?: number;
  height?: number;
}) {
  const video = document.createElement("video");

  Object.defineProperty(video, "duration", {
    configurable: true,
    value: overrides?.duration ?? 12,
  });
  Object.defineProperty(video, "currentTime", {
    configurable: true,
    value: overrides?.currentTime ?? 1,
    writable: true,
  });
  Object.defineProperty(video, "readyState", {
    configurable: true,
    value: overrides?.readyState ?? 2,
  });
  Object.defineProperty(video, "videoWidth", {
    configurable: true,
    value: overrides?.width ?? 640,
  });
  Object.defineProperty(video, "videoHeight", {
    configurable: true,
    value: overrides?.height ?? 480,
  });

  return video;
}

describe("ClipLoader frame guards", () => {
  it("rejects invalid timestamps and unready frames", () => {
    expect(inspectVideoFrameForAnalysis(createVideoState(), Number.NaN).reason).toBe(
      "invalid-timestamp",
    );
    expect(
      inspectVideoFrameForAnalysis(
        createVideoState({
          duration: 0,
        }),
        0,
      ).reason,
    ).toBe("invalid-duration");
    expect(
      inspectVideoFrameForAnalysis(
        createVideoState({
          readyState: 1,
        }),
        1,
      ).reason,
    ).toBe("ready-state-low");
    expect(
      inspectVideoFrameForAnalysis(
        createVideoState({
          currentTime: 0,
        }),
        2,
      ).reason,
    ).toBe("seek-not-settled");
  });

  it("accepts decoded frame with valid metadata, duration, and settled seek", () => {
    expect(
      inspectVideoFrameForAnalysis(
        createVideoState({
          duration: 12,
          currentTime: 2,
          readyState: 3,
          width: 640,
          height: 480,
        }),
        2,
      ),
    ).toEqual({
      ok: true,
      reason: "ready",
    });
  });
});
