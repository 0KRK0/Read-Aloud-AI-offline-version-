# Lexora AI — Project Handover (rev. 12 July 2026)

Hand this file + the whole `online/` folder to the next assistant. It contains
everything: what the product is, what is DONE, what is NEXT, the full architecture,
every file, the business model, the future roadmap, and all the hard-won traps.
Read it fully before touching code.

---

## 0. TL;DR for the new assistant

- **Product:** Lexora AI (lexoraai.online) — "Your AI Companion for Every Document."
  A browser web-app that reads documents aloud with karaoke highlighting, lets you
  ask an AI companion to explain any selected text, and bundles an iLovePDF-style
  suite of **client-side** document tools. Everything document-related runs 100% in
  the browser (privacy promise: files never leave the device). Owner: **KRK**
  (konarajeshkumar011@gmail.com). Made in India; payments in ₹.
- **Status:** Phases 1, 2, 3 are DONE. **Phase 4 (server-side "★ premium" engine) is NEXT.**
- **There is a separate OFFLINE version** (GitHub `0KRK0/Read-Aloud-AI-offline-version-`,
  keeps the name "ReadAloud AI"). Do NOT touch it. All work happens in `online/`.
- **Deploy:** Cloudflare Pages (custom domain lexoraai.online). Backend = Supabase
  (auth + Postgres) + two Cloudflare Workers. Registrar Namecheap, but DNS/SSL/Pages
  all on Cloudflare only.

---

## 1. PHASE STATUS

| Phase | Content | Status |
|---|---|---|
| 1a | Claude-style theme (near-black / off-white / single orange accent, NO gradients), left sidebar, companion collapse | ✅ DONE |
| 1b | Split the 176 KB single-file app into modules + dedicated login.html + index→login redirect | ✅ DONE |
| 2 | TRUE PDF compression (never larger), searchable-OCR alignment fix, richer PDF→Word; settings/tools/scan/privacy pages; iLovePDF-style tools v2 | ✅ DONE |
| 3 | Sign PDF, Edit PDF, Unlock (owner + password), Protect PDF; **universal ₹ wallet** (backend + frontend); big batch of UI/UX fixes; subdomain-redirect fix | ✅ DONE |
| **4** | **★ Premium server-side tools + conversion engine + wallet relocation** | ⬅ **NEXT — START HERE** |

---

## 2. ARCHITECTURE & COMPLETE FILE MAP (`online/`)

### Pages (each standalone HTML; all link `styles/theme.css`)
- **`index.html`** — the reader app (slim shell). Redirects to login.html when not
  logged in (guarded: not for `#guest`, not while auth tokens in the URL hash, and
  **not on the `tools.`/`scan.` subdomains**). Contains: `#login` overlay (fallback),
  `#sideNav`, header + 9-dot menu, `#viewerWrap` (dropzone/viewer/playbar/chatFab),
  `#assistCol` (companion), `#selBar`, `#plans` modal (with the **₹ wallet card**),
  `#tools` legacy panel (hidden), camera modal, consent banner.
- **`login.html`** — dedicated login (Google / Apple / email+OTP / guest→`index.html#guest`).
- **`tools.html`** — iLovePDF-style tools page (loads `app-tools.js` + `tools-page.js`
  + `select-style.js`). Declares `let pdfjsLib` inline.
- **`scan.html`** — camera scan page (live paper-edge detection, warp, filters, export).
- **`settings.html`** — Profile / Wallet / Purchases / Usage / General / **AI Engine** / Privacy / About.
- **`privacy.html`** (+ `terms.html` redirect → privacy.html#terms).
- `index.pre-1b.backup.html` — pre-refactor backup, ignore.

### Scripts (`scripts/`) — CLASSIC scripts sharing one global scope. ORDER MATTERS.
- **`shared.js`** — `$`, imgToCanvas, fileToCanvas, ensureJsPDF (loads jsPDF 2.5.1
  UMD → `window.jspdf.jsPDF`), crc32, makeZip, buildDocx. Also: on `tools.`/`scan.`
  subdomains it points internal nav links to the apex (NOTE: verify this — was
  discussed but confirm it's implemented if you rely on it). Loaded FIRST.
- **`scan-engine.js`** — pure scan math (detectQuad, warpPerspective, applyScanFilter,
  rotate90). Shared by in-app camera AND scan.html.
- **`app-core.js`** — CONFIG (Supabase URL/key, worker URLs), consent, state, auth,
  chat UI, voices. `session` is a **top-level `let`** (NOT on `window`). `setDocBusy()`
  toggles the reader's `#docSpin` loading spinner. initAuth's login redirect **skips
  `tools.`/`scan.` subdomains**.
- **`app-documents.js`** — file opening/dispatch, image pages, camera UI, save PDF/Word.
- **`app-tools.js`** — legacy quick-tools panel + ALL tool engine helpers
  (openPdfjs, ensurePdfjs, ensurePdfLib, compressPdfSmart, pdfPagesText/Rich,
  buildDocxRich, newOcrWorker, thumbPicker…). Also the **subdomain deep-link
  redirect** (`tools.`→tools.html, `scan.`→scan.html, clean-URL-safe).
- **`app-viewer.js`** — PDF render, karaoke marker, sentence building, speech, selection,
  password-protected PDF open (pdf.js `onPassword`).
- **`rag.js`** — the companion retrieval engine (Private AI / Smart AI / Deep Research;
  see §11 Step 5b). Chunking + Transformers.js embeddings (WebGPU→WASM) + IndexedDB +
  BM25 + fusion + intent routing + the Deep Research consent/upload client. Loaded on
  index.html between app-viewer.js and app-companion.js. Exposes `LxRag.getContext()`.
- **`app-companion.js`** — askAI, conversation commands, mic/STT; `smartContext()` wraps
  LxRag with fallback to the legacy buildContext. **`normalizeCmd()`**
  converts spelled numbers→digits + handles "beginning/top/first page" so voice
  commands ("go to page three") work for BOTH browser SpeechRecognition AND the
  OpenAI /stt fallback (both funnel through `sendChat`→`handleCommand`).
- **`app-wallet.js`** — token wallet/plans UI + theme + boot; **₹ wallet** (walletPaise,
  fetchWallet via Supabase, renderWalletMoney, fmtRs, top-up wiring, buy('wallet',…)).
- **`nav.js`** — sidebar + mobile drawer + 9-dot header menu + **Claude-style account
  popover** (`#acctWrap/#acctBtn/#acctMenu`: Upgrade / Settings / Show me around /
  Switch theme / Log in|out). Reads `session` directly (NOT `window.session`).
- **`onboarding.js`** — first-run **anchored spotlight tour** (highlights dropzone,
  companion, Tools/Scan/Plans nav, account). Auto-runs once (`ra_tour_done`), only
  once the app is shown (never over the login page). Re-openable via account menu →
  "Show me around" (`window.startTour`). Self-injects its own CSS.
- **`select-style.js`** — themed custom-dropdown enhancer over native `<select>`
  (keeps the real select, drives a styled popup; orange highlight). Loaded on
  index/tools/settings/scan. Skips `<select data-native>` (reader playbar Speed/Voice/Page).
- **`tools-page.js`** — the iLovePDF tools framework (`KIT[]` tool definitions, tool
  view, previews, run). Holds **Sign PDF**, **Edit PDF**, **Unlock**, **Protect**
  (see §3). Injects Sign/Edit CSS from JS (function `injectSignCss` at end of file)
  so styling survives pages.css browser caching. Lazy-loads `@cantoo/pdf-lib`
  (`ensureCantoo`) for encryption.
- **`settings.js`** — settings page (secNav, Profile, Wallet incl. **₹ balance**,
  Purchases, Usage, General, **AI Engine** = tier + Token Saver, Privacy, About).
- **`scan-page.js`** — scan.html logic.

### Styles (`styles/`)
- **`app.css`** — legacy app styles (login card, plans modal incl. **.walletCard**, playbar…).
- **`theme.css`** — Claude design system OVERRIDE (loaded after app.css). Palette:
  dark `--bg #111110` / light `#faf9f5` / single accent `--accent #e07a3f` (light `#c96431`),
  NO gradients, Georgia serif display headings. Holds sidebar/drawer/account-popover,
  the `.lxsel` custom-dropdown styles, the `#lxToast` toast, the loading spinner
  `.lxSpin`, the acctMenu icons.
- **`pages.css`** — standalone-pages shell + tools v2 UI + AI-engine tier styles +
  Sign/signature-pad styles + mobile tool layout (sticky-bottom options panel).
- Load order on index: app.css → theme.css. On standalone pages: theme.css → pages.css.

### Backend (all live)
- **`schema.sql`** (run in Supabase SQL editor, idempotent): profiles (+ token wallet
  + **`wallet_paise` ₹ wallet**), transactions, usage_log, **tool_log**; RPCs
  credit_tokens/deduct_tokens + **credit_wallet/deduct_wallet** + **tool_pages_today**;
  RLS own-read; signup trigger. URL `https://lgwqqytjqoenozhjhbkr.supabase.co`.
- **`worker-gateway.js`** — chat worker: POST /chat (free tier→Nova/4o-mini, paid→
  Claude/OpenAI by plan, tiers Core/Plus/Ultra, token metering), /stt (OpenAI
  transcribe), GET /me. Deployed `readaloudai.konarajeshkumar011.workers.dev`.
  **NOTE:** /me does NOT yet return `wallet_paise` — the frontend reads it via
  Supabase directly. Add it to /me in Phase 4 if convenient.
- **`worker-payments.js`** — Razorpay: /order (plans, doc, topup, **wallet**), /verify,
  /switch, /webhook, /config, **/wallet/deduct**. Deployed `readaloudai-pay….workers.dev`.
- **`SETUP.md`, `SETUP-BUSINESS.md`, `DEPLOY.md`** — setup/deploy docs (may be slightly
  stale — update as you go).

### lib/ (bundled, work from file://)
- `pdf.min.js` + `pdf.worker.min.js` (pdf.js 3.11.174 legacy), `lib/ocr/` (tesseract.js
  5.1.1 + core wasm), `lib/lang/eng.traineddata.gz`, `mammoth.browser.min.js`,
  `lib/cmaps/`, `lib/standard_fonts/`. jsPDF + pdf-lib + @cantoo/pdf-lib are lazy-loaded
  from cdnjs/jsdelivr.
- Local dev: `Start ReadAloud AI.bat` runs `server.ps1` (PowerShell HttpListener, port 8977).

---

## 3. TOOLS (`tools-page.js` `KIT[]`)

**LIVE (client-side, free, private):**
merge, split, remove, organize, rotate, compress (true never-larger), repair, ocr
(searchable), jpg2pdf, word2pdf, pdf2jpg, pdf2word (OCR fallback), pdf2text, pdf2md,
watermark, pagenum, unlock, imgcompress, imgresize, img2text, word2txt, word2md,
**edit**, **sign**, **protect**, and (Step 5, 13 July) **crop**, **redact**, **forms**
(fill), **compare**, **editword**, **pdf2ppt** (page-per-slide images). Plus link cards:
scan→scan.html, summarize→index.html.

**LIVE (★ premium, server, consent + 50 free pages/day):** compress_hd, ocr_hd,
word2pdf_hd, pdf2word_hd (toggles on the dual tools), ppt2pdf, excel2pdf, pdfa,
**pdf2excel**, **html2pdf** (URL input), **translate** (needs TRANSLATE_SERVER_URL →
`online/translate-server/`, our NLLB-200/MarianMT service).

### The four Phase-3 tools (details)
- **Sign PDF** (`preview:'sign'`): interactive editor — **Draw / Type / Import** a
  signature (ink-colour picker; type has font family + size); renders the real PDF
  pages; **drag & resize** the signature onto any page; multi-page nav; stamps via
  pdf-lib `embedPng` + `drawImage`. Functions: signOptsHtml, initSignPanel,
  renderTypePreview, loadImg, canvasToSig, trimCanvas, currentSignature,
  renderSignEditor, renderSignPage, placeSignature, addSignEl, runSign.
- **Edit PDF** (`preview:'edit'`): drop **text boxes** (contenteditable, colour+size)
  and **white-out** rectangles; drag/resize; stamps via pdf-lib `drawText` (Helvetica
  WinAnsi = English letters/numbers only, sanitized) + `drawRectangle` (white).
  Functions: editOptsHtml, initEditPanel, renderEditEditor, renderEditPage,
  addEditText, addEditWhite, addEditEl, runEdit.
- **Unlock PDF**: no password → pdf-lib `ignoreEncryption` removes print/copy (owner)
  locks and KEEPS text selectable. With a password (bank-statement case) → decrypt
  locally with pdf.js `{password}`, rebuild an unlocked copy via jsPDF (image-based →
  text becomes NON-selectable). Password never leaves the device.
- **Protect PDF**: password-encrypt via the **`@cantoo/pdf-lib`** fork (v2.7.1, lazy
  `ensureCantoo` from jsdelivr, isolated from the app's main PDFLib). `doc.encrypt({
  userPassword, ownerPassword, permissions })` then `doc.save()`. **⚠ NOT YET TESTED
  end-to-end** — verify the encrypt API/permissions shape on first run; adjust if it throws.

**"SOON" (dimmed cards, `soon:true`):** none left — every card is live as of 13 July 2026.
(Future own-engine upgrades: true content-edit Premium Edit PDF, editable PDF→PPT/Excel,
layout-preserving Translate.)

---

## 4. THE UNIVERSAL ₹ WALLET (Phase 3)

A **money balance** (in **paise**, integer/atomic) separate from the AI **token** wallet.
- **schema.sql**: `profiles.wallet_paise`; `credit_wallet(uid,paise)`;
  `deduct_wallet(uid,paise)` (returns new balance, or **-1** if insufficient — never
  negative); `tool_log(user_id,tool,pages,cost_paise,created_at)`; `tool_pages_today(uid,t)`.
- **worker-payments.js**: `/order {plan:'wallet', inr}` (₹20–5000) → Razorpay order that
  credits `wallet_paise`; `creditOrder` has a wallet branch (idempotent); `/verify`
  duplicate branch returns `wallet_paise` for wallet top-ups; **`/wallet/deduct
  {tool,pages,paise}`** → deducts + logs, returns new balance or 402 insufficient.
- **Frontend**: `#walletCard` at top of the Plans modal (balance + ₹49/99/199/499 +
  custom); `app-wallet.js` reads the true balance from Supabase (`profiles.wallet_paise`,
  own-read RLS); Settings → Wallet shows the ₹ balance.
- **Money rails are ready** for Phase-4 premium charging (top-up + deduct + usage log).

---

## 5. BUSINESS MODEL

- **AI companion** (metered tokens): Spark = free (Nova/4o-mini), Swift = ₹49 (OpenAI),
  Sage = ₹99 (Anthropic + web search). Tiers Core/Plus/Ultra multipliers. **Hide
  provider names in the UI** (Spark/Swift/Sage only). Target ~75–80% gross margin;
  recalibrate wallet sizes whenever model prices change. Config is ENV-driven in the
  workers (no redeploy to change prices).
- **₹ wallet**: top up once, spend on anything. Phase 4: **buy subscriptions FROM the
  wallet** (add `/wallet/buysub` = deduct_wallet → credit_tokens) instead of a Razorpay
  popup per plan; and move the wallet into its **own view** (Plans & wallet nav) — do
  NOT keep "buy a plan" and "top up money" mashed in one modal.
- **★ Premium tools (Phase 4) — KRK's agreed model:** ONLY the tools that genuinely
  need a server get a ★. For those, a **free daily cap of 50 total pages per tool per
  day** (cumulative across uploads; use `tool_pages_today`). Over the cap → "time's up,
  come back tomorrow" + a premium upsell (a short catchy/rhyming line). Premium removes
  the cap for a fraction/page (≈₹0.10/page); server cost on open-source engines is
  fractions of a paisa, so it's ~100% margin — advertise "pay a penny, unlock it all".
  **Server processing requires explicit user consent** (file leaves the device); if the
  user wants privacy they use the free client-side version.

---

## 6. WHAT CHANGED THIS SESSION (12 July 2026 changelog)

UI/UX: login card fits screen; sidebar "Guest" bug fixed (`session` is a `let`, not on
window) + Claude-style account popover; plans modal fits + no number-spinner + wider on
laptop + custom-amount no longer shifts; Engine Power (tier + Token Saver) MOVED to
Settings → AI Engine; login "Sent" message short + orange one line; first-run **anchored
tour** (+ gated off the login page); **loading spinner** (reader `#docSpin` + tools);
mobile tools layout fixed (options panel **sticky to the bottom** of the screen); logout
icon spacing fixed (buttons were inline `display:block` overriding flex); ₹5000 top-up
cap with in-app toast; **themed dropdowns** everywhere (`select-style.js`); "Settings"
moved from nav into the account menu.

Functional: **voice commands work with OpenAI STT** (`normalizeCmd`: spelled numbers →
digits, "beginning/top/first page" handling); **subdomain redirect loop fixed**
(Cloudflare Pages serves clean `/tools` + 301s `/tools.html`→`/tools`; guards now accept
both, and `scan.` added, and login skipped on those hosts).

Tools: **Sign PDF**, **Edit PDF**, **Unlock (password-aware)**, **Protect PDF** built.
Edit PDF v2 (19 July 2026): **tap-to-edit** — a text-pick layer (pdf.js getTextContent +
Util.transform positions) sits under the items layer (edLayer is pointer-events:none,
.edItem re-enables); clicking any existing line auto-adds a padded white-out over it +
a pre-filled, size-matched text box on top (buildEditPickLayer / edAscii /
editExistingText in tools-page.js). Feels like direct editing; TRUE reflow editing of
the underlying text remains the future Lexora Layout Engine. Re-upload tools-page.js.

Wallet: **universal ₹ wallet** — schema + worker-payments + frontend.

---

## 7. KNOWN TRAPS (READ THIS — learned the hard way)

1. **The bash sandbox mount LAGS / FREEZES on recently Edit-touched files** (serves a
   truncated snapshot). `node --check` via bash then gives false `SyntaxError: Unexpected
   end of input` at the truncation line. **The `Read` and `Grep` tools read the REAL disk
   = source of truth.** To actually syntax-check, reconstruct the changed code into
   `/tmp/*.js` and `node --check` there (isolated), and use `Grep` to confirm markers on disk.
2. **NEVER `bash >> append` to a file the Edit tool has touched.** The append writes into
   the truncated mirror and **corrupts the real file** (this once spliced a CSS block into
   the middle of `addSignEl` in tools-page.js). Use the **Edit/Write tools** (they write
   real disk) for CSS/JS additions — not `cat >>`.
3. **Sign/Edit CSS is injected from JS** (`injectSignCss` at the end of tools-page.js) and
   **critical positioning is set inline** (holder `position:relative`, layer `absolute
   inset:0`, item `absolute`) — because the browser aggressively caches `pages.css`, so
   CSS-only styling for these dynamic editors can silently not apply.
4. **Never write `\xNN` escapes in code edits** — some tooling transmits them as raw bytes
   and corrupts the file.
5. **Classic scripts, not ES modules** — top-level order & hoisting matter. `session` is a
   top-level `let` (visible to other classic scripts by bare name, but NOT on `window`).
6. Compression must **never output a larger file** (return the original if not smaller).
   Watermark/page-numbers use pdf-lib StandardFonts (WinAnsi) → **English-only**, sanitized.
   Edit-PDF text is the same (Helvetica WinAnsi).
7. `select-style.js` wraps `<select>` — anything that must stay native (playbar
   Speed/Voice/Page) is marked `data-native`.
8. Cloudflare Pages **clean URLs**: `/tools.html` 301s to `/tools`. Any JS redirect guard
   must accept BOTH forms or it loops forever.
9. **Protect PDF is UNTESTED** (README fetch timed out). Verify the `@cantoo/pdf-lib`
   `encrypt()` API on first run.

---

## 8. PENDING ON KRK (ops, not code)

- **Test Protect PDF** end-to-end (encrypt a PDF, confirm it prompts for the password).
- **Test the ₹ wallet top-up** flow after deploying the schema + payments worker.
- Razorpay **KYC → live keys** (test mode works: card 5267 3181 8797 5449).
- Google OAuth consent-screen branding; Apple login needs a $99 dev account (later).
- Add the **`scan.` CNAME** on Cloudflare (like apex / `tools.` / `www.` → lexoraai.pages.dev).
- **Deploy checklist for this session's work:**
  1. Run updated `schema.sql` in Supabase (adds wallet_paise, credit/deduct_wallet, tool_log, tool_pages_today).
  2. Re-paste `worker-payments.js` to the Cloudflare payments worker.
  3. Re-upload `online/` to Cloudflare Pages (all HTML + scripts/ + styles/).
  4. Hard-refresh (Ctrl+Shift+R) to drop cached pages.css.

---

## 9. PHASE 4 ROADMAP (the NEXT big build)

1. **Conversion server** (swappable): User → Cloudflare Worker → dedicated conversion
   server. Start open-source (LibreOffice headless for HD Word↔PDF/PPT/Excel, Ghostscript
   for advanced compression, a better OCR engine); later a commercial SDK (preference:
   Apryse → Aspose → LEADTOOLS → Foxit); long-term the proprietary "Lexora Layout Engine".
2. **★ Premium tools** wired to that server with the **50-page/day free cap** model (§5),
   **consent** gate, and **wallet charging** (`/wallet/deduct`, ≈₹0.10/page). Premium
   variants: HD PDF→Word, PDF→PPT, PDF→Excel, Word/PPT/Excel→PDF (HD), advanced Compress
   (Lossless / Smart / Maximum / Web / Email-to-size), HD OCR + more languages, PDF/A,
   Translate (layout-preserving), text-preserving password removal, **true Adobe-style
   Edit PDF** (edit existing text/images with reflow — needs a real PDF engine, NOT
   feasible client-side), Edit Word, HTML→PDF.
3. **Premium UI**: a "★ Premium" category/tab beside PDF/Word/Image/Scan&AI, ★ badges,
   and a **free ⟷ ★premium toggle** on tools that have both a client and a server version.
4. **Wallet relocation**: dedicated "Wallet" view + **buy subscriptions from the wallet**
   (`/wallet/buysub`). Expose `wallet_paise` on gateway `/me`.
5. Longer term: PWA → Capacitor mobile apps; the **"Own Voice" TTS** project
   (Piper via sherpa-onnx WASM, then an Own-Voice Studio with XTTS-style training).

---

## 10. MESSAGE TO PASTE INTO THE NEW CHAT (current as of 19 July 2026)

> Continue the Lexora AI project. The `online/` folder is connected. Read
> `online/HANDOVER.md` IN FULL first — complete status, architecture, file map,
> business model, dev traps, and §11's live progress tracker. Also read
> `STRUCTURE.md` (why pages live at root) before touching files.
> WHERE THINGS STAND: Phases 1–4 of the original plan are CODE-COMPLETE, plus the
> roadmap's Phase 2 (polish), Phase 3 (PWA; Capacitor = docs/CAPACITOR-GUIDE.md),
> and Phase 4 v1 (tool→reader handoff). That includes: all 40+ client tools (incl.
> Crop/Redact/Forms/Compare/Edit Word + tap-to-edit in Edit PDF); the ★ premium
> stack (gateway worker → convert-server on Railway → translate-server v2 on
> CTranslate2 int8, cgroup-aware, IPv6-bound); the Hybrid-RAG companion (Private/
> Smart/Deep Research — rag.js + /rag endpoints); public landing + 43 SEO pages
> (seo-data.js/seo-page.js template system); trust pages, robots/sitemap/_headers/
> PWA; wallet incl. /wallet/buysub and wallet_paise on /me. Phase 5 (Own Voice) is
> a SEPARATE project — founding doc `LEXORA-VOICE-HANDOVER.md`; Lexora needs
> nothing until its P3.
> WHAT'S NEXT, in order: (1) the Phase-1 LAUNCH checklist is still pending on KRK
> (deploys + env fixes + end-to-end tests — top of §11 + Step 5e notes; the
> translate-language fix requires re-pasting worker-convert.js); (2) the UI redesign
> is UNDERWAY — mockup = `Lexora Redesign.dc.html`, Stage 1 (tokens) is DONE (§11
> Step 7); continue Stages 2–6 (brief: docs/UI-REDESIGN-BRIEF.md — CSS-first,
> element IDs must survive); (3) then Phase 4 v2
> (workspace chains) or Phase 6 (Layout Engine) — KRK decides.
> STANDING RULES: our OWN engines only, never a paid API; free client tools stay
> 100% private (no consent); ★ tools = consent modal + 50 pages/day free +
> ₹0.10/page; hide provider names (Spark/Swift/Sage); black/white/orange, no
> gradients. CRITICAL SANDBOX TRAPS (§7): the bash mount serves STALE/truncated
> copies of edited files — Read/Grep are the source of truth, verify syntax by
> reconstructing changed code into /tmp for node --check; NEVER `cat >>` append to
> project files (it corrupts them — use Edit/Write only); bash writes do NOT sync
> to the real disk (new binaries must be handed to KRK via outputs); editor CSS is
> JS-injected from tools-page.js on purpose. Mark §11 steps ⏳/✅ as you work so
> this handover stays a live continuation point.

---

## 11. PHASE 4 — LIVE PROGRESS (update this as you go)

▶ **START HERE NEXT:** **Step 5 is CODE-COMPLETE (13 July 2026)** — all 8 remaining tools
built (Crop / Redact / Forms-fill / Compare / Edit Word free client-side; ★ PDF→Excel /
★ HTML→PDF / ★ Translate on the conversion server). What's left is OPS (KRK) + testing:

  **Deploy checklist for the 13-July session:**
  1. Cloudflare Pages: re-upload `scripts/tools-page.js` (the only frontend file changed) →
     hard refresh. (tools.html/pages.css untouched — all new CSS is JS-injected.)
  2. Gateway worker: re-paste `worker-convert.js` (adds the `opts` passthrough that
     HTML→PDF's URL and Translate's target language ride on).
  3. Conversion server (Railway): redeploy `convert-server/` — the new Dockerfile adds
     chromium + poppler-utils + camelot/openpyxl/pandas and COPYs `pdf2excel.py`
     (first build ~10 min). No new env needed for pdf2excel/html2pdf.
  4. Translate only: deploy **`online/translate-server/`** as a second Railway service.
     **v2 (16 July): rewritten on CTranslate2 int8 after an OOM post-mortem** — v1's
     fp32 torch NLLB needed ~3.5 GB peak and OOM-loop-crashed Railway's 2 GB container
     right after "engine ready" (mmap'd weights paged in on first inference; SIGKILL
     can't be caught, so the in-process Marian fallback never fired). v2: NLLB-200
     int8 via CTranslate2 (~650 MB RAM, 4–8× faster, NO torch at runtime; model
     converted + baked in a two-stage Docker build), `MAX_CONCURRENCY` semaphore,
     `/healthz` readiness endpoint (**set Railway healthcheck path to /healthz**),
     MarianMT tier REMOVED (chain: NLLB-CT2 → optional LibreTranslate proxy → error).
     **Fits the 2 GB plan.** v2.1: cgroup-aware `effective_cpus()` (os.cpu_count saw the
     48-core HOST through the container; quota lives in cgroups) — env override →
     cgroup v2 → v1 → affinity → cpu_count; threads budgeted jointly
     (`MAX_CONCURRENCY × INTRA_THREADS ≈ effective cores`, 2 vCPU → 2×1).
     v2.2 (Railway private networking fixes): convert-server gained `serviceUrl()` —
     TRANSLATE_SERVER_URL is normalized at boot (scheme optional: `.railway.internal`/
     localhost → http://, public → https://; internal URLs get an explicit `:8080` if
     missing since the mesh does no port mapping) + a startup reachability probe with a
     troubleshooting checklist in the logs. translate-server now binds `listen='*'`
     (IPv4+IPv6) because the Railway mesh is IPv6-ONLY — 0.0.0.0 is unreachable on it.
     Correct env form: `TRANSLATE_SERVER_URL=http://<service-name>.railway.internal:8080`
     (⚠ verify the service name — "read-aloud-ai-offline-version" looks like the offline
     repo's name, not the translate service).
     v2.3 ("translates to English" bug post-mortem): frontend sent `opts={lang:'hi'}` but
     translate-server received `target:'en'` — the DEPLOYED gateway worker predated the
     `opts` passthrough and silently dropped the field; convert-server's silent `'en'`
     default then masked the loss. Fixes: translate now REQUIRES opts.lang (loud error
     naming the stale-worker cause instead of wrong-language output) + per-request
     `optsReceived` log line. ⚠ RE-PASTE `worker-convert.js` to Cloudflare — that is the
     actual fix; it's still pending from the Step-5 deploy checklist. API contract unchanged — convert-server untouched; just
     set `TRANSLATE_SERVER_URL` on it. Until then Translate returns a clean
     "translation engine not connected" error.
  5. Test each new tool once (see per-tool notes below). Then Step 6 (Own Voice TTS /
     PWA / Capacitor) is the next build frontier.

  Standing rule unchanged: our own engines only, never a paid API.


Phase 3 is DONE and TESTED (KRK confirmed Protect PDF + the ₹ wallet work). Phase 4
started 12 July 2026 (evening). Order of attack (do the buildable-now pieces first;
the conversion SERVER itself is external infra KRK must provision):

- **Step 1 — `worker-convert.js` (premium conversion gateway):** ✅ DONE (built +
  Read-verified; 211 lines). NEW Cloudflare Worker between the browser and a swappable
  conversion server. **Free-tier model (iLovePDF-style, NO login required to start):**
  50 free pages/day per tool — tracked per USER when logged in (`tool_pages_today` by uid),
  or per DEVICE by **hashed IP** when anonymous (`tool_pages_today_ip`; survives new tab /
  incognito / browser switch — VPN/mobile-data reset is the accepted residual gap). An
  anonymous 100-page upload → the first 50 (today's free-left) convert as a **PARTIAL**
  result (header `X-Lexora-Partial:1`) with a "log in for the full document" flag.
  Logged-in + over the cap → **₹0.10/page** from the ₹ wallet (`deduct_wallet`, min ₹5,
  cap ₹99); anonymous users CANNOT pay (no wallet) → must log in past the cap. Charges
  server-side, logs `tool_log`, forwards to `CONVERT_SERVER_URL` with `maxPages`, streams
  the result (`X-Lexora-Charge`, `X-Lexora-Partial`), **refunds on failure**. Endpoints:
  `POST /quote {tool,pages}` (auth optional → the deal/consent/login/top-up decision) and
  `POST /convert` (multipart: file+tool+pages+consent, auth optional).
  **Schema for this** (added to schema.sql, run it): `tool_log.ip_hash` column + index +
  `tool_pages_today_ip(iph,t)` RPC. **Extra env:** `IP_SALT` (Secret, for hashing IPs).
  TODO to go live: deploy as a Worker (`readaloudai-convert`), set env vars (incl.
  `CONVERT_SERVER_URL`, `CONVERT_SERVER_KEY`, `IP_SALT`), and stand up the server (Step 3).

- **DEPLOYED:** the gateway worker is live at
  `https://readaloud-convert.konarajeshkumar011.workers.dev` — this is the FRONTEND's
  `CONFIG.CONVERT_URL` (call `/quote` + `/convert` here in Step 2). Its own
  `CONVERT_SERVER_URL` env is NOT set yet, so it currently returns 503 "coming soon"
  until the conversion server (Step 3) exists.

- **Step 2 — Premium UI framework (tools-page.js + tools.html):** ✅ DONE (built +
  Read/Grep-verified + isolated /tmp `node --check` passed). WHAT WAS BUILT:
  tools.html loads supabase-js v2 + a ★ Premium category chip. tools-page.js top:
  `LX` config (Supabase URL/key + `CONVERT_URL` = the deployed gateway), `lxSb`
  client, `lxToken()` (auth OPTIONAL — anonymous allowed), `lxToast` fallback.
  KIT: dual tools compress/ocr/word2pdf/pdf2word got `premium:true` + `ptool`
  (`*_hd`) and a **free⟷★Premium toggle** in the tool view (`premToggleHtml`/
  `wirePremToggle`/`applyPremUi`, state `premOn`); **ppt2pdf + excel2pdf activated**
  as server-only ★ tools (accept lists like `.ppt,.pptx` — `acceptFile` was fixed
  to split comma lists); pdf2ppt/pdf2excel/pdfa/html2pdf/translate/editword stay
  `soon:true` but carry `premium:true`+`ptool` (★ badge + Soon pill; activate each
  once the conversion server supports it — only LibreOffice-native tools were
  activated to avoid failed-job UX). Catalog: ★ badge (`.pxStar`) on premium cards,
  premium chip filters across all type groups. Run flow (`runPremium`): page count
  client-side (real for PDFs via openPdfjs; Office files **estimated** at ≈40 KB/page,
  labelled "estimated" in the modal) → `POST /quote` (Bearer only when logged in) →
  **consent modal** (`consentModal`, promise-based: Continue/charge, Top up when
  `!enough`, Log in, "Use the free version instead" for dual tools, Not now; anonymous
  partial = "first N pages free — log in for the whole file"; used-up = the
  "come back tomorrow… or a penny a page ★" upsell) → `POST /convert` (multipart,
  consent=1) → saves the blob (`X-Filename` or ptool ext map), shows `X-Lexora-Charge`
  ("Done — ₹X from your wallet" / "free, within today's pages") + partial notice.
  Errors: 503 "launching very soon — use the free version", 402 top-up, 429
  come-back-tomorrow, other = "failed on the server — you were not charged".
  Premium CSS injected from JS (`injectPremCss`, end of file — same pages.css-cache
  reason as Sign/Edit). Drop-zone + progress privacy lines swap wording in premium
  mode. TO DEPLOY: re-upload `tools.html` + `scripts/tools-page.js` to Cloudflare
  Pages (+ hard refresh). Original spec follows:
  1. **Auth on tools.html.** tools.html is currently anonymous. Add the Supabase client
     (same CONFIG as app-core.js) + a `CONVERT_URL` (the deployed worker-convert URL).
     Premium calls need `Authorization: Bearer <supabase session token>`; if not logged
     in, the ★ toggle prompts login (→ login.html).
  2. **Mark ★ tools.** Add `premium:true` (and a `ptool` id like `pdf2word_hd`,
     `compress_hd`, `ocr_hd`, `pdf2ppt`, `pdf2excel`, `word2pdf_hd`, `pdfa`, `translate`,
     `editword`, plus the SOON ones) to the relevant `KIT[]` entries. Tools that have BOTH
     a free client version and a ★ server version (compress, pdf2word, ocr, word2pdf) get
     a **free ⟷ ★ Premium toggle** in the tool view; server-only ones are ★ always.
  3. **★ Premium category chip** beside All / PDF / Word / Image / Scan & AI (filters to
     `premium` tools). Add a small ★ badge to premium tool cards.
  4. **Consent + quote flow** on a premium run: read the PDF page count client-side →
     `POST CONVERT_URL/quote {tool:ptool, pages}` → show a **consent modal**: "This runs
     on our secure server, so your file is uploaded (the free tools stay 100% on your
     device). First 50 pages/day free on this tool; you've used N today; this job:
     billablePages × ₹0.10 = ₹X from your wallet (balance ₹Y)." Buttons: **Continue** /
     **Use the free version** / **Top up** (if `!enough`). On Continue → `POST
     CONVERT_URL/convert` (multipart file+tool+pages+consent=1) → save the returned blob.
     Handle 402 `insufficient` (→ top up), 400 `consent_required`, 503 (server not
     connected yet → "premium is launching soon; use the free version").
  5. Show the ₹ charge back to the user (`X-Lexora-Charge` header) and a "free (within
     today's 50)" state when charge is 0. When `usedToday >= freeCap` and the user won't
     pay → the "time's up, come back tomorrow" upsell (KRK's model).
  NOTE: do this on a FRESH session (tools-page.js is ~950 lines and has corrupted twice
  under the flaky sandbox mount — see Trap #1/#2). Use Edit/Write only, verify with
  Read/Grep + isolated /tmp node --check.
- **Step 3 — Dedicated conversion server (`online/convert-server/`):** ✅ DONE (built +
  syntax-checked). Standalone Node service: `server.js` (Express + multer), `package.json`,
  `Dockerfile` (node:20 + libreoffice + ghostscript + qpdf), `README.md` (deploy steps for
  Railway/Render/Fly). `POST /convert` (Bearer `CONVERT_SERVER_KEY`) wraps LibreOffice
  (word2pdf_hd/ppt2pdf/excel2pdf/html2pdf/pdf2word_hd), Ghostscript
  (compress_hd/max/web/light), qpdf (trim to `maxPages`). Extend via the `HANDLERS` map.
  TODO to go live: `docker`-deploy the folder to a host → copy its URL into the gateway's
  `CONVERT_SERVER_URL` env (with `https://`, no trailing slash — it's the RAILWAY url, NOT
  the workers.dev gateway url), same `CONVERT_SERVER_KEY` on both.
  DEPLOYED (Railway): `https://clever-cat-production-b852.up.railway.app`.
  ENGINE POLICY (KRK's firm rule): **we build our OWN — do NOT wire any paid/third-party
  conversion API or buy a license.** Keep the open-source engines as they are. Upgrade in
  future by building our own engines, and only for the *complex* ones that need it (not all)
  — long-term this becomes the proprietary "Lexora Layout Engine". Current engines (all
  open-source, self-hosted): `pdf2word_hd` → **pdf2docx** (layout-parsing; good, and the one
  to eventually replace with our own for iLovePDF-beating quality); `ocr_hd` → **ocrmypdf**
  (Tesseract, searchable PDF); `pdfa` → **Ghostscript** PDF/A; word2pdf_hd / ppt2pdf /
  excel2pdf / html2pdf → **LibreOffice**; compress_* → **Ghostscript**. Dockerfile installs
  libreoffice + ghostscript + qpdf + tesseract-ocr + python3 (pdf2docx, ocrmypdf) — first
  build ~5–10 min. **Supported ptools (13 July):** word2pdf_hd, ppt2pdf, excel2pdf,
  html2pdf (now REAL Chromium render, not LibreOffice), pdf2word_hd, ocr_hd, pdfa,
  pdf2excel (camelot), translate (our translate-server: NLLB-200/MarianMT),
  compress_hd/max/web/light.
  STILL future (build our own later — never a paid API): true content-edit "Premium
  Edit PDF" and editable-text PDF→PPT/Excel fidelity (the "Lexora Layout Engine").
- **Step 4 — Buy plans from wallet (`/wallet/buysub`):** ✅ DONE (built + verified).
  `worker-payments.js` endpoint `POST /wallet/buysub {plan}` (also `{plan:'topup',inr,
  provider}`): `deduct_wallet` the price → `credit_tokens` (value-converts on provider
  switch) → logs a `sub_from_wallet` transaction → returns new wallet + token balances,
  or 402 `insufficient`. Frontend (`app-wallet.js`): `renderWalletButtons()` adds a
  "Pay ₹X from your wallet" button to each sub plan card when the balance covers it (no
  Razorpay popup); `buyFromWallet()` calls the endpoint and refreshes both balances.
  `.fromWallet` styled in app.css. Re-deploy worker-payments.js + re-serve the frontend.
  STILL OPEN (optional): a fully dedicated wallet VIEW (currently the ₹ wallet lives at
  the top of the Plans modal, which is fine now that plans are bought from it).
- **Step 5 — Remaining "Soon" tools — engine-decided build plan** (KRK: use the best
  engine per tool, NO paid API; our-own proprietary engine is a *later* upgrade only for
  the complex ones). Rule of thumb: if it can run in the browser → FREE client tool (no
  consent); if it needs the server → ★ premium (consent modal + free 50 pages/day cap +
  ₹0.10/pg over cap, exactly like the existing premium flow). Progress:

  - **PDF→PowerPoint (`pdf2ppt`)** ✅ DONE — now a **FREE client tool**: pdf.js renders each
    page → **PptxGenJS** (lazy `ensurePptx`, cdnjs) builds a .pptx, one page-image per slide.
    Reclassified from ★premium to free (removed premium/ptool/soon). Slides are images (not
    editable text) — that's the honest open-source ceiling; true editable pptx = future own engine.

  FREE client-side (build in tools-page.js, reuse the Sign/Edit editor infra — render pages,
  drag items, save via pdf-lib; NO server/consent):
  - **Crop (`crop`)** ✅ DONE → interactive drag-rectangle over the rendered page (move/resize/
    draw-new; scope: all pages or just this one) → pdf-lib `setCropBox`, MediaBox-origin-aware.
    Functions: cropOptsHtml/renderCropEditor/renderCropPage/addCropRect/runCrop + injectCropCss.
  - **Redact (`redact`)** ✅ DONE (built + Read/Grep-verified + /tmp node --check passed; KRK
    end-to-end test pending) → black boxes over real pages (drag/resize, multi-page), on save
    every covered page is FLATTENED: re-rendered scale-2 via pdf.js with the boxes baked in →
    JPEG image page, so content is truly removed. Untouched pages copyPages as-is (text stays
    selectable). Functions: redactOptsHtml/initRedactPanel/renderRedactEditor/renderRedactPage/
    addRedactBox/addRedactEl/runRedact.
  - **PDF Forms — fill (`forms`)** ✅ DONE (built + verified + node --check passed; KRK test
    pending) → renderFormsEditor/runForms: pdf-lib getForm/getFields, an input per field
    (text/textarea/checkbox/radio/dropdown/option-list), prefilled from current values, the
    SAME loaded doc is saved (no reload), optional flatten with graceful fallback. No-form
    PDFs get a "use Edit PDF instead" hint. (Creating new forms = deferred.)
  - **Compare (`compare`)** ✅ DONE (built + verified + node --check passed; KRK test pending) →
    cmpPageCanvas/cmpDiff/renderCompareEditor/renderComparePage/runCompare: two-file intake
    (multiple:true, min:2), side-by-side A|B with the pixel diff painted orange on B, page nav,
    %-changed note, pages present in only one file flagged; run() saves a side-by-side jsPDF
    "comparison report.pdf" (60-page cap).
  - **Edit Word (`editword`)** ✅ DONE (built + verified + node --check passed; KRK test pending)
    → reclassified from ★premium to FREE client tool (premium/ptool/soon removed). mammoth
    (docx→html) into a contenteditable .ewPage; on save, renderEditWordEditor/ewRuns/runEditWord
    rebuild headings/bold/list-bullets into a .docx via app-tools buildDocxRich. Pictures &
    complex layouts not kept (honest client-side MVP — noted in the tool hint).

  ★ PREMIUM server — ✅ ALL THREE BUILT (13 July; syntax-verified; deploy + test pending, see
  the checklist at the top of §11). A new optional multipart field **`opts`** (JSON string)
  now flows browser → gateway (`worker-convert.js` forwards it) → server (parsed, passed as
  the 3rd arg to handlers). `premOpts:()=>html` on a KIT entry injects tool-specific fields
  into the premium options panel.
  - **PDF→Excel (`pdf2excel`)** ✅ → server `pdf2excel.py` (camelot: lattice pass first,
    stream fallback; each table → its own sheet via pandas/openpyxl; exit 2 = "no tables").
    Dockerfile adds `camelot-py[cv]`+openpyxl+pandas+poppler-utils. KIT card activated
    (accept .pdf, ★ server-only) with a "ruled tables work best" premOpts hint. xlsx
    content-type added to CT.
  - **HTML→PDF (`html2pdf`)** ✅ → server `chromiumPdf()`: **headless Chromium CLI**
    (`--headless=new --no-sandbox --print-to-pdf`, `CHROME_BIN=chromium` from apt — real
    browser render, no puppeteer npm needed; the old LibreOffice handler is replaced).
    Frontend: new **`urlTool:true`** flow — no file drop; openTool renders a URL input
    (`#oUrl`) in the main area; runPremium sends a tiny text stub as `file`, pages=1, and
    `opts={url}`; goBtn guard allows file-less URL tools. Renders `opts.url`, or an
    uploaded .html file if no URL given.
  - **Translate (`translate`)** ✅ → server `translatePdf()` calls OUR translation service
    **`online/translate-server/`** (env `TRANSLATE_SERVER_URL`; NO paid API; all
    LibreTranslate-specific code/config removed from convert-server). The service
    (Flask + transformers, own Dockerfile, separate Railway container) picks its engine
    automatically: **Meta NLLB-200** (`facebook/nllb-200-distilled-600M`, override via
    `NLLB_MODEL`) → **MarianMT** per-pair fallback (English pivot) if NLLB can't load →
    LibreTranslate proxy ONLY if `LIBRETRANSLATE_FALLBACK_URL` is set and no model engine
    works. Source language **auto-detected**; `target` accepts ISO-639-1 or raw FLORES-200
    codes → all 200 NLLB languages supported. Pipeline unchanged: `pdftotext -layout` →
    ~4000-char chunks → POST /translate → translated .txt → LibreOffice → `translated.pdf`.
    MVP = clean translated-text PDF; layout-preserving is the later own-engine upgrade.
    KIT card: 30-language `#oTrLang` select (10 Indian languages — NLLB's strength);
    runPremium sends `opts={lang}`. Scanned PDFs error with "run OCR on it first".
    Premium flow/pricing untouched (same gateway, consent, caps, wallet).

- **Step 5b — Companion "Hybrid RAG" upgrade (13 July, evening):** ✅ BUILT (syntax-verified;
  deploy + test pending). The AI companion now retrieves instead of dumping text. UI names
  (NEVER say "RAG" in the UI): **Private AI** (default) / **Smart AI** (recommended) /
  **Deep Research** (opt-in). Selector: Settings → AI Engine → "Document understanding"
  (localStorage `ra_ai_mode`).
  - **NEW `scripts/rag.js`** (~430 lines, classic script, loaded before app-companion.js on
    index.html): sentence-based chunker (~1100 chars, 1-sentence overlap, heading detection
    from `lines[].h` height heuristic); browser embeddings via **Transformers.js v3**
    (`@huggingface/transformers` from jsdelivr, `Xenova/all-MiniLM-L6-v2` q8, **WebGPU with
    automatic WASM fallback**); vectors cached in **IndexedDB** (`lxrag` db, keyed by doc
    fingerprint) + in-memory Float32Array cosine search; **BM25** keyword index; **RRF
    fusion** + boosts (reading-position page, heading match, dates for timelines); intent
    routing in Smart mode (summarize = spread-across-document sampling, compare = per-side
    retrieval, definition/find = keyword-weighted, timeline = date boost). Background
    pre-indexing poller (only when a doc is open + companion available). Docs whose full
    text ≤ 8 KB return null → the classic path sends everything (cheapest + identical).
  - **app-companion.js**: new `smartContext(question)` wrapper — tries `LxRag.getContext`,
    falls back to the untouched legacy `buildContext()` on any error (nothing was rewritten;
    explain-selection and explain-page keep their existing precise contexts). `sendChat` now
    awaits `smartContext(t)`.
  - **Privacy model preserved**: Private/Smart send ONLY question + top passages to the
    existing `/chat` (context string ≤ 9000 — no worker change needed for these two modes).
    The document and the embedding DB never leave the device.
  - **Deep Research** (opt-in): per-document consent modal in rag.js → chunks upload to NEW
    `worker-gateway.js` endpoints `/rag/index`, `/rag/query`, `/rag/delete` (auth required,
    placed before the chat rate-limit). Server side: **Cloudflare Vectorize** + **Workers AI**
    embeddings (`@cf/baai/bge-base-en-v1.5`), ids `uid:docId:i`, metadata `{ns, page, text,
    exp}` with **24 h expiry** (expired matches filtered) + client delete on pagehide/close.
    Until the bindings exist the endpoints return 503 and the client silently falls back to
    on-device Smart AI. Chat pricing/metering unchanged (answers still go through `/chat`).
  - **TO DEPLOY:** re-upload `index.html`, `settings.html`, `scripts/rag.js`,
    `scripts/app-companion.js`, `scripts/settings.js` to Pages; re-paste `worker-gateway.js`.
    For Deep Research additionally: `wrangler vectorize create lexora-rag --dimensions=768
    --metric=cosine` + `wrangler vectorize create-metadata-index lexora-rag
    --property-name=ns --type=string`, then bind it as `VECTORIZE` and add a Workers AI
    binding named `AI` on the gateway worker (dashboard → worker → Settings → Bindings).

- **Step 5c — Production audit: SEO / performance / trust / a11y (15 July 2026):** ✅ BUILT
  (deploy + a few manual dashboard steps pending — see **`SEO-LAUNCH-CHECKLIST.md`**).
  WHAT WAS DONE:
  - **SEO:** unique title + meta description + canonical + Open Graph + Twitter Card on
    EVERY page; JSON-LD structured data (index: Organization + WebSite +
    SoftwareApplication w/ pricing; tools: BreadcrumbList + ItemList of top tools;
    faq.html: FAQPage with 10 Q&As); `robots.txt` (AI crawlers explicitly welcomed —
    GPTBot/ClaudeBot/PerplexityBot); `sitemap.xml` (9 URLs, clean-URL form);
    settings=noindex, terms redirect=noindex; titles rewritten keyword-first on
    tools/scan ("Free PDF Tools Online — Merge, Split…").
  - **Icons/PWA:** `favicon.svg` (orange L on black) + `manifest.webmanifest`.
    ⚠ PNG icons (192/512/maskable/apple-touch/og-card 1200×630) were generated but the
    sandbox CANNOT write binaries into the project — they were handed to KRK as files;
    he must drop them into **`online/icons/`** (checklist item 1).
  - **Performance:** the 4 render-BLOCKING head libraries (pdf.js ~300 KB, tesseract,
    mammoth, supabase) are now `defer` on every page, and ALL body scripts got `defer`
    too (defer preserves execution order, so the classic-script chain is unchanged —
    verified: app-core's top-level `supabase.createClient` still runs after the CDN lib;
    lazy `ensurePdfjs()` re-reads handle the later lib init; login.html's supabase stays
    BLOCKING on purpose — its inline script needs it at parse time). `preconnect` to
    jsdelivr + Supabase. `_headers` (Cloudflare Pages): HSTS, nosniff, SAMEORIGIN,
    Referrer-Policy, Permissions-Policy + `lib/*` immutable 1-year cache (styles/scripts
    intentionally short-cached — the pages.css trap).
  - **Trust pages (new, on-brand shell):** `faq.html` (FAQPage schema), `about.html`,
    `security.html`, `contact.html` — linked from every sidebar (tools/scan/settings +
    each other). privacy.html RECOLORED from the old blue/purple palette to
    black/white/orange (was off-brand).
  - **Analytics:** `scripts/analytics.js` on every page — privacy-first: ships EMPTY
    (`LX_GA4_ID`/`LX_CLARITY_ID` at top of file; nothing loads until set). Global
    `lxTrack(event,params)` no-op API + documented conversion wiring points (sign_up,
    tool_run, premium_run, purchase).
  - **Top remaining levers (manual/product decisions, in the checklist):** a real public
    landing page at / (apex currently JS-redirects logged-out users to /login — the
    single biggest SEO weakness), per-tool landing pages (/merge-pdf style), Search
    Console + Bing verification, GA4/Clarity ids, blog for Discover.

- **Step 5d — Public landing + 43 SEO landing pages (15 July 2026):** ✅ BUILT (deploy pending).
  - **Landing at / (redirect REMOVED):** app-core.js `initAuth` no longer bounces logged-out
    visitors to login.html — it shows the new `#landing` section inside index.html instead
    (full marketing page: hero, features, popular-tools grid linking the SEO pages, how-it-
    works, pricing cards, FAQ accordion, footer; styles in NEW `styles/landing.css`).
    Landing is VISIBLE in static HTML (crawlers see real content, no JS needed); an early
    inline script hides it instantly for returning users (`localStorage.ra_returning`, set on
    login) and any `location.hash` (covers #guest + auth-token flows); initAuth hides it for
    sessions and falls back to the old redirect if the section is missing. Login is now only
    asked for when actually needed. NOTE the old #login overlay + login.html flows unchanged.
  - **43 SEO landing pages** at clean URLs (`/merge-pdf`, `/pdf-to-word`, `/ocr-aadhaar-card`,
    `/chat-with-pdf` …) — 26 tool pages + 3 AI-feature pages + 14 programmatic intent pages
    (OCR: scanned/receipts/invoices/handwritten/bank-statements/passport/aadhaar/pan/DL;
    conversion intents; AI intents). ZERO duplicated page code: each page is a ~35-line SHELL
    (unique title/description/canonical/OG/Twitter + static crawlable h1/intro/CTA) and the
    body renders from two shared components: **`scripts/seo-data.js`** (content registry —
    name/cta/benefits/steps/faqs/related per slug) + **`scripts/seo-page.js`** (renderer:
    privacy note, benefits grid, how-it-works, FAQ accordion, related-tools links, footer,
    visible breadcrumb, JS-injected BreadcrumbList+FAQPage JSON-LD, injected CSS).
    Free tools CTA straight into tools.html#id (no login!); AI pages CTA → login.html;
    ★ tools show the premium/consent messaging. All `related` slugs validated (script check:
    43 entries, all shells present, no orphans, node --check clean).
  - **Internal linking:** landing → 12 SEO pages + all sections; every SEO page → 4 related
    pages + tools/faq/security/home; faq.html got a "Popular guides" block; breadcrumbs on
    every SEO page (visible + schema).
  - **sitemap.xml** regenerated: 52 URLs (9 core + 43 SEO pages). To add a page later: create
    the shell + an LX_SEO entry + a sitemap line.
  - **TO DEPLOY:** re-upload everything (43 new *.html, styles/landing.css, scripts/seo-data.js,
    scripts/seo-page.js, edited index.html + app-core.js + faq.html + sitemap.xml). Then in
    Search Console: resubmit the sitemap + request indexing for /, /tools, /chat-with-pdf,
    /merge-pdf. Testimonials: the landing intentionally shows use-cases instead of fabricated
    quotes — swap in real user quotes when collected.

- **Step 5e — Roadmap Phases 2/3/4 build (19 July 2026):** ✅ BUILT (deploy pending).
  **Phase 2 – Polish:**
  - Translate quality: `pdftotext` now runs WITHOUT -layout + `reflowForTranslation()`
    (joins hard-wrapped lines, de-hyphenates, collapses spaces — fixes translated
    word-spacing/formatting). Translate chunks retry transient failures (`fetchRetry`,
    2 retries on 5xx/429/network).
  - `compress_hd` takes `opts.preset` (smart/max/web/light/**email** — email tries
    /ebook then /screen aiming ≤4.5 MB); HD compress got a profile select (premOpts).
  - `ocr_hd` takes `opts.ocrlang` (validated tesseract codes); Dockerfile installs 10
    Indian-language packs; OCR premium got a language select.
  - **NEW ★ `unlock_hd`** — text-preserving password removal via `qpdf --decrypt`
    (free client unlock still rebuilds as images; HD keeps text selectable). Unlock
    tool got the premium toggle + password field; passwords masked in convert-server
    logs, required loudly in runPremium.
  - Gateway `/me` now returns **`wallet_paise`** (profiles select + response).
  **Phase 3 – Mobile:** `sw.js` service worker (DELIBERATELY minimal: cache-first for
  lib/+icons/+favicon ONLY — can never serve a stale app; registered site-wide from
  analytics.js on https) → PWA is installable with instant repeat loads.
  `docs/CAPACITOR-GUIDE.md` = exact Android/iOS wrap recipe (native builds need
  KRK's machine — Android Studio/Xcode; config points the shell at the live site).
  **Phase 4 – AI Workspace (v1):** tool→reader **handoff**: finished tool results get
  an "📖 Open in the reader" button (tvDone) → blob into IndexedDB `lxhand` →
  index.html picks fresh (<10 min) handoffs on load, opens via `openFile()`, record
  deleted on pickup (`lxHandoffSave`/`offerReaderHandoff` in tools-page.js + the
  load listener in app-documents.js). OCR→listen, translate→listen, unlock→ask-AI
  now one flow. Also `STRUCTURE.md` (why pages stay at root: filenames ARE the
  URLs; folder conventions for future files) and `docs/` folder started.
  **TO DEPLOY:** Pages re-upload (sw.js, STRUCTURE.md, docs/, edited tools-page.js /
  app-documents.js / analytics.js) + re-paste worker-gateway.js + redeploy
  convert-server (new Dockerfile langs + handlers).
  NOT done from Phases 2–4 (needs other machines/deeper work): native Android/iOS
  builds (guide ready), deeper DOCX/table fidelity (engine-level, Layout-Engine
  territory), full workspace UI (multi-step chains).

- **Step 7 — UI REDESIGN v2 (20 July 2026) — STAGE 1 (tokens) ✅ BUILT, deploy pending.**
  Design source: **`Lexora Redesign.dc.html`** (Claude-Design mockup at online/ root; KRK also
  has a PDF of it). Design language: "flat, architectural, warm" — rules and grids, never
  shadows/gradients; **radius 0** everywhere; IBM Plex Serif display + Inter UI; Lucide-style
  line icons; document-node motif (constellation/thread/mark); left 2px accent rule = active;
  dark ink ON orange buttons (`--on-accent`); tabular numerals for ₹/tokens.
  WHAT WAS DONE (all token-driven, zero hardcoding, element IDs untouched):
  - `styles/theme.css`: new `:root`/`body.light` tokens (panel #181714, panel2 #211f1c,
    text #f5f3ee, muted #9c988c, `--line` #2c2a26 + NEW `--line-strong` #3a3833,
    NEW `--on-accent` (#111110 dark / #faf9f5 light), `--radius:0`, `--shadow:none`,
    NEW `--font-display` 'IBM Plex Serif' + `--font-ui` Inter, loaded via Google-Fonts
    @import at top with Georgia/system fallbacks) + a **"REDESIGN v2" override layer** at
    the end: square-corner sweep (`!important` so it beats pages.css load order AND the
    JS-injected editor CSS), circles preserved (mic/shutter/avatar/spinner/FAB),
    `*{box-shadow:none !important}`, serif h1/h2, `.kicker`/`.tnum` utilities, on-accent
    ink on every accent button, left-rule active states, `:focus-visible` outline,
    camera-review de-blue.
  - `styles/pages.css`: body font → `var(--font-ui)`, all Georgia → `var(--font-display)`,
    on-accent inks (.catChip.on/.bigPick), hover lifts removed; **FIXED a pre-existing
    corruption** (line ~248 `.tierBtn[data-tier="ultra"].on` was truncated mid-declaration
    with an unclosed brace — old cat>> damage).
  - `styles/landing.css`: Georgia → tokens, radii 0, `--on-accent`, tabular ₹.
  - `scripts/onboarding.js` + `scripts/seo-page.js`: injected Georgia → `var(--font-display)`
    (node --check passed on both).
  TO DEPLOY: re-upload `styles/` (theme/pages/landing) + `scripts/onboarding.js` +
  `scripts/seo-page.js`; hard refresh (pages.css cache trap).
  **STAGES 2–5 ✅ ALSO BUILT (20 July, same session — all CSS-only, IDs untouched):**
  - Stage 2 tools catalog/flow (`pages.css`): `.toolGrid2` is now a SHARED-BORDER grid
    (`gap:1px; background:var(--line); border:1px solid var(--line)`, cells `--panel`,
    hover = `--panel2` fill, no lift); `.chipRow` is one ruled segmented strip (joined
    `.catChip`s, 1px inner dividers, active = accent fill + on-accent ink); `.catHead`
    group headers are letter-spaced caps kickers; `.tIc2` icon box = 1px `--line-strong`
    outline, accent glyph; `#tvDrop` = 1px dashed `--line-strong`, transparent.
  - Stage 3 reader (`app.css`): `#playbar` = ruled instrument (bg `--bg`, 1px
    `--line-strong` frame, ghost transport buttons, accent `#playBtn` + solid-accent
    round mic, no blur/shadow); `#dropZone` 1px dashed; `.msg.user` = OUTLINED orange
    bubble (mockup 2a) — removed from theme's on-accent list; `.sentSpan:hover` uses
    `--mark`; `.pageWrap/.textWrap` get a 1px ruled frame (shadows are dead).
  - Stage 4 settings (`pages.css`): `.secNav a.active` left 2px accent rule; `.btn`
    on-accent ink.
  - Stage 5 plans/wallet (`app.css` + theme 7b): `.planCard`s collapse into a ruled
    list (`margin-bottom:-1px`, hover accent border above); `.walletCard` transparent
    ruled; `#walletMoney` = serif/orange/tabular hero figure; `.walletTop` label +
    `.planCard .price` styled; landing (`landing.css`): 2px `--line-strong` rules above
    every h2 section, `.ldGrid/.ldTools/.ldPrice` all shared-border grids, hover=fill.
  **WAVE 3 ✅ (20 July, later same day) — markup + icon system:**
  - **NEW `scripts/lx-icons.js`** — retires emoji WITHOUT touching tools-page.js: a DOM
    post-processor (idempotent via data-lx-icon, MutationObserver-debounced) swaps emoji
    glyphs inside `.tIc2` / `.toolCard .tIc` / `#plans .planCard .ic` for a built-in
    Lucide-style line-icon set (stroke 1.75, currentColor, ~30 icons + folded-corner doc
    fallback for anything unmapped). Loaded with defer on tools.html + index.html.
    To add a mapping: extend `MAP` (emoji → key) or `I` (key → svg).
  - **index.html markup**: dropzone = node-constellation SVG + "Open a document, or just
    ask." (serif) + lock-SVG privacy line; companion header = orange square sparkle mark
    + "Companion"; plans modal = kicker "PAY FOR WHAT YOU USE" + "Plans & wallet" h2 +
    "₹ WALLET BALANCE" label + all 5 planCard emoji → inline SVGs (zap/lamp/wallet/
    rotate/doc); acctMenu 4 emoji → SVGs; playbar transport (prev/next/page-arrows/
    sliders "more") → SVGs, Voice label, Save PDF/Word buttons de-emojied; selBar
    ("Explain" / "Read from here"); chatFab + sendBtn → SVGs; landing feature cards +
    trust line → SVGs. NOTE `#playBtn` label stays TEXT (▶/⏸) — app-viewer.js:596
    rewrites textContent on toggle.
  - **tools.html**: kicker over the (SEO-kept) h1, lock-SVG privacy line, lx-icons
    include; **scan.html**: de-emojied h1/filter/shutter(SVG)/export buttons;
    **settings.html** Token Saver/export de-emojied; **settings.js** wallet line →
    kicker + serif orange tabular ₹ (node --check OK).
  - theme.css §7a: `.face` orange square, `.planCard .ic` outlined 34px box.
  **WAVE 4 ✅ — landing rebuilt to mockup 1b:** #landing now sits at z-index:150 (COVERS
  the app sidebar — it was leaking through at z:60), top nav = orange-square brand mark +
  Tools/Scan/Pricing/FAQ + Log in + "Start free" accent CTA; hero = split grid (`.ldHero`
  / `.ldHeroL` / `.ldHeroR`): kicker "PRIVACY-FIRST · MADE IN INDIA", plain serif h1 with
  period (em no longer orange), CTAs, lock trust line — node-constellation SVG on the
  right (hidden ≤840px), 2px rule below the hero; NEW `.ldPriv` privacy banner above the
  footer ("Your files never leave your device." + How-privacy-works ghost button).
  landing.css + index.html only; all guards/ids untouched.
  **WAVE 5 ✅ (20 July, evening) — PAGE-BY-PAGE STRUCTURAL REBUILD (not a reskin):**
  1. Landing (mockup 1b): full-bleed ruled architecture — 68px nav (brand mark, links,
     Log in + Start free CTA) → split hero 1.1/.9 (kicker, 64px serif h1, constellation
     right) → 4-cell STAT ROW → features ("One workspace, not forty tools." + kicker)
     → popular-tools rows WITH icons + "All 40+ tools →" → 3-col pricing (middle card =
     orange top rule) → privacy banner → ruled footer. landing.css rewritten from scratch;
     old FAQ/how-it-works/"ready" sections REMOVED per mockup.
  2. Workspace home (2c): #sideNav is now a 64px ICON RAIL on desktop (SVG buttons,
     labels drawer-only via .lbl/.railHideDesk); 52px top bar (header now VISIBLE on
     desktop); #dropZone rebuilt = kicker greeting (#wsGreet, personalized by NEW
     `scripts/lx-workspace.js`) + serif "Open a document, or just ask." + dashed .dzZone
     (constellation, Drop-a-file, Choose/Scan buttons) + "RECENT ON THIS DEVICE"
     shared-border grid (#wsRecent — localStorage 'lx_recent', recorded by wrapping
     window.openFile; clicking re-opens the picker).
  3. Reader (2a): playbar = ONE ruled instrument strip (row layout, 1px rules between
     controls, accent play block, square in-bar mic — #micBar removed from the circle
     list, registration "+" marks at corners, 3px progress thread on the bottom edge);
     top bar shows the open document title (#hdrDoc, set by lx-workspace); companion
     fixed at 380px.
  4. Companion: suggestion chips (#lxChips → fills chatInput + clicks send), collapse
     chevron, collapsed state = vertical COMPANION tab on the right edge (mockup 2b).
  5. Tools catalog (3a): tools.html sidebar → icon rail; .pageTop = permanent 52px bar
     (all pages); left-aligned hero + kicker + SEARCH field (#toolSearch, inline script
     filters .toolCard2 + hides empty groups); segmented chips left-aligned.
  6. Tool flow (3b): CSS-only fidelity (tools-page.js untouched) — dashed drop frame
     with serif "Drop your file here" ::before, small accent CTA.
  7. Wallet (4a): plans modal → 880px, planCards wrapped in NEW .planGrid (shared-border,
     vertical cards: icon box / name / serif 30px price / desc / accent .fromWallet CTA).
  8. Settings: sidebar → icon rail (same markup pattern).
  9. Scan (5a): capture STATION — .scanStation grid: stage (camWrap + shutter + shots)
     left, ENHANCE rail right (preset select + export card moved inside).
  10. Mobile (4c): NEW #mobTabs bottom tab bar (Reader/Tools/Companion/More; wired in
     lx-workspace.js — Companion drives the sheet, More opens the drawer); chatFab
     hidden on mobile; playbar sits above the bar.
  **WAVE 6 ✅ (20 July, night) — Product-Bible backlog (docs in KRK's uploads;
  screenshots = the .dc.html mockup captures, same source of truth):**
  - Task 12 AUTH: login card rebuilt — ruled `--line-strong` panel card, orange
    square brand mark (`.logo2` + .mkDot), serif h2, ghost guest button, caps
    divider, de-emojied (login.html + index #login fallback + theme.css block).
  - Task 10 JOBS: NEW **`jobs.html`** (noindex) — full rail+topbar shell, mockup-3c
    shared-border queue table (running dot / done / failed·refunded states, tabular
    cost, responsive 2-col collapse), constellation EMPTY state, self-contained
    inline JS+CSS. Feed = localStorage `lx_jobs`; write API `window.lxJobs.add(
    {tool,file,status,cost})` — wire it into runPremium (tools-page.js) in a FRESH
    session (Trap #1/#2). Jobs clock icon added to ALL rails (index/tools/settings/
    scan/jobs).
  - Task 13 SEARCH: NEW **`scripts/lx-search.js`** — Ctrl/Cmd+K command palette on
    all 5 app pages (index/tools/scan/settings/jobs): 6 nav destinations + 26 tools
    (deep links tools.html#id) + theme action; arrows/enter/esc, ARIA listbox,
    `window.lxSearchOpen()` for rail triggers; styles in theme.css (#lxK).
  - Tasks 14/15 verified as covered: notifications = #lxToast (themed, left accent
    rule); profile = settings Profile section.
  **WAVE 7 ✅ (20 July, late night) — KRK's bug list, milestone pass:**
  - M1 AUTH ROUTING: landing "Pricing" → `login.html?next=%23plans`; login.html now
    honours a fragment-whitelisted `?next=` (`SAFE_NEXT`, no open redirect) so
    login returns exactly where the user was headed; lx-workspace `deeplink()`
    auto-opens the Plans modal on `index.html#plans` once a session exists
    (guests keep the landing; Pricing routes them through login).
  - M1 WALLET REBUILT (mockup 4a, clean — no mixed UI): `.pwHead` = kicker +
    serif h2 left, "₹ WALLET BALANCE" + 38px serif orange `#walletMoney` right;
    `.walletCard` = "TOP UP ONCE" kicker + ONE strip (4 outlined amounts + inline
    ₹Custom field + accent "Add to wallet"); old walletTop/topups CSS replaced in
    app.css; theme 7b trimmed to shell (880px box). planGrid unchanged.
  - M2 HOME: **recents REMOVED** (KRK: we never store files) — markup + all
    lx-workspace recents code deleted (openFile wrap now only sets #hdrDoc).
  - M2 CHAT UX (Phase 9 first cut, zero app-companion edits — #chat
    MutationObserver in lx-workspace): clickable `.chatSep` rule inserted before
    every user turn (jump-to-message); SEND-LOCK — send/mic/input disabled the
    moment a user msg is added, re-enabled on the next bot msg or a 60s timeout.
  - M3 SELECTION MENU: now Explain · Translate · Read from here · **Ask…**
    (mockup 2b popover): selTranslate sends the selection through the chat;
    selAsk pre-fills the input + focuses; both un-collapse the companion
    (+ mobile sheet). selBar restyled as a joined ruled strip.
  - M6 MOTION SYSTEM: one 200ms ease transition (bg/color/border/opacity/filter)
    across every interactive element; `prefers-reduced-motion` kills all
    transitions/animations; long-file-name ellipsis (.sTop b/.jTxt b/.hdrDoc).
  **WAVE 8 ✅ — structural rebuilds after KRK's screenshot review:**
  - **scan.html REWRITTEN from scratch** (mockup 5a capture station; scan-page.js
    untouched — every bound id preserved: camVideo/camOverlay/camMsg/filterSel/
    shotBtn/camInput/shots/exportCard/shotCount/expPdf/expImgs/expWord/expMsg/
    topTheme/acctTheme/hambBtn/navVeil): 52px top bar (brand · "Scan a paper" ·
    privacy line · theme icon), full-height grid = STAGE (bordered viewfinder w/
    live-detect pill, shutter dock: Photo ghost + 74px SQUARE ACCENT SHUTTER +
    hint, numbered page strip) | 340px ENHANCE rail (preset TILES driving the
    hidden data-native #filterSel via inline script, note, export card bottom:
    accent "Save as PDF" + Word(OCR)/Images pair). Page-scoped <style>. Mobile
    stacks. select-style.js dropped from the page (no visible selects).
  - **Home "Scan a paper" now routes to scan.html** (lx-workspace `scanRoute()`,
    capture-phase — the LEGACY in-app camera overlay no longer appears from the
    workspace; header menu "Scan with camera" still uses it for add-page flows).
  - **Top bar chrome to mockup** (`hdrChrome()`): #userEmail hidden, NEW
    #hdrEngine chip (mirrors companion walletLabel → "SWIFT · 99%") + #hdrAvatar
    initial box; rail privacy lock anchored to the BOTTOM (`.railPriv`
    margin-top:auto, navSep hidden on desktop).
  - **Login**: guest button → quiet text link (no button chrome).
  - **Tool flow restyle to 3b WITHOUT touching tools-page.js**: tool header
    left-aligned + ruled; #tvSide = ruled 340px options panel (serif .sTop title,
    caps option labels, full-width accent .goBig with → arrow); .fCard file cards
    → full-width ROWS (52×64 thumb · name/size · joined action strip, collapsing
    -1px borders); progress/done .stateCard = ruled frame + 3px thread meter.
  **WAVE 9 ✅ — SCAN v2: full capture → review → export workflow (KRK's 5c ask).**
  `scripts/scan-page.js` REWRITTEN (~370 lines; scan-engine.js untouched):
  shots = {raw (warped canvas, rotation baked), filter, canvas (rendered)};
  camera mode ⟷ REVIEW mode (click any page in the strip): large preview
  (#revStage/#revBox) + Crop / Rotate / Delete action row + "‹ Camera" back;
  CROP = draggable 4-corner-handle rect overlay (pointer events, Apply slices
  raw via drawImage, Cancel), ROTATE = rotate90 baked into raw, presets rail now
  edits the SELECTED page in review (or sets the next-capture default in camera —
  #filterSel select REMOVED, defFilter var instead); viewfinder is object-fit:
  COVER (fills large, mockup framing) with orange corner markers on the live
  quad; page strip: numbered, selected ring, ✕, dashed [+] tile → camera.
  EXPORT: format TABS (PDF / JPG / Word·OCR) + one "Save N pages" accent action
  + **"Read aloud in the reader"** — builds the PDF blob and hands off via the
  same IndexedDB 'lxhand' record app-documents.js picks up (blob/name/t).
  scan.html stage rebuilt (#camStage + #revStage), old inline preset script and
  expPdf/expImgs/expWord buttons removed (logic now inside saveAll). All ids
  verified present; node --check clean.
  **WAVE 10 ✅ — scan v2.1 polish after KRK's second screenshot pass:**
  - FIXED the mode bug (both stages visible → tiny preview): explicit
    `#camStage[hidden]/#revStage[hidden]{display:none !important}` (the flex
    display was overriding the hidden attribute).
  - REVIEW = the Design-reference layout: `.scanStage.review` grid — PAGES
    column LEFT (the #shots strip flips vertical, scrollable, + tile), big
    preview center, Crop/Rotate/**Enhance (cycles Auto→Original→B&W)**/Delete
    row under it, EXPORT rail right reorganised: EXPORT kicker + PDF/JPG tabs +
    "Save N pages" · HANDOFF kicker + "Read aloud" + "OCR text (Word)"
    (saveWord() extracted; word tab removed) + order note.
  - Capture dock = mockup 5a: **Auto/Manual segment** (functional — Manual
    turns the live edge overlay off), photo square · 64px BORDERED shutter
    (orange fill inset) · **rotate-last** square, hint right.
  - ACCOUNT MOVED TO TOP-RIGHT on desktop (all pages): rail shows no profile
    chrome; on index the #hdrAvatar opens the existing account popover, now
    position:fixed under the top bar (right:14px top:58px); standalone pages'
    rail theme/back buttons hidden on desktop (theme lives in the top bar).
  **WAVE 10.1 ✅ — scan pixel pass (root cause of the "small camera/preview"):**
  pages.css STILL had the legacy scan block (`#camWrap{aspect-ratio:3/4;
  max-width:560px; margin:auto}`, contain-fit video, ROUND #shotBtn + theme's
  circle-list entry) silently overriding the new station → camera rendered as a
  narrow centered strip and the review preview collapsed. FIX: legacy block
  DELETED from pages.css (scan styling is now 100% inside scan.html) and
  #shotBtn removed from theme.css's border-radius:50% list. Rail rebuilt to the
  FULL mockup-5a structure, all functional: presets 2×2 (+ **Grayscale**),
  **Straighten slider** (±10°, canvas-rotate), **Brightness slider** (±40,
  ctx.filter), **Clean up** square-check (contrast/brightness pass on Original),
  ADD PAGE accent CTA pinned to the rail bottom (capture ⟷ back-to-camera).
  Per-shot opts model {filter,deg,bright,clean} → develop pipeline
  raw→straighten→preset→clean→brightness (renderShot); controls edit the
  selected page in review or the next-capture defaults in camera (target()).
  MOBILE (5b): ≤700px = full-bleed camera, floating dock (page-STACK thumb w/
  count → opens review · 72px ROUND shutter · photo), strip floats above the
  dock; review stacks vertically and the export rail appears below (:has).
  **WAVE 11 ✅ — Plans & wallet = TWO embedded components (KRK's arch fix).**
  The #plans modal was one long stack (broken: overflowing, full-width orange
  .fromWallet blocks). REBUILT to the reference: header (kicker + serif +
  ₹ balance) → **Wallet ⟷ Plans segmented tabs** → two panes:
  • WALLET pane = top-up card (unchanged bindings) + NEW "WHAT YOUR WALLET PAYS
    FOR" ruled price list (web search / voices / summaries / conversions).
  • PLANS pane = "CHOOSE YOUR ENGINE · PAY FROM WALLET" + 3 shared-border engine
    cards: **Spark (Free, CURRENT badge)** / Swift ₹49 / Sage ₹99 — serif names,
    provider-neutral taglines, serif prices, .fromWallet button restyled as the
    card's primary action; convert/doc become full-width rows below.
  Tab toggle + Free/current sync = NEW `walletTabs()` in lx-workspace.js
  (presentational only; reads #planStatus). ALL app-wallet.js bindings preserved
  (walletMoney/planStatus/wtop/wCustomAmt/wCustomBuy/.planCard[data-plan]/.price/
  customProv/customAmt/customBuy/customTok/convertCard/docPlanCard/plansClose) —
  customCard kept as a hidden bindings block. plansClose is now the top-right ✕.
  **WAVE 11.1 — KRK CONFIRMED the Free/Sage/Saga + provider labels (hide-provider
  rule dropped for the plan cards):** engine CARD display text now matches the mock
  exactly — **Free / Powered by Amazon** (₹0 included, Current badge), **Sage /
  Powered by OpenAI** (data-plan sub_openai_49, ₹49), **Saga / Powered by Claude**
  (data-plan sub_claude_99, ₹99); prices carry "switch · from wallet" small text.
  (The rest of the app — companion wallet label, settings — still uses the ENGINE
  map's Spark/Swift/Sage; a full rename there is still a separate task.)
  BUTTON LOGIC (renderWalletButtons rewritten): every paid card ALWAYS shows a
  button — wallet covers it → orange **"Switch to <Name>"** (buyFromWallet); not
  enough → ghost **"Buy ₹X"** (Razorpay). Card-body click-to-buy REMOVED (only the
  contextual .pwRow convert/doc rows stay click-to-buy) so the explicit buttons own
  the action. openPlans price suffix unified to "switch/top up · from wallet".
  BUGS FIXED: `#plansClose{width:100%}` (old rule → the ✕ was full-width) repointed
  to a top-right square; box widened to 1120px (fits 3 cards). Insufficient-balance
  button hover was painting solid orange — a stray `.fromWallet:hover{background}`
  after the `.insuff` rule; removed. "· from wallet" is now conditional
  (renderWalletButtons: shown only when walletPaise ≥ price; else "Buy ₹X" ghost).
  **WAVE 11.2 — softer rounded look (KRK's Claude-Design "Plans and Wallet.dc.html"):**
  the modal switched from flat shared-border to ROUNDED cards w/ panel bg + gaps:
  pill segmented tabs (12px, orange active pill), wallet top-up wrapped in a 14px
  `--panel2` panel with 10px chips (₹49 .on = accent tint) + rounded "Add to wallet",
  pay-for divided rows, 3 engine cards = 14px `--panel2` panels (gap:16px, current =
  accent border, 10px icon boxes, 20px CURRENT pill, 10px buttons), modal box 18px
  radius. CRITICAL: had to REMOVE .planCard/.walletCard/.wtop/.fromWallet/#wCustomBuy/
  #plans .box/#plansClose from theme.css's two `border-radius:0 !important` sweeps +
  the old flat `#plans .planCard .ic` box rule — those were overriding the rounding.
  **WAVE 11.3 — plans buttons rounded + compact header + mobile layout:**
  the pill tabs / chips / Switch buttons were STILL square because theme.css's
  global `button{border-radius:0 !important}` catch-all beat them — fixed with
  higher-specificity `#plans .pwTab{…!important}` etc. Card header restructured to
  `.engHd` = icon BESIDE `.engNames` (name + "Powered by X" stacked) with the
  CURRENT badge absolute top-right → saves a row per card, kills the desktop
  scroll. NEW mobile block (≤899px, where the modal is 460px wide): ₹ balance
  becomes its own bordered panel under the title; tabs = full-width 2-col; top-up
  chips = 2-col grid (custom + Add span full width); plan cards stack with price +
  Switch/Current button INLINE on the bottom row (grid-areas hd/desc/price/btn).
  **WAVE 12 (SUPERSEDED by 12.1) — briefly routed both scan buttons to scan.html.**
  **WAVE 12.1 ✅ — TWO distinct scan intents (KRK's final call):** the scanRoute()
  redirect was REMOVED. "Scan a paper" (#scanBtn) + header "Scan with camera"
  (#scanHdrBtn) → the FAST in-app camera (openCamera → #camModal → Capture → OCR →
  reader opens automatically, no navigation — Lexora's frictionless flagship flow,
  untouched logic). The rail/nav "Scan" (<a href="scan.html">) → the full Scan Tool
  STATION (multi-page/crop/enhance/save/export + Read-aloud handoff). Same camera
  visual language in both (camModal restyled to the station: dark, orange edge
  quad, ROUND shutter matching #shotBtn, Auto/ghost controls, de-emojied).
  scan.html ENRICHED to the Design ref (scan-page.js logic preserved, additive):
  NEW Contrast slider (ctSlide → ctx.filter contrast), "Apply to This page/All
  pages" toggle (applyAll → spreadToAll copies filter/deg/bright/contrast/clean
  to every shot), Page size Auto/A4/Letter (buildPdf fits image centered on the
  fixed sheet), HANDOFF gained "Copy plain text" (ocrAll → clipboard) + relabeled
  "OCR to editable text (Word)"; dock "Auto edges", review back = "New scan",
  ROUND shutter (KRK's ref shows round). All ids verified, node --check clean.
  **WAVE 13 ✅ — CLEAN ARCHITECTURAL MIGRATION (frontend rewrite, phase 1: services).**
  Design package (`Lexora Design Package.dc.html`, in uploads) read in full; it is
  the SAME design system the app already implements → KRK chose a **clean
  architectural rewrite** (modernize structure, reuse matching UI, replace brittle
  DOM-coupled code). Functional truth = `docs/PLATFORM-ARCHITECTURE.md`; plan =
  `docs/FRONTEND-REBUILD-PLAN.md` (live progress log there).
  NEW **core layer** (DOM-free namespace `Lx`, loaded before every feature script
  on index/tools/settings/login):
  - `core/config.js` (Lx.config — all endpoints + localStorage keys, ONE source),
    `core/supabase.js` (Lx.sb + Lx.session — the ONE client),
    `core/auth.js` (Lx.auth — token/401, safeNext/goLogin ?next, returning, logout),
    `core/api.js` (Lx.api — gateway.{chat,me,stt,rag.*} · payments.{config,order,
    verify,switchEngine,walletDeduct,walletBuysub} · convert.{quote,run}; centralized
    auth-header + ONE 401 refresh-retry + normalized ApiError + keepalive),
    `utils/format.js` (Lx.fmt), `domain/metering.js` (Lx.plans — engine/tier names,
    prices/rates from live /config, docQuote, convertBalance).
  MIGRATED onto the core (behavior preserved, legacy inline fetch/auth/config
  DELETED): app-companion (askAI/stt), rag (deep index/query/delete), app-wallet
  (buy/verify/switch/wallet/me + all plan tables → Lx.plans), tools-page (quote/
  convert — **its duplicate Supabase client+config retired**), login.html +
  settings.js (own clients/config retired). RESULT: exactly ONE Supabase client &
  ONE endpoint config in the whole frontend; zero direct worker fetches outside
  Lx.api; all node --check + HTML parse green. Backend/workers UNTOUCHED.
  NEXT (see FRONTEND-REBUILD-PLAN §4b): engine-layer docs (scan-engine/shared are
  already pure), per-page controller modularization, then a11y/responsive/perf pass.
  **DEEP FEATURES STILL OPEN (KRK's phases — need engine/JS-heavy sessions, in
  priority order):** (a) Scan capture station v2: live draggable quad corners,
  per-page review strip with crop/rotate/enhance/delete + PDF/JPG/★Searchable
  export (5a–5c) — scan-page.js + scan-engine.js rework; (b) AI Workflow Queue /
  planning agent ("convert→compress→translate, show plan, deselect steps, run in
  background") — new orchestrator over the tool engines + jobs feed (lxJobs API
  is ready); (c) semantic suggested questions (needs a cheap /chat call or rag.js
  keyphrase pass — do NOT hardcode); (d) chat edit/retry/stop/copy per message +
  streaming (app-companion.js surgery); (e) tool flow OPTIONS step + animated
  node-motif progress for FREE tools (tools-page.js, fresh session);
  (f) AI-Engine settings rows to mockup 4b exactly (settings.js render).
  KNOWN FIDELITY GAPS (list for next session): no live "SWIFT · 99%" chip in top bars
  (needs wallet data plumbed to a header chip); reader Focus-mode toggle + rail
  zoom/night icons not built; playbar lacks inline sentence-text + draggable thumb
  (app-viewer.js engine work); companion answers don't render ¶ source chips (rag UI);
  job-queue surface (3c) NOT built (premium jobs are synchronous today — needs
  worker/API support first); scan review strip (5c) still the legacy #shots row;
  settings content column still card-based (structure matches, chrome differs).
  REMAINING (separate sessions): editor handle polish (injected CSS in tools-page.js);
  karaoke 2px current-word underline (app-viewer.js marker); onboarding tour emoji;
  in-chat text emoji from JS strings (app-core/app-documents greetings); mobile bottom
  tab bar, job queue surface, scan capture station (5a–5c), landing node-hero variant B.
  Mockup extras to consider later: job-queue surface (3c), mobile bottom tab bar (4c),
  scan capture station (5a–5c).

- **Step 6 — Own Voice TTS / PWA / Capacitor:** Voice = separate project (see
  `LEXORA-VOICE-HANDOVER.md`, founding doc DONE — consider Phase 5 half-started);
  PWA ✅ done (Step 5e); Capacitor = KRK-machine task with docs/CAPACITOR-GUIDE.md.

### The conversion-server contract (what KRK's server must implement)
`worker-convert.js` forwards to `CONVERT_SERVER_URL/convert` as `multipart/form-data`
with fields `file` (the input), `tool` (the tool id, e.g. `pdf2word_hd`, `compress_hd`,
`pdf2ppt`…), and **`maxPages`** (convert ONLY the first `maxPages` pages — this is how the
anonymous "first 50 free" partial conversion works; for full jobs it equals the page
count), plus header `Authorization: Bearer CONVERT_SERVER_KEY`. The server must return
the converted file bytes with the right `Content-Type`
(`application/vnd.openxmlformats-officedocument.wordprocessingml.document` for .docx,
etc.) — optionally an `X-Filename` header — or a non-2xx status on failure (the worker
then refunds the wallet). Suggested server: a small Node/Python service wrapping
`libreoffice --headless --convert-to`, Ghostscript for compression, `qpdf`/`pdftk` for
page-range trimming (to honour `maxPages`), and (later) a commercial SDK.

### Env for `worker-convert.js`
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `ALLOWED_ORIGIN`,
`CONVERT_SERVER_URL`, `CONVERT_SERVER_KEY` (Secret), **`IP_SALT` (Secret — salts the
anonymous IP hash)**, and optional overrides `FREE_PAGE_CAP` (50),
`PRICE_PER_PAGE_PAISE` (10), `MIN_CHARGE_PAISE` (500), `CAP_CHARGE_PAISE` (9900).

Also, the Step-2 premium UI must let ANONYMOUS users call `/quote` + `/convert` (no
`Authorization` header) so the free 50-page tier works without login — only add the
token when the user is logged in. On a partial/anonymous result show "converted the
first N pages free — log in to do the whole file".
