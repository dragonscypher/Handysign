# SignRepair Ethics

SignRepair is a privacy-first sign evidence and repair prototype. It is not a translator and not certified interpretation.

## Non-negotiables

- Do not present SignRepair as certified interpretation.
- Do not use for medical, legal, emergency, or official contexts.
- Do not hide uncertainty behind polished UX.
- Do not persist raw video unless future user opt-in is explicit and off by default.
- Do not erase dialect or personal signs by forcing one canonical mapping.
- Do not describe local contrastive repair memory as full training or certified interpretation.
- Do not describe Motion Replay Receipts as proof, authority, or ground truth.
- Do not present Cue Patch Mode as proof that one signing style is "correct."
- Do not present SignForm Ledger / Handshape Lens as authoritative ASL phonology.
- Do not present Minimal Pair Lab as official ASL minimal-pair analysis or linguistic authority.
- Do not present Evidence Health / Drift Sentinel as an accuracy score, certification, or reason to force standardized signing.

## Why repair-first matters

Typical demo systems often output one answer even when evidence is weak. That creates false confidence. In sign interpretation, false confidence can be worse than visible uncertainty.

SignRepair instead:

- makes uncertainty visible through Translation Debt
- pauses candidate output when evidence is weak
- asks for targeted clarification
- lets user corrections stay local by default
- stores Confusion Twin Repair as landmark-derived contrastive memory only when user chooses to save it
- asks for smallest useful cue patch before defaulting to full repeat
- exposes coarse sign-form evidence slots instead of pretending English gloss alone is full analysis
- lets users compare repeated near-miss pairs through local contrast cards without forcing one standard form
- lets users inspect whether local memories look weak, stale, or drifted without pretending the app knows the "correct" form

## Privacy defaults

- video remains local in browser session
- landmark-only storage by default
- local IndexedDB export and deletion controls included in product
- Confusion Twin Repair stores feature summaries only, never raw video
- Motion Replay Receipts save only after explicit user action and stay landmark-only
- Cue Patch prompt and before/after comparison metadata only persist when user explicitly saves related receipt
- SignForm Ledger stays landmark-only and only persists when embedded in saved receipt or local personal-sign notes
- Minimal Pair Lab cards stay landmark-only and only persist when the user explicitly saves them
- Evidence Health stores only local landmark-derived summaries and latest report state

## Community review

Deaf-led review needed before real deployment.

That means:

- review by Deaf signers and qualified sign-language professionals
- validation across dialects and community-specific usage
- testing for harm caused by confidence wording, UI framing, and fallback behavior
- review of whether saved Confusion Twin repairs overfit one user or one context
- review of whether saved Minimal Pair Lab cards pressure users to standardize signing that should stay personal or dialectal
- review of whether Evidence Health warnings pressure users to normalize dialect or personal signing that should stay user-controlled

## Correction authority

User correction is not proof of linguistic authority. It only personalizes this device for this user and context.

## Receipt authority

Motion Replay Receipts are debugging and inspectability artifacts. They can show what cues the prototype considered, but they do not certify that the label, repair, or explanation was linguistically correct.

## Cue patch authority

Cue Patch Mode should not pressure users to conform to one standard signing style. It only points to missing evidence in current landmark window and may still be wrong about what cue would help.

## Sign-form authority

SignForm Ledger / Handshape Lens exposes coarse evidence slots for inspectability. Those slot labels are not official ASL categories, not proof of meaning, and not a reason to erase dialect or personal variants. User-authored sign-form notes are local memory only.

## Minimal-pair authority

Minimal Pair Lab cards are local review aids. They compare coarse landmark-derived slots and channels for one device and one user context. They are not official ASL minimal-pair analysis, not proof of linguistic structure, and not a reason to override user control of local notes or local sign variants.

## Evidence Health authority

Evidence Health / Drift Sentinel is local evidence hygiene only. A "healthy" badge is not proof that memory is correct, and a drift warning is not proof that signing changed. It is a local prompt to review weak, stale, or repeatedly colliding memories while keeping the user in control.

## Deployment warning

Even if model quality improves, product should keep explicit risk language. Accuracy alone does not remove ethical obligation to disclose limits, consent requirements, and non-coverage of high-stakes contexts.
