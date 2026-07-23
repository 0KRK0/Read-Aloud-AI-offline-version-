/* ============================================================
   Lexora AI — core/api.js
   The single API client. Centralizes every backend call:
     • Gateway  : chat, me, stt, rag.index/query/delete
     • Payments : config, order, verify, switch, wallet.deduct, wallet.buysub
     • Convert  : quote, convert  (premium tool broker)
   Handles auth-header injection + JSON parse + normalized errors,
   so features never hand-roll fetch/auth again. DOM-free.
   Requires core/config.js + core/auth.js.
   ============================================================ */
(function (global) {
  'use strict';
  var Lx = (global.Lx = global.Lx || {});
  var cfg = Lx.config, auth = Lx.auth;

  /* ---- low-level helpers ---- */
  function ApiError(code, message, status) {
    this.name = 'ApiError'; this.code = code; this.message = message; this.status = status || 0;
  }
  ApiError.prototype = Object.create(Error.prototype);

  async function authHeader(required) {
    var t = await auth.token();
    if (!t && required) throw new ApiError('not_logged_in', 'Please log in to continue.', 401);
    return t ? { authorization: 'Bearer ' + t } : {};
  }

  /* Authed fetch with ONE automatic token refresh + retry on 401 — centralizes
     the stale-session handling that used to live in every caller. `auth` may be
     'required' (throws if not logged in) or 'optional' (anonymous allowed). */
  async function authedFetch(url, init, authMode) {
    init = init || {};
    var required = authMode === 'required';
    var hdr = await authHeader(required);
    var res = await fetch(url, Object.assign({}, init, {
      headers: Object.assign({}, init.headers, hdr)
    }));
    if (res.status === 401 && (required || (await auth.token()))) {
      var t2 = await auth.token(true);                 /* force refresh once */
      if (t2) {
        res = await fetch(url, Object.assign({}, init, {
          headers: Object.assign({}, init.headers, { authorization: 'Bearer ' + t2 })
        }));
      }
    }
    return res;
  }

  async function jsonOrThrow(res) {
    var body = null;
    try { body = await res.json(); } catch (e) { /* non-JSON */ }
    if (!res.ok) {
      var msg = (body && body.error) || ('Request failed (' + res.status + ')');
      if (res.status === 401) msg = 'Your session expired — please log in again.';
      throw new ApiError((body && body.code) || 'http_' + res.status, msg, res.status);
    }
    return body;
  }
  async function postJSON(url, payload, opts) {
    opts = opts || {};
    var init = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload || {})
    };
    if (opts.keepalive) init.keepalive = true;   /* survive pagehide (e.g. rag cleanup) */
    var res = await authedFetch(url, init, opts.auth ? 'required' : 'optional');
    return opts.raw ? res : jsonOrThrow(res);
  }

  var G = cfg.GATEWAY_URL, P = cfg.PAY_URL, C = cfg.CONVERT_URL;

  Lx.api = {
    ApiError: ApiError,

    /* ---------------- Gateway (AI companion) ---------------- */
    gateway: {
      /* {question, context?, docName?, history?, lang?, tier?, optimize?}
         → {answer, tokens_used, tokens_left, plan, tier} */
      chat(body) { return postJSON(G + '/chat', body, { auth: true }); },

      /* → {plan, provider, model, tokens_balance, tokens_used, wallet_paise, effective} */
      async me() {
        return jsonOrThrow(await authedFetch(G + '/me', { method: 'GET' }, 'required'));
      },

      /* audio Blob/ArrayBuffer → {text} */
      async stt(audio, contentType) {
        return jsonOrThrow(await authedFetch(G + '/stt', {
          method: 'POST', headers: { 'content-type': contentType || 'audio/webm' }, body: audio
        }, 'required'));
      },

      /* Deep Research (temporary per-document vector index) */
      rag: {
        index(docId, chunks) { return postJSON(G + '/rag/index', { docId: docId, chunks: chunks }, { auth: true }); },
        query(docId, q, k)   { return postJSON(G + '/rag/query', { docId: docId, q: q, k: k }, { auth: true }); },
        remove(docId, count) { return postJSON(G + '/rag/delete', { docId: docId, count: count }, { auth: true, keepalive: true }); }
      }
    },

    /* ---------------- Payments (Razorpay + wallet) ---------------- */
    payments: {
      /* public prices/token sizes (no auth) */
      async config() { return jsonOrThrow(await fetch(P + '/config')); },
      order(payload)   { return postJSON(P + '/order', payload, { auth: true }); },
      verify(payload)  { return postJSON(P + '/verify', payload, { auth: true }); },
      switchEngine()   { return postJSON(P + '/switch', {}, { auth: true }); },
      walletDeduct(b)  { return postJSON(P + '/wallet/deduct', b, { auth: true }); },
      walletBuysub(b)  { return postJSON(P + '/wallet/buysub', b, { auth: true }); }
    },

    /* ---------------- Convert (premium tool broker) ---------------- */
    convert: {
      /* {tool, pages} → the deal (free-left / consent / login / top-up). Auth optional. */
      quote(tool, pages) { return postJSON(C + '/quote', { tool: tool, pages: pages }, { auth: false }); },

      /* multipart run. Returns the raw Response so the caller can read the
         blob + X-Lexora-Charge / X-Lexora-Partial / X-Filename headers.
         Auth optional (anonymous free tier). */
      async run(form) {
        /* no content-type: the browser sets the multipart boundary */
        return authedFetch(C + '/convert', { method: 'POST', body: form }, 'optional');
      }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
