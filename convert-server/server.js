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

/* tool id (must match the KIT `ptool` ids the gateway sends) -> handler(inputPath, workDir) => outputPath.
   Swap pdf2word_hd for a commercial engine later for true HD fidelity. */
const HANDLERS = {
  word2pdf_hd:  (i, o) => soffice(i, o, 'pdf'),
  ppt2pdf:      (i, o) => soffice(i, o, 'pdf'),
  excel2pdf:    (i, o) => soffice(i, o, 'pdf'),
  html2pdf:     (i, o) => soffice(i, o, 'pdf'),
  pdf2word_hd:  (i, o) => soffice(i, o, 'docx:MS Word 2007 XML'), // best-effort via LibreOffice; upgrade later
  compress_hd:  (i, o) => ghostscript(i, o, '/ebook'),
  compress_max: (i, o) => ghostscript(i, o, '/screen'),
  compress_web: (i, o) => ghostscript(i, o, '/screen'),
  compress_light: (i, o) => ghostscript(i, o, '/printer')
};
const CT = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
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

    const outPath = await handler(input, workDir);
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
