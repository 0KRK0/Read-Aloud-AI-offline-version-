'use strict';
/* Lexora AI — tools page v2 (iLovePDF-style flow, our theme).
   Reuses engine helpers from app-tools.js (openPdfjs, ensurePdfLib, compressPdfSmart,
   pdfPagesText, pdfPagesRich, buildDocx, buildDocxRich, newOcrWorker, parseRange,
   baseName, downloadBlob) + shared.js (makeZip, fileToCanvas, ensureJsPDF). */

/* legacy panel from app-tools.js stays hidden; route its progress into our UI */
toolBusy = (msg, pct)=> setProg(msg, pct);
toolDone = ()=>{};

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
  accept:'.pdf', preview:'files', action:'Compress PDF',
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
  accept:'.pdf', preview:'files', action:'Make it searchable',
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
  accept:'.docx', preview:'files', action:'Convert to PDF',
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
  accept:'.pdf', preview:'files', action:'Convert to Word',
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
 {id:'unlock', cat:'sec', ic:'🔓', name:'Unlock PDF', desc:'Remove PDF restrictions so you can use your file freely (best effort).',
  accept:'.pdf', preview:'files', action:'Unlock PDF',
  opts:()=>`<p class="sHint">Works on PDFs with owner/permission locks (no-print, no-copy). PDFs that need a password to even open cannot be unlocked here.</p>`,
  run: async (files)=>{
    if(!(await ensurePdfLib())) throw new Error('could not load the PDF engine');
    setProg('Removing restrictions…', 40);
    const src = await PDFLib.PDFDocument.load(await files[0].file.arrayBuffer(), {ignoreEncryption:true});
    const bytes = await src.save();
    saveOut(new Blob([bytes], {type:'application/pdf'}), baseName(files[0].file)+' (unlocked).pdf');
    return 'Saved without restrictions.';
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
 {id:'edit',      cat:'edit', ic:'✏️', name:'Edit PDF', desc:'Add text, images, shapes or annotations to a PDF.', soon:true},
 {id:'sign',      cat:'sec', ic:'✍️', name:'Sign PDF', desc:'Draw or type your signature and place it on the page.', soon:true},
 {id:'protect',   cat:'sec', ic:'🔒', name:'Protect PDF', desc:'Encrypt your PDF with a password.', soon:true},
 {id:'crop',      cat:'edit', ic:'✂', name:'Crop PDF', desc:'Crop margins or select an area of the pages.', soon:true},
 {id:'forms',     cat:'edit', ic:'🧾', name:'PDF Forms', desc:'Create and fill interactive PDF forms.', soon:true},
 {id:'redact',    cat:'sec', ic:'⬛', name:'Redact PDF', desc:'Permanently remove sensitive information.', soon:true},
 {id:'compare',   cat:'sec', ic:'🆚', name:'Compare PDF', desc:'Side-by-side comparison of two versions.', soon:true},
 {id:'pdf2ppt',   cat:'from', ic:'📽', name:'PDF to PowerPoint', desc:'Turn PDFs into editable PPTX slides.', soon:true},
 {id:'pdf2excel', cat:'from', ic:'📊', name:'PDF to Excel', desc:'Pull tables from PDFs into spreadsheets.', soon:true},
 {id:'pdfa',      cat:'from', ic:'🗄', name:'PDF to PDF/A', desc:'ISO archive format for long-term storage.', soon:true},
 {id:'ppt2pdf',   cat:'to', ic:'📽', name:'PowerPoint to PDF', desc:'Make PPT and PPTX easy to view as PDF.', soon:true},
 {id:'excel2pdf', cat:'to', ic:'📊', name:'Excel to PDF', desc:'Make spreadsheets easy to read as PDF.', soon:true},
 {id:'html2pdf',  cat:'to', ic:'🌐', name:'HTML to PDF', desc:'Convert webpages to PDF from a URL.', soon:true},
 {id:'translate', cat:'ai', ic:'🌍', name:'Translate PDF', desc:'AI translation that keeps the layout intact.', soon:true},
 {id:'editword',  cat:'edit', ic:'📄', name:'Edit Word', desc:'Edit .docx documents right in the browser.', soon:true}
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
    const items = KIT.filter(t=> (TYPE[t.id]||'pdf') === ty && (!filter || filter === 'all' || filter === ty));
    if(!items.length) return;
    const h = document.createElement('h2'); h.className = 'catHead'; h.textContent = label;
    box.appendChild(h);
    const g = document.createElement('div'); g.className = 'toolGrid2';
    items.slice().sort((a,b)=> (a.soon?1:0) - (b.soon?1:0)).forEach(t=>{
      const b = document.createElement(t.href ? 'a' : 'button');
      b.className = 'toolCard2' + (t.soon ? ' soon' : '');
      if(t.href) b.href = t.href;
      b.innerHTML = `<span class="tIc2">${t.ic}</span><b>${t.name}${t.soon ? ' <span class="soonPill">Soon</span>' : ''}</b><small>${t.desc}</small>`;
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

/* ---------- tool view ---------- */
function openTool(id){
  const t = KIT.find(x=> x.id === id);
  if(!t || t.soon || t.href) return;
  T = t; files = []; ui = { sel:new Set(), order:[], thumbs:[] }; outFiles = [];
  history.replaceState(null, '', '#' + id);
  $('tvName').textContent = t.name;
  $('tvDesc').textContent = t.desc;
  $('pickBtn').textContent = 'Select ' + (t.accept === 'image/*' ? 'images' : t.accept === '.docx' ? 'Word file' : 'PDF file' + (t.multiple ? 's' : ''));
  $('tvSideOpts').innerHTML = (t.opts ? t.opts() : '');
  $('goBtn').textContent = t.action + ' →';
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
  return new RegExp(T.accept.replace('.','\\.') + '$', 'i').test(f.name);
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
  setProg('Starting…', 5);
  try{
    const msg = await T.run(files, ui);
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
