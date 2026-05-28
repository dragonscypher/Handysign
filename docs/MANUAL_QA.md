# SignRepair QA

Run automated browser checks with:

```bash
pnpm e2e
```

`pnpm e2e` uses mocked webcam APIs and deterministic mock-landmark / forced-MediaPipe-failure flows. It does not replace real-browser hardware validation.

## Automated checks

- Consent -> start camera -> live screen appears with mocked webcam stream
- Route change away from `/live` calls mocked `MediaStreamTrack.stop`
- Camera denied path shows user-facing permission message
- Unsupported browser API path shows user-facing unsupported message
- Forced MediaPipe failure shows explicit `Demo Mode: mock landmarks` badge
- Confusion Twin ambiguous flow shows repair copy, save checkbox, save-on persistence, and delete flow
- Confusion Twin save-off flow stays session-only
- Export includes `personalSigns` and `confusionPairs`
- Motion Replay Receipt viewer opens from live uncertainty state
- Motion Replay Receipt save flow adds landmark-only saved receipt to Memory
- Export includes `savedReceipts`
- SignForm Ledger appears in receipt viewer during mocked live uncertainty flow
- Mouth-missing fixture shows SignForm weak/missing mouth evidence before cue patch
- Memory screen supports local personal sign-form note edit and export
- Cue Patch mouth fixture shows `mouth-visible-repeat`
- Cue Patch hand fixture shows `hand-occlusion-repeat`
- Cue Patch flow captures before and after comparison and exports cue patch metadata
- Repeated Confusion Twin collisions can open Minimal Pair Lab with prefilled pair
- Minimal Pair Lab can record mocked examples for A and B, build local contrast card, save it, export `minimalPairCards`, and clear it
- Evidence Health route shows watch / needs-review states, recommends recording more examples, opens Minimal Pair Lab, shows drift warnings, exports latest `evidenceHealthReport`, and returns to unknown after clear
- Verify route accepts local mp4, shows segment timeline, visible model output, reference comparison, local save, export, and clear flow in mocked benchmark mode
- Review page route opens reviewer handoff copy and quick links
- Export excludes `rawVideo`, `videoBlob`, `framePixels`, `imageData`, `canvasData`, `dataUrl`, `jpg`, `jpeg`, `png`, `webp`, and `base64`
- Clear all empties Memory screen
- Accessibility smoke covers keyboard nav reachability, accessible names, and `aria-live="polite"` prediction region

## Manual-only checks

### Release readiness checklist

- Run [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md).
- Read [ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md) for handoff accuracy.
- Read [PRIVACY_OVERVIEW.md](./PRIVACY_OVERVIEW.md) and confirm product behavior still matches it.
- Read [TESTING_GUIDE.md](./TESTING_GUIDE.md) and confirm dev-only flags stay dev-only.
- Read [DEMO_FIXTURES.md](./DEMO_FIXTURES.md) and confirm fixture instructions still match app.

### Product Spine checklist

- Verify Home copy says `Privacy-first sign evidence and repair prototype.`
- Verify no visible UI copy overclaims translation, interpretation, or certified accuracy.
- Verify nav order is `Home`, `Live`, `Verify`, `Teach`, `Minimal Pair Lab`, `Evidence Health`, `Memory`.
- Verify each page title includes its one-sentence route description.
- Verify Live page primary action priority is coherent:
  - start live demo before camera
  - `Try this patch` when cue patch is recommended
  - choose candidate only after ambiguity is shown
  - `Compare this pair` only after repeated pair collision
  - `Teach as personal sign` for unknown or personal-sign repair flows
- Verify Motion Replay Receipt section order:
  - privacy notice
  - decision summary
  - Translation Debt
  - SignForm Ledger
  - Cue Patch review when present
  - related minimal-pair card when present
  - skeleton replay
  - receipt actions
- Verify Memory page group order:
  - personal signs
  - Confusion Twin repairs
  - Minimal Pair Lab cards
  - saved motion receipts
  - Evidence Health report
  - export / clear all
- Run [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) end to end.
- Verify export still contains no raw-video-like fields.

### Verify benchmark flow

- Open `/verify`.
- Upload `sample clip.mp4` or another local mp4.
- Automated E2E uses mocked clip analysis. This checklist is for real local mp4 behavior.
- Confirm status text says verification is benchmark review, not full sign translation.
- Confirm a timeline appears with:
  - start/end time
  - expected reference
  - model output
  - confidence
  - other possibilities
  - Translation Debt / why unsure
  - match result
- Edit at least one expected segment label and confirm comparison updates.
- Mark only a small subset of segments for calibration, re-run, and confirm held-out note stays visible.
- Save a benchmark verification report locally.
- Export the report and confirm it contains `verificationReports` data only with landmark-derived summaries.
- Confirm no raw video blobs, pixels, or base64-like fields appear.

### Review page checklist

- Open `/review`.
- Confirm it explains what prototype is and is not in plain language.
- Confirm quick route links work for Home, Live, Verify, Teach, Minimal Pair Lab, Evidence Health, and Memory.
- Confirm privacy promises say landmark-only, no raw video, no pixels, and no upload.
- Confirm manual checks section matches real unresolved items.

### Real Chrome webcam test

- Open `/`, acknowledge consent, then go to `/live`.
- Allow camera access.
- Confirm webcam preview appears and status changes to on-device landmark extraction.
- Confirm top candidates and Translation Debt update while moving in frame.
- Open `View receipt` or `View why I'm unsure`.
- Confirm Motion Replay Receipt shows landmark-only replay and no raw video frames.
- Confirm SignForm Ledger shows coarse slot cards and labels them as inspectability, not official ASL analysis.
- Trigger Cue Patch Mode and verify prompt asks for smallest useful recapture instead of overclaiming certainty.

### Real MediaPipe asset-load test

- Simulate blocked MediaPipe assets or broken network access to the model / wasm URLs.
- Open `/live`.
- Confirm the app does not silently continue.
- Confirm the app shows `Demo Mode: mock landmarks` with a clear reason.
- If Cue Patch Mode appears in demo fallback, confirm it still frames prompts as better evidence requests, not proof.

### Safari / WebKit caveat

- Open the same flow in Safari or another WebKit browser.
- Confirm camera prompt appears.
- If MediaPipe fails to initialize, confirm the app shows `Demo Mode: mock landmarks` and explains the fallback.
- Note any Safari-specific permission, autoplay, or WebAssembly issues.

### Real camera route cleanup test

- Start live capture on `/live`.
- Navigate to `/teach`, `/memory`, and back.
- Confirm the previous page camera stream stops when the route changes.
- Confirm no duplicate camera sessions or overlay loops appear after returning.
- Confirm any open Motion Replay Receipt reflects live landmark state, not stale camera pixels.
- If cue patch capture was armed, confirm route change cancels stale patch state.

### Teach Mode save / delete test

- Open `/teach` after consent.
- Record at least 3 examples.
- Confirm the save area says `Saves landmark-derived data locally on this device.`
- Save a personal sign, open `/memory`, then delete that sign.

### DevTools no-raw-video persistence check

- Save a personal sign.
- Save a Motion Replay Receipt locally.
- Inspect IndexedDB in browser devtools.
- Confirm stored records contain landmarks / features / metadata only.
- Confirm saved receipts contain numeric landmark arrays, debt summaries, and privacy flags only.
- Confirm cue patch metadata contains prompt/result summaries only and no pixels or media blobs.
- Confirm SignForm Ledger contains coarse slot labels and evidence only.
- Confirm personal sign-form notes are plain local text only.
- Confirm no raw video blobs, media streams, or file objects are persisted.

### Cue Patch prompt quality check

- Trigger mouth cue, hand occlusion, and ambiguous candidate states.
- Confirm prompts say they ask for better evidence, not correct meaning.
- Confirm prompts do not frame one visible style as authoritative signing.
- Confirm full repeat appears as fallback, not first response when smaller patch is available.

### SignForm Ledger quality check

- Open `View receipt` or `View why I'm unsure`.
- Confirm `SignForm Ledger` appears.
- Confirm slot labels stay coarse: `open-ish`, `closed-ish`, `face zone`, `short path`, and similar humble wording.
- Confirm UI says slots are landmark-derived evidence, not official ASL analysis.
- Confirm candidate demo hints are labeled as demo hints, not authority.
- Save personal sign notes and confirm they stay editable and local.

### Minimal Pair Lab quality check

- Trigger the same Confusion Twin pair at least twice, then open `Compare this pair`.
- Confirm Minimal Pair Lab says it uses landmark-derived evidence only and does not produce official ASL analysis.
- Record 2 to 3 examples for each side with real camera input.
- Build a contrast card and confirm strongest slot / strongest channel copy stays coarse and humble.
- Save a card locally, open `/memory`, and confirm notes stay editable and local.
- Confirm export includes `minimalPairCards` only as landmark-derived summaries and local notes.
- Confirm the card does not auto-accept future output; it only informs repair prompts and small score nudges.

### Evidence Health / Drift Sentinel quality check

- Open `/evidence-health`.
- Confirm the privacy notice says it uses local landmark-derived data only and is not an accuracy certificate.
- Seed or record a personal sign with only 1 example and confirm it shows `Watch` plus `Record more examples`.
- Trigger repeated Confusion Twin saves and confirm the route recommends `Open Minimal Pair Lab`.
- Save or age a local personal sign and confirm drift copy says memory `may have drifted` or `needs review`, not that drift is proven.
- Confirm "healthy" language does not imply correctness or official analysis.
- Confirm warnings do not pressure users toward one standard signing style.

### Demo script check

- Follow [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) in order.
- Confirm the phrases about honest uncertainty, landmark-derived data, and Deaf-led review still match the product.
