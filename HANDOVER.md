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
- **`app-companion.js`** — askAI, conversation commands, mic/STT. **`normalizeCmd()`**
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
**edit**, **sign**, **protect**. Plus link cards: scan→scan.html, summarize→index.html.

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

**"SOON" (dimmed cards, `soon:true`) — these are the Phase-4 ★ premium/server targets:**
crop, forms, redact, compare, pdf2ppt, pdf2excel, pdfa, ppt2pdf, excel2pdf, html2pdf,
translate, editword. (Plus **server-grade** versions of compress, pdf2word, word2pdf, ocr.)

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

## 10. MESSAGE TO PASTE INTO THE NEW CHAT

> Continue the Lexora AI project. Read `HANDOVER.md` in the attached `online/` folder
> first — it has the full status, architecture, every file, the business model, traps,
> and the Phase-4 roadmap. Phases 1–3 are DONE (Claude theme + modular refactor;
> tools; Sign/Edit/Unlock/Protect PDF; the universal ₹ wallet backend+frontend). Your
> job is **Phase 4**: the server-side conversion engine and the **★ premium tools**
> (only the ones that truly need a server — HD PDF→Word/PPT/Excel, advanced compress,
> HD OCR, PDF/A, translate, true Edit PDF, etc.) with a **50-page/day free cap** per
> ★ tool, **explicit consent** before any upload, and **wallet charging** (~₹0.10/page,
> the `/wallet/deduct` endpoint + `tool_pages_today` already exist). Also move the ₹
> wallet into its own view and let it buy subscriptions (`/wallet/buysub`). Keep the
> standing rules: hide provider names in the UI (Spark/Swift/Sage); black/white/orange
> no-gradient theme; client-side tools stay private; recalibrate wallet economics if
> model prices changed. IMPORTANT dev traps: the bash mount serves stale/truncated
> snapshots (use the Read/Grep tools as truth; never `cat >>` append to Edit-touched
> files — it corrupts them); Sign/Edit CSS is injected from tools-page.js on purpose.
> First thing to verify: Protect PDF's `@cantoo/pdf-lib` `encrypt()` call actually works.

---

## 11. PHASE 4 — LIVE PROGRESS (update this as you go)

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
  NOTE: `pdf2word_hd` uses the **`pdf2docx`** Python engine (LibreOffice can't do PDF→Word
  — returns "conversion produced no output") and `ocr_hd` uses **`ocrmypdf`** (Tesseract,
  makes scanned PDFs searchable). The Dockerfile installs python3 + pdf2docx + ocrmypdf +
  tesseract-ocr — first build ~5–10 min. The rest (compress_*, word2pdf_hd, ppt2pdf,
  excel2pdf, html2pdf) are LibreOffice/Ghostscript. Supported ptools now: word2pdf_hd,
  ppt2pdf, excel2pdf, html2pdf, pdf2word_hd, ocr_hd, compress_hd/max/web/light.
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
- **Step 5 — Own Voice TTS / PWA / Capacitor:** ⬜ later.

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
