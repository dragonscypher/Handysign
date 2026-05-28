import { render, screen } from "@testing-library/react";
import ReviewGuide from "@/components/ReviewGuide";

describe("ReviewGuide", () => {
  it("renders honest reviewer handoff copy and route links", async () => {
    render(<ReviewGuide />);

    expect(await screen.findByRole("heading", { name: /Reviewer guide for SignRepair/i })).toBeInTheDocument();
    expect(await screen.findByText(/Privacy-first sign evidence and repair prototype/i)).toBeInTheDocument();
    expect(await screen.findByText(/Not certified interpretation\./i)).toBeInTheDocument();
    expect(await screen.findByText(/No raw video, no pixels, no base64 image payloads\./i)).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(await screen.findByRole("link", { name: "Live" })).toHaveAttribute("href", "/live");
    expect(await screen.findByRole("link", { name: "Verify" })).toHaveAttribute("href", "/verify");
    expect(await screen.findByRole("link", { name: "Teach" })).toHaveAttribute("href", "/teach");
    expect(await screen.findByRole("link", { name: "Minimal Pair Lab" })).toHaveAttribute(
      "href",
      "/minimal-pair",
    );
    expect(await screen.findByRole("link", { name: "Evidence Health" })).toHaveAttribute(
      "href",
      "/evidence-health",
    );
    const memoryLinks = await screen.findAllByRole("link", { name: "Memory" });
    expect(memoryLinks[0]).toHaveAttribute("href", "/memory");
  });
});
