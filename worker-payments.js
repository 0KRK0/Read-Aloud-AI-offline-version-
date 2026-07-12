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

/* Economics: a plan gives ~40% of its price in raw model cost (₹49 → ≈₹20 of Core
   tokens, ₹99 → ≈₹40) — the rest covers speech-to-text, infra and margin.
   Wallets are denominated in CORE tokens; higher tiers burn ×multiplier (gateway). */
/* Plan configuration — env-overridable so prices/wallets change WITHOUT redeploying:
   PLAN_SWIFT_INR / PLAN_SWIFT_TOKENS / PLAN_SAGE_INR / PLAN_SAGE_TOKENS
   Defaults calibrated for 75–80% gross at FULL consumption (KRK's target):
   Swift 500k @ ~₹18.3/M blended mini-rate = ₹9.2 AI cost → ~79% after Razorpay.
   Sage 120k @ ~₹134/M blended haiku-rate = ₹16.1 + ~₹5 web-search fees → ~76%.
   Unused balances (breakage) push real margins higher. */
function planConfig(env) {
  const swiftInr = parseInt(env.PLAN_SWIFT_INR) || 49,  swiftTok = parseInt(env.PLAN_SWIFT_TOKENS) || 500000;
  const sageInr  = parseInt(env.PLAN_SAGE_INR)  || 99,  sageTok  = parseInt(env.PLAN_SAGE_TOKENS)  || 120000;
  return {
    cat: {
      sub_openai_49: { label: 'Swift plan', inr: swiftInr, tokens: swiftTok, plan: 'sub', provider: 'openai',    model: 'gpt-4o-mini' },
      sub_claude_99: { label: 'Sage plan — with live web search', inr: sageInr, tokens: sageTok, plan: 'sub', provider: 'anthropic', model: 'claude-haiku-4-5' }
    },
    rate: { openai: swiftInr / swiftTok, anthropic: sageInr / sageTok, free: 0 }
  };
}

// Pay-per-document (Swift Core only): pages × 800 tokens × ~4 re-sends, min price
function docQuote(pages) {
  const p = Math.max(1, Math.min(2000, parseInt(pages) || 1));
  const tokens = p * 800 * 4 + 50000;
  const inr = Math.max(19, Math.ceil((tokens / 1e6) * 30 * 2.5)); // Core rate ≈ ₹30/M raw, ×2.5 margin
  return { label: `Unlock this document (${p} pages)`, inr, tokens, plan: 'doc', provider: 'openai', model: 'gpt-4o-mini' };
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
  if (!uid) return { code: 'invalid' };

  /* ₹ wallet top-up — credit the money balance instead of AI tokens */
  if (notes.wallet === '1') {
    const paise = parseInt(notes.paise) || (order.amount | 0);
    if (paise <= 0) return { code: 'invalid' };
    const insW = await fetch(env.SUPABASE_URL + '/rest/v1/transactions', {
      method: 'POST',
      headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify({ user_id: uid, kind: 'wallet_topup', amount_inr: order.amount / 100, razorpay_payment_id: paymentId })
    });
    if (!insW.ok) return { code: 'duplicate', notes };
    const wbal = await sbRpc(env, 'credit_wallet', { uid, paise });
    console.log(JSON.stringify({ wallet_topup: paymentId, uid, paise, wbal }));
    return { code: 'ok', bal: wbal, notes, wallet: true };
  }

  const tokens = parseInt(notes.tokens) || 0;
  if (tokens <= 0) return { code: 'invalid' };

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
  const RATE = planConfig(env).rate;
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

    const CFG = planConfig(env), RATE = CFG.rate;

    /* public plan config — the app reads prices/wallet sizes from here (no auth) */
    if (request.method === 'GET' && url.pathname.endsWith('/config')) {
      const c = CFG.cat;
      return json({
        plans: {
          sub_openai_49: { inr: c.sub_openai_49.inr, tokens: c.sub_openai_49.tokens },
          sub_claude_99: { inr: c.sub_claude_99.inr, tokens: c.sub_claude_99.tokens }
        }
      }, 200, cors);
    }
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
      const r = await fetch(env.SUPABASE_URL + `/rest/v1/profiles?id=eq.${uid}&select=provider,tokens_balance,plan,wallet_paise`, {
        headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY }
      });
      if (!r.ok) return null;
      const rows = await r.json();
      return rows && rows[0];
    }

    /* ---------- free switch: convert balance between plans (both directions) ---------- */
    if (url.pathname.endsWith('/switch')) {
      const cur = await getProfile();
      if (!cur || cur.tokens_balance <= 0 || !RATE[cur.provider]) {
        return json({ error: 'Free switching needs an active paid balance.' }, 400, cors);
      }
      if (cur.plan === 'doc') {
        return json({ error: 'Document packs run on the Swift engine only — subscribe to a plan to switch engines.' }, 400, cors);
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

    /* ---------- ₹ wallet: spend on a paid tool job (charged premium tools) ---------- */
    if (url.pathname.endsWith('/wallet/deduct')) {
      const tool = String(body.tool || '').slice(0, 40);
      const pages = Math.max(0, parseInt(body.pages) || 0);
      const paise = Math.max(0, parseInt(body.paise) || 0);
      if (paise <= 0) return json({ error: 'Nothing to charge.' }, 400, cors);
      const bal = await sbRpc(env, 'deduct_wallet', { uid, paise });
      if (bal === null || bal < 0) {
        const cur = await getProfile();
        return json({ ok: false, error: 'insufficient', wallet_paise: cur ? cur.wallet_paise : 0 }, 402, cors);
      }
      await fetch(env.SUPABASE_URL + '/rest/v1/tool_log', {
        method: 'POST',
        headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'content-type': 'application/json', prefer: 'return=minimal' },
        body: JSON.stringify({ user_id: uid, tool, pages, cost_paise: paise })
      });
      console.log(JSON.stringify({ wallet_deduct: uid, tool, pages, paise, bal }));
      return json({ ok: true, wallet_paise: bal }, 200, cors);
    }

    /* ---------- buy a subscription / top-up FROM the ₹ wallet (no Razorpay) ---------- */
    if (url.pathname.endsWith('/wallet/buysub')) {
      let item;
      if (body.plan === 'topup') {
        const inr = parseInt(body.inr);
        let provider = body.provider === 'anthropic' ? 'anthropic' : 'openai';
        if (!Number.isInteger(inr) || inr < 49 || inr > 5000) return json({ error: 'Amount must be between ₹49 and ₹5000.' }, 400, cors);
        const c0 = await getProfile();
        if (c0 && c0.plan === 'sub' && c0.tokens_balance > 0) provider = c0.provider;
        item = { inr, tokens: Math.floor(inr / RATE[provider]), plan: 'sub', provider, model: provider === 'anthropic' ? 'claude-haiku-4-5' : 'gpt-4o-mini' };
      } else {
        item = CFG.cat[body.plan];
      }
      if (!item) return json({ error: 'Unknown plan' }, 400, cors);
      const paise = item.inr * 100;
      const wbal = await sbRpc(env, 'deduct_wallet', { uid, paise });
      if (wbal === null || wbal < 0) {
        const cur0 = await getProfile();
        return json({ ok: false, error: 'insufficient', wallet_paise: cur0 ? cur0.wallet_paise : 0, need_paise: paise }, 402, cors);
      }
      // value-convert an existing balance if switching engines (same rule as /verify and /switch)
      let delta = item.tokens;
      const cur = await getProfile();
      if (cur && cur.tokens_balance > 0 && cur.provider !== item.provider && RATE[cur.provider] && RATE[item.provider]) {
        const converted = Math.floor(cur.tokens_balance * RATE[cur.provider] / RATE[item.provider]);
        delta = item.tokens + converted - cur.tokens_balance;
      }
      const tbal = await sbRpc(env, 'credit_tokens', { uid, amount: delta, new_plan: item.plan, new_provider: item.provider, new_model: item.model });
      await fetch(env.SUPABASE_URL + '/rest/v1/transactions', {
        method: 'POST',
        headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'content-type': 'application/json', prefer: 'return=minimal' },
        body: JSON.stringify({ user_id: uid, kind: 'sub_from_wallet', amount_inr: item.inr, tokens_credited: item.tokens, provider: item.provider })
      });
      console.log(JSON.stringify({ buysub_wallet: uid, plan: item.plan, provider: item.provider, inr: item.inr, wbal, tbal }));
      return json({ ok: true, wallet_paise: wbal, tokens_balance: tbal, provider: item.provider, plan: item.plan }, 200, cors);
    }

    /* ---------- create order ---------- */
    if (url.pathname.endsWith('/order')) {
      let item;
      if (body.plan === 'doc') {
        item = docQuote(body.pages);
      } else if (body.plan === 'wallet') {
        /* universal ₹ wallet top-up — credits the money balance, not tokens */
        const inr = parseInt(body.inr);
        if (!Number.isInteger(inr) || inr < 20 || inr > 5000) return json({ error: 'Top-up must be between ₹20 and ₹5000.' }, 400, cors);
        item = { label: `Wallet top-up ₹${inr}`, inr, wallet: true, paise: inr * 100 };
      } else if (body.plan === 'topup') {
        /* custom amount — tokens computed SERVER-side at the plan's value rate */
        const inr = parseInt(body.inr);
        let provider = body.provider === 'anthropic' ? 'anthropic' : 'openai';
        if (!Number.isInteger(inr) || inr < 49 || inr > 5000) return json({ error: 'Amount must be between ₹49 and ₹5000.' }, 400, cors);
        const cur = await getProfile();
        if (cur && cur.plan === 'sub' && cur.tokens_balance > 0) provider = cur.provider;   /* subscribers top up their own engine */
        item = {
          label: `Custom top-up ₹${inr} — ${provider === 'anthropic' ? 'Sage' : 'Swift'}`,
          inr,
          tokens: Math.floor(inr / RATE[provider]),
          plan: 'sub', provider,
          model: provider === 'anthropic' ? 'claude-haiku-4-5' : 'gpt-4o-mini'
        };
      } else {
        item = CFG.cat[body.plan];
      }
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
          notes: item.wallet
            ? { uid, wallet: '1', paise: String(item.paise) }
            : { uid, tokens: String(item.tokens), plan: item.plan, provider: item.provider, model: item.model }
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
        // wallet top-ups report the ₹ balance; everything else reports the token balance
        const bal = notes.wallet === '1' ? (cur ? cur.wallet_paise : null) : (cur ? cur.tokens_balance : null);
        return json({ ok: true, tokens_balance: bal, wallet: notes.wallet === '1', plan: notes.plan, provider: notes.provider, model: notes.model, already: true }, 200, cors);
      }
      return json({ ok: true, tokens_balance: res.bal, plan: notes.plan, provider: notes.provider, model: notes.model }, 200, cors);
    }

    return json({ error: 'Unknown endpoint' }, 404, cors);
  }
};
