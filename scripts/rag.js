'use strict';
/* ============================================================
   Lexora AI — companion retrieval engine (Phase 4, "Hybrid RAG").
   UI names (never say "RAG" to users):
     • Private AI  (default)  — 100% on-device: chunk → embed (Transformers.js,
       WebGPU with WASM fallback) → IndexedDB/memory → local vector search →
       only the question + the few best passages go to the existing worker.
     • Smart AI    (recommended) — same privacy, plus an orchestrator: intent
       detection, hybrid retrieval (vectors + BM25 keywords + reading position
       + headings), re-ranking. Still nothing but the best passages leaves.
     • Deep Research (opt-in) — explicit consent modal, then the document text
       is indexed TEMPORARILY on the worker (Vectorize + Workers AI), queried
       per question, and deleted on close / within 24 h.
   Integrates with app-companion.js via LxRag.getContext(question) — returns a
   context string for askAI(), or null → the caller falls back to the classic
   buildContext(). Uses globals from app-core/app-viewer: sentences, lines,
   current, docName, numPages, CONFIG, say, companionAvailable, authToken.
   ============================================================ */

var LxRag = (function(){
  const MODEL = 'Xenova/all-MiniLM-L6-v2';        /* production browser embedder */
  const TF_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.1';
  const CTX_MAX = 8500;                            /* worker /chat caps context at 9000 */
  const CHUNK_CHARS = 1100;
  const STOP = new Set(('a an and are as at be by for from has have in is it its of on or that the this to was were will with what which who whom how when where why do does did can could would should you your our my i').split(' '));

  const S = {
    fp: '', chunks: [], vecs: null, dim: 0,        /* current on-device index */
    bm: null, building: null, ready: false,
    pendingFp: '', stable: 0, saidOnce: false,
    embedder: null, tfmod: null, lastSources: [],
    deep: { docId: '', ready: false, count: 0, declined: '' }
  };

  const mode = ()=> {
    const m = localStorage.getItem('ra_ai_mode');
    return (m === 'smart' || m === 'deep') ? m : 'private';
  };

  /* ---------- document fingerprint ---------- */
  function fullText(){ return sentences.map(s=> s.text).join(' '); }
  function fingerprint(){
    const t = fullText();
    const head = t.slice(0, 2000), tail = t.slice(-2000);
    let h = 0;
    const str = docName + '|' + numPages + '|' + sentences.length + '|' + head + tail;
    for(let i = 0; i < str.length; i++){ h = (h * 31 + str.charCodeAt(i)) | 0; }
    return 'd' + (h >>> 0).toString(36) + '-' + sentences.length;
  }

  /* ---------- chunking (sentence-based, heading-aware) ---------- */
  function detectHeadings(){
    const heights = lines.map(l=> l.h || 0).filter(Boolean).sort((a,b)=> a-b);
    const med = heights.length ? heights[Math.floor(heights.length / 2)] : 0;
    const headAt = new Array(lines.length).fill('');
    let cur = '';
    lines.forEach((l, i)=>{
      const words = (l.text || '').trim().split(/\s+/).length;
      if(med && l.h > med * 1.25 && words > 0 && words <= 12 && l.text.length < 80) cur = l.text.trim();
      headAt[i] = cur;
    });
    return headAt;
  }
  function buildChunks(){
    const headAt = detectHeadings();
    const out = [];
    let buf = [], len = 0, s0 = 0;
    const flush = (nextStart)=>{
      if(!buf.length) return;
      const first = buf[0];
      out.push({
        i: out.length,
        page: sentences[first] ? sentences[first].page : 1,
        s0: first,
        head: (sentences[first] && sentences[first].parts && headAt[sentences[first].parts[0].line]) || '',
        text: buf.map(k=> sentences[k].text).join(' ')
      });
      buf = []; len = 0; s0 = nextStart;
    };
    for(let k = 0; k < sentences.length; k++){
      buf.push(k); len += sentences[k].text.length + 1;
      if(len >= CHUNK_CHARS){
        const last = buf[buf.length - 1];
        flush(last);                     /* 1-sentence overlap: restart at the last one */
        buf = [last]; len = sentences[last].text.length;
      }
    }
    flush(sentences.length);
    return out;
  }

  /* ---------- BM25 keyword index ---------- */
  function tokenize(t){
    return t.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').split(/\s+/)
      .filter(w=> w.length > 2 && !STOP.has(w));
  }
  function buildBM25(chunks){
    const df = new Map(), tfs = [], lens = [];
    chunks.forEach(c=>{
      const tf = new Map();
      const toks = tokenize(c.text);
      toks.forEach(w=> tf.set(w, (tf.get(w) || 0) + 1));
      tf.forEach((_, w)=> df.set(w, (df.get(w) || 0) + 1));
      tfs.push(tf); lens.push(toks.length || 1);
    });
    const avg = lens.reduce((a, b)=> a + b, 0) / (lens.length || 1);
    return { df, tfs, lens, avg, N: chunks.length };
  }
  function bm25Scores(qTokens){
    const { df, tfs, lens, avg, N } = S.bm;
    const scores = new Float32Array(N);
    qTokens.forEach(w=>{
      const d = df.get(w); if(!d) return;
      const idf = Math.log(1 + (N - d + 0.5) / (d + 0.5));
      for(let i = 0; i < N; i++){
        const tf = tfs[i].get(w); if(!tf) continue;
        scores[i] += idf * (tf * 2.5) / (tf + 1.5 * (0.25 + 0.75 * lens[i] / avg));
      }
    });
    return scores;
  }

  /* ---------- embeddings (Transformers.js — WebGPU, WASM fallback) ---------- */
  async function ensureEmbedder(){
    if(S.embedder) return S.embedder;
    if(!S.tfmod) S.tfmod = import(TF_CDN);
    const T = await S.tfmod;
    if(T.env){ T.env.allowLocalModels = false; }
    let device = 'wasm';
    try{ if(navigator.gpu && await navigator.gpu.requestAdapter()) device = 'webgpu'; }catch(e){}
    try{ S.embedder = await T.pipeline('feature-extraction', MODEL, { device, dtype: 'q8' }); }
    catch(e){ S.embedder = await T.pipeline('feature-extraction', MODEL, { device: 'wasm', dtype: 'q8' }); }
    return S.embedder;
  }
  async function embedTexts(texts){
    const em = await ensureEmbedder();
    const out = await em(texts, { pooling: 'mean', normalize: true });
    const dim = out.dims[out.dims.length - 1];
    return { data: Float32Array.from(out.data), dim };
  }
  function cosineTop(qv, k){
    const n = S.chunks.length, d = S.dim, v = S.vecs;
    const scored = [];
    for(let i = 0; i < n; i++){
      let dot = 0; const off = i * d;
      for(let j = 0; j < d; j++) dot += qv[j] * v[off + j];
      scored.push([i, dot]);
    }
    scored.sort((a, b)=> b[1] - a[1]);
    return scored.slice(0, k);
  }

  /* ---------- IndexedDB cache (per document fingerprint) ---------- */
  function idb(){
    return new Promise((res, rej)=>{
      const r = indexedDB.open('lxrag', 1);
      r.onupgradeneeded = ()=> r.result.createObjectStore('idx');
      r.onsuccess = ()=> res(r.result);
      r.onerror = ()=> rej(r.error);
    });
  }
  async function idbGet(key){
    try{
      const db = await idb();
      return await new Promise((res)=>{
        const q = db.transaction('idx').objectStore('idx').get(key);
        q.onsuccess = ()=> res(q.result || null);
        q.onerror = ()=> res(null);
      });
    }catch(e){ return null; }
  }
  async function idbPut(key, val){
    try{
      const db = await idb();
      const tx = db.transaction('idx', 'readwrite');
      tx.objectStore('idx').put(val, key);
      /* keep the cache small: this is a cache, losing it just means re-indexing */
    }catch(e){}
  }

  /* ---------- index build ---------- */
  async function ensureIndex(){
    if(typeof sentences === 'undefined' || !sentences.length) throw new Error('no document');
    const fp = fingerprint();
    if(S.ready && S.fp === fp) return;
    if(S.building) return S.building;
    S.building = (async ()=>{
      const chunks = buildChunks();
      const cached = await idbGet(fp);
      if(cached && cached.dim && cached.vecs && cached.n === chunks.length){
        S.vecs = new Float32Array(cached.vecs); S.dim = cached.dim;
      }else{
        const texts = chunks.map(c=> (c.head ? c.head + '. ' : '') + c.text.slice(0, 1400));
        let all = null, dim = 0, off = 0;
        for(let i = 0; i < texts.length; i += 16){
          const { data, dim: d } = await embedTexts(texts.slice(i, i + 16));
          if(!all){ dim = d; all = new Float32Array(texts.length * dim); }
          all.set(data, off); off += data.length;
        }
        S.vecs = all || new Float32Array(0); S.dim = dim;
        idbPut(fp, { n: chunks.length, dim, vecs: S.vecs.buffer.slice(0) });
      }
      S.chunks = chunks;
      S.bm = buildBM25(chunks);
      S.fp = fp; S.ready = true;
    })();
    try{ await S.building; } finally { S.building = null; }
  }

  /* background pre-indexing: start quietly once a document settles */
  setInterval(()=>{
    try{
      if(typeof sentences === 'undefined' || !sentences.length) return;
      if(typeof companionAvailable !== 'function' || !companionAvailable()) return;
      const fp = fingerprint();
      if(fp !== S.pendingFp){ S.pendingFp = fp; S.stable = 0; return; }
      if((S.ready && S.fp === fp) || S.building) return;
      if(++S.stable >= 2) ensureIndex().catch(()=>{});
    }catch(e){}
  }, 4000);

  /* ---------- intent (Smart AI orchestrator) ---------- */
  function intentOf(q){
    const s = q.toLowerCase();
    if(/\b(summar|overview|tl;?dr|gist|main points|in short|key takeaways)/.test(s)) return 'summarize';
    if(/\b(compare|difference|differences|versus|vs\.?|contrast)\b/.test(s)) return 'compare';
    if(/\b(timeline|chronolog|sequence of events|order of events|history of)\b/.test(s)) return 'timeline';
    if(/\b(define|definition|meaning of|what does .{1,40} mean|what is a\b|what is the term)/.test(s)) return 'definition';
    if(/\b(find|where (is|does|do)|which page|locate|mention(s|ed)?|appear)/.test(s)) return 'find';
    return 'ask';
  }

  /* ---------- retrieval + re-ranking ---------- */
  function fuse(vecTop, bmScores, opts){
    const K = 60, rank = new Map();
    vecTop.forEach(([i], r)=> rank.set(i, (rank.get(i) || 0) + 1 / (K + r)));
    const bmTop = [...bmScores.keys()].map(i=> [i, bmScores[i]]).filter(x=> x[1] > 0)
      .sort((a, b)=> b[1] - a[1]).slice(0, 12);
    bmTop.forEach(([i], r)=> rank.set(i, (rank.get(i) || 0) + (opts.kw || 1) / (K + r)));
    /* boosts: near the current reading position, heading matches the question */
    const curPage = (typeof current === 'number' && current >= 0 && sentences[current]) ? sentences[current].page : -99;
    rank.forEach((v, i)=>{
      const c = S.chunks[i];
      let b = 0;
      if(Math.abs(c.page - curPage) <= 1) b += 0.004;
      if(opts.qTokens && c.head && opts.qTokens.some(w=> c.head.toLowerCase().includes(w))) b += 0.003;
      if(opts.dateBoost && /\b(19|20)\d\d\b|\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/.test(c.text)) b += 0.004;
      rank.set(i, v + b);
    });
    return [...rank.entries()].sort((a, b)=> b[1] - a[1]).map(e=> e[0]);
  }
  function assemble(idxs, extraHeader){
    const seen = new Set(), picked = [];
    idxs.forEach(i=>{ if(!seen.has(i)){ seen.add(i); picked.push(i); } });
    picked.sort((a, b)=> a - b);                    /* document order reads best */
    const parts = [];
    if(extraHeader) parts.push(extraHeader);
    if(typeof current === 'number' && current >= 0 && sentences.length && sentences[current]){
      parts.push('CURRENT READING POSITION:\n' + sentences.slice(Math.max(0, current - 2), current + 3)
        .map(s=> '[p' + s.page + '] ' + s.text).join('\n'));
    }
    let body = 'RELEVANT DOCUMENT EXCERPTS:';
    const used = [];
    for(const i of picked){
      const c = S.chunks[i];
      const add = '\n' + (c.head ? '(' + c.head + ') ' : '') + '[p' + c.page + '] ' + c.text;
      if((parts.join('\n\n') + body + add).length > CTX_MAX) break;
      body += add;
      used.push(i);
    }
    parts.push(body);
    /* remember which passages fed the answer, so the companion can cite them
       (design package §09 — "always cite the ¶ passages"). On-device only. */
    S.lastSources = used.slice(0, 4).map(i=>{
      const c = S.chunks[i];
      const label = (c.head && c.head.trim()) ? c.head.trim()
                    : c.text.replace(/\s+/g,' ').trim().split(' ').slice(0,4).join(' ');
      return { page: c.page, label: label.slice(0, 32) };
    });
    return parts.join('\n\n').slice(0, CTX_MAX);
  }
  async function retrieveLocal(question){
    await ensureIndex();
    const m = mode();
    const qTokens = tokenize(question);
    const intent = m === 'smart' ? intentOf(question) : 'ask';
    const { data: qv } = await embedTexts([question]);

    if(intent === 'summarize'){
      /* spread across the whole document + the semantically closest parts */
      const n = S.chunks.length, ids = [0, n - 1];
      for(let k = 1; k <= 5; k++) ids.push(Math.floor(n * k / 6));
      cosineTop(qv, 4).forEach(([i])=> ids.push(i));
      return assemble(ids, 'TASK: summarize — excerpts sampled from the WHOLE document (start, middle, end).');
    }
    if(intent === 'compare'){
      const sides = question.split(/\b(?:vs\.?|versus|compared? (?:to|with)|and|between)\b/i)
        .map(s=> s.trim()).filter(s=> s.length > 2).slice(0, 3);
      let ids = [];
      for(const side of sides){
        const { data: sv } = await embedTexts([side]);
        cosineTop(sv, 4).forEach(([i])=> ids.push(i));
      }
      cosineTop(qv, 4).forEach(([i])=> ids.push(i));
      return assemble(ids, 'TASK: compare — excerpts covering each side.');
    }
    const opts = { qTokens };
    if(intent === 'definition' || intent === 'find') opts.kw = 2;   /* keywords matter more */
    if(intent === 'timeline') opts.dateBoost = true;
    const vecTop = cosineTop(qv, 12);
    const bm = (m === 'smart' || qTokens.length) ? bm25Scores(qTokens) : new Float32Array(S.chunks.length);
    const order = fuse(vecTop, bm, opts).slice(0, m === 'smart' ? 8 : 6);
    return assemble(order);
  }

  /* ---------- Deep Research (opt-in, temporary server index) ---------- */
  function deepModal(){
    return new Promise(res=>{
      const old = document.getElementById('drModal'); if(old) old.remove();
      const wrap = document.createElement('div'); wrap.id = 'drModal';
      wrap.innerHTML = '<div class="drCard"><h3>Deep Research — one quick OK</h3>'
        + '<p>To research your <b>whole document</b> at once, its text is uploaded to our secure server and indexed <b>temporarily</b>.</p>'
        + '<p>It is deleted automatically when you close the document — and always within 24 hours. Private AI and Smart AI stay 100% on your device.</p>'
        + '<div class="drBtns"><button class="goBig" data-a="go">Upload &amp; start Deep Research</button>'
        + '<button class="btn ghost" data-a="smart">Use Smart AI instead (stay on device)</button>'
        + '<button class="btn ghost" data-a="cancel">Not now</button></div></div>';
      document.body.appendChild(wrap);
      wrap.addEventListener('click', e=>{
        const b = e.target.closest('button[data-a]');
        if(b){ wrap.remove(); res(b.dataset.a); }
        else if(e.target === wrap){ wrap.remove(); res('cancel'); }
      });
    });
  }
  async function deepIndex(){
    const chunks = S.chunks.length ? S.chunks : buildChunks();
    const docId = fingerprint();
    for(let i = 0; i < chunks.length && i < 600; i += 30){
      const batch = chunks.slice(i, i + 30).map(c=> ({ i: c.i, page: c.page, text: c.text.slice(0, 1200) }));
      try{
        await Lx.api.gateway.rag.index(docId, batch);   /* core: auth + 401 retry + errors */
      }catch(e){
        if(e && e.status === 503) throw new Error('deep_unavailable');
        throw new Error('indexing failed (' + (e && e.status || '?') + ')');
      }
    }
    S.deep = { docId, ready: true, count: Math.min(chunks.length, 600), declined: '' };
  }
  async function deepQuery(question){
    let j;
    try{ j = await Lx.api.gateway.rag.query(S.deep.docId, question, 8); }
    catch(e){ throw new Error('deep query failed'); }
    const ms = (j.matches || []);
    if(!ms.length) return null;
    let body = 'RELEVANT DOCUMENT EXCERPTS (full-document search):';
    for(const m of ms){
      const add = '\n[p' + (m.page || '?') + '] ' + (m.text || '');
      if((body + add).length > CTX_MAX) break;
      body += add;
    }
    return body;
  }
  async function deepDelete(){
    if(!S.deep.ready) return;
    try{ Lx.api.gateway.rag.remove(S.deep.docId, S.deep.count).catch(()=>{}); }catch(e){}
    S.deep = { docId: '', ready: false, count: 0, declined: '' };
  }
  window.addEventListener('pagehide', ()=>{ deepDelete(); });

  /* ---------- public API ---------- */
  async function getContext(question){
    S.lastSources = [];                             /* clear stale citations up front */
    if(typeof sentences === 'undefined' || !sentences.length) return null;
    if(fullText().length <= 8000) return null;      /* small doc: classic path sends it all */

    if(mode() === 'deep'){
      const fp = fingerprint();
      if(S.deep.ready && S.deep.docId === fp){
        try{ const ctx = await deepQuery(question); if(ctx) return ctx; }catch(e){}
      }else if(S.deep.declined !== fp){
        const act = await deepModal();
        if(act === 'go'){
          try{
            if(typeof say === 'function') say('🛰 Uploading & indexing your document for Deep Research…', 'sys');
            await ensureIndex().catch(()=>{});      /* chunks are needed; embeddings optional here */
            await deepIndex();
            const ctx = await deepQuery(question);
            if(ctx) return ctx;
          }catch(e){
            if(typeof say === 'function') say(e.message === 'deep_unavailable'
              ? 'Deep Research is not switched on for this account yet — using Smart AI on your device instead.'
              : 'Deep Research had a hiccup — using Smart AI on your device instead.', 'sys');
          }
        }else if(act === 'smart'){
          S.deep.declined = fp;
        }else{
          S.deep.declined = fp;
        }
      }
      /* fall through to on-device retrieval */
    }

    if(!S.ready && !S.saidOnce && typeof say === 'function'){
      S.saidOnce = true;
      say('🧠 Reading your document on your device (first time takes a moment)…', 'sys');
    }
    return await retrieveLocal(question);
  }

  /* modal styles (JS-injected — same pages.css-caching reason as Sign/Edit) */
  (function css(){
    var c = '#drModal{position:fixed; inset:0; background:rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center; z-index:1000; padding:16px}'
      + '.drCard{background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:22px 20px; max-width:430px; width:100%; box-shadow:var(--shadow)}'
      + '.drCard h3{margin:0 0 10px; font-size:17px; color:var(--text)}'
      + '.drCard p{margin:0 0 10px; font-size:13.5px; line-height:1.5; color:var(--text)}'
      + '.drBtns{display:flex; flex-direction:column; gap:8px; margin-top:14px}'
      + '.drBtns .goBig{margin:0}'
      + '.drBtns .btn{width:100%}';
    var s = document.createElement('style'); s.textContent = c; document.head.appendChild(s);
  })();

  return { getContext, ensureIndex, mode, deepDelete, getSources: ()=> S.lastSources || [] };
})();
