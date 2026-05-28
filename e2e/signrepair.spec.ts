import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import {
    callE2EHarness,
    installMockMedia,
    readStoppedTrackCount,
} from "./support/mockBrowser";

const CONSENT_FORCE_MOCK_QUERY = "/?forceMockLandmarks=1";
const CONSENT_CONFUSION_QUERY = "/?e2eScenario=confusion-twin";
const LIVE_CONFUSION_QUERY = "/live?e2eScenario=confusion-twin";
const LIVE_CUE_PATCH_MOUTH_QUERY = "/live?e2eScenario=cue-patch-mouth";
const LIVE_CUE_PATCH_HAND_QUERY = "/live?e2eScenario=cue-patch-hand";
const EVIDENCE_HEALTH_QUERY = "/evidence-health";
const TRANSLATE_QUERY = "/translate";
const VERIFY_QUERY = "/verify?forceMockLandmarks=1&forceMockVerification=1";

async function acknowledgeConsent(page: Page) {
    await page
        .getByLabel(/Acknowledge SignRepair prototype limits and local-only video handling/i)
        .check();
    await page.getByRole("button", { name: /Start live demo/i }).click();
}

test("consent flow starts live screen and route change stops mock camera tracks", async ({
    page,
}) => {
    await installMockMedia(page, "success");
    await page.goto(CONSENT_FORCE_MOCK_QUERY);

    await acknowledgeConsent(page);

    await expect(page).toHaveURL(/\/live\?forceMockLandmarks=1$/);
    await expect(page.getByText(/Demo Mode: mock landmarks/i).first()).toBeVisible();

    await page.getByRole("link", { name: "Memory" }).click();
    await expect(page).toHaveURL(/\/memory$/);
    await expect.poll(() => readStoppedTrackCount(page)).toBeGreaterThanOrEqual(1);
});

test("camera denied shows a user-facing permission message", async ({ page }) => {
    await installMockMedia(page, "denied");
    await page.goto(CONSENT_FORCE_MOCK_QUERY);

    await acknowledgeConsent(page);

    await expect(page.getByText(/Camera permission was denied/i).first()).toBeVisible();
    await expect(page.getByText(/Camera unavailable/i)).toBeVisible();
});

test("unsupported browser APIs show a user-facing unsupported message", async ({ page }) => {
    await installMockMedia(page, "unsupported");
    await page.goto(CONSENT_FORCE_MOCK_QUERY);

    await acknowledgeConsent(page);

    await expect(
        page
            .getByText(/This browser lacks required camera APIs for live on-device landmark capture/i)
            .first(),
    ).toBeVisible();
    await expect(page.getByText(/Camera unavailable/i)).toBeVisible();
});

test("forced MediaPipe failure shows explicit demo-mode badge", async ({ page }) => {
    await installMockMedia(page, "success");
    await page.goto("/");
    await callE2EHarness(page, "clearAll");
    await callE2EHarness(page, "seedConsent");

    await page.goto("/live?forceMockLandmarks=1");

    await expect(page.getByText(/Demo Mode: mock landmarks/i).first()).toBeVisible();
    await expect(page.getByText(/MediaPipe could not load/i).first()).toBeVisible();
});

test("Translate loads sample-3 blind export and shows semantic-breadth uncertainty", async ({
    page,
}) => {
    await page.goto(TRANSLATE_QUERY);

    await page
        .getByTestId("translate-export-input")
        .setInputFiles(path.resolve("docs/artifacts/sample3-blind-2026-05-21.json"));
    await expect(page.getByText(/Loaded sample 3\.mp4 \(10 segments\)/i)).toBeVisible();

    await page.getByTestId("translate-run").click();

    await expect(page.getByTestId("translate-result")).toBeVisible();
    await expect(page.getByTestId("translate-confidence")).toContainText("58%");
    await expect(page.getByText(/source/i).filter({ hasText: "pretrained" })).toBeVisible();
    await expect(page.getByTestId("translate-transcript")).toContainText(
        "FALL EXPLAIN HOLD PERSON FALL LEARN ASK EXPLAIN EXPLAIN TELL",
    );
    await expect(page.getByTestId("translate-low-confidence")).toContainText(
        /blind-family margins/i,
    );
    await expect(page.getByText(/Alternatives/i)).toBeVisible();

    await page.getByTestId("translate-mode-train").click();
    await expect(page.getByTestId("translate-train-panel")).toBeVisible();
});

test("Confusion Twin save flow persists local repair and memory delete removes it", async ({
    page,
}) => {
    await installMockMedia(page, "success");
    await page.goto(CONSENT_CONFUSION_QUERY);
    await callE2EHarness(page, "clearAll");
    await callE2EHarness(page, "seedConsent");
    await page.goto(LIVE_CONFUSION_QUERY);

    await expect(page.getByRole("heading", { name: "Confusion Twin" })).toBeVisible();
    await expect(
        page.getByText(/I'm not sure which known candidate this is/i),
    ).toBeVisible();
    await expect(page.getByLabel(/Save this contrastive repair locally/i)).toBeVisible();

    await page.getByLabel(/Save this contrastive repair locally/i).check();
    await page.getByLabel(/Confirm hello as intended candidate/i).click();

    await expect(page.getByText(/Saved local repair: hello vs thank-you/i)).toBeVisible();

    await page.getByRole("link", { name: "Memory" }).click();
    await expect(page.getByRole("heading", { name: /hello vs thank-you/i })).toBeVisible();

    await page
        .getByLabel(/Delete Confusion Twin repair hello versus thank-you/i)
        .click();

    await expect(page.getByRole("heading", { name: /hello vs thank-you/i })).toHaveCount(0);
});

test("Confusion Twin save-off flow stays session-only", async ({ page }) => {
    await installMockMedia(page, "success");
    await page.goto(CONSENT_CONFUSION_QUERY);
    await callE2EHarness(page, "clearAll");
    await callE2EHarness(page, "seedConsent");
    await page.goto(LIVE_CONFUSION_QUERY);

    await expect(page.getByRole("heading", { name: "Confusion Twin" })).toBeVisible();
    await page.getByLabel(/Confirm hello as intended candidate/i).click();

    await expect(page.getByText(/Using once: hello vs thank-you/i)).toBeVisible();

    await page.getByRole("link", { name: "Memory" }).click();
    await expect(page.getByText(/No Confusion Twin repairs saved yet/i)).toBeVisible();
});

test("export includes personal signs and confusion pairs, excludes raw video fields, and clear all empties memory", async ({
    page,
}) => {
    await installMockMedia(page, "success");
    page.on("dialog", (dialog) => dialog.accept());
    await page.goto("/");
    await callE2EHarness(page, "clearAll");
    await callE2EHarness(page, "seedConsent");
    await callE2EHarness(page, "seedPersonalSign", "family-hello");
    await callE2EHarness(page, "seedConfusionPair");
    await callE2EHarness(page, "seedReceipt");

    await page.goto("/memory");
    await page.getByLabel(/Handshape note for family-hello/i).fill("local wave");
    await page.getByRole("button", { name: /Save sign-form notes for family-hello/i }).click();

    const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: /Export all local SignRepair data/i }).click(),
    ]);
    const filePath = await download.path();

    expect(filePath).not.toBeNull();

    const exported = JSON.parse(await fs.readFile(filePath!, "utf8")) as {
        personalSigns: unknown[];
        confusionPairs: unknown[];
        savedReceipts: unknown[];
    };

    expect(exported.personalSigns.length).toBeGreaterThan(0);
    expect(exported.confusionPairs.length).toBeGreaterThan(0);
    expect(exported.savedReceipts.length).toBeGreaterThan(0);
    expect(
        (exported.personalSigns[0] as { metadata?: { signFormNotes?: { handshape?: string } } })
            ?.metadata?.signFormNotes?.handshape,
    ).toBe("local wave");

    const serialized = JSON.stringify(exported);

    for (const forbiddenField of [
        "rawVideo",
        "videoBlob",
        "framePixels",
        "imageData",
        "dataUrl",
    ]) {
        expect(serialized).not.toContain(`"${forbiddenField}"`);
    }

    await page
        .getByRole("button", { name: /Clear all local SignRepair data from this browser/i })
        .click();

    await expect(page.getByText(/No saved personal signs yet/i)).toBeVisible();
    await expect(page.getByText(/No Confusion Twin repairs saved yet/i)).toBeVisible();
    await expect(page.getByText(/No saved motion receipts/i)).toBeVisible();
});

test("accessibility smoke covers nav keyboarding, labeled controls, live region, and Confusion Twin actions", async ({
    page,
}) => {
    await installMockMedia(page, "success");
    await page.goto(CONSENT_CONFUSION_QUERY);
    const primaryNav = page.locator('nav[aria-label="Primary"]');

    const expectedFocusOrder = [
        "SignRepair",
        "Home",
        "Live",
        "Verify",
        "Teach",
        "Minimal Pair Lab",
        "Evidence Health",
        "Memory",
    ];

    for (const name of expectedFocusOrder) {
        await page.keyboard.press("Tab");
        await expect(
            name === "SignRepair"
                ? page.getByRole("link", { name, exact: true })
                : primaryNav.getByRole("link", { name, exact: true }),
        ).toBeFocused();
    }

    await expect(
        page.getByRole("button", { name: /Start live demo after acknowledging prototype limits/i }),
    ).toBeVisible();

    await acknowledgeConsent(page);
    await expect(page).toHaveURL(/\/live\?e2eScenario=confusion-twin$/);
    await expect(
        page.getByRole("checkbox", { name: /Toggle landmark overlay on live camera preview/i }),
    ).toBeVisible();
    await expect(page.locator('.prediction-card[aria-live="polite"][aria-atomic="true"]')).toHaveCount(
        1,
    );
    await expect(page.getByLabel(/Confirm hello as intended candidate/i)).toBeVisible();
    await expect(
        page.getByLabel(/Use hello once without saving contrastive repair/i),
    ).toBeVisible();
});

test("product spine demo smoke runs from Home to Memory with mocked uncertainty", async ({
    page,
}) => {
    await installMockMedia(page, "success");
    page.on("dialog", (dialog) => dialog.accept());
    await page.goto(CONSENT_CONFUSION_QUERY);
    await callE2EHarness(page, "clearAll");

    await expect(page.getByRole("heading", { name: "SignRepair" })).toBeVisible();
    await expect(
        page.getByRole("main").getByText(/Privacy-first sign evidence and repair prototype\./i),
    ).toBeVisible();

    await acknowledgeConsent(page);

    await expect(page).toHaveURL(/\/live\?e2eScenario=confusion-twin$/);
    await expect(page.getByRole("heading", { name: /Cue Patch Mode/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /View why I am unsure/i })).toBeVisible();

    await page.getByRole("button", { name: /View why I am unsure/i }).click();
    await expect(page.getByRole("region", { name: /Motion Replay Receipt/i })).toBeVisible();
    await page.getByRole("button", { name: /Save motion receipt locally/i }).click();

    await page.getByRole("link", { name: "Evidence Health" }).click();
    await expect(page).toHaveURL(/\/evidence-health$/);
    await expect(page.getByText(/Health is not accuracy\. It only describes local evidence quality\./i)).toBeVisible();

    await page.locator('nav[aria-label="Primary"]').getByRole("link", { name: "Memory", exact: true }).click();
    await expect(page).toHaveURL(/\/memory$/);
    await expect(page.getByRole("heading", { name: /Saved motion receipts/i })).toBeVisible();

    const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: /Export all local SignRepair data/i }).click(),
    ]);
    expect(await download.path()).not.toBeNull();

    await page
        .getByRole("button", { name: /Clear all local SignRepair data from this browser/i })
        .click();
    await expect(page.getByText(/No saved motion receipts/i)).toBeVisible();
});

test("verify flow uploads local clip, shows model output, saves benchmark report, exports JSON, and clears memory", async ({
    page,
}) => {
    page.on("dialog", (dialog) => dialog.accept());
    await page.goto("/");
    await callE2EHarness(page, "clearAll");
    await callE2EHarness(page, "seedConsent");
    await page.goto(VERIFY_QUERY);

    await page.getByLabel(/Upload mp4 clip for verification/i).setInputFiles({
        name: "sample clip.mp4",
        mimeType: "video/mp4",
        buffer: Buffer.from("signrepair-e2e-mock-clip"),
    });
    await page.getByLabel(/Select verify mode/i).selectOption("concept-benchmark");
    await page.getByRole("button", { name: /Process uploaded clip for verification/i }).click();

    await expect(page.getByRole("heading", { name: /Prediction comparison/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Verification timeline/i })).toBeVisible();
    await expect(page.getByText(/Expected reference/i).first()).toBeVisible();
    await expect(page.getByText(/Model output/i).first()).toBeVisible();
    await expect(page.getByText(/Match result/i).first()).toBeVisible();
    await expect(page.getByText(/Current model output stays constrained/i)).toBeVisible();

    await page.getByRole("button", { name: /Save verification report locally/i }).click();
    await expect(
        page.getByText(/Saved benchmark verification report locally\. Landmark-derived data only\./i),
    ).toBeVisible();

    await page.getByRole("link", { name: "Memory" }).click();
    await expect(page.getByRole("heading", { name: /Benchmark evaluations/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /sample clip\.mp4/i })).toBeVisible();

    const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: /Export all local SignRepair data/i }).click(),
    ]);
    const filePath = await download.path();

    expect(filePath).not.toBeNull();

    const exported = JSON.parse(await fs.readFile(filePath!, "utf8")) as {
        verificationReports: Array<{
            clipName?: string;
            segments?: Array<{
                modelOutput?: string;
            }>;
        }>;
    };

    expect(exported.verificationReports.length).toBeGreaterThan(0);
    expect(exported.verificationReports[0]?.clipName).toBe("sample clip.mp4");
    expect(exported.verificationReports[0]?.segments?.[0]?.modelOutput).toBeTruthy();

    const serialized = JSON.stringify(exported);

    for (const forbiddenField of [
        "rawVideo",
        "videoBlob",
        "framePixels",
        "imageData",
        "canvasData",
        "dataUrl",
        "jpg",
        "jpeg",
        "png",
        "webp",
        "base64",
    ]) {
        expect(serialized).not.toContain(`\"${forbiddenField}\"`);
    }

    await page
        .getByRole("button", { name: /Clear all local SignRepair data from this browser/i })
        .click();
    await expect(page.getByText(/No benchmark evaluations saved yet/i)).toBeVisible();
});

test("blind verify flow stays reference-free and exports blind hypotheses only", async ({
    page,
}) => {
    await page.goto(VERIFY_QUERY);

    await page.getByLabel(/Upload mp4 clip for verification/i).setInputFiles({
        name: "sample clip.mp4",
        mimeType: "video/mp4",
        buffer: Buffer.from("signrepair-e2e-mock-clip"),
    });
    await page.getByRole("button", { name: /Process uploaded clip for verification/i }).click();

    await expect(page.getByRole("heading", { name: /Unseen clip validation summary/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Blind inference timeline/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Blind export compare/i })).toBeVisible();
    await expect(page.getByText(/Top lexeme chain:/i)).toBeVisible();
    await expect(page.getByText(/Blind lexemes:/i).first()).toBeVisible();
    await expect(page.getByText(/Best hypothesis/i).first()).toBeVisible();
    await expect(page.getByLabel(/Expected reference for/i)).toHaveCount(0);
    await expect(
        page.getByRole("button", { name: /Reset expected reference to bundled benchmark/i }),
    ).toHaveCount(0);

    const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: /Export blind inference report as JSON/i }).click(),
    ]);
    const filePath = await download.path();

    expect(filePath).not.toBeNull();

    const exported = JSON.parse(await fs.readFile(filePath!, "utf8")) as {
        mode?: string;
        lexemes?: unknown[];
        segments?: Array<{
            bestHypothesis?: string;
            expected?: string;
            phases?: unknown[];
        }>;
        reference?: unknown;
    };

    expect(exported.mode).toBe("blind-inference");
    expect(exported.reference).toBeUndefined();
    expect(exported.segments?.[0]?.bestHypothesis).toBeTruthy();
    expect(Array.isArray(exported.lexemes)).toBe(true);
    expect(Array.isArray(exported.segments?.[0]?.phases)).toBe(true);
    expect(JSON.stringify(exported)).not.toContain("\"expected\"");
});

test("review page handoff smoke links into live, evidence health, and memory empty states", async ({
    page,
}) => {
    await installMockMedia(page, "success");
    page.on("dialog", (dialog) => dialog.accept());
    await page.goto("/review");
    await callE2EHarness(page, "clearAll");

    await expect(page.getByRole("heading", { name: /Reviewer guide for SignRepair/i })).toBeVisible();
    await expect(page.getByText(/What this prototype is/i)).toBeVisible();
    await expect(page.getByText(/No raw video, no pixels, no base64 image payloads\./i)).toBeVisible();

    const reviewMain = page.getByRole("main");

    await reviewMain.getByRole("link", { name: "Live", exact: true }).click();
    await expect(page).toHaveURL(/\/live$/);
    await expect(page.getByText(/Consent not recorded yet\./i)).toBeVisible();

    await page.goto("/review");
    await reviewMain.getByRole("link", { name: "Evidence Health", exact: true }).click();
    await expect(page).toHaveURL(/\/evidence-health$/);
    await expect(page.getByText(/Status: Unknown/i)).toBeVisible();
    await expect(page.getByText(/No local actions yet\./i)).toBeVisible();

    await page.goto("/review");
    await reviewMain.getByRole("link", { name: "Memory", exact: true }).click();
    await expect(page).toHaveURL(/\/memory$/);
    await page
        .getByRole("button", { name: /Clear all local SignRepair data from this browser/i })
        .click();
    await expect(page.getByText(/No saved personal signs yet/i)).toBeVisible();
    await expect(page.getByText(/No Confusion Twin repairs saved yet/i)).toBeVisible();
    await expect(page.getByText(/No Minimal Pair Lab cards yet/i)).toBeVisible();
    await expect(page.getByText(/No saved motion receipts/i)).toBeVisible();
});

test("live flow opens motion receipt viewer, saves receipt locally, and shows it in memory", async ({
    page,
}) => {
    await installMockMedia(page, "success");
    await page.goto(CONSENT_CONFUSION_QUERY);
    await callE2EHarness(page, "clearAll");
    await callE2EHarness(page, "seedConsent");
    await page.goto(LIVE_CONFUSION_QUERY);

    await expect(page.getByRole("button", { name: /View why I am unsure/i })).toBeVisible();
    await page.getByRole("button", { name: /View why I am unsure/i }).click();

    await expect(page.getByRole("region", { name: /Motion Replay Receipt/i })).toBeVisible();
    await expect(
        page.getByText(/This replay uses landmark-derived skeleton data only. It is not raw video./i),
    ).toBeVisible();
    await expect(page.getByText(/SignForm Ledger/i)).toBeVisible();
    await expect(page.getByText(/coarse sign-form evidence slots/i)).toBeVisible();

    await page.getByRole("button", { name: /Save motion receipt locally/i }).click();
    await expect(page.getByText(/Saved landmark-only motion receipt locally\. No raw video\./i)).toBeVisible();
    await expect(page.getByText(/Receipt already saved locally\./i)).toBeVisible();

    await page.getByRole("link", { name: "Memory" }).click();
    await expect(page.getByRole("heading", { name: /Saved motion receipts/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /View saved motion receipt/i })).toBeVisible();
});

test("Cue Patch mouth flow captures before and after comparison, saves receipt, and exports cue patch metadata", async ({
    page,
}) => {
    await installMockMedia(page, "success");
    page.on("dialog", (dialog) => dialog.accept());
    await page.goto("/");
    await callE2EHarness(page, "clearAll");
    await callE2EHarness(page, "seedConsent");
    await page.goto(LIVE_CUE_PATCH_MOUTH_QUERY);

    await expect(page.getByText(/Mouth cue patch/i).first()).toBeVisible();
    await page.getByRole("button", { name: /View why I am unsure/i }).click();
    await expect(page.getByText(/SignForm Ledger/i)).toBeVisible();
    await expect(page.getByText(/Mouth cue/i).first()).toBeVisible();
    await expect(page.getByText(/missing/i).first()).toBeVisible();
    await page.getByRole("button", { name: /Discard receipt/i }).click();
    await page
        .getByRole("button", { name: /Try cue patch Mouth cue patch/i })
        .first()
        .click();

    await expect(page.getByRole("region", { name: /Motion Replay Receipt/i })).toBeVisible();
    await expect(page.getByText(/Cue Patch review/i)).toBeVisible();
    await expect(page.getByText(/Candidate demo hints comparison/i)).toBeVisible();

    await page.getByRole("button", { name: /Save motion receipt locally/i }).click();
    await expect(page.getByText(/Saved landmark-only motion receipt locally\. No raw video\./i)).toBeVisible();

    await page.getByRole("link", { name: "Memory" }).click();
    await expect(page.getByText(/Cue Patch: mouth-visible-repeat/i)).toBeVisible();
    await expect(page.getByText(/SignForm:/i).first()).toBeVisible();

    const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: /Export all local SignRepair data/i }).click(),
    ]);
    const filePath = await download.path();

    expect(filePath).not.toBeNull();

    const exported = JSON.parse(await fs.readFile(filePath!, "utf8")) as {
        savedReceipts: Array<{
            signFormLedger?: {
                slots?: {
                    mouthCue?: {
                        valueLabel?: string;
                    };
                };
            };
            cuePatch?: {
                prompt?: {
                    kind?: string;
                };
            };
        }>;
    };

    expect(exported.savedReceipts[0]?.cuePatch?.prompt?.kind).toBe("mouth-visible-repeat");
    expect(exported.savedReceipts[0]?.signFormLedger?.slots?.mouthCue?.valueLabel).toBeTruthy();
    const serialized = JSON.stringify(exported);

    for (const forbiddenField of [
        "rawVideo",
        "videoBlob",
        "framePixels",
        "imageData",
        "dataUrl",
    ]) {
        expect(serialized).not.toContain(`"${forbiddenField}"`);
    }
});

test("Cue Patch hand fixture shows hand-occlusion-repeat prompt", async ({ page }) => {
    await installMockMedia(page, "success");
    await page.goto("/");
    await callE2EHarness(page, "clearAll");
    await callE2EHarness(page, "seedConsent");
    await page.goto(LIVE_CUE_PATCH_HAND_QUERY);

    await expect(page.getByText(/Hand occlusion patch/i).first()).toBeVisible();
    await expect(page.getByText(/Move both hands fully inside frame and repeat/i).first()).toBeVisible();
});

test("Minimal Pair Lab builds local contrast card and export includes it without raw video fields", async ({
    page,
}) => {
    await installMockMedia(page, "success");
    page.on("dialog", (dialog) => dialog.accept());
    await page.goto(CONSENT_CONFUSION_QUERY);
    await callE2EHarness(page, "clearAll");
    await callE2EHarness(page, "seedConsent");
    await callE2EHarness(page, "seedConfusionPair");
    await callE2EHarness(page, "seedConfusionPair");
    await page.goto(LIVE_CONFUSION_QUERY);

    await expect(
        page.getByText(
            /These two candidates keep colliding\. Compare this pair before trusting the local distinction\./i,
        ),
    ).toBeVisible();
    await page.getByRole("link", { name: /Compare this pair in Minimal Pair Lab/i }).click();

    await expect(page).toHaveURL(
        /\/minimal-pair\?candidateAId=demo-(hello|thank-you)&candidateBId=demo-(hello|thank-you)&e2eScenario=confusion-twin$/,
    );
    await page.getByRole("button", { name: /Record example for A/i }).click();
    await page.getByRole("button", { name: /Record example for A/i }).click();
    await page.getByRole("button", { name: /Record example for B/i }).click();
    await page.getByRole("button", { name: /Record example for B/i }).click();
    await page
        .getByRole("button", { name: /Build contrast card from recorded minimal pair examples/i })
        .click();
    await expect(page.getByRole("heading", { name: /Contrast card/i })).toBeVisible();
    await page
        .getByLabel(/Local notes for Minimal Pair Lab contrast card/i)
        .fill("qa contrast note");
    await page
        .getByRole("button", { name: /Save Minimal Pair Lab contrast card locally/i })
        .click();

    await page.getByRole("link", { name: /Review local memory/i }).click();
    await expect(page.getByRole("heading", { name: /Minimal Pair Lab cards/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /hello vs thank-you/i })).toBeVisible();

    await page.goto(LIVE_CONFUSION_QUERY);
    await expect(
        page.getByText(/Local minimal-pair card says this pair is usually separated by/i).first(),
    ).toBeVisible();
    await page.getByRole("link", { name: "Memory" }).click();

    const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: /Export all local SignRepair data/i }).click(),
    ]);
    const filePath = await download.path();

    expect(filePath).not.toBeNull();

    const exported = JSON.parse(await fs.readFile(filePath!, "utf8")) as {
        minimalPairCards: Array<{
            userNotes?: string;
        }>;
    };

    expect(exported.minimalPairCards.length).toBeGreaterThan(0);
    expect(exported.minimalPairCards[0]?.userNotes).toBe("qa contrast note");

    const serialized = JSON.stringify(exported);

    for (const forbiddenField of [
        "rawVideo",
        "videoBlob",
        "framePixels",
        "imageData",
        "dataUrl",
    ]) {
        expect(serialized).not.toContain(`"${forbiddenField}"`);
    }

    await page
        .getByRole("button", { name: /Clear all local SignRepair data from this browser/i })
        .click();
    await expect(page.getByText(/No Minimal Pair Lab cards yet/i)).toBeVisible();
});

test("Evidence Health surfaces weak, repeated, and stale local memories and exports latest report", async ({
    page,
}) => {
    await installMockMedia(page, "success");
    await page.goto("/");
    await callE2EHarness(page, "clearAll");
    await callE2EHarness(page, "seedConsent");
    await callE2EHarness(page, "seedWeakPersonalSign", "watch-sign");
    await callE2EHarness(page, "seedStalePersonalSign", "stale-sign");
    await callE2EHarness(page, "seedConfusionPair");
    await callE2EHarness(page, "seedConfusionPair");
    await callE2EHarness(page, "seedConfusionPair");

    await page.goto(EVIDENCE_HEALTH_QUERY);

    await expect(page.getByText(/Status: Needs review/i)).toBeVisible();
    await expect(
        page.locator(".memory-card", {
            has: page.getByRole("heading", { name: /watch-sign/i }),
        }),
    ).toContainText(/Watch/i);
    await expect(page.getByText(/Record 2 more examples for watch-sign/i).first()).toBeVisible();
    await expect(page.getByText(/Open Minimal Pair Lab/i).first()).toBeVisible();
    await expect(page.getByText(/stale-sign may have drifted/i).first()).toBeVisible();

    const [download] = await Promise.all([
        page.waitForEvent("download"),
        page
            .getByRole("button", { name: /Export local data from Evidence Health/i })
            .click(),
    ]);
    const filePath = await download.path();

    expect(filePath).not.toBeNull();

    const exported = JSON.parse(await fs.readFile(filePath!, "utf8")) as {
        evidenceHealthReport?: {
            overallStatus?: string;
        } | null;
    };

    expect(exported.evidenceHealthReport?.overallStatus).toBeTruthy();

    const serialized = JSON.stringify(exported);

    for (const forbiddenField of [
        "rawVideo",
        "videoBlob",
        "framePixels",
        "imageData",
        "dataUrl",
    ]) {
        expect(serialized).not.toContain(`"${forbiddenField}"`);
    }

    await callE2EHarness(page, "clearAll");
    await page.goto(EVIDENCE_HEALTH_QUERY);
    await expect(page.getByText(/Status: Unknown/i)).toBeVisible();
});
