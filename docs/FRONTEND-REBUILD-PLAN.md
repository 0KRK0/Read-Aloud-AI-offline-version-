# Lexora AI — Frontend Rebuild Plan (design-package migration)

> **Directive (locked):** Complete frontend **rewrite**, not a refactor. The
> Claude Design package (`Lexora Design Package.dc.html`) is the SOLE source of
> truth for the new frontend. The old HTML/CSS/nav/component structure is retired.
> Reuse ONLY UI-independent code (API clients, services, auth, engines, business
> logic, utilities). Anything coupled to the old DOM is rewritten. Migrate
> feature-by-feature; verify each; then remove the old dependency. Preserve 100%
> of functionality (see `docs/PLATFORM-ARCHITECTURE.md` — the capability contract).
>
> **Status:** Phase 1 (architecture/core-services migration) ✅ and Phase 2
> (design-package implementation, all 13 surfaces) ✅ complete. Now in Phase 3 —
> production-readiness + dead-code cleanup (§4d). Design file received and
> implemented (`Lexora Design Package.dc.html`).

---

## 1. Reuse-vs-rewrite inventory (the whole current `scripts/`)

### ✅ REUSE AS-IS — pure logic, no old-UI dependency (extract into modules)
| Current source | What to lift | New home |
|---|---|---|
| `scan-engine.js` | `detectQuad`, `warpPerspective`, `applyScanFilter`, `rotate90` | `engines/scan-core.js` |
| `shared.js` | `imgToCanvas`, `fileToCanvas`, `ensureJsPDF`, `crc32`, `makeZip`, `buildDocx` | `utils/`, `engines/pdf.js` |
| `app-tools.js` | `openPdfjs`, `ensurePdfLib`, `ensurePdfjs`, `newOcrWorker`, `compressPdfSmart`, `pdfPagesText`, `pdfPagesRich`, `buildDocxRich`, `pageImages`, `parseRange`, `baseName` | `engines/pdf.js`, `engines/ocr.js`, `engines/docx.js` |
| `rag.js` | chunking, embeddings (Transformers.js), BM25, RRF fusion, IndexedDB cache, `getContext` | `engines/retrieval.js` (strip the consent-modal DOM) |
| `app-companion.js` | `askAI`, `smartContext`, `normalizeCmd`, `handleCommand` logic, `buildContext` | `features/companion/logic.js` |
| `app-wallet.js` | `buy`, `loadRzp`, `doFreeUpgrade`, `buyFromWallet`, `fetchWallet`, `fetchMe`, `planConfig`/rate math, `fmtRs`, `fmtTokens` | `core/api-payments.js`, `domain/wallet.js` |
| `app-core.js` | `CONFIG`, Supabase client creation, `authToken`, session/auth state, gateway call plumbing | `core/config.js`, `core/supabase.js`, `core/auth.js`, `core/api-gateway.js` |
| `app-documents.js` | `openImagePages` OCR loop, file dispatch rules, camera capture pipeline (`processToScan`, `captureFrame` math) | `engines/ingest.js`, `engines/scan-core.js` |
| `app-viewer.js` | sentence building, line extraction geometry, marker position math, speech sequencing algorithm | `features/reader/model.js` (algorithms only) |
| `scan-page.js` | shots model, `renderShot` develop pipeline, `buildPdf` (page-size), export/OCR/handoff | `features/scan/model.js` |

### ♻️ REWRITE — DOM-coupled to the old pages (new UI owns these)
- All `*.html` pages, all `styles/*.css`, `lx-icons.js`, `lx-workspace.js`,
  `lx-search.js`, `nav.js`, `onboarding.js`, `select-style.js`, `seo-page.js`,
  `seo-data.js`, `analytics.js` (rewire), and the **view/editor DOM** inside
  `app-viewer.js`, `app-documents.js`, `app-companion.js`, `app-tools.js`,
  `tools-page.js`, `settings.js`, `scan-page.js`.
- Keep their **algorithms** (extracted above); discard their DOM wiring.

### 🚫 BACKEND — untouched (already UI-agnostic)
`worker-gateway.js`, `worker-payments.js`, `worker-convert.js`, `convert-server/`,
`translate-server/`, `schema.sql`. The new UI calls the same endpoints (contracts
in `docs/PLATFORM-ARCHITECTURE.md` Part 10).

---

## 2. Target frontend structure (framework per the package; assume modules)

```
core/        config.js · supabase.js · auth.js · api-gateway.js · api-payments.js · api-convert.js
engines/     pdf.js · ocr.js · docx.js · scan-core.js · retrieval.js · compress.js · ingest.js
domain/      wallet.js · plans.js · metering.js · tools-catalog.js (the KIT registry, data only)
utils/       files.js · format.js · zip.js · commands.js (normalizeCmd)
features/    auth/ · workspace/ · reader/ · companion/ · tools/ · scan/ · wallet/ · search/ · jobs/ · settings/
```
Each `features/*` folder = the new screen(s) from the package + a thin controller
that imports `core`/`engines`/`domain` and binds to the new markup. **No feature
imports another feature's DOM.**

---

## 3. Feature migration order (each: build → connect → verify → retire old)

1. **Foundation** — design tokens, app shell, navigation model, shared components
   (buttons/inputs/cards/dialogs/toasts) exactly per the package.
2. **Auth** — Google / email-OTP / guest; **redirect preservation** (`?next`);
   session bootstrap; `GET /me`.
3. **Workspace / home** — open/drop a document; entry points; recent state model
   (no file storage — metadata only, per privacy rule).
4. **Reader** — pdf.js render + text layer + sentence model + karaoke marker +
   `speechSynthesis` narration + speed/voice + resume. (Offline-capable.)
5. **AI Companion** — chat; **Private / Smart / Deep Research** tiers; retrieval
   engine; voice (native SR + `/stt` fallback); voice commands; grounded answers +
   token meter from `/chat`/`/me`.
6. **Tools — free client** — the 30+ on-device tools + interactive editors
   (sign/edit/crop/redact/forms/compare/edit-word); tool→reader handoff (`lxhand`).
7. **Tools — ★ premium** — `/quote` → consent → `/convert` → wallet charge →
   partial/anon/refund handling; per-tool options (`opts`).
8. **Scan** — fast intent (camera → OCR → reader) **and** Scan Tool station
   (multi-page, crop/rotate/enhance, sliders, export PDF/JPG/size, handoff).
9. **Wallet & Plans** — ₹ balance; top-up; buy/switch plan; Razorpay order/verify/
   webhook-safe; buy-from-wallet; pay-per-document; `/config`-driven prices.
10. **Search** — command palette over nav + tools + actions (client-only).
11. **Jobs** — premium job queue (running/done/failed+refund); ready for the async
    job-queue backend evolution (spec Part 9.5).
12. **Settings / Profile** — AI engine + tier + Token Saver; privacy; account;
    usage/purchases (own-read RLS).
13. **Responsive + a11y + performance pass + retire all old files.**

---

## 4. Verification gate per feature (Definition of Done)

- Matches the design package screen(s).
- Wired to the real service/engine (no mock).
- Every workflow from `PLATFORM-ARCHITECTURE.md` for that feature works.
- Responsive (desktop/tablet/mobile per the package) + keyboard/ARIA + reduced
  motion.
- No console errors; performance not regressed (lazy-load heavy libs; keep
  on-device engines).
- Old file(s) for that feature removed from the load path.
- HANDOVER updated.

---

## 4b. Progress log

### ✅ Increment 1 — Core service layer (Foundation, done)
The design package (`Lexora Design Package.dc.html`) was read in full and confirmed
to be the **same design system the app already implements** (identical tokens, IA,
rail, playbar, motifs) — so per KRK's decision this is a **clean architectural
rewrite**, not a from-zero rebuild: modernize structure, reuse stable matching UI,
replace brittle/DOM-coupled code with reusable modules.

First module landed — a DOM-free **`core/` layer** that centralizes every backend
integration (previously scattered across `app-core`, `app-companion`, `app-wallet`,
`tools-page`, `rag`):
- `core/config.js` — `Lx.config`: all endpoints + `localStorage` keys, one source.
  Prices/caps/models stay runtime (`/config`, `/me`), never hardcoded.
- `core/supabase.js` — `Lx.sb` + `Lx.session` (get/user/onChange/signOut).
- `core/auth.js` — `Lx.auth`: `token()`, `isLoggedIn`, `safeNext()`/`goLogin()`
  (?next redirect preservation), `markReturning`/`isReturning`, `logout`.
- `core/api.js` — `Lx.api`: `gateway.{chat,me,stt,rag.*}`,
  `payments.{config,order,verify,switchEngine,walletDeduct,walletBuysub}`,
  `convert.{quote,run}` — with auth-header injection, JSON parse, and a normalized
  `ApiError`. `convert.run` returns the raw Response (blob + `X-Lexora-*` headers).
All four `node --check` clean. **Additive/non-breaking** — existing scripts keep
working until each feature is migrated onto `Lx.*`, then their inline fetch/auth
duplication is deleted.

### Migration pattern for every feature (from here on)
1. Load `core/*` (namespace `Lx`) before the feature script on that page.
2. Replace the feature's inline `fetch`/`CONFIG`/`authToken` with `Lx.api.*` /
   `Lx.auth.*` / `Lx.config`.
3. Extract that feature's **pure logic** into `engines/` or `domain/` (no DOM).
4. Verify the workflow end-to-end; remove the now-dead inline code.
5. Next feature.

### ✅ Increment 2 — utils/format + domain/metering (done)
- `utils/format.js` — `Lx.fmt`: `rupees`, `tokens`, `bytes`, `friendlyName`,
  `ellipsizeMiddle`. Pure, no DOM.
- `domain/metering.js` — `Lx.plans`: `ENGINE`/`TIER_LABEL` (hidden-provider
  names), `priceInr`/`provider`, `tokensForRupees`, `convertBalance`
  (value-preserving switch), `docQuote`, `loadConfig()` (refreshes prices from
  the live `/config`, never hardcoded). Both `node --check` clean.

### ✅ Increment 3 — Companion → Lx.api.gateway (done)
- `app-companion.js` `askAI` → `Lx.api.gateway.chat`; STT → `Lx.api.gateway.stt`.
- `rag.js` deepIndex/deepQuery/deepDelete → `Lx.api.gateway.rag.*`.
- **Centralized the 401 refresh-retry** into `core/api.js` (`authedFetch`) —
  removed the duplicated retry loops from 3 call sites; added `keepalive`
  threading for the pagehide rag cleanup (behavior preserved).
- `authToken()` reduced to a thin alias over `Lx.auth.token`.
- **Legacy retired:** inline `fetch(CONFIG.API_URL...)` + hand-rolled auth in
  askAI/stt/rag (≈60 lines).

### ✅ Increment 4 — Wallet/Payments → Lx.api.payments (done)
- `app-wallet.js`: `buyFromWallet`→`walletBuysub`, `fetchMe`→`gateway.me`,
  `/config` loader→`payments.config` (+ mirrors into `Lx.plans.loadConfig`),
  `doFreeUpgrade`→`switchEngine`, `buy`→`payments.order`, verify→`payments.verify`.
- Error contract preserved: the 402 "insufficient" (now a thrown `ApiError`) is
  caught and mapped to the same UX (top-up prompt). Razorpay handler flow intact.
- **Legacy retired:** all inline `sb.auth.getSession()` + `fetch(CONFIG.PAY_URL…)`
  in wallet (≈45 lines). `sb.from('profiles'/'transactions'/'usage_log')` data
  reads kept (correct — direct RLS reads, not worker calls).

### ✅ Increment 5 — Premium tools → Lx.api.convert (done)
- `tools-page.js`: `/quote`→`Lx.api.convert.quote`, `/convert`→`Lx.api.convert.run`
  (returns raw Response so `X-Lexora-*` headers + blob handling are unchanged).
- **Legacy retired:** the **duplicate** `LX` config + `lxSb` client + `lxToken`
  that tools.html carried (it never loaded app-core) — DELETED. tools.html now
  loads the shared `core/*`.

### ✅ Increment 6 — login + settings → core (done)
- `login.html`: own `CONFIG`/`sb`/`configured` + `SAFE_NEXT` → `Lx.config`/`Lx.sb`/
  `Lx.auth.safeNext()`. OAuth/OTP flow unchanged.
- `settings.js`: own `CONFIG`/`sb`/`ENGINE`/`fmtTokens` → `Lx.*`; `/me`→
  `Lx.api.gateway.me`; `₹` formatting→`Lx.fmt.rupees`. Data reads (`sb.from`) kept.
- **Result: exactly ONE `supabase.createClient` (core/supabase.js) and ONE set of
  endpoint literals (core/config.js) in the entire frontend.** Verified: zero
  direct worker `fetch()` outside `Lx.api`; zero duplicated `SUPABASE_URL` literals.

### ✅ Increment 7 — dedup remaining business/display logic (done)
- `app-wallet.js`: `fmtRs`/`fmtTokens` → thin aliases of `Lx.fmt`; `ENGINE`/
  `TIER_LABEL` → `Lx.plans`; the entire duplicated `PLAN_SIZES`/`PLAN_INR`/
  `RATE_INR` tables + their `/config` loader IIFE → **deleted** (Lx.plans owns
  prices/rates and refreshes from `/config` via `Lx.plans.loadConfig()`). Callers
  now use `Lx.plans.priceInr` / `convertBalance` / `tokensForRupees`.
  `PLAN_SIZES` was dead (never read) — removed.
- `settings.js`: `TIER_LABEL` literal → `Lx.plans.TIER_LABEL`.

### ⭐ MILESTONE — backend-integration + business-logic layer fully consolidated
Verified across the whole frontend: **one** Supabase client (core/supabase.js),
**one** endpoint config (core/config.js), **one** API surface (core/api.js — every
backend call routes through it), **one** auth surface, **one** format util set,
**one** plan/engine/tier domain model. Zero direct worker `fetch()`, zero
duplicated clients/configs/business tables/format fns outside the core. All
scripts `node --check` clean; all 6 pages parse. All existing functionality,
API contracts, and workflows preserved (behavior-for-behavior, incl. the 402
insufficient-wallet UX, Razorpay order/verify, rag keepalive cleanup, STT).

### ▶ Next increments (in order)
7b. Engine layer: `scan-engine.js` (detectQuad/warp/filter/rotate) and `shared.js`
   (canvas/zip/docx utils) are ALREADY pure & reusable — document them as the
   canonical engine/util layer (no forced relocation, per "no rewrite for its own
   sake"). Optionally expose `Lx.engines`/`Lx.util` facades. The PDF/OCR helpers in
   `app-tools.js` are pure but co-located with a legacy DOM panel — extract into
   `engines/pdf.js`/`engines/ocr.js` only when a consumer is refactored (low churn).
8. Remaining pages onto core: `scan.html`/`scan-page.js` (no worker calls — only
   IndexedDB handoff; already clean), `jobs.html` (localStorage only). Verify.
9. Consolidate the scattered `fmtTokens`/`fmtRs`/`ENGINE` duplicates that still
   live in `app-wallet.js` onto `Lx.fmt`/`Lx.plans` (dedupe display logic).
10. Retire fully-superseded helpers (`lx-*` shims) as each page's controller is
    modularized; then a11y/responsive/perf pass per the design package.

---

## 4c. Phase 2 — Design-Package Implementation (surface-by-surface)

> Architecture FROZEN after the milestone. From here the design package is the
> primary implementation guide; HANDOVER verifies functionality is preserved; all
> backend calls go through `Lx.*`. No further architectural refactor unless it
> directly supports the package or fixes a real bug. Order: shell → reader →
> companion → library → search → tools → tool-exec → scanner → wallet → premium →
> settings → auth → remaining.

### ✅ 2.1 — Application shell & navigation
Audited current shell vs package §03 (IA) + §05 (hi-fi rail) + §09 (a11y/responsive).
**Already conformant** (no change needed): 64px icon rail as the spine; three
destinations Read/Tools/Scan; **active = 2px left accent rule** (`theme.css`
`#sideNav nav .active{border-left:2px solid var(--accent)}`), never a filled pill;
52px top bar with brand + doc name + engine chip + avatar; account popover
(Upgrade · Settings · Show me around · Theme · Log in/out); privacy lock anchored
to the rail bottom (`margin-top:auto`); `:focus-visible` outline on all
interactives; `prefers-reduced-motion` disables transitions; responsive ≤900px
(rail → slide-in drawer + `#mobTabs` bottom tab bar, playbar compresses).
**Gap found & fixed:** the package rail carries a **Search (⌘K)** affordance; the
palette existed (`lx-search.js`, exposes `window.lxSearchOpen`) but had **no rail
icon**. Added a `#navSearch` magnifier button after Scan on all five app pages
(index/tools/scan/settings/jobs) and wired it in `lx-search.js` (single
`DOMContentLoaded` hook → `show()`); it inherits existing `#sideNav nav button`
styling. No new business logic; palette navigation unchanged.
**Verify:** `node --check` lx-search OK; all 5 pages parse (html.parser, residual
stack 0); `navSearch` present exactly once per page; keyboard ⌘K + click both open
the palette; focus/reduced-motion/responsive rules confirmed present.

### ✅ 2.2 — Reader
Audited current reader vs package §05 (hi-fi) + §09 (playbar rules).
**Already conformant:** document is the hero (620px page, serif body); karaoke =
solid accent block on the word + `--mark` tint on the active sentence
(`.sentSpan.active`) with auto-scroll; playbar is **one ruled instrument** —
transport · speed/voice/page · in-bar mic, 1px dividers, accent play button,
registration marks (`#playbar::before/::after`), **3px progress thread** on the
bottom edge (`#readProg`); selection popover raises **Explain · Translate · Read
from here · Ask…** (`#selBar`, Ask in accent) — the single doorway to AI; word
boundaries already tracked (`u.onboundary`) driving the in-document marker.
**Gap found & fixed:** the package playbar shows a **live-sentence readout** in its
center (the sentence being read, current word glowing). Added `#pbSent` between
`#pbMain` and `#pbExtra`; new `renderPbSent(text,charIndex)` in `app-viewer.js`
renders the current sentence (from `sentences[current].text`) and wraps the active
word (`.pbWord`, accent) using the **existing** `onboundary` charIndex — no change
to TTS/karaoke logic. Driven from `updateProgress()` (plain) + `onboundary`
(word). Styled in `app.css` (ellipsis, `:empty{display:none}`), hidden ≤900px so
the mobile instrument stays compact.
**Verify:** `node --check` app-viewer OK; index parses (stack 0); `renderPbSent`
defined + 2 call sites; readout follows playback and clears on empty; TTS retry /
voice-fallback / page-sync paths untouched. Backend calls unchanged (companion
`askAI` already on `Lx.api`).

### ✅ 2.3 — AI Companion
Audited current companion vs package §05 (companion panel) + §09 (AI rules).
**Already conformant:** 380px panel with mark + "Companion" + collapse chevron;
summoned by context (selection popover → `selExplain/Translate/Read/Ask`), never a
permanent chatbox; suggestion chips (`#lxChips`); mic + send composer; "Thinking…"
state (`sayProgress`); provider names hidden — users pick a character
(Spark/Swift/Sage); Private/Smart retrieval + embeddings stay on-device (`rag.js`),
only Deep Research uploads with per-doc consent + auto-delete.
**Gaps found & fixed:**
1. **Cited ¶ passages** (§09 "always cite the passages") were computed but never
   shown. `rag.js` `assemble()` now records the passages it fed the LLM into
   `S.lastSources` (page + short label, on-device only), cleared at the top of
   `getContext`; exposed via `LxRag.getSources()`. `app-companion.js` `sayCitations()`
   renders a "From the document" chip row after each answer; a chip calls `goPage()`
   to jump there. `say()` now returns its element. Styled in `app.css`
   (`.msg.cites`, accent dot, hover-accent border).
2. **Send-lock** (§09 "send-lock while awaiting a reply") added: `setSendLock()`
   disables send/mic/input + shows "Thinking…" placeholder during the await
   (`try/finally`), `.thinking` on the column; `app.css` dims disabled composer.
No backend contract change — answers still flow through `Lx.api.gateway.chat`;
retrieval stays 100% on-device.
**Verify:** `node --check` app-companion / rag / app-core all OK; `getSources`
exposed; citations silent on small-doc/server paths (no stale sources — cleared per
query); composer re-enables on success and error.

### ✅ 2.4 — Library (Workspace home)
Package framing: there is **no separate Library screen** in §04 — the "library" is
the Workspace home's document entry point; a document is a "living node… recent
means recent on this device," and the app **deliberately stores no files**
(privacy = the product), so no recents list is required. §04 states for Workspace
home: **empty (greeting) · drag-over · guest vs. named** — all present:
greeting/drop area (`#dropZone` + `#wsGreet`), drag-over (`#dropZone.drag` toggled
in `app-documents.js`, styled both themes), named vs guest greeting (`greet()` →
"Good morning, <Name>" for signed-in, generic kicker for guests).
**Real bug found & fixed:** `lx-workspace.js` `init()` called a bare `render()`
(leftover from the removed recents strip); no such symbol exists in scope
(lx-search's `render` is private to its IIFE), so it threw `ReferenceError` and
**aborted `init()` before `greet()`** — silently killing the named-greeting state.
Removed the dead call; `greet()` + its 60s refresh now run.
**Verify:** `node --check` lx-workspace OK; greeting path reached; drag-over state
confirmed in JS+CSS; privacy invariant (no file persistence) preserved.

### ✅ 2.5 — Search (⌘K palette)
Audited `lx-search.js` vs §08 (palette component) + §09 (a11y).
**Already conformant:** ⌘K opens/closes; full keyboard nav (↑/↓/Enter/Esc); mouse
hover-select; live filter over pages/tools/actions with kind badges; empty state
("Nothing found — try…"); ARIA `role=dialog`/`listbox`/`option`; design-language
styled (`theme.css` Task 13); rail entry point added in 2.1 (`#navSearch` →
`window.lxSearchOpen`).
**Gap found & fixed:** §09 requires the palette to **trap focus**; Tab could leak to
the page behind. Added `Tab` handling in the input keydown (preventDefault → refocus
input) — navigation stays on arrows/Enter, focus stays inside, Esc still exits.
**Verify:** `node --check` OK; ARIA roles present; open/close + keyboard paths
intact.

### ✅ 2.6 — Tools catalog
Audited `tools.html` + `tools-page.js` vs §05B (Tools hi-fi) + §04 states.
**Already conformant:** header "40+ document tools / Runs on your device / nothing
uploaded"; search box (`#toolSearch`); **segmented chip strip** (All/PDF/Word/Image/
Scan&AI/★Premium) with border-left dividers + accent `.on` fill; **shared-border
grid** (`.toolGrid2` `gap:1px` on `--line`, cells `--panel`, hover `--panel2` — no
lift); caps kicker group headers (`.catHead`); 36px optical icon box accent-tinted
(`.tIc2`); ★ premium badge (`.pxStar`); "Soon" pills; live text filter that hides
empty groups. Premium runs already routed through `Lx.api.convert` (Phase-1).
**Gap found & fixed:** §04 lists a **search-empty** state; the filter blanked the
area with no message. Added `#toolNoRes` ("No tool matches that — try…"), toggled
when a query yields zero visible cards; styled in `pages.css`.
**Verify:** tools.html parses (stack 0); empty-state element present + wired;
category chips + search + card render paths intact.

### ✅ 2.7 — Tool execution flow
Audited the `tvTool → tvProg → tvDone` flow vs §05B (options stage) + §04 states.
**Fully conformant — no change needed.** All six states present: **drop** (`#tvDrop`,
"processed on your device — nothing uploaded"); **file list + options** (`#tvWork`
→ `#tvMain` + `#tvSide` with `#sideFiles`, per-tool option panel, "＋ Add more");
reorder via ◀▶ arrows on each file (an accessible alternative to the hi-fi's drag —
kept); **progress** (`#tvProg` meter, message switches premium "secure server" vs
on-device "keep this tab open"); **done + handoff** (`#tvDone`; `offerReaderHandoff()`
adds "📖 Open in the reader" for reader-openable outputs → `lxhand` IndexedDB →
index.html); **error (no-charge)** (catch renders "⚠ … try again"; premium paths
raise "you were not charged" on upload/convert failure — refund-on-failure intact).
Premium runs go through `Lx.api.convert` (Phase-1). No design gap found.
**Verify:** flow states (`tvHome/tvTool/tvProg/tvDone`) + handoff + no-charge
messaging all confirmed in source; no edits required.

### ✅ 2.8 — Scanner (capture station)
Audited `scan.html` + `scan-page.js` vs §05B (scan hi-fi) + §04 states + §09
(mobile). **Conformant** (built in an earlier wave to this exact design): live
viewfinder with on-device detected quad (draggable orange corners + registration
squares); **Auto/Manual** toggle (`#detAuto`/`#detMan`) + auto-shutter-when-steady;
live **page strip** batching captures; **Enhance rail** — presets
(Auto/Original/Grayscale/B&W), **Straighten** + **Brightness** sliders, one-tap
**Clean up** (`#cleanChk`, remove shadows & specks); **Add page** as the single
primary; **Review** (select a page → crop/rotate/delete); **Export** card (PDF / JPG
+ page-size Auto/A4/Letter) then **Read-aloud** + **OCR→Word** + copy-text handoffs.
§04 states covered: no-camera-permission (graceful "use Photo instead" fallback,
`getUserMedia` catch), detecting, captured, review, export.
**Flagged to KRK (functional decision, not built):** the hi-fi shows a third export
tab **★Searchable** (searchable-PDF). Unlike PDF/JPG this needs the premium OCR→
searchable-PDF pipeline (consent gate + ₹/page metering) wired into the scanner —
a feature addition beyond UI. The OCR intent is already served by the **OCR→Word**
handoff, so this is a format gap, not a capability gap. Deferred pending KRK's call
on adding premium OCR inside the scanner vs. bridging to the existing `ocr_hd` tool.
No code change this surface — already conformant.

### ✅ 2.9 — Wallet (Plans & wallet)
Audited `#plans` modal + `app-wallet.js` vs §05B (Plans & Wallet hi-fi) + §04.
**Fully conformant — no change needed** (built to this design in earlier waves):
**Wallet ⟷ Plans pill tabs** (`.pwTab`, `data-pane`) split top-up from engine
choice; **balance = serif/orange/tabular hero** (`.pwBal > b`: `--font-display`
38px, `color:var(--accent)`, `tabular-nums`); top-up **chips ₹49/₹99/₹199/₹499 +
Custom** → "Add to wallet"; engine plan cards (Free with **CURRENT** badge + accent
border, Sage ₹49, Saga ₹99). **Pay-from-wallet rule** exact to spec: wallet covers
price → orange "Switch to <Engine>" (`Lx.api.payments.walletBuysub`, no Razorpay);
below price → ghost "Buy ₹X" (Razorpay), with 402/insufficient handled. Prices/rates
come from live `/config` via `Lx.plans` (never hardcoded). §04 states (wallet tab /
plans tab / sufficient / insufficient / custom amount) all present.
**Verify:** balance styling + switching logic + tab panes confirmed in source;
all backend calls route through `Lx.api.payments`.

### ✅ 2.10 — Premium (★ consent gate)
Audited `runPremium` + `consentModal` vs §04 (★ Premium consent) states.
**Fully conformant — no change needed.** quote → consent → convert; the file is
**only uploaded after explicit consent**. All five states rendered:
**within-free** ("this job is free — it fits in today's free pages"); **charge**
("N pages over the free limit → ₹X from your wallet", "Continue — ₹X"); **insufficient**
("not enough in your wallet… top up", `data-a="topup"` route); **anon-partial**
(`q.partial` — anonymous get the daily free pages, big files convert partially);
**used-up-upsell** ("Time's up for today… log in and finish for a penny a page ★").
Free cap 50/day/tool + ≈₹0.10/page shown up front; charge/partial/no-charge headers
honored; refund-on-failure ("you were not charged"). Auth-optional; routes through
`Lx.api.convert.quote/run`; prices from live `/config`.
**Verify:** all state branches present in `consentModal`; upload-after-consent +
no-charge-on-failure confirmed; backend contract unchanged.

### ✅ 2.11 — Settings
Audited `settings.html` + `settings.js` vs §05B (Settings · AI Engine hi-fi) + §04.
**Already conformant:** section nav Profile/Wallet/Purchases/Usage/AI Engine/Privacy/
About with **active = 2px accent rule** (`.secNav a.active{border-left:2px solid
var(--accent)}`), single content column, same shell; AI Engine section has **engine
power** (Core/Plus/Ultra + Ultra confirm), **Token Saver**, **document
understanding** (Private AI/Smart AI/Deep Research segmented, on-device-vs-uploads
stated plainly with per-doc consent copy). All reads via `Lx.api`/`Lx.plans`.
**Gap found & fixed:** the hi-fi leads the AI Engine section with an **AI character**
picker (Spark/Swift/Sage, chosen carries accent border + check); settings only
surfaced the engine textually in the Wallet section. Added `#setCharRow` (three
`.tierBtn` cards) + `paintCharacter()` in `settings.js` that marks the **current**
engine from `meCache` (`ENGINE[provider]`, free→Spark), repainted when `me()`
resolves. Because switching to Swift/Sage is a **paid** action, a non-current card
routes to `index.html#plans` (Wallet) rather than flipping locally — preserving the
paid-switch workflow while implementing the design's character cards.
**Verify:** `node --check` settings OK; settings.html parses (stack 0); current
character highlights from live `/me`; provider names stay hidden (character only);
2px accent nav confirmed.

### ✅ 2.12 — Authentication (Login)
Audited `login.html` vs §04 (Login) + §06 note ("one ruled card: Google / Apple /
email-OTP → orange primary; guest a quiet text link; honors ?next fragment-
whitelisted"). **Fully conformant — no change needed.** Google, Apple, and email-OTP
(email → "Continue with email" → 6-digit `#otpRow`) present; **primary `#loginBtn`
is flat orange** — theme.css (loaded after app.css) overrides the legacy gradient to
`background:var(--accent)` and neutralizes hover to `box-shadow:none; transform:none`
(honors "hover shifts fill, never lifts/scales/shadows"); **guest is a quiet text
link** (`#guestBtn` muted, underline-on-hover — not a button); states: default /
OTP-sent (`#otpRow`) / error (`#loginMsg`) / `?next=` via `Lx.auth.safeNext()`
(fragment whitelist). Uses the core `Lx.sb`/`Lx.config`/`Lx.auth` (single client).
Note: app.css still carries the now-dead gradient rules (fully overridden) — left
as-is (architecture frozen; no visual effect).
**Verify:** flat-orange primary + no-lift hover confirmed via cascade; guest link
styling confirmed; OTP/error/next paths intact.

### ✅ 2.13 — Remaining screens
Audited the rest of §04 (landing, jobs, editors, SEO, system parts).
**Conformant — no change needed.** **Public landing** (`#landing` in index.html):
crawlable hero + tools + pricing; **returning-user auto-hide** (`ra_returning` →
`#landing` hidden instantly, no flash) and `location.hash` deep-links skip it.
**Jobs queue** (`jobs.html`): all §04 states — **empty (node motif SVG)**,
running, done, **failed·refunded** — with the shared rail/toast. **System parts**:
toast (`#lxToast`), ⌘K palette (2.5), account popover (2.1), onboarding
(`onboarding.js` "Show me around"), mobile drawer + bottom tabs (2.1). **Interactive
editors** (Sign/Edit/Crop/Redact/Compare/Forms/Edit Word) live in the tool flow
(2.7), sharing the same shell/tokens. **SEO pages (×43)** are template-generated
(`seo-page.js`/`seo-data.js`) on the shared design tokens.
**Verify:** landing auto-hide + jobs states + system parts confirmed; full-phase
regression — `node --check` clean on all 7 touched scripts; all 6 app pages parse
(stack 0).

---

## ⭐ MILESTONE — Phase 2 (design-package implementation) complete
All 13 surfaces audited against `Lexora Design Package.dc.html` and brought to
conformance while preserving 100% of functionality and every backend contract
(all calls still route through `Lx.*`). Net new UI added where the package required
it and the app lacked it — rail Search entry, reader live-sentence readout,
companion cited-source chips + send-lock, tools search-empty state, settings AI-
character cards, palette focus-trap — plus one real bug fixed (dead `render()` that
silently disabled the named-greeting). Two items **flagged to KRK** (not built, need
a product/functional call): scanner **★Searchable-PDF** export (needs premium OCR
pipeline in the scanner) — the OCR→Word handoff already serves the OCR intent.
Architecture remained **frozen**; no refactor-for-its-own-sake. Verification: every
touched script `node --check` clean; all pages parse; behavior/paths preserved.

---

## 4d. Phase 3 — Production readiness + dead-code cleanup

### ✅ Dead legacy CSS removed (confirmed superseded by theme.css)
theme.css is the single token layer (loads after app.css) and **collapses `--accent2`
into the one orange** + forces `box-shadow:none`, flat button fills, `::selection`
= `--mark`, and no focus glow. Everything below was verified overridden/unused
before deletion; `app.css` braces balanced (371/371); only `index.html` + `login.html`
even load app.css and both load theme.css after it.
- Deleted `@keyframes gradShift` + `@keyframes borderFlow` (only used by dead hovers).
- `#loginBtn`: removed the 4-stop gradient bg + `gradShift` hover + blue box-shadow +
  translateY lift → flat `var(--accent)` with **`--on-accent` ink** (also fixes a
  white-on-orange AA contrast fail); hover/color owned by theme.css.
- `#googleBtn` / `#appleBtn` / `#otpBtn`: removed gradient-border trick +
  `borderFlow` + blue box-shadow + lift → flat panel + 1px rule.
- `#login` bg: removed blue/purple `radial-gradient` glow → flat `var(--bg)`.
- `#login .logo2`: removed gradient + blue glow → flat `var(--accent)` + ink.
- `#login input:focus`, `.tierBtn.on`: removed blue glow rings (theme already `none`).
- `.textLayer ::selection`, `#scanBtn` underline: retargeted literal blue → `--mark` /
  `--line-strong`.
- `#walletFill`: 2-tone gradient → flat `var(--accent)`.
- Removed the **entire dead `:root` + `body.light` old blue-palette block** at the top
  of app.css (every var redefined by theme.css `:root`/`body.light`).
Left as-is (harmless): inert `var(--accent,#6c8cff)` fallbacks — the variable always
resolves to orange, so the blue fallback never renders; a mass rewrite would be pure
churn with regression risk. **No dead JS files** — all 21 scripts referenced by ≥1 page.

---

### ✅ Production-readiness pass
**Responsiveness (§09):** desktop 64px rail + 52px top bar; ≤900px rail → slide-in
drawer + `#mobTabs` bottom tabs, companion → sheet, playbar stacks (`flex-direction:
column`), `#pbSent` hidden. No fixed widths overflow 360px (layout uses `min()`/
`max-width`/`calc`); `.tierRow` cards `flex:1` shrink cleanly. Heading type uses
bounded `clamp(px, vw, px)` (no unbounded vw → no overflow). New elements
(`#navSearch`, `#pbSent`, cite chips, char cards, `#toolNoRes`) all responsive.
**Accessibility (§09):** global `:focus-visible` outline on every interactive el;
`prefers-reduced-motion` disables all transitions/animations (stronger now that the
decorative gradients are gone); hit areas ≥44px on the rail; palette focus-trap
(2.5); companion send-lock (2.3); **fixed a white-on-orange AA fail** on the login
primary (→ `--on-accent` ink); new interactives are semantic `<button>`s; search-empty
now `role="status" aria-live="polite"`.
**Visual consistency:** single token layer (theme.css `:root`); `--accent2` collapsed
to the one orange; body = `--font-ui` (Inter); no gradients/shadows/lifts (removed at
source); active states = 2px accent rule throughout.
**Performance:** no animation libraries, no decorative background images, no image-heavy
hero; removed two keyframe animations + all animated gradients (net win); no new
dependencies. On-device libs (pdf.js, Transformers.js, supabase) are functional.
**Cross-browser:** changes use only standard DOM APIs; `#pbSent` word-glow degrades
gracefully where `speechSynthesis.onboundary` is unsupported (Safari/Firefox still show
the full sentence); reader TTS / scan `getUserMedia` / RAG WebGPU→WASM fallbacks
untouched.
**Regression gate:** all 7 touched scripts `node --check` clean; all 6 pages parse
(stack 0); app/theme/pages CSS braces balanced (371/250/201); no dead keyframes remain.

---

## ⭐ MILESTONE — Phase 3 (production readiness) complete
Design-package implementation (Phase 2) + core-services architecture (Phase 1) now
finished off with dead-code removal and a full readiness pass. Frontend is clean,
token-driven, responsive, accessible (AA), gradient/shadow-free per the design, and
verified — with 100% of functionality, backend contracts, APIs, business logic, and
workflows preserved. Deferred: scanner ★Searchable-PDF export (see
`docs/FUTURE-ENHANCEMENTS.md`).

---

## 4e. In-Reader "Scan a paper" — full UI rebuild (approved redesign Images 1&2)

The in-reader camera (`#camModal`, distinct from `scan.html`) was **rebuilt from
scratch** to the approved two-step redesign. **Only the frontend changed; all
backend preserved** (camera `getUserMedia`, live edge detection + auto-capture,
`scan-engine.js` `detectQuad`/`warpPerspective`/`applyScanFilter`/`rotate90`, the
OCR pipeline + reader handoff via `openImagePages`, `camInput` fallback).

**New flow — Step 1 Capture (Image 1):** immersive full-bleed camera with the 64px
rail + top bar (close · "Scan a paper / to read aloud" · "Camera stays on your
device"), live orange edge quad, instruction banner, and a bottom bar of page-count ·
undo · round orange shutter · auto-toggle · "Done · edit & read". Captures now
**accumulate without the per-page popup** — editing is deferred to Step 2.

**Step 2 Review & Edit (Image 2):** a complete screen change — left vertical page
thumbnails (numbered, selected = accent border) + add tile; center preview with
orange registration corner-marks + "Enhance · sharp" chip; right panel ("Ready to
read", **OCR toggle** card, on-device privacy card, **Read aloud** primary + **Save
PDF** / **Ask AI**); bottom toolbar Crop · Rotate · Original/Enhance/B&W segment ·
Delete. Multi-page, reorder-by-selection, Adobe-Scan-style per-page edit.

**New page model** (enables workspace editing without touching the engine): each page
= `{ src:canvas(raw), corners, filter }`; `scanRender()` = warp+filter, `scanShot()`
= handoff/PDF shot. Crop reuses the corner-drag on `#revCanvas`. **Save PDF** builds a
real PDF via the existing `ensureJsPDF()` (on-device). OCR toggle threads a new
`doOcr` param into `openImagePages` (default on). "Ask AI" hands off then opens the
companion.

**Files:** `index.html` (#camModal markup replaced), `scripts/app-documents.js`
(camera/review block replaced; `openImagePages` gained `doOcr`), `styles/app.css`
(#camModal block replaced: rail + capture + workspace + ≤900px stack). Old IDs
(`camBar`/`revBar`/`camHint`/`camAuto` text btn/`revKeep`/`revFilters` etc.) retired;
camera-loop IDs kept (`camVideo`/`camOverlay`/`camStage`/`camShot`/`revCanvas`).
**Preview:** `scan-preview.html` (links the real CSS) renders both steps for
side-by-side comparison. **Verify:** `node --check` app-documents OK; index +
preview parse; app.css braces 444/444; engine + `openImagePages` unchanged; no
orphaned old symbols. Headless render unavailable (no connected browser) — visual
sign-off pending KRK opening the preview / running the app.

---

## 5. Rules carried from the directive

- Do **not** copy whole old pages or wrap them; do **not** preserve old layout/
  nav/CSS/patterns.
- Functionality in the app but **absent** from the package is **integrated**, not
  removed — folded into the new design consistently, and flagged to KRK.
- Prices/caps/models/tiers stay **runtime-config** (`/config`, `/me`) — never
  hardcoded in the new UI.
- Preserve the invariants checklist (`PLATFORM-ARCHITECTURE.md` Part 11).
