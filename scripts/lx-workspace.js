/* ============================================================
   Lexora AI — lx-workspace.js (Redesign v2, workspace home 2c)
   - Greeting kicker: "GOOD MORNING, <NAME>" (falls back to the
     generic workspace line for guests).
   - "Recent on this device" strip: metadata only (name + note),
     stored in localStorage 'lx_recent'; recorded by wrapping the
     global openFile() from app-documents.js. No file bytes are
     kept — clicking a recent re-opens the file picker.
   Classic script; load AFTER app-documents.js.
   ============================================================ */
(function(){
'use strict';
var $id = function(id){ return document.getElementById(id); };
/* (Recents removed by design — Lexora never stores the user's files.) */

function greet(){
  var el = $id('wsGreet');
  if (!el) return;
  var s = (typeof session !== 'undefined' && session && session.user) ? session : null;
  if (!s || !s.user.email) return;                 /* guests keep the generic kicker */
  var raw = (s.user.email.split('@')[0] || '').replace(/[._-]+/g, ' ').trim();
  var name = raw ? raw.replace(/\b\w/g, function(c){ return c.toUpperCase(); }) : '';
  var h = new Date().getHours();
  var part = h < 12 ? 'morning' : (h < 17 ? 'afternoon' : 'evening');
  el.textContent = 'Good ' + part + (name ? ', ' + name : '');
}

/* Chat behaviour (Phase 9): turn separators + send-lock while generating.
   No app-companion.js changes — everything observes the #chat DOM. */
function chatUx(){
  var chat = $id('chat');
  if (!chat) return;
  var send = $id('sendBtn'), mic = $id('micBtn'), inp = $id('chatInput');
  var unlockT = null;
  function setLock(on){
    [send, mic].forEach(function(b){ if (b){ b.disabled = on; b.style.opacity = on ? '.45' : ''; } });
    if (inp){ inp.disabled = on; inp.style.opacity = on ? '.6' : ''; }
    clearTimeout(unlockT);
    if (on) unlockT = setTimeout(function(){ setLock(false); }, 60000);  /* timeout guard */
  }
  var mo = new MutationObserver(function(muts){
    muts.forEach(function(m){
      Array.prototype.forEach.call(m.addedNodes, function(n){
        if (!(n instanceof HTMLElement) || !n.classList.contains('msg')) return;
        if (n.classList.contains('user')){
          /* clickable turn separator above every user message */
          if (!n.previousElementSibling || !n.previousElementSibling.classList.contains('chatSep')){
            var sep = document.createElement('button');
            sep.type = 'button'; sep.className = 'chatSep';
            sep.title = 'Jump to this message';
            sep.addEventListener('click', function(){ n.scrollIntoView({behavior:'smooth', block:'start'}); });
            chat.insertBefore(sep, n);
          }
          setLock(true);                       /* one request at a time */
        }else if (n.classList.contains('bot')){
          setLock(false);                      /* answer arrived (or error message) */
        }
      });
    });
  });
  mo.observe(chat, {childList:true});
}

function chips(){
  var box = $id('lxChips');
  if (!box) return;
  box.addEventListener('click', function(ev){
    var b = ev.target.closest('button[data-q]');
    if (!b) return;
    var inp = $id('chatInput'), send = $id('sendBtn');
    if (inp && send){ inp.value = b.getAttribute('data-q'); send.click(); }
  });
}

function tabs(){
  var bar = $id('mobTabs');
  if (!bar) return;
  function setOn(id){
    bar.querySelectorAll('button').forEach(function(b){ b.classList.toggle('on', b.id === id); });
  }
  var r = $id('mobReader'), t = $id('mobTools'), c = $id('mobComp'), m = $id('mobMore');
  if (r) r.addEventListener('click', function(){
    var a = $id('assistCol'); if (a) a.classList.remove('open');
    document.body.classList.remove('navOpen');
    window.scrollTo(0,0); setOn('mobReader');
  });
  if (t) t.addEventListener('click', function(){ location.href = 'tools.html'; });
  if (c) c.addEventListener('click', function(){
    var fab = $id('chatFab');
    if (fab) fab.click();
    else { var a = $id('assistCol'); if (a) a.classList.toggle('open'); }
    setOn($id('assistCol') && $id('assistCol').classList.contains('open') ? 'mobComp' : 'mobReader');
  });
  if (m) m.addEventListener('click', function(){
    document.body.classList.toggle('navOpen');
    setOn(document.body.classList.contains('navOpen') ? 'mobMore' : 'mobReader');
  });
}

function deeplink(){
  /* index.html#plans (e.g. back from login?next=%23plans) opens the wallet */
  if (location.hash === '#plans'){
    var tries = 0, iv = setInterval(function(){
      var logged = (typeof session !== 'undefined') && session;
      if (logged && typeof window.openPlans === 'function'){ clearInterval(iv); window.openPlans(); }
      else if (++tries > 40) clearInterval(iv);   /* guest: the landing stays; Pricing routes via login?next */
    }, 250);
  }
}

/* Selection actions (Phase 3): Translate + Ask… ride the existing chat. */
function selActions(){
  function grabSel(){
    var s = String(window.getSelection ? window.getSelection().toString() : '').trim();
    return s.length > 900 ? s.slice(0, 900) + '…' : s;
  }
  function showCompanion(){
    document.body.classList.remove('compHidden');
    var a = $id('assistCol');
    if (a && window.matchMedia('(max-width:900px)').matches) a.classList.add('open');
  }
  var tr = $id('selTranslate'), ask = $id('selAsk');
  if (tr) tr.addEventListener('click', function(){
    var s = grabSel(); if (!s) return;
    showCompanion();
    var inp = $id('chatInput'), send = $id('sendBtn');
    if (inp && send){ inp.value = 'Translate this to English (or to my language if it is already English): "' + s + '"'; send.click(); }
    var sb = $id('selBar'); if (sb) sb.style.display = 'none';
  });
  if (ask) ask.addEventListener('click', function(){
    var s = grabSel(); if (!s) return;
    showCompanion();
    var inp = $id('chatInput');
    if (inp){ inp.value = 'About "' + s + '" — '; inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    var sb = $id('selBar'); if (sb) sb.style.display = 'none';
  });
}

/* TWO DELIBERATELY DIFFERENT SCAN INTENTS (KRK):
   • "Scan a paper" (#scanBtn) + header "Scan with camera" (#scanHdrBtn) = the
     FAST intent → the in-app camera (app-documents.js openCamera → #camModal):
     Capture → OCR → the reader opens automatically, no navigation. Left native
     (no redirect here) so that frictionless flow stays intact.
   • The rail/nav "Scan" (an <a href="scan.html">) = the PRODUCTIVITY intent →
     the full Scan Tool station (multi-page, crop, enhance, save, export).
   Same camera look in both; only what happens AFTER capture differs. */

/* Top bar chrome (mockup): live engine chip mirrored from the companion's
   wallet label + an avatar box with the account initial. */
function hdrChrome(){
  var box = $id('userBox');
  if (!box) return;
  var chip = document.createElement('span');
  chip.id = 'hdrEngine'; chip.hidden = true;
  var av = document.createElement('span');
  av.id = 'hdrAvatar'; av.textContent = 'G';
  box.insertBefore(av, box.firstChild);
  box.insertBefore(chip, av);
  /* the avatar opens the account popover (now anchored top-right) */
  av.addEventListener('click', function(e){
    e.stopPropagation();
    var b = $id('acctBtn'); if (b) b.click();
  });
  function sync(){
    var s = (typeof session !== 'undefined' && session && session.user) ? session : null;
    av.textContent = s && s.user.email ? s.user.email[0].toUpperCase() : 'G';
    var lbl = $id('walletLabel');
    var t = lbl ? String(lbl.textContent || '').trim() : '';
    if (t){ chip.textContent = t.toUpperCase().replace(/\s*·\s*/g, ' · '); chip.hidden = false; }
    else chip.hidden = true;
  }
  sync(); setInterval(sync, 2000);
}

/* Plans & wallet: Wallet ⟷ Plans tab toggle + "Current" plan sync.
   Purely presentational — the buy/switch logic stays in app-wallet.js. */
function walletTabs(){
  var tabs = document.querySelectorAll('.pwTab');
  if (!tabs.length) return;
  tabs.forEach(function(t){
    t.addEventListener('click', function(){
      var pane = t.getAttribute('data-pane');
      document.querySelectorAll('.pwTab').forEach(function(x){
        var on = x === t;
        x.classList.toggle('on', on);
        x.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      var w = $id('pwWallet'), p = $id('pwPlans');
      if (w) w.hidden = pane !== 'wallet';
      if (p) p.hidden = pane !== 'plans';
    });
  });
  /* reflect which engine is current from #planStatus text */
  function syncCurrent(){
    var st = $id('planStatus'); if (!st) return;
    var t = (st.textContent || '').toLowerCase();
    var free = $id('freeCard'), badge = $id('freeBadge'), fbtn = $id('freeCurBtn');
    var onFree = t.indexOf('free') > -1;
    if (free) free.classList.toggle('cur', onFree);
    if (badge) badge.style.display = onFree ? '' : 'none';
    if (fbtn) fbtn.innerHTML = onFree
      ? '<span class="bL">Current plan</span><span class="bS">Current</span>'
      : '<span class="bL">Switch to Spark</span><span class="bS">Switch</span>';
    document.querySelectorAll('.planCard[data-plan^="sub_"]').forEach(function(c){
      var name = (c.querySelector('b') || {}).textContent || '';
      c.classList.toggle('cur', name && t.indexOf(name.toLowerCase()) > -1);
    });
  }
  syncCurrent();
  setInterval(syncCurrent, 1500);
}

function init(){
  chips();
  tabs();
  deeplink();
  chatUx();
  selActions();
  hdrChrome();
  walletTabs();
  /* record every document that gets opened, without touching app-documents.js */
  if (typeof window.openFile === 'function' && !window.openFile._lxWrapped){
    var orig = window.openFile;
    window.openFile = function(file){
      try{
        if (file && file.name){
          var hd = $id('hdrDoc');
          if (hd){
            hd.innerHTML = '';
            hd.appendChild(document.createTextNode(file.name));
            var meta = document.createElement('span');
            meta.className = 'hdrDocMeta';
            meta.textContent = ' · on this device';
            hd.appendChild(meta);
          }
        }
      }catch(e){}
      return orig.apply(this, arguments);
    };
    window.openFile._lxWrapped = true;
  }
  /* (recents render removed by design — Lexora never stores the user's files) */
  greet();
  setInterval(greet, 60000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();
