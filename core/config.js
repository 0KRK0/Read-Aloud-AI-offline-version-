/* ============================================================
   Lexora AI — core/config.js
   Single source of truth for all endpoints + runtime config.
   DOM-free. Loads first; every other module reads from Lx.config.
   Prices/caps/models are NOT hardcoded here — they come at runtime
   from the payments /config and gateway /me (see core/api.js).
   ============================================================ */
(function (global) {
  'use strict';
  var Lx = (global.Lx = global.Lx || {});

  var config = {
    /* Supabase (auth + Postgres). Anon/publishable key is safe on the client. */
    SUPABASE_URL:      'https://lgwqqytjqoenozhjhbkr.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_lK4DQ5LVguBYO-4afNbbVw_J_WLNlWv',

    /* Cloudflare Workers (stateless edge). */
    GATEWAY_URL: 'https://readaloudai.konarajeshkumar011.workers.dev',        // /chat /me /stt /rag/*
    PAY_URL:     'https://readaloudai-pay.konarajeshkumar011.workers.dev',    // /order /verify /switch /wallet/* /config
    CONVERT_URL: 'https://readaloud-convert.konarajeshkumar011.workers.dev',  // /quote /convert (premium broker)

    /* localStorage keys (namespaced, one place) */
    keys: {
      consent:   'ra_consent',
      returning: 'ra_returning',
      theme:     'ra_theme',
      tier:      'ra_tier',
      saver:     'ra_saver',
      aiMode:    'ra_ai_mode',
      tourDone:  'ra_tour_done'
    }
  };

  /* `configured` = backend wired (placeholder keys mean reader-only mode). */
  config.configured = !config.SUPABASE_URL.startsWith('PASTE');

  Lx.config = config;
})(typeof window !== 'undefined' ? window : globalThis);
