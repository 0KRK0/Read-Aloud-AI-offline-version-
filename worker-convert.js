// ============================================================
// Lexora AI — PREMIUM conversion gateway (Phase 4)
// Deploy as a separate Cloudflare Worker, e.g. named: readaloudai-convert
//
// Sits between the browser and a SWAPPABLE dedicated conversion server
// (LibreOffice / Ghostscript / a commercial SDK — KRK provisions it and points
// CONVERT_SERVER_URL at it). This gateway enforces the business rules; the server
// only does the actual conversion.
//
// FREE-TIER MODEL (iLovePDF-style — no login needed to start):
//   • 50 free pages/day per tool.
//       - logged in  → tracked per USER (tool_pages_today, by uid)
//       - anonymous  → tracked per DEVICE by HASHED IP (tool_pages_today_ip).
//         Survives new tab / incognito / browser switch on the same connection.
//         (VPN / mobile-data reset is the accepted residual gap — true everywhere.)
//   • Upload 100 pages while anonymous → the first 50 (today's free-left) convert for
//     free (PARTIAL), and the response flags "log in to do the full document".
//   • Logged in + over the cap → ₹0.10/page (min ₹5, cap ₹99) from the ₹ wallet.
//     Anonymous users CANNOT pay (no wallet) — they must log in to go past the free cap.
//
// Endpoints:
//   POST /quote   {tool, pages}          (auth optional)
//     -> {ok, loggedIn, freeCap, usedToday, freeLeft, pages, convertPages,
//         billablePages, charge_paise, wallet_paise, enough, needLogin, partial}
//        Call BEFORE running so the UI can show the deal / consent / login / top-up.
//   POST /convert  multipart: file, tool, pages, consent=1   (auth optional)
//     -> streams the converted file back with headers X-Lexora-Charge and
//        X-Lexora-Partial (1 = only the first N pages were done; log in for the rest).
//        Charges server-side, logs usage, forwards to the conversion server (with
//        maxPages), refunds on failure.
//
// Env vars:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY (Secret)
//   ALLOWED_ORIGIN        e.g. https://lexoraai.online (comma-separated ok)
//   CONVERT_SERVER_URL    the dedicated conversion server base URL (no trailing slash)
//   CONVERT_SERVER_KEY    (Secret) bearer token the conversion server checks
//   IP_SALT               (Secret) salt for hashing anonymous IPs
//   FREE_PAGE_CAP         default 50    (free pages per tool per day)
//   PRICE_PER_PAGE_PAISE  default 10    (₹0.10 per page over the cap)
//   MIN_CHARGE_PAISE      default 500   (₹5 minimum per paid job)
//   CAP_CHARGE_PAISE      default 9900  (₹99 maximum per paid job)
// ============================================================

function intEnv(v, d) { const n = parseInt(v); return Number.isFinite(n) ? n : d; }
function clampPages(v) { const n = parseInt(v) || 1; return Math.max(1, Math.min(5000, n)); }

function corsHeaders(request, env) {
  const allowed = (env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  const origin = request.headers.get('origin') || '';
  const allow = allowed.length === 0 ? '*' : (allowed.includes(origin) ? origin : allowed[0]);
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Expose-Headers': 'X-Lexora-Charge, X-Lexora-Partial, X-Filename',
    'Vary': 'Origin'
  };
}
function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...cors } });
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
async function walletPaise(env, uid) {
  const r = await fetch(env.SUPABASE_URL + `/rest/v1/profiles?id=eq.${uid}&select=wallet_paise`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY }
  });
  if (!r.ok) return 0;
  const rows = await r.json();
  return (rows && rows[0] && rows[0].wallet_paise) || 0;
}
async function logTool(env, id, tool, pages, cost) {
  await fetch(env.SUPABASE_URL + '/rest/v1/tool_log', {
    method: 'POST',
    headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'content-type': 'application/json', prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: id.uid, ip_hash: id.ipHash, tool, pages, cost_paise: cost })
  }).catch(() => {});
}
async function hashIp(ip, salt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode((ip || '') + '|' + (salt || 'lexora')));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}
// who is this? logged-in user (uid) or anonymous device (hashed IP)
async function identify(request, env) {
  const token = (request.headers.get('authorization') || '').replace('Bearer ', '');
  if (token) {
    const ur = await fetch(env.SUPABASE_URL + '/auth/v1/user', { headers: { authorization: 'Bearer ' + token, apikey: env.SUPABASE_ANON_KEY } });
    if (ur.ok) { const u = await ur.json(); return { uid: u.id, ipHash: null, loggedIn: true }; }
  }
  const ip = request.headers.get('cf-connecting-ip') || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  return { uid: null, ipHash: await hashIp(ip, env.IP_SALT), loggedIn: false };
}
async function usedToday(env, id, tool) {
  if (id.uid) return (await sbRpc(env, 'tool_pages_today', { uid: id.uid, t: tool })) || 0;
  return (await sbRpc(env, 'tool_pages_today_ip', { iph: id.ipHash, t: tool })) || 0;
}
function overCapCharge(env, billable) {
  if (billable <= 0) return 0;
  const per = intEnv(env.PRICE_PER_PAGE_PAISE, 10), min = intEnv(env.MIN_CHARGE_PAISE, 500), capC = intEnv(env.CAP_CHARGE_PAISE, 9900);
  return Math.min(capC, Math.max(min, billable * per));
}

async function forwardToServer(env, file, tool, maxPages) {
  const fwd = new FormData();
  fwd.append('file', file, (file.name || 'input'));
  fwd.append('tool', tool);
  fwd.append('maxPages', String(maxPages));   // server converts only the first maxPages
  return fetch(env.CONVERT_SERVER_URL.replace(/\/$/, '') + '/convert', {
    method: 'POST', headers: { authorization: 'Bearer ' + (env.CONVERT_SERVER_KEY || '') }, body: fwd
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405, cors);

    const allowed = (env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
    const origin = request.headers.get('origin') || '';
    if (allowed.length && !allowed.includes(origin)) return json({ error: 'Origin not allowed' }, 403, cors);

    const cap = intEnv(env.FREE_PAGE_CAP, 50);
    const id = await identify(request, env);   // uid OR hashed IP — no login required

    // ---- /quote : describe the deal BEFORE running ----
    if (url.pathname.endsWith('/quote')) {
      let body; try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400, cors); }
      const tool = String(body.tool || '').slice(0, 40);
      const pages = clampPages(body.pages);
      const used = await usedToday(env, id, tool);
      const freeLeft = Math.max(0, cap - used);

      if (id.loggedIn) {
        const billable = Math.max(0, pages - freeLeft);
        const charge = overCapCharge(env, billable);
        const wallet = await walletPaise(env, id.uid);
        return json({ ok: true, loggedIn: true, freeCap: cap, usedToday: used, freeLeft, pages, convertPages: pages, billablePages: billable, charge_paise: charge, wallet_paise: wallet, enough: wallet >= charge, needLogin: false, partial: false }, 200, cors);
      }
      // anonymous: can only use the free allowance; big files convert partially
      const convertPages = Math.min(pages, freeLeft);
      return json({ ok: true, loggedIn: false, freeCap: cap, usedToday: used, freeLeft, pages, convertPages, billablePages: 0, charge_paise: 0, needLogin: pages > convertPages, partial: pages > convertPages && convertPages > 0 }, 200, cors);
    }

    // ---- /convert : charge (if any) + forward + stream result ----
    if (url.pathname.endsWith('/convert')) {
      let form; try { form = await request.formData(); } catch { return json({ error: 'Send the file as multipart/form-data.' }, 400, cors); }
      const file = form.get('file');
      const tool = String(form.get('tool') || '').slice(0, 40);
      const pages = clampPages(form.get('pages'));
      const consent = String(form.get('consent') || '') === '1';
      if (!file) return json({ error: 'No file.' }, 400, cors);
      if (!consent) return json({ error: 'consent_required' }, 400, cors);
      if (!env.CONVERT_SERVER_URL) return json({ error: 'The premium conversion server is not connected yet — coming soon.' }, 503, cors);

      const used = await usedToday(env, id, tool);
      const freeLeft = Math.max(0, cap - used);
      let convertPages, charge = 0, partial = false;

      if (id.loggedIn) {
        convertPages = pages;                                   // paid users get the whole file
        const billable = Math.max(0, pages - freeLeft);
        charge = overCapCharge(env, billable);
        if (charge > 0) {
          const bal = await sbRpc(env, 'deduct_wallet', { uid: id.uid, paise: charge });
          if (bal === null || bal < 0) return json({ ok: false, error: 'insufficient', charge_paise: charge, wallet_paise: await walletPaise(env, id.uid) }, 402, cors);
        }
      } else {
        convertPages = Math.min(pages, freeLeft);               // anonymous: only the free-left
        partial = pages > convertPages;
        if (convertPages <= 0) return json({ ok: false, error: 'daily_limit', needLogin: true, freeCap: cap }, 429, cors);
      }

      await logTool(env, id, tool, convertPages, charge);

      let sr;
      try { sr = await forwardToServer(env, file, tool, convertPages); }
      catch (e) {
        if (charge > 0) await sbRpc(env, 'credit_wallet', { uid: id.uid, paise: charge });
        return json({ error: 'Could not reach the conversion server — you were not charged.' }, 502, cors);
      }
      if (!sr.ok) {
        if (charge > 0) await sbRpc(env, 'credit_wallet', { uid: id.uid, paise: charge });
        const t = await sr.text().catch(() => '');
        console.log('convert server error', sr.status, t.slice(0, 200));
        return json({ error: 'The conversion failed on the server (' + sr.status + ') — you were not charged.' }, 502, cors);
      }

      const out = await sr.arrayBuffer();
      const headers = {
        'content-type': sr.headers.get('content-type') || 'application/octet-stream',
        'X-Lexora-Charge': String(charge),
        'X-Lexora-Partial': partial ? '1' : '0',
        ...cors
      };
      const name = sr.headers.get('x-filename'); if (name) headers['X-Filename'] = name;
      console.log(JSON.stringify({ convert: id.uid || 'anon', tool, pages: convertPages, charge, partial }));
      return new Response(out, { status: 200, headers });
    }

    return json({ error: 'Unknown endpoint' }, 404, cors);
  }
};
