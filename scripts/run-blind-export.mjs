/**
 * Real-browser blind inference harness for sample 2.mp4.
 *
 * Drives the actual /verify flow in a real Chromium instance so MediaPipe
 * (WASM + WebGL) processes the clip end-to-end. Captures the downloaded
 * blind-inference JSON and writes it to disk.
 *
 * Usage:
 *   node scripts/run-blind-export.mjs <clipPath> <outputJsonPath>
 *
 * Assumes a dev server is already running at BASE_URL (default
 * http://127.0.0.1:3000). Run `pnpm dev` in another terminal first.
 *
 * Headless mode is OK for headless Chromium because WebGL works via
 * SwiftShader and MediaPipe tasks-vision tolerates SwiftShader.
 */
import { chromium } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.BLIND_EXPORT_BASE_URL ?? "http://localhost:3000";
const TIMEOUT_MS = Number(process.env.BLIND_EXPORT_TIMEOUT_MS ?? 240_000);

async function main() {
    const clipPathArg = process.argv[2];
    const outPathArg = process.argv[3];

    if (!clipPathArg || !outPathArg) {
        console.error(
            "Usage: node scripts/run-blind-export.mjs <clipPath> <outputJsonPath>",
        );
        process.exit(2);
    }

    const clipPath = resolve(clipPathArg);
    const outPath = resolve(outPathArg);

    console.log(`[harness] clip:   ${clipPath}`);
    console.log(`[harness] output: ${outPath}`);
    console.log(`[harness] base URL: ${BASE_URL}`);

    // Sanity-check the clip is readable before launching the browser.
    await readFile(clipPath);

    const browser = await chromium.launch({ headless: true });
    let result = { ok: false };

    try {
        const context = await browser.newContext({
            acceptDownloads: true,
            permissions: [],
            viewport: { width: 1280, height: 900 },
        });
        const page = await context.newPage();

        page.on("console", (msg) => {
            const type = msg.type();
            if (type === "error" || type === "warning") {
                console.log(`[browser:${type}] ${msg.text()}`);
            }
        });
        page.on("pageerror", (error) => {
            console.log(`[browser:pageerror] ${error.message}`);
        });

        await page.goto(`${BASE_URL}/verify`, { waitUntil: "domcontentloaded" });
        // First Turbopack compile of /verify can take a while; wait for the
        // upload heading to confirm React hydrated.
        await page
            .getByRole("heading", { name: /Upload clip and verify/i })
            .waitFor({ timeout: 90_000 });

        // /verify mounts VerifyUploader directly — no consent gate.
        const fileInput = page.locator("#verify-file");
        await fileInput.waitFor({ state: "attached", timeout: 30_000 });
        await fileInput.setInputFiles(clipPath);

        // Confirm the file landed in the DOM input AND React state updated.
        const fileCount = await fileInput.evaluate(
            (el) => /** @type {HTMLInputElement} */(el).files?.length ?? 0,
        );
        console.log(`[harness] input.files.length = ${fileCount}`);

        // Some React 19 + Turbopack combos miss the synthetic onChange when
        // Playwright sets files programmatically. Force-dispatch both events.
        await fileInput.evaluate((el) => {
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
        });

        await page.waitForTimeout(500);

        // Diagnostic: dump button state.
        const btnState = await page.evaluate(() => {
            const buttons = Array.from(
                document.querySelectorAll("button"),
            ).map((b) => ({
                aria: b.getAttribute("aria-label"),
                text: b.textContent?.trim().slice(0, 60),
                disabled: b.disabled,
            }));
            return buttons;
        });
        console.log(`[harness] buttons:`, JSON.stringify(btnState));

        const processBtn = page.getByRole("button", {
            name: /Process uploaded clip for verification/i,
        });
        await processBtn.waitFor({ state: "visible", timeout: 15_000 });
        // Wait until React enables the button (selectedFile state set).
        await page.waitForFunction(
            () => {
                const btn = document.querySelector(
                    'button[aria-label="Process uploaded clip for verification"]',
                );
                return btn && !(/** @type {HTMLButtonElement} */ (btn).disabled);
            },
            null,
            { timeout: 15_000 },
        );
        await processBtn.click();

        // Wait for the export button to become available (signals completion).
        const exportBtn = page.getByRole("button", {
            name: /Export blind inference report as JSON/i,
        });
        await exportBtn.waitFor({ state: "visible", timeout: TIMEOUT_MS });

        // Trigger the download and capture it.
        const [download] = await Promise.all([
            page.waitForEvent("download", { timeout: 30_000 }),
            exportBtn.click(),
        ]);

        await mkdir(dirname(outPath), { recursive: true });
        await download.saveAs(outPath);

        // Sanity-check the saved file and read top-level numbers.
        const raw = await readFile(outPath, "utf8");
        const parsed = JSON.parse(raw);
        const segCount = parsed?.segments?.length ?? -1;
        const topChain = parsed?.summary?.topEventChain ?? "(none)";
        const avgMargin = parsed?.summary?.metrics?.averageConfidenceMargin ?? null;
        console.log(`[harness] saved blind export with ${segCount} segments`);
        console.log(`[harness] top chain: ${topChain}`);
        console.log(`[harness] avg margin: ${avgMargin}`);

        result = { ok: true, segCount, topChain, avgMargin };
    } finally {
        await browser.close();
    }

    if (!result.ok) {
        process.exit(1);
    }
}

main().catch((error) => {
    console.error("[harness] FAILED:", error);
    process.exit(1);
});
