import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MemoryManager from "@/components/MemoryManager";
import { LocalDataStore } from "@/lib/privacy/LocalDataStore";
import { PrototypeStore } from "@/lib/recognition/PrototypeStore";
import {
  createConfusionPair,
  createCuePatchComparison,
  createCuePatchPrompt,
  createCuePatchResult,
  createEncodedSequence,
  createMinimalPairCard,
  createMotionReceipt,
  createSignFormLedger,
  createVerificationReport,
} from "./testUtils";

describe("MemoryManager", () => {
  it("exports and deletes local personal signs", async () => {
    const user = userEvent.setup();
    const store = new LocalDataStore(`signrepair-memory-${crypto.randomUUID()}`);
    const prototypes = new PrototypeStore(store);

    await prototypes.addExample("camp-hello", createEncodedSequence(), true);

    render(
      <MemoryManager dataStore={store} prototypeStoreInstance={prototypes} />,
    );

    expect(await screen.findByText("camp-hello")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /export all local signrepair data/i }),
    );

    expect(URL.createObjectURL).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /delete/i }));

    await waitFor(() => {
      expect(screen.queryByText("camp-hello")).not.toBeInTheDocument();
    });
  });

  it("edits and clears personal sign-form notes", async () => {
    const user = userEvent.setup();
    const store = new LocalDataStore(`signrepair-memory-${crypto.randomUUID()}`);
    const prototypes = new PrototypeStore(store);

    await prototypes.addExample("camp-hello", createEncodedSequence(), true, {
      signFormNotes: { handshape: "flat-ish" },
    });

    render(<MemoryManager dataStore={store} prototypeStoreInstance={prototypes} />);

    const handshapeInput = await screen.findByLabelText(/Handshape note for camp-hello/i);
    expect(handshapeInput).toHaveValue("flat-ish");

    await user.clear(handshapeInput);
    await user.type(handshapeInput, "open-ish");
    await user.click(screen.getByRole("button", { name: /Save sign-form notes for camp-hello/i }));

    await waitFor(async () => {
      const signs = await store.listPersonalSigns();
      expect(signs[0]?.metadata.signFormNotes?.handshape).toBe("open-ish");
    });

    await user.click(screen.getByRole("button", { name: /Clear sign-form notes for camp-hello/i }));

    await waitFor(async () => {
      const signs = await store.listPersonalSigns();
      expect(signs[0]?.metadata.signFormNotes?.handshape).toBeUndefined();
    });
  });

  it("lists and deletes Confusion Twin repairs", async () => {
    const user = userEvent.setup();
    const store = new LocalDataStore(`signrepair-memory-${crypto.randomUUID()}`);
    const prototypes = new PrototypeStore(store);

    await prototypes.saveConfusionPair(
      createConfusionPair({
        intendedLabel: "thank-you",
        confusedLabel: "hello",
        id: "confusion-thank-you-vs-hello",
      }),
    );

    render(<MemoryManager dataStore={store} prototypeStoreInstance={prototypes} />);

    expect(await screen.findByRole("heading", { name: /thank-you vs hello/i })).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: /Delete Confusion Twin repair thank-you versus hello/i,
      }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: /thank-you vs hello/i }),
      ).not.toBeInTheDocument();
    });
  });

  it("lists, edits, and deletes Minimal Pair Lab cards", async () => {
    const user = userEvent.setup();
    const store = new LocalDataStore(`signrepair-memory-${crypto.randomUUID()}`);
    const prototypes = new PrototypeStore(store);

    await prototypes.saveMinimalPairCard(createMinimalPairCard());

    render(<MemoryManager dataStore={store} prototypeStoreInstance={prototypes} />);

    expect(await screen.findByText(/hello vs thank-you/i)).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: /Minimal Pair Lab cards/i }),
    ).toBeInTheDocument();

    await user.type(
      screen.getByLabelText(/Local notes for minimal pair hello versus thank-you/i),
      "local contrast note",
    );
    await user.click(
      screen.getByRole("button", {
        name: /Save notes for minimal pair hello versus thank-you/i,
      }),
    );

    await waitFor(async () => {
      const cards = await store.listMinimalPairCards();
      expect(cards[0]?.userNotes).toBe("local contrast note");
    });

    await user.click(
      screen.getByRole("button", {
        name: /Delete minimal pair card hello versus thank-you/i,
      }),
    );

    await waitFor(() => {
      expect(screen.queryByText(/hello vs thank-you/i)).not.toBeInTheDocument();
    });
  });

  it("clears all local data", async () => {
    const user = userEvent.setup();
    const store = new LocalDataStore(`signrepair-memory-${crypto.randomUUID()}`);
    const prototypes = new PrototypeStore(store);

    await prototypes.addExample("camp-hello", createEncodedSequence(), true);
    await prototypes.saveConfusionPair(createConfusionPair());

    render(<MemoryManager dataStore={store} prototypeStoreInstance={prototypes} />);

    expect(await screen.findByText("camp-hello")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /clear all local signrepair data/i }));

    await waitFor(() => {
      expect(screen.queryByText("camp-hello")).not.toBeInTheDocument();
    });
    expect(screen.queryByText(/hello vs thank-you/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Go to Teach/i })).toHaveAttribute("href", "/teach");
    expect(screen.getAllByRole("link", { name: /Open Live/i })[0]).toHaveAttribute(
      "href",
      "/live",
    );
  });

  it("lists and deletes saved motion receipts", async () => {
    const user = userEvent.setup();
    const store = new LocalDataStore(`signrepair-memory-${crypto.randomUUID()}`);
    const prototypes = new PrototypeStore(store);

    await prototypes.saveReceipt(
      createMotionReceipt({
        id: "receipt-memory-test",
        candidateSummary: {
          topLabel: "hello",
          topCandidateId: "demo-hello",
          topConfidence: 0.64,
          alternatives: [],
        },
        cuePatch: {
          prompt: createCuePatchPrompt({
            kind: "mouth-visible-repeat",
            title: "Mouth cue patch",
          }),
          result: createCuePatchResult(),
          comparison: createCuePatchComparison(),
        },
        signFormLedger: createSignFormLedger({
          slots: {
            handshape: {
              name: "handshape",
              valueLabel: "open-ish",
              evidenceScore: 0.82,
              status: "observed",
              explanation: "fixture",
              landmarksUsed: ["fixture"],
              userEditable: true,
            },
            location: {
              name: "location",
              valueLabel: "face zone",
              evidenceScore: 0.74,
              status: "observed",
              explanation: "fixture",
              landmarksUsed: ["fixture"],
              userEditable: true,
            },
            movement: {
              name: "movement",
              valueLabel: "long path",
              evidenceScore: 0.7,
              status: "observed",
              explanation: "fixture",
              landmarksUsed: ["fixture"],
              userEditable: true,
            },
          },
          missingSlots: ["mouthCue"],
        }),
      }),
    );

    render(<MemoryManager dataStore={store} prototypeStoreInstance={prototypes} />);

    expect(
      await screen.findByRole("heading", { name: /Saved motion receipts/i }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "hello" })).toBeInTheDocument();
    expect(await screen.findByText(/Cue Patch: mouth-visible-repeat/i)).toBeInTheDocument();
    expect(await screen.findByText(/SignForm: open-ish \/ face zone \/ long path/i)).toBeInTheDocument();
    expect((await screen.findAllByText(/Missing slots: Mouth cue/i)).length).toBeGreaterThan(0);

    await user.click(
      screen.getByRole("button", { name: /Delete saved motion receipt receipt-memory-test/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(/No saved motion receipts. Live receipts stay temporary unless you save them locally from Live\./i),
      ).toBeInTheDocument();
    });
  });

  it("lists and deletes saved benchmark verification reports", async () => {
    const user = userEvent.setup();
    const store = new LocalDataStore(`signrepair-memory-${crypto.randomUUID()}`);
    const prototypes = new PrototypeStore(store);

    await prototypes.saveVerificationReport(createVerificationReport());

    render(<MemoryManager dataStore={store} prototypeStoreInstance={prototypes} />);

    expect(
      await screen.findByRole("heading", { name: /Benchmark evaluations/i }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /sample clip\.mp4/i })).toBeInTheDocument();
    expect(await screen.findByText(/Expected reference:/i)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Delete verification report sample clip\.mp4/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(/No benchmark evaluations saved yet/i),
      ).toBeInTheDocument();
    });
  });

  it("shows grouped memory sections and Evidence Health text badges", async () => {
    const store = new LocalDataStore(`signrepair-memory-${crypto.randomUUID()}`);
    const prototypes = new PrototypeStore(store);

    await prototypes.addExample("watch-sign", createEncodedSequence(), true, {
      signFormNotes: {},
    });

    render(<MemoryManager dataStore={store} prototypeStoreInstance={prototypes} />);

    expect(await screen.findByRole("heading", { name: /Personal signs/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /Confusion Twin repairs/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /Minimal Pair Lab cards/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /Saved motion receipts/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /Benchmark evaluations/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /Evidence Health report/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /Export \/ Clear all/i })).toBeInTheDocument();
    expect(await screen.findAllByText(/Watch/i)).not.toHaveLength(0);
    expect(await screen.findByRole("link", { name: /Open Evidence Health/i })).toBeInTheDocument();
    expect(await screen.findByText(/Stores landmark-derived examples/i)).toBeInTheDocument();
    expect(await screen.findByText(/Stores latest local evidence-quality report/i)).toBeInTheDocument();
  });
});
