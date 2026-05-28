# SignRepair Testing Guide

## Automated checks

- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm e2e`

## What unit and component tests cover

- feature encoding and normalization
- candidate ranking and score adjustments
- uncertainty thresholds
- cue patch planning
- motion receipt construction
- sign-form extraction
- local storage export and clear paths
- review and memory UI sections

## What browser E2E covers

- mocked webcam startup and teardown
- camera denied and unsupported-browser states
- forced MediaPipe fallback to explicit demo mode
- Confusion Twin save and session-only paths
- cue patch flows
- minimal-pair flow
- Evidence Health flow
- export and clear-all
- reviewer route smoke

## What is still manual

- real Chrome webcam behavior
- real MediaPipe asset loading and failure under network blocking
- Safari or WebKit behavior
- real hardware route-change cleanup
- DevTools IndexedDB inspection

## Mocked webcam and MediaPipe notes

- Playwright uses mocked `getUserMedia`, mocked `MediaStream`, and mocked `MediaStreamTrack.stop`.
- Dev or test-only E2E harness mounts only when `NEXT_PUBLIC_SIGNREPAIR_E2E=1`.
- Query params like `?forceMockLandmarks=1` and `?e2eScenario=...` are dev or test only.
- Normal product UI should not rely on those flags.

## Sample export workflow

1. Run `NEXT_PUBLIC_SIGNREPAIR_E2E=1 pnpm dev`.
2. Open app in browser.
3. In DevTools console, seed sample local data:
   - `await window.__signRepairE2E.clearAll()`
   - `await window.__signRepairE2E.seedConsent()`
   - `await window.__signRepairE2E.seedPersonalSign('sample-sign')`
   - `await window.__signRepairE2E.seedConfusionPair()`
   - `await window.__signRepairE2E.seedReceipt()`
4. Open `/memory` and export local data.
5. Run `pnpm audit:export -- <path-to-export.json>`.
6. Confirm export contains landmark-derived summaries only.

## Why hardware still needs verification

- Browser mocks cannot prove camera permission UX on every platform.
- Browser mocks cannot prove MediaPipe asset loading in real network conditions.
- Browser mocks cannot prove hardware timing, route cleanup, or WebKit behavior.
