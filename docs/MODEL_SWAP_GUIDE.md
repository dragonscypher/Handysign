# Model Swap Guide

## Current MVP architecture

Pipeline is intentionally modular:

1. `LandmarkExtractor`
2. `FeatureEncoder`
3. `CandidateRecognizer`
4. `UncertaintyEngine`
5. `RepairController`
6. `MotionReceiptBuilder`
7. `CuePatchPlanner`
8. `SignFormExtractor`
9. `MinimalPairBuilder`
10. `EvidenceHealthAnalyzer`

Current recognizer is weighted KNN over encoded landmark prototypes.
Confusion Twin Repair sits beside recognizer as local contrastive memory. It is not full model training.
Motion Replay Receipts sit beside the runtime as inspectability artifacts. They are not part of model optimization.
Cue Patch Mode sits beside uncertainty logic as repair UX. It is not model training.
SignForm Ledger sits beside receipts as coarse inspectability layer. It is not authoritative phonology.
Minimal Pair Lab sits beside repair logic as local contrastive review. It is not official linguistic analysis or full model training.
Evidence Health / Drift Sentinel sits beside local memory as monitoring only. It is not model evaluation, accuracy certification, or automatic cleanup.

## Stable interfaces

- `LandmarkExtractor.start(video): Promise<void>`
- `LandmarkExtractor.stop(): void`
- `LandmarkExtractor.subscribe(listener): unsubscribe`
- `FeatureEncoder.encode(buffer): EncodedSequence`
- `CandidateRecognizer.recognize(sequence, { topK, contrastivePairs?, minimalPairCards? }): RecognitionResult`
- `UncertaintyEngine.evaluate(recognition, quality): UncertaintyDecision`
- `RepairController.next(decision, action): RepairState`
- `buildMotionReceipt({ landmarkBuffer, encodedSequence, recognition, decision, channelDeltas, mode, source }): MotionReceipt`
- `CuePatchPlanner.plan({ decision, translationDebt, motionReceipt, channelSummary, topCandidates, confusionTwinDeltas, minimalPairCard? }): CuePatchPrompt[]`
- `SignFormExtractor.extract({ receiptId, receipt, encodedSequence, recognition, decision }): SignFormLedger`
- `MinimalPairBuilder.build({ candidateA, candidateB, examplesA, examplesB, userNotes? }): MinimalPairCard`
- `EvidenceHealthAnalyzer.analyze({ personalSigns, confusionPairs, savedReceipts, minimalPairCards, corrections?, now? }): EvidenceHealthReport`

## How to swap recognizer

Replace only recognizer layer first if new model consumes same `EncodedSequence`.

Steps:

1. Keep `FeatureEncoder` output stable.
2. Implement new recognizer class with same `recognize()` contract.
3. Return constrained top-k candidates plus calibrated confidence.
4. Preserve candidate metadata like `needsMouthCue`.
5. Preserve `baseConfidence`, `contrastiveAdjustment`, `appliedConfusionPairs`, `minimalPairAdjustment`, and `appliedMinimalPairCards` so local contrast review stays transparent.
6. Preserve per-channel summaries needed for Motion Replay Receipts.
7. Preserve debt metadata and candidate metadata like `needsMouthCue` / `needsFaceCue` so Cue Patch Mode and Minimal Pair Lab hints stay honest.
8. Preserve coarse inspectability outputs needed for SignForm Ledger, even if slot logic later moves to learned heads.
9. Preserve local summary outputs needed by Evidence Health / Drift Sentinel so stale or weak memories stay visible.
10. Leave Repair and Translation Debt logic intact while calibrating thresholds.

## How to swap encoder + recognizer together

If future model consumes raw landmark sequences directly:

1. keep `LandmarkExtractor` buffer contract
2. add new encoder adapter that outputs model input tensor
3. update recognizer to accept new encoded type or wrap tensor in current `EncodedSequence`
4. preserve quality metrics needed by `UncertaintyEngine`

## Calibration notes

Current thresholds:

- accept when `top1 >= 0.78`
- accept when `top1 - top2 >= 0.18`
- ambiguous when `top1 >= 0.55` and margin `< 0.12`
- unknown streak after two consecutive frames below `0.55`

If new model is swapped in:

- recalibrate confidence, not just ranking
- verify uncertainty labels still align with user-visible repair prompts
- re-check mouth cue and occlusion debt rules against real evaluation clips
- keep Confusion Twin adjustments small and never let them bypass safety thresholds

## Recommended next upgrades

- ONNX runtime in browser for learned recognizer
- dedicated fingerspelling decoder
- worker-based inference loop
- user-specific few-shot adaptation beyond centroid averaging
- richer receipt-side explanations tied to calibrated model attribution, still landmark-only
- more calibrated cue-patch ranking from learned quality heads, still local and non-authoritative
- optional learned sign-form heads for coarse evidence slots, still humble and not presented as official linguistic authority
- optional learned evidence-health heuristics for drift and coverage scoring, still local and not framed as certification
