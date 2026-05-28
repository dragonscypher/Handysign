import fs from "node:fs/promises";
import path from "node:path";

const REQUIRED_DOCS = [
  "docs/RELEASE_CHECKLIST.md",
  "docs/ARCHITECTURE_OVERVIEW.md",
  "docs/PRIVACY_OVERVIEW.md",
  "docs/DEMO_FIXTURES.md",
  "docs/TESTING_GUIDE.md",
  "docs/DEMO_SCRIPT.md",
];

describe("release readiness docs", () => {
  it("ships required docs and README links", async () => {
    await Promise.all(
      REQUIRED_DOCS.map(async (filePath) => {
        await expect(
          fs.access(path.resolve(process.cwd(), filePath)),
        ).resolves.toBeUndefined();
      }),
    );

    const readme = await fs.readFile(
      path.resolve(process.cwd(), "README.md"),
      "utf8",
    );

    expect(readme).toContain("## Known limitations");
    expect(readme).toContain("privacy-first sign evidence and repair prototype");
    expect(readme).toContain("docs/DEMO_FIXTURES.md");
    expect(readme).toContain("docs/TESTING_GUIDE.md");
    expect(readme).toContain("docs/PRIVACY_OVERVIEW.md");
    expect(readme).toContain("docs/ARCHITECTURE_OVERVIEW.md");
    expect(readme).toContain("docs/RELEASE_CHECKLIST.md");
  });

  it("ships review route file", async () => {
    await expect(
      fs.access(path.resolve(process.cwd(), "src/app/review/page.tsx")),
    ).resolves.toBeUndefined();
  });
});
