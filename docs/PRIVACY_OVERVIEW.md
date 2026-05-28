# SignRepair Privacy Overview

SignRepair is local, landmark-only prototype by default.

## What is stored

- settings such as consent, overlay, save-consent, and camera mode
- personal sign landmark-derived examples and prototype summaries
- correction records
- Confusion Twin repair memory
- saved motion receipts when user explicitly saves them
- minimal-pair cards when user explicitly saves them
- latest Evidence Health report
- optional user-authored local sign-form notes

## What is not stored

- no raw video
- no pixel buffers
- no screenshots
- no image blobs
- no base64 image payloads
- no upload payloads

## Landmark-only rule

- Saved records must stay landmark-derived or summary-only.
- Guard file `src/lib/privacy/assertNoRawVideoFields.ts` blocks forbidden fields.
- Export path runs same guard before JSON download.

## Local-only storage

- Storage stays in browser IndexedDB.
- No network upload path exists in product flow.
- Export is manual and local to device.
- Clear-all is manual and local to device.

## Export and clear behavior

1. Use Memory page to export local JSON snapshot.
2. Inspect JSON manually or run `pnpm audit:export -- <path-to-export.json>`.
3. Use clear-all in Memory to remove local records.
4. Confirm empty states return after clear-all.

## Manual verification steps

- Inspect IndexedDB in browser DevTools.
- Confirm receipts store numeric landmark arrays and summaries only.
- Confirm no `rawVideo`, `videoBlob`, `framePixels`, `imageData`, `canvasData`, `dataUrl`, `jpg`, `jpeg`, `png`, `webp`, or `base64` fields appear.
- Confirm no file blobs or media streams persist.
- Repeat checks after saving personal signs, receipts, minimal-pair cards, and Evidence Health report.

## Limitations

- Landmark-only storage reduces exposure, but does not prove correct meaning.
- Real browser and hardware behavior still need manual validation.
- Local personalization can become stale or drift and should be reviewed.
