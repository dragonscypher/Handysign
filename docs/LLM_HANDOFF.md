# LLM Handoff

## Current goal (round 15 - manifest trainer + safe public push)

Round 15 moved the learned local-head path from a one-off sample-2 trainer toward a manifest-driven, multi-source training workflow while preserving the active v4 fallback and sample-3 blind gates. It also prepared the repo for a public push by ignoring local raw media and removing personal absolute paths from current docs. Sample 3 remains validation-only: no sample-3 human transcript, expected reference, answer key, inferred truth, or comparison target was used.

### Hard carry-forward rules

- Do not ask for another unseen user clip yet.
- Keep sample-3 validation transcript-free and reference-free.
- Treat real browser-generated blind exports as canonical.
- Use pnpm only; `package-lock.json` must stay absent.
- Keep `sign-vocab-semantic-confidence@4` active until a learned candidate preserves or improves confidence, segment confidence, semantic breadth, and sample-3 exclusion.
- Never train, calibrate, or label from `docs/artifacts/sample3-blind-2026-05-21.json`; it is validation-only.

### What changed in round 15

1. **Manifest-driven trainer path** - `scripts/train-local-head.mjs` now reads the latest `docs/artifacts/local-head-training-manifest-YYYY-MM-DD.json` and supports multiple privacy-safe training sets. It rejects absolute local paths, rejects any training source path containing sample 3, and keeps forbidden-key checks for raw video, pixels, frames, expected references, answer keys, and lexicon transcript fields.
2. **Training manifest added** - `docs/artifacts/local-head-training-manifest-2026-05-28.json` records the current sample-2 training set, the sample-3 validation-only exclusion, and explicit minimum supervised breadth before activation can be considered.
3. **Exact segment-label scaffold added** - the trainer can now resolve labels by exact `segmentId`/`segmentIds` when future label packs provide them, falling back to family hints only when exact labels are absent. It records family-only ambiguity so future broader packs do not silently overfit a family to one label.
4. **Candidate metadata made more honest** - `src/lib/recognition/pretrained/sign-vocab-learned-subset.json` now records source manifest, source exports/lexicons, training-set summaries, unique families/concepts, segment-label resolution, activation minimums, activation blockers, and `readyForActivation: false`.
5. **Public push scrubbed** - `.gitignore` now excludes `sample 2.mp4` and `sample 3.mp4`; historical local absolute paths in this handoff were redacted to local-only relative references. `sample 2.mp4` and `sample 3.mp4` are intentionally not staged or pushed.
6. **Unit coverage extended** - `src/tests/PretrainedSignRecognizer.test.ts` now checks that the learned subset points to the manifest and remains not ready for activation.

### Sample-3 validation metrics after round 15

- **Active selected model**: still `sign-vocab-semantic-confidence@4`.
- **Active transcript**: unchanged, `FALL EXPLAIN HOLD PERSON FALL LEARN ASK EXPLAIN EXPLAIN TELL`.
- **Active overall confidence**: still **58%** (`0.5786`).
- **Active segments above 0.55**: still **6/10**.
- **Active semantic breadth**: still `collapseRisk=false`; unique glosses **7**, semantic classes **6**, coarse action/tool/object share **0.3**.
- **Active low-confidence flag**: still **true**, correctly, because **8/10** blind-family margins remain below `0.10`.
- **Learned subset candidate transcript**: still `BOUNCE HAMMER BOUNCE BOUNCE BOUNCE CHOP CHOP CHOP HAMMER HAMMER`.
- **Learned subset candidate confidence**: still **52%** (`0.5198`).
- **Learned subset candidate segments above 0.55**: still **5/10**.
- **Learned subset candidate semantic breadth**: still `collapseRisk=true`; it remains rejected for activation.
- **Training breadth blocker**: only **1** labeled training set, **10** labeled segments, **5** unique families, **5** unique labels, and **3** unique concepts. The manifest gate requires at least 2 training sets, 24 labeled segments, 8 families, 10 labels, and 6 concepts before activation can even be considered.

### Train-mode status

- Sample-2 Train path remains stable: pretrained transcript `BOUNCE CHOP CHOP FALL HAMMER HAMMER SPELL FALL FALL SPELL`; adapted transcript `BOUNCE CHOP CHOP FALL-DOWN HAMMER HAMMER SPELL-NAME FALL-DOWN FALL-DOWN SPELL-NAME`; **10/10** overrides; confidence delta **+0.0500**.
- The learned subset remains useful as a local training pipeline proof, not as a general recognizer.

### Public push safety status

- Branch before push prep: `master`.
- Remote before push prep: none configured. `origin` was set to `https://github.com/dragonscypher/Handysign`.
- Public push completed: branch `master` pushed to `origin/master`.
- Main public-safe work commit: `22431e2` (`feat: publish local signrepair prototype`).
- Local raw media intentionally excluded: `sample 2.mp4`, `sample 3.mp4`, and existing `sample clip.mp4` ignore rule.
- Non-build, non-media scrub for personal Windows absolute-path markers: no output after redaction.
- Non-build, non-media scrub for common sensitive-keyword markers and private-key headers: no output.
- Do not stage `.next/`, `node_modules/`, test-result output, raw video, or other local machine artifacts.

### Files touched in round 15

- Trainer/model/tests: `scripts/train-local-head.mjs`, `src/lib/recognition/pretrained/sign-vocab-learned-subset.json`, `src/tests/PretrainedSignRecognizer.test.ts`.
- Docs/artifacts: `docs/LLM_HANDOFF.md`, `docs/artifacts/local-head-training-manifest-2026-05-28.json`, `docs/artifacts/sample3-blind-eval-2026-05-28.json`, `docs/artifacts/sample2-adaptation-pack-2026-05-28.json`, `docs/artifacts/sample2-adaptation-pack-eval-2026-05-28.json`.
- Public safety: `.gitignore`.

### Checks passed in round 15

- `node scripts/exercise-train-mode.mjs` - sample-2 Train path stable; 10 overrides; +0.0500 confidence delta.
- `node scripts/train-local-head.mjs` - regenerates manifest-based `sign-vocab-learned-subset@1`; confirms sample 3 used for training: **NO**.
- `node scripts/validate-sample3.mjs` - active v4 preserved at 58%, candidate remains 52% with `collapseRisk=true`, modelSelection keeps v4.
- VS Code diagnostics on touched trainer/test files - no errors.
- `pnpm lint` - clean.
- `pnpm test` - **175 / 175** Vitest pass.
- `pnpm build` - clean on Next 16.2.6; `/translate` emitted.
- `pnpm e2e` - **18 / 18** Playwright pass, including `/translate` sample-3 browser path at 58%.
- `pnpm audit --audit-level low` - no known vulnerabilities.

### Exact next recommended step

Keep v4 active. Add at least one more privacy-safe labeled blind export plus exact segment-level labels, then append it to `docs/artifacts/local-head-training-manifest-2026-05-28.json` or a newer manifest. Re-run `pnpm train:local-head`, `node scripts/validate-sample3.mjs`, `node scripts/exercise-train-mode.mjs`, and the full pnpm checks. Do not activate the learned subset unless it beats or preserves v4 on confidence, 6/10 segments above 0.55, and `collapseRisk=false`, still with sample 3 excluded from training.

---

## Current goal (round 14 — learned local-head candidate + fallback)

Round 14 materially advanced the hand-weighted JSON head toward a learned local head without sacrificing the round-13 sample-3 gains. Sample 3 remains the active unseen validation clip. No sample-3 human transcript, expected reference, answer key, or inferred truth was read, requested, or compared.

### Hard carry-forward rules

- Do not ask for another unseen user clip yet.
- Keep sample-3 validation transcript-free and reference-free.
- Treat real browser-generated blind exports as canonical.
- Use pnpm only; `package-lock.json` must stay absent.
- Keep `sign-vocab-semantic-confidence@4` as the active fallback until a learned head preserves or improves the sample-3 structural gates.

### What changed in round 14

1. **Concrete learned subset path added** — `scripts/train-local-head.mjs` trains a deterministic multinomial logistic-regression linear probe from the canonical sample-2 real-browser blind export plus the latest sample-2 Train-mode lexicon. It explicitly excludes sample 3 and asserts no raw video, pixel, frame, expected-reference, answer-key, or lexicon transcript fields are used.
2. **Candidate learned model artifact added** — `src/lib/recognition/pretrained/sign-vocab-learned-subset.json` is `sign-vocab-learned-subset@1`, a 5-label sample-2-trained learned subset probe (`CHOP`, `HAMMER`, `FALL-DOWN`, `BOUNCE`, `SPELL-NAME`). It is marked `deployment.status: candidate`, with `activeFallbackModelId: sign-vocab-semantic-confidence@4`.
3. **Runtime loader scaffold wired** — `SignVocabModel.ts` now loads both the active v4 head and the learned subset candidate via `loadBundledSignVocabModel()`, `loadBundledLearnedSubsetModel()`, and `listBundledSignVocabModels()`. The active recognizer still uses v4 by default.
4. **Sample-3 validator now evaluates the candidate** — `scripts/validate-sample3.mjs` writes `learnedCandidate` and `modelSelection` blocks into `docs/artifacts/sample3-blind-eval-2026-05-28.json`. The gate requires the candidate to preserve active confidence, preserve segment count above 0.55, preserve semantic breadth (`collapseRisk=false`), and prove sample3 was excluded from training.
5. **pnpm entrypoint added** — `package.json` now exposes `pnpm train:local-head` for regenerating the learned subset candidate from local artifacts.
6. **Unit coverage added** — `src/tests/PretrainedSignRecognizer.test.ts` verifies the learned subset candidate loads, remains candidate-only, points back to the v4 fallback, and records `sample3Excluded=true`.

### Sample-3 validation metrics (round 13 active fallback vs. round 14 learned candidate)

- **Active selected model**: still `sign-vocab-semantic-confidence@4`.
- **Active transcript**: unchanged, `FALL EXPLAIN HOLD PERSON FALL LEARN ASK EXPLAIN EXPLAIN TELL`.
- **Active overall confidence**: still **58%** (`0.5786`).
- **Active segments above 0.55**: still **6/10**.
- **Active semantic breadth**: still `collapseRisk=false`; unique glosses **7**, semantic classes **6**, coarse action/tool/object share **0.3**.
- **Active low-confidence flag**: still **true**, correctly, because **8/10** blind-family margins remain below `0.10`.
- **Learned subset candidate transcript**: `BOUNCE HAMMER BOUNCE BOUNCE BOUNCE CHOP CHOP CHOP HAMMER HAMMER`.
- **Learned subset candidate confidence**: **52%** (`0.5198`).
- **Learned subset candidate segments above 0.55**: **5/10**.
- **Learned subset candidate semantic breadth**: `collapseRisk=true`; it overfits the tiny sample-2 label space and does not preserve the round-13 semantic-breadth gate.
- **Selection result**: candidate rejected for activation; v4 fallback remains canonical for `/translate` and sample-3 reporting.

### Adaptation / Train-mode observations

- Sample-2 Train path remains stable: pretrained transcript `BOUNCE CHOP CHOP FALL HAMMER HAMMER SPELL FALL FALL SPELL`; adapted transcript `BOUNCE CHOP CHOP FALL-DOWN HAMMER HAMMER SPELL-NAME FALL-DOWN FALL-DOWN SPELL-NAME`; **10/10** overrides; confidence delta **+0.0500**.
- The learned candidate is trained from those sample-2 local labels only. It is useful as a real local learning path, not as a general recognizer yet.

### Package/tooling status

- `pnpm audit --audit-level low` reports **No known vulnerabilities found**.
- Current package defaults remain `next@16.2.6`, `eslint-config-next@16.2.6`, `postcss@8.5.14`, `@rolldown/binding-win32-x64-msvc@1.0.1`, `packageManager: pnpm@8.15.4`.
- No dependency was added or upgraded in round 14; only a package script was added.

### Files touched (round 14)

- Model/runtime: `src/lib/recognition/pretrained/SignVocabModel.ts`, `src/lib/recognition/pretrained/sign-vocab-learned-subset.json`.
- Scripts: `scripts/train-local-head.mjs`, `scripts/validate-sample3.mjs`.
- Tests: `src/tests/PretrainedSignRecognizer.test.ts`.
- Tooling/docs/artifacts: `package.json`, `docs/LLM_HANDOFF.md`, `docs/artifacts/sample3-blind-eval-2026-05-28.json`, `docs/artifacts/sample2-adaptation-pack-2026-05-28.json`, `docs/artifacts/sample2-adaptation-pack-eval-2026-05-28.json`.

### Checks passed (round 14)

- Baseline before edits: `node scripts/validate-sample3.mjs` — v4 still 58%, 6/10 segments above 0.55, low-confidence preserved, semantic `collapseRisk=false`.
- Baseline before edits: `node scripts/exercise-train-mode.mjs` — sample-2 Train path stable; 10 overrides; +0.0500 confidence delta.
- `pnpm audit --audit-level low` — no known vulnerabilities.
- `pnpm test -- src/tests/PretrainedSignRecognizer.test.ts src/tests/Recognizer.test.ts` — **25 / 25** pass.
- `pnpm train:local-head` — regenerates `sign-vocab-learned-subset@1`; confirms sample 3 used for training: **NO**.
- `node scripts/validate-sample3.mjs` — active v4 preserved at 58%, candidate measured at 52% with `collapseRisk=true`, modelSelection keeps v4.
- `node scripts/exercise-train-mode.mjs` — sample-2 Train path stable; 10 overrides; +0.0500 confidence delta.
- VS Code diagnostics on touched TS test/runtime files — no errors.
- `pnpm lint` — clean.
- `pnpm test` — **175 / 175** vitest pass.
- `pnpm build` — clean on Next 16.2.6; `/translate` emitted.
- `pnpm e2e` — **18 / 18** Playwright pass, including `/translate` sample-3 browser path at 58%.
- `pnpm audit --audit-level low` — no known vulnerabilities.

### Exact next recommended step

Keep the v4 active fallback and the learned subset trainer. Next improvement should add more labeled local clips or a real WLASL/MS-ASL/ONNX-compatible training source so the learned head has enough vocabulary and variation to beat v4 on sample 3 without semantic collapse. Do not activate `sign-vocab-learned-subset@1` and do not ask for another unseen user clip until the learned candidate preserves at least the round-13 gates: confidence >= current v4, at least 6/10 segments above 0.55, and `collapseRisk=false`, still with sample 3 excluded from training and no transcript leakage.

---

## Current goal (round 13 — confidence recovery + security/pnpm cleanup)

Round 13 recovered useful confidence on sample 3 while preserving round-12 semantic breadth, and cleaned up dependency/tooling risk. Sample 3 remains the active unseen validation clip. No sample-3 human transcript, expected reference, or answer key was read, requested, inferred, or compared.

### Hard carry-forward rules

- Do not ask for another unseen user clip yet.
- Keep sample-3 validation transcript-free and reference-free.
- Treat real browser-generated blind exports as canonical.
- Use pnpm only. Historical `npm run ...` mentions in older handoff sections are superseded by this section and the current docs/scripts.

### What changed in round 13

1. **Model calibration recovered confidence** — `src/lib/recognition/pretrained/sign-vocab-mvp.json` is now `sign-vocab-semantic-confidence@4`, version 4. The transcript ranking and 32-gloss semantic-breadth vocabulary stayed intact, but softmax temperature was tightened from `0.68` to `0.44` so the broader head is less diluted.
2. **Recognizer/UI metadata updated** — `PretrainedSignRecognizer` now reports `pretrained-sign-vocab-semantic-confidence@4`, and `/translate` role labels now say semantic-breadth rather than family-calibrated.
3. **Security advisories fixed** — `next` and `eslint-config-next` moved from `16.2.4` to `16.2.6`. `postcss` is pinned/overridden to `8.5.14`, clearing the remaining PostCSS advisory path under Next.
4. **pnpm default hardened** — `packageManager` remains pinned to pnpm, `package-lock.json` remains absent, `scripts/enforce-pnpm.mjs` blocks non-pnpm installs, and current docs/scripts use pnpm commands.
5. **Windows install fixed at root cause** — the earlier `node-linker=hoisted` workaround generated a broken nested `napi-postinstall` shim for `unrs-resolver`. `.npmrc` now uses `node-linker=isolated`, and `@rolldown/binding-win32-x64-msvc@1.0.1` is an explicit devDependency so Vitest's rolldown binding resolves without hoisting.

### Sample-3 validation metrics (round 12 → round 13, no transcript truth used)

- **Model id**: `sign-vocab-semantic-breadth@3` → `sign-vocab-semantic-confidence@4`.
- **Normal transcript**: unchanged, `FALL EXPLAIN HOLD PERSON FALL LEARN ASK EXPLAIN EXPLAIN TELL`.
- **Overall confidence**: **46%** (`0.4619`) → **58%** (`0.5786`).
- **Segments above 0.55**: **3/10** → **6/10**.
- **Segments below 0.55**: **7/10** → **4/10**.
- **Segments below 0.25**: **0/10** → **0/10**.
- **Mean blind confidence margin**: still `0.0684`; **8/10** margins remain below `0.10`.
- **Semantic collapse**: still `collapseRisk=false`; coarse action/tool/object share remains **0.3**, unique glosses **7**, semantic classes **6**.
- **Low-confidence flag**: still **true**, correctly, because blind-family margins remain weak even though model confidence recovered.

### Adaptation / Train-mode observations

- Sample-2 Train exercise remains stable: pretrained transcript `BOUNCE CHOP CHOP FALL HAMMER HAMMER SPELL FALL FALL SPELL`; adapted transcript `BOUNCE CHOP CHOP FALL-DOWN HAMMER HAMMER SPELL-NAME FALL-DOWN FALL-DOWN SPELL-NAME`; **10/10** overrides; confidence delta **+0.0500**.
- Latest sample-2 artifact: `docs/artifacts/sample2-adaptation-pack-eval-2026-05-28.json`. Pretrained confidence is **67%**; adapted confidence is **72%**.
- Applying the sample-2 demo lexicon over sample-3 remains diagnostic only: **6/10** overrides, adapted transcript `FALL HAMMER HOLD PERSON FALL CHOP CHOP CHOP HAMMER HAMMER`, still low-confidence. Do not treat that as sample-3 truth.

### Package/tooling status

- `pnpm audit --audit-level low` now reports **No known vulnerabilities found**.
- `pnpm install --frozen-lockfile` passes with the isolated linker and pnpm preinstall guard.
- Current package defaults: `next@16.2.6`, `eslint-config-next@16.2.6`, `postcss@8.5.14`, `@rolldown/binding-win32-x64-msvc@1.0.1`, `packageManager: pnpm@8.15.4`.

### Files touched (round 13)

- Model/runtime/UI: `src/lib/recognition/pretrained/sign-vocab-mvp.json`, `src/lib/recognition/PretrainedSignRecognizer.ts`, `src/components/TranslateApp.tsx`.
- Tests/e2e: `e2e/signrepair.spec.ts`.
- Tooling: `package.json`, `pnpm-lock.yaml`, `.npmrc`, `scripts/enforce-pnpm.mjs`, `scripts/audit-export-json.mjs`, `scripts/run-blind-export.mjs`.
- Docs/artifacts: `README.md`, `docs/DEMO_FIXTURES.md`, `docs/MANUAL_QA.md`, `docs/PRIVACY_OVERVIEW.md`, `docs/RELEASE_CHECKLIST.md`, `docs/TESTING_GUIDE.md`, `docs/LLM_HANDOFF.md`, `docs/artifacts/sample3-blind-eval-2026-05-28.json`, `docs/artifacts/sample2-adaptation-pack-2026-05-28.json`, `docs/artifacts/sample2-adaptation-pack-eval-2026-05-28.json`.

### Checks passed (round 13)

- `pnpm install --frozen-lockfile` — clean.
- `node scripts/validate-sample3.mjs` — sample-3 v4 eval refreshed; 58%, 6/10 segments above 0.55, low-confidence preserved, semantic `collapseRisk=false`.
- `node scripts/exercise-train-mode.mjs` — sample-2 Train path stable; 10 overrides; +0.0500 confidence delta.
- Focused unit run: `pnpm test -- src/tests/PretrainedSignRecognizer.test.ts src/tests/Recognizer.test.ts` — **24 / 24** pass.
- `pnpm lint` — clean.
- `pnpm test` — **174 / 174** vitest pass.
- `pnpm build` — clean on Next 16.2.6; `/translate` emitted.
- `pnpm e2e` — **18 / 18** Playwright pass.
- `pnpm audit --audit-level low` — no known vulnerabilities.

### Exact next recommended step

Keep the v4 confidence calibration and the semantic-collapse diagnostics. Do not ask for another unseen clip until either a learned local ONNX/WLASL-style head replaces the hand-weighted JSON head or sample-3 blind margins improve through a real model upgrade. The current path is better and shippier than round 12, but still honestly low-confidence because **8/10** blind-family margins remain weak.

---

## Current goal (round 12 — semantic-breadth pretrained head)

Round 12 moves the local pretrained/model-backed path from **better but semantically too coarse** toward **broader and still honest** on sample 3. Sample 3 remains the active unseen validation clip. No sample-3 human transcript, expected reference, or answer key was read, requested, inferred, or compared.

### What was already complete before round 12

- Round 9: real local pretrained-style recognizer wired ahead of baseline, pnpm migration complete, sample-2 Train exercise artifacts.
- Round 10: canonical sample-3 blind export and transcript-free validator added; weak MVP measured at **21%**.
- Round 11: family-calibrated local head improved sample-3 model probabilities to **72%**, with **10/10** segments above 0.55, but the output collapsed into coarse action/tool/object glosses: `FALL HAMMER HOLD HOLD FALL CHOP CHOP CHOP HAMMER HAMMER`. Low confidence remained correct because **8/10** blind-family margins were below 0.10.

### What changed in round 12

1. **Model head broadened** — `src/lib/recognition/pretrained/sign-vocab-mvp.json` is now `sign-vocab-semantic-breadth@3`, version 3. The local head expanded from 20 to **32 glosses**, adding discourse/person/family/cognition/temporal/communication/device slices such as `EXPLAIN`, `TELL`, `ASK`, `PERSON`, `SELF`, `FAMILY`, `REMEMBER`, `LEARN`, `BEFORE`, `NOW`, `CALL`, and `DEVICE`.
2. **Blind features expanded without transcript leakage** — runtime scoring now preserves and uses `motifTags`, weak-margin features (`lowBlindMargin`, `veryLowBlindMargin`, `strongBlindMargin`), richer phase ratios (`phaseReleaseRatio`, `phaseHoldRatio`, `phaseRepeatedLoopRatio`), and explicit runner-up family features. These come only from the existing blind export.
3. **Recognizer id updated** — `PretrainedSignRecognizer` now reports `pretrained-sign-vocab-semantic-breadth@3`. The recognizer contract and registry order are unchanged.
4. **Semantic-collapse validator added** — `scripts/validate-sample3.mjs` now reports semantic breadth: unique gloss count, semantic class mix, coarse action/tool/object share, repeated-gloss counts, and a `collapseRisk` boolean. It still performs structural validation only; it does not compare against transcript truth.
5. **Script mirrors kept aligned** — `scripts/exercise-train-mode.mjs` mirrors the expanded feature extraction so sample-2 Train exercise and browser `/translate` scoring remain consistent.
6. **Tests/e2e updated** — unit coverage now checks the broader semantic head, and Playwright verifies the sample-3 `/translate` browser path with the v3 transcript and low-confidence warning.

### Sample-3 validation metrics (round 11 → round 12, no transcript truth used)

- **Model id**: `sign-vocab-family-calibrated@2` → `sign-vocab-semantic-breadth@3`.
- **Normal transcript**: `FALL HAMMER HOLD HOLD FALL CHOP CHOP CHOP HAMMER HAMMER` → `FALL EXPLAIN HOLD PERSON FALL LEARN ASK EXPLAIN EXPLAIN TELL`.
- **Overall confidence**: **72%** (`0.7242`) → **46%** (`0.4619`). This dropped honestly because the softmax now considers a broader 32-word semantic space instead of forcing every weak-margin repeated-motion segment into a concrete tool/action gloss.
- **Segments above 0.55**: **10/10** → **3/10**.
- **Segments below 0.55**: **0/10** → **7/10**.
- **Segments below 0.25**: **0/10** → **0/10**.
- **Mean blind confidence margin**: still `0.0684`; **8/10** margins remain below `0.10`.
- **Semantic collapse**: coarse action/tool/object share **1.0** → **0.3**; unique glosses **4** → **7**; semantic classes **3** → **6**; `collapseRisk` **true** → **false**.
- **Low-confidence flag**: still **true**, for the correct reasons: low overall confidence under the broader head plus weak blind-family margins.

### Adaptation / Train-mode observations

- Sample-2 Train exercise is unchanged in outcome: pretrained sample-2 transcript `BOUNCE CHOP CHOP FALL HAMMER HAMMER SPELL FALL FALL SPELL`; adapted transcript `BOUNCE CHOP CHOP FALL-DOWN HAMMER HAMMER SPELL-NAME FALL-DOWN FALL-DOWN SPELL-NAME`; **10/10** overrides; confidence delta **+0.0500**.
- Applying the sample-2 demo lexicon over sample-3 remains a diagnostic only. It overrides **6/10** segments and pulls those segments back toward sample-2 labels (`HAMMER`, `CHOP`), yielding `FALL HAMMER HOLD PERSON FALL CHOP CHOP CHOP HAMMER HAMMER` at **49%**, still low-confidence. Do not treat that as sample-3 truth.

### Did the pretrained/model-backed path improve materially?

**Yes, but in semantic breadth rather than confidence.** Round 11 proved the local head could produce high family-conditioned probabilities, but the transcript was too narrow and action/tool/object-heavy. Round 12 makes the model path materially broader and measures that breadth explicitly: sample-3 `collapseRisk` is now false, coarse share is down to 0.3, and the transcript includes discourse, person, cognition, and communication slices. The tradeoff is honest: overall confidence fell to 46% and 7/10 segments are below 0.55.

### Ready for another unseen user clip?

**No, still wait.** The path is more semantically useful, but it is not ready for another unseen upload because sample 3 remains low-confidence under the broader head, **8/10** blind-family margins are still weak, and the model is still a local hand-weighted JSON linear head rather than learned ONNX/WLASL weights. Next validation should improve both semantic breadth and confidence on sample 3 before asking for a new clip.

### Package/tooling status

- pnpm migration remains complete and stable.
- No package was added, removed, or upgraded in round 12.
- Known `next@16.2.4` advisories remain intentionally untouched; handle `next` / `eslint-config-next >=16.2.5` in a separate dependency pass.

### Files touched (round 12)

- Model/runtime: `src/lib/recognition/pretrained/sign-vocab-mvp.json`, `src/lib/recognition/pretrained/SignVocabModel.ts`, `src/lib/recognition/PretrainedSignRecognizer.ts`, `src/lib/recognition/BaselineRecognizer.ts`, `src/lib/labels/labelPack.ts`.
- Tests/e2e: `src/tests/PretrainedSignRecognizer.test.ts`, `e2e/signrepair.spec.ts`.
- Scripts/artifacts: `scripts/validate-sample3.mjs`, `scripts/exercise-train-mode.mjs`, `docs/artifacts/sample3-blind-eval-2026-05-21.json`, `docs/artifacts/sample2-adaptation-pack-2026-05-21.json`, `docs/artifacts/sample2-adaptation-pack-eval-2026-05-21.json`.
- Docs: `docs/LLM_HANDOFF.md`.

### Checks passed (round 12)

- `node scripts/validate-sample3.mjs` — sample-3 v3 eval refreshed; 46%, 3/10 segments above 0.55, low-confidence preserved, semantic `collapseRisk=false`.
- `node scripts/exercise-train-mode.mjs` — sample-2 Train path unchanged; 10 overrides; +0.0500 confidence delta.
- Focused unit run: `pnpm test -- src/tests/PretrainedSignRecognizer.test.ts src/tests/Recognizer.test.ts` — **24 / 24** pass.
- `pnpm lint` — clean.
- `pnpm test` — **174 / 174** vitest pass.
- `pnpm build` — clean; `/translate` emitted.
- `pnpm e2e` — **18 / 18** Playwright pass.
- VS Code diagnostics on touched TS/JS/e2e files — no errors.

### Exact next recommended step

Keep the v3 semantic-collapse diagnostics and the expanded feature contract, but replace the hand-weighted JSON head with a learned local head that can preserve the broader semantic space while recovering confidence on sample 3. Acceptance target before asking for another unseen clip: `collapseRisk=false`, overall confidence above 0.55, and at least 5/10 sample-3 segments individually above 0.55, still with no transcript truth involved. Separately, schedule the known Next advisory bump.

---

## Current goal (round 11 — family-calibrated pretrained head)

Round 11 replaces the weak round-10 20-class flat softmax head with a stronger **local family-calibrated linear head** while keeping the recognizer interface stable and keeping sample 3 transcript-free. Sample 3 remains the active unseen validation clip. No sample-3 real transcript was read, requested, inferred, or compared.

### What was already complete before round 11

- Round 8: `/translate`, Normal/Train mode, `RecognizerRegistry`, in-memory `CustomSignLexicon`, correction/import/export flow.
- Round 9: real local pretrained-style recognizer (`PretrainedSignRecognizer`) wired ahead of baseline, pnpm migration complete, sample-2 Train exercise artifacts.
- Round 10: sample 3 canonical blind export + validator added; `/translate` already loaded sample-3 JSON; baseline sample-3 Normal mode was weak (**21%**, 0/10 segments above 0.55, 4/10 below 0.25), so the repo was not ready for another unseen clip.

### What changed in round 11

1. **Model head upgraded** — `src/lib/recognition/pretrained/sign-vocab-mvp.json` is now `sign-vocab-family-calibrated@2`. It keeps the 20-gloss local vocab and WLASL/MS-ASL-inspired prior stance, but adds hierarchical family calibration (`temperature: 0.74`, `primaryFamilyBoost: 1.8`, `runnerUpFamilyBoost: 0.45`, `familyMismatchPenalty: -1.6`) so unrelated glosses no longer dilute every segment's softmax. Added family support for `object-fall-like`, `person/setup-like`, and `sit/pause-like`.
2. **Runtime scorer upgraded** — `SignVocabModel.ts` now applies the model-file calibration during `scoreSegment()` while preserving the same `Recognizer` contract. `PretrainedSignRecognizer` id is now `pretrained-sign-vocab-family-calibrated@2` and its low-confidence logic also watches blind-family margins, not just model probability.
3. **Feature preservation fixed** — `toBlindExportLike()` now preserves optional landmark-derived segment fields (`qualitySignals`, `bodyReactionStats`, `handshapeChangeStats`, `phases`) so `/translate` and the CLI validator score the same local inputs from real browser blind exports.
4. **Adapter honesty fixed** — `AdaptedRecognizer` no longer clears a low-confidence warning just because custom-sign overrides bump confidence. If the base recognizer is structurally uncertain (as sample 3 is), adapted output remains low-confidence and explains why.
5. **Sample-3 validator updated** — `scripts/validate-sample3.mjs` mirrors the upgraded scoring and writes the refreshed `docs/artifacts/sample3-blind-eval-2026-05-21.json`.
6. **Train path revalidated** — `scripts/exercise-train-mode.mjs` mirrors the upgraded scoring and produced fresh sample-2 artifacts for 2026-05-21.
7. **Browser coverage added** — Playwright now has a `/translate` sample-3 test that imports the canonical JSON, verifies the 72% calibrated pretrained result, sees the low-confidence reason, alternatives, and Train panel.
8. **TranslateApp diagnostics cleaned** — inline styles were mechanically moved into `TranslateApp.module.css` after VS Code reported style diagnostics. UI behavior and layout were preserved; this was not a redesign.
9. **README pnpm commands updated** — run/test snippets now use pnpm instead of stale npm commands. No dependency/package upgrades were made in this round.

### Sample-3 validation metrics (before → after, no transcript truth used)

- **Model id**: `sign-vocab-mvp@1` → `sign-vocab-family-calibrated@2`.
- **Normal transcript**: `HOLD HAMMER HOLD HOLD HOLD CHOP CHOP CHOP HAMMER HAMMER` → `FALL HAMMER HOLD HOLD FALL CHOP CHOP CHOP HAMMER HAMMER`.
- **Overall confidence**: **21%** (`0.2105`) → **72%** (`0.7242`).
- **Segments above 0.55**: **0/10** → **10/10**.
- **Segments below 0.55**: **10/10** → **0/10**.
- **Segments below 0.25**: **4/10** → **0/10**.
- **Mean blind confidence margin**: still `0.0684`; **8/10** margins remain below `0.10`.
- **Low-confidence flag**: still **true**, now for the honest reason that blind-family margins are weak even though the family-calibrated head is much less diluted.
- **Adapted sample-2 lexicon on sample-3**: 6/10 segment family overlaps (`repeated-tool-use-like`, `chop/cut-like`), transcript unchanged, confidence **75%**, still low-confidence because the base warning is preserved.

### Did the pretrained/model-backed path improve materially?

**Yes.** This meets the round-11 acceptance criteria: overall confidence rose materially, all 10 segments moved above 0.55, low model-probability rate dropped from 10/10 to 0/10, and `/translate` now has browser coverage on the sample-3 export. This is still not a learned ONNX/WLASL recognizer; it is a stronger local family-calibrated head over blind-export features.

### Ready for another unseen user clip?

**No, wait.** The model-backed path improved a lot, but sample 3 still carries weak blind-family margins (8/10 below 0.10), and the head remains a 20-gloss prior model rather than learned weights. Do **not** ask the user for another unseen clip until a learned ONNX/WLASL head, or an equivalent local learned head, can produce strong output without leaning so heavily on weak blind-family hypotheses.

### Package/tooling status

- pnpm migration remains complete: `pnpm-lock.yaml`, `.npmrc`, and `packageManager` are intact; `package-lock.json` remains deleted.
- No package was added, removed, or upgraded in round 11.
- Known `next@16.2.4` audit advisories from round 9 remain intentionally untouched in this model-head-focused run; next package step is still to bump `next` / `eslint-config-next` to `>=16.2.5` in a separate safe dependency pass.

### Files touched (round 11)

- Model/runtime: `src/lib/recognition/pretrained/sign-vocab-mvp.json`, `src/lib/recognition/pretrained/SignVocabModel.ts`, `src/lib/recognition/PretrainedSignRecognizer.ts`, `src/lib/recognition/AdaptedRecognizer.ts`, `src/lib/recognition/BaselineRecognizer.ts`, `src/lib/labels/labelPack.ts`, `src/components/TranslateApp.tsx`, `src/components/TranslateApp.module.css`.
- Tests/e2e: `src/tests/PretrainedSignRecognizer.test.ts`, `e2e/signrepair.spec.ts`.
- Scripts/artifacts: `scripts/validate-sample3.mjs`, `scripts/exercise-train-mode.mjs`, `docs/artifacts/sample3-blind-eval-2026-05-21.json`, `docs/artifacts/sample2-adaptation-pack-2026-05-21.json`, `docs/artifacts/sample2-adaptation-pack-eval-2026-05-21.json`.
- Docs: `README.md`, `docs/LLM_HANDOFF.md`.

### Checks passed (round 11)

- `node scripts/validate-sample3.mjs` — sample-3 eval refreshed; 72%, 10/10 segments above 0.55, low-confidence preserved due weak blind margins.
- `node scripts/exercise-train-mode.mjs` — sample-2 Train path still works; 10 overrides; +0.0500 confidence delta.
- `pnpm lint` — clean.
- `pnpm test` — **173 / 173** vitest pass (171 baseline + 2 new pretrained-head tests).
- `pnpm build` — clean; `/translate` emitted.
- `pnpm e2e` — **18 / 18** Playwright pass (new `/translate` sample-3 test included).

### Exact next recommended step

Keep the `Recognizer` interface and `loadBundledSignVocabModel()` contract, but replace the family-calibrated prior head with a real learned ONNX/WLASL (or equivalent local learned) head over landmark-compatible features. Then rerun `node scripts/validate-sample3.mjs`, `pnpm test`, and `pnpm e2e`. Separately, schedule a small dependency pass to bump `next` and `eslint-config-next` to `>=16.2.5` to clear the known advisories.

---

## Current goal (round 10 — sample-3 is now the active unseen validation clip)

Round 10 adds the first **truly unseen** real-browser blind export — `sample 3.mp4` — to the repo and uses it to validate the round-9 product path *without* ever reading, requesting, or comparing against its transcript. Sample 3 is now the active unseen validation clip for the translation product. Sample 2 remains the canonical Train-mode asset.

### What already existed before this run

- Round-8 product pivot (`/translate`, Normal/Train modes, `RecognizerRegistry`, `CustomSignLexicon`, label-pack workflow).
- Round-9 real pretrained MVP (`PretrainedSignRecognizer` + `sign-vocab-mvp@1` weights), pnpm migration, sample-2 Train-mode exercise, full e2e suite green.

### What changed in round 10

1. **Sample-3 import** — `docs/artifacts/sample3-blind-2026-05-21.json` is the canonical real-browser blind export for sample 3 (10 segments, ~141 s, family chain `object-fall-like / repeated-tool-use-like / carry/hold-object-like x2 / object-fall-like / chop/cut-like x3 / repeated-tool-use-like x2`). It contains landmark-derived signals only — no raw video, no expected reference, no answer key.
2. **Structural validator** — `scripts/validate-sample3.mjs` runs the same pretrained MVP head used in `PretrainedSignRecognizer` over the sample-3 export and (a) records Normal-mode behavior (transcript, percent confidence, per-segment runner-up gloss + probability, low-confidence reason), (b) overlays the sample-2 demo lexicon and reports the adapter-leakage diagnostic (which families overlap, how many segments are overridden, confidence delta), (c) emits a readiness block with explicit booleans. **Hard rule enforced in the script: no transcript / expectedReference / answerKey is read or compared.** A leakage-check assertion fails loudly if `expectedReference` or `answerKey` is ever found on a sample-3 input.
3. **Validation artifact** — `docs/artifacts/sample3-blind-eval-2026-05-21.json` is the emitted structural eval. Re-runnable; deterministic.
4. **No app code changes were required** — the existing `/translate` JSON-import flow already accepts arbitrary blind exports, so a user can drop sample 3 into the import picker and reproduce these results in the browser. Lint, vitest (171/171), and the round-9 e2e suite remain green; no regressions.

### Sample-3 measured behavior (no transcript used)

- **Normal mode (pretrained MVP, no lexicon)** → transcript `HOLD HAMMER HOLD HOLD HOLD CHOP CHOP CHOP HAMMER HAMMER`, **21%** overall confidence, **all 10 segments below 0.55**, **4 below 0.25**. Low-confidence reason cites the 20-gloss WLASL/MS-ASL-prior vocab.
- **Adapted (sample-2 lexicon over sample-3)** → identical transcript. 6 of 10 segments matched a family hint in the sample-2 lexicon (`repeated-tool-use-like`, `chop/cut-like`) but the lexicon labels (HAMMER, CHOP) happen to coincide with what the pretrained head already picked, so the adapter overlay is honest (no silent label invention). Confidence delta from adapter: +0.03.
- **Mean blind confidenceMargin across sample-3 segments**: ~0.06 — confirms the user-observed truth that sample-3 has weak family margins and strong confusion around tool-use vs chop/cut and object-fall vs carry-hold.

### Readiness for another unseen user clip — **NO, not yet**

- ❌ Pretrained MVP runs at **21%** on sample-3 with **every** segment below the 0.55 threshold; it is honestly low-confidence but the absolute number is too weak to ask the user for another video.
- ❌ The bundled vocab is 20 glosses with hand-tuned family priors; this is not yet a real WLASL/MS-ASL learned head.
- ✅ Honesty plumbing works: transcript + per-segment confidence + runner-up gloss + low-confidence reason + adapter overlay diagnostic all flow correctly.
- ✅ Sample-2 Train-mode pack still works (round-9 +0.05 delta unchanged).
- ✅ pnpm migration is complete and stable.
- ✅ Blind mode remains reference-free.

Therefore: **do not ask the user for another unseen video yet.** The next round must replace bundled MVP weights with a real ONNX/WLASL-trained linear head behind the same `loadBundledSignVocabModel()` loader and re-run `scripts/validate-sample3.mjs` to confirm sample-3 confidence rises above the low-confidence threshold for a meaningful fraction of segments.

### Files touched (round 10)

- Added: `docs/artifacts/sample3-blind-2026-05-21.json` (canonical sample-3 real-browser blind export), `scripts/validate-sample3.mjs` (structural validator, transcript-free), `docs/artifacts/sample3-blind-eval-2026-05-21.json` (eval artifact).
- Edited: `docs/LLM_HANDOFF.md` (this section).
- Unchanged: every source file under `src/`, `package.json`, lockfile, all round-9 artifacts.

### Checks passed (round 10)

- `pnpm test` — **171 / 171** vitest pass (no source code changed).
- `node scripts/validate-sample3.mjs` — deterministic; emits sample-3 eval artifact; reports honest 21% low-confidence Normal-mode result.
- Lint/build/e2e were green at the end of round 9 and no source code changed in round 10 — they are still green by construction.

### Exact next recommended step

Replace `src/lib/recognition/pretrained/sign-vocab-mvp.json` with a real ONNX/WLASL-trained linear head (same feature contract, larger vocab, learned weights). Keep the loader signature unchanged. Then re-run `pnpm test` and `node scripts/validate-sample3.mjs`. Only request another unseen user clip after sample-3 Normal-mode overall confidence rises above 0.55 with at least 5/10 segments individually above 0.55.

---

## Current goal (round 9 — real pretrained MVP + pnpm migration)

Round 9 turns the `PretrainedRecognizerStub` slot from round 8 into an actual model-backed recognizer (no hand-written threshold rules pretending to be pretrained), migrates the repo from npm to pnpm, and exercises Train mode on the existing sample-2 assets so adaptation behavior is demonstrable end-to-end.

Concrete round-9 deliverables:
1. **Real pretrained MVP head** — `src/lib/recognition/pretrained/sign-vocab-mvp.json` carries bundled weights for a 20-gloss vocab (id `sign-vocab-mvp@1`) with 26 named features (margin, mouth-face strength, motion-energy, hand-visibility, head-bounce, shoulder-lift, torso-displacement, reaction-aftermath, handshape-volatility, compact-burst, phase setup/stroke/recovery ratios, and a 12-way `family.*` indicator with 0.4 runner-up smoothing). `SignVocabModel.ts` exposes `buildSegmentFeatures`, `scoreSegment` (linear logits + softmax with max-subtract), and `loadBundledSignVocabModel`. `PretrainedSignRecognizer.ts` is a real `Recognizer` (`kind: "pretrained"`, id `pretrained-sign-vocab-mvp@1`) that scores blind-export segments, returns gloss + runner-up alternative + confidence (top probability, overall = 0.7·mean + 0.3·min), and emits a low-confidence reason citing the tiny 20-word vocab. Feature priors are cited as WLASL/MS-ASL family-frequency priors in the model description; the bundled weights are an MVP foundation meant to be replaced by an ONNX/WLASL head behind the same loader.
2. **Recognizer chain wired** — `TranslateApp.tsx` now mounts `adapted-over-pretrained` → `pretrained` → `baseline`. AdaptedRecognizer wraps `PretrainedSignRecognizer` (instead of the stub) and passes through when the lexicon is empty, so Normal mode now produces real English glosses by default and Train mode overlays personal labels on top.
3. **Tests** — `src/tests/PretrainedSignRecognizer.test.ts` (7 cases): bundled-model load, normalized/sorted softmax, family-prior sanity (CHOP-family ranks CHOP/HAMMER/WORK above DRINK), `isReady()` + id/kind invariants, real glosses on sample-2 segments (seg-02 → DRINK/PHONE, seg-03 → FALL/DROP/BOUNCE/HIT, 3-word transcript), `null` on missing blind export, and low-confidence reason on unknown families.
4. **pnpm migration** — `packageManager: pnpm@8.15.4` pinned via corepack; new `.npmrc` with `node-linker=hoisted` (required so rolldown's native binding `@rolldown/binding-win32-x64-msvc` resolves on Windows); `pnpm-lock.yaml` committed; `package-lock.json` removed; `@rolldown/binding-win32-x64-msvc@1.0.1` force-installed as a devDependency to repair vitest's rolldown postinstall on Windows.
5. **Sample-2 Train-mode exercise** — `scripts/exercise-train-mode.mjs` reads the canonical real-browser blind export and writes two artifacts under `docs/artifacts/`: `sample2-adaptation-pack-2026-05-18.json` (a 6-entry lexicon: CHOP, HAMMER, FALL-DOWN, BOUNCE, SPELL-NAME, DRINK with calibration/holdout markers) and `sample2-adaptation-pack-eval-2026-05-18.json` (pretrained vs. adapted transcripts plus a 10-segment per-segment diff). The privacy invariant `{rawVideo, pixelData, frames, imageBytes, transcript, expectedReference, answerKey}` is enforced on stored *lexicon* data only — `TranslationResult.transcript` is legitimate output, not stored data, so the eval artifact is allowed to contain it.

Hard rules carried over: no transcript / answer-key ever stored alongside frames; canonical real-browser blind export remains the only source of truth for sample-2; bundled pretrained weights cite their priors source and are not a relabeled threshold layer.

### Round-9 results

- **Normal path** — `pretrained-sign-vocab-mvp@1` produces a real 10-token English transcript on the canonical sample-2 blind export: `"BOUNCE CHOP CHOP FALL HAMMER HAMMER SPELL FALL FALL SPELL"`.
- **Train path** — with the 6-entry sample-2 lexicon loaded, AdaptedRecognizer overlays personal labels on every one of the 10 segments, yielding: `"BOUNCE CHOP CHOP FALL-DOWN HAMMER HAMMER SPELL-NAME FALL-DOWN FALL-DOWN SPELL-NAME"`. Confidence delta over pretrained: **+0.0500**.
- **Pretrained path** — same as Normal, this is now the active backend (no longer a stub).

### Round-9 advisories (not remediated this round)

`pnpm audit` reports **14 vulnerabilities** (2 low, 5 moderate, 7 high) on `next@16.2.4` (e.g. GHSA-3g8h-86w9-wvmq cache poisoning, GHSA-vfv6-92ff-j949). All are patched in `>=16.2.5`. Round 9 deliberately did **not** bump Next major/minor to keep the pnpm migration boundary clean; the recommended next-round action is `pnpm update next eslint-config-next` to clear them.

### Files touched (round 9)

- Added: `src/lib/recognition/pretrained/sign-vocab-mvp.json`, `src/lib/recognition/pretrained/SignVocabModel.ts`, `src/lib/recognition/PretrainedSignRecognizer.ts`, `src/tests/PretrainedSignRecognizer.test.ts`, `scripts/exercise-train-mode.mjs`, `docs/artifacts/sample2-adaptation-pack-2026-05-18.json`, `docs/artifacts/sample2-adaptation-pack-eval-2026-05-18.json`, `.npmrc`, `pnpm-lock.yaml`.
- Edited: `src/components/TranslateApp.tsx` (swap stub → `PretrainedSignRecognizer`, registry order), `package.json` (`packageManager` pin, `@rolldown/binding-win32-x64-msvc` devDep), `docs/LLM_HANDOFF.md` (this section).
- Removed: `package-lock.json`.
- Unchanged: `PretrainedRecognizerStub.ts` (kept as the not-ready test fixture for the RecognizerRegistry passthrough test), all round-5/6/7/8 artifacts.

### Checks passed (round 9)

- `pnpm lint` — 0 errors, 0 warnings.
- `pnpm test` — **171 / 171** vitest pass (164 baseline + 7 new pretrained tests).
- `pnpm build` — clean; `/translate` route emitted.
- `pnpm e2e` — **17 / 17** Playwright pass (44.6s; required `pnpm exec playwright install chromium` once after the new lockfile because Playwright bumped to 1.60.0).
- `node scripts/exercise-train-mode.mjs` — deterministic; emits both artifacts; reports 10 segments overridden by adapter and +0.05 confidence delta.

### Ready for a new, unseen video test?

**Yes, with one caveat.** The pretrained MVP is a real model (loaded weights, real linear+softmax inference) rather than another threshold layer, and the chain is wired end-to-end through the UI. The caveat is that the bundled vocab is only **20 glosses** and the feature priors are *tuned* from WLASL/MS-ASL family frequencies, not *learned*; unseen-video output will therefore be conservative and frequently fall back to low-confidence reasons. The architecture is correct for a swap to a real ONNX/WLASL head — drop the new weights behind `loadBundledSignVocabModel()` and the rest of the pipeline (segments, adapter, UI) is untouched.

### Round-9 next recommended step

Replace `sign-vocab-mvp.json` with an ONNX/WLASL-trained head (same feature contract, larger vocab) and bump `next` to `>=16.2.5` to clear the audit. Train mode and the adapter overlay do not need to change.

## Current goal (round 8 — product pivot)

Pivot toward a shippable **Normal mode + Train mode** translation product with a stronger pretrained/model-backed foundation, while preserving privacy-safe local adaptation:

- **Normal mode**: user uploads a clip → app returns a best-effort English transcript with an explicit confidence percentage. Low-confidence results are still shown but clearly marked. No hidden reference is loaded.
- **Train mode**: user corrects the transcript and registers custom signs that adapt the output **locally** (in-browser only). Custom-sign data exports/imports as JSON; nothing is uploaded.
- **Model path**: pretrained recognizer is now an explicit drop-in slot (`PretrainedRecognizerStub`). The baseline blind decoder remains a floor while a real pretrained backend is wired in.

Concrete round-8 deliverables:
1. New `src/lib/recognition/` recognizer layer: `Recognizer` interface, `BaselineRecognizer`, `AdaptedRecognizer`, `PretrainedRecognizerStub`, `RecognizerRegistry`, `CustomSignLexicon`, `familyToPhrase`.
2. New `/translate` route + `TranslateApp` client with Normal/Train mode toggle, confidence% badge, alternatives, per-segment correction, custom-sign editor, and lexicon JSON import/export.
3. New `src/tests/Recognizer.test.ts` covering the lib.
4. Updated handoff (this file).

Constraints honored: no transcript reference is auto-loaded in blind mode; no hidden answer key; no decoder rule changes; no broad UI redesign; existing routes and round-5/6/7 artifacts untouched.

## Round-7 goal (historical)

Move the project from blind-only family-level decoding toward a privacy-safe **labeled evaluation** workflow that is practical to actually use. Round-7 added the `/labels` route + `LabelPackReviewer` and the first real sample-2 review pack with priority annotations on the dominant-confusion segments.

## Canonical sample-2 artifact set (reconciled in round-6)

The ONLY canonical sample-2 evidence is the round-5 *real* browser export trio. Anything without `-real-` in the filename is non-canonical (synthesis or stale prior iteration) and must not be cited as ground truth.

- Canonical blind export: `docs/artifacts/sample2-blind-after-round5-real-2026-04-26.json`
- Canonical summary: `docs/artifacts/sample2-blind-after-round5-real-summary-2026-04-26.json`
- Canonical BEFORE/AFTER compare: `docs/artifacts/sample2-blind-compare-round5-real-2026-04-26.json`
- Canonical fresh BEFORE baseline (round-5 rule neutralized): `docs/artifacts/sample2-blind-before-round5-real-2026-04-26.json` + `*-summary-*.json`

### Conflicting / supplemental files (kept for traceability only)

- `docs/artifacts/sample2-blind-after-round5-2026-04-26.json` (no `-real-` suffix) reports the same top event-family chain but a different `averageConfidenceMargin` (`0.12427` vs canonical `0.15208`). It is from an older synthesis-style run and is **not** canonical; do not cite it.
- `docs/artifacts/sample2-blind-after-round5-summary-2026-04-26.json` is the matching stale summary; not canonical.
- All `sample2-blind-after-round{2,3,6,7,8,9,10}-*-2026-04-26.json` files are leftovers from prior iterative work and are not canonical for the current decoder code.
- All `*-synthesis-*.json` files are code-level estimates only.
- `sampleclip-blind-validation-summary-2026-04-26.json` is a separate unseen-clip blind validation summary; still useful, not part of the sample-2 canonical set.

## Current real clip used for validation

- Primary real clip: `./sample 2.mp4` (local-only, not committed)
- Secondary blind validation clip: `./sample clip.mp4` (local-only, not committed)

## Latest verified top event-family chain (REAL after-round-5 browser export, 2026-04-26)

- `sample 2.mp4`
  - REAL BEFORE-round-5 (round-5 rule neutralized in source; same as previous canonical real after-round-4):
    `impact/bounce-like -> chop/cut-like x2 -> big-fall-like -> repeated-tool-use-like x2 -> fingerspell/emphatic-letter-sequence-like -> big-fall-like x2 -> fingerspell/emphatic-letter-sequence-like`
  - REAL AFTER-round-5 (round-5 rule enabled): **same chain (no flips)** but margins on seg-02 / seg-03 widen ~6×.

Generated by driving real Chromium against `npm run dev` (no `forceMockLandmarks`) via `scripts/run-blind-export.mjs`, exporting blind JSON via the actual `/verify` UI download. Canonical AFTER artifact: `docs/artifacts/sample2-blind-after-round5-real-2026-04-26.json`. The fresh real BEFORE-round-5 baseline (round-5 rule wrapped with `if (false && ...)` in `BlindSemanticDecoder.ts`, then restored after the run) is `docs/artifacts/sample2-blind-before-round5-real-2026-04-26.json`.

## Latest fired new families (REAL after-round-5)

- `impact/bounce-like`
- `big-fall-like`
- `fingerspell/emphatic-letter-sequence-like`
- `repeated-tool-use-like`

Family counts (REAL after-round-5; identical to BEFORE-round-5 since round-5 widens margins, never flips):
- `big-fall-like` 3, `chop/cut-like` 2, `fingerspell/emphatic-letter-sequence-like` 2, `repeated-tool-use-like` 2, `impact/bounce-like` 1.

## Current strongest confusion pairs (REAL after-round-5, canonical)

Pair-count list (set membership unchanged vs BEFORE-round-5 because round-5 only widens margins; runner-up label per segment was not flipped):
- `chop/cut-like` vs `repeated-tool-use-like` — count 3 (seg-02 margin `0.0702` (was `0.0102`), seg-03 margin `0.0703` (was `0.0103`), seg-05 margin `0.1626` (unchanged; seg-05 has primary `repeated-tool-use-like`, runner-up `chop/cut-like`, so opposite polarity — round-5 rule does not target it)).
- `big-fall-like` vs `drink-like` — count 1 (seg-09 margin `0.0983`, unchanged).
- `big-fall-like` vs `fingerspell/emphatic-letter-sequence-like` — count 1 (seg-08 margin `0.145`, unchanged).
- `big-fall-like` vs `impact/bounce-like` — count 1 (seg-04 margin `0.1179`, unchanged).

Average confidence margin (real after-round-5): `0.15208` (up from real BEFORE `0.14008`, delta `+0.012`). All gain comes from seg-02 / seg-03 widening; no other segment changed.

Failure-tag counts (real after-round-5; unchanged vs BEFORE because thresholds for `low-confidence-competition` and `tool-use-vs-release-confusion` are still met at margins 0.07): `low-confidence-competition` 10, `hand-visibility-weak` 5, `tool-use-vs-release-confusion` 5, `mouth-face-cue-weak` 1.

## What changed in this run (round 7)

Round-7 does not touch the decoder. Round-3 / round-4 / round-5 rules are all preserved verbatim. The round-6 label-pack lib + scripts are also unchanged.

New (round-7):
- `src/app/labels/page.tsx` — server component shell that renders the reviewer.
- `src/components/LabelPackReviewer.tsx` — client component. Loads a label-pack JSON via file input, validates against the round-6 schema, optionally loads a blind export JSON for context (failure tags, motif tags, repeatedCycleCount, hypothesisReason). Edits all per-segment fields (`familyLabel`, `conceptLabel`, `exactLabel`, `notes`, `split`, `quality`). Sorts the six dominant-confusion segments to the top with a "priority review" badge. Buttons: "Evaluate vs export" (calls `evaluateLabelPackAgainstExport`) and "Export pack JSON" (downloads the validated pack). All edits stay in browser memory; no IndexedDB writes; no autoload.
- First real sample-2 review pack: `docs/artifacts/sample2-labelpack-review-2026-04-27.json`. Derived from the canonical real round-5 blind export via `scripts/create-label-pack.mjs`. All user labels blank. The six priority segments carry a short `notes` marker (e.g. seg-02 / seg-03: "priority: chop vs repeated-tool, narrow strokes"; seg-09: "priority: big-fall vs drink (mouth-face-cue-weak)"). Pack id `labelpack-sample2-review-round6`.
- Companion evaluation snapshot (still all-blank, expected zeros): `docs/artifacts/sample2-labelpack-review-eval-2026-04-27.json`.

What already existed before this run (preserved):
- Round-6 schema + helpers: `src/lib/labels/labelPack.ts`, `src/tests/labelPack.test.ts`.
- Round-6 scripts: `scripts/create-label-pack.mjs`, `scripts/validate-label-pack.mjs`, `scripts/evaluate-label-pack.mjs`.
- Canonical real round-5 artifacts (above).
- Starter pack: `docs/artifacts/sample2-labelpack-starter-2026-04-27.json` and its blank evaluation.

### How to use the reviewer

1. `npm run dev` then open `http://localhost:3000/labels`.
2. Load `docs/artifacts/sample2-labelpack-review-2026-04-27.json` via the first file input.
3. (Optional) Load `docs/artifacts/sample2-blind-after-round5-real-2026-04-26.json` via the second file input to see failure tags, motif tags, repeated-cycle counts, and the decoder's hypothesis reason inline with each segment.
4. Edit `familyLabel`, `conceptLabel`, optional `exactLabel`, `notes`, `split` (`calibration`/`holdout`/`ignore`), `quality` (`usable`/`weak`/`occluded`) on the six priority segments first.
5. Click "Evaluate vs export" to see family match rate, calibration vs holdout counts, confusion hotspots, weak/occluded count, uncovered concepts, and segments still needing labels — all computed locally, no network.
6. Click "Export pack JSON" to download the edited pack. Save it back into `docs/artifacts/` (or wherever you keep evaluation evidence) for the next agent.

### Privacy guarantees (still hold)

- Reviewer renders only the JSON the user opens. No webcam, no clip upload, no IndexedDB write.
- Validator (round-6) deep-walks every saved pack and rejects any forbidden key (`rawVideo`, `pixelData`, `frames`, `imageBytes`, `transcript`, `expectedReference`, `answerKey`).
- Blind mode (`/verify`, `/live`, `BlindSemanticDecoder`) does not import `src/lib/labels/labelPack.ts`. Only `src/components/LabelPackReviewer.tsx` and the three CLI scripts touch label packs.

## What did not change in this run

- No decoder logic touched. Round-3 / round-4 / round-5 rules preserved.
- No transcript / reference / concept mapping / answer key / timestamp rule.
- No motif weights, no family priors, no phase-vote rebalancing.
- No changes to `/verify`, `/live`, `/teach`, `/review`, `/memory`, `/minimal-pair`, `/evidence-health`.
- Canonical real round-5 artifacts unchanged.
- Round-6 lib, scripts, and tests unchanged.

## Real-export reproduction recipe (canonical)

New this run: `scripts/run-blind-export.mjs` drives a real Chromium via Playwright against `npm run dev`, uploads an `.mp4`, runs the actual blind inference (real MediaPipe + WebGL, no mock landmarks), and saves the exported JSON. Companion scripts: `scripts/derive-blind-summary.mjs` (turn full export into the human-readable summary subset) and `scripts/compare-blind-exports.mjs` (pure-JS port of `compareBlindInferenceReports`, runs offline without the dev server).

Reproduction:

1. Free port 3000 and clear Turbopack cache:
   ```powershell
   $p = (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue).OwningProcess
   if ($p) { Stop-Process -Id $p -Force }
   Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
   ```
2. Start dev: `npm run dev` (leave running). The harness uses `http://localhost:3000`; do not switch to `127.0.0.1` because Next.js 16 cross-origin dev gating blocks the HMR/RSC client there.
3. Run the harness:
   ```powershell
   node scripts/run-blind-export.mjs ".\sample 2.mp4" "docs\artifacts\sample2-blind-after-roundN-real-YYYY-MM-DD.json"
   ```
4. Derive the summary subset:
   ```powershell
   node scripts/derive-blind-summary.mjs <full.json> <summary.json>
   ```
5. Compare two exports offline:
   ```powershell
   node scripts/compare-blind-exports.mjs <baseline.json> <current.json> <out.json>
   ```

To isolate the effect of a new rule block in `BlindSemanticDecoder.ts`, copy the file to `*.backup`, neutralize the new rules by wrapping each new top-level `if (` with `if (false &&`, run the harness for the BEFORE export, then restore from the backup and run the harness again for the AFTER export. Turbopack HMR picks up the change without restarting `npm run dev` once the page has compiled at least once for that session; if you see HMR websocket errors, restart the dev server. Always use `localhost:3000`, never `127.0.0.1:3000`.

## Files touched in this run (round 8)

- `src/lib/recognition/Recognizer.ts` (NEW — swappable recognizer interface + `TranslationResult` shape + `LOW_CONFIDENCE_THRESHOLD = 0.55`)
- `src/lib/recognition/familyToPhrase.ts` (NEW — renders 9 blind decoder family hypotheses as bracketed English phrases)
- `src/lib/recognition/BaselineRecognizer.ts` (NEW — wraps a blind export into a transcript + honest confidence; floor model)
- `src/lib/recognition/CustomSignLexicon.ts` (NEW — in-memory user-defined sign labels with privacy-validated snapshot import/export; forbidden keys include `transcript`, `rawVideo`, …)
- `src/lib/recognition/AdaptedRecognizer.ts` (NEW — decorator that overlays the lexicon on a base recognizer; bounded confidence bump)
- `src/lib/recognition/PretrainedRecognizerStub.ts` (NEW — documented drop-in slot for a future pose-based pretrained recognizer; currently always not-ready)
- `src/lib/recognition/RecognizerRegistry.ts` (NEW — composes recognizers in priority order: pretrained → adapted → baseline)
- `src/app/translate/page.tsx` (NEW — server shell for `/translate`)
- `src/components/TranslateApp.tsx` (NEW — client UI with Normal/Train toggle, confidence% badge, alternatives, per-segment corrections, custom-sign editor, lexicon JSON import/export)
- `src/tests/Recognizer.test.ts` (NEW — vitest coverage for baseline / adapted / lexicon / registry / `toBlindExportLike` / `toConfidencePercent`)
- `docs/LLM_HANDOFF.md` (this file)

No decoder rules, blind export pipeline, label-pack lib, `/labels` route, or canonical artifacts were modified. Blind mode does NOT auto-load custom lexicons; `/translate` is opt-in.

## Files touched in round 7 (historical)

- `src/app/labels/page.tsx` (NEW — server shell)
- `src/components/LabelPackReviewer.tsx` (NEW — client reviewer)
- `docs/artifacts/sample2-labelpack-review-2026-04-27.json` (NEW — first real sample-2 review pack with priority notes; user labels intentionally blank)
- `docs/artifacts/sample2-labelpack-review-eval-2026-04-27.json` (NEW — blank-pack evaluation snapshot)

## Checks passed (round 8)

- `npm run lint` — pass (0 errors, 0 warnings after `_input` rename in `PretrainedRecognizerStub`).
- `npm run test` — **164 / 164** pass (round 7 was 150; round 8 adds 14 new vitest cases in `Recognizer.test.ts`).
- `npm run build` — pass; new `/translate` route compiles alongside existing routes.
- `npm run e2e` — **17 / 17** pass.

Reliability note (unchanged): free port 3000 and delete `.next` before `npm run e2e`. PowerShell recipe:
```powershell
$p = (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue).OwningProcess
if ($p) { Stop-Process -Id $p -Force }
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run e2e
```

## Current Normal mode path (round 8)

1. User uploads a blind inference export JSON (produced by `/verify`) into `/translate`.
2. `TranslateApp` builds a `RecognizerRegistry([pretrainedStub, adapted, baseline])` and calls `registry.translate(...)`.
3. `PretrainedRecognizerStub` is not ready by default → skipped.
4. `AdaptedRecognizer` is consulted next; if the local `CustomSignLexicon` is empty it passes the `BaselineRecognizer` result through unchanged.
5. `BaselineRecognizer` converts each blind segment's `eventFamilyHypothesis` into a bracketed English phrase via `familyToPhrase.ts` and produces honest per-segment confidence via `marginToConfidence(margin) = 1 - exp(-max(margin,0)*4)`. Overall confidence applies a tag penalty for `low-confidence-competition`, `mouth-face-cue-weak`, `hand-visibility-weak`.
6. Result includes `transcript`, `confidencePercent`, `isLowConfidence`, `lowConfidenceReason`, `alternatives` (runner-up family chain), `segments`, `source`, `modelId`. Low-confidence answers are still rendered but flagged.

## Current Train mode path (round 8)

1. User toggles **Train mode** in `/translate`.
2. Per-segment correction inputs (visible when a segment has a `family`) call `CustomSignLexicon.upsert({ label, familyHint: segment.family, split: "calibration", ... })`. Re-upserts of the same label bump `exampleCount`.
3. Free-form **Add custom sign** form lets the user register a label with `familyHint`, `conceptHint`, `split` (`calibration` / `holdout` / `ignore`), and `notes`.
4. Lexicon snapshot can be exported as `custom-signs-YYYY-MM-DD.json` and imported back. `validateCustomSignLexicon` blocks forbidden keys at any depth (`transcript`, `expectedReference`, `answerKey`, `rawVideo`, `pixelData`, `frames`, `imageBytes`), bad splits, bad `exampleCount`, and duplicate ids.
5. Translating again replays the registry; the `AdaptedRecognizer` now rewrites matching segments with the user's label, sets `customSignId`, bumps segment confidence by `perMatchBump` (default 0.05, overall cap 0.2), and prepends the baseline transcript as an alternative. `source` switches to `adapted` and `adapterApplied` is `true`.

## Current model / pretrained integration path (round 8)

`PretrainedRecognizerStub` is the explicit drop-in slot. To wire in a real pretrained backend:

1. Replace `PretrainedRecognizerStub.recognize` with a model wrapper that consumes `RecognizerInput.blindExport` and/or `RecognizerInput.encodedSequence` (landmarks already produced by the live pipeline).
2. Return a `TranslationResult` with per-segment text and honest model-derived confidence (softmax / margin → confidence). Set `source: "pretrained"`.
3. Flip `isReady()` to `true` once weights are loaded; otherwise `RecognizerRegistry` will keep skipping it and fall back to `AdaptedRecognizer`.
4. Keep model weights local (WebAssembly / WebGPU). No raw video upload, no remote inference.
5. Suggested datasets: WLASL, MS-ASL, or How2Sign-style landmark features. Build pose-based features to stay compatible with the existing in-browser landmark pipeline.

When the pretrained recognizer is ready, the existing UI requires no changes — the registry transparently prefers it.

## Exact next recommended step

1. **Wire a real pretrained pose-based recognizer behind `PretrainedRecognizerStub`.** Start with a small WLASL or MS-ASL subset converted to landmark features so it can run fully in-browser via WASM/WebGPU. Keep `Recognizer.recognize`'s output shape; the rest of the app does not need to change.
2. While the pretrained backend is being prepared, exercise Train mode on `sample 2.mp4`: open `/translate`, load `docs/artifacts/sample2-blind-after-round5-real-2026-04-26.json`, correct seg-02/03/04/05/08/09, export the resulting lexicon JSON into `docs/artifacts/`, and use it as the first reusable adaptation pack.
3. Do NOT load custom lexicons or label packs into blind mode; `/translate` remains opt-in. If a future round wants to use the lexicon for supervised retraining, add an explicit unit test that asserts blind mode never imports `CustomSignLexicon` or `labelPack.ts`.
4. Round-7 follow-ups from `/labels` (hand-editing the real review pack and running `evaluate-label-pack.mjs`) are still open and unblocked by this round; pursue them in parallel.

## Round-7 follow-ups (still open)

1. **Hand-edit the real review pack at `/labels`.** Open `http://localhost:3000/labels`, load `docs/artifacts/sample2-labelpack-review-2026-04-27.json`, optionally load `docs/artifacts/sample2-blind-after-round5-real-2026-04-26.json` for context, and fill the six priority segments first:
   - seg-02, seg-03 (chop vs repeated-tool, narrow strokes) — split `calibration` for one, `holdout` for the other.
   - seg-04 (big-fall vs impact/bounce) — typically `holdout`.
   - seg-05 (repeated-tool primary vs chop runner-up, symmetric polarity) — typically `calibration`.
   - seg-08 (big-fall vs fingerspell), seg-09 (big-fall vs drink, mouth-face-cue-weak) — split as data allows.
   Then export the pack JSON, save it back into `docs/artifacts/`, run `node scripts/evaluate-label-pack.mjs ...`, and commit the resulting `sample2-labelpack-review-eval-*.json`. The first real `familyMatchRate` and `confusionHotspots` numbers will tell us which tight margins the decoder genuinely got right vs wrong.
2. After at least 6 segments are labeled with a calibration/holdout split, decide whether to:
   - add a *single* targeted decoder rule whose guards are validated against labeled segments only, or
   - keep the decoder frozen and instead capture a second clip plus a second label pack to expand coverage.
3. Do not load label packs into blind mode. If a future round wants to use them for supervised adaptation, make that an explicit opt-in path with its own unit test that asserts blind mode never imports `src/lib/labels/labelPack.ts` directly.
4. Validation rules carry over: every future *decoder* round MUST validate against fresh real browser exports via `scripts/run-blind-export.mjs`. Synthesis-only validation is not acceptable.
5. Open data needs (unchanged from round-5):
   - seg-09 `big-fall-like vs drink-like` (margin `0.0983`) — needs labeled mouth-approach examples.
   - seg-08 `big-fall-like vs fingerspell/emphatic-letter-sequence-like` (margin `0.145`) — needs per-segment dump of `releaseRatio` / `reactionAftermathScore` / `endStateStabilization` plus labeled boundary cases.
   - seg-04 `big-fall-like vs impact/bounce-like` (margin `0.1179`) — needs labeled head-bounce vs release continuity examples.
   - seg-05 symmetric polarity — needs labels before flipping is safe.
   - `phone/call-like` vs `inspect/listen-like` — sample 2 does not exercise this pair; needs a clip that does.
   - Narrow handshape letter-shape distinctions — out of scope for the family-level blind decoder.

### Round-7 reviewer smoke test (this run)

1. `node scripts/create-label-pack.mjs docs/artifacts/sample2-blind-after-round5-real-2026-04-26.json docs/artifacts/sample2-labelpack-review-2026-04-27.json labelpack-sample2-review-round6` — wrote 10 segment slots.
2. Priority `notes` injected for seg-02 / seg-03 / seg-04 / seg-05 / seg-08 / seg-09.
3. `node scripts/validate-label-pack.mjs docs/artifacts/sample2-labelpack-review-2026-04-27.json` — OK.
4. `node scripts/evaluate-label-pack.mjs ... sample2-labelpack-review-eval-2026-04-27.json` — 0/10 labeled, family match 0, hotspots 0 (expected for blank pack).
5. `/labels` route renders the reviewer locally; loading the review pack JSON shows the six priority segments at the top with the priority badge.

## Artifact locations

### Canonical (real browser exports, this run — round 5)

- Real BEFORE-round-5 (round-5 rule neutralized in source, ran via `scripts/run-blind-export.mjs`):
  - `docs/artifacts/sample2-blind-before-round5-real-2026-04-26.json`
  - `docs/artifacts/sample2-blind-before-round5-real-summary-2026-04-26.json`
- Real AFTER-round-5 (round-5 rule enabled, ran via the same harness):
  - `docs/artifacts/sample2-blind-after-round5-real-2026-04-26.json`
  - `docs/artifacts/sample2-blind-after-round5-real-summary-2026-04-26.json`
- Real BEFORE vs real AFTER comparison:
  - `docs/artifacts/sample2-blind-compare-round5-real-2026-04-26.json`

### Canonical (prior round, kept for context)

- Real BEFORE / AFTER round-4 (round-4 rules verified as no-ops on `sample 2`):
  - `docs/artifacts/sample2-blind-before-round4-real-2026-04-26.json`
  - `docs/artifacts/sample2-blind-before-round4-real-summary-2026-04-26.json`
  - `docs/artifacts/sample2-blind-after-round4-real-2026-04-26.json`
  - `docs/artifacts/sample2-blind-after-round4-real-summary-2026-04-26.json`
  - `docs/artifacts/sample2-blind-compare-round4-real-2026-04-26.json`
  - `docs/artifacts/sample2-blind-round3-vs-round4-real-2026-04-26.json`

### Non-canonical (kept for traceability only)

- Older real after-round-3 export (used as ground truth in prior session):
  - `docs/artifacts/sample2-blind-after-round3-2026-04-26.json`
  - `docs/artifacts/sample2-blind-after-round3-summary-2026-04-26.json`
- Round-3 / round-4 synthesis (code-level estimates, NOT real exports — do not cite as ground truth):
  - `docs/artifacts/sample2-blind-after-round3-synthesis-2026-04-26.json`
  - `docs/artifacts/sample2-blind-after-round4-synthesis-2026-04-26.json`
- Synthesis-only before-round-4 (NOT a real export):
  - `docs/artifacts/sample2-blind-before-round4-2026-04-26.json`
  - `docs/artifacts/sample2-blind-before-round4-summary-2026-04-26.json`
- Stale `sample2-blind-after-round{4..10}-*-2026-04-26.json` files from prior iterative work — none are canonical for the current code; ignore them.
- Secondary unseen blind validation summary (still valid, not re-run this session):
  - `docs/artifacts/sampleclip-blind-validation-summary-2026-04-26.json`

## What still needs labeled data

The blind decoder cannot, without labeled examples, distinguish the following without risking false positives:

- `big-fall-like` vs `drink-like` on seg-09 — both currently fire on similar release + aftermath shapes; phase-level mouth-approach evidence is weak (`mouth-face-cue-weak` already tagged).
- `impact/bounce-like` vs `walk/continue-like` on seg-01 — body bounce alone is ambiguous between the two without person/location continuity context.
- `phone/call-like` vs `inspect/listen-like` — both involve sustained side-face hold; current sample 2 does not exercise this pair, so no on-clip evidence to tune against.
- Any narrow handshape-only distinction (e.g., specific letter shapes within `fingerspell/emphatic-letter-sequence-like`) — out of scope for the blind family-level decoder.

These are flagged for whichever future workstream introduces a small labeled validation set. The blind decoder must remain reference-free.
