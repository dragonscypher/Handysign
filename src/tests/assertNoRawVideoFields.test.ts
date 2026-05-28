import { assertNoRawVideoFields } from "@/lib/privacy/assertNoRawVideoFields";

describe("assertNoRawVideoFields", () => {
  it("throws on forbidden raw video keys", () => {
    expect(() =>
      assertNoRawVideoFields({
        nested: {
          rawVideo: "forbidden",
        },
      }),
    ).toThrow(/Forbidden raw video field/i);
  });

  it("allows landmark-only objects", () => {
    expect(() =>
      assertNoRawVideoFields({
        replayFrames: [
          {
            hands: [[[0.1, 0.2, 0]]],
          },
        ],
      }),
    ).not.toThrow();
  });

  it("throws on forbidden cue patch metadata keys", () => {
    expect(() =>
      assertNoRawVideoFields({
        cuePatch: {
          prompt: {
            imageData: "forbidden",
          },
        },
      }),
    ).toThrow(/Forbidden raw video field/i);
  });

  it("throws on forbidden sign-form payload keys", () => {
    expect(() =>
      assertNoRawVideoFields({
        signFormLedger: {
          slots: {
            handshape: {
              png: "forbidden",
            },
          },
        },
      }),
    ).toThrow(/Forbidden raw video field/i);
  });

  it("throws on forbidden minimal-pair payload keys", () => {
    expect(() =>
      assertNoRawVideoFields({
        minimalPairCards: [
          {
            examplesA: [
              {
                framePixels: "forbidden",
              },
            ],
          },
        ],
      }),
    ).toThrow(/Forbidden raw video field/i);
  });

  it("throws on forbidden evidence-health payload keys", () => {
    expect(() =>
      assertNoRawVideoFields({
        evidenceHealthReport: {
          driftWarnings: [
            {
              recentEvidence: {
                dataUrl: "forbidden",
              },
            },
          ],
        },
      }),
    ).toThrow(/Forbidden raw video field/i);
  });
});
