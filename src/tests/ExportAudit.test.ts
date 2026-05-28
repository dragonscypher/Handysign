import { validateExportPayload } from "../../scripts/exportAudit.mjs";

describe("export audit utility", () => {
  it("accepts landmark-only export sample", () => {
    expect(() =>
      validateExportPayload({
        exportedAt: "2026-04-22T00:00:00.000Z",
        personalSigns: [
          {
            id: "personal-hello",
            examples: [
              {
                handPoseVector: [0.1, 0.2],
              },
            ],
          },
        ],
        savedReceipts: [
          {
            replayFrames: [
              {
                hands: [[[0.1, 0.2, 0]]],
              },
            ],
          },
        ],
      }),
    ).not.toThrow();
  });

  it("rejects forbidden raw-video-like fields in export sample", () => {
    expect(() =>
      validateExportPayload({
        savedReceipts: [
          {
            cuePatch: {
              canvasData: "forbidden",
            },
          },
        ],
      }),
    ).toThrow(/Forbidden export field/i);

    expect(() =>
      validateExportPayload({
        evidenceHealthReport: {
          preview: {
            base64: "forbidden",
          },
        },
      }),
    ).toThrow(/Forbidden export field/i);
  });
});
