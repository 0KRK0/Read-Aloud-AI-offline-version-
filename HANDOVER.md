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
> translate-language fix requires re-pasting worker-convert.js); (2) implement the
> UI redesign when KRK brings mockups back (brief: docs/UI-REDESIGN-BRIEF.md —
> CSS-first, tokens first, element IDs must survive); (3) then Phase 4 v2
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
