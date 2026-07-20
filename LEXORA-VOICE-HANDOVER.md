# Lexora Voice — Project Handover (founding doc, 19 July 2026)

Give this file to the assistant in the NEW project. It defines the product, the
architecture, the ethics rules, the tech choices, the build phases, and exactly
how it integrates back into Lexora AI (lexoraai.online). Owner: KRK
(konarajeshkumar011@gmail.com). Made in India; payments in ₹.

---

## 0. WHAT THIS IS

**Lexora Voice** — "Your voice, reading everything." A standalone web app
(suggested: `voice.lexoraai.online`) where a user records **30–60 seconds of
their own speech** and gets a personal AI voice that narrates documents
naturally — pauses, intonation, human rhythm. It then plugs into the Lexora AI
reader as a new voice engine, so the document companion reads PDFs aloud **in
the user's own voice** (the personal version of what Speechify does with
licensed celebrity voices).

This is Phase 5 of the Lexora roadmap, built as its OWN application because it
has a different compute profile (audio models) and release rhythm. Lexora's
`online/` repo must NOT be touched from this project until the integration
phase.

---

## 1. NON-NEGOTIABLE RULES (inherited from Lexora + voice-specific)

1. **Own engines only** — self-hosted open-source models. Never a paid TTS API
   (no ElevenLabs/Play.ht/Azure). Same rule that governs Lexora's converters.
2. **Own voice ONLY.** Cloning requires a **spoken consent phrase** recorded in
   the same session/voice ("I, …, am recording my own voice for my Lexora
   voice profile"). We verify sample-vs-phrase speaker similarity server-side.
   NO celebrity voices, NO uploading someone else's audio. Speechify's celeb
   voices are licensed deals — without a license this is impersonation; we
   simply don't do it.
3. **Voice data is sacred**: a voice print is biometric data. Explicit consent
   screen before recording, one-tap permanent deletion (samples + embeddings +
   generated audio), never used to train shared models, never shared across
   accounts. Say all of this in plain language in the UI.
4. **Privacy-first framing**, same as Lexora: cloning/generation runs on OUR
   server (disclosed clearly); stock voices can run fully offline later
   (Piper WASM).
5. Black / white / orange design language, no gradients, Georgia display
   headings — it must feel like the same family as lexoraai.online.
6. Hide model names in the UI (users see "Own Voice", "Studio voices" — never
   "Chatterbox/OpenVoice/Piper").

---

## 2. ENGINE CHOICES (verify licenses again at build time — they change)

- **Voice cloning + natural TTS (the core):** shortlist, in order:
  1. **Chatterbox** (Resemble AI, MIT license, zero-shot cloning from short
     samples, emotion control) — first choice if quality holds on Hindi-accent
     English and Indian languages.
  2. **OpenVoice V2** (MIT) — tone-color cloning over a base TTS; solid
     fallback, lighter compute.
  ⚠ **XTTS-v2 is NOT usable** (Coqui CPML = non-commercial) and **F5-TTS
  weights are CC-BY-NC**. Do not ship them regardless of quality. Re-check
  every candidate's MODEL license (not just code license) before committing.
- **Stock voices (free tier):** **Piper** (MIT, fast CPU, many voices incl.
  Indian-English) — served from the voice server now, compiled to WASM
  (sherpa-onnx) inside the Lexora reader later for fully-offline stock TTS.
- **Speaker-similarity check (consent verification + quality gate):**
  a small speaker-embedding model (e.g. ECAPA/resemblyzer-class, MIT).
- Runtime pattern copied from Lexora's translate-server v2 lessons:
  quantize where possible, **cgroup-aware thread budgeting**, readiness
  endpoint `/healthz`, bind `listen='*'` (Railway private mesh is IPv6-only),
  concurrency semaphore, loud errors over silent defaults.

---

## 3. ARCHITECTURE

```
voice.lexoraai.online (Cloudflare Pages — static, same design system)
        │
        ▼
worker-voice.js (NEW Cloudflare Worker — auth, quotas, wallet charging)
        │
        ▼
voice-server (Railway Docker: FastAPI/Flask + the TTS engines)
        │
        ├─ Supabase  ← THE SAME PROJECT AS LEXORA (this is the integration
        │             trick: same accounts, same ₹ wallet, same RLS patterns)
        └─ Storage for samples/embeddings/audio: Supabase Storage (or R2)
```

- **Same Supabase project** = users log in once, one wallet pays for
  everything, and Lexora's reader can call the voice API with the token it
  already has. Reuse the auth-verification pattern from `worker-gateway.js`
  (`/auth/v1/user` check) and the wallet rails from `worker-payments.js`
  (`deduct_wallet`, `tool_log`).
- **New tables** (add to a `voice-schema.sql`, idempotent like Lexora's):
  `voices(id, user_id, name, status, consent_ok, embedding_path, created_at)`,
  `voice_jobs(id, user_id, voice_id, chars, cost_paise, status, created_at)`.
  RLS own-read/own-write, same style as `profiles`/`tool_log`.
- **API contract (worker-voice.js → voice-server):**
  - `POST /clone`   multipart: sample audio (30–60 s) + consent clip →
    verifies consent phrase + speaker match → stores embedding →
    `{voice_id, status}` (async job; poll `GET /voice/:id`).
  - `POST /tts`     `{text ≤ 2000 chars, voice_id | stock_voice}` → audio
    (mp3/ogg stream) + `X-Chars-Billed`. Sentence-sized calls, NOT whole
    documents — the reader speaks sentence by sentence anyway.
  - `POST /voice/delete` `{voice_id}` → wipes sample + embedding + cache.
  - `GET /healthz`  readiness (503 until models loaded).
- **Compute reality (be honest):** cloning-quality TTS on CPU ≈ real-time or
  slower. MVP strategy: sentence-level generation with aggressive **caching**
  (hash of voice_id+text → stored audio), a queue for long jobs, and
  pre-generation ("narrate this whole document" as an async job that produces
  an audio file/podcast). Interactive low-latency reading may eventually want
  a small GPU (Modal/RunPod per-second, or a used-GPU box) — decide on data,
  not up front. Piper stock voices are fast on CPU from day one.

---

## 4. BUSINESS MODEL (reuse Lexora's rails)

- **Stock voices: free** (reasonable daily character cap for anonymous, higher
  for logged-in — mirror the 50-pages/day pattern with `voice_jobs` totals).
- **Own Voice: premium.** Suggested: **₹149 one-time per voice** (creation) +
  generation metered from the ₹ wallet (~₹0.05–0.10 per 1000 characters over a
  daily free allowance). Charged via `deduct_wallet`, refuned on failed jobs —
  copy `worker-convert.js`'s charge→forward→refund-on-failure flow exactly.
- Same tone as Lexora: show the exact price before anything runs; "pay a few
  paise, hear yourself read".

---

## 5. BUILD PHASES

- **P0 — Scaffold:** repo `lexora-voice/` → `site/` (Pages), `worker-voice.js`,
  `voice-server/` (Dockerfile + app), `voice-schema.sql`, this file as README
  seed. Deploy skeleton with /healthz + a Piper stock voice speaking a demo
  sentence end-to-end. ✅ = you hear audio from the deployed stack.
- **P1 — Own Voice MVP:** consent flow → record 30–60 s in-browser
  (MediaRecorder, like Lexora's STT mic path) → /clone → status → type text →
  hear it in YOUR voice. Quality gate: reject too-short/noisy samples with
  friendly guidance ("quiet room, 45 seconds, read this paragraph").
- **P2 — Studio site:** voice management (rename/re-record/delete), sample
  scripts to read, generation history, wallet card (reuse Lexora's plans/wallet
  UI patterns), pricing page, privacy page for voice data specifically.
- **P3 — LEXORA INTEGRATION (the payoff):** in the Lexora repo (back to the
  `online/` project for this): reader Settings → Voice gains **"Own Voice"** —
  `speakText()`/`speakLine()` get an engine branch that fetches `/tts` per
  sentence (with lookahead prefetch + cache) instead of browser
  speechSynthesis; karaoke timing from audio duration. Companion replies can
  also speak in the user's voice. Feature-flag it; browser TTS remains the
  default and the offline fallback.
- **P4 — Offline stock voices:** Piper via sherpa-onnx WASM inside Lexora
  (no server, true privacy) — replaces robotic browser voices for everyone.
- **P5 — Studio v2:** emotion/style controls, long-form "document → audiobook"
  export (mp3 download), maybe family voices (each with their own consent).

---

## 6. TRAPS TO CARRY OVER FROM LEXORA (hard-won, don't relearn)

1. Railway: cgroup-aware CPU detection (os.cpu_count() sees the HOST);
   IPv6-only private mesh (`listen='*'`, `http://name.railway.internal:PORT`,
   no port mapping); healthcheck path must be a readiness endpoint.
2. Model memory: do the RAM arithmetic BEFORE deploying (params × bytes +
   runtime); quantize; SIGKILL cannot be caught by in-process fallbacks.
3. Bake models into the Docker image at build time (no cold-start downloads);
   two-stage builds keep the runtime image small.
4. Loud errors over silent defaults — a dropped field must fail visibly.
5. Worker deploys are manual re-pastes — a stale worker silently dropping new
   fields cost a full debugging session. Update workers FIRST when contracts
   change.
6. Cowork sandbox: bash mount serves stale copies of edited files — Read/Grep
   are truth; never `cat >>` into project files; verify via /tmp `node --check`.

---

## 7. FIRST MESSAGE TO PASTE INTO THE NEW PROJECT'S CHAT

> Build **Lexora Voice** — read `LEXORA-VOICE-HANDOVER.md` in this folder first;
> it has the product, rules, engines, architecture, pricing and phases. Start
> with **P0**: scaffold `site/`, `worker-voice.js`, `voice-server/` (FastAPI +
> Piper stock voice, Dockerfile, /healthz, cgroup-aware threading, IPv6 bind)
> and `voice-schema.sql`, wired to the SAME Supabase project as Lexora AI.
> Own engines only (MIT-licensed models — verify model licenses, XTTS/F5 are
> banned), own-voice-only cloning with spoken consent, black/white/orange
> design. Ship P0 end-to-end before touching P1.

---

*Integration note for the Lexora side: when P3 arrives, the Lexora HANDOVER.md
gets a Step-6 entry; until then Lexora needs zero changes.*
