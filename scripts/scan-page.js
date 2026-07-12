'use strict';
/* Lexora AI — dedicated scan page (Phase 2).
   Uses the SAME scan engine as the in-app camera: detectQuad / warpPerspective /
   applyScanFilter / rotate90 from scripts/scan-engine.js. */

/* ---------- theme ---------- */
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
    $('camMsg').textContent = 'No camera here — use 📁 Photo to add pictures of the page instead.';
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
    $('camMsg').textContent = 'Camera not available (' + e.name + ') — use 📁 Photo instead.';
  }
}

/* live paper-edge preview: detect on a small thumb, map onto the video box */
function liveDetect(){
  if(!camReady || !video.videoWidth) return;
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
  /* object-fit:contain mapping */
  const vAR = video.videoWidth / video.videoHeight, bAR = overlay.width / overlay.height;
  let dw, dh, dx, dy;
  if(vAR > bAR){ dw = overlay.width; dh = dw / vAR; dx = 0; dy = (overlay.height - dh) / 2; }
  else{ dh = overlay.height; dw = dh * vAR; dy = 0; dx = (overlay.width - dw) / 2; }
  const mx = x => dx + (x / th.width) * dw, my = y => dy + (y / th.height) * dh;
  g.strokeStyle = 'rgba(224,122,63,.95)'; g.lineWidth = 2.5;
  g.fillStyle = 'rgba(224,122,63,.14)';
  g.beginPath();
  g.moveTo(mx(quad[0].x), my(quad[0].y));
  [1,2,3].forEach(i=> g.lineTo(mx(quad[i].x), my(quad[i].y)));
  g.closePath(); g.fill(); g.stroke();
}

/* ---------- shots ---------- */
const shots = [];   /* {canvas} after warp+filter */

function addShotCanvas(c){
  shots.push({ canvas: c });
  const wrap = document.createElement('div');
  wrap.className = 'shot';
  const img = document.createElement('img');
  img.src = c.toDataURL('image/jpeg', .7);
  const del = document.createElement('button');
  del.textContent = '✕';
  del.addEventListener('click', ()=>{
    const i = [...$('shots').children].indexOf(wrap);
    if(i >= 0) shots.splice(i, 1);
    wrap.remove();
    renumber();
  });
  const tag = document.createElement('small');
  wrap.appendChild(img); wrap.appendChild(del); wrap.appendChild(tag);
  $('shots').appendChild(wrap);
  renumber();
}
function renumber(){
  [...$('shots').children].forEach((w, i)=> w.querySelector('small').textContent = i + 1);
  $('exportCard').style.display = shots.length ? 'block' : 'none';
  $('shotCount').textContent = shots.length + (shots.length === 1 ? ' page scanned' : ' pages scanned');
}

/* full scan pipeline: frame/photo canvas → detect → warp → filter */
function processToScan(src){
  const th = imgToCanvas(src, 320);
  const quad = detectQuad(th);
  const kx = src.width / th.width, ky = src.height / th.height;
  const corners = quad.map(p=> ({x: p.x * kx, y: p.y * ky}));
  let out = warpPerspective(src, corners, 2200);
  out = applyScanFilter(out, $('filterSel').value);
  return out;
}

$('shotBtn').addEventListener('click', ()=>{
  if(!camReady || !video.videoWidth){ $('camInput').click(); return; }
  const c = document.createElement('canvas');
  const sc = Math.min(1, 2600 / video.videoWidth);
  c.width = Math.round(video.videoWidth * sc); c.height = Math.round(video.videoHeight * sc);
  c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
  addShotCanvas(processToScan(c));
});

$('camInput').addEventListener('change', async e=>{
  for(const f of [...e.target.files]){
    try{ addShotCanvas(processToScan(await fileToCanvas(f, 2600))); }
    catch(err){ console.warn('photo skipped', err); }
  }
  e.target.value = '';
});

/* ---------- exports ---------- */
const stamp = ()=> 'scan ' + new Date().toISOString().slice(0,10);
const busy = (btn, on, txt)=>{ btn.disabled = on; if(txt != null) $('expMsg').textContent = txt; };

$('expPdf').addEventListener('click', async ()=>{
  if(!shots.length) return;
  busy($('expPdf'), true, 'Building the PDF…');
  try{
    if(!(await ensureJsPDF())) throw new Error('could not load the PDF maker');
    const { jsPDF } = window.jspdf;
    let out = null;
    shots.forEach(s=>{
      const pt = [s.canvas.width * 0.75, s.canvas.height * 0.75];
      if(!out) out = new jsPDF({unit:'pt', format:pt, orientation: pt[0] > pt[1] ? 'l' : 'p', compress:true});
      else out.addPage(pt, pt[0] > pt[1] ? 'l' : 'p');
      out.addImage(s.canvas.toDataURL('image/jpeg', .88), 'JPEG', 0, 0, pt[0], pt[1]);
    });
    out.save(stamp() + '.pdf');
    busy($('expPdf'), false, '✅ PDF saved. Open it in the reader to hear it aloud.');
  }catch(e){ busy($('expPdf'), false, '⚠ ' + e.message); }
});

$('expImgs').addEventListener('click', async ()=>{
  if(!shots.length) return;
  busy($('expImgs'), true, 'Packing images…');
  try{
    const files = [];
    for(let i = 0; i < shots.length; i++){
      const blob = await new Promise(res=> shots[i].canvas.toBlob(res, 'image/jpeg', .9));
      files.push({ name: 'page-' + String(i+1).padStart(2,'0') + '.jpg', data: new Uint8Array(await blob.arrayBuffer()) });
    }
    if(files.length === 1){
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([files[0].data], {type:'image/jpeg'}));
      a.download = stamp() + '.jpg'; a.click();
      setTimeout(()=> URL.revokeObjectURL(a.href), 5000);
    }else{
      const a = document.createElement('a');
      a.href = URL.createObjectURL(makeZip(files, 'application/zip'));
      a.download = stamp() + '.zip'; a.click();
      setTimeout(()=> URL.revokeObjectURL(a.href), 5000);
    }
    busy($('expImgs'), false, '✅ Saved.');
  }catch(e){ busy($('expImgs'), false, '⚠ ' + e.message); }
});

$('expWord').addEventListener('click', async ()=>{
  if(!shots.length) return;
  busy($('expWord'), true, 'Recognising text (OCR)…');
  try{
    const worker = await Tesseract.createWorker('eng', 1, {
      workerPath: new URL('lib/ocr/worker.min.js', location.href).href,
      corePath:   new URL('lib/ocr', location.href).href,
      langPath:   new URL('lib/lang', location.href).href
    });
    const pagesArr = [];
    for(let i = 0; i < shots.length; i++){
      busy($('expWord'), true, `Recognising page ${i+1} of ${shots.length}…`);
      const res = await worker.recognize(shots[i].canvas);
      const text = (res.data.text || '').trim();
      if(text) pagesArr.push({ title: shots.length > 1 ? 'Page ' + (i+1) : '', text });
    }
    await worker.terminate();
    if(!pagesArr.length) throw new Error('no readable text found — try Enhance filter and better light');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(buildDocx(pagesArr));
    a.download = stamp() + '.docx'; a.click();
    setTimeout(()=> URL.revokeObjectURL(a.href), 5000);
    busy($('expWord'), false, '✅ Word file saved.');
  }catch(e){ busy($('expWord'), false, '⚠ ' + e.message); }
});

window.addEventListener('beforeunload', ()=>{ if(stream) stream.getTracks().forEach(t=> t.stop()); });
startCam();
