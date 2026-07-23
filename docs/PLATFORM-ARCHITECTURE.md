# Lexora AI — Platform & Functional Architecture (UI-Agnostic)

> **Purpose.** This document is the durable source of truth for **what Lexora AI
> does and how it works underneath** — features, workflows, pipelines, APIs,
> data model, workers, engines, security, privacy, and the architecture needed to
> scale to millions of users. It is **frontend-independent**: the current HTML/CSS
> is treated as disposable and is deliberately **not** described here. Any new UI
> (designed separately) must be buildable on top of exactly these contracts.
>
> Scope note: this captures the system **as currently implemented** (the ground
> truth) and then, in Part 9, the **target architecture** for scale. Where the two
> differ, both are stated so nothing is lost in a rebuild.

---

## PART 0 — Product in one paragraph (functional definition)

Lexora AI is a **privacy-first document workspace**. A user brings a document
(PDF, Word, text, images, or a camera scan). Lexora can: **read it aloud** with
sentence/word synchronization; **answer questions** about it via an AI companion
that is grounded in the document and privacy-tiered; **transform** it with 40+
document tools (merge, split, compress, convert, OCR, sign, edit, redact, crop,
translate, …); and **scan paper** into clean pages. Free capabilities run
**entirely on the user's device** (files never leave). A small set of
server-backed "★ premium" capabilities exist for jobs a browser cannot do; those
require **explicit consent**, are metered, and are billed from a **₹ wallet**.
The AI companion is metered separately in **tokens**. Made in India; prices in ₹.

The **invariant that defines the product**: *free = 100% on-device & private;
paid/server = consent-gated, metered, deleted-after-use.* Every architectural
decision must preserve this.

---

## PART 1 — Capability catalog (features & functionality)

Each capability below is a **contract**: an input, a process, an output, and the
constraints that must hold regardless of UI.

### 1.1 Reader (on-device, free)
- **Input:** an opened document (see §2 pipelines).
- **Function:** render pages faithfully; build a **sentence model** with per-line
  geometry; **speak** sentences via Web Speech `speechSynthesis`; **synchronize** a
  visual marker to the currently spoken line/word ("karaoke"); navigate by
  sentence and page; adjust speed and voice; resume from last position.
- **Output:** audio narration + a moving highlight anchored to page coordinates.
- **Constraints:** works offline; no upload; must handle PDF (text + scanned),
  DOCX (with formatting), TXT/MD, and image pages.
- **Voice:** uses the OS/browser voices; the product recommends Edge "Natural"
  voices where available. Voice + rate + selected voice persist.

### 1.2 AI Companion (privacy-tiered, metered)
Three **document-understanding modes** (privacy tiers), user-selectable:
- **Private AI (default):** 100% on-device retrieval; only the question + selected
  top passages are sent to the chat endpoint (never the whole corpus unless tiny).
- **Smart AI (recommended):** same privacy, plus an on-device orchestrator (intent
  detection + hybrid retrieval; §5).
- **Deep Research (opt-in, per-document consent):** chunks are **temporarily**
  indexed server-side (Cloudflare Vectorize + Workers AI embeddings) with a **24h
  expiry**, then queried; falls back to Smart AI if unavailable.

Companion functions: **explain** selected text, **explain page**, **summarize**,
**answer questions**, **translate a passage**, **voice commands** ("go to page
three", "read from here"), and **navigation** by command. Answers are grounded in
the open document and cite the passage/page used when possible. Responses are
metered in tokens (§4) and routed by plan/tier (§3).

### 1.3 Document Tools (40+; free on-device, some ★ premium server)
- **Free client-side (private, no consent):** merge, split, remove pages,
  organize/reorder, rotate, **true compress** (never larger — returns original if
  not smaller), repair, **OCR** (searchable), jpg→pdf, word→pdf, pdf→jpg,
  pdf→word (with OCR fallback), pdf→text, pdf→markdown, watermark, page numbers,
  unlock (owner + password-aware), image compress, image resize, image→text,
  word→txt, word→md, **edit PDF** (text boxes + white-out, tap-to-edit),
  **sign PDF** (draw/type/import, drag+resize, stamp), **protect** (encrypt),
  **crop**, **redact** (flatten covered pages so content is truly removed),
  **fill forms**, **compare** (pixel diff), **edit Word**, **pdf→ppt**
  (page-image slides).
- **★ Premium server-side (consent + metered):** HD compress (Ghostscript
  profiles), HD OCR (multi-language, ocrmypdf), word/ppt/excel→pdf (LibreOffice),
  pdf→word HD (pdf2docx layout parsing), pdf→excel (camelot tables), pdf/A
  (Ghostscript), html→pdf (headless Chromium; URL or file), **translate**
  (self-hosted NLLB-200), text-preserving unlock (qpdf --decrypt).
- **Tool→Reader handoff:** any tool result can be opened in the reader via a
  short-lived IndexedDB record (`lxhand`; §2.5).

### 1.4 Scanner (on-device, free)
Two intents share one camera component:
- **"Scan a paper" (fast intent):** camera → live edge detection → capture → OCR
  → **reader opens automatically**. Zero navigation. This is a flagship flow.
- **"Scan Tool" (productivity intent):** dedicated workspace — multi-page capture,
  per-page **crop / rotate / enhance (Auto/Original/B&W/Grayscale) / delete**,
  straighten/brightness/contrast sliders, clean-up, **export** PDF/JPG (Auto/A4/
  Letter), and **handoff** (Read aloud / OCR→Word / Copy plain text).
- **Engine:** on-device quad detection, perspective warp, and scan filters. No
  upload. Multi-page batch supported; pages are canvases held in memory.

### 1.5 Wallet & Plans (money + tokens)
- **₹ Wallet (money):** integer **paise** balance; top up once, spend on anything
  (premium tools + AI engines). Atomic credit/deduct.
- **AI plans (tokens):** Spark (free), Swift (OpenAI family), Sage (Anthropic
  family). Buy from wallet or Razorpay. Tiers (Core/Plus/Ultra) change model &
  burn multiplier. Switch engines free (value-converts balance).
- **Pay-per-document:** one-off unlock priced from page count (Swift Core).

### 1.6 Search (command palette)
Client-side command palette over navigation destinations, all tools (deep links),
and quick actions (e.g. theme). Keyboard-first. **No server dependency.**

### 1.7 Jobs (background premium work)
A queue surface for premium/long-running server jobs (running/done/failed with
refund). Feed persisted client-side today; designed to move to server-tracked
async jobs at scale (§6.4, §9.5). **Premium-only.**

### 1.8 Authentication & Account
Supabase Auth: Google OAuth, Apple (planned), **email OTP/magic-link**, and
**guest** (reader + tools only, no account). Post-login **redirect preservation**
(return the user to where they were headed). Profile auto-created on signup.

---

## PART 2 — Document ingestion & processing pipelines

All ingestion is **client-side** unless a ★ premium server tool is explicitly
invoked with consent.

### 2.1 File dispatch
`openFile(file)` routes by extension/MIME:
`pdf → openPdf`, `docx → openDocx`, `txt|md → openText`, image → `openImagePages`.
Unknown types are rejected with a plain-language message.

### 2.2 PDF pipeline
- **Engine:** pdf.js (bundled, `lib/pdf.min.js` + worker), legacy build so it works
  from `file://` and offline.
- **Render:** page canvas + a **text layer** (from `getTextContent()` +
  `Util.transform` positions) for selection and sentence geometry.
- **Line extraction:** items grouped into lines with x/xEnd/y/height, used for the
  karaoke marker and sentence building.
- **Scanned PDFs (no text):** fall back to **OCR** (Tesseract.js) page-by-page.
- **Password PDFs:** pdf.js `onPassword` prompts locally; password **never leaves
  the device**.

### 2.3 DOCX pipeline
Mammoth.js converts to HTML preserving headings/bold/lists/tables/images; if empty,
falls back to raw text. Rendered as real formatted pages.

### 2.4 Image / scan pipeline
One or many images become a **multi-page image document**; each page is OCR'd
(Tesseract). Reading starts after page 1 while later pages OCR in the background.
Camera scans feed the same path.

### 2.5 OCR pipeline (client)
- **Engine:** Tesseract.js 5.x (bundled wasm core + `eng.traineddata.gz`).
- **Worker:** created per job (`newOcrWorker`), reused across a document's pages.
- **Alignment:** OCR output aligned to page geometry so the searchable text lines
  up with the karaoke marker.
- **Server HD OCR:** ocrmypdf (Tesseract) with multi-language packs for ★ tools.

### 2.6 Sentence model & narration
- Lines → **sentences** with `lineToSent` mapping (so a line highlights while its
  sentence is spoken). Spelled numbers and positional words are normalized so
  voice commands work across browsers.
- **Speech:** `speechSynthesis` + `SpeechSynthesisUtterance`; cancel/resume
  guarded against browser quirks.

### 2.7 Tool→Reader handoff contract
IndexedDB DB `lxhand`, store `f`, key `doc`, value `{ blob, name, t }`. The reader,
on load, picks up a record **younger than 10 minutes**, opens it, and **deletes**
it on pickup. Used by both the tools page and the scanner "Read aloud".

---

## PART 3 — AI routing, engines & tiers

### 3.1 User-facing engines (provider names hidden by policy in-product)
| Engine | Provider family | Notes |
|---|---|---|
| **Spark** | free provider (`FREE_PROVIDER`: OpenAI `gpt-4o-mini` **or** Amazon Bedrock `amazon.nova-micro-v1:0`) | free tier, or paid wallet empty |
| **Swift** | OpenAI | Core `gpt-4o-mini`, Plus/Ultra `gpt-4o` |
| **Sage** | Anthropic (web search enabled) | Core `claude-haiku-4-5`, Plus `claude-sonnet-5`, Ultra `claude-opus-4-8` |

Model ids are **env-overridable** (no redeploy to upgrade a model).

### 3.2 Tiers & burn multipliers
Per paid engine: **Core / Plus / Ultra**. The wallet is denominated in **Core
tokens**; higher tiers burn `raw_tokens × multiplier`, keeping margin constant
whichever tier the user picks. Multipliers env-tunable
(`TIER_MULT_OPENAI="1,12,25"`, `TIER_MULT_ANTHROPIC="1,3,15"`). Document packs are
locked to Core.

### 3.3 Routing rule (authoritative)
```
if plan != 'free' AND tokens_balance > 0 AND provider in {openai, anthropic}:
    → paid path: user's provider + selected tier's model, metered
else:
    → free path: FREE_PROVIDER (Spark)
```
Wallet-empty paid users **automatically** behave as free tier.

### 3.4 Token Saver (optional optimization)
When enabled on a paid call with large context, the **free** engine first
compresses the context to only the sentences needed to answer, then the paid
engine runs on the compressed context — same answer, fewer paid tokens.
Best-effort; falls back to full context on failure.

### 3.5 Context assembly & privacy
The chat request carries `question`, an optional `context` string (≤ ~9000 chars
of the relevant passages, **not** the whole document), `docName`, short `history`
(last 6 turns), and reply `lang`. Private/Smart modes never send the full corpus.

---

## PART 4 — Metering, billing & wallet logic

### 4.1 Two independent balances
- **AI tokens** (`profiles.tokens_balance`, bigint) — consumed per question.
- **₹ money** (`profiles.wallet_paise`, bigint paise) — consumed per premium page
  and used to buy plans.

Both mutated **only** by SECURITY DEFINER RPCs (atomic, race-free).

### 4.2 Token metering (per chat answer)
`total = ceil((tokens_in + tokens_out) × tier_multiplier)`; if paid,
`deduct_tokens(uid, total)`; every request logged to `usage_log`. Response returns
`tokens_used`, `tokens_left`, `plan`, `tier`. Structured observability line per
answer (provider/model/tier/latency/deducted).

### 4.3 Premium tool metering (per conversion)
- **Free daily cap:** `FREE_PAGE_CAP` (default **50**) pages **per tool per day**,
  tracked per **user** (`tool_pages_today`) when logged in, else per **hashed IP**
  device (`tool_pages_today_ip`).
- **Over the cap:** `PRICE_PER_PAGE_PAISE` (default **10** = ₹0.10/page), with
  `MIN_CHARGE_PAISE` (₹5) and `CAP_CHARGE_PAISE` (₹99) bounds. `deduct_wallet`
  (fails cleanly if insufficient). Logged to `tool_log` with `cost_paise`.
- **Anonymous partial:** an anonymous over-cap upload converts only the first N
  free pages (header `X-Lexora-Partial:1`) and prompts login for the rest;
  anonymous users cannot pay.
- **Refund on failure:** if the conversion server errors, the charge is refunded.

### 4.4 Plans & payments (Razorpay)
- Plans configured env-side (`PLAN_SWIFT_INR/TOKENS`, `PLAN_SAGE_INR/TOKENS`);
  defaults calibrated for **75–80% gross margin at full consumption** (breakage
  pushes real margin higher).
- **Order → Verify → (Webhook safety net)**: idempotent via
  `transactions.razorpay_payment_id UNIQUE` so a payment is **never
  double-credited** even if verify and webhook race.
- **Switch engines free:** remaining balance **value-converts** by money value
  (nothing paid-for is lost).
- **Buy plan from wallet:** `deduct_wallet → credit_tokens`, logs a
  `sub_from_wallet` transaction.
- **Pay-per-document:** `pages × 800 × 4 + 50000` tokens, min ₹19.

---

## PART 5 — Retrieval engine (companion grounding)

Client engine (`rag.js`), integrates via `LxRag.getContext(question)`:
- **Chunking:** sentence-based (~1100 chars, 1-sentence overlap), heading-aware.
- **Embeddings:** Transformers.js v3, `Xenova/all-MiniLM-L6-v2` (q8), **WebGPU
  with automatic WASM fallback**.
- **Storage:** vectors cached in **IndexedDB** keyed by document fingerprint;
  in-memory Float32Array cosine search.
- **Hybrid retrieval (Smart):** dense vectors **+ BM25 keyword** index, fused via
  **RRF** with boosts (reading-position page, heading match, date/timeline).
- **Intent routing (Smart):** summarize = spread sampling; compare = per-side
  retrieval; definition/find = keyword-weighted; timeline = date-boosted.
- **Tiny docs (≤ 8 KB):** skip retrieval — send everything (cheapest, identical).
- **Deep Research (opt-in):** server Vectorize index, ids `uid:docId:i`, metadata
  `{ns, page, text, exp=now+24h}`; expired matches filtered; client deletes on
  document close. Falls back to on-device Smart on 503.

---

## PART 6 — Backend services (workers, servers, contracts)

Backend = **Supabase** (auth + Postgres + RPCs) + **3 Cloudflare Workers** +
**2 containerized services** (Railway). All stateless workers; all state in
Postgres/Vectorize.

### 6.1 Gateway Worker (chat / me / stt / rag)
`readaloudai.*.workers.dev`
- `POST /chat` — auth (Bearer Supabase token) → load profile → route (§3) →
  meter (§4.2) → `{answer, tokens_used, tokens_left, plan, tier}`.
- `GET /me` — `{plan, provider, model, tokens_balance, tokens_used, wallet_paise,
  effective:'paid'|'free'}`.
- `POST /stt` — OpenAI transcription fallback for browsers without native speech
  (audio ≤ ~5 MB / ~20 s).
- `POST /rag/index | /rag/query | /rag/delete` — Deep Research (needs `VECTORIZE`
  + `AI` bindings; else 503).
- **Rate limits:** per-minute + per-day, free vs paid (`RATE_PER_MIN`,
  `RATE_PER_DAY_FREE`, `RATE_PER_DAY_PAID`); optional KV binding `RATE`.
- **Providers:** OpenAI Chat Completions, Anthropic Messages (with web search on
  Sage), Amazon Bedrock Converse (manual SigV4). System prompt localized by reply
  language.

### 6.2 Payments Worker (Razorpay)
`readaloudai-pay….workers.dev`
- `POST /order` (plan `sub_openai_49` | `sub_claude_99` | `doc` | wallet top-up),
  `POST /verify`, `POST /switch`, `POST /webhook` (Razorpay-called, no login),
  `GET /config` (public prices), `POST /wallet/deduct`, `POST /wallet/buysub`.
- Idempotent credit shared by verify + webhook.

### 6.3 Convert Gateway Worker (premium tool broker)
`readaloud-convert.*.workers.dev` (frontend `CONVERT_URL`)
- `POST /quote {tool, pages}` (auth optional) → the deal (free-left / consent /
  login / top-up decision).
- `POST /convert` (multipart: file, tool, pages, consent=1; auth optional) →
  compute billable pages → charge (server-side) or partial/anon → **forward to
  `CONVERT_SERVER_URL/convert` with `maxPages` + `opts` (JSON)** → stream result
  with `X-Lexora-Charge` / `X-Lexora-Partial` / `X-Filename` → **refund on failure**.
- **Identity:** logged-in by uid; anonymous by **salted IP hash** (`IP_SALT`).
- **Env:** `CONVERT_SERVER_URL`, `CONVERT_SERVER_KEY`, `IP_SALT`, `FREE_PAGE_CAP`,
  `PRICE_PER_PAGE_PAISE`, `MIN_CHARGE_PAISE`, `CAP_CHARGE_PAISE`.

### 6.4 Conversion Server (own engines, containerized)
Node/Express + multer, `POST /convert` (Bearer `CONVERT_SERVER_KEY`, fields
`file, tool, maxPages, opts`). **Engine policy: our own open-source engines only —
never a paid API.** `HANDLERS` map:
| tool | engine |
|---|---|
| word2pdf_hd / ppt2pdf / excel2pdf | LibreOffice headless |
| html2pdf | headless **Chromium** (`--print-to-pdf`; URL or file) |
| pdf2word_hd | **pdf2docx** (layout parsing) |
| ocr_hd | **ocrmypdf** (Tesseract, multi-lang, `--skip-text`) |
| pdfa | Ghostscript PDF/A |
| pdf2excel | **camelot** (ruled tables) |
| translate | our **translate-server** (NLLB-200) |
| unlock_hd | **qpdf --decrypt** (text-preserving) |
| compress_* | **Ghostscript** profiles (ebook/screen/printer; email ≤ ~4.5 MB) |
`maxPages` trims to the first N pages (honours the anonymous free partial).

### 6.5 Translate Server (own NLLB, containerized)
Flask, `POST /translate {q, source:'auto'|iso, target: iso-639-1 or FLORES-200}`,
`GET /` (engine info), `GET /healthz` (503 until model loaded).
- **Engine:** Meta **NLLB-200 int8 via CTranslate2** (<1 GB RAM, no torch at
  runtime); optional LibreTranslate proxy fallback.
- **Concurrency:** `MAX_CONCURRENCY` semaphore; **cgroup-aware CPU detection**
  (`effective_cpus()`) so thread budgeting is correct inside containers; binds
  IPv4+IPv6 (Railway mesh is IPv6-only).
- **Source auto-detect** (langdetect); all 200 NLLB languages via FLORES codes.
- Convert-server translate pipeline: `pdftotext` (reflow) → ~4000-char chunks →
  `/translate` (retry on 5xx/429) → LibreOffice → translated PDF.

---

## PART 7 — Data model (Postgres / Supabase)

**RLS everywhere; users can only SELECT their own rows; all writes via SECURITY
DEFINER RPCs (service role).**

- **`profiles`** — `id (uuid, =auth.users)`, `email`, `plan(free|sub|doc)`,
  `provider(free|anthropic|openai)`, `model`, `tokens_balance`, `tokens_used`,
  `wallet_paise`, timestamps. Auto-created by `handle_new_user` trigger.
- **`transactions`** — payment history; `razorpay_payment_id UNIQUE`
  (idempotency), `kind(sub|doc|admin_credit)`, `amount_inr`, `tokens_credited`.
- **`usage_log`** — one row per AI request (provider/model/tokens_in/out).
- **`tool_log`** — one row per premium tool run (`tool`, `pages`, `cost_paise`,
  `ip_hash` for anonymous), powers history + daily caps.
- **RPCs:** `deduct_tokens`, `credit_tokens`, `credit_wallet`, `deduct_wallet`
  (returns −1 if insufficient, never negative), `tool_pages_today`,
  `tool_pages_today_ip`.

**Wallet math is atomic**: `deduct_wallet` only updates when
`wallet_paise >= paise` (row-level `WHERE`), so concurrency cannot overspend.

---

## PART 8 — Security & privacy model (non-negotiable invariants)

1. **On-device by default.** Free tools, the reader, OCR, scanning, and
   Private/Smart companion retrieval run in the browser. Files, passwords, and the
   embedding DB never leave the device.
2. **Consent before any upload.** ★ premium tools and Deep Research upload only
   after explicit per-action consent; the free client version is always offered.
3. **Delete after use.** Server conversions and Deep Research vectors are
   temporary (vectors carry 24h `exp`; client deletes on close).
4. **Least privilege in data.** RLS own-read only; no client write path to
   balances; all money/token mutations are atomic RPCs under the service role.
5. **Idempotent money.** Payments cannot double-credit (`razorpay_payment_id`
   UNIQUE); wallet deductions cannot go negative.
6. **Server holds no secrets on the client.** API keys live only in worker
   env/secrets; the browser only holds a Supabase session token.
7. **Rate limiting** on the gateway (per-min + per-day, free/paid).
8. **CORS allow-list** (`ALLOWED_ORIGIN`) on every worker.
9. **Abuse boundaries:** anonymous free tier is bounded by salted IP hash (VPN/
   mobile-data reset is the accepted residual gap); STT size/time bounds; question
   length bounds; token length bounds.
10. **Privacy messaging is a feature, not fine print** — the product must always
    make the on-device/consent boundary explicit to the user.

---

## PART 9 — Target architecture for scale (millions of users)

The current design is already **horizontally stateless at the edge** (workers) and
**offloads compute to the client**, which is the biggest scalability lever. The
following hardens it for millions.

### 9.1 Edge & statelessness
- Keep all request logic in **stateless edge workers**; no sticky state. Scale is
  automatic on Cloudflare. Cold-start-free.
- Move in-memory rate-limit maps to the **KV `RATE` binding** (already supported)
  or Durable Objects for exact counters; today an in-memory `Map` is a per-isolate
  fallback (acceptable but approximate at scale).

### 9.2 Data tier
- Postgres via Supabase is the single source of truth for identity, balances,
  history. **Hot paths already atomic.** For scale: add read replicas for
  history/analytics; keep balance mutations on the primary via RPC.
- Partition/rotate `usage_log` and `tool_log` (time-based) and stream to a
  warehouse for analytics; keep only recent rows hot.
- Add composite indexes for the daily-cap queries (already indexed on
  `tool_log(ip_hash, tool, created_at)`; add `(user_id, tool, created_at)`).

### 9.3 AI provider tier
- Model ids are env-driven → upgrade models without redeploy. Add **provider
  failover** (already returns a clean 502 on failure; extend to auto-retry an
  alternate model/provider for Spark).
- Cache `/config` and `/me` at the edge briefly; keep `/chat` uncached.
- Budget guards: per-user daily token ceilings already exist via balance; add
  global provider spend circuit-breakers.

### 9.4 Retrieval tier
- On-device retrieval scales for free (client compute). Deep Research uses managed
  Vectorize (scales independently). Keep the 24h TTL + client delete to bound cost.
- For very large documents, cap indexed chunks per request (already 40/batch) and
  pre-index in the background.

### 9.5 Conversion / jobs tier (the main server-compute scaling work)
- Today the conversion server is **synchronous** (request holds until done). For
  scale and long jobs, evolve to an **async job queue**:
  1. `/convert` enqueues a job (id, tool, storage ref, opts, billing hold) and
     returns `202 + jobId`.
  2. A pool of **stateless conversion workers** (autoscaled by queue depth) pull
     jobs, run the engine, write output to short-lived object storage.
  3. Client (or the **Jobs** surface) polls/streams status; downloads on done;
     **charge is captured on success, released on failure** (matches today's
     refund-on-failure invariant).
- This unlocks: multi-step **AI workflow chains** ("convert → compress → translate
  → open in reader") as a plan of steps the user can reorder/disable before Run,
  runnable in the background. The `jobs` data contract (running/waiting/done/
  cancelled/failed) is the surface for it.
- Object storage for job I/O must be **encrypted, per-job, auto-expiring** to
  preserve the delete-after-use invariant.

### 9.6 Observability & ops
- Structured JSON logs already emitted per chat (ok/fail with latency). Extend the
  same to conversions and payments; ship to a log store + dashboards
  (latency, error rate, provider mix, margin per plan).
- Health endpoints: translate-server `/healthz` (readiness) pattern should exist
  on every container; add synthetic checks.
- Analytics scaffold is privacy-first (ships empty until IDs set); keep event
  names stable (`sign_up`, `tool_run`, `premium_run`, `purchase`).

### 9.7 Cost & margin control (business logic that must survive a rebuild)
- Engine cost is **fractions of a paisa** on open-source servers → ~100% margin on
  premium pages; AI plans target 75–80% gross at full consumption; **breakage**
  (unused balances) increases realized margin.
- All prices, caps, token sizes, and tier multipliers are **env-configured** — the
  business can retune without code changes. A new UI must read these from
  `/config` and `/me`, never hardcode them.

---

## PART 10 — API contract summary (what any new UI must call)

> Base URLs are env/deploy-specific; the **shapes** below are the stable contract.

**Auth:** Supabase session token (Bearer) on all authed calls.

| Method / Path | Service | Auth | Body → Response |
|---|---|---|---|
| `POST /chat` | Gateway | required | `{question, context?, docName?, history?, lang?, tier?, optimize?}` → `{answer, tokens_used, tokens_left, plan, tier}` |
| `GET /me` | Gateway | required | → `{plan, provider, model, tokens_balance, tokens_used, wallet_paise, effective}` |
| `POST /stt` | Gateway | required | audio body → `{text}` |
| `POST /rag/index` | Gateway | required | `{docId, chunks:[{i,page,text}]}` → `{ok, indexed}` |
| `POST /rag/query` | Gateway | required | `{docId, q, k?}` → `{ok, matches:[{page,text,score}]}` |
| `POST /rag/delete` | Gateway | required | `{docId, count}` → `{ok}` |
| `GET /config` | Payments | none | → plan prices/token sizes |
| `POST /order` | Payments | required | `{plan, pages?, inr?, provider?}` → Razorpay order |
| `POST /verify` | Payments | required | Razorpay verify payload → `{ok, …balances}` |
| `POST /switch` | Payments | required | `{}` → `{ok, provider, tokens_balance}` |
| `POST /wallet/deduct` | Payments | required | `{tool, pages, paise}` → new balance / 402 |
| `POST /wallet/buysub` | Payments | required | `{plan}` → `{ok, wallet_paise, tokens_balance}` |
| `POST /webhook` | Payments | Razorpay | signed event (idempotent) |
| `POST /quote` | Convert | optional | `{tool, pages}` → deal decision |
| `POST /convert` | Convert | optional | multipart `{file, tool, pages, consent, opts?}` → file bytes + `X-Lexora-*` headers |
| `POST /convert` | Conv-server | Bearer server key | multipart `{file, tool, maxPages, opts?}` → file bytes + `X-Filename` |
| `POST /translate` | Translate-server | (internal) | `{q, source, target}` → `{translation}` |

**Client-only contracts (no server):** reader/OCR/scan pipelines (§2),
tool→reader handoff (`lxhand`, §2.7), retrieval engine (§5), command palette (§1.6).

---

## PART 11 — Invariants a rebuilt platform must not break (checklist)

- [ ] Free = 100% on-device & private; files never uploaded without consent.
- [ ] Reader works offline (bundled pdf.js/Tesseract/mammoth).
- [ ] Companion is privacy-tiered (Private / Smart / Deep Research) and metered.
- [ ] Two balances, both mutated only by atomic RPCs; wallet never negative.
- [ ] Payments idempotent (no double-credit).
- [ ] Premium = consent + 50 free pages/day/tool + ₹0.10/page over cap, refund on
      failure.
- [ ] Own engines only on the server (never a paid conversion API).
- [ ] Server outputs & Deep Research vectors are temporary (delete/expire).
- [ ] Prices/caps/models are env-driven and read at runtime (`/config`, `/me`).
- [ ] Two scan intents preserved: fast (camera→OCR→reader) and productivity (Scan
      Tool workspace with export/handoff).
- [ ] Tool→reader handoff (`lxhand`) intact so any output can be read aloud.

---

*This document intentionally omits all visual/frontend detail. The UI is being
redesigned separately; it must be implemented strictly on top of the contracts,
pipelines, and invariants above.*
