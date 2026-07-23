# Lexora AI — Future Enhancements (deferred, not part of the frontend rewrite)

These are design-package or product ideas intentionally **not** built during the
architecture rewrite + design-package implementation, because they are new
*integrated features* (new backend/premium plumbing) rather than UI
implementation. Existing functionality does **not** depend on any of them.

---

## 1. Scanner — ★ Searchable-PDF export  (deferred by KRK)

**What:** A third export format in the Scan station's export card
(`scan.html` → PDF / JPG / **★ Searchable**), producing a PDF with an invisible
OCR text layer (select / search / copy).

**Why deferred:** Unlike the on-device PDF/JPG exports, a searchable PDF requires
the **premium OCR → searchable-PDF pipeline**: the premium consent gate + ₹/page
metering (`X-Lexora-Charge` / free-cap / refund-on-failure) and the convert
gateway's `ocr_hd` path — all of which currently live in `tools-page.js`
(`runPremium` / `consentModal`), not in `scan-page.js`. Wiring it into the scanner
is a **new integrated feature**, not a UI gap.

**Not a capability gap:** the OCR intent is already served from the scanner today
via the **OCR → editable text (Word)** handoff (`#ocrTextBtn`), and the standalone
**OCR PDF** premium tool (`ocr_hd`) already produces searchable PDFs on the tools
page. Users can reach the capability; only the in-scanner *export format* is absent.

**If/when built — the clean path (no premium logic duplicated):**
1. Scan station builds the multi-page PDF exactly as `Save pages (PDF)` does today.
2. Hand that blob to the existing premium flow rather than re-implementing metering:
   either (a) bridge to `tools.html#ocr` via the `lxhand` IndexedDB handoff so the
   tools page runs `ocr_hd` under its existing consent/metering, or (b) factor the
   `runPremium`/`consentModal` pair into a shared module both pages call.
3. Show the ★ badge + consent/price exactly like every other premium run.

Estimated scope: medium (cross-page premium plumbing + one export tab + tests).
No change to backend contracts — reuses `ocr_hd` on the convert gateway.
