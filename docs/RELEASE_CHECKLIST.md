# SignRepair Release Checklist

Use this before demo, handoff, or tagged snapshot.

## Core checks

1. Run `corepack enable`.
2. Run `pnpm install`.
3. Run `pnpm dev`.
4. Run `pnpm lint`.
5. Run `pnpm test`.
6. Run `pnpm build`.
7. Run `pnpm e2e`.

## Manual QA

1. Run manual browser checks in [MANUAL_QA.md](./MANUAL_QA.md).
2. Run real Chrome webcam flow with camera permission allowed.
3. Run real MediaPipe asset-load failure check.
4. Run Safari or WebKit spot check.
5. Confirm route change stops live camera session.

## Demo readiness

1. Walk through [DEMO_SCRIPT.md](./DEMO_SCRIPT.md).
2. Review [DEMO_FIXTURES.md](./DEMO_FIXTURES.md).
3. Confirm Home, Live, Evidence Health, Memory, and Review pages match product spine.
4. Confirm no visible copy overclaims meaning, coverage, or certification.

## Export and privacy

1. Export local data from Memory.
2. Inspect JSON for landmark-only fields.
3. Run `pnpm audit:export -- <path-to-export.json>`.
4. Confirm no `rawVideo`, `videoBlob`, `framePixels`, `imageData`, `canvasData`, `dataUrl`, `jpg`, `jpeg`, `png`, `webp`, or `base64` fields appear.
5. Use clear-all and confirm empty states return.

## Final wording audit

1. Search for `translator`, `interpreter`, `translate`, `accurate`, `proof`, `certified`, `ASL recognition`, and `real-time interpretation`.
2. Keep those only when clearly negated or described as limitation.
3. Confirm README still says privacy-first sign evidence and repair prototype.

## Known limitations

- Known-candidate demo only.
- Not certified interpretation.
- Landmark-only evidence is not proof of meaning.
- Local personalization may drift and need review.
- Real webcam and browser behavior still need manual validation.
- Deaf-led review required before real deployment.
