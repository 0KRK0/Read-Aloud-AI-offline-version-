/* ---------- Rich text (Word) rendering: keep formatting + images,
     wrap each sentence in a tappable span for read-along highlighting ---------- */
const RICH_ABBR = /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|approx|dept|govt|e\.g|i\.e|No|Fig|pp|Vol|Rev|Hon|Smt|Sri|Shri|[A-Z])\.$/;
const RICH_BLOCK = 'p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote,figcaption';

/* Wrap the sentences of ONE block element in .sentSpan spans, preserving any
   bold/italic/links inside them. Works from the end backwards so earlier
   character offsets stay valid while the DOM is being split. */
function wrapBlockSentences(block){
  const tw = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
    acceptNode: n => (n.parentElement && n.parentElement.closest(RICH_BLOCK) === block)
      ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
  });
  const nodes = []; let full = '';
  while(tw.nextNode()){ nodes.push({n: tw.currentNode, start: full.length}); full += tw.currentNode.nodeValue; }
  if(!full.trim()) return;

  const bounds = [];
  let a = 0, m;
  const re = /[.!?]+["')\]]?(?=\s|$)/g;
  while((m = re.exec(full))){
    if(RICH_ABBR.test(full.slice(Math.max(0, m.index - 9), m.index + 1))) continue;
    bounds.push([a, m.index + m[0].length]);
    a = m.index + m[0].length;
  }
  if(full.slice(a).trim()) bounds.push([a, full.length]);

  const locate = off => {
    for(let i = nodes.length - 1; i >= 0; i--){
      if(off >= nodes[i].start) return {node: nodes[i].n, off: off - nodes[i].start};
    }
    return null;
  };
  for(let i = bounds.length - 1; i >= 0; i--){
    let [s, e] = bounds[i];
    while(s < e && /\s/.test(full[s])) s++;
    while(e > s && /\s/.test(full[e-1])) e--;
    if(e - s < 2) continue;
    const S = locate(s), E = locate(e);
    if(!S || !E) continue;
    try{
      const r = document.createRange();
      r.setStart(S.node, Math.min(S.off, S.node.nodeValue.length));
      r.setEnd(E.node, Math.min(E.off, E.node.nodeValue.length));
      const span = document.createElement('span');
      span.className = 'sentSpan';
      span.appendChild(r.extractContents());
      r.insertNode(span);
    }catch(err){ /* odd structure — that sentence just stays unwrapped */ }
  }
}

/* Render mammoth HTML (Word) as a real-looking document page */
function openRichText(name, html){
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
  wrap.className = 'textWrap richDoc';
  wrap.innerHTML = html;
  viewer.appendChild(wrap);

  wrap.querySelectorAll(RICH_BLOCK).forEach(b => wrapBlockSentences(b));

  /* index the sentence spans in reading (DOM) order */
  wrap.querySelectorAll('.sentSpan').forEach(span => {
    const st = span.textContent.replace(/\s+/g,' ').trim();
    if(st.length < 2){ span.classList.remove('sentSpan'); return; }
    const idx = lines.length;
    span.dataset.line = idx;
    lines.push({text: st, page: 1, el: span});
    sentences.push({text: st, page: 1, parts: [{line: idx, from: 0, to: st.length}]});
    lineToSent[idx] = idx;
  });
  if(!lines.length){ say('This Word file seems to have no readable text.'); return; }

  wrap.addEventListener('click', e => {
    const sel = window.getSelection();
    if(sel && sel.toString().trim()) return;
    const spanEl = e.target && e.target.closest ? e.target.closest('.sentSpan') : null;
    if(spanEl && spanEl.dataset.line !== undefined){ jumpTo(+spanEl.dataset.line); if(!playing) togglePlay(); }
  });
  updateProgress();
  afterDocOpen();
}

function afterDocOpen(){
  const label = docLabel || `"${docName}"`;
  if(companionAvailable()){
    awaitingStart = true;
    const greet = `Yep, all done — ${label} is ready! 🎉 Do you want me to read it to you, or do you have any doubts first? Ask me about a specific topic, line, or page — or just press ▶ Play and I will start from the beginning.`;
    say(greet); speakText(greet);
  }else{
    say(`${label.charAt(0).toUpperCase()+label.slice(1)} is ready. Starting now! Tap any sentence to read from there.`);
    playing = true; setPlayBtn(); speakLine(0);
  }
}

const observer = new IntersectionObserver(entries=>{
  entries.forEach(en=>{ if(en.isIntersecting) renderPage(+en.target.dataset.page); });
}, {root: null, rootMargin: '900px 0px'});

async function openPdf(file){
  if(!/pdf$/i.test(file.name) && file.type!=='application/pdf'){ say('That does not look like a PDF file.'); return; }
  if(!pdfjsLib) pdfjsLib = window['pdfjs-dist/build/pdf'];
  if(!pdfjsLib){ say('⚠️ My PDF engine did not load. Refresh with Ctrl+F5.'); return; }
  docName = file.name;
  docLabel = friendlyName(file.name, 'doc');
  say(`Opening ${docLabel} — one moment…`,'sys');
  try{
    const buf = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({
      data: buf,
      cMapUrl: new URL('lib/cmaps/', location.href).href,
      cMapPacked: true,
      standardFontDataUrl: new URL('lib/standard_fonts/', location.href).href,
      stopAtErrors: false
    });
    /* password-protected PDFs: ask, decrypt locally — password never leaves this device */
    loadingTask.onPassword = (giveBack, reason)=>{
      const p = window.prompt(reason === 2
        ? 'Wrong password. Please try again:'
        : 'This PDF is password protected. Enter the password (it stays on your device):');
      if(p === null){ say('Okay, cancelled — the PDF stays locked.'); throw new Error('Password entry cancelled'); }
      giveBack(p);
    };
    pdfDoc = await loadingTask.promise;
    numPages = pdfDoc.numPages;
    lines = []; sentences = []; lineToSent = []; current = -1; chatHistory = []; pages = [];
    stopSpeech(); hideMarker();
    const viewer = $('viewer');
    viewer.innerHTML = '';
    viewer.appendChild(markerEl);
    $('pageSel').innerHTML = '';
    $('dropZone').style.display='none';
    viewer.style.display='block';
    $('playbar').style.display='flex';
    $('pdfBtn').style.display='none'; $('wordBtn').style.display='none'; $('addPageBtn').style.display='none';

    computeFitScale();

    let skipped = 0;
    for(let p=1; p<=numPages; p++){
      if(numPages > 8) sayProgress(`📖 Preparing page ${p} of ${numPages}…`);
      try{
        const page = await pdfDoc.getPage(p);
        const vp1 = page.getViewport({scale:1});
        const pg = {num:p, page, w:vp1.width, h:vp1.height, rendered:false, spans:[], textContent:null, lineStart:lines.length};
        buildPageShell(pg);
        pages.push(pg);
        const tc = await page.getTextContent();
        pg.textContent = tc;
        extractLines(pg, tc);
        pg.lineEnd = lines.length;
        buildSentencesChunk(pg.lineStart, pg.lineEnd);
      }catch(e){ console.warn('page '+p, e); skipped++; }
    }
    removeProgress();
    if(skipped) say(`Note: ${skipped} page${skipped>1?'s':''} could not be read.`,'sys');
    buildPageOptions();
    updateProgress();

    if(lines.length === 0){ await ocrAll(); if(!lines.length) return; }

    if(companionAvailable()){
      awaitingStart = true;
      const greet = `Lovely — "${file.name}" is open: ${numPages} page${numPages>1?'s':''}. Where shall we start? Say "from the first page", a page number, or a topic and I will find it. You can also select any text on the page to get it explained.`;
      say(greet); speakText(greet);
    }else{
      say(`"${file.name}" — ${numPages} page${numPages>1?'s':''}. Starting now! Tap any sentence to read from there.`);
      playing = true; setPlayBtn(); speakLine(0);
    }
  }catch(err){
    console.error(err);
    removeProgress();
    say(`Sorry, I could not read that PDF. Technical reason: "${err && err.message ? err.message : err}".`);
  }
}

function computeFitScale(){
  const vw = $('viewer').clientWidth || window.innerWidth;
  const margin = window.innerWidth <= 900 ? 10 : 48;
  const baseW = pages.length ? pages[0].w : 612;
  fitScale = Math.min(2.5, Math.max(0.05, (vw - margin) / baseW));   /* .05 floor: camera photos are 3000+px wide */
}

function buildPageShell(pg){
  const wrap = document.createElement('div');
  wrap.className = 'pageWrap';
  wrap.dataset.page = pg.num;
  wrap.style.width = (pg.w * fitScale) + 'px';
  wrap.style.height = (pg.h * fitScale) + 'px';
  const load = document.createElement('div');
  load.className = 'pageLoading';
  load.textContent = 'Page ' + pg.num;
  wrap.appendChild(load);
  const num = document.createElement('div');
  num.className = 'pageNum'; num.textContent = pg.num;
  wrap.appendChild(num);
  $('viewer').appendChild(wrap);
  pg.wrap = wrap;
  observer.observe(wrap);
}

/* group text items into visual lines, keeping geometry.
   Handles multi-column layouts (e.g. left question label + right answer block):
   the column gutter is detected from the alignment of the right column, each row
   is split at that gutter, and lines are re-ordered so every left label reads
   before its own answer block — instead of being stitched into one line with the
   answer text sitting beside it. */
function buildSeg(group, rowY, col, out){
  if(!group.length) return;
  const text = group.map(o=>o.it.str).join(' ').replace(/\s+/g,' ').trim();
  if(!text) return;
  let x=1e9, xEnd=-1e9, h=0, yBase=1e9;
  group.forEach(o=>{
    const tr = o.it.transform;
    const fh = Math.hypot(tr[2],tr[3]) || Math.hypot(tr[0],tr[1]) || 10;
    x = Math.min(x, tr[4]);
    xEnd = Math.max(xEnd, tr[4] + (o.it.width || 0));
    h = Math.max(h, fh);
    yBase = Math.min(yBase, tr[5]);
  });
  out.push({text, x, xEnd, y:yBase, h, items:group.map(o=>o.idx), rowY, col});
}

function extractLines(pg, tc){
  const rows = {};
  tc.items.forEach((it, idx)=>{
    if(!it.str || !it.str.trim()) return;
    const y = Math.round(it.transform[5]);
    let key = Object.keys(rows).find(k=>Math.abs(k-y)<=2);
    if(key===undefined){ key=y; rows[key]=[]; }
    rows[key].push({it, idx});
  });
  const rowKeys = Object.keys(rows).map(Number).sort((a,b)=>b-a);

  /* 1) detect a two-column gutter from where the right column consistently starts */
  let leftMargin = 1e9;
  tc.items.forEach(it=>{ if(it.str && it.str.trim()) leftMargin = Math.min(leftMargin, it.transform[4]); });
  const buckets = {};
  tc.items.forEach(it=>{ if(!it.str||!it.str.trim()) return; const b = Math.round(it.transform[4]/10)*10; buckets[b] = (buckets[b]||0)+1; });
  let colX = null, best = 0;
  Object.keys(buckets).map(Number).forEach(b=>{
    if(b > leftMargin + 40 && buckets[b] > best){ best = buckets[b]; colX = b; }   // strongest right-of-margin start cluster
  });
  let margin = 0;
  if(colX !== null){
    margin = Math.max(6, (colX - leftMargin) * 0.15);
    let straddle = 0;   // rows with content on BOTH sides = real two-column layout
    rowKeys.forEach(y=>{
      const xs = rows[y].map(o=>o.it.transform[4]);
      if(xs.some(x=>x < colX-margin) && xs.some(x=>x >= colX-margin)) straddle++;
    });
    if(straddle < 2) colX = null;
  }

  /* 2) build segments (split at the gutter when two-column) */
  const segs = [];
  rowKeys.forEach(y=>{
    const arr = rows[y].sort((a,b)=>a.it.transform[4]-b.it.transform[4]);
    if(colX === null){
      buildSeg(arr, y, 0, segs);
    }else{
      const L = arr.filter(o=>o.it.transform[4] <  colX-margin);
      const R = arr.filter(o=>o.it.transform[4] >= colX-margin);
      buildSeg(L, y, 0, segs);
      buildSeg(R, y, 1, segs);
    }
  });

  /* 3) order into reading order — for two-column, read each left label then its
        answer block (a "band"): a band starts when a left run begins after rows
        that had no left content, and includes the right rows beneath it. */
  let ordered;
  if(colX !== null){
    const byRow = {};
    segs.forEach(s=>{ (byRow[s.rowY] = byRow[s.rowY] || []).push(s); });
    ordered = [];
    let bandLeft = [], bandRight = [], prevHadLeft = false;
    const closeBand = ()=>{
      bandLeft.forEach((s,i)=>{ if(i===0) s.brk = true; ordered.push(s); });
      bandRight.forEach((s,i)=>{ if(i===0) s.brk = true; ordered.push(s); });
      bandLeft = []; bandRight = [];
    };
    Object.keys(byRow).map(Number).sort((a,b)=>b-a).forEach(ry=>{
      const list = byRow[ry].sort((a,b)=>a.x-b.x);
      const hasLeft = list.some(s=>s.col===0);
      if(hasLeft && !prevHadLeft && (bandLeft.length || bandRight.length)) closeBand();
      list.forEach(s=>{ (s.col===0 ? bandLeft : bandRight).push(s); });
      prevHadLeft = hasLeft;
    });
    closeBand();
  } else {
    ordered = segs;  // single column: already top-to-bottom, left-to-right
  }

  ordered.forEach(s=>{
    lines.push({text:s.text, page:pg.num, x:s.x, xEnd:s.xEnd, y:s.y, h:s.h, items:s.items, brk:!!s.brk});
  });
}

function buildPageOptions(){
  const sel = $('pageSel');
  sel.innerHTML = '';
  for(let p=1; p<=numPages; p++){
    const o = document.createElement('option');
    o.value = p; o.textContent = 'Page ' + p;
    sel.appendChild(o);
  }
}

/* ---------------- Lazy page rendering ---------------- */
const renderedSet = new Set();
async function renderPage(n){
  const pg = pages[n-1];
  if(!pg || pg.isImage || pg.rendered || pg.rendering) return;
  pg.rendering = true;
  try{
    const vp = pg.page.getViewport({scale: fitScale});
    const D = dpr();
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width * D);
    canvas.height = Math.ceil(vp.height * D);
    canvas.style.width = vp.width + 'px';
    canvas.style.height = vp.height + 'px';
    const ctx = canvas.getContext('2d');
    await pg.page.render({canvasContext: ctx, viewport: vp, transform: D!==1 ? [D,0,0,D,0,0] : undefined}).promise;
    if(pg.canvas) pg.canvas.remove();
    pg.wrap.insertBefore(canvas, pg.wrap.firstChild);
    pg.canvas = canvas;
    const ld = pg.wrap.querySelector('.pageLoading');
    if(ld) ld.style.display = 'none';

    /* text layer for Adobe-like selection */
    if(pg.textContent && pg.textContent.items.length){
      if(pg.textLayer) pg.textLayer.remove();
      const tl = document.createElement('div');
      tl.className = 'textLayer';
      tl.style.setProperty('--scale-factor', vp.scale);
      tl.style.width = vp.width + 'px';
      tl.style.height = vp.height + 'px';
      pg.wrap.appendChild(tl);
      pg.textLayer = tl;
      const textDivs = [];
      try{
        const task = pdfjsLib.renderTextLayer({
          textContentSource: pg.textContent,
          textContent: pg.textContent,
          container: tl,
          viewport: vp,
          textDivs
        });
        if(task && task.promise) await task.promise;
      }catch(e){ console.warn('textLayer', e); }
      pg.spans = textDivs;
      /* tag spans with their line index for tap-to-read and selection mapping */
      for(let li = pg.lineStart; li < pg.lineEnd; li++){
        lines[li].items.forEach(idx=>{ if(textDivs[idx]) textDivs[idx].dataset.line = li; });
      }
      tl.addEventListener('click', e=>{
        const sel = window.getSelection();
        if(sel && sel.toString().trim()) return; /* selecting, not tapping */
        const li = e.target && e.target.dataset ? e.target.dataset.line : null;
        if(li !== undefined && li !== null){
          const si = lineToSent[+li];
          if(si !== undefined){ jumpTo(si); if(!playing) togglePlay(); }
        }
      });
    }
    pg.rendered = true;
    renderedSet.add(n);
    if(current >= 0 && sentences[current] && sentences[current].page === n) positionMarker(lines[sentences[current].parts[0].line]);
    /* memory: keep at most 14 rendered pages */
    if(renderedSet.size > 14){
      let far = null, farDist = -1;
      const curPg = current>=0 && sentences[current] ? sentences[current].page : n;
      renderedSet.forEach(m=>{ const d = Math.abs(m-curPg); if(d>farDist){ farDist=d; far=m; } });
      if(far && far!==n) unrenderPage(far);
    }
  }catch(e){ console.warn('render '+n, e); }
  pg.rendering = false;
}
function unrenderPage(n){
  const pg = pages[n-1];
  if(!pg || pg.isImage || !pg.rendered) return;
  if(pg.canvas){ pg.canvas.remove(); pg.canvas = null; }
  if(pg.textLayer){ pg.textLayer.remove(); pg.textLayer = null; }
  pg.spans = [];
  pg.rendered = false;
  renderedSet.delete(n);
  const ld = pg.wrap.querySelector('.pageLoading');
  if(ld) ld.style.display = 'flex';
}

let resizeT = null;
window.addEventListener('resize', ()=>{
  if(!pages.length) return;
  clearTimeout(resizeT);
  resizeT = setTimeout(()=>{
    computeFitScale();
    pages.forEach(pg=>{
      pg.wrap.style.width = (pg.w * fitScale) + 'px';
      pg.wrap.style.height = (pg.h * fitScale) + 'px';
      if(pg.rendered) unrenderPage(pg.num);
      /* re-observe so pages already on screen redraw immediately */
      observer.unobserve(pg.wrap);
      observer.observe(pg.wrap);
    });
    if(current>=0 && sentences[current]) positionMarker(lines[sentences[current].parts[0].line]);
  }, 250);
});

/* ---------------- Karaoke marker ---------------- */
const markerEl = document.createElement('div');
markerEl.id = 'marker';
function positionMarker(ln){
  if(ln && ln.el){ /* text-document mode: highlight the sentence span */
    document.querySelectorAll('.sentSpan.active').forEach(x=>x.classList.remove('active'));
    ln.el.classList.add('active');
    hideMarker();
    return;
  }
  const pg = pages[ln.page-1];
  if(!pg) return;
  if(markerEl.parentElement !== pg.wrap) pg.wrap.appendChild(markerEl);
  const pad = 2;
  markerEl.style.display = 'block';
  markerEl.style.left = (ln.x * fitScale - pad) + 'px';
  markerEl.style.top = ((pg.h - ln.y - ln.h) * fitScale - pad) + 'px';
  markerEl.style.width = ((ln.xEnd - ln.x) * fitScale + pad*2) + 'px';
  markerEl.style.height = (ln.h * 1.3 * fitScale + pad*2) + 'px';
}
function hideMarker(){ markerEl.style.display = 'none'; }
function scrollToLine(ln){
  if(ln && ln.el){ ln.el.scrollIntoView({block:'center', behavior:'smooth'}); return; }
  const pg = pages[ln.page-1];
  if(!pg) return;
  const viewer = $('viewer');
  const top = pg.wrap.offsetTop + (pg.h - ln.y - ln.h) * fitScale;
  viewer.scrollTo({top: top - viewer.clientHeight * 0.38, behavior:'smooth'});
}

/* ---------------- Sentence building ----------------
   Merge visual lines into natural sentences (a person reads sentence to
   sentence, not printed-line to printed-line). Paragraph gaps and headings
   force breaks. Each sentence remembers which lines it covers, and where. */
function buildSentencesChunk(from, to){
  if(to <= from) return;
  let stream = '';
  const linePos = [];
  const forced = new Set();
  for(let i=from; i<to; i++){
    const start = stream.length ? stream.length + 1 : 0;
    stream += (stream ? ' ' : '') + lines[i].text;
    linePos.push({line:i, start, end: stream.length});
    const nxt = i+1 < to ? lines[i+1] : null;
    if(nxt){
      const gap = lines[i].y - nxt.y - nxt.h;                 // vertical space to next line
      const para = gap > Math.max(lines[i].h, nxt.h) * 1.4;   // paragraph break
      const heading = lines[i].text.length < 60 && !/[.,;:]$/.test(lines[i].text) && !/[.!?]$/.test(lines[i].text);
      if(para || heading || nxt.brk) forced.add(stream.length);   // nxt.brk = column/band boundary
    }
  }
  const ends = [];
  const re = /[.!?]+["')\]]?(?=\s|$)/g;
  const ABBR = /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|approx|dept|govt|e\.g|i\.e|No|Fig|pp|Vol|Rev|Hon|Smt|Sri|Shri|[A-Z])\.$/;
  let m;
  while((m = re.exec(stream))){
    if(ABBR.test(stream.slice(Math.max(0, m.index - 9), m.index + 1))) continue;
    ends.push(m.index + m[0].length);
  }
  forced.forEach(b=> ends.push(b));
  ends.push(stream.length);
  const uniq = [...new Set(ends)].sort((a,b)=>a-b);
  let a = 0;
  uniq.forEach(b=>{
    const raw = stream.slice(a, b);
    const text = raw.trim();
    if(text.length > 1){
      const lead = raw.length - raw.replace(/^\s+/,'').length;
      const parts = [];
      linePos.forEach(lp=>{
        const s = Math.max(a, lp.start), e = Math.min(b, lp.end);
        if(e > s) parts.push({line: lp.line, from: Math.max(0, s - a - lead), to: Math.max(0, e - a - lead)});
      });
      if(parts.length){
        const idx = sentences.length;
        sentences.push({text, page: lines[parts[0].line].page, parts});
        parts.forEach(p=>{ if(lineToSent[p.line] === undefined) lineToSent[p.line] = idx; });
      }
    }
    a = b;
  });
}

/* ---------------- Speech ---------------- */
let activeUtter = null;   /* keep a live reference — browsers may GC a speaking utterance */
let lastCancel = 0;
const CANCEL_COOLDOWN = 300; /* Edge Natural (online) voices fail if speak() comes too soon after cancel() */
function cancelSpeech2(){ lastCancel = Date.now(); try{ speechSynthesis.cancel(); }catch(e){} }
function safeSpeak(u){
  activeUtter = u;
  let tries = 0;
  const attempt = ()=>{
    if(activeUtter !== u) return;               /* a newer utterance replaced this one */
    if(speechSynthesis.speaking || speechSynthesis.pending){
      cancelSpeech2();
      if(++tries < 12) setTimeout(attempt, 150);
      return;
    }
    const since = Date.now() - lastCancel;
    if(since < CANCEL_COOLDOWN){ setTimeout(attempt, CANCEL_COOLDOWN - since + 30); return; }
    try{ speechSynthesis.resume(); }catch(e){}  /* Edge can be stuck "paused" after cancel */
    speechSynthesis.speak(u);
  };
  attempt();
}
function speakText(text, onend, attempt){
  /* strip emojis — Edge Natural voices can fail on them, and hearing "folded hands" is odd anyway */
  text = text.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, ' ').replace(/\s+/g,' ').trim();
  if(!text){ if(onend) onend(); return; }
  const u = new SpeechSynthesisUtterance(text);
  const v = currentVoice();
  if(v){ u.voice = v; u.lang = v.lang; }
  u.rate = rate();
  if(onend) u.onend = onend;
  u.onerror = e=>{
    if(e.error==='canceled' || e.error==='interrupted') return;   /* our own cancel — not a problem */
    console.warn('speech error:', e.error);
    const at = attempt || 0;
    /* Edge Natural voices sometimes fail to synthesize — retry, then switch voice, then give up */
    if(at < 2) setTimeout(()=> speakText(text, onend, at+1), 350);
    else if(e.error==='synthesis-failed' && markBadVoice(v)) setTimeout(()=> speakText(text, onend, 0), 350);
    else if(onend) onend();
  };
  safeSpeak(u);
}
function speakLine(i, attempt){ /* speaks SENTENCE i; the visual marker follows line by line */
  if(i<0 || i>=sentences.length){ finishDoc(); return; }
  current = i;
  const sen = sentences[i];
  let curLi = sen.parts[0].line;
  positionMarker(lines[curLi]);
  scrollToLine(lines[curLi]);
  renderPage(sen.page);
  const u = new SpeechSynthesisUtterance(sen.text);
  const v = currentVoice();
  if(v){ u.voice = v; u.lang = v.lang; }
  u.rate = rate();
  /* audio pointer: the sentence · visual pointer: synced by word boundaries */
  u.onboundary = e=>{
    if(typeof e.charIndex !== 'number') return;
    let p = sen.parts.find(pt=> e.charIndex >= pt.from && e.charIndex < pt.to);
    if(!p){ for(let k = sen.parts.length-1; k >= 0; k--){ if(e.charIndex >= sen.parts[k].from){ p = sen.parts[k]; break; } } }
    if(p && p.line !== curLi){
      curLi = p.line;
      positionMarker(lines[curLi]);
      scrollToLine(lines[curLi]);
    }
  };
  u.onend = ()=>{ if(playing) speakLine(i+1); };
  u.onerror = e=>{
    if(e.error==='canceled' || e.error==='interrupted') return;   /* our own cancel — not a problem */
    console.warn('speech error:', e.error, '(sentence '+i+')');
    if(!playing) return;
    const at = attempt || 0;
    if(at < 2) setTimeout(()=>{ if(playing && current===i) speakLine(i, at+1); }, 350);        /* retry this sentence */
    else if(e.error==='synthesis-failed' && markBadVoice(v))
               setTimeout(()=>{ if(playing && current===i) speakLine(i, 0); }, 350);           /* voice was broken — same sentence, new voice */
    else       setTimeout(()=>{ if(playing && current===i) speakLine(i+1); }, 150);            /* skip it, keep reading */
  };
  safeSpeak(u);
  updateProgress();
}
function togglePlay(){
  if(docBusy){ say('🔍 One moment — I am still recognising the text. I will be ready in a few seconds!','sys'); return; }
  if(!sentences.length) return;
  if(playing){ playing=false; cancelSpeech2(); }
  else{ playing=true; awaitingStart=false; speakLine(current<0?0:current); }
  setPlayBtn();
}
function setPlayBtn(){
  const mob = window.innerWidth <= 900;
  $('playBtn').textContent = playing ? (mob ? '⏸' : '⏸ Pause') : (mob ? '▶' : '▶ Play');
}
function stopSpeech(){ playing=false; cancelSpeech2(); setPlayBtn(); }
function jumpTo(i){
  if(!sentences.length) return;
  current = Math.max(0, Math.min(i, sentences.length-1));
  const ln = lines[sentences[current].parts[0].line];
  positionMarker(ln);
  scrollToLine(ln);
  if(playing) speakLine(current);
  updateProgress();
}
function finishDoc(){
  playing=false; setPlayBtn();
  if(ocrBusy){ waitingForMore = true; say('One moment — still converting the next page. I will continue automatically.'); return; }
  const msg = `That's the end of "${docName}". Want me to repeat something, or shall we discuss what we read?`;
  say(msg);
  if(companionAvailable()) speakText(msg);
}
function updateProgress(){
  $('progressText').textContent = sentences.length ? `Sentence ${Math.max(current,0)+1} / ${sentences.length} · Page ${sentences[Math.max(current,0)]?.page||1} of ${numPages}` : '';
  $('readProgFill').style.width = sentences.length ? Math.round((Math.max(current,0)+1) / sentences.length * 100) + '%' : '0%';
  const pg = sentences[Math.max(current,0)]?.page;
  if(pg && $('pageSel').value != pg) $('pageSel').value = pg;
}
function goPage(p){
  if(p<1 || p>numPages) return false;
  const idx = sentences.findIndex(s=>s.page===p);
  if(idx < 0){
    const pg = pages[p-1];
    if(pg) $('viewer').scrollTo({top: pg.wrap.offsetTop - 10, behavior:'smooth'});
    return true;
  }
  awaitingStart = false;
  playing = true; setPlayBtn();
  speakLine(idx);
  return true;
}

$('playBtn').addEventListener('click', togglePlay);
$('prevBtn').addEventListener('click', ()=> jumpTo(current-1));
$('nextBtn').addEventListener('click', ()=> jumpTo(current+1));
$('pageSel').addEventListener('change', e=> goPage(+e.target.value));
$('pgPrev').addEventListener('click', ()=> goPage((sentences[Math.max(current,0)]?.page || 1) - 1));
$('pgNext').addEventListener('click', ()=> goPage((sentences[Math.max(current,0)]?.page || 1) + 1));
$('rateSel').addEventListener('change', ()=>{ if(playing) speakLine(current); });
document.addEventListener('keydown', e=>{
  if(e.target.tagName==='INPUT') return;
  if(e.code==='Space'){ e.preventDefault(); togglePlay(); }
  if(e.code==='ArrowRight') jumpTo(current+1);
  if(e.code==='ArrowLeft') jumpTo(current-1);
});

/* ---------------- Text selection → toolbar ---------------- */
let selText = '', selLine = -1;
function refreshSelBar(){
  const sel = window.getSelection();
  const t = sel ? sel.toString().trim() : '';
  if(!t || t.length < 2 || !$('viewer').contains(sel.anchorNode)){ $('selBar').style.display='none'; return; }
  selText = t.slice(0, 1500);
  let node = sel.anchorNode;
  if(node && node.nodeType===3) node = node.parentElement;
  selLine = node && node.dataset && node.dataset.line !== undefined ? +node.dataset.line : -1;
  const r = sel.getRangeAt(0).getBoundingClientRect();
  const bar = $('selBar');
  bar.style.display = 'flex';
  const bw = 230;
  bar.style.left = Math.max(8, Math.min(window.innerWidth - bw, r.left + r.width/2 - bw/2)) + 'px';
  bar.style.top = Math.max(8, r.top - 52) + 'px';
}
document.addEventListener('mouseup', ()=> setTimeout(refreshSelBar, 10));
document.addEventListener('touchend', ()=> setTimeout(refreshSelBar, 300));
document.addEventListener('selectionchange', ()=>{
  const sel = window.getSelection();
  if(!sel || !sel.toString().trim()) $('selBar').style.display='none';
});
$('selRead').addEventListener('click', ()=>{
  $('selBar').style.display='none';
  window.getSelection().removeAllRanges();
  const si = selLine >= 0 ? lineToSent[selLine] : undefined;
  if(si !== undefined){ awaitingStart=false; playing = true; setPlayBtn(); speakLine(si); }
  else say('Tap directly on a sentence to read from there.');
});
$('selExplain').addEventListener('click', async ()=>{
  $('selBar').style.display='none';
  const t = selText;
  window.getSelection().removeAllRanges();
  if(!companionAvailable()){ say(session ? 'Turn the 🤖 companion on first.' : 'Login to unlock explanations.'); if(window.innerWidth<=900) openSheet(); return; }
  if(selLine >= 0){ current = Math.max(current, 0); positionMarker(lines[selLine]); }
  const wasPlaying = playing;
  if(playing) togglePlay();
  say('Explain: "'+t.slice(0,90)+(t.length>90?'…':'')+'"','user');
  if(window.innerWidth<=900) openSheet();
  sayProgress('Thinking…');
  try{
    const ans = await askAI('Explain this selected passage simply: "'+t+'"', buildContext(t));
    removeProgress();
    say(ans);
    speakText(ans, ()=>{ if(wasPlaying){ playing=true; setPlayBtn(); speakLine(current+1); } });
  }catch(e){ removeProgress(); say('Could not get an explanation ('+e.message+').'); }
});

/* ---------------- OCR for scanned PDFs ---------------- */
async function ocrAll(){
  say(`${(docLabel||'this PDF').replace(/^y/,'Y')} is a scanned PDF — pictures of text. Switching on text recognition. I will start reading as soon as page 1 is ready!`);
  setDocBusy(true);
  let worker;
  try{
    sayProgress('Starting OCR engine…');
    worker = await Tesseract.createWorker('eng', 1, {
      workerPath: new URL('lib/ocr/worker.min.js', location.href).href,
      corePath:   new URL('lib/ocr', location.href).href,
      langPath:   new URL('lib/lang', location.href).href
    });
  }catch(e){ removeProgress(); say('I could not start the OCR engine ('+e.message+').'); return; }
  ocrBusy = true;
  let started = false;
  for(let p=1; p<=numPages; p++){
    sayProgress(`🔍 Recognising page ${p} of ${numPages}…`);
    try{
      const pg = pages[p-1];
      const S = 2;
      const vp = pg.page.getViewport({scale: S});
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
      await pg.page.render({canvasContext: canvas.getContext('2d'), viewport: vp}).promise;
      const res = await worker.recognize(canvas, {}, {blocks:true, text:true});
      const data = res.data || {};
      pg.lineStart = lines.length;
      const pushLine = (text, bbox)=>{
        const t = (text||'').replace(/\s+/g,' ').trim();
        if(t.length < 2 || !bbox) return;
        lines.push({
          text: t, page: p,
          x: bbox.x0 / S, xEnd: bbox.x1 / S,
          y: pg.h - bbox.y1 / S,
          h: (bbox.y1 - bbox.y0) / S,
          items: []
        });
      };
      if(Array.isArray(data.blocks) && data.blocks.length){
        data.blocks.forEach(b=> (b.paragraphs||[]).forEach(par=> (par.lines||[]).forEach(l=> pushLine(l.text, l.bbox))));
      }else if(data.text){
        data.text.split('\n').forEach(t=> pushLine(t, {x0:40, x1:pg.w*2-40, y0:0, y1:0}));
      }
      pg.lineEnd = lines.length;
      buildSentencesChunk(pg.lineStart, pg.lineEnd);
    }catch(e){ say(`Page ${p}: OCR problem (${e.message}). Skipping.`,'sys'); }
    updateProgress();
    if(!started && sentences.length){
      started = true;
      setDocBusy(false);
      say('Page 1 is ready — reading while I convert the rest in the background.');
      playing = true; setPlayBtn(); speakLine(0);
    } else if(waitingForMore && sentences.length > current+1){
      waitingForMore = false;
      playing = true; setPlayBtn(); speakLine(current+1);
    }
  }
  ocrBusy = false;
  try{ await worker.terminate(); }catch(e){}
  removeProgress();
  setDocBusy(false);
  if(!lines.length){ say('Sorry — I could not recognise any text in this scan.'); return; }
  buildPageOptions();
  say(`Done! All ${numPages} pages converted.`);
  if(waitingForMore){ waitingForMore = false; finishDoc(); }
}

