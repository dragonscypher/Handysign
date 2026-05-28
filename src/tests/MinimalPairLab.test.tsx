import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MinimalPairLab from "@/components/MinimalPairLab";
import { LocalDataStore } from "@/lib/privacy/LocalDataStore";
import { PrototypeStore } from "@/lib/recognition/PrototypeStore";
import {
  ControlledExtractor,
  createBufferSnapshot,
} from "./testUtils";

describe("MinimalPairLab", () => {
  it("records examples for A and B, builds card, and saves locally", async () => {
    const user = userEvent.setup();
    const extractor = new ControlledExtractor();
    const store = new LocalDataStore(`signrepair-minimal-lab-${crypto.randomUUID()}`);
    const prototypes = new PrototypeStore(store);

    await store.setSetting("consentAccepted", true);

    render(
      <MinimalPairLab
        initialCandidateAId="demo-hello"
        initialCandidateBId="demo-thank-you"
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
      extractor.emit(createBufferSnapshot());
    });

    await user.click(screen.getByRole("button", { name: /Record example for A/i }));
    await user.click(screen.getByRole("button", { name: /Record example for A/i }));
    await user.click(screen.getByRole("button", { name: /Record example for B/i }));
    await user.click(screen.getByRole("button", { name: /Record example for B/i }));

    await user.click(
      screen.getByRole("button", {
        name: /Build contrast card from recorded minimal pair examples/i,
      }),
    );

    expect(await screen.findByRole("heading", { name: /Contrast card/i })).toBeInTheDocument();
    expect(await screen.findByText(/Strongest slot difference:/i)).toBeInTheDocument();

    await user.type(
      screen.getByLabelText(/Local notes for Minimal Pair Lab contrast card/i),
      "local note",
    );
    await user.click(
      screen.getByRole("button", { name: /Save Minimal Pair Lab contrast card locally/i }),
    );

    await waitFor(async () => {
      const cards = await store.listMinimalPairCards();
      expect(cards).toHaveLength(1);
      expect(cards[0]?.userNotes).toBe("local note");
    });
  });
});
