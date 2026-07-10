// ============================================================
// ReadAloud AI — PAYMENTS worker (Razorpay)
// Deploy as a separate worker, e.g. named: readaloudai-pay
//
// Endpoints (require Supabase login, except /webhook):
//   POST /order  {plan: 'sub_openai_49' | 'sub_claude_99' | 'doc', pages?}
//        -> creates a Razorpay order, returns {order_id, amount, key_id, label}
//   POST /verify {razorpay_order_id, razorpay_payment_id, razorpay_signature}
//        -> verifies signature, credits the token wallet, returns {ok, tokens_balance}
//   POST /switch
//        -> free provider switch: converts remaining balance by value (both directions)
//   POST /webhook  (called by RAZORPAY's servers, not the browser — no login)
//        -> safety net: credits the wallet even if the user closed the tab
//           before /verify could run. Idempotent — never double-credits.
//
// Env vars:
//   RAZORPAY_KEY_ID          rzp_test_... (Text)   — switch to rzp_live_... after KYC
//   RAZORPAY_KEY_SECRET      (Secret)
//   RAZORPAY_WEBHOOK_SECRET  (Secret) — set the same value in Razorpay Dashboard
//                            → Settings → Webhooks → Add: URL = <this worker>/webhook,
//                              event = payment.captured
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY (Secret)
//   ALLOWED_ORIGIN           e.g. http://localhost:8977 or your site (comma-separated ok)
// ============================================================

const CATALOG = {
  sub_openai_49: { label: 'OpenAI plan — GPT-4o mini', inr: 49,  tokens: 2000000, plan: 'sub', provider: 'openai',    model: 'gpt-4o-mini' },
  sub_claude_99: { label: 'Claude plan — Haiku + web search', inr: 99, tokens: 1200000, plan: 'sub', provider: 'anthropic', model: 'claude-haiku-4-5' }
};
// retail INR per token: openai ₹49/2M, anthropic ₹99/1.2M — used for value-based conversion
const RATE = { openai: 49 / 2000000, anthropic: 99 / 1200000, free: 0 };

// Pay-per-document: pages × 800 tokens × ~4 (context is re-sent per question) with min price
function docQuote(pages) {
  const p = Math.max(1, Math.min(2000, parseInt(pages) || 1));
  const tokens = p * 800 * 4 + 50000;
  const inr = Math.max(19, Math.ceil((tokens / 1e6) * 90 * 2.5)); // Claude-Haiku-rate ≈ ₹90/M, ×2.5 margin
  return { label: `Unlock this document (${p} pages)`, inr, tokens, plan: 'doc', provider: 'anthropic', model: 'claude-haiku-4-5' };
}

function corsHeaders(request, env) {
  const allowed = (env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  const origin = request.headers.get('origin') || '';
  const allow = allowed.length === 0 ? '*' : (allowed.includes(origin) ? origin : allowed[0]);
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}
function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...cors } });
}
async function hmacHex(secret, msg) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg));
  return [...new Uint8Array(s)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function rzpAuth(env) {
  return 'Basic ' + btoa(env.RAZORPAY_KEY_ID + ':' + env.RAZORPAY_KEY_SECRET);
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

/* ---------- shared: credit the wallet from a paid Razorpay order ----------
   Idempotent: the transactions table has a unique razorpay_payment_id, so a
   second attempt (verify + webhook racing) safely returns 'duplicate'.
   Returns {code:'ok', bal, notes} | {code:'duplicate', notes} | {code:'invalid'} */
async function creditOrder(env, order, paymentId) {
  const notes = order.notes || {};
  const uid = notes.uid;
  const tokens = parseInt(notes.tokens) || 0;
  if (!uid || tokens <= 0) return { code: 'invalid' };

  // idempotency — refuse double-crediting the same payment
  const ins = await fetch(env.SUPABASE_URL + '/rest/v1/transactions', {
    method: 'POST',
    headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'content-type': 'application/json', prefer: 'return=minimal' },
    body: JSON.stringify({
      user_id: uid, kind: notes.plan, amount_inr: order.amount / 100,
      tokens_credited: tokens, provider: notes.provider, razorpay_payment_id: paymentId
    })
  });
  if (!ins.ok) return { code: 'duplicate', notes };

  // credit the wallet — with value-based conversion when switching providers
  let delta = tokens;
  const profR = await fetch(env.SUPABASE_URL + `/rest/v1/profiles?id=eq.${uid}&select=provider,tokens_balance`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY }
  });
  if (profR.ok) {
    const rows = await profR.json();
    const cur = rows && rows[0];
    if (cur && cur.tokens_balance > 0 && cur.provider !== notes.provider && RATE[cur.provider] && RATE[notes.provider]) {
      const converted = Math.floor(cur.tokens_balance * RATE[cur.provider] / RATE[notes.provider]);
      delta = tokens + converted - cur.tokens_balance;  // final balance = purchased + converted
    }
  }
  const bal = await sbRpc(env, 'credit_tokens', {
    uid, amount: delta, new_plan: notes.plan, new_provider: notes.provider, new_model: notes.model
  });
  console.log(JSON.stringify({ pay: paymentId, uid, tokens, bal }));
  return { code: 'ok', bal, notes };
}

/* ---------- webhook: Razorpay's servers call this directly (no browser, no login) ---------- */
async function handleWebhook(request, env) {
  if (!env.RAZORPAY_WEBHOOK_SECRET) return new Response('webhook not configured', { status: 500 });
  const raw = await request.text();
  const sig = request.headers.get('x-razorpay-signature') || '';
  const expected = await hmacHex(env.RAZORPAY_WEBHOOK_SECRET, raw);
  if (expected !== sig) return new Response('bad signature', { status: 403 });

  let evt;
  try { evt = JSON.parse(raw); } catch { return new Response('bad json', { status: 400 }); }
  if (evt.event !== 'payment.captured') return new Response('ignored', { status: 200 });

  const pay = evt.payload && evt.payload.payment && evt.payload.payment.entity;
  if (!pay || !pay.order_id) return new Response('no order', { status: 200 });

  // fetch the order from Razorpay — never trust the payload alone for amounts/tokens
  const or = await fetch('https://api.razorpay.com/v1/orders/' + pay.order_id, {
    headers: { authorization: rzpAuth(env) }
  });
  if (!or.ok) return new Response('order lookup failed', { status: 500 }); // non-2xx → Razorpay retries later
  const order = await or.json();

  const res = await creditOrder(env, order, pay.id);
  if (res.code === 'ok') console.log(JSON.stringify({ webhook_credited: pay.id }));
  // duplicate = /verify already credited it — that's success, tell Razorpay 200 so it stops retrying
  return new Response(res.code, { status: res.code === 'invalid' ? 400 : 200 });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* webhook comes from Razorpay's servers: no Origin header, no Supabase login */
    if (request.method === 'POST' && url.pathname.endsWith('/webhook')) {
      return handleWebhook(request, env);
    }

    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405, cors);

    const allowed = (env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
    const origin = request.headers.get('origin') || '';
    if (allowed.length && !allowed.includes(origin)) return json({ error: 'Origin not allowed' }, 403, cors);

    // auth
    const token = (request.headers.get('authorization') || '').replace('Bearer ', '');
    if (!token) return json({ error: 'Not logged in' }, 401, cors);
    const userRes = await fetch(env.SUPABASE_URL + '/auth/v1/user', {
      headers: { authorization: 'Bearer ' + token, apikey: env.SUPABASE_ANON_KEY }
    });
    if (!userRes.ok) return json({ error: 'Session expired — please login again' }, 401, cors);
    const user = await userRes.json();
    const uid = user.id;

    let body;
    try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400, cors); }

    async function getProfile() {
      const r = await fetch(env.SUPABASE_URL + `/rest/v1/profiles?id=eq.${uid}&select=provider,tokens_balance,plan`, {
        headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY }
      });
      if (!r.ok) return null;
      const rows = await r.json();
      return rows && rows[0];
    }

    /* ---------- free switch: convert balance between providers (both directions) ---------- */
    if (url.pathname.endsWith('/switch')) {
      const cur = await getProfile();
      if (!cur || cur.tokens_balance <= 0 || !RATE[cur.provider]) {
        return json({ error: 'Free switching needs an active paid balance.' }, 400, cors);
      }
      const target = cur.provider === 'openai' ? 'anthropic' : 'openai';
      const model = target === 'anthropic' ? 'claude-haiku-4-5' : 'gpt-4o-mini';
      const converted = Math.floor(cur.tokens_balance * RATE[cur.provider] / RATE[target]);
      const delta = converted - cur.tokens_balance;
      const bal = await sbRpc(env, 'credit_tokens', {
        uid, amount: delta, new_plan: cur.plan || 'sub', new_provider: target, new_model: model
      });
      console.log(JSON.stringify({ switch: uid, from: cur.provider, to: target, bal }));
      return json({ ok: true, tokens_balance: bal, provider: target }, 200, cors);
    }

    /* ---------- create order ---------- */
    if (url.pathname.endsWith('/order')) {
      const item = body.plan === 'doc' ? docQuote(body.pages) : CATALOG[body.plan];
      if (!item) return json({ error: 'Unknown plan' }, 400, cors);
      /* pay-per-document is for users without an active subscription */
      if (body.plan === 'doc') {
        const cur = await getProfile();
        if (cur && cur.plan === 'sub' && cur.tokens_balance > 0) {
          return json({ error: 'You already have an active subscription — no need to unlock single documents.' }, 400, cors);
        }
      }
      const r = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: { authorization: rzpAuth(env), 'content-type': 'application/json' },
        body: JSON.stringify({
          amount: item.inr * 100,           // paise
          currency: 'INR',
          receipt: 'ra_' + Date.now(),
          notes: { uid, tokens: String(item.tokens), plan: item.plan, provider: item.provider, model: item.model }
        })
      });
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        console.log('rzp order error', r.status, t.slice(0, 200));
        return json({ error: 'Could not start payment. Try again.' }, 502, cors);
      }
      const order = await r.json();
      return json({ order_id: order.id, amount: order.amount, currency: 'INR', key_id: env.RAZORPAY_KEY_ID, label: item.label }, 200, cors);
    }

    /* ---------- verify payment & credit wallet ---------- */
    if (url.pathname.endsWith('/verify')) {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body || {};
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) return json({ error: 'Missing fields' }, 400, cors);

      // 1. signature check (proves payment is genuine)
      const expected = await hmacHex(env.RAZORPAY_KEY_SECRET, razorpay_order_id + '|' + razorpay_payment_id);
      if (expected !== razorpay_signature) return json({ error: 'Signature mismatch' }, 403, cors);

      // 2. fetch the order from Razorpay (never trust the client for amounts/tokens)
      const or = await fetch('https://api.razorpay.com/v1/orders/' + razorpay_order_id, {
        headers: { authorization: rzpAuth(env) }
      });
      if (!or.ok) return json({ error: 'Order lookup failed' }, 502, cors);
      const order = await or.json();
      const notes = order.notes || {};
      if (notes.uid !== uid) return json({ error: 'Order does not belong to you' }, 403, cors);

      // 3+4. idempotent credit (shared with /webhook)
      const res = await creditOrder(env, order, razorpay_payment_id);
      if (res.code === 'invalid') return json({ error: 'Invalid order' }, 400, cors);
      if (res.code === 'duplicate') {
        // webhook already credited this payment — that's a success for the user
        const cur = await getProfile();
        return json({ ok: true, tokens_balance: cur ? cur.tokens_balance : null, plan: notes.plan, provider: notes.provider, model: notes.model, already: true }, 200, cors);
      }
      return json({ ok: true, tokens_balance: res.bal, plan: notes.plan, provider: notes.provider, model: notes.model }, 200, cors);
    }

    return json({ error: 'Unknown endpoint' }, 404, cors);
  }
};
