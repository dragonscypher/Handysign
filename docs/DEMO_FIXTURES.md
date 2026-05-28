# SignRepair Demo Fixtures

These fixtures are for mocked or dev-mode review. They are dev or test aids, not product claims.

## How to use mocked fixtures

1. Run `NEXT_PUBLIC_SIGNREPAIR_E2E=1 pnpm dev`.
2. Open routes below in browser.
3. Optional: use DevTools console with `window.__signRepairE2E`.

## 1. Ambiguous pair / Confusion Twin

- Trigger:
  - Open `/?e2eScenario=confusion-twin`
  - Start live demo
- Reviewer should see:
  - competing known candidates
  - Confusion Twin panel
  - candidate choices and local repair save checkbox
- Say during demo:
  - "Product shows uncertainty instead of hiding it."
- Do not claim:
  - that pair proves meaning
  - that local repair is full model training

## 2. Mouth-cue missing / Cue Patch

- Trigger:
  - Open `/live?e2eScenario=cue-patch-mouth`
- Reviewer should see:
  - `Debt: mouth cue missing`
  - Cue Patch asking for mouth-visible repeat
  - receipt with weak mouth slot
- Say during demo:
  - "Cue Patch asks for smallest useful recapture, not generic repeat."
- Do not claim:
  - that mouth cue alone proves label
  - that system knows official sign analysis

## 3. Saved motion receipt

- Trigger:
  - Open `/live?e2eScenario=confusion-twin`
  - Open receipt
  - Save receipt locally
- Reviewer should see:
  - landmark-only replay
  - Translation Debt
  - SignForm Ledger
  - saved receipt in Memory
- Say during demo:
  - "Receipt is inspectability and debugging. It is not proof of meaning."
- Do not claim:
  - that receipt certifies output

## 4. Minimal Pair card

- Trigger:
  - In DevTools console:
    - `await window.__signRepairE2E.clearAll()`
    - `await window.__signRepairE2E.seedConsent()`
    - `await window.__signRepairE2E.seedConfusionPair()`
    - `await window.__signRepairE2E.seedConfusionPair()`
  - Open `/live?e2eScenario=confusion-twin`
  - Use `Compare this pair`
- Reviewer should see:
  - repeated pair collision prompt
  - local contrast card build flow
  - saved card in Memory
- Say during demo:
  - "Minimal Pair Lab is local contrast review, not official ASL minimal-pair analysis."
- Do not claim:
  - that card automatically fixes pair everywhere

## 5. Evidence Health watch status

- Trigger:
  - In DevTools console:
    - `await window.__signRepairE2E.clearAll()`
    - `await window.__signRepairE2E.seedConsent()`
    - `await window.__signRepairE2E.seedWeakPersonalSign('watch-sign')`
  - Open `/evidence-health`
- Reviewer should see:
  - `Watch` state
  - recommendation to record more examples
- Say during demo:
  - "Health is local evidence quality, not accuracy."
- Do not claim:
  - that health badge certifies correctness
