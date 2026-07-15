# Lexora AI — Conversion Server

The premium (★) engine behind Phase 4. It does the actual document conversions that
can't happen in the browser (HD Office↔PDF, Ghostscript compression, page trimming).
It is **not** on Cloudflare — it needs LibreOffice, so it runs as a normal container.

The gateway worker (`worker-convert.js`, deployed at
`readaloud-convert.konarajeshkumar011.workers.dev`) is the only thing that talks to it.
The gateway handles login, consent, the free 50-page/day cap, and ₹ wallet charging;
this server just converts.

## Contract
- `POST /convert` — `multipart/form-data`: `file`, `tool`, `maxPages`, and optional
  `opts` (JSON string with tool extras — `{"url":"https://…"}` for `html2pdf`,
  `{"lang":"hi"}` for `translate`).
  Header `Authorization: Bearer <CONVERT_SERVER_KEY>` (must equal the gateway's env).
  Returns the converted bytes + `Content-Type` (+ `X-Filename`), or a non-2xx error
  (the gateway then refunds the wallet).
- `GET /` — health check; returns the supported tool ids.

## Supported tools
- LibreOffice: `word2pdf_hd`, `ppt2pdf`, `excel2pdf`
- Chromium (real browser render): `html2pdf` — prints `opts.url` (or an uploaded
  .html file) to PDF exactly as a browser shows it
- pdf2docx (layout parsing): `pdf2word_hd`
- ocrmypdf/Tesseract: `ocr_hd`
- Ghostscript: `pdfa`, `compress_hd` / `compress_max` / `compress_web` / `compress_light`
- camelot (`pdf2excel.py`): `pdf2excel` — best on ruled/visible tables; lattice pass
  first, stream fallback; each table → its own .xlsx sheet
- Our translation service (`../translate-server/` — Meta NLLB-200, MarianMT fallback,
  see Env): `translate` — pdftotext → chunked translate (source auto-detected) →
  clean PDF (layout-preserving comes later)

`maxPages` trims a PDF to its first N pages (qpdf) before converting — this is how the
anonymous "first 50 pages free" partial conversion works.

Add more by extending the `HANDLERS` map in `server.js` (keep the ids matching the
KIT `ptool` ids the gateway sends). ALL engines are our own / open-source — never a
paid conversion API (KRK's firm rule).

## Env
- `CONVERT_SERVER_KEY` — **required**, the shared secret. Set the SAME value here and on
  the gateway worker.
- `PORT` — the host sets this automatically.
- `CHROME_BIN` — Chromium binary (the Dockerfile sets `chromium`).
- `TRANSLATE_SERVER_URL` — required only for `translate`: the base URL of OUR
  translation service (`online/translate-server/` — Meta NLLB-200 default, MarianMT
  auto-fallback on small hosts; deploy it as a second Docker service on Railway, see
  its README). No key needed — it's private. Until this is set, `translate` returns a
  clear "translation engine not connected" error.

## Deploy (pick one)

### Railway
1. New Project → Deploy from Repo (or "Empty" → drag this folder).
2. Railway auto-detects the `Dockerfile` and builds it.
3. Variables → add `CONVERT_SERVER_KEY` (same secret as the gateway).
4. Networking → Generate Domain. Copy the URL, e.g. `https://xxx.up.railway.app`.

### Render
1. New → Web Service → point at this folder/repo.
2. Runtime: **Docker**. It uses the `Dockerfile`.
3. Environment → `CONVERT_SERVER_KEY`.
4. Copy the service URL Render gives you.

### Fly.io
1. `fly launch` in this folder (it detects the Dockerfile), don't deploy yet.
2. `fly secrets set CONVERT_SERVER_KEY=...`
3. `fly deploy`. Copy the `*.fly.dev` URL.

## After it's live
1. Copy the server's URL.
2. On the **gateway worker** (Cloudflare) set `CONVERT_SERVER_URL` = that URL
   (no trailing slash) and confirm `CONVERT_SERVER_KEY` matches.
3. The gateway now forwards real jobs. Build the Step-2 premium UI to call the gateway.

## Test locally (needs LibreOffice/Ghostscript/qpdf installed, or use Docker)
```
docker build -t lexora-convert .
docker run -e CONVERT_SERVER_KEY=test -p 8080:8080 lexora-convert
# then:
curl -F file=@sample.docx -F tool=word2pdf_hd -F maxPages=0 \
     -H "Authorization: Bearer test" http://localhost:8080/convert -o out.pdf
```
