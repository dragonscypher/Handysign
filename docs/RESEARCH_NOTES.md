# SignRepair Research Notes

## Product stance

SignRepair is a privacy-first sign evidence and repair prototype. It is not trying to market "perfect sign understanding." The product idea is uncertainty-first:

- keep decoding constrained to known candidates
- surface ambiguity instead of hiding it
- treat mouth and facial cues as first-class signals
- let user repairs become local personalization
- let near-miss corrections become local contrastive memory instead of fake retraining
- expose coarse sign-form evidence slots so inspectability does not collapse into English gloss only
- let repeated near-miss pairs become local contrast cards instead of pretending one correction solved the pair forever
- surface when local memories may be under-sampled, stale, or drifting instead of pretending personalization stays healthy forever
- benchmark uploaded clips against human reference summaries without pretending a tiny candidate set can narrate a story

## Inspiration threads

### CCL-SLR direction

- pose consistency matters
- temporal motion matters
- positive pair mining suggests motion-preserving representations beat single-frame guesses
- MVP candidate demo: keep temporal buffer, motion summaries, and pose-aware normalization
- Confusion Twin Repair borrows contrastive alignment idea without pretending local full-model training
- Minimal Pair Lab borrows near-miss contrast logic for repeated candidate pairs without claiming full contrastive model training

### SignMouth / SignClip direction

- mouth or lip cues can disambiguate similar manual signs
- MVP candidate demo: encode mouth shape separately and create explicit `mouth cue missing` debt state
- Confusion Twin explanations can surface when mouthing likely separated pair
- Cue Patch Mode can ask for mouth-visible recapture instead of defaulting to full repeat

### Sign form / handshape inspectability direction

- handshapes matter as core building blocks and many AI systems under-model them
- subtle handshape, location, and timing differences can create hard-to-separate near-miss pairs
- sign languages should not be reduced to English word replacement
- MVP candidate demo: expose coarse handshape, palm/orientation, location, movement, timing, mouth, face, and visibility slots
- SignForm Ledger stays intentionally coarse and humble; it does not claim authoritative ASL phonology

### EASLT direction

- facial expression can shift meaning and intent
- MVP candidate demo: preserve coarse facial cue vector instead of hand-only decoding
- facial and affect cues can act as local semantic anchors in contrastive repair memory
- Cue Patch Mode can ask for face-visible recapture when non-manual cue visibility looks weak

### VLM zero-shot caution

- open-ended language output can hallucinate
- MVP candidate demo: no freeform generation, only constrained candidate ranking plus repair prompts
- 2026 sign-recognition direction reinforces constrained decoding plus explicit uncertainty over open-ended guessing
- MVP benchmark mode: show exact per-segment model output beside expected human reference text, then score pass / partial / fail / uncertain instead of hiding mismatch

### Evidence health / drift direction

- signer variation and signer-independent generalization remain hard
- local personalization can help, but stale or low-quality local examples can also hurt
- evidence quality should be transparent to the user rather than hidden behind a single score
- MVP candidate demo: Evidence Health / Drift Sentinel flags too-few examples, weak sign-form coverage, repeated collisions, stale memories, and possible drift from current signing

## MVP boundary

- built-in demo labels exist to exercise UX, not to claim ASL-ready recognition
- personal and dialect signs should be teachable instead of forced into one standard mapping
- local correction loops matter more than breadth in first prototype
- Confusion Twin Repair is local contrastive personalization only, not linguistic authority and not global truth
- Motion Replay Receipts are inspectability only, not proof that a predicted label was linguistically correct
- Cue Patch Mode is local UX logic only. It suggests smallest useful recapture from landmark quality and uncertainty signals, not linguistic authority.
- SignForm Ledger / Handshape Lens exposes evidence slots only. It does not declare official linguistic structure and should support personal or dialect variants.
- Minimal Pair Lab creates local contrast cards only. It does not declare official ASL minimal pairs or linguistic authority.
- Evidence Health / Drift Sentinel is local monitoring only. It does not certify correctness or pressure users toward one signing style.

## Privacy-safe replay and XAI direction

- skeleton-based sign-language pipelines can reduce storage and privacy exposure compared with raw video, but they still inherit generalization limits
- strong sign understanding usually needs multiple cue families together: hands, body, face, mouth, visibility, and timing
- XAI-style summaries can improve trust only if they expose both influential channels and failure modes
- MVP candidate demo: Motion Replay Receipts store landmark-only replay frames, channel summaries, Translation Debt, and uncertainty reasons without storing pixels
- Cue Patch Mode uses those same landmark-only summaries to suggest mouth, hand, face, body, timing, or choose-or-teach repairs
- SignForm Ledger uses those same landmark-only summaries to expose coarse form slots and user-editable local notes without forcing standardization
- Minimal Pair Lab uses those same landmark-only summaries to compare repeated near misses and keep user-controlled contrast notes local
- Evidence Health uses those same landmark-only summaries to flag weak, stale, or colliding memories without uploading anything

## Future research path

- replace handcrafted encoder with learned encoder
- move KNN to ONNX model with calibrated confidence head
- add dedicated fingerspelling recognizer
- add richer mouth-region temporal modeling
- evaluate with Deaf-led review and real user protocol before any wider claim
