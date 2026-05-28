import {
  captureClipRuntimeLogs,
  classifyClipRuntimeLog,
  type BenchmarkAnalysisDebug,
} from "@/lib/recognition/BenchmarkEvaluator";

function createDebug(): BenchmarkAnalysisDebug {
  return {
    detectorInitStatus: "ready",
    runtimeLogs: [],
    analysisWarnings: [],
    frameStats: {
      totalFramesRequested: 0,
      framesAnalyzed: 0,
      framesSkipped: 0,
      duplicateTimestampsSkipped: 0,
      invalidTimestampsSkipped: 0,
      detectorFailures: 0,
      firstTimestampMs: null,
      lastTimestampMs: null,
    },
  };
}

describe("BenchmarkEvaluator runtime log adapter", () => {
  it("classifies non-fatal TFLite info logs without treating them as analysis errors", () => {
    expect(
      classifyClipRuntimeLog(["INFO: Created TensorFlow Lite XNNPACK delegate for CPU."]),
    ).toEqual({
      level: "info",
      message: "INFO: Created TensorFlow Lite XNNPACK delegate for CPU.",
    });
    expect(classifyClipRuntimeLog([new Error("real detector failure")])).toBeNull();
  });

  it("reroutes non-fatal runtime console.error output into debug log collector", () => {
    const debug = createDebug();
    const errorSpy = vi.spyOn(console, "error");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);

    captureClipRuntimeLogs("detectForVideo@100ms", debug, () => {
      console.error("INFO: Created TensorFlow Lite XNNPACK delegate for CPU.");
      return "ok";
    });

    expect(debug.runtimeLogs).toHaveLength(1);
    expect(debug.runtimeLogs[0]).toMatchObject({
      level: "info",
      context: "detectForVideo@100ms",
    });
    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalled();
  });
});
