import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConsentScreen from "@/components/ConsentScreen";
import { LocalDataStore } from "@/lib/privacy/LocalDataStore";
import { routerPushMock } from "./testUtils";

describe("ConsentScreen", () => {
  it("shows product identity, safety copy, and requires acknowledgement before routing to live view", async () => {
    const user = userEvent.setup();
    const store = new LocalDataStore(`signrepair-consent-${crypto.randomUUID()}`);

    render(<ConsentScreen dataStore={store} />);

    expect(await screen.findByRole("heading", { name: "SignRepair" })).toBeInTheDocument();
    expect(
      await screen.findByText(/Privacy-first sign evidence and repair prototype\./i),
    ).toBeInTheDocument();
    expect(await screen.findByText(/Low-stakes use only\./i)).toBeInTheDocument();
    expect((await screen.findAllByText(/not certified interpretation/i)).length).toBeGreaterThan(0);
    expect(await screen.findByRole("link", { name: /Open Evidence Health/i })).toHaveAttribute(
      "href",
      "/evidence-health",
    );
    expect(
      await screen.findByRole("link", {
        name: /Open Upload and Verify benchmark screen/i,
      }),
    ).toHaveAttribute(
      "href",
      "/verify",
    );

    const startButton = await screen.findByRole("button", {
      name: /start live demo/i,
    });
    const checkbox = await screen.findByRole("checkbox");

    expect(startButton).toBeDisabled();

    await waitFor(() => {
      expect(checkbox).not.toBeDisabled();
    });
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    await waitFor(() => {
      expect(startButton).not.toBeDisabled();
    });
    await user.click(startButton);

    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith("/live");
    });

    await expect(store.getSetting("consentAccepted", false)).resolves.toBe(true);
  });
});
