/* ============================================================
   Lexora AI — core/auth.js
   Authentication surface: tokens, login (with ?next= redirect
   preservation), guest, logout, returning-user flag. DOM-free.
   Requires core/config.js + core/supabase.js.
   ============================================================ */
(function (global) {
  'use strict';
  var Lx = (global.Lx = global.Lx || {});
  var cfg = Lx.config, ses = Lx.session;

  Lx.auth = {
    /* Bearer token for API calls (optionally force a refresh). null if not logged in. */
    async token(forceRefresh) {
      if (!Lx.sb) return null;
      try {
        if (forceRefresh) {
          var r = await Lx.sb.auth.refreshSession();
          if (r && r.data && r.data.session) return r.data.session.access_token;
        }
        var s = await ses.get();
        return s ? s.access_token : null;
      } catch (e) { return null; }
    },

    async isLoggedIn() { return !!(await ses.get()); },
    user() { return ses.user(); },
    onChange(cb) { return ses.onChange(cb); },

    /* mark that this device has logged in before (skips the public landing) */
    markReturning() { try { localStorage.setItem(cfg.keys.returning, '1'); } catch (e) {} },
    isReturning() { try { return localStorage.getItem(cfg.keys.returning) === '1'; } catch (e) { return false; } },

    /* whitelist a fragment-only ?next= (no open redirect) for post-login return */
    safeNext() {
      var n = new URLSearchParams(location.search).get('next') || '';
      return /^#[\w-]{0,40}$/.test(n) ? n : '';
    },
    /* send the user to login, preserving where they were headed */
    goLogin(nextHash) {
      var q = nextHash ? ('?next=' + encodeURIComponent(nextHash)) : '';
      location.href = 'login.html' + q;
    },

    async logout() { await ses.signOut(); location.reload(); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
