# Lexora AI — Translation Service

Our OWN self-hosted translation engine (no paid API, KRK's firm rule).
A separate Docker container the conversion server calls for the ★ Translate PDF tool.

Architecture (unchanged): **Browser → Cloudflare gateway worker → convert-server →
THIS service**. The premium flow (consent, 50 free pages/day, ₹0.10/page) all lives
upstream — this service only translates text.

## Engine priority (automatic)
1. **Meta NLLB-200** (default) — `facebook/nllb-200-distilled-600M`, all 200 NLLB
   languages, best quality for Indian languages. Override with `NLLB_MODEL`
   (e.g. `facebook/nllb-200-distilled-1.3B` on a bigger host).
2. **MarianMT** — if NLLB can't load (RAM/hardware), Helsinki-NLP opus-mt models are
   used per language pair (lazy-downloaded, ~300 MB/pair, English pivot when no
   direct pair exists).
3. **LibreTranslate** — ONLY if neither model engine is available AND
   `LIBRETRANSLATE_FALLBACK_URL` points at one. Not deployed by default.

Source language is **auto-detected** (langdetect); `target` accepts ISO 639-1 codes
(`hi`, `ta`, …) or raw FLORES-200 codes (`hin_Deva`, …) — so every NLLB language is
reachable.

## Contract
- `POST /translate` `{q, source:'auto', target}` → `{translatedText, engine, detectedSource}`
- `GET /` → `{ok, engine, model}` (health; `ok:false` while the model warms up)

## Env
- `PORT` — the host sets it (default 5000)
- `NLLB_MODEL` — default `facebook/nllb-200-distilled-600M`
- `FORCE_ENGINE` — empty (auto) | `nllb` | `marian` | `libretranslate` (for testing)
- `LIBRETRANSLATE_FALLBACK_URL` — optional last-resort proxy
- `MAX_SEGMENT_CHARS` — default 900 (sentence-packed segments per model call)
- `HF_HOME` — model cache (`/models`; pre-baked into the image by default — only mount
  a volume here when building with `PREBAKE=0`)

## Model pre-baking (no cold-start download)
The Dockerfile **downloads the NLLB model at BUILD time** and bakes it into the image
(default `PREBAKE=1`). Boots are instant, and redeploys reuse the cached Docker layer —
the ~1.2 GB download happens once per image build, not per deploy/restart.
- Bigger model: build with `--build-arg NLLB_MODEL=facebook/nllb-200-distilled-1.3B`
  (also set the `NLLB_MODEL` env if you override it at runtime).
- Prefer a small image instead? Build with `--build-arg PREBAKE=0` and attach a
  persistent volume at `/models` — first boot downloads into the volume, later boots
  reuse it. **Never mount a volume at `/models` on a pre-baked image** — the volume
  shadows the baked files and forces a re-download.

## Deploy on Railway (separate service, same project)
1. New → Service → deploy this folder (`online/translate-server/`, Dockerfile detected).
   The build itself downloads the model (build takes a few extra minutes; boots don't).
2. **Resources: give it ~4 GB RAM** for NLLB-600M on CPU. On a smaller box it will
   log "NLLB unavailable" and serve MarianMT automatically — same API, no other change.
3. Networking → prefer the private/internal URL (only convert-server calls it),
   else generate a domain.
4. On the **convert-server** service set `TRANSLATE_SERVER_URL=` that URL
   (`https://…`, no trailing slash) and restart it.
5. `GET /` shows `ok:true, engine:"nllb"` — with the baked model that's within seconds
   of boot (model load from disk, no download).

## Test
```
curl -X POST http://localhost:5000/translate \
  -H 'content-type: application/json' \
  -d '{"q":"Hello, how are you?","source":"auto","target":"hi"}'
```
