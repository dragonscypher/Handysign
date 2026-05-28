import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LiveInterpreter from "@/components/LiveInterpreter";
import { CameraStartError } from "@/lib/landmarks/camera";
import type { LandmarkExtractor } from "@/lib/landmarks/types";
import { LocalDataStore } from "@/lib/privacy/LocalDataStore";
import { PrototypeStore } from "@/lib/recognition/PrototypeStore";
import {
  ControlledExtractor,
  createBufferSnapshot,
  createConfusionPair,
  createEncodedSequence,
  createMinimalPairCard,
} from "./testUtils";

describe("LiveInterpreter", () => {
  it("updates Translation Debt and uncertain copy from mocked extractor snapshots", async () => {
    const store = new LocalDataStore(`signrepair-live-${crypto.randomUUID()}`);
    const prototypes = new PrototypeStore(store);
    const extractor = new ControlledExtractor();

    await store.setSetting("consentAccepted", true);

    render(
      <LiveInterpreter
        extractorFactory={() => extractor}
        cameraStarter={async () => null}
        dataStore={store}
        prototypeStoreInstance={prototypes}
      />,
    );

    await waitFor(() => {
      expect(extractor.listenerCount()).toBeGreaterThan(0);
    });

    act(() => {
      extractor.emit(createBufferSnapshot({ frameCount: 12, motion: "static" }));
    });

    expect((await screen.findAllByText(/Debt: motion too short/i)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/I'm not sure/i)).length).toBeGreaterThan(0);
    expect(await screen.findByRole("button", { name: /View why I am unsure/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /Cue Patch Mode/i })).toBeInTheDocument();
    expect(await screen.findByText(/Missing sign-form evidence/i)).toBeInTheDocument();
    expect((await screen.findAllByRole("button", { name: /Try cue patch/i })).length).toBeGreaterThan(0);

    act(() => {
      extractor.emit(
        createBufferSnapshot({
          frameCount: 32,
          motion: "dynamic",
          occludedTailCount: 8,
        }),
      );
    });

    expect((await screen.findAllByText(/Debt: hand occlusion/i)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/Hand occlusion patch/i)).length).toBeGreaterThan(0);
  });

  it("shows explicit demo badge when landmark extractor falls back to mock mode", async () => {
    const store = new LocalDataStore(`signrepair-live-${crypto.randomUUID()}`);
    const prototypes = new PrototypeStore(store);

    await store.setSetting("consentAccepted", true);

    class FailingExtractor implements LandmarkExtractor {
      async start() {
        throw new Error("MediaPipe failed");
      }

      stop() {}

      subscribe() {
        return () => undefined;
      }

      getKind() {
        return "holistic" as const;
      }
    }

    render(
      <LiveInterpreter
        extractorFactory={() => new FailingExtractor()}
        cameraStarter={async () => null}
        dataStore={store}
        prototypeStoreInstance={prototypes}
      />,
    );

    expect((await screen.findAllByText(/Demo Mode: mock landmarks/i)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/MediaPipe could not load/i)).length).toBeGreaterThan(0);
  });

  it("shows a user-facing camera permission error", async () => {
    const store = new LocalDataStore(`signrepair-live-${crypto.randomUUID()}`);
    const prototypes = new PrototypeStore(store);

    await store.setSetting("consentAccepted", true);

    render(
      <LiveInterpreter
        cameraStarter={async () => {
          throw new CameraStartError(
            "permission-denied",
            "Camera permission was denied. Allow camera access in this browser, then retry.",
          );
        }}
        dataStore={store}
        prototypeStoreInstance={prototypes}
      />,
    );

    expect((await screen.findAllByText(/Camera permission was denied/i)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/Camera unavailable/i)).length).toBeGreaterThan(0);
  });

  it("uses save checkbox to control Confusion Twin persistence", async () => {
    const user = userEvent.setup();
    const firstStore = new LocalDataStore(`signrepair-live-${crypto.randomUUID()}`);
    const firstPrototypes = new PrototypeStore(firstStore);
    const firstExtractor = new ControlledExtractor();

    await firstStore.setSetting("consentAccepted", true);

    const firstRender = render(
      <LiveInterpreter
        extractorFactory={() => firstExtractor}
        cameraStarter={async () => null}
        dataStore={firstStore}
        prototypeStoreInstance={firstPrototypes}
      />,
    );

    await waitFor(() => {
      expect(firstExtractor.listenerCount()).toBeGreaterThan(0);
    });

    act(() => {
      firstExtractor.emit(createBufferSnapshot({ frameCount: 32, motion: "dynamic" }));
    });

    expect(await screen.findByText("Confusion Twin")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /View why I am unsure/i })).toBeInTheDocument();

    await user.click(screen.getByLabelText(/Confirm hello as intended candidate/i));
    expect(await screen.findByRole("button", { name: /View motion replay receipt/i })).toBeInTheDocument();

    await waitFor(async () => {
      const exported = await firstStore.export();
      expect(exported.confusionPairs).toHaveLength(0);
    });

    firstRender.unmount();

    const secondStore = new LocalDataStore(`signrepair-live-${crypto.randomUUID()}`);
    const secondPrototypes = new PrototypeStore(secondStore);
    const secondExtractor = new ControlledExtractor();

    await secondStore.setSetting("consentAccepted", true);

    render(
      <LiveInterpreter
        extractorFactory={() => secondExtractor}
        cameraStarter={async () => null}
        dataStore={secondStore}
        prototypeStoreInstance={secondPrototypes}
      />,
    );

    await waitFor(() => {
      expect(secondExtractor.listenerCount()).toBeGreaterThan(0);
    });

    act(() => {
      secondExtractor.emit(createBufferSnapshot({ frameCount: 32, motion: "dynamic" }));
    });

    await user.click(screen.getByRole("button", { name: /View why I am unsure/i }));
    expect(
      await screen.findByRole("region", { name: /Motion Replay Receipt/i }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Save motion receipt locally/i }));

    await user.click(screen.getByLabelText(/Save this contrastive repair locally/i));
    await user.click(screen.getByLabelText(/Confirm hello as intended candidate/i));

    await waitFor(async () => {
      const exported = await secondStore.export();
      expect(exported.confusionPairs.length).toBeGreaterThan(0);
      expect(exported.savedReceipts.length).toBeGreaterThan(0);
    });
  });

  it("captures cue patch result without bypassing repair thresholds", async () => {
    const user = userEvent.setup();
    const store = new LocalDataStore(`signrepair-live-${crypto.randomUUID()}`);
    const prototypes = new PrototypeStore(store);
    const extractor = new ControlledExtractor();

    await store.setSetting("consentAccepted", true);

    render(
      <LiveInterpreter
        extractorFactory={() => extractor}
        cameraStarter={async () => null}
        dataStore={store}
        prototypeStoreInstance={prototypes}
        e2eScenario="confusion-twin"
      />,
    );

    await waitFor(() => {
      expect(extractor.listenerCount()).toBeGreaterThan(0);
    });

    act(() => {
      extractor.emit(createBufferSnapshot({ frameCount: 32, motion: "static" }));
    });

    await user.click(screen.getAllByRole("button", { name: /Try cue patch/i })[0]!);
    expect(await screen.findByText(/Cue patch capture active/i)).toBeInTheDocument();

    act(() => {
      extractor.emit(createBufferSnapshot({ frameCount: 32, motion: "dynamic" }));
    });

    expect(await screen.findByRole("region", { name: /Motion Replay Receipt/i })).toBeInTheDocument();
    expect(await screen.findByText(/Cue Patch review/i)).toBeInTheDocument();
    expect(
      await screen.findByText(/I'm not sure yet\. Use Repair Mode, cue patches, or top alternatives/i),
    ).toBeInTheDocument();
  });

  it("shows Minimal Pair Lab compare CTA after repeated confusion and uses saved card hint", async () => {
    const store = new LocalDataStore(`signrepair-live-${crypto.randomUUID()}`);
    const prototypes = new PrototypeStore(store);

    await store.setSetting("consentAccepted", true);
    await prototypes.saveConfusionPair(
      createConfusionPair({
        count: 3,
      }),
    );
    await prototypes.saveMinimalPairCard(createMinimalPairCard());

    render(
      <LiveInterpreter
        cameraStarter={async () => null}
        dataStore={store}
        prototypeStoreInstance={prototypes}
        e2eScenario="confusion-twin"
      />,
    );

    expect(await screen.findByText(/These two candidates keep colliding\. Compare this pair before trusting the local distinction\./i)).toBeInTheDocument();
    expect(await screen.findByText(/This pair keeps colliding\. Evidence Health recommends review\./i)).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /Open Evidence Health/i })).toHaveAttribute(
      "href",
      "/evidence-health",
    );
    expect(
      await screen.findByRole("link", { name: /Compare this pair in Minimal Pair Lab/i }),
    ).toHaveAttribute(
      "href",
      expect.stringMatching(
        /\/minimal-pair\?candidateAId=demo-(hello|thank-you)&candidateBId=demo-(hello|thank-you)/,
      ),
    );
    expect(
      (await screen.findAllByText(/Local minimal-pair card says this pair is usually separated by/i))
        .length,
    ).toBeGreaterThan(0);
  });

  it("shows stale personal-sign refresh prompt from Evidence Health", async () => {
    const store = new LocalDataStore(`signrepair-live-${crypto.randomUUID()}`);
    const prototypes = new PrototypeStore(store);
    const extractor = new ControlledExtractor();

    await store.setSetting("consentAccepted", true);
    await prototypes.addExample("hello", createEncodedSequence(), true);
    await prototypes.addExample("hello", createEncodedSequence(), true);
    await prototypes.addExample("hello", createEncodedSequence(), true);
    const staleSign = await store.findPersonalSignByLabel("hello");

    await store.upsertPersonalSign({
      ...staleSign!,
      updatedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    render(
      <LiveInterpreter
        extractorFactory={() => extractor}
        cameraStarter={async () => null}
        dataStore={store}
        prototypeStoreInstance={prototypes}
      />,
    );

    await waitFor(() => {
      expect(extractor.listenerCount()).toBeGreaterThan(0);
    });

    act(() => {
      extractor.emit(createBufferSnapshot({ frameCount: 32, motion: "dynamic" }));
    });

    expect(await screen.findByText(/This local sign memory may need fresh examples\./i)).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /Refresh in Teach Mode/i })).toHaveAttribute(
      "href",
      expect.stringContaining("/teach?label=hello"),
    );
  });
});
