'use strict';
/* Lexora AI — scan station v2 (capture → review → export).
   Engine: detectQuad / warpPerspective / applyScanFilter / rotate90
   from scripts/scan-engine.js. Everything runs on-device.

   Model: shots[] = { raw:canvas (warped, unfiltered, rotation baked in),
                      filter:'enhance'|'original'|'bw', canvas:rendered }
   Modes: camera (default) ⟷ review (a page is selected).            */

/* ---------- shell: theme + drawer ---------- */
const flipT = ()=>{
  const light = !document.body.classList.contains('light');
  document.body.classList.toggle('light', light);
  localStorage.setItem('ra_theme', light ? 'light' : 'dark');
};
$('acctTheme').addEventListener('click', flipT);
$('topTheme').addEventListener('click', flipT);
$('hambBtn').addEventListener('click', ()=> document.body.classList.toggle('navOpen'));
$('navVeil').addEventListener('click', ()=> document.body.classList.remove('navOpen'));

/* ---------- camera ---------- */
let stream = null, camReady = false, loopT = null;
const video = $('camVideo'), overlay = $('camOverlay');

async function startCam(){
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    $('camMsg').textContent = 'No camera here — use Photo to add pictures of the page instead.';
    return;
  }
  try{
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: {ideal: 2560}, height: {ideal: 1920} }, audio: false
    });
    video.srcObject = stream;
    await video.play();
    camReady = true;
    $('camMsg').style.display = 'none';
    loopT = setInterval(liveDetect, 170);
  }catch(e){
    $('camMsg').textContent = 'Camera not available (' + e.name + ') — use Photo instead.';
  }
}

/* Auto/Manual: manual switches the live edge overlay off */
let autoDetect = true;
$('detAuto').addEventListener('click', ()=>{ autoDetect = true;  segSync(); });
$('detMan').addEventListener('click',  ()=>{ autoDetect = false; segSync();
  overlay.getContext('2d').clearRect(0, 0, overlay.width, overlay.height); });
function segSync(){
  $('detAuto').classList.toggle('on', autoDetect);
  $('detMan').classList.toggle('on', !autoDetect);
}

function liveDetect(){
  if(!camReady || !video.videoWidth || sel >= 0 || !autoDetect) return;
  const th = document.createElement('canvas');
  const sc = 320 / video.videoWidth;
  th.width = 320; th.height = Math.round(video.videoHeight * sc);
  th.getContext('2d').drawImage(video, 0, 0, th.width, th.height);
  const quad = detectQuad(th);
  const box = overlay.getBoundingClientRect();
  overlay.width = Math.round(box.width); overlay.height = Math.round(box.height);
  const g = overlay.getContext('2d');
  g.clearRect(0, 0, overlay.width, overlay.height);
  if(!quad || !quad.found) return;
  /* object-fit:cover mapping (the viewfinder fills its frame) */
  const vAR = video.videoWidth / video.videoHeight, bAR = overlay.width / overlay.height;
  let dw, dh, dx, dy;
  if(vAR > bAR){ dh = overlay.height; dw = dh * vAR; dy = 0; dx = (overlay.width - dw) / 2; }
  else{ dw = overlay.width; dh = dw / vAR; dx = 0; dy = (overlay.height - dh) / 2; }
  const mx = x => dx + (x / th.width) * dw, my = y => dy + (y / th.height) * dh;
  g.strokeStyle = 'rgba(224,122,63,.95)'; g.lineWidth = 2.5;
  g.fillStyle = 'rgba(224,122,63,.14)';
  g.beginPath();
  g.moveTo(mx(quad[0].x), my(quad[0].y));
  [1,2,3].forEach(i=> g.lineTo(mx(quad[i].x), my(quad[i].y)));
  g.closePath(); g.fill(); g.stroke();
  /* corner markers, mockup style */
  g.fillStyle = 'rgba(224,122,63,1)';
  quad.forEach(p=> g.fillRect(mx(p.x) - 6, my(p.y) - 6, 12, 12));
}

/* ---------- shots ---------- */
const shots = [];
let sel = -1;                       /* -1 = camera mode */
/* defaults for the NEXT capture (mockup rail: preset + sliders + clean up) */
const def = { filter:'enhance', deg:0, bright:0, contrast:0, clean:true };
let applyAll = false;      /* "Apply to All pages" toggle */
let pageSize = 'auto';     /* PDF page size: auto | a4 | letter */

function cloneCanvas(c){
  const o = document.createElement('canvas');
  o.width = c.width; o.height = c.height;
  o.getContext('2d').drawImage(c, 0, 0);
  return o;
}
function fxCanvas(src, cssFilter){
  const o = document.createElement('canvas');
  o.width = src.width; o.height = src.height;
  const g = o.getContext('2d');
  g.filter = cssFilter;
  g.drawImage(src, 0, 0);
  return o;
}
function rotateDeg(src, deg){
  const o = document.createElement('canvas');
  o.width = src.width; o.height = src.height;
  const g = o.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, o.width, o.height);
  g.translate(o.width / 2, o.height / 2);
  g.rotate(deg * Math.PI / 180);
  g.drawImage(src, -src.width / 2, -src.height / 2);
  return o;
}
/* develop pipeline: raw → straighten → preset → clean-up → brightness */
function renderShot(s){
  let c = cloneCanvas(s.raw);
  if (s.deg) c = rotateDeg(c, s.deg);
  if (s.filter === 'enhance' || s.filter === 'bw') c = applyScanFilter(c, s.filter);
  else if (s.filter === 'gray') c = fxCanvas(c, 'grayscale(1) contrast(1.05)');
  if (s.clean && s.filter === 'original') c = fxCanvas(c, 'contrast(1.07) brightness(1.03)');
  if (s.bright || s.contrast) c = fxCanvas(c,
    'brightness(' + (100 + (s.bright||0)) + '%) contrast(' + (100 + (s.contrast||0)) + '%)');
  s.canvas = c;
  return c;
}
/* the controls edit the selected page in review, or the defaults in camera */
function target(){ return sel >= 0 && shots[sel] ? shots[sel] : def; }
function applyTarget(){
  if (sel >= 0 && shots[sel]){ renderShot(shots[sel]); preview(); strip(); }
  if (applyAll) spreadToAll();
}
function processRaw(src){
  const th = imgToCanvas(src, 320);
  const quad = detectQuad(th);
  const kx = src.width / th.width, ky = src.height / th.height;
  const corners = quad.map(p=> ({x: p.x * kx, y: p.y * ky}));
  return warpPerspective(src, corners, 2200);
}
function addShot(raw){
  const s = { raw, filter: def.filter, deg: def.deg, bright: def.bright, contrast: def.contrast, clean: def.clean };
  renderShot(s);
  shots.push(s);
  strip();
}
/* copy the target's develop settings onto every page (Apply to → All pages) */
function spreadToAll(){
  const t = target();
  shots.forEach(s=>{
    s.filter = t.filter; s.deg = t.deg; s.bright = t.bright; s.contrast = t.contrast; s.clean = t.clean;
    renderShot(s);
  });
  strip();
  if (sel >= 0) preview();
}

/* page strip */
function strip(){
  const box = $('shots');
  box.innerHTML = '';
  shots.forEach((s, i)=>{
    const w = document.createElement('div');
    w.className = 'shot' + (i === sel ? ' sel' : '');
    const img = document.createElement('img');
    img.src = s.canvas.toDataURL('image/jpeg', .6);
    img.alt = 'Page ' + (i + 1);
    const n = document.createElement('small'); n.textContent = i + 1;
    const del = document.createElement('button');
    del.type = 'button'; del.textContent = '✕'; del.title = 'Delete page';
    del.addEventListener('click', ev=>{ ev.stopPropagation(); removeShot(i); });
    w.appendChild(img); w.appendChild(n); w.appendChild(del);
    w.addEventListener('click', ()=> select(i));
    box.appendChild(w);
  });
  /* add-page tile → back to the camera */
  if (shots.length){
    const add = document.createElement('button');
    add.type = 'button'; add.className = 'shotAdd'; add.title = 'Add another page';
    add.textContent = '+';
    add.addEventListener('click', backToCam);
    box.appendChild(add);
  }
  $('exportCard').style.display = shots.length ? 'block' : 'none';
  $('shotCount').textContent = shots.length + (shots.length === 1 ? ' page scanned' : ' pages scanned');
  $('saveAll').textContent = 'Save ' + shots.length + (shots.length === 1 ? ' page' : ' pages');
  /* mobile page-stack thumb */
  const st = $('stackBtn');
  if (st){
    if (shots.length){
      st.hidden = false;
      st.querySelector('img').src = shots[shots.length - 1].canvas.toDataURL('image/jpeg', .5);
      $('stackN').textContent = shots.length;
    } else st.hidden = true;
  }
}
function removeShot(i){
  shots.splice(i, 1);
  if (!shots.length){ backToCam(); return; }
  if (sel >= 0){ sel = Math.min(sel, shots.length - 1); preview(); }
  strip();
}

/* ---------- capture ---------- */
$('shotBtn').addEventListener('click', ()=>{
  if(!camReady || !video.videoWidth){ $('camInput').click(); return; }
  const c = document.createElement('canvas');
  const sc = Math.min(1, 2600 / video.videoWidth);
  c.width = Math.round(video.videoWidth * sc); c.height = Math.round(video.videoHeight * sc);
  c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
  try{ addShot(processRaw(c)); }catch(e){ msg('⚠ ' + e.message); }
});
$('camInput').addEventListener('change', async e=>{
  for(const f of [...e.target.files]){
    try{ addShot(processRaw(await fileToCanvas(f, 2600))); }
    catch(err){ console.warn('photo skipped', err); }
  }
  e.target.value = '';
});
/* rotate the LAST captured page straight from the dock */
$('rotLast').addEventListener('click', ()=>{
  if(!shots.length) return;
  const s = shots[shots.length - 1];
  s.raw = rotate90(s.raw);
  renderShot(s);
  strip();
});

/* ---------- review mode ---------- */
function select(i){
  sel = i;
  $('camStage').hidden = true;
  $('revStage').hidden = false;
  document.querySelector('.scanStage').classList.add('review');
  cropCancel();
  preview();
  strip();
}
function backToCam(){
  sel = -1;
  cropCancel();
  $('revStage').hidden = true;
  $('camStage').hidden = false;
  document.querySelector('.scanStage').classList.remove('review');
  strip();
  syncPresets();
}
$('revBack').addEventListener('click', backToCam);

function preview(){
  const s = shots[sel]; if(!s) return;
  const box = $('revBox');
  [...box.querySelectorAll('canvas')].forEach(n=> n.remove());
  const c = cloneCanvas(s.canvas);
  box.insertBefore(c, box.firstChild);
  $('revMeta').textContent = 'Page ' + (sel + 1) + ' of ' + shots.length + ' · ' +
    ({enhance:'Auto · sharp', original:'Original', bw:'B & W', gray:'Grayscale'}[s.filter] || s.filter);
  syncPresets();
}

$('revRotate').addEventListener('click', ()=>{
  const s = shots[sel]; if(!s) return;
  s.raw = rotate90(s.raw);
  renderShot(s);
  preview(); strip();
});
/* Enhance cycles the develop preset for this page */
const FILTERS = ['enhance', 'original', 'bw', 'gray'];
$('revEnhance').addEventListener('click', ()=>{
  const s = shots[sel]; if(!s) return;
  s.filter = FILTERS[(FILTERS.indexOf(s.filter) + 1) % FILTERS.length];
  renderShot(s);
  preview(); strip();
});
$('revDelete').addEventListener('click', ()=>{ if(sel >= 0) removeShot(sel); });

/* ---------- crop (4-corner rectangle over the preview) ---------- */
let cropOn = false;
$('revCrop').addEventListener('click', ()=> cropOn ? cropCancel() : cropStart());
$('cropApply').addEventListener('click', cropApply);
$('cropCancel').addEventListener('click', cropCancel);

function cropStart(){
  const box = $('revBox'), c = box.querySelector('canvas');
  if(!c) return;
  cropOn = true;
  $('revStage').classList.add('cropping');
  const r = $('cropRect');
  const cw = c.clientWidth, ch = c.clientHeight;
  const ox = c.offsetLeft, oy = c.offsetTop;
  Object.assign(r.style, {
    left:(ox + cw * .06)+'px', top:(oy + ch * .06)+'px',
    width:(cw * .88)+'px', height:(ch * .88)+'px'
  });
}
function cropCancel(){
  cropOn = false;
  $('revStage').classList.remove('cropping');
}
function cropApply(){
  const s = shots[sel], box = $('revBox'), c = box.querySelector('canvas');
  if(!s || !c){ cropCancel(); return; }
  const r = $('cropRect');
  const scX = s.raw.width  / c.clientWidth,
        scY = s.raw.height / c.clientHeight;
  const x = Math.max(0, (r.offsetLeft - c.offsetLeft) * scX),
        y = Math.max(0, (r.offsetTop  - c.offsetTop)  * scY),
        w = Math.min(s.raw.width  - x, r.offsetWidth  * scX),
        h = Math.min(s.raw.height - y, r.offsetHeight * scY);
  if (w > 40 && h > 40){
    const o = document.createElement('canvas');
    o.width = Math.round(w); o.height = Math.round(h);
    o.getContext('2d').drawImage(s.raw, x, y, w, h, 0, 0, o.width, o.height);
    s.raw = o;
    renderShot(s);
  }
  cropCancel();
  preview(); strip();
}
/* rect drag + 4 corner handles */
(function(){
  const rect = $('cropRect');
  let drag = null;
  rect.addEventListener('pointerdown', e=>{
    e.preventDefault(); e.stopPropagation();
    const h = e.target.getAttribute('data-h');
    drag = { h: h || 'move', x: e.clientX, y: e.clientY,
             l: rect.offsetLeft, t: rect.offsetTop, w: rect.offsetWidth, hh: rect.offsetHeight };
    rect.setPointerCapture(e.pointerId);
  });
  rect.addEventListener('pointermove', e=>{
    if(!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    let l = drag.l, t = drag.t, w = drag.w, h = drag.hh;
    if (drag.h === 'move'){ l += dx; t += dy; }
    if (drag.h === 'nw'){ l += dx; t += dy; w -= dx; h -= dy; }
    if (drag.h === 'ne'){ t += dy; w += dx; h -= dy; }
    if (drag.h === 'sw'){ l += dx; w -= dx; h += dy; }
    if (drag.h === 'se'){ w += dx; h += dy; }
    if (w > 40 && h > 40){
      rect.style.left = l+'px'; rect.style.top = t+'px';
      rect.style.width = w+'px'; rect.style.height = h+'px';
    }
  });
  const end = ()=> drag = null;
  rect.addEventListener('pointerup', end);
  rect.addEventListener('pointercancel', end);
})();

/* ---------- rail controls (mockup 5a): presets · sliders · clean up ---------- */
function syncPresets(){
  const t = target();
  document.querySelectorAll('#presetGrid .preset').forEach(p=>{
    const on = p.getAttribute('data-v') === t.filter;
    p.classList.toggle('on', on);
    p.setAttribute('aria-checked', on ? 'true' : 'false');
  });
  $('strSlide').value = t.deg;
  $('strVal').textContent = (t.deg > 0 ? '+' : '') + t.deg + '°';
  $('brSlide').value = t.bright;
  $('brVal').textContent = (t.bright > 0 ? '+' : '') + t.bright;
  $('ctSlide').value = t.contrast || 0;
  $('ctVal').textContent = ((t.contrast||0) > 0 ? '+' : '') + (t.contrast||0);
  $('cleanChk').checked = !!t.clean;
}
$('presetGrid').addEventListener('click', e=>{
  const b = e.target.closest('.preset'); if(!b) return;
  target().filter = b.getAttribute('data-v');
  applyTarget(); syncPresets();
});
let slideT = null;
$('strSlide').addEventListener('input', ()=>{
  target().deg = +$('strSlide').value;
  $('strVal').textContent = (target().deg > 0 ? '+' : '') + target().deg + '°';
  clearTimeout(slideT); slideT = setTimeout(applyTarget, 140);
});
$('brSlide').addEventListener('input', ()=>{
  target().bright = +$('brSlide').value;
  $('brVal').textContent = (target().bright > 0 ? '+' : '') + target().bright;
  clearTimeout(slideT); slideT = setTimeout(applyTarget, 140);
});
$('ctSlide').addEventListener('input', ()=>{
  target().contrast = +$('ctSlide').value;
  $('ctVal').textContent = (target().contrast > 0 ? '+' : '') + target().contrast;
  clearTimeout(slideT); slideT = setTimeout(applyTarget, 140);
});
/* Apply-to toggle */
$('applyOne').addEventListener('click', ()=>{ applyAll = false; applySegSync(); });
$('applyAll').addEventListener('click', ()=>{ applyAll = true; applySegSync(); spreadToAll(); });
function applySegSync(){
  $('applyOne').classList.toggle('on', !applyAll);
  $('applyAll').classList.toggle('on', applyAll);
}
/* Page size toggle */
$('sizeSeg').addEventListener('click', e=>{
  const b = e.target.closest('[data-s]'); if(!b) return;
  pageSize = b.getAttribute('data-s');
  $('sizeSeg').querySelectorAll('[data-s]').forEach(x=> x.classList.toggle('on', x === b));
});
$('cleanChk').addEventListener('change', ()=>{
  target().clean = $('cleanChk').checked;
  applyTarget();
});
/* Add page (rail CTA, pinned bottom): capture in camera, back to camera in review */
$('addPage').addEventListener('click', ()=>{
  if (sel >= 0) backToCam();
  else $('shotBtn').click();
});
/* mobile page-stack → review the last page */
$('stackBtn').addEventListener('click', ()=>{ if (shots.length) select(shots.length - 1); });
syncPresets();

/* ---------- export: format tabs + one save action ---------- */
let fmt = 'pdf';
$('fmtTabs').addEventListener('click', e=>{
  const b = e.target.closest('[data-f]'); if(!b) return;
  fmt = b.getAttribute('data-f');
  document.querySelectorAll('#fmtTabs [data-f]').forEach(t=> t.classList.toggle('on', t === b));
});

const stamp = ()=> 'scan ' + new Date().toISOString().slice(0,10);
const msg = t => { $('expMsg').textContent = t == null ? '' : t; };
const busy = on => { ['saveAll','readAloudBtn','ocrTextBtn','copyTextBtn'].forEach(id=>{ const el=$(id); if(el) el.disabled = on; }); };

/* OCR all pages to a plain-text string (shared by Word export + Copy) */
async function ocrAll(){
  const worker = await Tesseract.createWorker('eng', 1, {
    workerPath: new URL('lib/ocr/worker.min.js', location.href).href,
    corePath:   new URL('lib/ocr', location.href).href,
    langPath:   new URL('lib/lang', location.href).href
  });
  const pages = [];
  for(let i = 0; i < shots.length; i++){
    msg('Recognising page ' + (i+1) + ' of ' + shots.length + '…');
    const res = await worker.recognize(shots[i].canvas);
    pages.push((res.data.text || '').trim());
  }
  await worker.terminate();
  return pages;
}

async function buildPdf(){
  if(!(await ensureJsPDF())) throw new Error('could not load the PDF maker');
  const { jsPDF } = window.jspdf;
  const SIZE = { a4:[595.28, 841.89], letter:[612, 792] };   /* points */
  let out = null;
  shots.forEach(s=>{
    const iw = s.canvas.width * 0.75, ih = s.canvas.height * 0.75;
    const fixed = SIZE[pageSize];
    /* fixed page size → fit the image centered on the sheet; auto → image size */
    const pt = fixed ? fixed.slice() : [iw, ih];
    const orient = pt[0] > pt[1] ? 'l' : 'p';
    if(!out) out = new jsPDF({unit:'pt', format:pt, orientation:orient, compress:true});
    else out.addPage(pt, orient);
    const data = s.canvas.toDataURL('image/jpeg', .88);
    if(fixed){
      const sc = Math.min(pt[0]/iw, pt[1]/ih);
      const w = iw*sc, h = ih*sc, x = (pt[0]-w)/2, y = (pt[1]-h)/2;
      out.addImage(data, 'JPEG', x, y, w, h);
    }else out.addImage(data, 'JPEG', 0, 0, iw, ih);
  });
  return out;
}

$('saveAll').addEventListener('click', async ()=>{
  if(!shots.length) return;
  busy(true);
  try{
    if (fmt === 'pdf'){
      msg('Building the PDF…');
      (await buildPdf()).save(stamp() + '.pdf');
      msg('PDF saved. Open it in the reader to hear it aloud.');
    }else if (fmt === 'jpg'){
      msg('Packing images…');
      const files = [];
      for(let i = 0; i < shots.length; i++){
        const blob = await new Promise(res=> shots[i].canvas.toBlob(res, 'image/jpeg', .9));
        files.push({ name: 'page-' + String(i+1).padStart(2,'0') + '.jpg', data: new Uint8Array(await blob.arrayBuffer()) });
      }
      const a = document.createElement('a');
      if(files.length === 1){
        a.href = URL.createObjectURL(new Blob([files[0].data], {type:'image/jpeg'}));
        a.download = stamp() + '.jpg';
      }else{
        a.href = URL.createObjectURL(makeZip(files, 'application/zip'));
        a.download = stamp() + '.zip';
      }
      a.click();
      setTimeout(()=> URL.revokeObjectURL(a.href), 5000);
      msg('Saved.');
    }
  }catch(e){ msg('⚠ ' + e.message); }
  busy(false);
});

/* handoff: OCR the pages into a Word file */
async function saveWord(){
  const worker = await Tesseract.createWorker('eng', 1, {
    workerPath: new URL('lib/ocr/worker.min.js', location.href).href,
    corePath:   new URL('lib/ocr', location.href).href,
    langPath:   new URL('lib/lang', location.href).href
  });
  const pagesArr = [];
  for(let i = 0; i < shots.length; i++){
    msg('Recognising page ' + (i+1) + ' of ' + shots.length + '…');
    const res = await worker.recognize(shots[i].canvas);
    const text = (res.data.text || '').trim();
    if(text) pagesArr.push({ title: shots.length > 1 ? 'Page ' + (i+1) : '', text });
  }
  await worker.terminate();
  if(!pagesArr.length) throw new Error('no readable text found — try the Auto preset and better light');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(buildDocx(pagesArr));
  a.download = stamp() + '.docx'; a.click();
  setTimeout(()=> URL.revokeObjectURL(a.href), 5000);
  msg('Word file saved.');
}
$('ocrTextBtn').addEventListener('click', async ()=>{
  if(!shots.length) return;
  busy(true);
  try{ await saveWord(); }catch(e){ msg('⚠ ' + e.message); }
  busy(false);
});
/* Copy plain text: OCR every page → clipboard */
$('copyTextBtn').addEventListener('click', async ()=>{
  if(!shots.length) return;
  busy(true);
  try{
    const text = (await ocrAll()).filter(Boolean).join('\n\n');
    if(!text) throw new Error('no readable text found — try the Auto preset and better light');
    await navigator.clipboard.writeText(text);
    msg('Copied ' + text.length.toLocaleString() + ' characters to the clipboard.');
  }catch(e){ msg('⚠ ' + e.message); }
  busy(false);
});

/* hand straight off to the reader (same lxhand handoff the tools use) */
$('readAloudBtn').addEventListener('click', async ()=>{
  if(!shots.length) return;
  busy(true); msg('Preparing for the reader…');
  try{
    const blob = (await buildPdf()).output('blob');
    await new Promise((res, rej)=>{
      const r = indexedDB.open('lxhand', 1);
      r.onupgradeneeded = ()=> r.result.createObjectStore('f');
      r.onerror = ()=> rej(r.error);
      r.onsuccess = ()=>{
        const tx = r.result.transaction('f', 'readwrite');
        tx.objectStore('f').put({ blob, name: stamp() + '.pdf', t: Date.now() }, 'doc');
        tx.oncomplete = res; tx.onerror = ()=> rej(tx.error);
      };
    });
    location.href = 'index.html';
  }catch(e){ msg('⚠ ' + e.message); busy(false); }
});

window.addEventListener('beforeunload', ()=>{ if(stream) stream.getTracks().forEach(t=> t.stop()); });
startCam();
