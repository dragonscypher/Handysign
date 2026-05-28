import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, vi } from "vitest";
import VerifyUploader from "@/components/VerifyUploader";
import { LocalDataStore } from "@/lib/privacy/LocalDataStore";
import { PrototypeStore } from "@/lib/recognition/PrototypeStore";
import {
  createBlindInferenceReport,
  createVerificationReport,
} from "./testUtils";

const loadBundledVerificationReferenceMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/benchmarks/loadBundledVerificationReference", () => ({
  loadBundledVerificationReference: loadBundledVerificationReferenceMock,
}));

describe("VerifyUploader", () => {
  beforeEach(() => {
    loadBundledVerificationReferenceMock.mockReset();
  });

  it("runs blind inference without loading bundled reference text", async () => {
    const user = userEvent.setup();
    const blindReport = createBlindInferenceReport();
    const evaluator = {
      analyzeBlindClip: vi.fn(async ({ file }) => ({
        clipName: file.name,
        clipDurationMs: 4200,
        extractorKind: "mock" as const,
        notes: ["Fixture blind analysis."],
        candidateCatalog: [],
        debug: {
          detectorInitStatus: "mock-fallback" as const,
          runtimeLogs: [],
          analysisWarnings: [],
          frameStats: {
            totalFramesRequested: 24,
            framesAnalyzed: 24,
            framesSkipped: 0,
            duplicateTimestampsSkipped: 0,
            invalidTimestampsSkipped: 0,
            detectorFailures: 0,
            firstTimestampMs: 0,
            lastTimestampMs: 4200,
          },
        },
        segments: [],
      })),
      buildBlindReport: vi.fn(() => blindReport),
      analyzeClip: vi.fn(),
      buildReport: vi.fn(),
    };

    render(<VerifyUploader evaluator={evaluator} forceMockLandmarks />);

    const file = new File(["fixture"], "sample clip.mp4", { type: "video/mp4" });
    await user.upload(
      screen.getByLabelText(/Upload mp4 clip for verification/i),
      file,
    );
    await user.click(screen.getByRole("button", { name: /Process uploaded clip for verification/i }));

    expect(await screen.findByRole("heading", { name: /Unseen clip validation summary/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /Blind inference timeline/i })).toBeInTheDocument();
    expect(await screen.findByText(/Top lexeme chain:/i)).toBeInTheDocument();
    expect((await screen.findAllByText(/Blind lexemes:/i)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/Runner-up family:/i)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/Confidence margin:/i)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/Failure tags:/i)).length).toBeGreaterThan(0);
    expect(await screen.findByRole("heading", { name: /Blind export compare/i })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Save discovered blind lexemes locally/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Expected reference for/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Reset expected reference to bundled benchmark/i }),
    ).not.toBeInTheDocument();
    expect(loadBundledVerificationReferenceMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Export blind inference report as JSON/i }));
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it("keeps benchmark modes working and loads bundled reference only there", async () => {
    const user = userEvent.setup();
    const store = new LocalDataStore(`signrepair-verify-${crypto.randomUUID()}`);
    const prototypes = new PrototypeStore(store);
    const report = createVerificationReport();

    loadBundledVerificationReferenceMock.mockResolvedValue(report.reference);

    const evaluator = {
      analyzeBlindClip: vi.fn(),
      buildBlindReport: vi.fn(),
      analyzeClip: vi.fn(async ({ file, reference }) => ({
        clipName: file.name,
        clipDurationMs: 4800,
        extractorKind: "mock" as const,
        notes: ["Fixture verify analysis."],
        candidateCatalog: [],
        reference,
        debug: {
          detectorInitStatus: "mock-fallback" as const,
          runtimeLogs: [],
          analysisWarnings: [],
          frameStats: {
            totalFramesRequested: 12,
            framesAnalyzed: 12,
            framesSkipped: 0,
            duplicateTimestampsSkipped: 0,
            invalidTimestampsSkipped: 0,
            detectorFailures: 0,
            firstTimestampMs: 0,
            lastTimestampMs: 4800,
          },
        },
        segments: [],
      })),
      buildReport: vi.fn(() => report),
    };

    render(
      <VerifyUploader
        prototypeStoreInstance={prototypes}
        evaluator={evaluator}
        forceMockLandmarks
      />,
    );

    const file = new File(["fixture"], "sample clip.mp4", { type: "video/mp4" });
    await user.selectOptions(
      screen.getByLabelText(/Select verify mode/i),
      "concept-benchmark",
    );
    await user.upload(
      screen.getByLabelText(/Upload mp4 clip for verification/i),
      file,
    );

    expect(screen.getByLabelText(/Select benchmark vocabulary pack/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Process uploaded clip for verification/i }));

    expect(await screen.findByRole("heading", { name: /Prediction comparison/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /Verification timeline/i })).toBeInTheDocument();
    expect(await screen.findByLabelText(/Expected reference for seg-01/i)).toBeInTheDocument();
    expect(
      await screen.findByText(/Concept-level mode estimates partial benchmark concept coverage/i),
    ).toBeInTheDocument();
    expect(loadBundledVerificationReferenceMock).toHaveBeenCalledTimes(1);

    await user.selectOptions(
      screen.getByLabelText(/Select verify mode/i),
      "exact-benchmark",
    );
    expect(await screen.findByText(/Exact mode keeps strict string-level scoring/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Save verification report locally/i }));

    await waitFor(async () => {
      const reports = await store.listVerificationReports();
      expect(reports).toHaveLength(1);
      expect(reports[0]?.clipName).toBe("sample clip.mp4");
    });
  });
});
