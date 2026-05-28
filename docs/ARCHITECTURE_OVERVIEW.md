# SignRepair Architecture Overview

SignRepair is privacy-first sign evidence and repair prototype. Core app is Next.js App Router project with local-only browser storage.

## App routes

- `/`: consent, limits, and product framing
- `/live`: live known-candidate demo, uncertainty, cue patches, receipts
- `/teach`: local personal sign capture from landmark-derived examples
- `/minimal-pair`: local contrast review for repeated near-miss candidate pairs
- `/evidence-health`: local memory quality and drift review
- `/memory`: export, delete, receipt review, and clear-all
- `/review`: reviewer handoff summary page

## Live flow

1. Consent gate checked from local settings.
2. Camera starts through browser APIs.
3. Landmark extractor runs on-device.
4. Feature encoder builds normalized sequence features.
5. Candidate recognizer ranks constrained known candidates.
6. Uncertainty engine decides accept or repair.
7. Cue Patch planner suggests smallest useful recapture.
8. Motion receipt builder creates landmark-only inspectability record.
9. User may save repair memory, receipt, personal sign, or minimal-pair card locally.

## Landmark extraction

- Main runtime lives under `src/lib/landmarks/`.
- `HolisticLandmarkExtractor` wraps MediaPipe Holistic for hands, face, mouth, and pose.
- `MockLandmarkExtractor` handles explicit demo fallback.
- Route cleanup stops camera tracks and extractor subscriptions on unmount.

## Feature encoding

- Main runtime lives under `src/lib/features/`.
- Encodes hand pose, hand motion, mouth cue, facial cue, motion mask, and visibility.
- Normalization uses scale and temporal summaries.
- Output stays landmark-derived and local.

## Candidate recognizer

- Main runtime lives under `src/lib/recognition/`.
- Uses constrained candidate ranking, not open-ended generation.
- Supports demo candidates plus local personal signs.
- Small transparent adjustments can come from Confusion Twin and Minimal Pair data.

## Uncertainty engine

- Main runtime lives under `src/lib/uncertainty/UncertaintyEngine.ts`.
- Acceptance thresholds live there:
  - base confidence floor `0.78`
  - base margin floor `0.18`
- Repair thresholds also live there:
  - unknown floor `0.55`
  - ambiguous margin `< 0.12`
  - occlusion `> 0.35`
  - missing hand or face visibility floors
  - motion window `< 24` or motion energy `< 0.08`
  - mouth cue stability `< 0.45` when candidate hint needs it

## Cue Patch

- Main runtime lives under `src/lib/repair/`.
- Plans smallest useful recapture from uncertainty state, Translation Debt, receipts, sign-form evidence, and local pair hints.
- Does not bypass safety thresholds.

## Motion receipts

- Main runtime lives under `src/lib/receipts/`.
- Stores landmark-only replay frames, decision summary, Translation Debt, sign-form summary, and optional cue patch / minimal-pair context.
- Save is explicit only.

## SignForm Ledger

- Main runtime lives under `src/lib/signform/`.
- Exposes coarse evidence slots:
  - handshape
  - palm orientation
  - location
  - movement
  - timing
  - mouth cue
  - facial cue
  - visibility
- Slots are inspectability aids, not official ASL analysis.

## Confusion Twin

- Main runtime lives under `src/lib/recognition/ContrastiveMemory.ts`.
- Stores local contrastive repair memory for repeated near-miss candidate pairs.
- Used for small ranking nudges and better repair explanations.

## Minimal Pair Lab

- Main runtime lives under `src/lib/minimal-pairs/`.
- Collects 2 to 3 landmark-only examples for each side of confusing pair.
- Builds local contrast card with sign-form and channel differences.
- Informs repair hints and small score adjustments only.

## Evidence Health

- Main runtime lives under `src/lib/evidence-health/`.
- Reviews local memories for health, drift, stale state, and repeated collisions.
- Produces local-only report for review pages and Memory badges.

## Local storage only

- IndexedDB storage lives in `src/lib/privacy/LocalDataStore.ts`.
- Stores settings, personal signs, corrections, confusion pairs, saved receipts, minimal-pair cards, and latest Evidence Health report.
- `assertNoRawVideoFields` guards save and export paths against raw-video-like fields.

## Dev and test helpers

- E2E flags live in `src/lib/testing/e2eFlags.ts`.
- Browser harness lives in `src/components/E2EHarness.tsx`.
- These are dev or test only and enabled only when `NEXT_PUBLIC_SIGNREPAIR_E2E=1`.
