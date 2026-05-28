import fs from "node:fs/promises";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("next/font/google", () => ({
  Space_Grotesk: () => ({ variable: "font-display" }),
  IBM_Plex_Mono: () => ({ variable: "font-mono" }),
}));

import RootLayout from "@/app/layout";

const UI_SOURCE_FILES = [
  "src/app/layout.tsx",
  "src/components/MinimalTopBar.tsx",
  "src/components/ConsentScreen.tsx",
  "src/components/LiveInterpreter.tsx",
  "src/components/RepairPanel.tsx",
  "src/components/MotionReceiptViewer.tsx",
  "src/components/MinimalPairLab.tsx",
  "src/components/EvidenceHealthDashboard.tsx",
  "src/components/MemoryManager.tsx",
  "src/components/VerifyUploader.tsx",
  "src/components/PredictionComparison.tsx",
  "src/components/VerificationTimeline.tsx",
  "src/components/SegmentReviewCard.tsx",
  "src/components/ReviewGuide.tsx",
  "src/components/TeachMode.tsx",
];

const ALLOWED_NEGATED_PHRASES = [
  "not certified interpretation",
  "not proof of meaning",
  "not proof",
];

describe("Product spine copy", () => {
  it("keeps primary nav in product journey order", () => {
    render(
      <RootLayout>
        <div>fixture child</div>
      </RootLayout>,
    );

    const navLabels = within(
      screen.getByRole("navigation", { name: /primary/i }),
    )
      .getAllByRole("link")
      .map((link) => link.textContent?.trim());

    expect(navLabels).toEqual([
      "Home",
      "Live",
      "Verify",
      "Teach",
      "Minimal Pair Lab",
      "Evidence Health",
      "Memory",
    ]);
  });

  it("avoids banned overclaim phrases in visible UI source copy", async () => {
    const contents = await Promise.all(
      UI_SOURCE_FILES.map((filePath) =>
        fs.readFile(path.resolve(process.cwd(), filePath), "utf8"),
      ),
    );
    let normalized = contents.join("\n").toLowerCase();
    normalized = normalized.replace(/\s+/g, " ");

    for (const phrase of ALLOWED_NEGATED_PHRASES) {
      normalized = normalized.replaceAll(phrase, "");
    }

    for (const banned of [
      /\btranslator\b/i,
      /\binterpreter\b/i,
      /\btranslate\b/i,
      /\baccurate\b/i,
      /asl recognition/i,
      /real-time interpretation/i,
      /correct sign/i,
      /\bproof\b/i,
      /\bcertified\b/i,
    ]) {
      expect(normalized).not.toMatch(banned);
    }
  });
});
