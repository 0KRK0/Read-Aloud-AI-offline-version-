# Lexora AI — Translation Service v2 (CTranslate2)

Our OWN self-hosted translation engine (no paid API, KRK's firm rule).
A separate Docker container the conversion server calls for ★ Translate PDF.

Architecture (unchanged): **Browser → Cloudflare gateway worker → convert-server →
THIS service**. Premium flow (consent, 50 free pages/day, ₹0.10/page) lives upstream.

## v2 — why the rewrite (the OOM post-mortem)
v1 ran NLLB-600M in fp32 through transformers+torch: ~3.5 GB peak. On Railway's
2 GB container the kernel OOM-killed the process right after "engine ready"
(mmap'd weights page in on first inference) → infinite restart loop. An
in-process fallback can't catch a SIGKILL, so the Marian tier never fired.

v2 runs **NLLB-200 int8 on CTranslate2** — the industry-standard CPU inference
engine for MT (LibreTranslate itself uses it):
- ~650 MB model RAM, whole process <1 GB → **fits the 2 GB Railway plan**
- 4–8× faster per sentence than fp32 torch
- NO PyTorch in the runtime image (torch only exists in the Docker build stage)
- model converted + baked at build time → boots in seconds, no downloads
- `MAX_CONCURRENCY` semaphore stops parallel requests multiplying memory
- **MarianMT tier removed** — it existed for "NLLB might not fit"; int8 NLLB
  now fits anywhere Marian would have. Chain: NLLB-CT2 → LibreTranslate proxy
  (only if `LIBRETRANSLATE_FALLBACK_URL` is set) → clear error.

## Contract (unchanged — convert-server needs no changes)
- `POST /translate` `{q, source:'auto', target}` → `{translatedText, engine, detectedSource}`
  (`target` = ISO 639-1 like `hi`, or any FLORES-200 code like `hin_Deva`)
- `GET /` — liveness + engine info (always 200)
- `GET /healthz` — **readiness**: 503 while loading, 200 when ready

## Env
- `PORT` (host sets it) · `MODEL_DIR` (`/model`, baked) · `MAX_SEGMENT_CHARS` (900)
- `MAX_CONCURRENCY` (2) · `INTRA_THREADS` (defaults to CPU count — leave alone)
- `LIBRETRANSLATE_FALLBACK_URL` — optional last resort

## Deploy on Railway
1. Redeploy this folder — the build converts the model (needs a few minutes and
   ~4 GB build memory; Railway build machines have plenty; runtime does not need it).
2. Service settings → **Healthcheck path: `/healthz`**.
3. 2 GB RAM plan is fine now. No volume needed (model is in the image).
4. `TRANSLATE_SERVER_URL` on convert-server stays exactly the same.

## Test
```
curl -X POST http://localhost:5000/translate \
  -H 'content-type: application/json' \
  -d '{"q":"Hello, how are you?","source":"auto","target":"hi"}'
```

## Scaling roadmap (when traffic grows)
1. Async job queue for document translations (kills the sync-HTTP timeout ceiling).
2. Horizontal CPU workers behind the queue; Hetzner-class VPS or Cloud Run
   (min-instances=1) beat Railway on price/perf for always-on inference.
3. `--build-arg NLLB_MODEL=facebook/nllb-200-distilled-1.3B` (int8 ≈ 1.4 GB) for
   higher quality once hosts have 4 GB. GPU only if unit economics demand it.
