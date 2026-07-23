/* Lexora AI — first-run walkthrough / "Show me around" guide.
   Anchored spotlight tour: each step highlights a real element and drops a
   callout beside it. Falls back to a centred card when the target is hidden
   (e.g. the sidebar on mobile, where we point at the menu button instead).
   - Auto-runs once for first-time visitors (localStorage 'ra_tour_done').
   - Re-openable anytime via window.startTour() (account menu → Show me around). */
(function(){
  'use strict';

  /* sel = desktop target, selM = target when the sidebar is a mobile drawer */
  var STEPS = [
    { ic:'👋', t:'Welcome to Lexora AI',
      d:'Your AI companion for every document. A quick 30-second tour of where everything is.',
      sel:null },
    { ic:'📄', t:'Open a document',
      d:'Drop a PDF, Word file, text or a photo here — or click to choose. I read it aloud and follow the words as I go.',
      sel:'#dropZone', selM:'#dropZone' },
    { ic:'💬', t:'Your companion',
      d:'Ask anything here, or select a line on the page. I explain it in simple words, in your language.',
      sel:'#assistCol', selM:'#chatBar' },
    { ic:'🧰', t:'Tools',
      d:'Merge, split, compress and convert files — everything runs on your device.',
      sel:'#navTools', selM:'#hambBtn' },
    { ic:'📷', t:'Scan',
      d:'Snap paper with your camera and turn it into a clean PDF, images or text.',
      sel:'#navScan', selM:'#hambBtn' },
    { ic:'⭐', t:'Plans & wallet',
      d:'Reading is free. Upgrade for smarter answers — you pay once, no auto-renewal.',
      sel:'#navPlans', selM:'#hambBtn' },
    { ic:'👤', t:'Your account',
      d:'Settings, theme and this tour again all live here under “Show me around”.',
      sel:'#acctBtn', selM:'#acctBtn' },
    { ic:'✅', t:'You’re all set!',
      d:'Open a document to begin. You can reopen this tour anytime from your account menu.',
      sel:null }
  ];

  var i = 0, veil = null, spot = null, tip = null;
  function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }

  function targetEl(step){
    var sel = (window.innerWidth <= 900 && step.selM) ? step.selM : step.sel;
    if(!sel) return null;
    var el = document.querySelector(sel);
    if(!el) return null;
    var r = el.getBoundingClientRect();
    var hidden = (el.offsetParent === null && getComputedStyle(el).position !== 'fixed');
    if(hidden || r.width < 2 || r.height < 2) return null;
    return r;
  }

  function positionTip(r){
    var m = 14, tw = tip.offsetWidth, th = tip.offsetHeight, vw = window.innerWidth, vh = window.innerHeight, left, top;
    if(r.right + m + tw <= vw){                       /* to the right */
      left = r.right + m; top = clamp(r.top + r.height/2 - th/2, m, vh - th - m);
    }else if(r.left - m - tw >= 0){                   /* to the left */
      left = r.left - m - tw; top = clamp(r.top + r.height/2 - th/2, m, vh - th - m);
    }else if(r.bottom + m + th <= vh){                /* below */
      top = r.bottom + m; left = clamp(r.left + r.width/2 - tw/2, m, vw - tw - m);
    }else{                                            /* above */
      top = clamp(r.top - m - th, m, vh - th - m); left = clamp(r.left + r.width/2 - tw/2, m, vw - tw - m);
    }
    tip.style.left = left + 'px'; tip.style.top = top + 'px';
  }

  function paint(){
    if(!tip) return;
    var s = STEPS[i];
    tip.querySelector('.tourIc').textContent   = s.ic;
    tip.querySelector('.tourT').textContent    = s.t;
    tip.querySelector('.tourD').textContent    = s.d;
    tip.querySelector('.tourDots').innerHTML   = STEPS.map(function(_, k){ return '<i class="' + (k === i ? 'on' : '') + '"></i>'; }).join('');
    tip.querySelector('.tourBack').style.visibility = i === 0 ? 'hidden' : 'visible';
    tip.querySelector('.tourNext').textContent = (i === STEPS.length - 1) ? 'Get started' : 'Next';
    tip.querySelector('.tourStep').textContent = (i + 1) + ' / ' + STEPS.length;

    var r = targetEl(s);
    if(r){
      var p = 8;
      spot.style.display = 'block';
      spot.style.top = (r.top - p) + 'px'; spot.style.left = (r.left - p) + 'px';
      spot.style.width = (r.width + p*2) + 'px'; spot.style.height = (r.height + p*2) + 'px';
      tip.classList.remove('center');
      positionTip(r);
    }else{
      spot.style.display = 'none';
      tip.classList.add('center');
      tip.style.left = ''; tip.style.top = '';
    }
  }

  function next(){ if(i < STEPS.length - 1){ i++; paint(); } else close(); }
  function back(){ if(i > 0){ i--; paint(); } }

  function onKey(e){
    if(!veil) return;
    if(e.key === 'Escape') close();
    else if(e.key === 'ArrowRight') next();
    else if(e.key === 'ArrowLeft') back();
  }
  function onResize(){ if(veil) paint(); }

  function build(){
    veil = document.createElement('div'); veil.id = 'tourVeil';
    spot = document.createElement('div'); spot.id = 'tourSpot';
    tip  = document.createElement('div'); tip.id = 'tourTip';
    tip.innerHTML =
      '<button class="tourSkip" title="Close" aria-label="Close">&times;</button>' +
      '<div class="tourIc"></div>' +
      '<h3 class="tourT"></h3>' +
      '<p class="tourD"></p>' +
      '<div class="tourDots"></div>' +
      '<div class="tourNav">' +
        '<button class="tourBack">Back</button>' +
        '<span class="tourStep"></span>' +
        '<button class="tourNext">Next</button>' +
      '</div>';
    document.body.appendChild(veil);
    document.body.appendChild(spot);
    document.body.appendChild(tip);
    tip.querySelector('.tourSkip').addEventListener('click', close);
    tip.querySelector('.tourBack').addEventListener('click', back);
    tip.querySelector('.tourNext').addEventListener('click', next);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    paint();
  }

  function close(){
    [veil, spot, tip].forEach(function(el){ if(el && el.parentNode) el.parentNode.removeChild(el); });
    veil = spot = tip = null;
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    try{ localStorage.setItem('ra_tour_done', '1'); }catch(e){}
  }

  window.startTour = function(){ i = 0; if(!veil) build(); else paint(); };

  /* only for someone actually inside the app — never over the login screen */
  function appReady(){
    var lg = document.getElementById('login');
    if(lg && lg.offsetParent !== null && getComputedStyle(lg).display !== 'none') return false;
    var hasSession = (typeof session !== 'undefined' && session);
    var isGuest = (typeof guest !== 'undefined' && guest);
    return !!(hasSession || isGuest);
  }
  function maybeAutoRun(){
    try{ if(localStorage.getItem('ra_tour_done') === '1') return; }catch(e){}
    var tries = 0;
    var iv = setInterval(function(){
      tries++;
      try{ if(localStorage.getItem('ra_tour_done') === '1'){ clearInterval(iv); return; } }catch(e){}
      if(appReady()){ clearInterval(iv); window.startTour(); }
      else if(tries > 20){ clearInterval(iv); }   /* still on login after ~16s — give up quietly */
    }, 800);
  }
  if(document.readyState === 'complete') maybeAutoRun();
  else window.addEventListener('load', maybeAutoRun);

  /* ---- styles (uses the shared theme variables) ---- */
  var css =
    '#tourVeil{position:fixed; inset:0; z-index:300; background:rgba(0,0,0,.5)}' +
    '#tourSpot{position:fixed; z-index:301; border-radius:12px; border:2px solid var(--accent); pointer-events:none;' +
      ' box-shadow:0 0 0 9999px rgba(0,0,0,.55), 0 0 22px 4px rgba(224,122,63,.55);' +
      ' transition:top .28s cubic-bezier(.2,.8,.25,1), left .28s cubic-bezier(.2,.8,.25,1), width .28s, height .28s}' +
    '#tourTip{position:fixed; z-index:302; width:300px; max-width:calc(100vw - 28px); background:var(--panel);' +
      ' border:1px solid var(--line); border-radius:16px; box-shadow:var(--shadow); padding:20px 20px 16px;' +
      ' animation:tourIn .3s cubic-bezier(.2,.8,.25,1)}' +
    '#tourTip.center{left:50%!important; top:50%!important; transform:translate(-50%,-50%); text-align:center}' +
    '@keyframes tourIn{from{opacity:0; transform:translateY(8px) scale(.98)} to{opacity:1}}' +
    '#tourTip.center{animation:none}' +
    '#tourTip .tourSkip{position:absolute; top:8px; right:10px; background:none; border:none; color:var(--muted);' +
      ' font-size:19px; line-height:1; cursor:pointer; padding:4px 7px; border-radius:8px}' +
    '#tourTip .tourSkip:hover{background:var(--panel2); color:var(--text)}' +
    '#tourTip .tourIc{font-size:30px; line-height:1; margin:2px 0 10px}' +
    '#tourTip .tourT{font-family:var(--font-display,Georgia,serif); font-size:18px; font-weight:600; margin:0 0 7px; color:var(--text)}' +
    '#tourTip .tourD{color:var(--muted); font-size:13.5px; line-height:1.55; margin:0 0 16px}' +
    '#tourTip .tourDots{display:flex; gap:6px; margin-bottom:16px}' +
    '#tourTip.center .tourDots{justify-content:center}' +
    '#tourTip .tourDots i{width:6px; height:6px; border-radius:50%; background:var(--line); transition:background .2s, width .2s}' +
    '#tourTip .tourDots i.on{background:var(--accent); width:16px; border-radius:3px}' +
    '#tourTip .tourNav{display:flex; gap:10px; justify-content:space-between; align-items:center}' +
    '#tourTip .tourStep{color:var(--muted); font-size:12px; flex:none}' +
    '#tourTip .tourBack{background:none; border:1px solid var(--line); color:var(--muted); border-radius:9px;' +
      ' padding:8px 14px; font-size:13px; cursor:pointer; font-family:inherit}' +
    '#tourTip .tourBack:hover{border-color:var(--accent); color:var(--text)}' +
    '#tourTip .tourNext{background:var(--accent); color:#fff; border:none; border-radius:9px;' +
      ' padding:9px 18px; font-size:13px; font-weight:600; cursor:pointer; font-family:inherit}' +
    '#tourTip .tourNext:hover{filter:brightness(1.08)}';
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);
})();
