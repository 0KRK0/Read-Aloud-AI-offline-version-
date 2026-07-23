/* ============================================================
   Lexora AI — lx-icons.js (Redesign v2)
   Retires emoji glyphs: swaps them for a consistent Lucide-style
   line-icon set (stroke 1.75, currentColor) wherever tool cards
   and plan cards render. Runs as a DOM post-processor so the
   fragile tools-page.js KIT[] never needs touching.
   Classic script; no dependencies. Idempotent (data-lx-icon).
   ============================================================ */
(function(){
'use strict';

function S(inner){
  return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+inner+'</svg>';
}

var I = {
  doc:      S('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'),
  merge:    S('<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/>'),
  split:    S('<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>'),
  trash:    S('<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
  grid:     S('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>'),
  rotate:   S('<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>'),
  compress: S('<polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/>'),
  wrench:   S('<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>'),
  search:   S('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'),
  image:    S('<rect x="3" y="3" width="18" height="18"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>'),
  type:     S('<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>'),
  hash:     S('<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>'),
  drop:     S('<path d="M12 2.7 6.3 8.4a8 8 0 1 0 11.4 0z"/>'),
  unlock:   S('<rect x="3" y="11" width="18" height="11"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>'),
  lock:     S('<rect x="3" y="11" width="18" height="11"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
  eye:      S('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'),
  scan:     S('<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/>'),
  spark:    S('<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/>'),
  zap:      S('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'),
  bulb:     S('<path d="M12 2a7 7 0 0 0-7 7c0 2.4 1.2 4.5 3 5.7V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3c1.8-1.2 3-3.3 3-5.7a7 7 0 0 0-7-7Z"/><line x1="9" y1="21" x2="15" y2="21"/>'),
  pen:      S('<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>'),
  pentool:  S('<path d="m12 19 7-7 3 3-7 7-3-3z"/><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><circle cx="11" cy="11" r="2"/>'),
  forms:    S('<rect x="3" y="3" width="18" height="18"/><path d="M7 8h10"/><path d="M7 12h10"/><path d="M7 16h6"/>'),
  redact:   S('<rect x="3" y="3" width="18" height="18"/><rect x="7" y="10" width="10" height="4" fill="currentColor" stroke="none"/>'),
  columns:  S('<rect x="3" y="3" width="18" height="18"/><line x1="12" y1="3" x2="12" y2="21"/>'),
  monitor:  S('<rect x="2" y="3" width="20" height="14"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>'),
  table:    S('<rect x="3" y="3" width="18" height="18"/><path d="M3 9h18"/><path d="M9 3v18"/><path d="M15 3v18"/>'),
  archive:  S('<rect x="2" y="3" width="20" height="5"/><path d="M4 8v13h16V8"/><path d="M10 12h4"/>'),
  globe:    S('<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z"/>'),
  lang:     S('<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>'),
  crop:     S('<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>'),
  reader:   S('<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>')
};

/* emoji → icon key (variation selectors stripped before lookup) */
var MAP = {
  '\u{1F9E9}':'merge',   /* puzzle */
  '✂':'split',      /* scissors */
  '\u{1F5D1}':'trash',
  '\u{1F5C2}':'grid',    /* organize */
  '\u{1F504}':'rotate',
  '\u{1F4C9}':'compress',
  '\u{1FA79}':'wrench',  /* repair */
  '\u{1F527}':'wrench',
  '\u{1F50D}':'search',  /* ocr */
  '\u{1F5BC}':'image',
  '\u{1F4C4}':'doc',
  '\u{1F4C3}':'doc',
  '\u{1F4DD}':'pen',
  '\u{1F524}':'type',
  '\u{1F516}':'hash',    /* page numbers */
  '\u{1F4A7}':'drop',    /* watermark */
  '\u{1F513}':'unlock',
  '\u{1F512}':'lock',
  '\u{1F5DC}':'compress',
  '\u{1F4D0}':'crop',
  '\u{1F441}':'eye',
  '\u{1F4F7}':'scan',
  '\u{1F4F8}':'scan',
  '\u{1F916}':'spark',   /* AI */
  '✏':'pen',        /* edit */
  '✍':'pentool',    /* sign */
  '\u{1F9FE}':'forms',
  '⬛':'redact',
  '⬜':'redact',
  '\u{1F19A}':'columns', /* compare */
  '\u{1F4FD}':'monitor', /* ppt */
  '\u{1F4CA}':'table',   /* excel */
  '\u{1F5C4}':'archive', /* pdfa */
  '\u{1F310}':'globe',   /* html */
  '\u{1F30D}':'lang',    /* translate */
  '⚡':'zap',        /* Swift */
  '\u{1F9E0}':'bulb',    /* Sage */
  '\u{1F4A0}':'doc',
  '⭐':'spark',
  '\u{1F501}':'rotate',
  '\u{1F4D6}':'reader'
};

var SEL = '.tIc2, .toolCard .tIc, #plans .planCard .ic';

function keyFor(txt){
  var t = txt.replace(/️/g,'').trim();
  if (!t || t.length > 3) return null;
  if (MAP[t]) return MAP[t];
  var c = t.codePointAt(0);
  if (c >= 0x2190) return 'doc';   /* any other pictograph → the doc motif */
  return null;
}

function run(){
  var els = document.querySelectorAll(SEL);
  for (var i = 0; i < els.length; i++){
    var el = els[i];
    if (el.getAttribute('data-lx-icon')) continue;
    var k = keyFor(el.textContent || '');
    if (!k) continue;
    el.innerHTML = I[k];
    el.setAttribute('data-lx-icon', k);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
else run();

var _t = null;
var mo = new MutationObserver(function(){
  clearTimeout(_t); _t = setTimeout(run, 120);
});
mo.observe(document.documentElement, {childList:true, subtree:true});
})();
