/* ================= 🧰 TOOLS — all client-side, files never leave the device ================= */
function pickFiles(accept, multiple){
  return new Promise(res=>{
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept; i.multiple = !!multiple;
    i.onchange = ()=> res([...i.files]);
    i.click();
  });
}
function downloadBlob(blob, name){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(()=> URL.revokeObjectURL(a.href), 8000);
}
async function ensurePdfLib(){
  if(window.PDFLib) return true;
  try{
    await new Promise((res, rej)=>{
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }catch(e){ return false; }
  return !!window.PDFLib;
}
function ensurePdfjs(){
  if(!pdfjsLib) pdfjsLib = window['pdfjs-dist/build/pdf'];
  return !!pdfjsLib;
}
async function newOcrWorker(){
  return Tesseract.createWorker('eng', 1, {
    workerPath: new URL('lib/ocr/worker.min.js', location.href).href,
    corePath:   new URL('lib/ocr', location.href).href,
    langPath:   new URL('lib/lang', location.href).href
  });
}
async function openPdfjs(file){
  ensurePdfjs();
  return pdfjsLib.getDocument({
    data: await file.arrayBuffer(),
    cMapUrl: new URL('lib/cmaps/', location.href).href, cMapPacked: true,
    standardFontDataUrl: new URL('lib/standard_fonts/', location.href).href,
    stopAtErrors: false
  }).promise;
}
function parseRange(str, n){
  const out = new Set();
  String(str||'').split(',').forEach(part=>{
    const m = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if(!m) return;
    const a = Math.max(1, +m[1]), b = Math.min(n, +(m[2]||m[1]));
    for(let i=a; i<=b; i++) out.add(i-1);
  });
  return [...out].sort((a,b)=>a-b);
}
function baseName(f){ return f.name.replace(/\.[a-z0-9]{2,5}$/i,''); }
function toolBusy(msg, pct){
  $('toolOpts').style.display = 'none';
  $('toolStatus').style.display = 'block';
  $('toolStatusTxt').textContent = msg;
  $('toolBarFill').style.width = (pct==null ? 15 : Math.round(pct)) + '%';
}
function toolDone(msg, ok){
  $('toolStatusTxt').textContent = (ok===false ? '⚠ ' : '✅ ') + msg;
  $('toolBarFill').style.width = ok===false ? '0%' : '100%';
}
function toolOptions(html, onGo){
  $('toolStatus').style.display = 'none';
  const box = $('toolOpts');
  box.innerHTML = html + '<button class="go" id="toolGo">Start</button>';
  box.style.display = 'block';
  $('toolGo').onclick = onGo;
}
async function runTool(fn){
  try{ await fn(); }
  catch(e){ console.warn('tool error', e); toolDone('Something went wrong: ' + e.message, false); }
}

/* --- text extraction (with automatic OCR fallback for scanned PDFs) --- */
async function pdfPagesText(file, allowOcr){
  const doc = await openPdfjs(file);
  const pages = [];
  let totalChars = 0;
  for(let p=1; p<=doc.numPages; p++){
    toolBusy(`Reading page ${p} of ${doc.numPages}…`, p/doc.numPages*70);
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const rows = {};
    tc.items.forEach(it=>{
      if(!it.str || !it.str.trim()) return;
      const y = Math.round(it.transform[5]);
      const k = Object.keys(rows).find(r=>Math.abs(r-y)<=2) ?? y;
      (rows[k] = rows[k] || []).push(it);
    });
    const text = Object.keys(rows).map(Number).sort((a,b)=>b-a)
      .map(y=> rows[y].sort((a,b)=>a.transform[4]-b.transform[4]).map(i=>i.str).join(' ').replace(/\s+/g,' ').trim())
      .join('\n');
    totalChars += text.length;
    pages.push({ text, page });
  }
  if(totalChars < 60 && allowOcr){
    /* scanned PDF — OCR each page */
    const worker = await newOcrWorker();
    for(let i=0; i<pages.length; i++){
      toolBusy(`Scanned PDF — recognising page ${i+1} of ${pages.length}…`, 70 + (i+1)/pages.length*28);
      const vp = pages[i].page.getViewport({scale:2});
      const c = document.createElement('canvas');
      c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
      await pages[i].page.render({canvasContext:c.getContext('2d'), viewport:vp}).promise;
      const res = await worker.recognize(c);
      pages[i].text = (res.data.text || '').trim();
    }
    await worker.terminate();
  }
  return { doc, pages };
}

/* ================= TRUE PDF COMPRESSION =================
   Recompress the images EMBEDDED in the PDF (downsample + JPEG re-encode),
   strip metadata/thumbnails, rebuild with object streams. Text stays vector:
   sharp, selectable, searchable. Never returns a bigger file. */

/* PNG predictor un-filtering (PDF /Predictor >= 10), 8-bit samples */
function pngUnpredict(data, width, colors){
  const bpp = colors;                                   /* bytes per pixel at 8 bpc */
  const rowLen = width * colors;
  const rows = Math.floor(data.length / (rowLen + 1));
  const out = new Uint8Array(rows * rowLen);
  let prev = new Uint8Array(rowLen);
  for(let r = 0; r < rows; r++){
    const ft = data[r * (rowLen + 1)];
    const src = data.subarray(r * (rowLen + 1) + 1, r * (rowLen + 1) + 1 + rowLen);
    const cur = out.subarray(r * rowLen, (r + 1) * rowLen);
    for(let i = 0; i < rowLen; i++){
      const a = i >= bpp ? cur[i - bpp] : 0;            /* left */
      const b = prev[i];                                /* up */
      const cc = i >= bpp ? prev[i - bpp] : 0;          /* up-left */
      let x = src[i];
      if(ft === 1) x += a;
      else if(ft === 2) x += b;
      else if(ft === 3) x += (a + b) >> 1;
      else if(ft === 4){
        const p = a + b - cc, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - cc);
        x += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : cc);
      }
      cur[i] = x & 255;
    }
    prev = cur;
  }
  return out;
}
async function inflateBytes(u8){
  const ds = new DecompressionStream('deflate');
  return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer());
}
/* FlateDecode image stream → canvas (plain 8-bit RGB/Gray, optional PNG predictor) */
async function flateImageToCanvas(ctx, d, raw, w, h){
  const N = PDFLib.PDFName.of;
  const cs = ctx.lookup(d.get(N('ColorSpace')));
  let comps = 0;
  const csName = cs ? String(cs) : '';
  if(csName === '/DeviceRGB') comps = 3;
  else if(csName === '/DeviceGray') comps = 1;
  else if(cs instanceof PDFLib.PDFArray && String(cs.get(0)) === '/ICCBased'){
    const st = ctx.lookup(cs.get(1));
    const n = st && st.dict ? ctx.lookup(st.dict.get(N('N'))) : null;
    comps = (n && n.asNumber) ? n.asNumber() : 0;
  }
  if(comps !== 1 && comps !== 3) return null;
  const bv = ctx.lookup(d.get(N('BitsPerComponent')));
  if(((bv && bv.asNumber) ? bv.asNumber() : 8) !== 8) return null;
  if(d.get(N('Decode'))) return null;                   /* custom decode arrays — skip */
  let dp = ctx.lookup(d.get(N('DecodeParms')) || d.get(N('DP')));
  if(dp instanceof PDFLib.PDFArray) dp = ctx.lookup(dp.get(0));
  let predictor = 1, pcolors = comps, pcols = w;
  if(dp instanceof PDFLib.PDFDict){
    const gv = k => { const v = ctx.lookup(dp.get(N(k))); return (v && v.asNumber) ? v.asNumber() : undefined; };
    predictor = gv('Predictor') ?? 1;
    pcolors = gv('Colors') ?? comps;
    pcols = gv('Columns') ?? w;
  }
  let px;
  try{ px = await inflateBytes(raw); }catch(e){ return null; }
  if(predictor >= 10) px = pngUnpredict(px, pcols, pcolors);
  else if(predictor !== 1) return null;                 /* TIFF predictor — skip */
  if(px.length < w * h * comps) return null;
  const rgba = new Uint8ClampedArray(w * h * 4);
  if(comps === 3){
    for(let i = 0, j = 0; i < w * h; i++){ rgba[i*4] = px[j++]; rgba[i*4+1] = px[j++]; rgba[i*4+2] = px[j++]; rgba[i*4+3] = 255; }
  }else{
    for(let i = 0; i < w * h; i++){ const g = px[i]; rgba[i*4] = g; rgba[i*4+1] = g; rgba[i*4+2] = g; rgba[i*4+3] = 255; }
  }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0);
  return c;
}
/* one embedded image: decode → (downscale) → JPEG. Returns replacement stream or null. */
async function recompressImageStream(ctx, obj, quality, maxDim){
  const N = PDFLib.PDFName.of;
  const d = obj.dict;
  const num = k => { const v = ctx.lookup(d.get(N(k))); return (v && v.asNumber) ? v.asNumber() : NaN; };
  const w = num('Width'), h = num('Height');
  if(!(w > 8 && h > 8) || w * h > 40e6) return null;
  if(d.get(N('ImageMask')) === PDFLib.PDFBool.True) return null;
  const raw = obj.getContents ? obj.getContents() : obj.contents;
  if(!raw || raw.length < 15000) return null;           /* tiny — not worth touching */
  const fobj = ctx.lookup(d.get(N('Filter')));
  const filters = !fobj ? [] : (fobj instanceof PDFLib.PDFArray ? fobj.asArray().map(String) : [String(fobj)]);
  let src = null;
  if(filters.length === 1 && filters[0] === '/DCTDecode'){
    if(raw.length < 60000 && w <= maxDim && h <= maxDim) return null;   /* small jpeg, keep */
    try{
      const bmp = await createImageBitmap(new Blob([raw], {type:'image/jpeg'}));
      src = document.createElement('canvas');
      src.width = bmp.width; src.height = bmp.height;
      src.getContext('2d').drawImage(bmp, 0, 0);
      bmp.close();
    }catch(e){ return null; }                           /* CMYK etc. — leave untouched */
  }else if(filters.length === 1 && filters[0] === '/FlateDecode'){
    src = await flateImageToCanvas(ctx, d, raw, w, h);
    if(!src) return null;
  }else return null;
  let c = src;
  const k = Math.min(1, maxDim / Math.max(src.width, src.height));
  if(k < 1){
    c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(src.width * k));
    c.height = Math.max(1, Math.round(src.height * k));
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  }
  const blob = await new Promise(res=> c.toBlob(res, 'image/jpeg', quality));
  if(!blob) return null;
  const jpg = new Uint8Array(await blob.arrayBuffer());
  if(jpg.length >= raw.length * 0.92) return null;      /* not a real win — keep original */
  const stream = ctx.stream(jpg, { Type:'XObject', Subtype:'Image', Width:c.width, Height:c.height,
    ColorSpace:'DeviceRGB', BitsPerComponent:8, Filter:'DCTDecode' });
  const sm = d.get(N('SMask'));                         /* keep transparency mask attached */
  if(sm) stream.dict.set(N('SMask'), sm);
  const interp = d.get(N('Interpolate'));
  if(interp) stream.dict.set(N('Interpolate'), interp);
  return { stream, saved: raw.length - jpg.length };
}
async function compressPdfSmart(f, quality, maxDim){
  const orig = new Uint8Array(await f.arrayBuffer());
  const doc = await PDFLib.PDFDocument.load(orig, {ignoreEncryption:true, updateMetadata:false});
  const ctx = doc.context, N = PDFLib.PDFName.of;
  const images = [], smaskRefs = new Set();
  for(const [ref, obj] of ctx.enumerateIndirectObjects()){
    if(!(obj instanceof PDFLib.PDFRawStream)) continue;
    if(obj.dict.get(N('Subtype')) !== N('Image')) continue;
    const sm = obj.dict.get(N('SMask'));
    if(sm) smaskRefs.add(String(sm));
    images.push([ref, obj]);
  }
  let done = 0;
  for(const [ref, obj] of images){
    done++;
    toolBusy(`Optimizing picture ${done} of ${images.length}…`, 5 + done / images.length * 80);
    if(smaskRefs.has(String(ref))) continue;            /* transparency masks stay lossless */
    try{
      const res = await recompressImageStream(ctx, obj, quality, maxDim);
      if(res) ctx.assign(ref, res.stream);
    }catch(e){ console.warn('image skipped', e); }
  }
  toolBusy('Cleaning up & rebuilding…', 90);
  try{ doc.catalog.delete(N('Metadata')); }catch(e){}   /* XMP blob — often 10-100 KB */
  try{ doc.getPages().forEach(pg=> pg.node.delete(N('Thumb'))); }catch(e){}
  const out = await doc.save({ useObjectStreams: true });
  return { orig, out };
}

/* ================= PDF → WORD (rich) =================
   Keeps headings, bold, font sizes and embedded pictures — as far as the
   browser allows. Scanned PDFs fall back to OCR plain text. */
function rowsToParas(rows){
  if(!rows.length) return [];
  const gaps = [];
  for(let i = 1; i < rows.length; i++){ const g = rows[i-1].y - rows[i].y; if(g > 0.5 && g < 60) gaps.push(g); }
  gaps.sort((a,b)=> a - b);
  const modalGap = gaps.length ? gaps[Math.floor(gaps.length * 0.25)] : 14;   /* lower quartile ≈ intra-paragraph line gap */
  const sizeCount = {};
  rows.forEach(r=>{ const k = Math.round(r.size); sizeCount[k] = (sizeCount[k]||0) + r.text.length; });
  const body = +Object.keys(sizeCount).sort((a,b)=> sizeCount[b] - sizeCount[a])[0] || 11;
  const paras = [];
  let cur = null;
  rows.forEach((r, i)=>{
    const gap = i ? rows[i-1].y - r.y : 0;
    const sizeJump = cur && Math.abs(r.size - cur.size) > 1.4;
    if(!cur || gap > modalGap * 1.6 || gap < -5 || sizeJump){
      cur = { runs: [], size: r.size, bold: r.bold };
      paras.push(cur);
    }else{
      cur.bold = cur.bold && r.bold;
    }
    r.runs.forEach(run=>{
      const prev = cur.runs[cur.runs.length - 1];
      if(prev && prev.b === run.b && Math.abs(prev.sz - run.sz) < 0.6) prev.t += ' ' + run.t;
      else cur.runs.push({ t: run.t, b: run.b, sz: run.sz });
    });
  });
  paras.forEach(p=>{
    const len = p.runs.map(r=> r.t).join(' ').length;
    p.kind = p.size >= body * 1.55 ? 'h1' : p.size >= body * 1.18 ? 'h2' : (p.bold && len < 80 ? 'h3' : 'p');
    p.runs.forEach(r=>{ r.t = r.t.replace(/\s+/g, ' '); });
  });
  return paras;
}
/* embedded pictures of one pdf.js page → [{data(jpeg), w, h}] */
async function pageImages(page, cap){
  const out = [];
  try{
    const ops = await page.getOperatorList();
    const seen = new Set();
    for(let i = 0; i < ops.fnArray.length && out.length < (cap || 6); i++){
      const fn = ops.fnArray[i];
      if(fn !== pdfjsLib.OPS.paintImageXObject && fn !== pdfjsLib.OPS.paintJpegXObject) continue;
      const name = ops.argsArray[i] && ops.argsArray[i][0];
      if(!name || seen.has(name)) continue;
      seen.add(name);
      const img = await new Promise(res=>{
        try{ page.objs.has(name) ? res(page.objs.get(name)) : page.objs.get(name, res); }
        catch(e){ res(null); }
      });
      if(!img) continue;
      const c = document.createElement('canvas');
      const ctx2 = c.getContext('2d');
      if(typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap){
        if(img.width < 40 || img.height < 40) continue;
        c.width = img.width; c.height = img.height;
        ctx2.drawImage(img, 0, 0);
      }else if(img.bitmap && img.width >= 40 && img.height >= 40){
        c.width = img.width; c.height = img.height;
        ctx2.drawImage(img.bitmap, 0, 0);
      }else if(img.data && img.width >= 40 && img.height >= 40){
        const n = img.width * img.height, d = img.data;
        const rgba = new Uint8ClampedArray(n * 4);
        if(d.length === n * 4) rgba.set(d);
        else if(d.length === n * 3){ for(let q = 0; q < n; q++){ rgba[q*4] = d[q*3]; rgba[q*4+1] = d[q*3+1]; rgba[q*4+2] = d[q*3+2]; rgba[q*4+3] = 255; } }
        else if(d.length === n){ for(let q = 0; q < n; q++){ const g = d[q]; rgba[q*4] = g; rgba[q*4+1] = g; rgba[q*4+2] = g; rgba[q*4+3] = 255; } }
        else continue;
        c.width = img.width; c.height = img.height;
        c.getContext('2d').putImageData(new ImageData(rgba, img.width, img.height), 0, 0);
      }else continue;
      const blob = await new Promise(res=> c.toBlob(res, 'image/jpeg', .85));
      if(blob && blob.size > 2500) out.push({ data: new Uint8Array(await blob.arrayBuffer()), w: c.width, h: c.height });
    }
  }catch(e){ console.warn('image extraction', e); }
  return out;
}
async function pdfPagesRich(f){
  const doc = await openPdfjs(f);
  const pages = [];
  let totalChars = 0;
  for(let p = 1; p <= doc.numPages; p++){
    toolBusy(`Reading page ${p} of ${doc.numPages}…`, p / doc.numPages * 55);
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const rows = [];
    tc.items.forEach(it=>{
      if(!it.str || !it.str.trim()) return;
      const y = it.transform[5];
      let row = rows.find(r=> Math.abs(r.y - y) <= 2.5);
      if(!row){ row = { y, items: [] }; rows.push(row); }
      row.items.push(it);
    });
    rows.sort((a,b)=> b.y - a.y);
    const lineRows = rows.map(r=>{
      r.items.sort((a,b)=> a.transform[4] - b.transform[4]);
      const runs = [];
      r.items.forEach(it=>{
        const st = (tc.styles && tc.styles[it.fontName]) || {};
        const b = /bold|black|heavy|semi/i.test((st.fontFamily || '') + ' ' + (it.fontName || ''));
        const sz = Math.round((Math.hypot(it.transform[0], it.transform[1]) || 11) * 2) / 2;
        const t = it.str.replace(/\s+/g, ' ');
        const prev = runs[runs.length - 1];
        if(prev && prev.b === b && Math.abs(prev.sz - sz) < 0.6) prev.t += (prev.t.endsWith(' ') || t.startsWith(' ') ? '' : ' ') + t;
        else runs.push({ t, b, sz });
      });
      const text = runs.map(x=> x.t).join(' ').replace(/\s+/g, ' ').trim();
      totalChars += text.length;
      return { y: r.y, runs, text, size: Math.max(...runs.map(x=> x.sz)), bold: runs.every(x=> x.b) };
    }).filter(r=> r.text);
    const paras = rowsToParas(lineRows);
    const images = await pageImages(page, 6);
    pages.push({ page, paras, images });
  }
  if(totalChars < 60){                                  /* scanned — OCR plain text */
    const worker = await newOcrWorker();
    for(let i = 0; i < pages.length; i++){
      toolBusy(`Scanned PDF — recognising page ${i+1} of ${pages.length}…`, 55 + (i+1) / pages.length * 40);
      const vp = pages[i].page.getViewport({scale: 2});
      const c = document.createElement('canvas');
      c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
      await pages[i].page.render({canvasContext: c.getContext('2d'), viewport: vp}).promise;
      const res = await worker.recognize(c);
      pages[i].ocrText = (res.data.text || '').trim();
    }
    await worker.terminate();
    return { pages, scanned: true };
  }
  return { pages, scanned: false };
}
function buildDocxRich(pages){   /* [{paras:[{kind,runs:[{t,b,sz}]}], images:[{data,w,h}]}] */
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const media = [], imgRels = [];
  let body = '', imgN = 0;
  const runXml = r=>{
    const sz = Math.round(Math.min(40, Math.max(7, r.sz || 11)) * 2);   /* half-points */
    return `<w:r><w:rPr>${r.b ? '<w:b/>' : ''}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${esc(r.t)}</w:t></w:r>`;
  };
  const paraXml = p=>{
    const before = p.kind === 'h1' ? 280 : p.kind === 'h2' ? 220 : p.kind === 'h3' ? 180 : 0;
    return `<w:p><w:pPr><w:spacing w:before="${before}" w:after="120" w:line="288" w:lineRule="auto"/></w:pPr>${p.runs.map(runXml).join('')}</w:p>`;
  };
  const imgXml = im=>{
    imgN++;
    media.push({ name: `word/media/image${imgN}.jpg`, data: im.data });
    imgRels.push(`<Relationship Id="rIdImg${imgN}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${imgN}.jpg"/>`);
    let cx = im.w * 9525, cy = im.h * 9525;
    const maxW = 5760000;                               /* ~6 inches */
    if(cx > maxW){ cy = Math.round(cy * maxW / cx); cx = maxW; }
    return `<w:p><w:pPr><w:spacing w:before="120" w:after="120"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${100+imgN}" name="Picture ${imgN}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${100+imgN}" name="Picture ${imgN}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg${imgN}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  };
  pages.forEach((pg, i)=>{
    if(i > 0) body += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    (pg.paras || []).forEach(p=>{ body += paraXml(p); });
    (pg.images || []).forEach(im=>{ body += imgXml(im); });
  });
  const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"' +
    ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"' +
    ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>' +
    body + '<w:sectPr/></w:body></w:document>';
  const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Default Extension="jpg" ContentType="image/jpeg"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
  const relsRoot = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
  const docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + imgRels.join('') + '</Relationships>';
  return makeZip([
    {name: '[Content_Types].xml', data: contentTypes},
    {name: '_rels/.rels', data: relsRoot},
    {name: 'word/document.xml', data: documentXml},
    {name: 'word/_rels/document.xml.rels', data: docRels},
    ...media
  ], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
}


/* ---- visual page picker: thumbnails for Split / Remove (document preview) ---- */
async function thumbPicker(file, pageCount){
  const box = $("optThumbs"); if(!box) return;
  const sel = new Set();
  const sync = ()=>{ const inp = $("optRange"); if(inp) inp.value = [...sel].sort((a,b)=>a-b).map(n=>n+1).join(","); };
  try{
    const doc = await openPdfjs(file);
    const n = Math.min(doc.numPages, 60);
    for(let p = 1; p <= n; p++){
      if(!document.body.contains(box)) return;          /* options were closed */
      const page = await doc.getPage(p);
      const base = page.getViewport({scale: 1});
      const vp = page.getViewport({scale: 168 / base.width});
      const c = document.createElement("canvas");
      c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
      await page.render({canvasContext: c.getContext("2d"), viewport: vp}).promise;
      const b = document.createElement("button");
      b.type = "button"; b.className = "th";
      b.appendChild(c);
      const tag = document.createElement("small");
      tag.textContent = p;
      b.appendChild(tag);
      const idx = p - 1;
      b.addEventListener("click", ()=>{
        sel.has(idx) ? sel.delete(idx) : sel.add(idx);
        b.classList.toggle("sel", sel.has(idx));
        sync();
      });
      box.appendChild(b);
    }
    if(doc.numPages > n){
      const more = document.createElement("p");
      more.className = "thumbHint";
      more.textContent = "Previewing the first " + n + " of " + doc.numPages + " pages — type numbers for the rest.";
      box.after(more);
    }
  }catch(e){ console.warn("thumbs", e); }
}

/* --- the tools --- */
const TOOLS = [
  { ic:'🧩', name:'Merge PDFs', desc:'Combine several PDFs into one', run: async ()=>{
      const files = await pickFiles('.pdf', true);
      if(files.length < 2){ toolDone('Pick at least two PDF files.', false); return; }
      if(!(await ensurePdfLib())){ toolDone('Could not load the PDF engine — check internet.', false); return; }
      toolBusy('Merging…');
      const out = await PDFLib.PDFDocument.create();
      for(let i=0;i<files.length;i++){
        toolBusy(`Adding "${files[i].name}"…`, (i+1)/files.length*95);
        const src = await PDFLib.PDFDocument.load(await files[i].arrayBuffer(), {ignoreEncryption:true});
        (await out.copyPages(src, src.getPageIndices())).forEach(pg=> out.addPage(pg));
      }
      downloadBlob(new Blob([await out.save()], {type:'application/pdf'}), 'merged.pdf');
      toolDone(`Merged ${files.length} files → merged.pdf`);
  }},
  { ic:'✂️', name:'Split PDF', desc:'Extract chosen pages into a new PDF', run: async ()=>{
      const [f] = await pickFiles('.pdf'); if(!f) return;
      if(!(await ensurePdfLib())) { toolDone('Could not load the PDF engine.', false); return; }
      const src = await PDFLib.PDFDocument.load(await f.arrayBuffer(), {ignoreEncryption:true});
      toolOptions(`<label>Pages to keep from "${f.name}" (${src.getPageCount()} pages) — e.g. 1-3,7</label>
        <p class="thumbHint">Type a range, or tap pages below to pick them visually.</p>
        <div class="thumbPick" id="optThumbs"></div>
        <input id="optRange" placeholder="1-3,7">`, async ()=>{
        const idx = parseRange($('optRange').value, src.getPageCount());
        if(!idx.length){ toolDone('Enter which pages to keep, like 1-3,7', false); return; }
        toolBusy('Extracting…');
        const out = await PDFLib.PDFDocument.create();
        (await out.copyPages(src, idx)).forEach(pg=> out.addPage(pg));
        downloadBlob(new Blob([await out.save()], {type:'application/pdf'}), baseName(f)+' (pages).pdf');
        toolDone(`Saved ${idx.length} pages.`);
      });
      thumbPicker(f, src.getPageCount());
  }},
  { ic:'🗑', name:'Remove pages', desc:'Delete chosen pages from a PDF', run: async ()=>{
      const [f] = await pickFiles('.pdf'); if(!f) return;
      if(!(await ensurePdfLib())) { toolDone('Could not load the PDF engine.', false); return; }
      const src = await PDFLib.PDFDocument.load(await f.arrayBuffer(), {ignoreEncryption:true});
      toolOptions(`<label>Pages to REMOVE from "${f.name}" (${src.getPageCount()} pages) — e.g. 2,5-6</label>
        <p class="thumbHint">Type a range, or tap pages below to pick them visually.</p>
        <div class="thumbPick" id="optThumbs"></div>
        <input id="optRange" placeholder="2,5-6">`, async ()=>{
        const del = new Set(parseRange($('optRange').value, src.getPageCount()));
        if(!del.size){ toolDone('Enter which pages to remove.', false); return; }
        const keep = src.getPageIndices().filter(i=>!del.has(i));
        if(!keep.length){ toolDone('That would remove every page!', false); return; }
        toolBusy('Removing…');
        const out = await PDFLib.PDFDocument.create();
        (await out.copyPages(src, keep)).forEach(pg=> out.addPage(pg));
        downloadBlob(new Blob([await out.save()], {type:'application/pdf'}), baseName(f)+' (edited).pdf');
        toolDone(`Removed ${del.size} pages, kept ${keep.length}.`);
      });
      thumbPicker(f, src.getPageCount());
  }},
  { ic:'🔄', name:'Rotate PDF', desc:'Turn pages 90°, 180° or 270°', run: async ()=>{
      const [f] = await pickFiles('.pdf'); if(!f) return;
      if(!(await ensurePdfLib())) { toolDone('Could not load the PDF engine.', false); return; }
      toolOptions(`<label>Rotate all pages of "${f.name}" by</label>
        <select id="optAngle"><option value="90">90° clockwise</option><option value="180">180°</option><option value="270">90° anti-clockwise</option></select>`, async ()=>{
        toolBusy('Rotating…');
        const src = await PDFLib.PDFDocument.load(await f.arrayBuffer(), {ignoreEncryption:true});
        const ang = +$('optAngle').value;
        src.getPages().forEach(pg=> pg.setRotation(PDFLib.degrees((pg.getRotation().angle + ang) % 360)));
        downloadBlob(new Blob([await src.save()], {type:'application/pdf'}), baseName(f)+' (rotated).pdf');
        toolDone('Rotated and saved.');
      });
  }},
  { ic:'📉', name:'Compress PDF', desc:'Shrink file size — text stays selectable', run: async ()=>{
      const [f] = await pickFiles('.pdf'); if(!f) return;
      if(!(await ensurePdfLib())){ toolDone('Could not load the PDF engine — check internet.', false); return; }
      toolOptions(`<label>Compression for "${f.name}" (${(f.size/1048576).toFixed(1)} MB)</label>
        <select id="optQ">
          <option value="0.72|1600">Balanced — good quality</option>
          <option value="0.55|1200">Strong — smallest file</option>
          <option value="0.82|2400">Light — best quality</option>
        </select>
        <label style="margin-top:4px">Pictures inside the PDF are optimized in place — text stays sharp, selectable and searchable. If nothing can be shrunk, you keep the original file.</label>`, async ()=>{
        const [q, dim] = $('optQ').value.split('|').map(Number);
        toolBusy('Reading the PDF…', 3);
        const { orig, out } = await compressPdfSmart(f, q, dim);
        if(out.length < orig.length){
          downloadBlob(new Blob([out], {type:'application/pdf'}), baseName(f)+' (compressed).pdf');
          const pct = Math.round((1 - out.length / orig.length) * 100);
          toolDone(`${(orig.length/1048576).toFixed(2)} MB → ${(out.length/1048576).toFixed(2)} MB (${pct}% smaller). Text is still selectable.`);
        }else{
          downloadBlob(new Blob([orig], {type:'application/pdf'}), baseName(f)+' (compressed).pdf');
          toolDone('This PDF is already optimized — saved unchanged (never bigger, promise).');
        }
      });
  }},
  { ic:'🖼', name:'PDF → Images', desc:'Every page as a JPG picture', run: async ()=>{
      const [f] = await pickFiles('.pdf'); if(!f) return;
      const doc = await openPdfjs(f);
      const imgs = [];
      for(let p=1; p<=doc.numPages; p++){
        toolBusy(`Rendering page ${p} of ${doc.numPages}…`, p/doc.numPages*90);
        const page = await doc.getPage(p);
        const vp = page.getViewport({scale:2});
        const c = document.createElement('canvas');
        c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
        await page.render({canvasContext:c.getContext('2d'), viewport:vp}).promise;
        const blob = await new Promise(res=> c.toBlob(res, 'image/jpeg', .9));
        imgs.push({ name: `page-${String(p).padStart(2,'0')}.jpg`, data: new Uint8Array(await blob.arrayBuffer()) });
      }
      if(imgs.length === 1) downloadBlob(new Blob([imgs[0].data], {type:'image/jpeg'}), baseName(f)+'.jpg');
      else downloadBlob(makeZip(imgs, 'application/zip'), baseName(f)+' (images).zip');
      toolDone(imgs.length === 1 ? 'Image saved.' : `${imgs.length} images saved as a ZIP.`);
  }},
  { ic:'📄', name:'Images → PDF', desc:'Photos or pictures into one PDF', run: async ()=>{
      const files = await pickFiles('image/*', true);
      if(!files.length) return;
      if(!(await ensureJsPDF())){ toolDone('Could not load the PDF maker.', false); return; }
      const { jsPDF } = window.jspdf;
      let out = null;
      for(let i=0;i<files.length;i++){
        toolBusy(`Adding picture ${i+1} of ${files.length}…`, (i+1)/files.length*95);
        const c = await fileToCanvas(files[i], 2200);
        const pt = [c.width*0.75, c.height*0.75];
        if(!out) out = new jsPDF({unit:'pt', format:pt, orientation: pt[0]>pt[1]?'l':'p', compress:true});
        else out.addPage(pt, pt[0]>pt[1]?'l':'p');
        out.addImage(c.toDataURL('image/jpeg', .88), 'JPEG', 0, 0, pt[0], pt[1]);
      }
      out.save((files.length===1 ? baseName(files[0]) : 'pictures')+'.pdf');
      toolDone('PDF saved to downloads.');
  }},
  { ic:'📝', name:'PDF → Word', desc:'Editable .docx — headings, bold & pictures', run: async ()=>{
      const [f] = await pickFiles('.pdf'); if(!f) return;
      const rich = await pdfPagesRich(f);
      toolBusy('Building the Word file…', 96);
      if(rich.scanned){
        const pagesArr = rich.pages.map((pg,i)=>({ title: rich.pages.length>1 ? 'Page '+(i+1) : '', text: pg.ocrText || '' })).filter(p=>p.text.trim());
        if(!pagesArr.length){ toolDone('No readable text found in this PDF.', false); return; }
        downloadBlob(buildDocx(pagesArr), baseName(f)+'.docx');
        toolDone('Word file saved (scanned PDF — recognised text, no layout).');
      }else{
        const pages2 = rich.pages.filter(p=> (p.paras && p.paras.length) || (p.images && p.images.length));
        if(!pages2.length){ toolDone('No readable content found in this PDF.', false); return; }
        downloadBlob(buildDocxRich(pages2), baseName(f)+'.docx');
        toolDone('Word file saved — headings, bold text and pictures preserved.');
      }
  }},
  { ic:'🔤', name:'PDF → Text', desc:'Plain text file of everything', run: async ()=>{
      const [f] = await pickFiles('.pdf'); if(!f) return;
      const { pages } = await pdfPagesText(f, true);
      const txt = pages.map((pg,i)=> (pages.length>1 ? `\n===== Page ${i+1} =====\n` : '') + pg.text).join('\n').trim();
      if(!txt){ toolDone('No readable text found.', false); return; }
      downloadBlob(new Blob([txt], {type:'text/plain;charset=utf-8'}), baseName(f)+'.txt');
      toolDone('Text file saved.');
  }},
  { ic:'📃', name:'Word → PDF', desc:'A .docx as a clean PDF', run: async ()=>{
      const [f] = await pickFiles('.docx'); if(!f) return;
      if(!(await ensureJsPDF())){ toolDone('Could not load the PDF maker.', false); return; }
      toolBusy('Converting…');
      const html = (await mammoth.convertToHtml({arrayBuffer: await f.arrayBuffer()})).value;
      const div = document.createElement('div'); div.innerHTML = html;
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({unit:'pt', format:'a4'});
      const W = 515, M = 40; let y = M + 14;
      const put = (text, size, bold)=>{
        doc.setFont('helvetica', bold?'bold':'normal'); doc.setFontSize(size);
        doc.splitTextToSize(text, W).forEach(ln=>{
          if(y > 800){ doc.addPage(); y = M + 14; }
          doc.text(ln, M, y); y += size * 1.45;
        });
        y += size * 0.5;
      };
      div.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li').forEach(el=>{
        if(el.querySelector('p,li')) return;   /* container — its children are handled separately */
        const t = el.textContent.replace(/\s+/g,' ').trim();
        if(!t) return;
        const tag = el.tagName.toLowerCase();
        if(tag[0] === 'h') put(t, tag==='h1'?19:tag==='h2'?15.5:13, true);
        else put((tag==='li' ? '•  ' : '') + t, 11.5, false);
      });
      doc.save(baseName(f)+'.pdf');
      toolDone('PDF saved to downloads.');
  }},
  { ic:'🔍', name:'Make PDF searchable', desc:'OCR a scanned PDF — select & search its text', run: async ()=>{
      const [f] = await pickFiles('.pdf'); if(!f) return;
      if(!(await ensureJsPDF())){ toolDone('Could not load the PDF maker.', false); return; }
      const doc = await openPdfjs(f);
      const worker = await newOcrWorker();
      const { jsPDF } = window.jspdf;
      let out = null;
      for(let p=1; p<=doc.numPages; p++){
        toolBusy(`Recognising page ${p} of ${doc.numPages}… (this takes a moment)`, p/doc.numPages*95);
        const page = await doc.getPage(p);
        const vp = page.getViewport({scale:2});
        const c = document.createElement('canvas');
        c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
        await page.render({canvasContext:c.getContext('2d'), viewport:vp}).promise;
        const pt = [c.width*0.375, c.height*0.375];
        if(!out) out = new jsPDF({unit:'pt', format:pt, orientation: pt[0]>pt[1]?'l':'p', compress:true});
        else out.addPage(pt, pt[0]>pt[1]?'l':'p');
        out.addImage(c.toDataURL('image/jpeg', .85), 'JPEG', 0, 0, pt[0], pt[1]);
        try{
          const res = await worker.recognize(c, {}, {blocks:true});
          const S = 0.375;                              /* canvas px → pt (2× render, 72/96) */
          (res.data.blocks||[]).forEach(b=> (b.paragraphs||[]).forEach(par=> (par.lines||[]).forEach(l=>{
            if(!l.bbox) return;
            const lh = (l.bbox.y1 - l.bbox.y0) * S;
            const size = Math.max(4, lh * 0.78);
            const words = (l.words && l.words.length) ? l.words : [{ text: l.text, bbox: l.bbox, baseline: l.baseline }];
            words.forEach(wd=>{
              const t = (wd.text || '').trim();
              if(!t || !wd.bbox) return;
              out.setFontSize(size);
              const x = wd.bbox.x0 * S;
              const bl = wd.baseline || l.baseline;
              const yBase = bl ? ((bl.y0 + bl.y1) / 2) * S : (wd.bbox.y1 * S - lh * 0.22);
              /* stretch/squeeze each word to the width of the printed word — keeps the
                 selection highlight ON the ink instead of drifting left of it */
              const target = (wd.bbox.x1 - wd.bbox.x0) * S;
              const natural = out.getTextWidth(t);
              let cs = (t.length > 1 && natural > 0) ? (target - natural) / (t.length - 1) : 0;
              if(!(cs > -size * 0.12)) cs = 0;
              out.text(t, x, yBase, { renderingMode: 'invisible', charSpace: cs });
            });
          })));
        }catch(e){ console.warn('ocr page', p, e); }
      }
      try{ await worker.terminate(); }catch(e){}
      out.save(baseName(f)+' (searchable).pdf');
      toolDone('Searchable PDF saved — the text is now selectable and findable.');
  }}
];

/* build the grid + open/close */
(function(){
  const grid = $('toolGrid');
  TOOLS.forEach(t=>{
    const b = document.createElement('button');
    b.className = 'toolCard';
    b.innerHTML = `<span class="tIc">${t.ic}</span><b>${t.name}</b><small>${t.desc}</small>`;
    b.addEventListener('click', ()=> runTool(t.run));
    grid.appendChild(b);
  });
})();
function openTools(){ $('tools').style.display = 'block'; }
function closeTools(){ $('tools').style.display = 'none'; $('toolOpts').style.display='none'; $('toolStatus').style.display='none'; }
$('toolsBtn').addEventListener('click', openTools);
$('toolsClose').addEventListener('click', closeTools);
$('tools').addEventListener('click', e=>{ if(e.target === $('tools')) closeTools(); });
/* deep links: lexoraai.online/#tools and tools.lexoraai.online → dedicated tools page */
if((location.hash === '#tools' || /^tools\./i.test(location.hostname)) && !/tools\.html$/i.test(location.pathname))
  location.replace('tools.html');

