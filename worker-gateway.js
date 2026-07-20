// ============================================================
// ReadAloud AI — UNIFIED AI GATEWAY (Cloudflare Worker)
// Replaces worker.js / worker-free.js with one production gateway.
//
// Endpoints:
//   POST /chat  — ask the companion (routes by user's plan)
//   GET  /me    — profile: plan, provider, model, tokens_balance (for progress bar)
//
// Routing:
//   free plan  -> FREE_PROVIDER env: 'openai' (gpt-4o-mini) or 'bedrock' (Amazon Nova Micro)
//   paid plan  -> user's chosen provider+model (whitelisted below), metered against wallet
//   wallet empty -> automatically behaves as free tier
//
// Env vars (Settings > Variables and Secrets):
//   SUPABASE_URL, SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_KEY   (Secret — Supabase: Settings > API Keys > service_role / secret key)
//   OPENAI_API_KEY         (Secret)
//   ANTHROPIC_API_KEY      (Secret)
//   ALLOWED_ORIGIN         e.g. https://0krk0.github.io
//   FREE_PROVIDER          'openai' (default) or 'bedrock'
//   RATE_PER_MIN (8), RATE_PER_DAY_FREE (30), RATE_PER_DAY_PAID (200)
//   -- only if FREE_PROVIDER=bedrock:
//   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (Secrets), AWS_REGION (e.g. us-east-1),
//   BEDROCK_MODEL (default amazon.nova-micro-v1:0)
// Optional KV binding "RATE".
// ============================================================

/* ---------- Engines & tiers ----------
   User-facing names: Swift (openai family) · Sage (anthropic family) · Spark (free).
   Tiers per plan: core (×1 wallet burn) · plus · ultra. The multiplier keeps the
   margin identical whichever tier the user picks — pricier model, faster burn.
   Model ids are env-overridable so you can upgrade models without redeploying code. */
function tierTable(env) {
  /* burn multipliers are env-tunable: TIER_MULT_OPENAI="1,12,25" TIER_MULT_ANTHROPIC="1,3,15" */
  const mo = String(env.TIER_MULT_OPENAI || '1,12,25').split(',').map(Number);
  const ma = String(env.TIER_MULT_ANTHROPIC || '1,3,15').split(',').map(Number);
  return {
    openai: {
      core:  { id: env.OPENAI_CORE  || 'gpt-4o-mini', x: mo[0] || 1  },
      plus:  { id: env.OPENAI_PLUS  || 'gpt-4o',      x: mo[1] || 12 },
      ultra: { id: env.OPENAI_ULTRA || 'gpt-4o',      x: mo[2] || 25 }
    },
    anthropic: {
      core:  { id: env.ANTHROPIC_CORE  || 'claude-haiku-4-5-20251001', x: ma[0] || 1,  search: true },
      plus:  { id: env.ANTHROPIC_PLUS  || 'claude-sonnet-5',           x: ma[1] || 3,  search: true },
      ultra: { id: env.ANTHROPIC_ULTRA || 'claude-opus-4-8',           x: ma[2] || 15, search: true }
    }
  };
}
/* kept for backwards compat with stored profiles (model column) */
const MODELS = {
  anthropic: { 'claude-haiku-4-5': { id: 'claude-haiku-4-5-20251001', search: true }, 'claude-sonnet-5': { id: 'claude-sonnet-5', search: true } },
  openai:    { 'gpt-4o-mini': { id: 'gpt-4o-mini' }, 'gpt-4o': { id: 'gpt-4o' } }
};
const memRate = new Map();

function corsHeaders(request, env) {
  const allowed = (env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  const origin = request.headers.get('origin') || '';
  const allow = allowed.length === 0 ? '*' : (allowed.includes(origin) ? origin : allowed[0]);
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin'
  };
}
function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...cors } });
}

/* ---------- Supabase helpers (service role) ---------- */
async function sbGet(env, path) {
  const r = await fetch(env.SUPABASE_URL + '/rest/v1/' + path, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY }
  });
  if (!r.ok) return null;
  return r.json();
}
async function sbRpc(env, fn, args) {
  const r = await fetch(env.SUPABASE_URL + '/rest/v1/rpc/' + fn, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'content-type': 'application/json' },
    body: JSON.stringify(args)
  });
  if (!r.ok) return null;
  return r.json();
}
async function sbInsert(env, table, row) {
  await fetch(env.SUPABASE_URL + '/rest/v1/' + table, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'content-type': 'application/json', prefer: 'return=minimal' },
    body: JSON.stringify(row)
  }).catch(() => {});
}

/* ---------- Rate limiting ---------- */
async function checkRate(env, uid, isPaid) {
  const perMin = parseInt(env.RATE_PER_MIN || '8');
  const perDay = parseInt(isPaid ? (env.RATE_PER_DAY_PAID || '200') : (env.RATE_PER_DAY_FREE || '30'));
  const day = new Date().toISOString().slice(0, 10);
  const minute = Math.floor(Date.now() / 60000);
  let rec;
  if (env.RATE) { try { rec = await env.RATE.get('u:' + uid, 'json'); } catch { rec = null; } }
  else rec = memRate.get(uid);
  if (!rec || rec.day !== day) rec = { day, dayCount: 0, minute, minCount: 0 };
  if (rec.minute !== minute) { rec.minute = minute; rec.minCount = 0; }
  if (rec.dayCount >= perDay) return { ok: false, why: isPaid ? 'Daily limit reached — see you tomorrow!' : 'Daily free limit reached. Upgrade for more, or come back tomorrow!' };
  if (rec.minCount >= perMin) return { ok: false, why: 'Slow down a little — too many questions in one minute.' };
  rec.dayCount++; rec.minCount++;
  if (env.RATE) { try { await env.RATE.put('u:' + uid, JSON.stringify(rec), { expirationTtl: 172800 }); } catch {} }
  else { memRate.set(uid, rec); if (memRate.size > 5000) memRate.clear(); }
  return { ok: true };
}

/* ---------- System prompt ---------- */
function systemPrompt(replyLang, canSearch) {
  return 'You are a warm, friendly and knowledgeable reading companion inside ReadAloud AI, an app that reads ' +
    'PDFs and documents aloud to people. The user is listening to a document and talking to you by voice or text. ' +
    'The full document text is provided in the message — for questions ABOUT the document, answer directly from it. ' +
    'NEVER say you will "keep reading", "scroll down" or "look further" — you already have the text. ' +
    'If something is not in the document, say so plainly. ' +
    'For questions RELATED to the document but beyond its text, use your own knowledge' +
    (canSearch ? ', and use the web_search tool when current or official information would help' :
      '; make clear it is general knowledge that may be outdated, and never claim to have searched online') +
    '. For legal or official matters remind the user to confirm with the official source. ' +
    'Keep replies SHORT: 2-3 spoken sentences, around 50-60 words, in plain simple words. ' +
    'Give the key answer first. Only answer at length when the user explicitly asks for a thorough explanation. ' +
    'IMPORTANT: reply ONLY in ' + replyLang + ' unless the user explicitly asks to switch languages. ' +
    'Replies are spoken aloud: no markdown, no lists, no headings, no URLs.';
}

/* ---------- Providers ---------- */
async function callAnthropic(env, modelId, sys, history, userMsg, search) {
  const messages = history.concat([{ role: 'user', content: userMsg }]);
  const body = { model: modelId, max_tokens: 400, system: sys, messages };
  if (search) body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 1 }];
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error('anthropic ' + r.status);
  const d = await r.json();
  return {
    answer: (d.content || []).map(c => c.text || '').join('').trim(),
    tin: (d.usage && d.usage.input_tokens) || 0,
    tout: (d.usage && d.usage.output_tokens) || 0
  };
}
async function callOpenAI(env, modelId, sys, history, userMsg) {
  const messages = [{ role: 'system', content: sys }].concat(history, [{ role: 'user', content: userMsg }]);
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + env.OPENAI_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ model: modelId, max_tokens: 400, messages })
  });
  if (!r.ok) throw new Error('openai ' + r.status);
  const d = await r.json();
  return {
    answer: ((d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '').trim(),
    tin: (d.usage && d.usage.prompt_tokens) || 0,
    tout: (d.usage && d.usage.completion_tokens) || 0
  };
}

/* ---- AWS SigV4 (for Bedrock / Amazon Nova) ---- */
async function hmac(key, msg) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg)));
}
async function sha256hex(msg) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function callBedrock(env, sys, history, userMsg) {
  const region = env.AWS_REGION || 'us-east-1';
  const modelId = env.BEDROCK_MODEL || 'amazon.nova-micro-v1:0';
  const host = `bedrock-runtime.${region}.amazonaws.com`;
  const encodedId = encodeURIComponent(modelId);
  const path = '/model/' + encodedId + '/converse';                       // actual URL (single-encoded)
  const canonicalPath = '/model/' + encodeURIComponent(encodedId) + '/converse'; // SigV4 wants double-encoded
  const msgs = history.map(m => ({ role: m.role, content: [{ text: m.content }] }))
    .concat([{ role: 'user', content: [{ text: userMsg }] }]);
  const body = JSON.stringify({ system: [{ text: sys }], messages: msgs, inferenceConfig: { maxTokens: 400 } });

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');       // YYYYMMDDTHHMMSSZ
  const date = amzDate.slice(0, 8);
  const scope = `${date}/${region}/bedrock/aws4_request`;
  const payloadHash = await sha256hex(body);
  const canonical = ['POST', canonicalPath, '', `content-type:application/json`, `host:${host}`, `x-amz-date:${amzDate}`, '', 'content-type;host;x-amz-date', payloadHash].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256hex(canonical)].join('\n');
  let key = new TextEncoder().encode('AWS4' + env.AWS_SECRET_ACCESS_KEY);
  for (const part of [date, region, 'bedrock', 'aws4_request']) key = await hmac(key, part);
  const sig = [...await hmac(key, toSign)].map(b => b.toString(16).padStart(2, '0')).join('');

  const r = await fetch(`https://${host}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-amz-date': amzDate,
      'authorization': `AWS4-HMAC-SHA256 Credential=${env.AWS_ACCESS_KEY_ID}/${scope}, SignedHeaders=content-type;host;x-amz-date, Signature=${sig}`
    },
    body
  });
  if (!r.ok) throw new Error('bedrock ' + r.status + ' ' + (await r.text()).slice(0, 120));
  const d = await r.json();
  const parts = (d.output && d.output.message && d.output.message.content) || [];
  return {
    answer: parts.map(c => c.text || '').join('').trim(),
    tin: (d.usage && d.usage.inputTokens) || 0,
    tout: (d.usage && d.usage.outputTokens) || 0
  };
}

/* ---------- Main ---------- */
export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const allowed = (env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
    const origin = request.headers.get('origin') || '';
    if (allowed.length && !allowed.includes(origin)) return json({ error: 'Origin not allowed' }, 403, cors);

    /* auth */
    const token = (request.headers.get('authorization') || '').replace('Bearer ', '');
    if (!token || token.length > 4096) return json({ error: 'Not logged in' }, 401, cors);
    const userRes = await fetch(env.SUPABASE_URL + '/auth/v1/user', {
      headers: { authorization: 'Bearer ' + token, apikey: env.SUPABASE_ANON_KEY }
    });
    if (!userRes.ok) return json({ error: 'Session expired — please login again' }, 401, cors);
    const user = await userRes.json();
    const uid = user.id;

    /* profile */
    let prof = null;
    const rows = await sbGet(env, `profiles?id=eq.${uid}&select=plan,provider,model,tokens_balance,tokens_used,wallet_paise`);
    if (Array.isArray(rows) && rows[0]) prof = rows[0];
    if (!prof) prof = { plan: 'free', provider: 'free', model: null, tokens_balance: 0, tokens_used: 0, wallet_paise: 0 };
    const isPaid = prof.plan !== 'free' && prof.tokens_balance > 0
      && (prof.provider === 'openai' || prof.provider === 'anthropic');

    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname.endsWith('/me')) {
      return json({ plan: prof.plan, provider: prof.provider, model: prof.model,
        tokens_balance: prof.tokens_balance, tokens_used: prof.tokens_used,
        wallet_paise: prof.wallet_paise || 0, effective: isPaid ? 'paid' : 'free' }, 200, cors);
    }
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405, cors);

    /* ---------- Deep Research (opt-in): TEMPORARY per-document vector index ----------
       The client only calls this after an explicit consent modal. Data is temporary:
       every vector carries exp = now + 24 h, expired matches are filtered out (and the
       client deletes on document close). Placed BEFORE the chat rate limit because
       indexing runs in short batches.
       Needs two Cloudflare bindings on this worker (Settings → Bindings):
         • Vectorize index  binding name VECTORIZE
             wrangler vectorize create lexora-rag --dimensions=768 --metric=cosine
             wrangler vectorize create-metadata-index lexora-rag --property-name=ns --type=string
         • Workers AI       binding name AI   (embeddings: @cf/baai/bge-base-en-v1.5)
       Until both exist, these endpoints return 503 and the client quietly falls back
       to the on-device Smart AI. */
    if (url.pathname.includes('/rag/')) {
      if (!env.VECTORIZE || !env.AI) return json({ error: 'Deep Research is not enabled yet.' }, 503, cors);
      let rb; try { rb = await request.json(); } catch { return json({ error: 'Bad request' }, 400, cors); }
      const docId = String(rb.docId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
      if (!docId) return json({ error: 'Missing docId' }, 400, cors);
      const ns = uid + ':' + docId;                       /* user-scoped namespace */
      const embed = async texts => (await env.AI.run('@cf/baai/bge-base-en-v1.5', { text: texts })).data;

      if (url.pathname.endsWith('/rag/index')) {
        const chunks = Array.isArray(rb.chunks) ? rb.chunks.slice(0, 40) : [];
        if (!chunks.length) return json({ error: 'No chunks' }, 400, cors);
        const texts = chunks.map(c => String(c.text || '').slice(0, 1200));
        const vecs = await embed(texts);
        const exp = Date.now() + 24 * 3600 * 1000;
        await env.VECTORIZE.upsert(chunks.map((c, k) => ({
          id: ns + ':' + (parseInt(c.i) || 0),
          values: vecs[k],
          metadata: { ns, page: parseInt(c.page) || 0, text: texts[k].slice(0, 900), exp }
        })));
        return json({ ok: true, indexed: chunks.length }, 200, cors);
      }
      if (url.pathname.endsWith('/rag/query')) {
        const q = String(rb.q || '').slice(0, 2000);
        if (!q.trim()) return json({ error: 'Missing question' }, 400, cors);
        const [qv] = await embed([q]);
        const res = await env.VECTORIZE.query(qv, {
          topK: Math.min(parseInt(rb.k) || 8, 15), filter: { ns }, returnMetadata: 'all'
        });
        const now = Date.now();
        const matches = (res.matches || [])
          .filter(m => m.metadata && (!m.metadata.exp || m.metadata.exp > now))
          .map(m => ({ page: m.metadata.page, text: m.metadata.text, score: m.score }));
        return json({ ok: true, matches }, 200, cors);
      }
      if (url.pathname.endsWith('/rag/delete')) {
        const n = Math.min(parseInt(rb.count) || 0, 2000);
        const ids = [];
        for (let k = 0; k <= n; k++) ids.push(ns + ':' + k);
        try { await env.VECTORIZE.deleteByIds(ids); } catch (e) {}
        return json({ ok: true }, 200, cors);
      }
      return json({ error: 'Unknown endpoint' }, 404, cors);
    }

    /* rate limit */
    const rate = await checkRate(env, uid, isPaid);
    if (!rate.ok) return json({ error: rate.why }, 429, cors);

    /* ---------- speech-to-text fallback (browsers without native recognition) ---------- */
    if (url.pathname.endsWith('/stt')) {
      const ct = request.headers.get('content-type') || 'audio/webm';
      if (!/^audio\//.test(ct)) return json({ error: 'Expected audio' }, 400, cors);
      const buf = await request.arrayBuffer();
      if (buf.byteLength < 1000) return json({ error: 'Recording too short.' }, 400, cors);
      if (buf.byteLength > 5_000_000) return json({ error: 'Recording too long — keep it under ~20 seconds.' }, 413, cors);
      const ext = ct.includes('mp4') ? 'audio.mp4' : 'audio.webm';
      const fd = new FormData();
      fd.append('file', new File([buf], ext, { type: ct }));
      fd.append('model', env.STT_MODEL || 'gpt-4o-mini-transcribe');   /* cheapest good STT (~₹0.25/min) */
      const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + env.OPENAI_API_KEY },
        body: fd
      });
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        console.log('stt error', r.status, t.slice(0, 150));
        return json({ error: 'Transcription failed — please try again.' }, 502, cors);
      }
      const j = await r.json();
      return json({ text: (j.text || '').trim() }, 200, cors);
    }

    /* input */
    let body;
    try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400, cors); }
    const { question, context, docName, history, lang } = body || {};
    const replyLang = (typeof lang === 'string' && lang.trim() && lang.length < 40) ? lang.trim() : 'English';
    if (typeof question !== 'string' || !question.trim() || question.length > 4000) return json({ error: 'Invalid question' }, 400, cors);

    const hist = [];
    for (const m of (Array.isArray(history) ? history : []).slice(-6)) {
      if ((m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string') {
        hist.push({ role: m.role, content: m.content.slice(0, 2000) });
      }
    }
    const userMsg = (typeof context === 'string' && context.trim())
      ? `Document: "${String(docName || 'PDF').slice(0, 200)}"\nDocument text (this is ALL you have — there is no more to "read ahead"):\n"""${context.slice(0, 9000)}"""\n\nUser says: ${question}`
      : question;

    /* route */
    /* tier: chosen per request, VALIDATED server-side; document packs are locked to core */
    const tiers = tierTable(env);
    let tier = (typeof body.tier === 'string' && ['core','plus','ultra'].includes(body.tier)) ? body.tier : 'core';
    if (prof.plan === 'doc') tier = 'core';

    /* 🪄 Token Saver: compress the context with the FREE engine before the paid call */
    let msgToSend = userMsg;
    if (isPaid && body.optimize === true && typeof context === 'string' && context.length > 2500) {
      try {
        const optSys = 'You compress document excerpts. Return ONLY the sentences from the text that are needed to answer the question, plus the question itself on the last line. No commentary. Keep original wording.';
        const optIn = `Question: ${question}\n\nText:\n"""${context.slice(0, 9000)}"""`;
        const opt = (env.FREE_PROVIDER || 'openai') === 'bedrock'
          ? await callBedrock(env, optSys, [], optIn)
          : await callOpenAI(env, 'gpt-4o-mini', optSys, [], optIn);
        if (opt && opt.answer && opt.answer.length > 40 && opt.answer.length < userMsg.length) {
          msgToSend = `Document: "${String(docName || 'PDF').slice(0, 200)}"\nRelevant document excerpts (compressed):\n"""${opt.answer}"""\n\nUser says: ${question}`;
        }
      } catch (e) { /* optimizer is best-effort — fall back to the full context */ }
    }

    let result, provider, model, burn = 1;
    const t0 = Date.now();
    try {
      if (isPaid) {
        provider = prof.provider;
        const fam = tiers[provider] || tiers.openai;
        const m = fam[tier] || fam.core;
        model = m.id; burn = m.x;
        const sys = systemPrompt(replyLang, provider === 'anthropic' && m.search);
        result = provider === 'anthropic'
          ? await callAnthropic(env, m.id, sys, hist, msgToSend, m.search)
          : await callOpenAI(env, m.id, sys, hist, msgToSend);
      } else {
        const sys = systemPrompt(replyLang, false);
        if ((env.FREE_PROVIDER || 'openai') === 'bedrock') {
          provider = 'bedrock'; model = env.BEDROCK_MODEL || 'amazon.nova-micro-v1:0';
          result = await callBedrock(env, sys, hist, userMsg);
        } else {
          provider = 'openai'; model = 'gpt-4o-mini';
          result = await callOpenAI(env, model, sys, hist, userMsg);
        }
      }
    } catch (e) {
      /* observability: provider failures with latency */
      console.log(JSON.stringify({ ev: 'chat_fail', provider, model, tier, ms: Date.now() - t0, err: String(e).slice(0, 160) }));
      return json({ error: 'The engine is busy — please try again in a moment.' }, 502, cors);
    }

    /* meter — wallet is denominated in core tokens; higher tiers burn ×multiplier */
    const raw = (result.tin || 0) + (result.tout || 0);
    const total = Math.ceil(raw * burn);
    let balance = prof.tokens_balance;
    if (isPaid && total > 0) {
      const nb = await sbRpc(env, 'deduct_tokens', { uid, amount: total });
      if (typeof nb === 'number') balance = nb;
    }
    sbInsert(env, 'usage_log', { user_id: uid, provider, model, tokens_in: result.tin, tokens_out: result.tout });
    /* observability: one structured line per answered question (Cloudflare Workers Logs) */
    console.log(JSON.stringify({ ev: 'chat_ok', provider, model, tier: isPaid ? tier : 'free',
      tin: result.tin || 0, tout: result.tout || 0, burn, deducted: isPaid ? total : 0,
      optimized: !!(isPaid && body.optimize), ms: Date.now() - t0 }));

    return json({ answer: result.answer, tokens_used: total, tokens_left: isPaid ? balance : null,
      plan: isPaid ? 'paid' : 'free', tier: isPaid ? tier : null }, 200, cors);
  }
};
