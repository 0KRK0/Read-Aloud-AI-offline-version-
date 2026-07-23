/* ============================================================
   Lexora AI — utils/format.js
   Pure formatting helpers (no DOM, no side effects). Lx.fmt.
   ============================================================ */
(function (global) {
  'use strict';
  var Lx = (global.Lx = global.Lx || {});

  Lx.fmt = {
    /* paise (integer) → "₹337.00" */
    rupees(paise) { return '₹' + ((paise || 0) / 100).toFixed(2); },

    /* token count → "10.34M" / "132k" / "500" */
    tokens(n) {
      n = n || 0;
      return n >= 1e6 ? (n / 1e6).toFixed(2) + 'M'
           : n >= 1000 ? Math.round(n / 1000) + 'k'
           : String(n);
    },

    /* bytes → "2.3 MB" / "393 KB" */
    bytes(b) {
      return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB'
                         : Math.max(1, Math.round(b / 1024)) + ' KB';
    },

    /* a human way to refer to a document, hiding messy machine filenames */
    friendlyName(name, kind) {
      var base = String(name || '').replace(/\.[a-z0-9]{2,5}$/i, '');
      var messy = /\d{4,}/.test(base)
        || /^(IMG|DSC|PXL|WA|Screenshot|WhatsApp|Scan)[-_ ]?/i.test(base)
        || base.length > 40 || !/[a-z]{3}/i.test(base);
      if (kind === 'scan')  return 'your scan';
      if (kind === 'photo') return messy ? 'your photo' : 'your photo "' + base + '"';
      return messy ? 'your document' : '"' + base + '"';
    },

    /* truncate a long filename in the middle: "VeryLongName.pdf" → "VeryLo…me.pdf" */
    ellipsizeMiddle(name, max) {
      max = max || 28;
      if (name.length <= max) return name;
      var dot = name.lastIndexOf('.');
      var ext = dot > 0 ? name.slice(dot) : '';
      var stem = dot > 0 ? name.slice(0, dot) : name;
      var keep = max - ext.length - 1;
      if (keep < 4) return name.slice(0, max - 1) + '…';
      return stem.slice(0, Math.ceil(keep * 0.6)) + '…' + stem.slice(-Math.floor(keep * 0.4)) + ext;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
