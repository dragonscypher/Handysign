import { render, screen } from "@testing-library/react";
import EvidenceHealthDashboard from "@/components/EvidenceHealthDashboard";
import { LocalDataStore } from "@/lib/privacy/LocalDataStore";
import { PrototypeStore } from "@/lib/recognition/PrototypeStore";
import {
  createEncodedSequence,
  createMotionReceipt,
  createSignFormLedger,
} from "./testUtils";

describe("EvidenceHealthDashboard", () => {
  it("renders overall status and recommended actions", async () => {
    const store = new LocalDataStore(`signrepair-health-${crypto.randomUUID()}`);
    const prototypes = new PrototypeStore(store);

    await prototypes.addExample("watch-sign", createEncodedSequence(), true, {
      signFormNotes: {},
    });

    render(
      <EvidenceHealthDashboard
        dataStore={store}
        prototypeStoreInstance={prototypes}
      />,
    );

    expect(
      await screen.findByText(/Review local memory quality, drift, and repeated confusion/i),
    ).toBeInTheDocument();
    expect(await screen.findByText(/Status: Watch/i)).toBeInTheDocument();
    expect(await screen.findByText(/Health is not accuracy\. It only describes local evidence quality\./i)).toBeInTheDocument();
    expect(await screen.findByText(/Record more examples/i)).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /watch-sign/i })).toBeInTheDocument();
  });

  it("renders drift warnings and coverage gaps", async () => {
    const store = new LocalDataStore(`signrepair-health-${crypto.randomUUID()}`);
    const prototypes = new PrototypeStore(store);

    await prototypes.addExample("stale-sign", createEncodedSequence(), true);
    await prototypes.addExample("stale-sign", createEncodedSequence(), true);
    await prototypes.addExample("stale-sign", createEncodedSequence(), true);
    const staleSign = await store.findPersonalSignByLabel("stale-sign");

    await store.upsertPersonalSign({
      ...staleSign!,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    await prototypes.saveReceipt(
      createMotionReceipt({
        candidateSummary: {
          topLabel: "stale-sign",
          topCandidateId: "personal-stale-sign",
          topConfidence: 0.58,
          alternatives: [],
        },
        signFormLedger: createSignFormLedger({
          candidateLabel: "stale-sign",
          candidateId: "personal-stale-sign",
          missingSlots: ["mouthCue"],
        }),
      }),
    );

    render(
      <EvidenceHealthDashboard
        dataStore={store}
        prototypeStoreInstance={prototypes}
      />,
    );

    expect(await screen.findByText(/stale-sign may have drifted/i)).toBeInTheDocument();
    expect(await screen.findByText(/Saved receipt is missing mouth-cue evidence/i)).toBeInTheDocument();
    expect((await screen.findAllByRole("heading", { name: /stale-sign/i })).length).toBeGreaterThan(0);
  });

  it("shows empty-state next actions when no local evidence exists", async () => {
    const store = new LocalDataStore(`signrepair-health-${crypto.randomUUID()}`);
    const prototypes = new PrototypeStore(store);

    render(
      <EvidenceHealthDashboard
        dataStore={store}
        prototypeStoreInstance={prototypes}
      />,
    );

    expect(await screen.findByText(/No local actions yet\./i)).toBeInTheDocument();
    const teachLinks = await screen.findAllByRole("link", { name: /Go to Teach/i });
    expect(teachLinks[0]).toHaveAttribute("href", "/teach");
    expect(await screen.findByText(/No local memory health summaries yet\./i)).toBeInTheDocument();
    const liveLinks = await screen.findAllByRole("link", { name: /Open Live/i });
    expect(liveLinks[0]).toHaveAttribute("href", "/live");
  });
});
