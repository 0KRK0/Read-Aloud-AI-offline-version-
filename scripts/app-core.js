
'use strict';
/* ================= CONFIG ================= */
const CONFIG = {
  SUPABASE_URL: 'https://lgwqqytjqoenozhjhbkr.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_lK4DQ5LVguBYO-4afNbbVw_J_WLNlWv',
  API_URL: 'https://readaloudai.konarajeshkumar011.workers.dev',
  PAY_URL: 'https://readaloudai-pay.konarajeshkumar011.workers.dev'   // e.g. https://readaloudai-pay.konarajeshkumar011.workers.dev
};
/* ========================================== */

/* ---------------- Cookie / consent banner ---------------- */
if(!localStorage.getItem('ra_consent')){
  $('consent').style.display = 'block';
  $('consentOk').addEventListener('click', ()=>{
    localStorage.setItem('ra_consent', new Date().toISOString());
    $('consent').style.display = 'none';
  });
}
let pdfjsLib = window['pdfjs-dist/build/pdf'];

/* ---------------- State ---------------- */
let pdfDoc = null;
let pages = [];        // per page: {num, w, h, scale, wrap, canvas, textLayer, rendered, textContent, spans:[]}
let lines = [];        // visual lines: {text, page, x, xEnd, y, h, items:[itemIdx]}
let sentences = [];    // spoken units: {text, page, parts:[{line, from, to}]}
let lineToSent = [];   // visual line index -> sentence index
let current = -1;      // current SENTENCE index
let playing = false;
let voices = [];
let docName = '';
let numPages = 0;
let session = null;
let guest = false;
let companionOn = true;
let awaitingStart = false;
let chatHistory = [];
let ocrBusy = false, waitingForMore = false;
let docBusy = false;      /* true while recognising — controls are locked */
let docLabel = '';        /* human-friendly way to refer to the open document */
function setDocBusy(on){
  docBusy = on;
  const pb = $('playbar'); if(pb) pb.classList.toggle('busy', on);
  const vw = $('viewerWrap');
  if(vw){
    let sp = document.getElementById('docSpin');
    if(on){
      if(!sp){
        sp = document.createElement('div');
        sp.id = 'docSpin';
        sp.innerHTML = '<div class="lxSpin"></div><div class="docSpinTxt">Reading your document…</div>';
        vw.appendChild(sp);
      }
      sp.style.display = 'flex';
    }else if(sp){
      sp.style.display = 'none';
    }
  }
}
/* "IMG_20260711_094512.jpg" is not something a human says out loud */
function friendlyName(name, kind){
  const base = String(name||'').replace(/\.[a-z0-9]{2,5}$/i,'');
  const messy = /\d{4,}/.test(base) || /^(IMG|DSC|PXL|WA|Screenshot|WhatsApp|Scan)[-_ ]?/i.test(base) || base.length > 40 || !/[a-z]{3}/i.test(base);
  if(kind === 'scan')  return 'your scan';
  if(kind === 'photo') return messy ? 'your photo' : `your photo "${base}"`;
  return messy ? 'your document' : `"${base}"`;
}
let fitScale = 1;
function dpr(){ return Math.min(window.devicePixelRatio || 1, 2); }

const configured = !CONFIG.SUPABASE_URL.startsWith('PASTE');
const sb = configured ? supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY) : null;

/* ---------------- Auth ---------------- */
async function initAuth(){
  if(!sb){
    $('loginMsg').style.color = 'var(--warn)';
    $('loginMsg').textContent = 'Backend not set up yet — reader mode only.';
    $('emailInput').style.display = 'none';
    $('loginBtn').style.display = 'none';
    return;
  }
  const {data:{session:s}} = await sb.auth.getSession();
  const land = $('landing');
  const hideLanding = ()=>{ if(land) land.hidden = true; };
  if(s){
    hideLanding();
    try{ localStorage.setItem('ra_returning', '1'); }catch(e){}
    enterApp(s);
  }
  else if(!guest && !/^(tools|scan)\./i.test(location.hostname) && !/access_token|refresh_token|error|type=/.test(location.hash)){
    /* not logged in, not a guest, no auth tokens, not on the tools/scan subdomains →
       show the PUBLIC LANDING (SEO + conversion) instead of bouncing to login.html.
       Login is only asked for when the visitor actually needs an account. */
    if(land) land.hidden = false;
    else location.replace('login.html');           /* safety net for stale HTML */
    return;
  }
  else hideLanding();                              /* guest / auth-token flows go into the app */
  sb.auth.onAuthStateChange((ev, s2)=>{
    if(s2 && !session){
      hideLanding();
      try{ localStorage.setItem('ra_returning', '1'); }catch(e){}
      enterApp(s2);
    }
  });
}
/* after sending: lock the email, turn the button into a resend countdown */
let resendInt = null, resendLeft = 0;
function startCooldown(secs){
  clearInterval(resendInt);
  resendLeft = Math.max(1, secs|0);
  $('loginBtn').disabled = true;
  $('loginBtn').textContent = `Resend in ${resendLeft}s`;
  resendInt = setInterval(()=>{
    resendLeft--;
    if(resendLeft <= 0){ clearInterval(resendInt); $('loginBtn').disabled = false; $('loginBtn').textContent = 'Resend link & code'; }
    else $('loginBtn').textContent = `Resend in ${resendLeft}s`;
  }, 1000);
}
function lockEmail(){ $('emailInput').readOnly = true; $('emailInput').style.opacity = .65; $('emailEdit').style.display = 'inline-block'; }
function unlockEmail(){
  $('emailInput').readOnly = false; $('emailInput').style.opacity = 1; $('emailEdit').style.display = 'none';
  clearInterval(resendInt);
  $('loginBtn').disabled = false; $('loginBtn').textContent = 'Continue with email';
  $('otpRow').style.display = 'none'; $('loginMsg').textContent = '';
  $('emailInput').focus();
}
$('emailEdit').addEventListener('click', unlockEmail);
$('loginBtn').addEventListener('click', async ()=>{
  const email = $('emailInput').value.trim();
  if(!/^\S+@\S+\.\S+$/.test(email)){ $('loginMsg').style.color='var(--warn)'; $('loginMsg').textContent='Please enter a valid email.'; return; }
  $('loginBtn').disabled = true;
  const {error} = await sb.auth.signInWithOtp({email, options:{emailRedirectTo: location.href.split('#')[0]}});
  $('loginMsg').style.color = error ? 'var(--warn)' : 'var(--ok)';
  if(error){
    const wait = (error.message.match(/after (\d+) seconds/) || [])[1];
    if(wait){                       /* asked too soon — lock and count down exactly that long */
      lockEmail(); startCooldown(+wait);
      $('loginMsg').textContent = `Please wait — you can resend in ${wait} seconds.`;
    }else{
      $('loginBtn').disabled = false;
      $('loginMsg').textContent = /rate limit/i.test(error.message)
        ? 'Too many login emails were sent in the last hour — please try again later, or continue as guest below.'
        : error.message;
    }
    return;
  }
  $('loginMsg').textContent = '✓ Code sent — check your email.';
  $('otpRow').style.display = 'block';
  lockEmail();
  startCooldown(50);
  $('otpInput').focus();
});
$('otpBtn').addEventListener('click', async ()=>{
  const email = $('emailInput').value.trim();
  const code = $('otpInput').value.trim();
  if(!/^\d{6}$/.test(code)){ $('loginMsg').style.color='var(--warn)'; $('loginMsg').textContent='The code is the 6-digit number from the email.'; return; }
  $('otpBtn').disabled = true;
  const {data, error} = await sb.auth.verifyOtp({ email, token: code, type: 'email' });
  $('otpBtn').disabled = false;
  if(error){ $('loginMsg').style.color='var(--warn)'; $('loginMsg').textContent = 'That code did not work — check it or request a new link.'; return; }
  if(data && data.session) enterApp(data.session);
});
$('guestBtn').addEventListener('click', ()=>{ guest = true; enterApp(null); });
$('googleBtn').addEventListener('click', async ()=>{
  if(!sb) return;
  const {error} = await sb.auth.signInWithOAuth({ provider:'google', options:{ redirectTo: location.href.split('#')[0] } });
  if(error){
    $('loginMsg').style.color = 'var(--warn)';
    $('loginMsg').textContent = /provider is not enabled/i.test(error.message)
      ? 'Google login is being set up — please use email for now.'
      : error.message;
  }
});
$('appleBtn').addEventListener('click', async ()=>{
  if(!sb) return;
  const {error} = await sb.auth.signInWithOAuth({ provider:'apple', options:{ redirectTo: location.href.split('#')[0] } });
  if(error){
    $('loginMsg').style.color = 'var(--warn)';
    $('loginMsg').textContent = /provider is not enabled/i.test(error.message)
      ? 'Apple login is coming soon — please use Google or email for now.'
      : error.message;
  }
});
$('loginHdrBtn').addEventListener('click', ()=>{ location.href = 'login.html'; });
$('scanHdrBtn').addEventListener('click', ()=>{ scanAppend = false; openCamera(); });
$('logoutBtn').addEventListener('click', async ()=>{ if(sb) await sb.auth.signOut(); location.reload(); });

function companionAvailable(){ return !!session && navigator.onLine && companionOn && configured; }

function enterApp(s){
  session = s;
  $('login').style.display = 'none';
  $('userEmail').textContent = s ? s.user.email : 'Guest';
  $('logoutBtn').style.display = s ? 'block' : 'none';
  $('loginHdrBtn').style.display = s ? 'none' : 'block';   /* guests can always get back to login */
  updateMode();
  if(s) fetchMe();
  const name = s ? s.user.email.split('@')[0] : 'friend';
  say(s
    ? `Namaste, ${name}! 🙏 Open a PDF and we will go through it together — I read aloud, follow the words on the page, and you can select any text to get it explained.`
    : 'Namaste! 🙏 Reader mode: I will read your File aloud and follow the words. Login to unlock the AI companion for explanations and chat.');
}
function updateMode(){
  $('assistMode').textContent = companionAvailable() ? 'AI companion — online'
    : session ? 'Companion paused' + (navigator.onLine ? '' : ' — offline')
    : 'Reader mode — login for AI companion';
  $('compToggle').classList.toggle('on', companionAvailable());
}
window.addEventListener('online', updateMode);
window.addEventListener('offline', updateMode);
$('compToggle').addEventListener('click', ()=>{
  companionOn = !companionOn;
  updateMode();
  say(companionOn ? 'Companion is back! Select text or ask me anything.' : 'Okay, I will stay quiet and just read.','sys');
});

/* ---------------- Chat UI ---------------- */
function say(text, who='bot'){
  const m = document.createElement('div');
  m.className = 'msg ' + who;
  m.textContent = text;
  $('chat').appendChild(m);
  $('chat').scrollTop = $('chat').scrollHeight;
  if(who==='bot' && window.innerWidth<=900 && !$('assistCol').classList.contains('open')) $('fabDot').style.display='block';
}
let progEl = null;
function sayProgress(t){
  if(!progEl){ progEl = document.createElement('div'); progEl.className='msg sys'; $('chat').appendChild(progEl); }
  progEl.textContent = t;
  $('chat').scrollTop = $('chat').scrollHeight;
}
function removeProgress(){ if(progEl){ progEl.remove(); progEl = null; } }

/* mobile bottom sheet */
function openSheet(){ $('assistCol').classList.add('open'); $('fabDot').style.display='none'; }
function closeSheet(){ $('assistCol').classList.remove('open'); }
$('chatFab').addEventListener('click', ()=>{
  if($('chatFab').dataset.justDragged) return;
  $('assistCol').classList.contains('open') ? closeSheet() : openSheet();
});

/* make the bot button freely draggable; position is remembered */
(function makeDraggable(btn, storeKey){
  let sx, sy, ox, oy, moved = false, dragging = false;
  const saved = localStorage.getItem(storeKey);
  if(saved){
    try{
      const p = JSON.parse(saved);
      btn.style.right = 'auto'; btn.style.bottom = 'auto';
      btn.style.left = p.l + 'px'; btn.style.top = p.t + 'px';
    }catch(e){}
  }
  btn.addEventListener('pointerdown', e=>{
    dragging = true; moved = false; sx = e.clientX; sy = e.clientY;
    const r = btn.getBoundingClientRect(), pr = btn.parentElement.getBoundingClientRect();
    ox = r.left - pr.left; oy = r.top - pr.top;
    try{ btn.setPointerCapture(e.pointerId); }catch(err){}
  });
  btn.addEventListener('pointermove', e=>{
    if(!dragging) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if(Math.abs(dx) + Math.abs(dy) > 6) moved = true;
    if(moved){
      const pr = btn.parentElement.getBoundingClientRect();
      const l = Math.max(4, Math.min(pr.width - btn.offsetWidth - 4, ox + dx));
      const t = Math.max(4, Math.min(pr.height - btn.offsetHeight - 4, oy + dy));
      btn.style.right = 'auto'; btn.style.bottom = 'auto';
      btn.style.left = l + 'px'; btn.style.top = t + 'px';
    }
  });
  btn.addEventListener('pointerup', ()=>{
    dragging = false;
    if(moved){
      localStorage.setItem(storeKey, JSON.stringify({l: parseInt(btn.style.left)||0, t: parseInt(btn.style.top)||0}));
      btn.dataset.justDragged = '1';
      setTimeout(()=>{ delete btn.dataset.justDragged; }, 80);
    }
  });
})($('chatFab'), 'ra_fabpos');
$('sheetClose').addEventListener('click', closeSheet);

/* ---------------- Voices ---------------- */
function naturalScore(v){
  let s = 0;
  if(/natural|neural/i.test(v.name)) s += 4;   // Edge's human-like neural voices
  if(/google/i.test(v.name)) s += 2;           // Chrome's better voices
  if(/online/i.test(v.name)) s += 1;
  if(/en-in/i.test(v.lang)) s += 2;            // Indian English preferred
  return s;
}
let voiceTipShown = false;
/* voices that failed to speak in this browser — remembered so we never pick them again */
const badVoices = new Set(JSON.parse(localStorage.getItem('ra_badVoices') || '[]'));
function pickWorkingVoice(lang){
  const cands = voices.filter(v=>!badVoices.has(v.name));
  const pref = (lang || 'en').split('-')[0];
  return cands.filter(v=>v.lang===lang).sort((a,b)=>naturalScore(b)-naturalScore(a))[0]
      || cands.filter(v=>v.lang.split('-')[0]===pref).sort((a,b)=>naturalScore(b)-naturalScore(a))[0]
      || cands[0] || null;
}
/* Called after a voice keeps failing: blacklist it, switch to a working one. Returns the new voice or null. */
function markBadVoice(v){
  if(!v || badVoices.has(v.name)) return null;
  badVoices.add(v.name);
  localStorage.setItem('ra_badVoices', JSON.stringify([...badVoices]));
  const alt = pickWorkingVoice(v.lang);
  if(alt){
    $('voiceSel').value = alt.name;
    localStorage.setItem('ra_voice', alt.name);
    say(`⚠️ The voice you picked is not responding in this browser, so I switched to "${alt.name.replace(/^(Microsoft|Google) /,'').replace(/ - .*$/,'')}". Broken voices are now marked ⚠ in the list.`,'sys');
    loadVoices();
  }
  return alt;
}
function loadVoices(){
  voices = speechSynthesis.getVoices();
  if(!voices.length) return;
  const sel = $('voiceSel');
  const keep = sel.value;
  sel.innerHTML = '';
  const sorted = [...voices].sort((a,b)=>
    (badVoices.has(a.name)?1:0) - (badVoices.has(b.name)?1:0) ||
    naturalScore(b) - naturalScore(a) || a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name));
  sorted.forEach(v=>{
    const o = document.createElement('option');
    o.value = v.name;
    const bad = badVoices.has(v.name);
    const star = bad ? '⚠ ' : (/natural|neural/i.test(v.name) ? '⭐ ' : '');
    o.textContent = star + `${v.name.replace(/^(Microsoft|Google) /,'').replace(/ - .*$/,'').replace(/\s*\(Natural\)\s*/i,'')} (${v.lang})`;
    sel.appendChild(o);
  });
  if(keep && voices.find(v=>v.name===keep)) sel.value = keep;
  const own = document.createElement('option');
  own.disabled = true; own.textContent = '✨ Your Own Voice — coming soon';
  sel.appendChild(own);
  const saved = localStorage.getItem('ra_voice');
  const ok = v => v && !badVoices.has(v.name);
  const pref = (saved && !badVoices.has(saved) && voices.find(v=>v.name===saved))
    /* preferred default: Neerja Online (en-IN) — the most natural Indian English voice */
    || voices.find(v=> ok(v) && /neerja/i.test(v.name) && !/indic/i.test(v.name))
    || voices.find(v=> ok(v) && /neerja/i.test(v.name))
    /* otherwise: best working English (India) voice, then any working English one */
    || sorted.find(v=> ok(v) && /^en-in$/i.test(v.lang))
    || sorted.find(v=> ok(v) && /^en/i.test(v.lang))
    || sorted.find(ok) || sorted[0];
  if(pref) sel.value = pref.name;
  /* nudge towards human-like voices when the browser has none */
  if(!voiceTipShown && !voices.some(v=>/natural|neural/i.test(v.name))){
    voiceTipShown = true;
    setTimeout(()=> say('💡 Tip: open this app in Microsoft Edge to get free human-like "Natural" voices — they sound like a real person, not a machine.','sys'), 2500);
  }
  /* Edge users: some of its online voices are broken on Microsoft's side */
  if(!voiceTipShown && /Edg\//.test(navigator.userAgent)){
    voiceTipShown = true;
    setTimeout(()=> say('💡 Tip for Edge: if the reading voice ever stays silent, just pick a different voice from the list — a few of Edge\'s online voices are broken on Microsoft\'s side. I mark those with ⚠ and switch to a working one automatically.','sys'), 2500);
  }
}
speechSynthesis.onvoiceschanged = loadVoices;
loadVoices();
$('voiceSel').addEventListener('change', e=>{
  localStorage.setItem('ra_voice', e.target.value);
  if(playing){ cancelSpeech2(); speakLine(current); }
});
function currentVoice(){ return voices.find(v=>v.name===$('voiceSel').value) || null; }
function rate(){ return parseFloat($('rateSel').value); }

