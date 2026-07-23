/* ============================================================
   Lexora AI — lx-search.js (Task 13: Search)
   Ctrl/Cmd+K command palette: navigate anywhere, jump to any
   tool, run quick actions. Keyboard-first, ARIA-labelled,
   design-language styled (styles live in theme.css).
   Classic script; safe on every page.
   ============================================================ */
(function(){
'use strict';

var ITEMS = [
  {t:'Reader',            s:'read a document aloud',            u:'index.html',        k:'nav'},
  {t:'Tools',             s:'all 40+ document tools',           u:'tools.html',        k:'nav'},
  {t:'Scan a paper',      s:'camera → clean PDF, on device',    u:'scan.html',         k:'nav'},
  {t:'Jobs',              s:'background premium runs',          u:'jobs.html',         k:'nav'},
  {t:'Plans & wallet',    s:'top up, subscriptions, ₹ balance', u:'index.html#plans',  k:'nav'},
  {t:'Settings',          s:'profile, AI engine, privacy',      u:'settings.html',     k:'nav'},
  {t:'Merge PDF',         s:'combine files in order',           u:'tools.html#merge',    k:'tool'},
  {t:'Split PDF',         s:'extract any pages',                u:'tools.html#split',    k:'tool'},
  {t:'Compress PDF',      s:'smaller, never worse',             u:'tools.html#compress', k:'tool'},
  {t:'PDF to Word',       s:'editable .docx',                   u:'tools.html#pdf2word', k:'tool'},
  {t:'PDF to Excel',      s:'★ tables to spreadsheet',          u:'tools.html#pdf2excel',k:'tool'},
  {t:'PDF to PowerPoint', s:'slides from pages',                u:'tools.html#pdf2ppt',  k:'tool'},
  {t:'PDF to JPG',        s:'pages as images',                  u:'tools.html#pdf2jpg',  k:'tool'},
  {t:'Word to PDF',       s:'docx → PDF',                       u:'tools.html#word2pdf', k:'tool'},
  {t:'JPG to PDF',        s:'images → one PDF',                 u:'tools.html#jpg2pdf',  k:'tool'},
  {t:'OCR PDF',           s:'make scans searchable',            u:'tools.html#ocr',      k:'tool'},
  {t:'Sign PDF',          s:'draw, type or import',             u:'tools.html#sign',     k:'tool'},
  {t:'Edit PDF',          s:'text boxes & white-out',           u:'tools.html#edit',     k:'tool'},
  {t:'Crop PDF',          s:'trim page margins',                u:'tools.html#crop',     k:'tool'},
  {t:'Redact PDF',        s:'truly remove content',             u:'tools.html#redact',   k:'tool'},
  {t:'Fill PDF forms',    s:'complete form fields',             u:'tools.html#forms',    k:'tool'},
  {t:'Compare PDFs',      s:'side-by-side differences',         u:'tools.html#compare',  k:'tool'},
  {t:'Edit Word',         s:'quick .docx editing',              u:'tools.html#editword', k:'tool'},
  {t:'Translate PDF',     s:'★ 30+ languages',                  u:'tools.html#translate',k:'tool'},
  {t:'HTML to PDF',       s:'★ webpage → PDF',                  u:'tools.html#html2pdf', k:'tool'},
  {t:'Watermark',         s:'stamp every page',                 u:'tools.html#watermark',k:'tool'},
  {t:'Page numbers',      s:'number every page',                u:'tools.html#pagenum',  k:'tool'},
  {t:'Rotate PDF',        s:'fix page orientation',             u:'tools.html#rotate',   k:'tool'},
  {t:'Organize pages',    s:'sort, reorder, delete',            u:'tools.html#organize', k:'tool'},
  {t:'Unlock PDF',        s:'remove password locks',            u:'tools.html#unlock',   k:'tool'},
  {t:'Protect PDF',       s:'password-encrypt',                 u:'tools.html#protect',  k:'tool'},
  {t:'Repair PDF',        s:'recover a damaged file',           u:'tools.html#repair',   k:'tool'},
  {t:'Switch theme',      s:'dark ⟷ light',                    a:'theme',             k:'act'}
];

var box, input, list, open = false, sel = 0, matches = [];

function build(){
  box = document.createElement('div');
  box.id = 'lxK';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Search Lexora');
  box.innerHTML =
    '<div class="lxKveil"></div>' +
    '<div class="lxKcard">' +
      '<div class="lxKtop"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>' +
      '<input id="lxKin" type="text" placeholder="Search tools, pages, actions…" autocomplete="off" aria-label="Search">' +
      '<span class="lxKesc">esc</span></div>' +
      '<div class="lxKlist" id="lxKlist" role="listbox"></div>' +
    '</div>';
  document.body.appendChild(box);
  input = box.querySelector('#lxKin');
  list  = box.querySelector('#lxKlist');
  box.querySelector('.lxKveil').addEventListener('click', hide);
  input.addEventListener('input', function(){ sel = 0; render(); });
  input.addEventListener('keydown', function(e){
    if(e.key === 'ArrowDown'){ e.preventDefault(); sel = Math.min(sel + 1, matches.length - 1); render(); }
    else if(e.key === 'ArrowUp'){ e.preventDefault(); sel = Math.max(sel - 1, 0); render(); }
    else if(e.key === 'Enter'){ e.preventDefault(); go(matches[sel]); }
    else if(e.key === 'Escape'){ hide(); }
    /* §09 — trap focus: navigation is via arrows/Enter, so keep Tab inside */
    else if(e.key === 'Tab'){ e.preventDefault(); input.focus(); }
  });
}

function filter(q){
  q = q.trim().toLowerCase();
  if(!q) return ITEMS.slice(0, 9);
  return ITEMS.filter(function(i){
    return (i.t + ' ' + i.s).toLowerCase().indexOf(q) > -1;
  }).slice(0, 9);
}

function render(){
  matches = filter(input.value);
  list.innerHTML = '';
  if(!matches.length){
    list.innerHTML = '<div class="lxKempty">Nothing found — try "compress", "sign", "translate"…</div>';
    return;
  }
  matches.forEach(function(m, i){
    var el = document.createElement('button');
    el.type = 'button';
    el.className = 'lxKitem' + (i === sel ? ' on' : '');
    el.setAttribute('role', 'option');
    el.innerHTML = '<b></b><small></small><span class="lxKkind"></span>';
    el.querySelector('b').textContent = m.t;
    el.querySelector('small').textContent = m.s;
    el.querySelector('.lxKkind').textContent = m.k === 'nav' ? 'page' : (m.k === 'act' ? 'action' : 'tool');
    el.addEventListener('click', function(){ go(m); });
    el.addEventListener('mousemove', function(){ if(sel !== i){ sel = i; render(); } });
    list.appendChild(el);
  });
}

function go(m){
  if(!m) return;
  hide();
  if(m.a === 'theme'){
    var l = document.body.classList.toggle('light');
    try{ localStorage.setItem('ra_theme', l ? 'light' : 'dark'); }catch(e){}
    return;
  }
  location.href = m.u;
}

function show(){
  if(!box) build();
  open = true; box.classList.add('open');
  input.value = ''; sel = 0; render();
  input.focus();
}
function hide(){
  if(!box) return;
  open = false; box.classList.remove('open');
}

document.addEventListener('keydown', function(e){
  if((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')){
    e.preventDefault();
    open ? hide() : show();
  }
});
window.lxSearchOpen = show;   /* other UI (rail icons) can trigger it */

/* Wire the rail Search icon (present on every app page) */
document.addEventListener('DOMContentLoaded', function(){
  var b = document.getElementById('navSearch');
  if(b) b.addEventListener('click', function(e){ e.preventDefault(); show(); });
});
})();
