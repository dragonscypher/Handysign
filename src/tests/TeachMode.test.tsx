import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TeachMode from "@/components/TeachMode";
import { LocalDataStore } from "@/lib/privacy/LocalDataStore";
import { PrototypeStore } from "@/lib/recognition/PrototypeStore";
import { ControlledExtractor, createBufferSnapshot } from "./testUtils";

describe("TeachMode", () => {
  it("shows privacy copy near the save action", async () => {
    const store = new LocalDataStore(`signrepair-teach-${crypto.randomUUID()}`);
    const prototypes = new PrototypeStore(store);
    const extractor = new ControlledExtractor();

    await store.setSetting("consentAccepted", true);

    render(
      <TeachMode
        initialLabel="family-wave"
        extractorFactory={() => extractor}
        cameraStarter={async () => null}
        dataStore={store}
        prototypeStoreInstance={prototypes}
      />,
    );

    expect(
      await screen.findByText(/Saves landmark-derived data locally on this device\./i),
    ).toBeInTheDocument();
  });

  it("captures 3 examples and saves them as personal sign", async () => {
    const user = userEvent.setup();
    const store = new LocalDataStore(`signrepair-teach-${crypto.randomUUID()}`);
    const prototypes = new PrototypeStore(store);
    const extractor = new ControlledExtractor();

    await store.setSetting("consentAccepted", true);

    render(
      <TeachMode
        initialLabel="family-wave"
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

    const captureButton = await screen.findByRole("button", {
      name: /capture a landmark-derived example/i,
    });
    await user.type(
      screen.getByLabelText(/Handshape note for this personal sign/i),
      "open-ish wave",
    );

    await user.click(captureButton);
    await user.click(captureButton);
    await user.click(captureButton);
    await user.click(screen.getByRole("button", { name: /save personal sign/i }));

    await waitFor(async () => {
      const signs = await store.listPersonalSigns();
      expect(signs[0]?.label).toBe("family-wave");
      expect(signs[0]?.examples).toHaveLength(3);
      expect(signs[0]?.metadata.signFormNotes?.handshape).toBe("open-ish wave");
    });
  });
});
