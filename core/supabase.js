/* ============================================================
   Lexora AI — core/supabase.js
   The one Supabase client + session accessors. DOM-free.
   Requires the supabase-js UMD to be loaded first (window.supabase)
   and core/config.js. Everything auth/data goes through Lx.sb.
   ============================================================ */
(function (global) {
  'use strict';
  var Lx = (global.Lx = global.Lx || {});
  var cfg = Lx.config;

  var client = (cfg && cfg.configured && global.supabase)
    ? global.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
    : null;

  Lx.sb = client;                 /* raw client for advanced use (rare) */

  Lx.session = {
    /* current session object or null */
    async get() {
      if (!client) return null;
      try {
        var r = await client.auth.getSession();
        return (r && r.data && r.data.session) || null;
      } catch (e) { return null; }
    },
    /* current user or null */
    async user() {
      var s = await this.get();
      return s ? s.user : null;
    },
    /* subscribe to auth changes: cb(event, session) */
    onChange(cb) {
      if (!client) return function () {};
      var sub = client.auth.onAuthStateChange(function (ev, s) { cb(ev, s); });
      return function () { try { sub.data.subscription.unsubscribe(); } catch (e) {} };
    },
    async signOut() { if (client) { try { await client.auth.signOut(); } catch (e) {} } }
  };
})(typeof window !== 'undefined' ? window : globalThis);
