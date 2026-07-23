/* ---------------- Open PDF ---------------- */
$('dropZone').addEventListener('click', ()=> $('fileInput').click());
$('openBtn').addEventListener('click', ()=> $('fileInput').click());
$('fileInput').addEventListener('change', e=>{
  const files = [...e.target.files];
  if(!files.length) return;
  const allImages = files.length > 1 && files.every(f=>/^image\//.test(f.type) || /\.(png|jpe?g|webp|bmp)$/i.test(f.name));
  if(allImages) openImagePages(`${files.length} photos`, files);   /* several photos = one multi-page document */
  else openFile(files[0]);
  e.target.value = '';
});
['dragover','dragleave','drop'].forEach(ev=>{
  $('dropZone').addEventListener(ev, e=>{
    e.preventDefault();
    $('dropZone').classList.toggle('drag', ev==='dragover');
    if(ev==='drop' && e.dataTransfer.files[0]) openFile(e.dataTransfer.files[0]);
  });
});

/* ---------- File dispatcher: PDF, DOCX, TXT/MD, images ---------- */
function openFile(file){
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if(ext === 'pdf' || file.type === 'application/pdf') return openPdf(file);
  if(ext === 'docx') return openDocx(file);
  if(ext === 'txt' || ext === 'md') return openTxt(file);
  if(['png','jpg','jpeg','webp','bmp'].includes(ext)) return openImage(file);
  say(`I cannot read .${ext} files yet. I understand PDF, Word (DOCX), text files, and images of pages.`);
}

/* ---------- AI Workspace handoff: a tool result sent from tools.html ----------
   tools-page.js stores the finished output in IndexedDB ('lxhand'); if a fresh
   one (<10 min) exists when the reader loads, open it automatically. The record
   is deleted on pickup so it never re-opens by surprise. */
window.addEventListener('load', ()=>{
  try{
    const r = indexedDB.open('lxhand', 1);
    r.onupgradeneeded = ()=> r.result.createObjectStore('f');
    r.onsuccess = ()=>{
      try{
        const tx = r.result.transaction('f', 'readwrite');
        const q = tx.objectStore('f').get('doc');
        q.onsuccess = ()=>{
          const v = q.result;
          if(!v) return;
          tx.objectStore('f').delete('doc');
          if(v.blob && Date.now() - (v.t || 0) < 10 * 60 * 1000){
            setTimeout(()=>{
              say(`Opening "${v.name}" from the tools…`, 'sys');
              openFile(new File([v.blob], v.name || 'document.pdf', { type: v.blob.type || 'application/pdf' }));
            }, 600);
          }
        };
      }catch(e){}
    };
  }catch(e){}
});

async function openDocx(file){
  say(`Opening "${file.name}" — one moment…`,'sys');
  try{
    const buf = await file.arrayBuffer();
    /* keep the real look: headings, bold, lists, tables, embedded pictures */
    try{
      const rich = await mammoth.convertToHtml({arrayBuffer: buf});
      if(rich.value && rich.value.replace(/<[^>]*>/g,'').trim()){
        openRichText(file.name, rich.value);
        return;
      }
    }catch(e){ console.warn('convertToHtml failed, falling back to plain text', e); }
    const result = await mammoth.extractRawText({arrayBuffer: buf});
    const text = (result.value || '').trim();
    if(!text){ say('This Word file seems to be empty.'); return; }
    openText(file.name, text);
  }catch(e){ say('Sorry, I could not read that Word file ('+e.message+').'); }
}

async function openTxt(file){
  say(`Opening "${file.name}" — one moment…`,'sys');
  try{
    const text = (await file.text()).trim();
    if(!text){ say('This file seems to be empty.'); return; }
    openText(file.name, text);
  }catch(e){ say('Sorry, I could not read that file ('+e.message+').'); }
}

function openImage(file){ return openImagePages(file.name, [file]); }

/* One or many photos of pages (upload or camera scan) — shown as real pages,
   OCR page by page, reading starts after page 1 like a scanned PDF. */
async function openImagePages(name, sources, isAppend, doOcr){
  if(doOcr === undefined) doOcr = true;   /* OCR on by default (scan "Recognize text" toggle) */
  if(location.protocol === 'file:'){ say('Reading photos needs the app to run from the launcher or website.'); return; }
  docLabel = friendlyName(name, /^camera scan/i.test(name) ? 'scan' : 'photo');
  say(isAppend
    ? '📸 Got the new page! Adding it…'
    : `Hey! ${docLabel === 'your scan' ? 'Your scan is in' : 'Your upload is done'} 🎉 — give me a moment to recognise the text, then we can read together. The buttons will wake up as soon as I'm ready.`,'sys');
  try{
    /* load all pictures first (they may be Files or captured data URLs) */
    const imgs = [];
    for(const s of sources){
      const img = new Image();
      const isFile = (typeof File !== 'undefined') && (s instanceof File);
      img.src = isFile ? URL.createObjectURL(s) : (s.data || s);
      await new Promise((res, rej)=>{ img.onload = res; img.onerror = ()=>rej(new Error('could not load an image')); });
      imgs.push(img);
    }
    docName = name;
    numPages = imgs.length;
    lines = []; sentences = []; lineToSent = []; current = -1; chatHistory = []; pages = [];
    stopSpeech(); hideMarker();
    const viewer = $('viewer');
    viewer.innerHTML = '';
    viewer.appendChild(markerEl);
    $('dropZone').style.display = 'none';
    viewer.style.display = 'block';
    $('playbar').style.display = 'flex';
    $('pdfBtn').style.display = 'none'; $('wordBtn').style.display = 'none'; $('addPageBtn').style.display = 'none';

    imgs.forEach((img, ix)=> pages.push({num:ix+1, w:img.naturalWidth, h:img.naturalHeight, rendered:true, isImage:true, spans:[], img, lineStart:0, lineEnd:0}));
    computeFitScale();
    pages.forEach(pg=>{
      const wrap = document.createElement('div');
      wrap.className = 'pageWrap';
      wrap.dataset.page = pg.num;
      wrap.style.width  = (pg.w * fitScale) + 'px';
      wrap.style.height = (pg.h * fitScale) + 'px';
      pg.img.className = 'imgPage';
      wrap.appendChild(pg.img);
      const num = document.createElement('div');
      num.className = 'pageNum'; num.textContent = pg.num;
      wrap.appendChild(num);
      viewer.appendChild(wrap);
      pg.wrap = wrap;
      wrap.addEventListener('click', e=> tapImagePage(pg, e));
    });
    buildPageOptions();
    updateProgress();
    $('pdfBtn').style.display = 'inline-block';       /* photo documents can be saved as PDF */
    $('wordBtn').style.display = 'inline-block';      /* …or as a Word file of the recognised text */
    $('addPageBtn').style.display = 'inline-block';   /* …and extended with more camera pages */
    scanSession = sources;                            /* remember, so ➕ Page can append */
    if(!isAppend) setDocBusy(true);                   /* lock controls until page 1 is readable */

    /* OCR toggled off in the scan workspace — show the pages, skip recognition. */
    if(!doOcr){
      removeProgress(); setDocBusy(false); afterDocOpen();
      say('Showing your scanned pages. Text recognition (OCR) was off, so I can’t read these aloud — you can still save them as a PDF with ⬇, or reopen with OCR on to listen.','sys');
      return;
    }

    /* OCR page by page — greet/start after page 1, keep converting behind.
       Pages already recognised in this scan session are cached on the source. */
    sayProgress('🔍 Recognising text…');
    let worker = null;
    ocrBusy = true;
    let greeted = !!isAppend;   /* appending: don't greet again or restart reading */
    for(let ix = 0; ix < pages.length; ix++){
      const pg = pages[ix], src = sources[ix];
      if(pages.length > 1) sayProgress(`🔍 Recognising page ${pg.num} of ${pages.length}…`);
      try{
        pg.lineStart = lines.length;
        if(src && src.__ocrLines){
          /* cached from a previous pass — reuse instantly */
          src.__ocrLines.forEach(l=> lines.push({ text:l.text, page:pg.num, x:l.x, xEnd:l.xEnd, y:l.y, h:l.h, items:[] }));
        }else{
          if(!worker) worker = await Tesseract.createWorker('eng', 1, {
            workerPath: new URL('lib/ocr/worker.min.js', location.href).href,
            corePath:   new URL('lib/ocr', location.href).href,
            langPath:   new URL('lib/lang', location.href).href
          });
          const res = await worker.recognize(pg.img, {}, {blocks:true, text:true});
          const data = res.data || {};
          const pushLine = (text, bbox)=>{
            const t = (text||'').replace(/\s+/g,' ').trim();
            if(t.length < 2 || !bbox) return;
            lines.push({ text: t, page: pg.num, x: bbox.x0, xEnd: bbox.x1, y: pg.h - bbox.y1, h: bbox.y1 - bbox.y0, items: [] });
          };
          if(Array.isArray(data.blocks) && data.blocks.length){
            data.blocks.forEach(b=> (b.paragraphs||[]).forEach(par=> (par.lines||[]).forEach(l=> pushLine(l.text, l.bbox))));
          }else if(data.text){
            (data.text||'').split('\n').forEach(t=> pushLine(t, {x0:10, x1:pg.w-10, y0:0, y1:24}));
          }
          if(src) src.__ocrLines = lines.slice(pg.lineStart).map(l=>({text:l.text, x:l.x, xEnd:l.xEnd, y:l.y, h:l.h}));
        }
        pg.lineEnd = lines.length;
        buildSentencesChunk(pg.lineStart, pg.lineEnd);
      }catch(e){ say(`Page ${pg.num}: could not read it (${e.message}). Skipping.`,'sys'); }
      updateProgress();
      if(!greeted && sentences.length){ greeted = true; removeProgress(); setDocBusy(false); afterDocOpen(); }
      else if(waitingForMore && sentences.length > current+1){
        waitingForMore = false;
        playing = true; setPlayBtn(); speakLine(current+1);
      }
    }
    ocrBusy = false;
    if(worker){ try{ await worker.terminate(); }catch(e){} }
    removeProgress();
    setDocBusy(false);
    if(!lines.length) say('I could not find readable text in the pictures — but you can still look at them here, and save them as a PDF with ⬇.');
    else if(isAppend){
      say(`✅ Page ${pages.length} added — say "read page ${pages.length}" or tap it to hear it.`,'sys');
      const pg = pages[pages.length-1];
      if(pg && pg.wrap) pg.wrap.scrollIntoView({behavior:'smooth', block:'start'});
    }
    else if(pages.length > 1) say(`All ${pages.length} pages are ready. 📄 Tip: the ⬇ PDF button saves this scan as a real PDF file.`,'sys');
    if(waitingForMore){ waitingForMore = false; finishDoc(); }
  }catch(e){ removeProgress(); say('Sorry, I could not open those pictures ('+e.message+').'); }
}
function tapImagePage(pg, e){
  if(docBusy) return;
  const r = pg.wrap.getBoundingClientRect();
  const px = (e.clientX - r.left) / fitScale;
  const py = pg.h - (e.clientY - r.top) / fitScale;
  let bestLi = -1, bestD = 1e12;
  for(let li = pg.lineStart; li < pg.lineEnd; li++){
    const ln = lines[li];
    const inY = py >= ln.y - ln.h*0.3 && py <= ln.y + ln.h*1.3;
    const d = Math.abs((ln.y + ln.h/2) - py) + (px < ln.x || px > ln.xEnd ? 1e6 : 0);
    if(inY && d < bestD){ bestD = d; bestLi = li; }
  }
  if(bestLi >= 0){ const si = lineToSent[bestLi]; if(si !== undefined){ jumpTo(si); if(!playing) togglePlay(); } }
}

/* ================= Scan engine: paper detection · perspective fix · filters =================
   All in plain canvas math — no heavy CV library, works offline, fast. */


/* Find the paper: the page is normally the big bright region. Otsu-threshold a
   thumbnail, take the largest bright blob, and read its 4 extreme corners. */

/* True perspective correction: homography from the unit square to the corner quad,
   inverse-mapped with bilinear sampling → tilted pages come out flat and straight. */

/* Filters: Enhance = auto-levels (whiter paper, darker ink) · B&W = adaptive threshold scan look */

/* ============================================================
   In-Reader "Scan a paper" — immersive Capture → Adobe-Scan-style
   Review & Edit workspace → OCR → reader handoff.
   Frontend rebuilt to the approved redesign; ALL engine/OCR/handoff
   backend preserved. Engine globals (scan-engine.js): detectQuad,
   warpPerspective, applyScanFilter, rotate90. Handoff: openImagePages.
   Distinct from the full Scan Tool (scan.html).
   ============================================================ */
let camStream = null;
let scanPages = [];        /* [{ src:canvas(raw), corners:[4], filter:'enhance' }] */
let scanSel = 0;
let scanSession = null;    /* sources of an already-open scanned doc (playbar +Page) */
let scanAppend = false;    /* the next handoff should APPEND to scanSession */
let scanCrop = null;       /* { corners, pscale } while cropping the selected page */
const isMobileDevice = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
const camDetC = document.createElement('canvas');

/* page → processed canvas (perspective-corrected + filtered), and → shot for handoff/pdf */
function scanRender(pg, maxOut){
  let out;
  try{ out = warpPerspective(pg.src, pg.corners, maxOut || 2200); applyScanFilter(out, pg.filter); }
  catch(e){ out = pg.src; }
  return out;
}
function scanShot(pg){ const c = scanRender(pg, 2200); return { data: c.toDataURL('image/jpeg', .9), w: c.width, h: c.height }; }

function showScanStep(which){
  $('capStep').hidden = which !== 'cap';
  $('revStep').hidden = which !== 'rev';
}

/* ---------------- STEP 1 · Capture ---------------- */
$('scanBtn').addEventListener('click', ()=>{ scanAppend = false; scanPages = []; scanSel = 0; openCamera(); });
$('addPageBtn').addEventListener('click', ()=>{ if(!scanSession) return; scanAppend = true; scanPages = []; scanSel = 0; openCamera(); });

$('camInput').addEventListener('change', async e=>{
  const files = [...e.target.files]; e.target.value = '';
  if(!files.length) return;
  for(const f of files){
    try{ const c = await fileToCanvas(f, 2600); scanPages.push({ src:c, corners:detectQuad(c), filter:'enhance' }); }
    catch(err){ console.warn('scan import', err); }
  }
  if(scanPages.length){ scanSel = 0; enterWorkspace(); }
  else closeCamera();
});

async function openCamera(){
  showScanStep('cap');
  $('camModal').style.display = 'flex';
  updateCapUI();
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ $('camInput').click(); return; }
  try{
    camStream = await navigator.mediaDevices.getUserMedia({
      video:{ facingMode:'environment', width:{ideal:2560}, height:{ideal:1440} }, audio:false
    });
  }catch(e){ $('camInput').click(); return; }   /* no camera / denied → file picker */
  $('camVideo').srcObject = camStream;
  startCamLoop();
}
function stopCamStream(){
  stopCamLoop();
  if(camStream){ camStream.getTracks().forEach(t=>t.stop()); camStream = null; }
  $('camVideo').srcObject = null;
}
function closeCamera(){ stopCamStream(); scanCrop = null; $('camModal').style.display = 'none'; }

function updateCapUI(){
  const n = scanPages.length, em = $('camCount').querySelector('em');
  if(em) em.textContent = n + (n === 1 ? ' page' : ' pages');
  $('camUndo').disabled = !n; $('camDone').disabled = !n;
}

/* live paper detection + Adobe-style auto-capture (engine preserved) */
let camLoopInt = null, camAutoOn = true, camStable = 0, camPrevQuad = null, camCooldown = 0;
function startCamLoop(){ stopCamLoop(); camStable = 0; camPrevQuad = null; camCooldown = Date.now() + 1200; camLoopInt = setInterval(camLoopTick, 140); }
function stopCamLoop(){ clearInterval(camLoopInt); camLoopInt = null; const o = $('camOverlay'); if(o) o.getContext('2d').clearRect(0, 0, o.width, o.height); }
function camLoopTick(){
  const v = $('camVideo');
  if(!camStream || !v.videoWidth || $('capStep').hidden) return;
  const SW = 320, SH = Math.max(24, Math.round(v.videoHeight * SW / v.videoWidth));
  camDetC.width = SW; camDetC.height = SH;
  camDetC.getContext('2d').drawImage(v, 0, 0, SW, SH);
  const q = detectQuad(camDetC);
  const stage = $('camStage'), o = $('camOverlay');
  if(o.width !== stage.clientWidth || o.height !== stage.clientHeight){ o.width = stage.clientWidth; o.height = stage.clientHeight; }
  const ctx = o.getContext('2d');
  ctx.clearRect(0, 0, o.width, o.height);
  const vsc = Math.min(o.width / v.videoWidth, o.height / v.videoHeight);
  const ox = (o.width - v.videoWidth * vsc) / 2, oy = (o.height - v.videoHeight * vsc) / 2;
  const toDisp = p => ({ x: p.x * (v.videoWidth / SW) * vsc + ox, y: p.y * (v.videoWidth / SW) * vsc + oy });
  if(q.found){
    const d = q.map(toDisp);
    ctx.strokeStyle = 'rgba(224,122,63,.95)'; ctx.lineWidth = 3;
    ctx.fillStyle = 'rgba(224,122,63,.14)';
    ctx.beginPath(); ctx.moveTo(d[0].x, d[0].y); d.slice(1).forEach(p => ctx.lineTo(p.x, p.y)); ctx.closePath();
    ctx.fill(); ctx.stroke();
    d.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, 7); ctx.fillStyle = '#e07a3f'; ctx.fill(); });
  }
  if(!camAutoOn || !q.found || Date.now() < camCooldown){ camStable = 0; camPrevQuad = q.found ? q : null; return; }
  if(camPrevQuad && camPrevQuad.found){
    let move = 0;
    for(let i = 0; i < 4; i++) move = Math.max(move, Math.hypot(q[i].x - camPrevQuad[i].x, q[i].y - camPrevQuad[i].y));
    camStable = move < SW * 0.015 ? camStable + 1 : 0;
  }
  camPrevQuad = q;
  if(camStable > 2) $('camShot').style.boxShadow = `0 0 0 ${camStable}px rgba(224,122,63,.4)`;
  else $('camShot').style.boxShadow = '';
  if(camStable >= 9){ camStable = 0; camCooldown = Date.now() + 3000; $('camShot').style.boxShadow = ''; captureFrame(); }
}
function captureFrame(){
  const v = $('camVideo');
  if(!v.videoWidth) return;
  const MAX = 2600, sc = Math.min(1, MAX / Math.max(v.videoWidth, v.videoHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(v.videoWidth * sc); c.height = Math.round(v.videoHeight * sc);
  c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
  const f = $('camFlash'); f.style.opacity = .7; setTimeout(()=> f.style.opacity = 0, 120);
  scanPages.push({ src: c, corners: detectQuad(c), filter: 'enhance' });
  updateCapUI();
}
$('camShot').addEventListener('click', captureFrame);
$('camUndo').addEventListener('click', ()=>{ scanPages.pop(); updateCapUI(); });
$('camAuto').addEventListener('click', ()=>{
  camAutoOn = !camAutoOn;
  $('camAuto').classList.toggle('on', camAutoOn);
  const b = $('capBanner');
  if(b) b.lastChild.textContent = camAutoOn
    ? 'Point at the page — I snap automatically when it is steady'
    : 'Auto-capture off — tap the shutter to snap each page';
});
$('camCancel').addEventListener('click', ()=>{ scanPages = []; scanSel = 0; scanAppend = false; closeCamera(); });
$('camDone').addEventListener('click', ()=>{ if(scanPages.length) enterWorkspace(); });

/* ---------------- STEP 2 · Review & Edit workspace ---------------- */
function enterWorkspace(){
  stopCamStream();                 /* free the camera while editing */
  if(!scanPages.length){ closeCamera(); return; }
  scanSel = Math.max(0, Math.min(scanSel, scanPages.length - 1));
  scanCrop = null;
  showScanStep('rev');
  $('camModal').style.display = 'flex';
  renderWorkspace();
}
function renderWorkspace(){
  const n = scanPages.length;
  $('revCount').textContent = n + (n === 1 ? ' page' : ' pages');
  $('revPanelDesc').textContent = `${n} ${n === 1 ? 'page' : 'pages'}, enhanced and straightened on your device. Hand them to the reader and start listening.`;
  const list = $('thumbList'); list.innerHTML = '';
  scanPages.forEach((pg, i)=>{
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'thumb' + (i === scanSel ? ' on' : '');
    const num = document.createElement('span'); num.className = 'thNum'; num.textContent = i + 1;
    const im = document.createElement('img'); im.alt = 'Page ' + (i + 1);
    try{ im.src = scanRender(pg, 320).toDataURL('image/jpeg', .7); }catch(e){}
    b.appendChild(num); b.appendChild(im);
    b.addEventListener('click', ()=>{ scanSel = i; scanCrop = null; setCropHint(false); renderWorkspace(); });
    list.appendChild(b);
  });
  const pg = scanPages[scanSel];
  document.querySelectorAll('#tbFilters button').forEach(x=> x.classList.toggle('on', pg && x.dataset.f === pg.filter));
  drawScanPreview();
}
function drawScanPreview(){
  const pg = scanPages[scanSel]; if(!pg) return;
  const c = $('revCanvas'), stage = $('revStage');
  const maxW = Math.max(140, (stage.clientWidth || 640) - 40);
  const maxH = Math.max(160, (stage.clientHeight || 640) - 72);
  const chip = $('revEnhChip');
  if(scanCrop){
    const src = pg.src, sc = Math.min(maxW / src.width, maxH / src.height, 1);
    c.width = Math.round(src.width * sc); c.height = Math.round(src.height * sc);
    scanCrop.pscale = sc;
    const ctx = c.getContext('2d');
    ctx.drawImage(src, 0, 0, c.width, c.height);
    const q = scanCrop.corners.map(p=>({ x: p.x * sc, y: p.y * sc }));
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.beginPath(); ctx.rect(0, 0, c.width, c.height);
    ctx.moveTo(q[0].x, q[0].y); ctx.lineTo(q[3].x, q[3].y); ctx.lineTo(q[2].x, q[2].y); ctx.lineTo(q[1].x, q[1].y);
    ctx.closePath(); ctx.fill('evenodd'); ctx.restore();
    ctx.strokeStyle = '#e07a3f'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(q[0].x, q[0].y); q.slice(1).forEach(p=> ctx.lineTo(p.x, p.y)); ctx.closePath(); ctx.stroke();
    q.forEach(p=>{
      ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, 7); ctx.fillStyle = 'rgba(224,122,63,.3)'; ctx.fill();
      ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, 7); ctx.fillStyle = '#e07a3f'; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    });
    c.classList.add('cropping');
    if(chip) chip.style.display = 'none';
  }else{
    const out = scanRender(pg, 1600);
    const sc = Math.min(maxW / out.width, maxH / out.height, 1);
    c.width = Math.round(out.width * sc); c.height = Math.round(out.height * sc);
    c.getContext('2d').drawImage(out, 0, 0, c.width, c.height);
    c.classList.remove('cropping');
    if(chip){ const L = { original:'Original', enhance:'Enhance · sharp', bw:'B&W · sharp' }; chip.textContent = L[pg.filter] || 'Enhance · sharp'; chip.style.display = ''; }
  }
}
function setCropHint(on){ const h = $('cropHint'); if(h) h.hidden = !on; }

/* corner-drag crop on the preview canvas (only active in scanCrop mode) */
(function(){
  const c = $('revCanvas');
  const at = e => {
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width) / (scanCrop ? scanCrop.pscale : 1),
             y: (e.clientY - r.top)  * (c.height / r.height) / (scanCrop ? scanCrop.pscale : 1) };
  };
  c.addEventListener('pointerdown', e=>{
    if(!scanCrop) return;
    const p = at(e); let best = -1, bd = 1e9;
    scanCrop.corners.forEach((q, i)=>{ const d = Math.hypot(q.x - p.x, q.y - p.y); if(d < bd){ bd = d; best = i; } });
    if(bd * scanCrop.pscale < 36){ scanCrop.drag = best; c.setPointerCapture(e.pointerId); }
  });
  c.addEventListener('pointermove', e=>{
    if(!scanCrop || scanCrop.drag == null || scanCrop.drag < 0) return;
    const p = at(e), src = scanPages[scanSel].src;
    scanCrop.corners[scanCrop.drag] = { x: Math.max(0, Math.min(src.width, p.x)), y: Math.max(0, Math.min(src.height, p.y)) };
    drawScanPreview();
  });
  ['pointerup','pointercancel'].forEach(ev=> c.addEventListener(ev, ()=>{ if(scanCrop) scanCrop.drag = -1; }));
})();

$('tbCrop').addEventListener('click', ()=>{
  const pg = scanPages[scanSel]; if(!pg) return;
  scanCrop = { corners: pg.corners.map(p=>({ x:p.x, y:p.y })), drag:-1, pscale:1 };
  setCropHint(true); drawScanPreview();
});
$('cropDone').addEventListener('click', ()=>{
  if(scanCrop){ scanPages[scanSel].corners = scanCrop.corners; scanCrop = null; }
  setCropHint(false); renderWorkspace();
});
$('tbRotate').addEventListener('click', ()=>{
  const pg = scanPages[scanSel]; if(!pg) return;
  pg.src = rotate90(pg.src); pg.corners = detectQuad(pg.src);
  scanCrop = null; setCropHint(false); renderWorkspace();
});
document.querySelectorAll('#tbFilters button').forEach(b=>{
  b.addEventListener('click', ()=>{
    const pg = scanPages[scanSel]; if(!pg) return;
    pg.filter = b.dataset.f; renderWorkspace();
  });
});
$('tbDelete').addEventListener('click', ()=>{
  if(!scanPages.length) return;
  scanPages.splice(scanSel, 1);
  scanCrop = null; setCropHint(false);
  if(!scanPages.length){ openCamera(); return; }   /* nothing left → back to capture */
  scanSel = Math.max(0, Math.min(scanSel, scanPages.length - 1));
  renderWorkspace();
});
$('revBack').addEventListener('click', ()=> openCamera());
$('revAddTop').addEventListener('click', ()=> openCamera());
$('thumbAdd').addEventListener('click', ()=> openCamera());

/* hand off to the reader (Read aloud / Ask AI), honoring the OCR toggle */
function finishScan(askAI){
  if(!scanPages.length) return;
  const shots = scanPages.map(scanShot);
  const doOcr = $('ocrToggle').checked;
  const append = scanAppend && scanSession;
  scanPages = []; scanSel = 0; scanCrop = null;
  closeCamera();
  if(append){
    scanAppend = false;
    scanSession.push(...shots);
    openImagePages(`Camera scan (${scanSession.length} pages)`, scanSession, true, doOcr);
  }else{
    openImagePages(`Camera scan (${shots.length} ${shots.length === 1 ? 'page' : 'pages'})`, shots, false, doOcr);
  }
  if(askAI) setTimeout(()=>{
    try{
      document.body.classList.remove('compHidden');
      if(window.innerWidth <= 900 && typeof openSheet === 'function') openSheet();
      const inp = $('chatInput'); if(inp) inp.focus();
    }catch(e){}
  }, 500);
}
$('revRead').addEventListener('click', ()=> finishScan(false));
$('revAskAI').addEventListener('click', ()=> finishScan(true));

/* Save the scanned pages as a real PDF (jsPDF, on device) */
$('revSavePdf').addEventListener('click', async ()=>{
  if(!scanPages.length) return;
  const btn = $('revSavePdf'), label = btn.textContent;
  btn.disabled = true; btn.textContent = 'Saving…';
  try{
    if(!(await ensureJsPDF())) throw new Error('pdf maker');
    const { jsPDF } = window.jspdf;
    let out = null;
    scanPages.forEach(pg=>{
      const c = scanRender(pg, 2200);
      const iw = c.width * 0.75, ih = c.height * 0.75, orient = iw > ih ? 'l' : 'p';
      if(!out) out = new jsPDF({ unit:'pt', format:[iw, ih], orientation:orient, compress:true });
      else out.addPage([iw, ih], orient);
      out.addImage(c.toDataURL('image/jpeg', .88), 'JPEG', 0, 0, iw, ih);
    });
    out.save('scan-' + Date.now() + '.pdf');
    btn.textContent = 'Saved ✓';
    setTimeout(()=>{ btn.textContent = label; btn.disabled = false; }, 1600);
  }catch(e){ btn.textContent = label; btn.disabled = false; alert('Could not save the PDF — please check your connection.'); }
});

/* keep the preview crisp on resize/orientation change while the workspace is open */
window.addEventListener('resize', ()=>{ if($('camModal').style.display === 'flex' && !$('revStep').hidden) drawScanPreview(); });

/* ---------------- Save photo pages as a real PDF ---------------- */
$('pdfBtn').addEventListener('click', async ()=>{
  const imgPages = pages.filter(p=>p.isImage && p.img);
  if(!imgPages.length) return;
  sayProgress('📄 Building your PDF…');
  if(!(await ensureJsPDF())){ removeProgress(); say('Could not load the PDF maker — please check your internet connection.'); return; }
  try{
    const { jsPDF } = window.jspdf;
    let doc = null;
    imgPages.forEach(pg=>{
      const pt = [pg.w * 0.75, pg.h * 0.75];              /* px → pt */
      if(!doc) doc = new jsPDF({ unit:'pt', format:pt, orientation: pg.w > pg.h ? 'l' : 'p', compress:true });
      else doc.addPage(pt, pg.w > pg.h ? 'l' : 'p');
      const c = document.createElement('canvas');
      c.width = pg.w; c.height = pg.h;
      c.getContext('2d').drawImage(pg.img, 0, 0);
      doc.addImage(c.toDataURL('image/jpeg', .88), 'JPEG', 0, 0, pt[0], pt[1]);
    });
    doc.save((docName.replace(/\.(png|jpe?g|webp|bmp)$/i,'') || 'Lexora scan') + '.pdf');
    removeProgress();
    say('✅ PDF saved to your downloads.');
  }catch(e){ removeProgress(); say('Could not build the PDF ('+e.message+').'); }
});

/* ---------------- Save the recognised text as a REAL .docx ----------------
   A .docx is a zip of XML parts. Built by hand (stored, CRC32) — no library,
   opens everywhere: Word, Word mobile, Google Docs, LibreOffice. */
$('wordBtn').addEventListener('click', ()=>{
  if(docBusy){ say('🔍 One moment — still recognising the text.','sys'); return; }
  if(!lines.length){ say('There is no recognised text to save yet.','sys'); return; }
  const pagesArr = [];
  for(let p=1; p<=numPages; p++){
    const pl = lines.filter(l=>l.page===p);
    if(pl.length) pagesArr.push({ title: numPages > 1 ? 'Page '+p : '', text: pl.map(l=>l.text).join(' ') });
  }
  const blob = buildDocx(pagesArr);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (docName.replace(/\.[a-z0-9]{2,5}$/i,'') || 'Lexora scan') + '.docx';
  a.click();
  setTimeout(()=> URL.revokeObjectURL(a.href), 5000);
  say('✅ Word file (.docx) saved to your downloads — opens on phone and computer.');
});


/* Render plain text as a clean readable page with tappable sentences */
function openText(name, rawText){
  docName = name;
  docLabel = friendlyName(name, 'doc');
  numPages = 1;
  lines = []; sentences = []; lineToSent = []; current = -1; chatHistory = []; pages = [];
  stopSpeech(); hideMarker();
  const viewer = $('viewer');
  viewer.innerHTML = '';
  viewer.appendChild(markerEl);
  $('pageSel').innerHTML = '<option value="1">Page 1</option>';
  $('dropZone').style.display = 'none';
  viewer.style.display = 'block';
  $('playbar').style.display = 'flex';
    $('pdfBtn').style.display = 'none'; $('wordBtn').style.display = 'none'; $('addPageBtn').style.display = 'none';

  const wrap = document.createElement('div');
  wrap.className = 'textWrap';
  const paras = rawText.split(/\n\s*\n|\r\n\s*\r\n/).map(p=>p.replace(/\s+/g,' ').trim()).filter(p=>p);
  const ABBR = /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|approx|dept|govt|e\.g|i\.e|No|Fig|pp|Vol|Rev|Hon|Smt|Sri|Shri|[A-Z])\.$/;
  paras.forEach(para=>{
    const pEl = document.createElement('p');
    const sents = [];
    let a = 0;
    const re = /[.!?]+["')\]]?(?=\s|$)/g;
    let m;
    while((m = re.exec(para))){
      if(ABBR.test(para.slice(Math.max(0, m.index - 9), m.index + 1))) continue;
      sents.push(para.slice(a, m.index + m[0].length).trim());
      a = m.index + m[0].length;
    }
    const rest = para.slice(a).trim();
    if(rest) sents.push(rest);
    sents.forEach(st=>{
      if(st.length < 2) return;
      const span = document.createElement('span');
      span.className = 'sentSpan';
      span.textContent = st + ' ';
      const idx = lines.length;
      span.dataset.line = idx;
      pEl.appendChild(span);
      lines.push({text: st, page: 1, el: span});
      sentences.push({text: st, page: 1, parts: [{line: idx, from: 0, to: st.length}]});
      lineToSent[idx] = idx;
    });
    if(pEl.childNodes.length) wrap.appendChild(pEl);
  });
  viewer.appendChild(wrap);
  wrap.addEventListener('click', e=>{
    const sel = window.getSelection();
    if(sel && sel.toString().trim()) return;
    const li = e.target && e.target.dataset ? e.target.dataset.line : null;
    if(li !== undefined && li !== null){ jumpTo(+li); if(!playing) togglePlay(); }
  });
  updateProgress();
  afterDocOpen();
}

/* buildDocx now lives in scripts/shared.js (Phase 2) */

