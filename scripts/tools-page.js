'use strict';
/* Lexora AI — tools page v2 (iLovePDF-style flow, our theme).
   Reuses engine helpers from app-tools.js (openPdfjs, ensurePdfLib, compressPdfSmart,
   pdfPagesText, pdfPagesRich, buildDocx, buildDocxRich, newOcrWorker, parseRange,
   baseName, downloadBlob) + shared.js (makeZip, fileToCanvas, ensureJsPDF). */

/* legacy panel from app-tools.js stays hidden; route its progress into our UI */
toolBusy = (msg, pct)=> setProg(msg, pct);
toolDone = ()=>{};

/* ===== ★ Premium config (Phase 4) — same Supabase as app-core.js + the
   deployed conversion gateway (worker-convert.js). Auth is OPTIONAL: anonymous
   users get the free daily pages; the token is only added when logged in. ===== */
const LX = {
  SUPABASE_URL: 'https://lgwqqytjqoenozhjhbkr.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_lK4DQ5LVguBYO-4afNbbVw_J_WLNlWv',
  CONVERT_URL: 'https://readaloud-convert.konarajeshkumar011.workers.dev'
};
const lxSb = (window.supabase && window.supabase.createClient)
  ? window.supabase.createClient(LX.SUPABASE_URL, LX.SUPABASE_ANON_KEY) : null;
async function lxToken(){
  if(!lxSb) return null;
  try{ const {data:{session:s}} = await lxSb.auth.getSession(); return s ? s.access_token : null; }
  catch(e){ return null; }
}
/* toast (app-wallet.js isn't loaded on this page — same look, #lxToast styles in theme.css) */
if(typeof window.lxToast !== 'function') window.lxToast = function(msg){
  let el = document.getElementById('lxToast');
  if(!el){ el = document.createElement('div'); el.id = 'lxToast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(window.lxToast._t);
  window.lxToast._t = setTimeout(()=> el.classList.remove('show'), 2800);
};

const CATS = [
  ['org','Organize PDF'], ['opt','Optimize PDF'], ['to','Convert to PDF'],
  ['from','Convert from PDF'], ['edit','Edit PDF'], ['sec','PDF Security'], ['ai','PDF Intelligence']
];

/* file-type grouping: the catalog is universal — PDF, Word, Image, Scan & AI */
const TYPES = [['pdf','PDF tools'],['word','Word & Office tools'],['img','Image tools'],['ai','Scan & AI']];
const TYPE = { merge:'pdf', split:'pdf', remove:'pdf', organize:'pdf', rotate:'pdf', compress:'pdf',
  repair:'pdf', ocr:'pdf', pdf2jpg:'pdf', pdf2word:'pdf', pdf2text:'pdf', pdf2md:'pdf',
  watermark:'pdf', pagenum:'pdf', unlock:'pdf', edit:'pdf', sign:'pdf', protect:'pdf', crop:'pdf',
  forms:'pdf', redact:'pdf', compare:'pdf', pdf2ppt:'pdf', pdf2excel:'pdf', pdfa:'pdf', html2pdf:'pdf',
  word2pdf:'word', word2txt:'word', word2md:'word', editword:'word', ppt2pdf:'word', excel2pdf:'word',
  jpg2pdf:'img', imgcompress:'img', imgresize:'img', img2text:'img',
  scan:'ai', summarize:'ai', translate:'ai' };
/* @cantoo/pdf-lib — a pdf-lib fork that adds AES password encryption (Protect PDF).
   Loaded lazily and captured into its own variable so it never disturbs the app's
   main PDFLib global (they share the same API surface). */
let cantooLib = null;
async function ensureCantoo(){
  if(cantooLib) return cantooLib;
  const prev = window.PDFLib;
  await new Promise((res, rej)=>{
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@cantoo/pdf-lib@2.7.1/dist/pdf-lib.min.js';
    s.onload = res;
    s.onerror = ()=> rej(new Error('could not load the encryption engine — check your connection'));
    document.head.appendChild(s);
  });
  cantooLib = window.PDFLib;
  if(prev) window.PDFLib = prev;   /* restore the app's original pdf-lib */
  return cantooLib;
}

const KIT = [
 {id:'merge', cat:'org', ic:'🧩', name:'Merge PDF', desc:'Combine PDFs in the order you want with the easiest PDF merger available.',
  accept:'.pdf', multiple:true, min:2, preview:'files', action:'Merge PDF',
  opts:()=>`<p class="sHint">To change the order of your PDFs, use the ◀ ▶ arrows on each file.</p>`,
  run: async (files)=>{
    if(!(await ensurePdfLib())) throw new Error('could not load the PDF engine');
    const out = await PDFLib.PDFDocument.create();
    for(let i=0;i<files.length;i++){
      setProg(`Adding "${files[i].name}"…`, (i+1)/files.length*90);
      const src = await PDFLib.PDFDocument.load(await files[i].file.arrayBuffer(), {ignoreEncryption:true});
      (await out.copyPages(src, src.getPageIndices())).forEach(p=> out.addPage(p));
    }
    saveOut(new Blob([await out.save()], {type:'application/pdf'}), 'merged.pdf');
    return `Merged ${files.length} files.`;
  }},
 {id:'split', cat:'org', ic:'✂️', name:'Split PDF', desc:'Separate one page or a whole set for easy conversion into independent PDF files.',
  accept:'.pdf', preview:'pages-select', action:'Split PDF',
  opts:()=>`<label class="f">Selected pages</label><input type="text" id="oRange" placeholder="tap pages or type e.g. 1-3,7">
    <label class="sCheck"><input type="checkbox" id="oZip"> Save each page as a separate PDF (ZIP)</label>`,
  run: async (files, ui)=>{
    if(!(await ensurePdfLib())) throw new Error('could not load the PDF engine');
    const src = await PDFLib.PDFDocument.load(await files[0].file.arrayBuffer(), {ignoreEncryption:true});
    const n = src.getPageCount();
    let idx = parseRange($('oRange').value, n);
    const zip = $('oZip').checked;
    if(!idx.length && zip) idx = src.getPageIndices();
    if(!idx.length) throw new Error('select at least one page (tap the thumbnails)');
    if(zip){
      const parts = [];
      for(let k=0;k<idx.length;k++){
        setProg(`Writing page ${idx[k]+1}…`, (k+1)/idx.length*90);
        const one = await PDFLib.PDFDocument.create();
        (await one.copyPages(src, [idx[k]])).forEach(p=> one.addPage(p));
        parts.push({name:`page-${String(idx[k]+1).padStart(2,'0')}.pdf`, data:new Uint8Array(await one.save())});
      }
      saveOut(makeZip(parts,'application/zip'), baseName(files[0].file)+' (split).zip');
      return `${idx.length} separate PDFs saved as a ZIP.`;
    }
    const out = await PDFLib.PDFDocument.create();
    (await out.copyPages(src, idx)).forEach(p=> out.addPage(p));
    saveOut(new Blob([await out.save()], {type:'application/pdf'}), baseName(files[0].file)+' (pages).pdf');
    return `Extracted ${idx.length} of ${n} pages.`;
  }},
 {id:'remove', cat:'org', ic:'🗑', name:'Remove pages', desc:'Delete chosen pages from a PDF — tap the pages you want gone.',
  accept:'.pdf', preview:'pages-select', action:'Remove pages',
  opts:()=>`<label class="f">Pages to remove</label><input type="text" id="oRange" placeholder="tap pages or type e.g. 2,5-6">`,
  run: async (files)=>{
    if(!(await ensurePdfLib())) throw new Error('could not load the PDF engine');
    const src = await PDFLib.PDFDocument.load(await files[0].file.arrayBuffer(), {ignoreEncryption:true});
    const del = new Set(parseRange($('oRange').value, src.getPageCount()));
    if(!del.size) throw new Error('select which pages to remove');
    const keep = src.getPageIndices().filter(i=> !del.has(i));
    if(!keep.length) throw new Error('that would remove every page!');
    const out = await PDFLib.PDFDocument.create();
    (await out.copyPages(src, keep)).forEach(p=> out.addPage(p));
    saveOut(new Blob([await out.save()], {type:'application/pdf'}), baseName(files[0].file)+' (edited).pdf');
    return `Removed ${del.size} pages, kept ${keep.length}.`;
  }},
 {id:'organize', cat:'org', ic:'🗂', name:'Organize PDF', desc:'Sort, reorder or delete the pages of your PDF however you like.',
  accept:'.pdf', preview:'pages-order', action:'Save new order',
  opts:()=>`<p class="sHint">Use ◀ ▶ to move a page, ✕ to delete it. The new order is saved as a fresh PDF.</p>`,
  run: async (files, ui)=>{
    if(!(await ensurePdfLib())) throw new Error('could not load the PDF engine');
    if(!ui.order.length) throw new Error('no pages left!');
    const src = await PDFLib.PDFDocument.load(await files[0].file.arrayBuffer(), {ignoreEncryption:true});
    const out = await PDFLib.PDFDocument.create();
    (await out.copyPages(src, ui.order)).forEach(p=> out.addPage(p));
    saveOut(new Blob([await out.save()], {type:'application/pdf'}), baseName(files[0].file)+' (organized).pdf');
    return `Saved with ${ui.order.length} pages in the new order.`;
  }},
 {id:'rotate', cat:'org', ic:'🔄', name:'Rotate PDF', desc:'Rotate your PDFs the way you need them. You can even rotate several at once!',
  accept:'.pdf', multiple:true, preview:'files', action:'Rotate PDF',
  opts:()=>`<label class="f">Rotate all pages by</label><select id="oAngle">
    <option value="90">90° clockwise</option><option value="180">180°</option><option value="270">90° anti-clockwise</option></select>`,
  run: async (files)=>{
    if(!(await ensurePdfLib())) throw new Error('could not load the PDF engine');
    const ang = +$('oAngle').value;
    const outs = [];
    for(let i=0;i<files.length;i++){
      setProg(`Rotating "${files[i].name}"…`, (i+1)/files.length*90);
      const src = await PDFLib.PDFDocument.load(await files[i].file.arrayBuffer(), {ignoreEncryption:true});
      src.getPages().forEach(p=> p.setRotation(PDFLib.degrees((p.getRotation().angle + ang) % 360)));
      outs.push({name: baseName(files[i].file)+' (rotated).pdf', data:new Uint8Array(await src.save())});
    }
    if(outs.length === 1) saveOut(new Blob([outs[0].data], {type:'application/pdf'}), outs[0].name);
    else saveOut(makeZip(outs,'application/zip'), 'rotated.zip');
    return `Rotated ${files.length === 1 ? 'the file' : files.length + ' files'} by ${ang}°.`;
  }},
 {id:'compress', cat:'opt', ic:'📉', name:'Compress PDF', desc:'Reduce file size while keeping text sharp, selectable and searchable.',
  accept:'.pdf', preview:'files', action:'Compress PDF', premium:true, ptool:'compress_hd',
  opts:()=>`<label class="f">Compression level</label><select id="oQ">
    <option value="0.72|1600">Balanced — good quality</option>
    <option value="0.55|1200">Strong — smallest file</option>
    <option value="0.82|2400">Light — best quality</option></select>
    <p class="sHint">Pictures inside the PDF are optimized in place. If nothing can be shrunk, you keep the original — never a bigger file.</p>`,
  run: async (files)=>{
    if(!(await ensurePdfLib())) throw new Error('could not load the PDF engine');
    const [q, dim] = $('oQ').value.split('|').map(Number);
    const { orig, out } = await compressPdfSmart(files[0].file, q, dim);
    const smaller = out.length < orig.length;
    saveOut(new Blob([smaller ? out : orig], {type:'application/pdf'}), baseName(files[0].file)+' (compressed).pdf');
    return smaller
      ? `${(orig.length/1048576).toFixed(2)} MB → ${(out.length/1048576).toFixed(2)} MB (${Math.round((1-out.length/orig.length)*100)}% smaller).`
      : 'Already optimized — saved unchanged (never bigger, promise).';
  }},
 {id:'repair', cat:'opt', ic:'🩹', name:'Repair PDF', desc:'Try to recover a damaged PDF: rebuild its structure so it opens again.',
  accept:'.pdf', preview:'files', action:'Repair PDF',
  opts:()=>`<p class="sHint">Best-effort: the file is parsed leniently and rebuilt with a clean structure. Badly corrupted files may still be unreadable.</p>`,
  run: async (files)=>{
    if(!(await ensurePdfLib())) throw new Error('could not load the PDF engine');
    setProg('Rebuilding the file…', 40);
    const src = await PDFLib.PDFDocument.load(await files[0].file.arrayBuffer(), {ignoreEncryption:true, throwOnInvalidObject:false});
    const bytes = await src.save({useObjectStreams:false});
    saveOut(new Blob([bytes], {type:'application/pdf'}), baseName(files[0].file)+' (repaired).pdf');
    return `Rebuilt ${src.getPageCount()} pages into a clean PDF.`;
  }},
 {id:'ocr', cat:'opt', ic:'🔍', name:'OCR PDF', desc:'Convert a scanned PDF into a searchable, selectable document.',
  accept:'.pdf', preview:'files', action:'Make it searchable', premium:true, ptool:'ocr_hd',
  opts:()=>`<p class="sHint">Each page is recognised on your device (English). The text is placed invisibly right on the scan — select it, search it, copy it. Takes a moment per page.</p>`,
  run: async (files)=>{
    if(!(await ensureJsPDF())) throw new Error('could not load the PDF maker');
    const doc = await openPdfjs(files[0].file);
    const worker = await newOcrWorker();
    const { jsPDF } = window.jspdf;
    let out = null;
    for(let p=1; p<=doc.numPages; p++){
      setProg(`Recognising page ${p} of ${doc.numPages}…`, p/doc.numPages*95);
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
        const S = 0.375;
        (res.data.blocks||[]).forEach(b=> (b.paragraphs||[]).forEach(par=> (par.lines||[]).forEach(l=>{
          if(!l.bbox) return;
          const lh = (l.bbox.y1 - l.bbox.y0) * S;
          const size = Math.max(4, lh * 0.78);
          const words = (l.words && l.words.length) ? l.words : [{text:l.text, bbox:l.bbox, baseline:l.baseline}];
          words.forEach(wd=>{
            const t = (wd.text||'').trim();
            if(!t || !wd.bbox) return;
            out.setFontSize(size);
            const bl = wd.baseline || l.baseline;
            const yB = bl ? ((bl.y0 + bl.y1)/2)*S : (wd.bbox.y1*S - lh*0.22);
            const target = (wd.bbox.x1 - wd.bbox.x0)*S, nat = out.getTextWidth(t);
            let cs = (t.length>1 && nat>0) ? (target-nat)/(t.length-1) : 0;
            if(!(cs > -size*0.12)) cs = 0;
            out.text(t, wd.bbox.x0*S, yB, {renderingMode:'invisible', charSpace:cs});
          });
        })));
      }catch(e){ console.warn('ocr page', p, e); }
    }
    try{ await worker.terminate(); }catch(e){}
    saveOut(out.output('blob'), baseName(files[0].file)+' (searchable).pdf');
    return 'The text is now selectable and findable.';
  }},
 {id:'jpg2pdf', cat:'to', ic:'📄', name:'JPG to PDF', desc:'Convert JPG, PNG and other images to PDF. Adjust margins in a click.',
  accept:'image/*', multiple:true, preview:'files', action:'Convert to PDF',
  opts:()=>`<label class="f">Margin</label><select id="oMargin">
    <option value="0">No margin</option><option value="24">Small</option><option value="48">Big</option></select>`,
  run: async (files)=>{
    if(!(await ensureJsPDF())) throw new Error('could not load the PDF maker');
    const m = +$('oMargin').value;
    const { jsPDF } = window.jspdf;
    let out = null;
    for(let i=0;i<files.length;i++){
      setProg(`Adding picture ${i+1} of ${files.length}…`, (i+1)/files.length*90);
      const c = await fileToCanvas(files[i].file, 2200);
      const pt = [c.width*0.75 + m*2, c.height*0.75 + m*2];
      if(!out) out = new jsPDF({unit:'pt', format:pt, orientation: pt[0]>pt[1]?'l':'p', compress:true});
      else out.addPage(pt, pt[0]>pt[1]?'l':'p');
      out.addImage(c.toDataURL('image/jpeg', .88), 'JPEG', m, m, c.width*0.75, c.height*0.75);
    }
    saveOut(out.output('blob'), (files.length===1 ? baseName(files[0].file) : 'pictures')+'.pdf');
    return `${files.length} picture${files.length>1?'s':''} in one PDF.`;
  }},
 {id:'word2pdf', cat:'to', ic:'📃', name:'Word to PDF', desc:'Make DOCX files easy to read by converting them to a clean PDF.',
  accept:'.docx', preview:'files', action:'Convert to PDF', premium:true, ptool:'word2pdf_hd',
  opts:()=>`<p class="sHint">Text, headings and lists are laid out as a clean, readable PDF.</p>`,
  run: async (files)=>{
    if(!(await ensureJsPDF())) throw new Error('could not load the PDF maker');
    setProg('Converting…', 30);
    const html = (await mammoth.convertToHtml({arrayBuffer: await files[0].file.arrayBuffer()})).value;
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
      if(el.querySelector('p,li')) return;
      const t = el.textContent.replace(/\s+/g,' ').trim();
      if(!t) return;
      const tag = el.tagName.toLowerCase();
      if(tag[0] === 'h') put(t, tag==='h1'?19:tag==='h2'?15.5:13, true);
      else put((tag==='li' ? '•  ' : '') + t, 11.5, false);
    });
    saveOut(doc.output('blob'), baseName(files[0].file)+'.pdf');
    return 'PDF saved.';
  }},
 {id:'pdf2jpg', cat:'from', ic:'🖼', name:'PDF to JPG', desc:'Convert each PDF page into a high-quality JPG picture.',
  accept:'.pdf', preview:'files', action:'Convert to JPG',
  opts:()=>`<p class="sHint">One picture per page. Several pages download as a ZIP.</p>`,
  run: async (files)=>{
    const doc = await openPdfjs(files[0].file);
    const imgs = [];
    for(let p=1; p<=doc.numPages; p++){
      setProg(`Rendering page ${p} of ${doc.numPages}…`, p/doc.numPages*90);
      const page = await doc.getPage(p);
      const vp = page.getViewport({scale:2});
      const c = document.createElement('canvas');
      c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
      await page.render({canvasContext:c.getContext('2d'), viewport:vp}).promise;
      const blob = await new Promise(res=> c.toBlob(res, 'image/jpeg', .9));
      imgs.push({name:`page-${String(p).padStart(2,'0')}.jpg`, data:new Uint8Array(await blob.arrayBuffer())});
    }
    if(imgs.length === 1) saveOut(new Blob([imgs[0].data], {type:'image/jpeg'}), baseName(files[0].file)+'.jpg');
    else saveOut(makeZip(imgs,'application/zip'), baseName(files[0].file)+' (images).zip');
    return imgs.length === 1 ? 'Image saved.' : `${imgs.length} images saved as a ZIP.`;
  }},
 {id:'pdf2word', cat:'from', ic:'📝', name:'PDF to Word', desc:'Editable .docx with headings, bold text and pictures preserved. Scans are OCR’d.',
  accept:'.pdf', preview:'files', action:'Convert to Word', premium:true, ptool:'pdf2word_hd',
  opts:()=>`<p class="sHint">Digital PDFs keep headings, bold and pictures. Scanned PDFs are recognised (OCR) into clean text.</p>`,
  run: async (files)=>{
    const rich = await pdfPagesRich(files[0].file);
    setProg('Building the Word file…', 96);
    if(rich.scanned){
      const arr = rich.pages.map((pg,i)=>({title: rich.pages.length>1 ? 'Page '+(i+1) : '', text: pg.ocrText || ''})).filter(p=>p.text.trim());
      if(!arr.length) throw new Error('no readable text found in this PDF');
      saveOut(buildDocx(arr), baseName(files[0].file)+'.docx');
      return 'Word file saved (scanned PDF — recognised text).';
    }
    const pages2 = rich.pages.filter(p=> (p.paras && p.paras.length) || (p.images && p.images.length));
    if(!pages2.length) throw new Error('no readable content found in this PDF');
    saveOut(buildDocxRich(pages2), baseName(files[0].file)+'.docx');
    return 'Word file saved — headings, bold and pictures preserved.';
  }},
 {id:'pdf2text', cat:'from', ic:'🔤', name:'PDF to Text', desc:'A plain .txt file with all the text — OCR kicks in for scans.',
  accept:'.pdf', preview:'files', action:'Extract text',
  run: async (files)=>{
    const { pages } = await pdfPagesText(files[0].file, true);
    const txt = pages.map((pg,i)=> (pages.length>1 ? `\n===== Page ${i+1} =====\n` : '') + pg.text).join('\n').trim();
    if(!txt) throw new Error('no readable text found');
    saveOut(new Blob([txt], {type:'text/plain;charset=utf-8'}), baseName(files[0].file)+'.txt');
    return 'Text file saved.';
  }},
 {id:'pdf2md', cat:'from', ic:'🔖', name:'PDF to Markdown', desc:'Turn a PDF into a clean .md file — perfect for notes, docs and LLMs.',
  accept:'.pdf', preview:'files', action:'Convert to Markdown',
  opts:()=>`<p class="sHint">Headings become #, ## — bold text becomes **bold**. Scans are OCR’d to plain text.</p>`,
  run: async (files)=>{
    const rich = await pdfPagesRich(files[0].file);
    setProg('Writing Markdown…', 96);
    let md = '';
    if(rich.scanned){
      md = rich.pages.map((pg,i)=> (rich.pages.length>1 ? `\n\n## Page ${i+1}\n\n` : '') + (pg.ocrText||'')).join('').trim();
    }else{
      md = rich.pages.map(pg=> (pg.paras||[]).map(p=>{
        const line = p.runs.map(r=> r.b ? '**'+r.t.trim()+'**' : r.t).join(' ').replace(/\*\*\s+\*\*/g,' ').trim();
        return p.kind === 'h1' ? '# '+line : p.kind === 'h2' ? '## '+line : p.kind === 'h3' ? '### '+line : line;
      }).join('\n\n')).join('\n\n---\n\n').trim();
    }
    if(!md) throw new Error('no readable text found');
    saveOut(new Blob([md], {type:'text/markdown;charset=utf-8'}), baseName(files[0].file)+'.md');
    return 'Markdown file saved.';
  }},
 {id:'watermark', cat:'edit', ic:'💧', name:'Add watermark', desc:'Stamp text over your PDF in seconds. Choose size, transparency and angle.',
  accept:'.pdf', preview:'files', action:'Add watermark',
  opts:()=>`<label class="f">Watermark text</label><input type="text" id="oWm" value="CONFIDENTIAL" maxlength="40">
    <label class="f">Size</label><select id="oWmSize"><option value="48">Normal</option><option value="72">Big</option><option value="32">Small</option></select>
    <label class="f">Transparency</label><select id="oWmOp"><option value="0.18">Subtle</option><option value="0.35">Visible</option><option value="0.6">Strong</option></select>
    <label class="sCheck"><input type="checkbox" id="oWmDiag" checked> Diagonal</label>
    <p class="sHint">English letters and numbers (standard PDF font).</p>`,
  run: async (files)=>{
    if(!(await ensurePdfLib())) throw new Error('could not load the PDF engine');
    const text = ($('oWm').value.replace(/[^\x20-\x7E]/g,'').trim() || 'CONFIDENTIAL');
    const size = +$('oWmSize').value, op = +$('oWmOp').value, diag = $('oWmDiag').checked;
    const src = await PDFLib.PDFDocument.load(await files[0].file.arrayBuffer(), {ignoreEncryption:true});
    const font = await src.embedFont(PDFLib.StandardFonts.HelveticaBold);
    const tw = font.widthOfTextAtSize(text, size);
    src.getPages().forEach((p,i)=>{
      setProg(`Stamping page ${i+1}…`, (i+1)/src.getPageCount()*85);
      const {width, height} = p.getSize();
      p.drawText(text, {
        x: width/2 - (diag ? tw*0.35 : tw/2),
        y: height/2 - (diag ? tw*0.35*0.7 : size/2),
        size, font, opacity: op, color: PDFLib.rgb(0.45,0.45,0.45),
        rotate: PDFLib.degrees(diag ? 45 : 0)
      });
    });
    saveOut(new Blob([await src.save()], {type:'application/pdf'}), baseName(files[0].file)+' (watermarked).pdf');
    return 'Watermark added to every page.';
  }},
 {id:'pagenum', cat:'edit', ic:'#️⃣', name:'Add page numbers', desc:'Add page numbers to a PDF with your choice of position and style.',
  accept:'.pdf', preview:'files', action:'Add page numbers',
  opts:()=>`<label class="f">Position</label><select id="oPnPos">
    <option value="bc">Bottom center</option><option value="br">Bottom right</option><option value="bl">Bottom left</option></select>
    <label class="f">Style</label><select id="oPnFmt"><option value="n">1, 2, 3…</option><option value="nofm">1 of N</option></select>`,
  run: async (files)=>{
    if(!(await ensurePdfLib())) throw new Error('could not load the PDF engine');
    const pos = $('oPnPos').value, fmt = $('oPnFmt').value;
    const src = await PDFLib.PDFDocument.load(await files[0].file.arrayBuffer(), {ignoreEncryption:true});
    const font = await src.embedFont(PDFLib.StandardFonts.Helvetica);
    const n = src.getPageCount();
    src.getPages().forEach((p,i)=>{
      const label = fmt === 'nofm' ? `${i+1} of ${n}` : String(i+1);
      const {width} = p.getSize();
      const tw = font.widthOfTextAtSize(label, 11);
      const x = pos === 'bc' ? width/2 - tw/2 : pos === 'br' ? width - tw - 36 : 36;
      p.drawText(label, {x, y: 24, size: 11, font, color: PDFLib.rgb(0.35,0.35,0.35)});
    });
    saveOut(new Blob([await src.save()], {type:'application/pdf'}), baseName(files[0].file)+' (numbered).pdf');
    return `Numbered ${n} pages.`;
  }},
 {id:'unlock', cat:'sec', ic:'🔓', name:'Unlock PDF', desc:'Remove print/copy locks, or take the password off a PDF you can open.',
  accept:'.pdf', preview:'files', action:'Unlock PDF',
  opts:()=>`<label class="f">Password <span style="color:var(--muted); font-weight:400">— only if the PDF needs one to open</span></label>
    <input type="password" id="oPwd" placeholder="Leave blank for print / copy locks" autocomplete="off" style="width:100%; background:var(--panel2); border:1px solid var(--line); color:var(--text); border-radius:9px; padding:11px 12px; font-size:14px; font-family:inherit; outline:none">
    <p class="sHint">For print/copy-locked PDFs, leave this blank. For a PDF that asks for a password to open (like a bank statement), type it here — it never leaves your device. That copy is rebuilt from the pages, so its text is no longer selectable.</p>`,
  run: async (files)=>{
    const pw = ($('oPwd') && $('oPwd').value.trim()) || '';
    const buf = await files[0].file.arrayBuffer();
    if(!pw){
      /* print/copy-locked (owner) PDFs — pdf-lib drops the restrictions, text stays selectable */
      try{
        if(!(await ensurePdfLib())) throw new Error('engine');
        setProg('Removing restrictions…', 45);
        const src = await PDFLib.PDFDocument.load(buf, {ignoreEncryption:true});
        saveOut(new Blob([await src.save()], {type:'application/pdf'}), baseName(files[0].file)+' (unlocked).pdf');
        return 'Removed the restrictions — your PDF is free to use.';
      }catch(e){
        throw new Error('This PDF needs a password to open (like a bank statement). Type the password in the box above, then tap Unlock PDF again.');
      }
    }
    /* password-to-open PDFs — decrypt locally with the password, rebuild an unlocked copy */
    if(!ensurePdfjs()) throw new Error('the PDF engine did not load — refresh and try again');
    setProg('Checking the password…', 8);
    const task = pdfjsLib.getDocument({
      data: buf.slice(0), password: pw,
      cMapUrl: new URL('lib/cmaps/', location.href).href, cMapPacked: true,
      standardFontDataUrl: new URL('lib/standard_fonts/', location.href).href, stopAtErrors: false
    });
    let doc;
    try{ doc = await task.promise; }
    catch(e){
      const msg = ((e && (e.name || e.message)) || '') + '';
      throw new Error(/password/i.test(msg) ? 'That password did not work — check it and try again.' : 'Could not open this PDF (' + (e.message || 'unknown') + ').');
    }
    if(!(await ensureJsPDF())) throw new Error('could not load the PDF maker');
    const { jsPDF } = window.jspdf;
    const n = doc.numPages;
    let out = null;
    for(let i = 1; i <= n; i++){
      setProg(`Unlocking page ${i} of ${n}…`, 10 + i/n*85);
      const page = await doc.getPage(i);
      const base = page.getViewport({scale:1});
      const vp = page.getViewport({scale:2});
      const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
      await page.render({canvasContext:c.getContext('2d'), viewport:vp}).promise;
      const img = c.toDataURL('image/jpeg', 0.92);
      const pt = [base.width, base.height];
      if(!out) out = new jsPDF({unit:'pt', format:pt, orientation: pt[0] > pt[1] ? 'l' : 'p', compress:true});
      else out.addPage(pt, pt[0] > pt[1] ? 'l' : 'p');
      out.addImage(img, 'JPEG', 0, 0, pt[0], pt[1]);
    }
    saveOut(out.output('blob'), baseName(files[0].file) + ' (unlocked).pdf');
    return `Password removed — saved an unlocked copy (${n} page${n>1?'s':''}).`;
  }},
 {id:'imgcompress', cat:'opt', ic:'🗜', name:'Compress image', desc:'Shrink JPG/PNG photos while keeping them sharp.',
  accept:'image/*', multiple:true, preview:'files', action:'Compress images',
  opts:()=>`<label class="f">Quality</label><select id="oIq"><option value="0.7">Balanced</option><option value="0.5">Strong — smallest</option><option value="0.85">Light — best quality</option></select>`,
  run: async (files)=>{
    const q = +$('oIq').value;
    const outs = [];
    for(let i=0;i<files.length;i++){
      setProg(`Compressing ${files[i].name}…`, (i+1)/files.length*90);
      const c = await fileToCanvas(files[i].file, 2200);
      const blob = await new Promise(r=> c.toBlob(r, 'image/jpeg', q));
      outs.push({name: baseName(files[i].file)+' (small).jpg', data:new Uint8Array(await blob.arrayBuffer())});
    }
    if(outs.length === 1) saveOut(new Blob([outs[0].data], {type:'image/jpeg'}), outs[0].name);
    else saveOut(makeZip(outs,'application/zip'), 'images (compressed).zip');
    const tot = files.reduce((n,f)=> n+f.size, 0), nout = outs.reduce((n,o)=> n+o.data.length, 0);
    return `${(tot/1048576).toFixed(1)} MB → ${(nout/1048576).toFixed(1)} MB.`;
  }},
 {id:'imgresize', cat:'opt', ic:'📐', name:'Resize image', desc:'Scale photos down to a maximum size in one click.',
  accept:'image/*', multiple:true, preview:'files', action:'Resize images',
  opts:()=>`<label class="f">Max width / height</label><select id="oRs"><option value="1920">1920 px</option><option value="1280">1280 px</option><option value="800">800 px</option><option value="480">480 px</option></select>`,
  run: async (files)=>{
    const m = +$('oRs').value;
    const outs = [];
    for(let i=0;i<files.length;i++){
      setProg(`Resizing ${files[i].name}…`, (i+1)/files.length*90);
      const c = await fileToCanvas(files[i].file, m);
      const blob = await new Promise(r=> c.toBlob(r, 'image/jpeg', .9));
      outs.push({name: baseName(files[i].file)+' ('+m+'px).jpg', data:new Uint8Array(await blob.arrayBuffer())});
    }
    if(outs.length === 1) saveOut(new Blob([outs[0].data], {type:'image/jpeg'}), outs[0].name);
    else saveOut(makeZip(outs,'application/zip'), 'images (resized).zip');
    return `Resized to max ${m}px.`;
  }},
 {id:'img2text', cat:'opt', ic:'👁', name:'Image to Text (OCR)', desc:'Read the text out of a photo or screenshot into a .txt file.',
  accept:'image/*', multiple:true, preview:'files', action:'Extract text',
  run: async (files)=>{
    const worker = await newOcrWorker();
    let txt = '';
    for(let i=0;i<files.length;i++){
      setProg(`Reading ${files[i].name}…`, (i+1)/files.length*92);
      const c = await fileToCanvas(files[i].file, 2600);
      const res = await worker.recognize(c);
      txt += (files.length>1 ? `\n===== ${files[i].name} =====\n` : '') + (res.data.text||'').trim() + '\n';
    }
    await worker.terminate();
    if(!txt.trim()) throw new Error('no readable text found — try a sharper photo');
    saveOut(new Blob([txt.trim()], {type:'text/plain;charset=utf-8'}), 'extracted text.txt');
    return 'Text file saved.';
  }},
 {id:'word2txt', cat:'from', ic:'🔤', name:'Word to Text', desc:'A plain .txt file from a .docx document.',
  accept:'.docx', preview:'files', action:'Extract text',
  run: async (files)=>{
    setProg('Reading the document…', 40);
    const r = await mammoth.extractRawText({arrayBuffer: await files[0].file.arrayBuffer()});
    if(!r.value.trim()) throw new Error('no text found');
    saveOut(new Blob([r.value], {type:'text/plain;charset=utf-8'}), baseName(files[0].file)+'.txt');
    return 'Text file saved.';
  }},
 {id:'word2md', cat:'from', ic:'🔖', name:'Word to Markdown', desc:'Convert .docx to clean Markdown — headings and lists preserved.',
  accept:'.docx', preview:'files', action:'Convert to Markdown',
  run: async (files)=>{
    setProg('Converting…', 40);
    const r = await mammoth.convertToMarkdown({arrayBuffer: await files[0].file.arrayBuffer()});
    if(!r.value.trim()) throw new Error('no content found');
    saveOut(new Blob([r.value], {type:'text/markdown;charset=utf-8'}), baseName(files[0].file)+'.md');
    return 'Markdown saved.';
  }},
 /* link tools */
 {id:'scan', cat:'org', ic:'📷', name:'Scan to PDF', desc:'Capture a paper with your camera — edges found and straightened automatically.', href:'scan.html'},
 {id:'summarize', cat:'ai', ic:'🤖', name:'AI Summarizer', desc:'Open any document in the reader and ask the companion to summarize or explain it.', href:'index.html'},
 /* coming soon (Phase 3 / conversion server) */
 {id:'edit', cat:'edit', ic:'✏️', name:'Edit PDF', desc:'Add text boxes or white-out anywhere on the page.',
  accept:'.pdf', preview:'edit', action:'Save PDF',
  opts:()=> editOptsHtml(), init:()=> initEditPanel(), run: async (files)=> runEdit(files)},
 {id:'sign', cat:'sec', ic:'✍️', name:'Sign PDF', desc:'Draw, type or import a signature, then drag it onto the page.',
  accept:'.pdf', preview:'sign', action:'Sign PDF',
  opts:()=> signOptsHtml(),
  init:()=> initSignPanel(),
  run: async (files)=> runSign(files)},
 {id:'protect', cat:'sec', ic:'🔒', name:'Protect PDF', desc:'Add a password so only people with it can open your PDF.',
  accept:'.pdf', preview:'files', action:'Protect PDF',
  opts:()=>`<label class="f">Password to open the PDF</label>
    <input type="password" id="oPPw" placeholder="Choose a password" autocomplete="new-password" style="width:100%; background:var(--panel2); border:1px solid var(--line); color:var(--text); border-radius:9px; padding:11px 12px; font-size:14px; font-family:inherit; outline:none; margin-bottom:10px">
    <label class="f">Confirm password</label>
    <input type="password" id="oPPw2" placeholder="Type it again" autocomplete="new-password" style="width:100%; background:var(--panel2); border:1px solid var(--line); color:var(--text); border-radius:9px; padding:11px 12px; font-size:14px; font-family:inherit; outline:none">
    <label class="sCheck" style="margin-top:10px"><input type="checkbox" id="oPPrint" checked> Allow printing</label>
    <label class="sCheck"><input type="checkbox" id="oPCopy" checked> Allow copying text</label>
    <p class="sHint">Anyone opening this PDF will be asked for the password. Keep it safe — it can't be recovered. Encryption runs entirely on your device.</p>`,
  run: async (files)=>{
    const pw = ($('oPPw') && $('oPPw').value) || '';
    if(pw.length < 3) throw new Error('choose a password of at least 3 characters');
    if(pw !== (($('oPPw2') && $('oPPw2').value) || '')) throw new Error('the two passwords do not match');
    setProg('Loading the encryption engine…', 15);
    const Lib = await ensureCantoo();
    setProg('Encrypting…', 55);
    const doc = await Lib.PDFDocument.load(await files[0].file.arrayBuffer(), { ignoreEncryption: true });
    const perms = { modifying: false };
    if(!$('oPPrint') || $('oPPrint').checked) perms.printing = 'highResolution';
    if(!$('oPCopy')  || $('oPCopy').checked)  perms.copying = true;
    doc.encrypt({ userPassword: pw, ownerPassword: pw, permissions: perms });
    setProg('Saving…', 88);
    saveOut(new Blob([await doc.save()], {type:'application/pdf'}), baseName(files[0].file) + ' (protected).pdf');
    return 'Password added — this PDF now asks for the password to open.';
  }},
 {id:'crop',      cat:'edit', ic:'✂', name:'Crop PDF', desc:'Crop margins or select an area of the pages.', soon:true},
 {id:'forms',     cat:'edit', ic:'🧾', name:'PDF Forms', desc:'Create and fill interactive PDF forms.', soon:true},
 {id:'redact',    cat:'sec', ic:'⬛', name:'Redact PDF', desc:'Permanently remove sensitive information.', soon:true},
 {id:'compare',   cat:'sec', ic:'🆚', name:'Compare PDF', desc:'Side-by-side comparison of two versions.', soon:true},
 {id:'pdf2ppt',   cat:'from', ic:'📽', name:'PDF to PowerPoint', desc:'Turn PDFs into editable PPTX slides.', soon:true, premium:true, ptool:'pdf2ppt'},
 {id:'pdf2excel', cat:'from', ic:'📊', name:'PDF to Excel', desc:'Pull tables from PDFs into spreadsheets.', soon:true, premium:true, ptool:'pdf2excel'},
 {id:'pdfa',      cat:'from', ic:'🗄', name:'PDF to PDF/A', desc:'ISO archive format for long-term storage.', soon:true, premium:true, ptool:'pdfa'},
 {id:'ppt2pdf',   cat:'to', ic:'📽', name:'PowerPoint to PDF', desc:'Make PPT and PPTX easy to view as PDF.',
  accept:'.ppt,.pptx', preview:'files', action:'Convert to PDF', premium:true, ptool:'ppt2pdf'},
 {id:'excel2pdf', cat:'to', ic:'📊', name:'Excel to PDF', desc:'Make spreadsheets easy to read as PDF.',
  accept:'.xls,.xlsx', preview:'files', action:'Convert to PDF', premium:true, ptool:'excel2pdf'},
 {id:'html2pdf',  cat:'to', ic:'🌐', name:'HTML to PDF', desc:'Convert webpages to PDF from a URL.', soon:true, premium:true, ptool:'html2pdf'},
 {id:'translate', cat:'ai', ic:'🌍', name:'Translate PDF', desc:'AI translation that keeps the layout intact.', soon:true, premium:true, ptool:'translate'},
 {id:'editword',  cat:'edit', ic:'📄', name:'Edit Word', desc:'Edit .docx documents right in the browser.', soon:true, premium:true, ptool:'editword'}
];

/* ================= state & views ================= */
let T = null;                       /* current tool */
let files = [];                     /* [{file, name, size}] */
let ui = { sel:new Set(), order:[], thumbs:[] };
let outFiles = [];                  /* done: [{blob, name}] */

const views = ['tvHome','tvTool','tvProg','tvDone'];
function show(v){ views.forEach(x=> $(x).style.display = x === v ? 'block' : 'none'); window.scrollTo(0,0); }
const human = b => b > 1048576 ? (b/1048576).toFixed(1)+' MB' : Math.max(1, Math.round(b/1024))+' KB';

/* ---------- catalog ---------- */
function renderHome(filter){
  const box = $('catalog');
  box.innerHTML = '';
  TYPES.forEach(([ty, label])=>{
    const items = KIT.filter(t=> (TYPE[t.id]||'pdf') === ty && (filter === 'premium' ? t.premium : (!filter || filter === 'all' || filter === ty)));
    if(!items.length) return;
    const h = document.createElement('h2'); h.className = 'catHead'; h.textContent = label;
    box.appendChild(h);
    const g = document.createElement('div'); g.className = 'toolGrid2';
    items.slice().sort((a,b)=> (a.soon?1:0) - (b.soon?1:0)).forEach(t=>{
      const b = document.createElement(t.href ? 'a' : 'button');
      b.className = 'toolCard2' + (t.soon ? ' soon' : '');
      if(t.href) b.href = t.href;
      b.innerHTML = `<span class="tIc2">${t.ic}</span><b>${t.premium ? '<span class="pxStar">★</span> ' : ''}${t.name}${t.soon ? ' <span class="soonPill">Soon</span>' : ''}</b><small>${t.desc}</small>`;
      if(!t.href && !t.soon) b.addEventListener('click', ()=> openTool(t.id));
      g.appendChild(b);
    });
    box.appendChild(g);
  });
}
document.querySelectorAll('.catChip').forEach(ch=>{
  ch.addEventListener('click', ()=>{
    document.querySelectorAll('.catChip').forEach(x=> x.classList.toggle('on', x === ch));
    renderHome(ch.dataset.cat);
  });
});

/* ============================================================
   Sign PDF — interactive editor: draw / type / import a signature,
   render the real PDF pages, drag & resize the signature onto them.
   ============================================================ */
let signMode = 'draw', signDrawn = false, signImport = null;
let signColor = '#111111', signFontFamily = '"Segoe Script","Brush Script MT","Snell Roundhand",cursive', signFontSize = 72;
let signDoc = null, signPage = 0, signItems = [];   /* {page, rx, ry, rw, img:{bytes,w,h,url}} */

function signOptsHtml(){
  return `<label class="f">Your signature</label>
    <div class="sigTabs">
      <button type="button" class="sigTab on" data-m="draw">✍ Draw</button>
      <button type="button" class="sigTab" data-m="type">⌨ Type</button>
      <button type="button" class="sigTab" data-m="import">🖼 Import</button>
    </div>
    <div class="sigColors">
      <span class="sigColLbl">Ink</span>
      <button type="button" class="sigColor on" data-c="#111111" style="background:#111111"></button>
      <button type="button" class="sigColor" data-c="#1a56db" style="background:#1a56db"></button>
      <button type="button" class="sigColor" data-c="#c0392b" style="background:#c0392b"></button>
      <label class="sigColPick" title="Custom colour"><input type="color" id="sigColorInput" value="#111111"></label>
    </div>
    <div class="sigBody" data-b="draw"><canvas id="sigPad" width="520" height="200"></canvas><button type="button" id="sigClear" class="btnMini">Clear</button></div>
    <div class="sigBody" data-b="type" style="display:none">
      <input type="text" id="sigText" placeholder="Your name" maxlength="40">
      <div class="sigRow2">
        <select id="sigFont">
          <option value='"Segoe Script","Brush Script MT","Snell Roundhand",cursive'>Signature</option>
          <option value='"Segoe Print","Bradley Hand","Comic Sans MS",cursive'>Handwriting</option>
          <option value='Georgia,"Times New Roman",serif'>Serif</option>
          <option value='Arial,Helvetica,sans-serif'>Sans</option>
        </select>
        <select id="sigFsize"><option value="56">Small</option><option value="72" selected>Medium</option><option value="96">Large</option></select>
      </div>
      <div id="sigPreview" class="sigPreview">Your name</div>
    </div>
    <div class="sigBody" data-b="import" style="display:none"><button type="button" id="sigPick" class="btnMini">Choose an image…</button><input type="file" id="sigImgIn" accept="image/*" hidden><div id="sigImgPrev" class="sigImgPrev">A PNG with a transparent background looks best.</div></div>
    <button type="button" id="sigPlace" class="goBig" style="margin-top:12px">➕ Add to page</button>
    <p class="sHint">Draw or type your signature, then drag it onto the page and pull the corner to resize.</p>`;
}

function initSignPanel(){
  signMode = 'draw'; signDrawn = false; signImport = null; signColor = '#111111';
  const pad = document.getElementById('sigPad');
  let ctx = null;
  if(pad){
    pad.style.background = '#fff';               /* white paper — visible on any theme */
    ctx = pad.getContext('2d');
    ctx.clearRect(0, 0, pad.width, pad.height);
    ctx.lineWidth = 3.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = signColor;
    let drawing = false, lx = 0, ly = 0;
    const at = e=>{ const r = pad.getBoundingClientRect(); return { x:(e.clientX - r.left) * (pad.width / r.width), y:(e.clientY - r.top) * (pad.height / r.height) }; };
    pad.addEventListener('pointerdown', e=>{ e.preventDefault(); drawing = true; const p = at(e); lx = p.x; ly = p.y; try{ pad.setPointerCapture(e.pointerId); }catch(_){} });
    pad.addEventListener('pointermove', e=>{ if(!drawing) return; e.preventDefault(); const p = at(e); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(p.x, p.y); ctx.stroke(); lx = p.x; ly = p.y; signDrawn = true; });
    window.addEventListener('pointerup', ()=>{ drawing = false; });
    const clr = document.getElementById('sigClear');
    if(clr) clr.onclick = ()=>{ ctx.clearRect(0, 0, pad.width, pad.height); signDrawn = false; };
  }
  document.querySelectorAll('.sigTab').forEach(b=> b.onclick = ()=>{
    document.querySelectorAll('.sigTab').forEach(x=> x.classList.toggle('on', x === b));
    signMode = b.dataset.m;
    document.querySelectorAll('.sigBody').forEach(x=> x.style.display = x.dataset.b === signMode ? 'block' : 'none');
  });
  /* ink colour (swatches + custom picker) — applies to drawn strokes and typed text */
  const setColor = c=>{ signColor = c; if(ctx) ctx.strokeStyle = c; renderTypePreview(); };
  document.querySelectorAll('.sigColor').forEach(b=> b.onclick = ()=>{
    document.querySelectorAll('.sigColor').forEach(x=> x.classList.toggle('on', x === b));
    setColor(b.dataset.c);
    const ci = document.getElementById('sigColorInput'); if(ci) ci.value = b.dataset.c;
  });
  const ci = document.getElementById('sigColorInput');
  if(ci) ci.oninput = ()=>{ document.querySelectorAll('.sigColor').forEach(x=> x.classList.remove('on')); setColor(ci.value); };
  const txt = document.getElementById('sigText'), font = document.getElementById('sigFont'), fsize = document.getElementById('sigFsize');
  if(txt) txt.oninput = renderTypePreview;
  if(font) font.onchange = ()=>{ signFontFamily = font.value; renderTypePreview(); };
  if(fsize) fsize.onchange = ()=>{ signFontSize = +fsize.value; renderTypePreview(); };
  const pick = document.getElementById('sigPick'), imgIn = document.getElementById('sigImgIn');
  if(pick) pick.onclick = ()=> imgIn.click();
  if(imgIn) imgIn.onchange = async e=>{
    const f = e.target.files[0]; if(!f) return;
    const img = await loadImg(URL.createObjectURL(f));
    const c = document.createElement('canvas'); c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    signImport = await canvasToSig(c);
    document.getElementById('sigImgPrev').innerHTML = `<img src="${signImport.url}" alt="signature">`;
  };
  const place = document.getElementById('sigPlace'); if(place) place.onclick = placeSignature;
  renderTypePreview();
}
function renderTypePreview(){
  const prev = document.getElementById('sigPreview'), txt = document.getElementById('sigText');
  if(!prev) return;
  prev.textContent = (txt && txt.value) || 'Your name';
  prev.style.fontFamily = signFontFamily;
  prev.style.fontStyle = 'italic';
  prev.style.fontSize = Math.round(signFontSize * 0.42) + 'px';
  prev.style.color = signColor;
}

function loadImg(src){ return new Promise((res, rej)=>{ const i = new Image(); i.onload = ()=> res(i); i.onerror = rej; i.src = src; }); }
async function canvasToSig(c){
  const blob = await new Promise(r=> c.toBlob(r, 'image/png'));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w: c.width, h: c.height, url: c.toDataURL('image/png') };
}
function trimCanvas(src){
  const w = src.width, h = src.height, d = src.getContext('2d').getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = 0, y1 = 0, found = false;
  for(let y = 0; y < h; y++) for(let x = 0; x < w; x++){ if(d[(y*w + x)*4 + 3] > 8){ found = true; if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; } }
  if(!found) return src;
  const p = 12;
  x0 = Math.max(0, x0 - p); y0 = Math.max(0, y0 - p); x1 = Math.min(w - 1, x1 + p); y1 = Math.min(h - 1, y1 + p);
  const ow = x1 - x0 + 1, oh = y1 - y0 + 1;
  const out = document.createElement('canvas'); out.width = ow; out.height = oh;
  out.getContext('2d').drawImage(src, x0, y0, ow, oh, 0, 0, ow, oh);
  return out;
}
async function currentSignature(){
  if(signMode === 'import'){ if(!signImport) throw new Error('choose an image for your signature'); return signImport; }
  if(signMode === 'type'){
    const text = (document.getElementById('sigText').value || '').trim();
    if(!text) throw new Error('type your name for the signature');
    const font = `italic ${signFontSize}px ${signFontFamily}`;
    const gap = Math.round(0.3 * signFontSize);
    const m = document.createElement('canvas').getContext('2d'); m.font = font;
    const c = document.createElement('canvas'); c.width = Math.ceil(m.measureText(text).width) + gap*2; c.height = Math.ceil(signFontSize * 1.6);
    const g = c.getContext('2d'); g.font = font; g.fillStyle = signColor; g.textBaseline = 'middle'; g.fillText(text, gap, c.height/2);
    return canvasToSig(c);
  }
  const p = document.getElementById('sigPad');
  if(!p || !signDrawn) throw new Error('draw your signature first');
  return canvasToSig(trimCanvas(p));
}

/* --- render the PDF page(s) with a placement layer --- */
async function renderSignEditor(){
  const main = $('tvMain');
  main.innerHTML = '<div class="tvLoad"><div class="lxSpin"></div><p class="thumbHint">Opening your PDF…</p></div>';
  signItems = []; signPage = 0;
  try{
    signDoc = await openPdfjs(files[0].file);
    main.innerHTML = '<div class="signNav" id="signNav"></div><div class="signStage" id="signStage"></div>';
    await renderSignPage();
  }catch(e){ main.innerHTML = '<p class="thumbHint">Could not open this PDF (' + e.message + ').</p>'; }
}
async function renderSignPage(){
  const stage = $('signStage'); stage.innerHTML = '';
  const page = await signDoc.getPage(signPage + 1);
  const base = page.getViewport({scale:1});
  const targetW = Math.min(stage.clientWidth || 600, 680);
  const vp = page.getViewport({scale: targetW / base.width});
  const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height); c.className = 'signPageCanvas';
  await page.render({canvasContext:c.getContext('2d'), viewport:vp}).promise;
  const holder = document.createElement('div'); holder.className = 'signHolder';
  holder.style.cssText = `position:relative; width:${c.width}px; height:${c.height}px; max-width:100%`;
  const layer = document.createElement('div'); layer.className = 'signLayer'; layer.id = 'signLayer';
  layer.style.cssText = 'position:absolute; inset:0';
  holder.appendChild(c); holder.appendChild(layer); stage.appendChild(holder);
  signItems.filter(it=> it.page === signPage).forEach(it=> addSignEl(it, layer));
  const nav = $('signNav');
  nav.innerHTML = signDoc.numPages > 1
    ? `<button type="button" class="btnMini" id="sPrev">◀ Prev</button><span>Page ${signPage + 1} / ${signDoc.numPages}</span><button type="button" class="btnMini" id="sNext">Next ▶</button>`
    : '';
  if(signDoc.numPages > 1){
    $('sPrev').onclick = ()=>{ if(signPage > 0){ signPage--; renderSignPage(); } };
    $('sNext').onclick = ()=>{ if(signPage < signDoc.numPages - 1){ signPage++; renderSignPage(); } };
  }
}
async function placeSignature(){
  if(!signDoc) return;
  let sig;
  try{ sig = await currentSignature(); }
  catch(e){ (typeof lxToast === 'function' ? lxToast : alert)(e.message); return; }
  const it = { page: signPage, rx: 0.55, ry: 0.08, rw: 0.32, img: sig };
  signItems.push(it);
  addSignEl(it, $('signLayer'));
}
function addSignEl(it, layer){
  if(!layer) return;
  const W = layer.clientWidth, H = layer.clientHeight, aspect = it.img.h / it.img.w;
  const el = document.createElement('div'); el.className = 'signItem';
  el.style.position = 'absolute';
  el.style.left = (it.rx * W) + 'px'; el.style.top = (it.ry * H) + 'px'; el.style.width = (it.rw * W) + 'px'; el.style.height = (it.rw * W * aspect) + 'px';
  el.innerHTML = `<img src="${it.img.url}" draggable="false"><span class="sHandle"></span><button type="button" class="sDel" title="Remove">✕</button>`;
  layer.appendChild(el);
  el.querySelector('.sDel').onclick = ()=>{ signItems = signItems.filter(x=> x !== it); el.remove(); };
  el.addEventListener('pointerdown', e=>{
    if(e.target.classList.contains('sHandle') || e.target.classList.contains('sDel')) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, ol = parseFloat(el.style.left), ot = parseFloat(el.style.top), w = layer.clientWidth, h = layer.clientHeight;
    const mv = ev=>{ let nl = Math.max(0, Math.min(w - el.offsetWidth, ol + ev.clientX - sx)), nt = Math.max(0, Math.min(h - el.offsetHeight, ot + ev.clientY - sy)); el.style.left = nl + 'px'; el.style.top = nt + 'px'; it.rx = nl / w; it.ry = nt / h; };
    const up = ()=>{ window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  });
  el.querySelector('.sHandle').addEventListener('pointerdown', e=>{
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, ow = el.offsetWidth, w = layer.clientWidth, asp = it.img.h / it.img.w;
    const mv = ev=>{ let nw = Math.max(40, Math.min(w - parseFloat(el.style.left), ow + ev.clientX - sx)); el.style.width = nw + 'px'; el.style.height = (nw * asp) + 'px'; it.rw = nw / w; };
    const up = ()=>{ window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  });
}
async function runSign(files){
  if(!signItems.length) throw new Error('add your signature to a page first — draw/type/import it, then “Add to page”');
  if(!(await ensurePdfLib())) throw new Error('could not load the PDF engine');
  setProg('Placing your signature…', 30);
  const src = await PDFLib.PDFDocument.load(await files[0].file.arrayBuffer(), {ignoreEncryption:true});
  const pages = src.getPages();
  for(const it of signItems){
    const png = await src.embedPng(it.img.bytes);
    const p = pages[it.page], sz = p.getSize();
    const w = it.rw * sz.width, h = w * (it.img.h / it.img.w);
    const x = it.rx * sz.width, y = sz.height - it.ry * sz.height - h;
    p.drawImage(png, { x, y, width: w, height: h });
  }
  setProg('Saving…', 90);
  saveOut(new Blob([await src.save()], {type:'application/pdf'}), baseName(files[0].file) + ' (signed).pdf');
  return `Signed ${new Set(signItems.map(i=> i.page)).size} page(s).`;
}

/* ============================================================
   Edit PDF — drop text boxes and white-out over the real pages.
   ============================================================ */
let editColor = '#111111', editSize = 16, editDoc = null, editPage = 0, editItems = [];

function editOptsHtml(){
  return `<label class="f">Add to the page</label>
    <div class="sigTabs">
      <button type="button" class="btnMini" id="edAddText" style="flex:1">➕ Text</button>
      <button type="button" class="btnMini" id="edAddWhite" style="flex:1">⬜ White-out</button>
    </div>
    <label class="f" style="margin-top:12px">Text colour</label>
    <div class="sigColors">
      <button type="button" class="sigColor on" data-c="#111111" style="background:#111111"></button>
      <button type="button" class="sigColor" data-c="#1a56db" style="background:#1a56db"></button>
      <button type="button" class="sigColor" data-c="#c0392b" style="background:#c0392b"></button>
      <label class="sigColPick"><input type="color" id="edColor" value="#111111"></label>
    </div>
    <label class="f">Text size</label>
    <select id="edSize"><option value="12">Small</option><option value="16" selected>Normal</option><option value="22">Large</option><option value="30">Huge</option></select>
    <p class="sHint">Tap ➕ Text to drop a box, then click it and type. ⬜ White-out covers something. Drag to move, pull the corner to resize. (Text uses English letters &amp; numbers.)</p>`;
}
function initEditPanel(){
  editColor = '#111111'; editSize = 16;
  document.querySelectorAll('.sigColor').forEach(b=> b.onclick = ()=>{
    document.querySelectorAll('.sigColor').forEach(x=> x.classList.toggle('on', x === b));
    editColor = b.dataset.c; const ci = document.getElementById('edColor'); if(ci) ci.value = b.dataset.c;
  });
  const ci = document.getElementById('edColor'); if(ci) ci.oninput = ()=>{ document.querySelectorAll('.sigColor').forEach(x=> x.classList.remove('on')); editColor = ci.value; };
  const sz = document.getElementById('edSize'); if(sz) sz.onchange = ()=>{ editSize = +sz.value; };
  const at = document.getElementById('edAddText'); if(at) at.onclick = addEditText;
  const aw = document.getElementById('edAddWhite'); if(aw) aw.onclick = addEditWhite;
}
async function renderEditEditor(){
  const main = $('tvMain');
  main.innerHTML = '<div class="tvLoad"><div class="lxSpin"></div><p class="thumbHint">Opening your PDF…</p></div>';
  editItems = []; editPage = 0;
  try{
    editDoc = await openPdfjs(files[0].file);
    main.innerHTML = '<div class="signNav" id="edNav"></div><div class="signStage" id="edStage"></div>';
    await renderEditPage();
  }catch(e){ main.innerHTML = '<p class="thumbHint">Could not open this PDF (' + e.message + ').</p>'; }
}
async function renderEditPage(){
  const stage = $('edStage'); stage.innerHTML = '';
  const page = await editDoc.getPage(editPage + 1);
  const base = page.getViewport({scale:1});
  const targetW = Math.min(stage.clientWidth || 600, 680);
  const scale = targetW / base.width;
  const vp = page.getViewport({scale});
  const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height); c.className = 'signPageCanvas';
  await page.render({canvasContext:c.getContext('2d'), viewport:vp}).promise;
  const holder = document.createElement('div'); holder.className = 'signHolder';
  holder.style.cssText = `position:relative; width:${c.width}px; height:${c.height}px; max-width:100%`;
  const layer = document.createElement('div'); layer.className = 'signLayer'; layer.id = 'edLayer';
  layer.style.cssText = 'position:absolute; inset:0';
  layer.dataset.scale = scale;
  holder.appendChild(c); holder.appendChild(layer); stage.appendChild(holder);
  editItems.filter(it=> it.page === editPage).forEach(it=> addEditEl(it, layer));
  const nav = $('edNav');
  nav.innerHTML = editDoc.numPages > 1
    ? `<button type="button" class="btnMini" id="edPrev">◀ Prev</button><span>Page ${editPage + 1} / ${editDoc.numPages}</span><button type="button" class="btnMini" id="edNext">Next ▶</button>`
    : '';
  if(editDoc.numPages > 1){
    $('edPrev').onclick = ()=>{ if(editPage > 0){ editPage--; renderEditPage(); } };
    $('edNext').onclick = ()=>{ if(editPage < editDoc.numPages - 1){ editPage++; renderEditPage(); } };
  }
}
function addEditText(){ if(!editDoc) return; const it = { type:'text', page: editPage, rx: 0.12, ry: 0.1, rw: 0.5, text: 'Type here', size: editSize, color: editColor }; editItems.push(it); addEditEl(it, $('edLayer')); }
function addEditWhite(){ if(!editDoc) return; const it = { type:'white', page: editPage, rx: 0.2, ry: 0.2, rw: 0.4, rh: 0.05 }; editItems.push(it); addEditEl(it, $('edLayer')); }
function addEditEl(it, layer){
  if(!layer) return;
  const W = layer.clientWidth, H = layer.clientHeight, scale = +layer.dataset.scale || 1;
  const el = document.createElement('div'); el.className = 'edItem edItem-' + it.type;
  el.style.position = 'absolute'; el.style.left = (it.rx * W) + 'px'; el.style.top = (it.ry * H) + 'px'; el.style.width = (it.rw * W) + 'px';
  if(it.type === 'white'){
    el.style.height = ((it.rh || 0.05) * H) + 'px'; el.style.background = '#fff'; el.style.border = '1px solid #bbb';
  }else{
    el.style.border = '1px dashed #e07a3f'; el.style.background = 'rgba(224,122,63,.05)';
    const inner = document.createElement('div'); inner.className = 'edText'; inner.contentEditable = 'true'; inner.textContent = it.text;
    inner.style.cssText = `outline:none; padding:2px 3px; white-space:pre-wrap; word-break:break-word; cursor:text; line-height:1.2; font-family:Helvetica,Arial,sans-serif; font-size:${it.size * scale}px; color:${it.color}`;
    inner.addEventListener('input', ()=>{ it.text = inner.textContent; });
    inner.addEventListener('pointerdown', e=> e.stopPropagation());
    el.appendChild(inner);
  }
  const del = document.createElement('button'); del.type = 'button'; del.className = 'sDel'; del.textContent = '✕'; el.appendChild(del);
  const handle = document.createElement('span'); handle.className = 'sHandle'; el.appendChild(handle);
  layer.appendChild(el);
  del.onclick = ()=>{ editItems = editItems.filter(x=> x !== it); el.remove(); };
  el.addEventListener('pointerdown', e=>{
    if(e.target.classList.contains('sHandle') || e.target.classList.contains('sDel') || e.target.classList.contains('edText')) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, ol = parseFloat(el.style.left), ot = parseFloat(el.style.top), w = layer.clientWidth, h = layer.clientHeight;
    const mv = ev=>{ let nl = Math.max(0, Math.min(w - el.offsetWidth, ol + ev.clientX - sx)), nt = Math.max(0, Math.min(h - el.offsetHeight, ot + ev.clientY - sy)); el.style.left = nl + 'px'; el.style.top = nt + 'px'; it.rx = nl / w; it.ry = nt / h; };
    const up = ()=>{ window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  });
  handle.addEventListener('pointerdown', e=>{
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, sy = e.clientY, ow = el.offsetWidth, oh = el.offsetHeight, w = layer.clientWidth, h = layer.clientHeight;
    const mv = ev=>{
      let nw = Math.max(30, Math.min(w - parseFloat(el.style.left), ow + ev.clientX - sx)); el.style.width = nw + 'px'; it.rw = nw / w;
      if(it.type === 'white'){ let nh = Math.max(12, Math.min(h - parseFloat(el.style.top), oh + ev.clientY - sy)); el.style.height = nh + 'px'; it.rh = nh / h; }
    };
    const up = ()=>{ window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  });
}
async function runEdit(files){
  if(!editItems.length) throw new Error('add a text box or white-out first');
  if(!(await ensurePdfLib())) throw new Error('could not load the PDF engine');
  setProg('Applying your edits…', 30);
  const src = await PDFLib.PDFDocument.load(await files[0].file.arrayBuffer(), {ignoreEncryption:true});
  const font = await src.embedFont(PDFLib.StandardFonts.Helvetica);
  const pages = src.getPages();
  const toRgb = h=>{ const n = parseInt(h.replace('#',''), 16) || 0; return PDFLib.rgb(((n>>16)&255)/255, ((n>>8)&255)/255, (n&255)/255); };
  for(const it of editItems){
    const p = pages[it.page], sz = p.getSize();
    if(it.type === 'white'){
      const w = it.rw * sz.width, h = (it.rh || 0.05) * sz.height;
      p.drawRectangle({ x: it.rx * sz.width, y: sz.height - it.ry * sz.height - h, width: w, height: h, color: PDFLib.rgb(1,1,1) });
    }else{
      const size = it.size, x = it.rx * sz.width, yTop = it.ry * sz.height;
      const text = (it.text || '').replace(/[^\x20-\x7E\n]/g, '');
      text.split('\n').forEach((ln, i)=> p.drawText(ln, { x, y: sz.height - yTop - size - i*size*1.2, size, font, color: toRgb(it.color) }));
    }
  }
  setProg('Saving…', 90);
  saveOut(new Blob([await src.save()], {type:'application/pdf'}), baseName(files[0].file) + ' (edited).pdf');
  return `Saved your edits (${editItems.length} item${editItems.length>1?'s':''}).`;
}

/* ============================================================
   ★ Premium engine (Phase 4) — quote → consent → convert through the
   Lexora conversion gateway. Anonymous users get the free daily pages
   (big files convert partially); logged-in users pay from the ₹ wallet
   past the free cap. The file is ONLY uploaded after explicit consent.
   ============================================================ */
let premOn = false;
const PEXT = { pdf2word_hd:'.docx', pdf2ppt:'.pptx', pdf2excel:'.xlsx' };
const fmtP = p=> '₹' + (Math.round(p || 0) / 100).toFixed(2).replace(/\.00$/, '');

function premToggleHtml(){
  return `<div class="pxToggle"><button type="button" class="pxOpt on" data-p="0">Free<small>on your device</small></button><button type="button" class="pxOpt" data-p="1">★ Premium<small>HD · server</small></button></div>`;
}
function premOptsHtml(){
  return `<p class="sHint">★ HD conversion on our secure server. The first 50 pages a day are free on this tool; after that it’s about ₹0.10 a page from your ₹ wallet. You’ll see the exact price and give consent before anything is uploaded.</p>`;
}
function wirePremToggle(){
  document.querySelectorAll('.pxOpt').forEach(b=> b.onclick = ()=>{ premOn = b.dataset.p === '1'; applyPremUi(); });
}
function applyPremUi(){
  const dropP = document.querySelector('#tvDrop .dropPriv');
  if(dropP) dropP.textContent = premOn
    ? '★ This premium tool runs on our secure server — you approve the exact price before anything is uploaded.'
    : '🔒 Files are processed on your device — nothing is uploaded.';
  const fo = document.getElementById('freeOpts'), po = document.getElementById('premOpts');
  if(fo) fo.style.display = premOn ? 'none' : 'block';
  if(po) po.style.display = premOn ? 'block' : 'none';
  if(T) $('goBtn').textContent = (premOn ? '★ ' : '') + T.action + ' →';
  document.querySelectorAll('.pxOpt').forEach(b=> b.classList.toggle('on', (b.dataset.p === '1') === premOn));
}

async function premPageCount(f){
  if(/\.pdf$/i.test(f.name)){
    try{ const d = await openPdfjs(f); return d.numPages; }catch(e){}
  }
  /* Office files: estimated (≈40 KB per page, clamped) — shown as an estimate */
  return Math.max(1, Math.min(5000, Math.round(f.size / 40000)));
}
function premOutName(f, ptool){
  if(ptool === 'compress_hd') return baseName(f) + ' (compressed).pdf';
  if(ptool === 'ocr_hd') return baseName(f) + ' (searchable).pdf';
  return baseName(f) + (PEXT[ptool] || '.pdf');
}

/* consent modal — resolves 'go' | 'free' | 'login' | 'topup' | 'cancel' */
function consentModal(t, q, est){
  return new Promise(res=>{
    const old = document.getElementById('pxModal'); if(old) old.remove();
    const wrap = document.createElement('div'); wrap.id = 'pxModal';
    const pgs = `${q.pages}${est ? ' (estimated)' : ''} page${q.pages > 1 ? 's' : ''}`;
    const lines = [
      `<p class="pxP">This tool runs on our <b>secure server</b>, so your file (${pgs}) is uploaded for this one job and sent right back. The free tools stay 100% on your device.</p>`,
      `<p class="pxP">First <b>${q.freeCap}</b> pages a day are free on this tool — you’ve used <b>${q.usedToday}</b> today.</p>`
    ];
    let btns = '';
    if(q.loggedIn){
      if(q.charge_paise > 0){
        lines.push(`<p class="pxP">This job: <b>${q.billablePages}</b> page${q.billablePages > 1 ? 's' : ''} over the free limit → <b>${fmtP(q.charge_paise)}</b> from your wallet (balance ${fmtP(q.wallet_paise)}).</p>`);
        if(!q.enough) lines.push(`<p class="pxP pxWarn">Not enough in your wallet — top up first.</p>`);
        btns = q.enough
          ? `<button class="goBig" data-a="go">Continue — ${fmtP(q.charge_paise)}</button>`
          : `<button class="goBig" data-a="topup">Top up the wallet</button>`;
      }else{
        lines.push(`<p class="pxP pxOk">This job is <b>free</b> — it fits in today’s free pages.</p>`);
        btns = `<button class="goBig" data-a="go">Continue — free</button>`;
      }
    }else if(q.convertPages <= 0){
      lines.push(`<p class="pxP pxWarn">Time’s up for today — your ${q.freeCap} free pages on this tool are used. Come back tomorrow… or log in and finish it all for a penny a page. ★</p>`);
      btns = `<button class="goBig" data-a="login">Log in to continue</button>`;
    }else if(q.partial){
      lines.push(`<p class="pxP">You’re not logged in — the first <b>${q.convertPages}</b> of ${q.pages} pages convert free today. Log in to do the whole file.</p>`);
      btns = `<button class="goBig" data-a="go">Convert the first ${q.convertPages} pages — free</button><button class="btn ghost" data-a="login">Log in for the full file</button>`;
    }else{
      lines.push(`<p class="pxP pxOk">This job is <b>free</b> — no login needed.</p>`);
      btns = `<button class="goBig" data-a="go">Continue — free</button>`;
    }
    if(t.run) btns += `<button class="btn ghost" data-a="free">Use the free version instead</button>`;
    btns += `<button class="btn ghost" data-a="cancel">Not now</button>`;
    wrap.innerHTML = `<div class="pxCard"><h3>★ Premium — one quick OK</h3>${lines.join('')}<div class="pxBtns">${btns}</div></div>`;
    document.body.appendChild(wrap);
    wrap.addEventListener('click', e=>{
      const b = e.target.closest('button[data-a]');
      if(b){ wrap.remove(); res(b.dataset.a); }
      else if(e.target === wrap){ wrap.remove(); res('cancel'); }
    });
  });
}

/* the full premium run — returns the done-message, or null if cancelled */
async function runPremium(t){
  const f = files[0].file;
  setProg('Counting pages…', 8);
  const isPdf = /\.pdf$/i.test(f.name);
  const pages = await premPageCount(f);
  const token = await lxToken();
  const auth = token ? { authorization: 'Bearer ' + token } : {};
  setProg('Checking today’s free pages…', 16);
  let q;
  try{
    const r = await fetch(LX.CONVERT_URL + '/quote', {
      method: 'POST',
      headers: Object.assign({ 'content-type': 'application/json' }, auth),
      body: JSON.stringify({ tool: t.ptool, pages })
    });
    q = await r.json();
  }catch(e){ throw new Error('could not reach the premium service — check your connection and try again'); }
  if(!q || !q.ok) throw new Error((q && q.error) || 'could not get a price for this job');

  const act = await consentModal(t, q, !isPdf);
  if(act === 'cancel') return null;
  if(act === 'login'){ location.href = 'login.html'; return null; }
  if(act === 'topup'){ window.open('index.html#plans', '_blank'); lxToast('Top up your wallet, then run the tool again.'); return null; }
  if(act === 'free'){ premOn = false; applyPremUi(); return await t.run(files, ui); }

  setProg('Uploading securely…', 35);
  const fd = new FormData();
  fd.append('file', f, f.name);
  fd.append('tool', t.ptool);
  fd.append('pages', String(pages));
  fd.append('consent', '1');
  let r;
  try{ r = await fetch(LX.CONVERT_URL + '/convert', { method: 'POST', headers: auth, body: fd }); }
  catch(e){ throw new Error('the upload failed — check your connection (you were not charged)'); }
  if(r.status === 503) throw new Error('★ Premium is launching very soon — use the free version for now.');
  if(r.status === 402){
    const j = await r.json().catch(()=> ({}));
    throw new Error('not enough in your wallet — this job needs ' + fmtP(j.charge_paise || 0) + '. Top up in Plans & wallet, then try again.');
  }
  if(r.status === 429) throw new Error('today’s free pages on this tool are done — come back tomorrow for more, or log in and pay a penny a page to finish today. ★');
  if(!r.ok){
    const j = await r.json().catch(()=> ({}));
    throw new Error((j && j.error) || 'the conversion failed on the server — you were not charged');
  }

  setProg('Converting on the server…', 75);
  const blob = await r.blob();
  const charge = parseInt(r.headers.get('X-Lexora-Charge') || '0') || 0;
  const partial = r.headers.get('X-Lexora-Partial') === '1';
  saveOut(blob, r.headers.get('X-Filename') || premOutName(f, t.ptool));
  let msg = charge > 0 ? `Done — ${fmtP(charge)} from your wallet.` : 'Done — free, within today’s pages.';
  if(partial) msg += ` Converted the first ${q.convertPages} of ${pages} pages — log in to do the whole file.`;
  return msg;
}

/* ---------- tool view ---------- */
function openTool(id){
  const t = KIT.find(x=> x.id === id);
  if(!t || t.soon || t.href) return;
  T = t; files = []; ui = { sel:new Set(), order:[], thumbs:[] }; outFiles = [];
  history.replaceState(null, '', '#' + id);
  $('tvName').textContent = t.name;
  $('tvDesc').textContent = t.desc;
  $('pickBtn').textContent = 'Select ' + (t.accept === 'image/*' ? 'images'
    : /\.pptx?/i.test(t.accept || '') ? 'PowerPoint file'
    : /\.xlsx?/i.test(t.accept || '') ? 'Excel file'
    : t.accept === '.docx' ? 'Word file' : 'PDF file' + (t.multiple ? 's' : ''));
  /* ★ premium: server-only tools start (and stay) premium; dual tools get a toggle */
  premOn = !!(t.premium && !t.run);
  const hasToggle = !!(t.ptool && t.run);
  $('tvSideOpts').innerHTML =
    (hasToggle ? premToggleHtml() : '') +
    (t.premium && !t.run ? '<div class="pxOnly">★ Premium tool — runs on our secure server, only with your consent.</div>' : '') +
    `<div id="freeOpts">${t.opts ? t.opts() : ''}</div><div id="premOpts" style="display:none">${premOptsHtml()}</div>`;
  if(t.init) t.init();                 /* wire interactive options (e.g. the signature pad) */
  if(hasToggle) wirePremToggle();
  $('goBtn').textContent = t.action + ' →';
  applyPremUi();
  $('fileIn').accept = t.accept || '';
  $('fileIn').multiple = !!t.multiple;
  $('tvDrop').style.display = 'block';
  $('tvWork').style.display = 'none';
  show('tvTool');
}
function backHome(){ T = null; history.replaceState(null, '', '#'); show('tvHome'); }
$('tvBack').addEventListener('click', backHome);
$('doneBack').addEventListener('click', backHome);

/* ---------- file intake ---------- */
function acceptFile(f){
  if(!T) return false;
  if(T.accept === 'image/*') return f.type.startsWith('image/');
  /* accept can be a comma list, e.g. ".ppt,.pptx" */
  return (T.accept || '').split(',').some(ext=> new RegExp(ext.trim().replace('.','\\.') + '$', 'i').test(f.name));
}
async function addFiles(list){
  const ok = [...list].filter(acceptFile);
  if(!ok.length) return;
  if(!T.multiple){ files = []; ui = { sel:new Set(), order:[], thumbs:[] }; }
  ok.forEach(f=> files.push({file:f, name:f.name, size:f.size}));
  if(!T.multiple) files = files.slice(0,1);
  $('tvDrop').style.display = 'none';
  $('tvWork').style.display = 'grid';
  await renderPreview();
}
$('pickBtn').addEventListener('click', ()=> $('fileIn').click());
$('addMore').addEventListener('click', ()=> $('fileIn').click());
$('fileIn').addEventListener('change', e=>{ addFiles(e.target.files); e.target.value = ''; });
['dragover','dragenter'].forEach(ev=> window.addEventListener(ev, e=>{
  if(!T) return;
  e.preventDefault();
  $('dropVeil').style.display = 'flex';
}));
$('dropVeil').addEventListener('dragleave', ()=> $('dropVeil').style.display = 'none');
window.addEventListener('drop', e=>{
  e.preventDefault();
  $('dropVeil').style.display = 'none';
  if(T && e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
});

/* ---------- previews ---------- */
async function fileThumb(f){
  try{
    if(f.type.startsWith('image/')){
      const c = await fileToCanvas(f, 300);
      return c;
    }
    if(/\.pdf$/i.test(f.name)){
      const doc = await openPdfjs(f);
      const page = await doc.getPage(1);
      const base = page.getViewport({scale:1});
      const vp = page.getViewport({scale: 180/base.width});
      const c = document.createElement('canvas');
      c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
      await page.render({canvasContext:c.getContext('2d'), viewport:vp}).promise;
      return c;
    }
  }catch(e){}
  return null;
}
async function renderPreview(){
  const main = $('tvMain');
  $('sideFiles').textContent = files.length + (files.length === 1 ? ' file' : ' files') + ' · ' + human(files.reduce((n,f)=> n+f.size, 0));
  $('addMore').style.display = T.multiple ? 'inline-block' : 'none';
  if(T.preview === 'sign'){ await renderSignEditor(); return; }
  if(T.preview === 'edit'){ await renderEditEditor(); return; }
  if(T.preview === 'files' || !T.preview){
    main.innerHTML = '';
    for(let i=0;i<files.length;i++){
      const card = document.createElement('div'); card.className = 'fCard';
      card.innerHTML = `<div class="fTh"><span class="lxSpin sm"></span></div><b title="${files[i].name}">${files[i].name}</b><small>${human(files[i].size)}</small>
        <div class="fBtns">${T.multiple && T.id==='merge' ? '<button class="mv" data-d="-1">◀</button><button class="mv" data-d="1">▶</button>' : ''}<button class="rm">✕</button></div>`;
      main.appendChild(card);
      card.querySelector('.rm').addEventListener('click', ()=>{
        files.splice([...main.children].indexOf(card), 1);
        files.length ? renderPreview() : ( $('tvDrop').style.display='block', $('tvWork').style.display='none');
      });
      card.querySelectorAll('.mv').forEach(mb=> mb.addEventListener('click', ()=>{
        const i2 = [...main.children].indexOf(card), j = i2 + (+mb.dataset.d);
        if(j < 0 || j >= files.length) return;
        [files[i2], files[j]] = [files[j], files[i2]];
        renderPreview();
      }));
      fileThumb(files[i].file).then(c=>{
        const th = card.querySelector('.fTh');
        if(c){ th.textContent=''; th.appendChild(c); } else th.textContent = '📄';
      });
    }
  }else{
    /* single-pdf page thumbnails */
    main.innerHTML = '<div class="tvLoad"><div class="lxSpin"></div><p class="thumbHint" id="thLoad">Loading page previews…</p></div>';
    try{
      const doc = await openPdfjs(files[0].file);
      const n = Math.min(doc.numPages, 100);
      ui.order = [...Array(doc.numPages).keys()];
      main.innerHTML = '';
      const grid = document.createElement('div'); grid.className = 'thumbPick big'; main.appendChild(grid);
      ui.thumbs = [];
      for(let p=1; p<=n; p++){
        const page = await doc.getPage(p);
        const base = page.getViewport({scale:1});
        const vp = page.getViewport({scale: 190/base.width});
        const c = document.createElement('canvas');
        c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
        await page.render({canvasContext:c.getContext('2d'), viewport:vp}).promise;
        ui.thumbs.push(c);
      }
      if(T.preview === 'pages-select') renderSelectThumbs(grid);
      else renderOrderThumbs(grid);
      if(doc.numPages > n){
        const more = document.createElement('p'); more.className='thumbHint';
        more.textContent = `Previewing the first ${n} of ${doc.numPages} pages — type numbers in the box for the rest.`;
        main.appendChild(more);
      }
    }catch(e){ main.innerHTML = '<p class="thumbHint">Could not preview this PDF (' + e.message + ') — you can still type page numbers.</p>'; }
  }
}
function renderSelectThumbs(grid){
  grid.innerHTML = '';
  const sync = ()=>{ const inp = $('oRange'); if(inp) inp.value = [...ui.sel].sort((a,b)=>a-b).map(x=>x+1).join(','); };
  ui.thumbs.forEach((c, i)=>{
    const b = document.createElement('button'); b.type='button'; b.className = 'th' + (ui.sel.has(i) ? ' sel' : '');
    b.appendChild(c);
    const tag = document.createElement('small'); tag.textContent = i+1; b.appendChild(tag);
    b.addEventListener('click', ()=>{
      ui.sel.has(i) ? ui.sel.delete(i) : ui.sel.add(i);
      b.classList.toggle('sel', ui.sel.has(i));
      sync();
    });
    grid.appendChild(b);
  });
}
function renderOrderThumbs(grid){
  grid.innerHTML = '';
  ui.order.forEach((pi, slot)=>{
    if(pi >= ui.thumbs.length) return;
    const b = document.createElement('div'); b.className = 'th ord';
    b.appendChild(ui.thumbs[pi]);
    const tag = document.createElement('small'); tag.textContent = (slot+1) + ' (was ' + (pi+1) + ')'; b.appendChild(tag);
    const bar = document.createElement('span'); bar.className = 'ordBar';
    bar.innerHTML = '<button data-a="l">◀</button><button data-a="x">✕</button><button data-a="r">▶</button>';
    b.appendChild(bar);
    bar.querySelectorAll('button').forEach(bt=> bt.addEventListener('click', ()=>{
      const s = ui.order.indexOf(pi);
      if(bt.dataset.a === 'x') ui.order.splice(s,1);
      else{
        const j = s + (bt.dataset.a === 'l' ? -1 : 1);
        if(j < 0 || j >= ui.order.length) return;
        [ui.order[s], ui.order[j]] = [ui.order[j], ui.order[s]];
      }
      renderOrderThumbs(grid);
    }));
    grid.appendChild(b);
  });
}

/* ---------- run ---------- */
function setProg(msg, pct){
  $('progTxt').textContent = msg || 'Working…';
  $('progFill').style.width = Math.round(pct == null ? 20 : pct) + '%';
}
function saveOut(blob, name){
  outFiles.push({blob, name});
  downloadBlob(blob, name);
}
$('goBtn').addEventListener('click', async ()=>{
  if(!T || !files.length) return;
  if(T.min && files.length < T.min){ alert('Pick at least ' + T.min + ' files.'); return; }
  /* option inputs stay live (hidden) in #tvSideOpts, so $(id) reads the user's values */
  show('tvProg');
  $('progName').textContent = T.name;
  const privLine = document.querySelector('#tvProg .dropPriv');
  if(privLine) privLine.textContent = premOn
    ? '★ Premium job — your file is converted on our secure server and sent right back.'
    : 'Everything happens in your browser — please keep this tab open.';
  setProg('Starting…', 5);
  try{
    const msg = premOn ? await runPremium(T) : await T.run(files, ui);
    if(msg === null){ show('tvTool'); return; }   /* premium flow cancelled */
    $('doneMsg').textContent = msg || 'Done!';
    $('doneName').textContent = T.name;
    $('again').onclick = ()=> outFiles.forEach(o=> downloadBlob(o.blob, o.name));
    $('again').style.display = outFiles.length ? 'inline-block' : 'none';
    show('tvDone');
  }catch(e){
    console.warn('tool failed', e);
    $('doneName').textContent = T.name;
    $('doneMsg').textContent = '⚠ ' + (e.message || 'something went wrong') + ' — go back and try again.';
    $('again').style.display = 'none';
    show('tvDone');
  }
});
$('doneRestart').addEventListener('click', ()=> openTool(T.id));

/* ---------- boot ---------- */
renderHome('all');
const boot = location.hash.replace('#','');
if(boot && KIT.some(t=> t.id === boot && !t.soon && !t.href)) openTool(boot);
else show('tvHome');

/* Sign PDF styles injected from JS so they stay in sync with this script even if
   pages.css is cached by the browser. */
(function injectSignCss(){
  var css = '.btnMini{background:var(--panel); border:1px solid var(--line); color:var(--text); border-radius:8px; padding:7px 14px; font-size:12.5px; cursor:pointer; font-family:inherit; transition:border-color .12s,color .12s}'
    + '.btnMini:hover{border-color:var(--accent); color:var(--accent)}'
    + '.sigTabs{display:flex; gap:6px; margin:0 0 10px}'
    + '.sigTab{flex:1; background:var(--panel); border:1px solid var(--line); color:var(--muted); border-radius:9px; padding:9px 6px; font-size:12.5px; font-weight:600; cursor:pointer; font-family:inherit; transition:.12s}'
    + '.sigTab:hover{border-color:var(--accent)}'
    + '.sigTab.on{border-color:var(--accent); color:#fff; background:var(--accent)}'
    + '.sigColors{display:flex; align-items:center; gap:8px; margin:0 0 12px}'
    + '.sigColLbl{color:var(--muted); font-size:12px; margin-right:2px}'
    + '.sigColor{width:22px; height:22px; border-radius:50%; border:2px solid var(--line); cursor:pointer; padding:0}'
    + '.sigColor.on{border-color:var(--accent); box-shadow:0 0 0 2px rgba(224,122,63,.35)}'
    + '.sigColPick{width:22px; height:22px; border-radius:50%; border:2px dashed var(--line); overflow:hidden; position:relative; cursor:pointer; display:inline-block}'
    + '.sigColPick input{position:absolute; inset:-6px; width:200%; height:200%; border:none; padding:0; cursor:pointer; background:none}'
    + '#sigPad{width:100%; height:165px; background:#fff; border:2px solid var(--accent); border-radius:12px; box-shadow:0 4px 18px rgba(0,0,0,.30); touch-action:none; cursor:crosshair; display:block; margin-bottom:8px}'
    + '.sigRow2{display:flex; gap:8px; margin:8px 0}'
    + '.sigRow2 select{flex:1}'
    + '.sigPreview{background:#fff; color:#111; border:1px solid var(--line); border-radius:10px; padding:14px 12px; text-align:center; min-height:58px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; margin-top:8px}'
    + '.sigImgPrev{background:var(--panel2); border:1px dashed var(--line); border-radius:10px; padding:12px; color:var(--muted); font-size:12px; text-align:center; margin-top:8px; min-height:58px; display:flex; align-items:center; justify-content:center}'
    + '.sigImgPrev img{max-width:100%; max-height:90px}'
    + '.signNav{display:flex; align-items:center; justify-content:center; gap:12px; margin-bottom:12px; color:var(--muted); font-size:13px}'
    + '.signStage{display:flex; justify-content:center}'
    + '.signHolder{position:relative; box-shadow:var(--shadow); border-radius:4px; overflow:hidden; max-width:100%}'
    + '.signPageCanvas{display:block; max-width:100%; height:auto}'
    + '.signLayer{position:absolute; inset:0}'
    + '.signItem{position:absolute; border:1.5px dashed var(--accent); cursor:move; touch-action:none; background:rgba(224,122,63,.06)}'
    + '.signItem img{width:100%; height:100%; display:block; pointer-events:none}'
    + '.signItem .sHandle{position:absolute; right:-8px; bottom:-8px; width:16px; height:16px; background:var(--accent); border:2px solid #fff; border-radius:50%; cursor:nwse-resize}'
    + '.signItem .sDel{position:absolute; top:-11px; right:-11px; width:22px; height:22px; background:var(--warn); color:#fff; border:none; border-radius:50%; font-size:11px; cursor:pointer; line-height:1; display:flex; align-items:center; justify-content:center}'
    + '.edItem{touch-action:none}'
    + '.edItem .sHandle{position:absolute; right:-8px; bottom:-8px; width:15px; height:15px; background:var(--accent); border:2px solid #fff; border-radius:50%; cursor:nwse-resize}'
    + '.edItem .sDel{position:absolute; top:-11px; right:-11px; width:21px; height:21px; background:var(--warn); color:#fff; border:none; border-radius:50%; font-size:11px; cursor:pointer; line-height:1; display:flex; align-items:center; justify-content:center; z-index:2}';
  var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
})();

/* ★ Premium styles — injected from JS (like the Sign/Edit CSS) so they survive
   pages.css browser caching. Black/white/orange, no gradients. */
(function injectPremCss(){
  var css = '.pxStar{color:var(--accent); font-size:.95em}'
    + '.pxToggle{display:flex; gap:6px; margin:0 0 12px}'
    + '.pxOpt{flex:1; background:var(--panel); border:1px solid var(--line); color:var(--muted); border-radius:9px; padding:8px 6px; font-size:12.5px; font-weight:600; cursor:pointer; font-family:inherit; display:flex; flex-direction:column; align-items:center; gap:2px; transition:border-color .12s, color .12s, background .12s}'
    + '.pxOpt small{font-weight:400; font-size:10.5px; opacity:.75}'
    + '.pxOpt:hover{border-color:var(--accent)}'
    + '.pxOpt.on{border-color:var(--accent); color:#fff; background:var(--accent)}'
    + '.pxOpt.on small{opacity:.9}'
    + '.pxOnly{background:var(--panel2); border:1px solid var(--line); border-left:3px solid var(--accent); border-radius:9px; padding:9px 11px; font-size:12.5px; color:var(--muted); margin:0 0 12px}'
    + '#pxModal{position:fixed; inset:0; background:rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center; z-index:1000; padding:16px}'
    + '.pxCard{background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:22px 20px; max-width:440px; width:100%; box-shadow:var(--shadow); max-height:90vh; overflow:auto}'
    + '.pxCard h3{margin:0 0 10px; font-size:17px; color:var(--text)}'
    + '.pxP{margin:0 0 10px; font-size:13.5px; line-height:1.5; color:var(--text)}'
    + '.pxP.pxWarn{color:var(--warn)}'
    + '.pxP.pxOk{color:var(--ok)}'
    + '.pxBtns{display:flex; flex-direction:column; gap:8px; margin-top:14px}'
    + '.pxBtns .goBig{margin:0}'
    + '.pxBtns .btn{width:100%}';
  var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
})();
