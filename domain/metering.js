/* ============================================================
   Lexora AI — domain/metering.js
   The AI plan / engine / tier business model — pure data + math.
   User-facing engine NAMES only (provider ids never shown, per the
   product policy). Prices/token sizes load at runtime from the
   payments /config (never hardcoded as truth), with safe defaults.
   Lx.plans. Requires core/config.js + core/api.js.
   ============================================================ */
(function (global) {
  'use strict';
  var Lx = (global.Lx = global.Lx || {});

  /* provider id → user-facing character name (hidden-provider policy) */
  var ENGINE = { openai: 'Swift', anthropic: 'Sage', free: 'Spark', bedrock: 'Spark' };
  var TIER_LABEL = { core: 'Core', plus: 'Plus', ultra: 'Ultra' };

  /* plan key → { inr, tokens }. Defaults; overwritten by loadConfig(). */
  var PLAN = {
    sub_openai_49: { inr: 49, tokens: 500000, provider: 'openai' },
    sub_claude_99: { inr: 99, tokens: 120000, provider: 'anthropic' }
  };
  /* ₹ per token, per provider (for value-preserving engine switches) */
  function rate(provider) {
    if (provider === 'anthropic') return PLAN.sub_claude_99.inr / PLAN.sub_claude_99.tokens;
    if (provider === 'openai')    return PLAN.sub_openai_49.inr / PLAN.sub_openai_49.tokens;
    return 0;
  }

  Lx.plans = {
    ENGINE: ENGINE,
    TIER_LABEL: TIER_LABEL,

    engineName(provider) { return ENGINE[provider] || 'Swift'; },
    tierLabel(tier) { return TIER_LABEL[tier] || 'Core'; },

    /* price in ₹ for a plan card key */
    priceInr(planKey) { return (PLAN[planKey] && PLAN[planKey].inr) || (planKey === 'sub_claude_99' ? 99 : 49); },
    provider(planKey) { return planKey === 'sub_claude_99' ? 'anthropic' : 'openai'; },

    /* tokens you'd get for ₹amt on a provider */
    tokensForRupees(provider, amt) {
      var r = rate(provider);
      return r ? Math.floor(amt / r) : 0;
    },

    /* value-preserving conversion when switching engines */
    convertBalance(fromProvider, toProvider, balance) {
      var rf = rate(fromProvider), rt = rate(toProvider);
      return (rf && rt) ? Math.floor(balance * rf / rt) : balance;
    },

    /* pay-per-document quote (Swift Core): mirrors the payments worker */
    docQuote(pages) {
      var p = Math.max(1, Math.min(2000, parseInt(pages, 10) || 1));
      var tokens = p * 800 * 4 + 50000;
      var inr = Math.max(19, Math.ceil((tokens / 1e6) * 30 * 2.5));
      return { pages: p, tokens: tokens, inr: inr };
    },

    /* refresh prices/token sizes from the live worker config (no redeploy drift) */
    async loadConfig() {
      try {
        if (!Lx.api) return;
        var c = await Lx.api.payments.config();
        if (!c || !c.plans) return;
        ['sub_openai_49', 'sub_claude_99'].forEach(function (k) {
          var p = c.plans[k];
          if (p && p.inr && p.tokens) { PLAN[k].inr = p.inr; PLAN[k].tokens = p.tokens; }
        });
      } catch (e) { /* keep built-in defaults */ }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
