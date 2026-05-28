# SignRepair

SignRepair is not a translator. It is a privacy-first sign evidence and repair prototype built with Next.js, TypeScript, MediaPipe Tasks Vision, and IndexedDB.

Product stance: honest uncertainty over confident guessing.

Instead of pretending certainty, SignRepair:

- watches webcam input on-device
- extracts hand, face, mouth, and pose landmarks
- scores constrained top-k candidates
- shows a known-candidate label only when confidence and margin both pass
- enters Repair Mode when uncertainty is visible
- saves user-confirmed corrections locally as landmark-only personalization
- stores Confusion Twin Repair as local contrastive memory when user disambiguates near-miss candidates
- generates Motion Replay Receipts as landmark-only decision receipts for inspectability and debugging
- adds Cue Patch Mode so uncertain states ask for smallest useful landmark recapture instead of defaulting to full repeat
- adds SignForm Ledger / Handshape Lens so receipts show coarse landmark-derived evidence slots instead of only English word labels
- adds Minimal Pair Lab so repeated near-miss candidate pairs can be reviewed as local landmark-only contrast cards
- adds Evidence Health / Drift Sentinel so local memories can be reviewed as strong, weak, stale, repeatedly confused, or possibly drifted

## Safety

- Low-stakes use only.
- Not for medical, legal, emergency, or official interpreting.
- Not certified interpretation.
- No raw video persistence by default.
- Built-in labels are demo prototypes, not authoritative ASL coverage.
- Motion Replay Receipts are inspectability aids, not proof of meaning.
- Cue Patch Mode is repair UX only. It asks for better evidence and does not prove meaning.
- SignForm Ledger / Handshape Lens is coarse inspectability only, not authoritative ASL phonology.
- Minimal Pair Lab is local contrastive review only, not official ASL minimal-pair analysis.
- Evidence Health / Drift Sentinel is local evidence hygiene only, not an accuracy score or certification.
- Deaf-led review needed before real deployment.

## MVP Features

- Consent-first landing screen with privacy and risk warning
- Live candidate demo with webcam preview, landmark overlay, confidence meter, top 3 candidates, and Translation Debt
- Upload + Verify screen for mp4 clip review with segment timeline, visible model output, reference comparison, and JSON export
- Benchmark vocabulary packs for constrained concept review: greetings, eating or drinking, movement, and work or object actions
- Exact and concept-level verification modes so benchmark review can stay honest when exact labels are too small
- Verify screen now flags `Coverage limited`, `out-of-coverage`, and frame-analysis debug stats so tiny vocabulary does not masquerade as story translation
- Repair Mode actions:
  - Repeat slower
  - Show mouth cue
  - Fingerspell with typed confirmation
  - Choose from top 3
  - Teach this as personal sign
- Teach Mode for 3 to 5 landmark-only examples of custom signs
- Review / Memory screen for export, delete, and clear-all
- MediaPipe Holistic extractor with explicit mock-mode badge when runtime init fails
- Weighted KNN / prototype recognizer over encoded landmark features
- Known-candidate recognition only. No open-ended text generation.
- Confusion Twin Repair for prototype-level contrastive personalization on this device
- Motion Replay Receipts with landmark-only replay, channel summaries, explicit local save, export, and delete controls
- Cue Patch Mode for mouth cue, hand occlusion, final handshape, face cue, body frame, slow-repeat, and choose-or-teach repair prompts
- SignForm Ledger / Handshape Lens for coarse handshape, orientation, location, movement, timing, mouth, facial, and visibility slots
- Minimal Pair Lab for collecting 2 to 3 landmark-only examples of confusing candidate pairs and saving local contrast cards
- Evidence Health / Drift Sentinel for local memory health badges, drift warnings, coverage gaps, and review actions

## Product Spine

Core loop:

1. Watch known candidate signs.
2. Show uncertainty honestly.
3. Explain missing evidence.
4. Ask for targeted cue patches.
5. Let user save local corrections.
6. Let user inspect receipts and memory health.

## Stack

- `next@16.2.6`
- `react@19.2.5`
- `@mediapipe/tasks-vision@0.10.34`
- `dexie@4.4.2`
- `vitest@4.1.5`

## Run

```bash
corepack enable
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

## Test

```bash
pnpm lint
pnpm test
pnpm e2e
```

Use `pnpm audit:export -- <path-to-export.json>` to audit exported JSON for raw-video-like fields.

Automated tests cover feature encoding, recognizer ranking, uncertainty rules, repair decisions, local storage, key UI flows, and browser E2E smoke with mocked webcam APIs.

E2E notes:

- `pnpm e2e` runs Playwright headless against local Next dev server.
- Browser E2E uses mocked `getUserMedia`, mocked `MediaStreamTrack.stop`, and deterministic mock-landmark / forced-MediaPipe-failure paths.
- Browser E2E also uses deterministic mocked clip analysis for `/verify`, so real mp4 decode still needs manual browser QA.
- Browser E2E covers Motion Replay Receipt open, save, memory listing, export, and clear flows with mocked landmark data.
- Browser E2E also covers Cue Patch mouth and hand fixtures, SignForm Ledger receipt display, and local sign-form note editing with mocked landmark windows.
- Browser E2E also covers repeated Confusion Twin collisions opening Minimal Pair Lab, building local contrast cards, and exporting `minimalPairCards`.
- Browser E2E also covers Evidence Health watch / needs-review states, drift warnings, export of latest `evidenceHealthReport`, and empty-state after clear.
- Browser E2E also covers `/verify` upload flow with mocked clip analysis, segment timeline, visible model output, saved benchmark report, export, and clear-all.
- Real camera behavior, real MediaPipe asset loading, and Safari/WebKit behavior still need manual QA.
- Demo walkthrough script lives in [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md).
- Reviewer handoff route lives at `/review`.

## Benchmark-first verify workflow

1. Open `/verify`.
2. Upload a local mp4 such as `sample clip.mp4`.
3. Process the clip to build landmark-only segments.
4. Review exact model output beside the expected human reference summary.
5. Pick constrained vocabulary pack and switch between `exact` and `concept-level` comparison.
6. Optionally mark a small subset of segments for calibration, then re-run and judge held-out segments instead of calibration-only matches.
7. Treat concept coverage as partial benchmark evidence only, not translation.
6. Save or export the benchmark verification JSON report.

Notes:

- Expected text is a provisional human-reviewed English summary, not exact ASL gloss.
- The current recognizer is still a small known-candidate demo. Narrative clips can stay mismatched or uncertain.
- `/verify` distinguishes non-fatal MediaPipe/TFLite runtime logs from real analysis failures and records frame-analysis debug stats without storing raw video.
- Benchmark mode must show exact guesses and uncertainty, not pretend full sign translation.

## Known limitations

- Known-candidate demo only.
- Benchmark verification is limited by the current constrained candidate set.
- Not certified interpretation.
- Real webcam and browser behavior still need manual validation.
- Landmark-only evidence is not proof of meaning.
- Local personalization may drift and need review.
- Deaf-led review required before real deployment.

Manual browser checks live in [docs/MANUAL_QA.md](docs/MANUAL_QA.md).

## Privacy Model

- Video stays on device by default.
- IndexedDB stores settings, correction logs, and personal sign prototypes.
- Confusion Twin Repair stores landmark-derived feature summaries only.
- Motion Replay Receipts store landmark replay frames, channel summaries, and uncertainty state only when user explicitly saves them.
- Cue Patch Mode stores prompt and before/after comparison metadata only when you explicitly save related receipt.
- SignForm Ledger stores coarse landmark-derived evidence slots only when embedded in saved receipt.
- Minimal Pair Lab stores contrast cards, example feature summaries, and local notes only when you explicitly save them.
- Evidence Health stores only the latest landmark-only health report when generated locally.
- Personal sign storage uses landmark sequences and derived features only.
- Personal sign sign-form notes stay local, editable, and user-defined.
- Export produces local JSON snapshot from IndexedDB.

Confusion Twin Repair is not real model training. It is local prototype-level contrastive personalization. It stores landmark-derived features only and only affects ranking on this device.

Motion Replay Receipts are not accuracy improvements or linguistic authority. They are local inspectability records that explain what the prototype considered and why it was unsure, using landmark-only replay data.

Cue Patch Mode is not model training or linguistic authority. It is local repair logic that uses Translation Debt, receipt summaries, and known-candidate metadata to ask for better evidence.

SignForm Ledger / Handshape Lens is not model training, official ASL handshape recognition, or linguistic authority. It exposes coarse evidence slots and editable local notes to support inspectability and repair.

Minimal Pair Lab is not official ASL minimal-pair analysis, not certified interpretation, and not full model training. It creates local contrast cards from landmark-derived features so future repair prompts and small score nudges can stay inspectable on this device.

Evidence Health / Drift Sentinel is not an accuracy certificate, not linguistic authority, and not automatic cleanup. It is a local "check the state of my memories" layer that flags under-sampled, stale, repeatedly confused, or possibly drifted local memories so the user stays in control.

## Research Direction

This prototype borrows product ideas from:

- pose consistency and constrained matching patterns inspired by CCL-SLR style thinking
- mouth/lip disambiguation emphasis from SignMouth / SignClip style findings
- facial-expression sensitivity from EASLT-style sign-language research
- 2026 VLM sign-recognition caution: constrain candidate space, do not open-end guess
- skeleton-based sign-language research and XAI direction: expose manual and non-manual cues without storing raw video
- repair UX direction: ask for smallest useful recapture before asking for full repeat
- sign-form / handshape direction: expose coarse evidence slots so product does not collapse everything into English gloss labels
- minimal-pair review direction: compare repeated near-miss pairs with local contrast cards instead of pretending one English label fully explains the evidence
- evidence-health direction: surface when local personalization may be weak, stale, over-colliding, or drifting so users can review without overclaiming correctness
- Deaf-community safety guidance: consent-first, on-device, not replacement for qualified human sign-language support

See [docs/RESEARCH_NOTES.md](docs/RESEARCH_NOTES.md), [docs/ETHICS.md](docs/ETHICS.md), [docs/MODEL_SWAP_GUIDE.md](docs/MODEL_SWAP_GUIDE.md), [docs/MANUAL_QA.md](docs/MANUAL_QA.md), [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md), [docs/DEMO_FIXTURES.md](docs/DEMO_FIXTURES.md), [docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md), [docs/PRIVACY_OVERVIEW.md](docs/PRIVACY_OVERVIEW.md), [docs/ARCHITECTURE_OVERVIEW.md](docs/ARCHITECTURE_OVERVIEW.md), and [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md).

LLM continuation notes live in [docs/LLM_HANDOFF.md](docs/LLM_HANDOFF.md).
