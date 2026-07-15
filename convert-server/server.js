'use strict';
/* ============================================================
   Lexora AI — conversion server (Phase 4)
   A STANDALONE service (NOT Cloudflare — it needs LibreOffice). Deploy to
   Railway / Render / Fly.io / any Docker host. The gateway worker
   (worker-convert.js) forwards premium jobs here.

   Contract (called by the gateway):
     POST /convert  multipart/form-data: file, tool, maxPages
       Authorization: Bearer <CONVERT_SERVER_KEY>   (must match the gateway env)
     -> returns the converted file bytes + Content-Type (+ X-Filename), or non-2xx
        (the gateway then refunds the user's wallet).
     GET / -> health check + the list of supported tool ids.

   Env: CONVERT_SERVER_KEY (required), PORT (host sets it).
   ============================================================ */
const express = require('express');
const multer = require('multer');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const app = express();
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 120 * 1024 * 1024 } });
const KEY = process.env.CONVERT_SERVER_KEY || '';
const PORT = process.env.PORT || 8080;

function run(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 180000, maxBuffer: 1 << 26, ...opts }, (err, stdout, stderr) => {
      if (err) reject(new Error(((stderr && stderr.toString()) || err.message || '').slice(0, 800)));
      else resolve((stdout || '').toString());
    });
  });
}

// LibreOffice headless convert. `target` is e.g. 'pdf' or 'docx:MS Word 2007 XML'.
async function soffice(inPath, outDir, target) {
  await run('soffice', ['--headless', '--norestore', '--convert-to', target, '--outdir', outDir, inPath],
    { env: { ...process.env, HOME: outDir } });
  const ext = target.split(':')[0];
  return path.join(outDir, path.basename(inPath, path.extname(inPath)) + '.' + ext);
}
// Ghostscript compress. `preset` = /ebook (balanced) | /screen (max shrink) | /printer (light).
async function ghostscript(inPath, outDir, preset) {
  const out = path.join(outDir, 'out.pdf');
  await run('gs', ['-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.5', '-dPDFSETTINGS=' + preset,
    '-dNOPAUSE', '-dQUIET', '-dBATCH', '-dDetectDuplicateImages=true', '-sOutputFile=' + out, inPath]);
  return out;
}
// PDF -> Word via the pdf2docx Python engine (real layout parsing; LibreOffice can't do this).
async function pdf2docx(inPath, outDir) {
  const out = path.join(outDir, 'out.docx');
  await run('python3', ['-c',
    'from pdf2docx import Converter; cv=Converter(' + JSON.stringify(inPath) + '); cv.convert(' + JSON.stringify(out) + '); cv.close()'
  ], { timeout: 240000 });
  return out;
}
// OCR a scanned PDF into a searchable/selectable PDF (ocrmypdf → Tesseract). --skip-text
// leaves pages that already have text alone, so it won't error on mixed documents.
async function ocrmypdf(inPath, outDir) {
  const out = path.join(outDir, 'out.pdf');
  await run('ocrmypdf', ['--skip-text', inPath, out], { timeout: 240000 });
  return out;
}
// PDF -> PDF/A archival format via Ghostscript (our own, no third-party API).
async function pdfaGs(inPath, outDir) {
  const out = path.join(outDir, 'out.pdf');
  await run('gs', ['-dPDFA=2', '-dBATCH', '-dNOPAUSE', '-sColorConversionStrategy=RGB',
    '-sDEVICE=pdfwrite', '-dPDFACompatibilityPolicy=1', '-sOutputFile=' + out, inPath]);
  return out;
}
// PDF -> Excel via camelot (our own engine — best on ruled/visible tables).
async function pdf2excel(inPath, outDir) {
  const out = path.join(outDir, 'tables.xlsx');
  await run('python3', [path.join(__dirname, 'pdf2excel.py'), inPath, out], { timeout: 240000 });
  return out;
}
// HTML -> PDF via headless Chromium (a REAL browser render — unlike LibreOffice).
// opts.url = print a live webpage; otherwise the uploaded .html file is printed.
const CHROME = process.env.CHROME_BIN || 'chromium';
async function chromiumPdf(inPath, outDir, opts) {
  const out = path.join(outDir, 'webpage.pdf');
  const target = (opts && typeof opts.url === 'string' && /^https?:\/\//i.test(opts.url))
    ? opts.url : 'file://' + inPath;
  await run(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--hide-scrollbars', '--virtual-time-budget=15000', '--run-all-compositor-stages-before-draw',
    '--print-to-pdf=' + out, target], { timeout: 120000, env: { ...process.env, HOME: outDir } });
  return out;
}
// Translate a PDF's text via OUR self-hosted translation service (translate-server/:
// Meta NLLB-200, MarianMT fallback — no paid API). Source language is auto-detected;
// target accepts ISO 639-1 or FLORES-200 codes (all NLLB languages).
// MVP: extracted text -> translated text -> clean PDF (layout-preserving = later).
async function translatePdf(inPath, outDir, opts) {
  const ts = (process.env.TRANSLATE_SERVER_URL || '').replace(/\/$/, '');
  if (!ts) throw new Error('translation engine not connected (set TRANSLATE_SERVER_URL)');
  const lang = (opts && /^[a-z]{2,3}([_-][A-Za-z]{2,4})?$/.test(opts.lang || '')) ? opts.lang : 'en';
  const txtPath = path.join(outDir, 'in.txt');
  await run('pdftotext', ['-layout', inPath, txtPath]);
  const text = fs.readFileSync(txtPath, 'utf8');
  if (!text.trim()) throw new Error('no extractable text in this PDF - run OCR on it first');
  // translate in ~4000-char chunks, split on blank lines so sentences stay whole
  // (the translation service re-segments per sentence internally)
  const chunks = [];
  let cur = '';
  for (const para of text.split(/\n{2,}/)) {
    if ((cur + '\n\n' + para).length > 4000) { if (cur) chunks.push(cur); cur = para; }
    else cur = cur ? cur + '\n\n' + para : para;
  }
  if (cur) chunks.push(cur);
  let outText = '';
  for (const ch of chunks) {
    const r = await fetch(ts + '/translate', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q: ch, source: 'auto', target: lang })
    });
    if (!r.ok) throw new Error('translation failed (' + r.status + '): ' + (await r.text().catch(() => '')).slice(0, 200));
    const j = await r.json();
    outText += (j.translatedText || '') + '\n\n';
  }
  if (!outText.trim()) throw new Error('the translation came back empty');
  const outTxt = path.join(outDir, 'translated.txt');
  fs.writeFileSync(outTxt, outText);
  const pdf = await soffice(outTxt, outDir, 'pdf');
  const named = path.join(outDir, 'translated.pdf');
  fs.renameSync(pdf, named);
  return named;
}

/* tool id (must match the KIT `ptool` ids the gateway sends) -> handler(inputPath, workDir) => outputPath.
   ALL our own engines (open-source, no third-party conversion API). Long-term goal: the
   proprietary "Lexora Layout Engine" for true iLovePDF-beating PDF->Office fidelity. */
const HANDLERS = {
  word2pdf_hd:  (i, o) => soffice(i, o, 'pdf'),
  ppt2pdf:      (i, o) => soffice(i, o, 'pdf'),
  excel2pdf:    (i, o) => soffice(i, o, 'pdf'),
  html2pdf:     (i, o, x) => chromiumPdf(i, o, x),   // real Chromium render (URL or .html file)
  pdf2word_hd:  (i, o) => pdf2docx(i, o),   // pdf2docx — our layout-parsing engine
  ocr_hd:       (i, o) => ocrmypdf(i, o),   // searchable-PDF OCR (Tesseract)
  pdfa:         (i, o) => pdfaGs(i, o),
  pdf2excel:    (i, o) => pdf2excel(i, o),  // camelot — ruled tables work best
  translate:    (i, o, x) => translatePdf(i, o, x),  // our translate-server (NLLB-200)
  compress_hd:  (i, o) => ghostscript(i, o, '/ebook'),
  compress_max: (i, o) => ghostscript(i, o, '/screen'),
  compress_web: (i, o) => ghostscript(i, o, '/screen'),
  compress_light: (i, o) => ghostscript(i, o, '/printer')
};
const CT = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain'
};

async function npages(pdf) {
  try { return parseInt((await run('qpdf', ['--show-npages', pdf])).trim()) || 0; } catch (e) { return 0; }
}
async function trimPdf(inPath, workDir, maxPages) {
  if (!maxPages) return inPath;
  const total = await npages(inPath);
  if (!total || maxPages >= total) return inPath;
  const out = path.join(workDir, 'trimmed.pdf');
  await run('qpdf', ['--empty', '--pages', inPath, '1-' + maxPages, '--', out]);
  return out;
}
function rmrf(p) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) {} }

app.get('/', (req, res) => res.json({ ok: true, service: 'lexora-convert', tools: Object.keys(HANDLERS) }));

app.post('/convert', upload.single('file'), async (req, res) => {
  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  if (!KEY || auth !== KEY) return res.status(401).json({ error: 'unauthorized' });

  const tool = String((req.body && req.body.tool) || '');
  const maxPages = parseInt((req.body && req.body.maxPages) || '0') || 0;
  let opts = {};
  try { opts = JSON.parse(String((req.body && req.body.opts) || '{}').slice(0, 2000)) || {}; } catch (e) {}
  const handler = HANDLERS[tool];
  if (!req.file) return res.status(400).json({ error: 'no file' });
  if (!handler) { rmrf(req.file.path); return res.status(501).json({ error: 'tool not supported: ' + tool }); }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-'));
  try {
    // give the input a real extension so LibreOffice sniffs the format correctly
    const ext = (path.extname(req.file.originalname || '') || '.bin').toLowerCase();
    let input = path.join(workDir, 'input' + ext);
    fs.copyFileSync(req.file.path, input);
    if (ext === '.pdf' && maxPages) input = await trimPdf(input, workDir, maxPages);

    const outPath = await handler(input, workDir, opts);
    if (!outPath || !fs.existsSync(outPath)) throw new Error('conversion produced no output');

    const oext = path.extname(outPath).slice(1).toLowerCase();
    res.setHeader('content-type', CT[oext] || 'application/octet-stream');
    res.setHeader('x-filename', path.basename(outPath));
    const stream = fs.createReadStream(outPath);
    stream.pipe(res);
    const done = () => { rmrf(workDir); rmrf(req.file.path); };
    stream.on('close', done);
    stream.on('error', done);
  } catch (e) {
    rmrf(workDir); rmrf(req.file.path);
    res.status(500).json({ error: String((e && e.message) || e).slice(0, 500) });
  }
});

app.listen(PORT, () => console.log('lexora-convert listening on ' + PORT));
