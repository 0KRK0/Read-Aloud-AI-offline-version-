'use strict';
/* Lexora AI — settings page (standalone, Phase 2) */
const $ = id => document.getElementById(id);
const CONFIG = {
  SUPABASE_URL: 'https://lgwqqytjqoenozhjhbkr.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_lK4DQ5LVguBYO-4afNbbVw_J_WLNlWv',
  API_URL: 'https://readaloudai.konarajeshkumar011.workers.dev'
};
const ENGINE = { openai:'Swift', anthropic:'Sage', free:'Spark', bedrock:'Spark' };
const sb = window.supabase ? supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY) : null;
let session = null;

const fmtTokens = n => n >= 1e6 ? (n/1e6).toFixed(2)+'M' : n >= 1000 ? Math.round(n/1000)+'k' : String(n||0);
const fmtDate = s => new Date(s).toLocaleString(undefined, {day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'});
const esc = s => String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

/* ---------- theme ---------- */
function applyTheme(t){
  document.body.classList.toggle('light', t === 'light');
  localStorage.setItem('ra_theme', t);
  $('setTheme').value = t;
}
$('setTheme').addEventListener('change', e=> applyTheme(e.target.value));
const flipTheme = ()=> applyTheme(document.body.classList.contains('light') ? 'dark' : 'light');
$('acctTheme').addEventListener('click', flipTheme);
$('topTheme').addEventListener('click', flipTheme);
$('hambBtn').addEventListener('click', ()=> document.body.classList.toggle('navOpen'));
$('navVeil').addEventListener('click', ()=> document.body.classList.remove('navOpen'));
$('setTheme').value = localStorage.getItem('ra_theme') === 'light' ? 'light' : 'dark';

/* ---------- section nav highlighting ---------- */
document.querySelectorAll('#secNav a').forEach(a=>{
  a.addEventListener('click', ()=>{
    document.querySelectorAll('#secNav a').forEach(x=> x.classList.toggle('active', x === a));
  });
});

/* ---------- voices ---------- */
function fillVoices(){
  const sel = $('setVoice');
  const vs = speechSynthesis.getVoices();
  if(!vs.length) return;
  const saved = localStorage.getItem('ra_voice') || '';
  sel.innerHTML = '';
  vs.slice().sort((a,b)=> (b.lang.startsWith('en-IN')-a.lang.startsWith('en-IN')) || a.lang.localeCompare(b.lang))
    .forEach(v=>{
      const o = document.createElement('option');
      o.value = v.name; o.textContent = `${v.name} (${v.lang})`;
      if(v.name === saved) o.selected = true;
      sel.appendChild(o);
    });
}
if('speechSynthesis' in window){
  fillVoices();
  speechSynthesis.onvoiceschanged = fillVoices;
  $('setVoice').addEventListener('change', e=> localStorage.setItem('ra_voice', e.target.value));
  $('voiceTest').addEventListener('click', ()=>{
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance('Namaste! This is how I will read your documents.');
    const v = speechSynthesis.getVoices().find(x=> x.name === $('setVoice').value);
    if(v) u.voice = v;
    speechSynthesis.speak(u);
  });
}else{
  $('setVoice').innerHTML = '<option>Not supported in this browser</option>';
}

/* ---------- consent info ---------- */
const consent = localStorage.getItem('ra_consent');
$('consentInfo').textContent = consent
  ? 'Cookie notice accepted on ' + fmtDate(consent) + '. Only essential storage is used — no ads, no tracking.'
  : 'Only essential storage is used — no ads, no tracking.';

/* ---------- clear local data ---------- */
$('clearBtn').addEventListener('click', async ()=>{
  if(!confirm('Clear saved preferences on this device and log out?')) return;
  try{ if(sb) await sb.auth.signOut(); }catch(e){}
  localStorage.clear();
  location.href = 'index.html';
});

/* ---------- account-backed sections ---------- */
let txCache = [], usageCache = [], meCache = null;

async function loadAccount(){
  if(!sb) return;
  const {data:{session:s}} = await sb.auth.getSession();
  if(!s) return;
  session = s;
  const email = s.user.email || '';
  $('profEmail').textContent = email;
  $('profAvatar').textContent = email ? email[0].toUpperCase() : '👤';
  $('acctEmail').textContent = email;
  $('acctAvatar').textContent = email ? email[0].toUpperCase() : '👤';
  const provider = (s.user.app_metadata && s.user.app_metadata.provider) || 'email';
  $('profProvider').textContent = 'Login: ' + provider;
  $('profProvider').style.display = 'inline-block';
  $('profForm').style.display = 'block';
  $('profLoginHint').style.display = 'none';
  $('profName').value = (s.user.user_metadata && s.user.user_metadata.name) || '';

  loadWallet(); loadTx(); loadUsage();
}
$('profSave').addEventListener('click', async ()=>{
  if(!sb || !session) return;
  $('profSave').disabled = true;
  const {error} = await sb.auth.updateUser({ data: { name: $('profName').value.trim() } });
  $('profSave').disabled = false;
  $('profMsg').textContent = error ? 'Could not save: ' + error.message : '✓ Saved.';
});

async function loadWallet(){
  let money = 0;
  try{ const { data } = await sb.from('profiles').select('wallet_paise').eq('id', session.user.id).single(); if(data && typeof data.wallet_paise === 'number') money = data.wallet_paise; }catch(e){}
  const moneyHtml = `<div class="row" style="justify-content:space-between; align-items:baseline; margin-bottom:16px"><b>💠 ₹ Wallet balance</b><span style="font-size:22px; font-weight:800; color:var(--accent)">₹${(money/100).toFixed(2)}</span></div>`;
  try{
    const r = await fetch(CONFIG.API_URL + '/me', {headers:{authorization:'Bearer ' + session.access_token}});
    if(!r.ok) throw new Error('server ' + r.status);
    const me = await r.json(); meCache = me;
    const paid = me.effective === 'paid';
    const max = Math.max((me.tokens_balance||0) + (me.tokens_used||0), 1);
    const pct = Math.max(0, Math.min(100, Math.round((me.tokens_balance||0) / max * 100)));
    $('walletBody').innerHTML = moneyHtml + (paid
      ? `<h3>${ENGINE[me.provider] || 'Swift'} engine · ${me.plan === 'doc' ? 'document unlock' : 'subscription'}</h3>
         <div class="meter"><i style="width:${pct}%"></i></div>
         <p class="hint">${fmtTokens(me.tokens_balance)} of ${fmtTokens(max)} tokens left (${pct}%). Lifetime used: ${fmtTokens(me.tokens_used||0)}.</p>`
      : `<h3>Free plan · Spark engine</h3>
         <p class="hint">You are on the free engine with a daily question limit. Upgrade for the Swift or Sage engine and a token wallet.</p>`);
  }catch(e){
    $('walletBody').innerHTML = moneyHtml + '<p class="empty">Could not load the token wallet (' + esc(e.message) + ').</p>';
  }
}

async function loadTx(){
  try{
    const {data, error} = await sb.from('transactions').select('*').order('created_at', {ascending:false}).limit(50);
    if(error) throw error;
    txCache = data || [];
    if(!txCache.length){ $('txBody').innerHTML = '<p class="empty">No purchases yet.</p>'; return; }
    $('txBody').innerHTML = '<table class="list"><tr><th>Date</th><th>Type</th><th>Amount</th><th>Tokens</th><th>Engine</th></tr>' +
      txCache.map(t=> `<tr><td>${fmtDate(t.created_at)}</td><td>${esc(t.kind)}</td><td>${t.amount_inr != null ? '₹' + t.amount_inr : '—'}</td><td>${t.tokens_credited ? '+' + fmtTokens(t.tokens_credited) : '—'}</td><td>${ENGINE[t.provider] || esc(t.provider || '—')}</td></tr>`).join('') +
      '</table>';
  }catch(e){ $('txBody').innerHTML = '<p class="empty">Could not load purchases (' + esc(e.message) + ').</p>'; }
}

async function loadUsage(){
  try{
    const {data, error} = await sb.from('usage_log').select('*').order('created_at', {ascending:false}).limit(200);
    if(error) throw error;
    usageCache = data || [];
    if(!usageCache.length){ $('usageBody').innerHTML = '<p class="empty">No AI usage yet — ask the companion something!</p>'; return; }
    const tin = usageCache.reduce((n,u)=> n + (u.tokens_in||0), 0);
    const tout = usageCache.reduce((n,u)=> n + (u.tokens_out||0), 0);
    const week = usageCache.filter(u=> Date.now() - new Date(u.created_at) < 7*864e5).length;
    $('usageBody').innerHTML =
      `<div class="row" style="gap:20px; margin-bottom:14px">
        <span class="pill on">${usageCache.length} questions (recent)</span>
        <span class="pill">${week} this week</span>
        <span class="pill">${fmtTokens(tin)} in · ${fmtTokens(tout)} out</span>
      </div>
      <table class="list"><tr><th>When</th><th>Engine</th><th>Model</th><th>Tokens</th></tr>` +
      usageCache.slice(0, 25).map(u=> `<tr><td>${fmtDate(u.created_at)}</td><td>${ENGINE[u.provider] || esc(u.provider || '—')}</td><td>${esc((u.model||'').replace(/^.*[/]/,''))}</td><td>${fmtTokens((u.tokens_in||0) + (u.tokens_out||0))}</td></tr>`).join('') +
      '</table>' + (usageCache.length > 25 ? '<p class="hint">Showing the latest 25 of ' + usageCache.length + '.</p>' : '');
  }catch(e){ $('usageBody').innerHTML = '<p class="empty">Could not load usage (' + esc(e.message) + ').</p>'; }
}

/* ---------- export my data ---------- */
$('exportBtn').addEventListener('click', ()=>{
  const dump = {
    exported_at: new Date().toISOString(),
    account: session ? { email: session.user.email, id: session.user.id, name: (session.user.user_metadata||{}).name || null } : null,
    wallet: meCache,
    purchases: txCache,
    usage: usageCache,
    local_preferences: { theme: localStorage.getItem('ra_theme'), voice: localStorage.getItem('ra_voice'), consent: localStorage.getItem('ra_consent') }
  };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(dump, null, 2)], {type:'application/json'}));
  a.download = 'lexora-ai-my-data.json';
  a.click();
  setTimeout(()=> URL.revokeObjectURL(a.href), 5000);
});

/* ---------- AI engine: tier + token saver (moved here from the plans modal) ---------- */
(function(){
  const TIER_LABEL = { core:'Core', plus:'Plus', ultra:'Ultra' };
  let tier = localStorage.getItem('ra_tier') || 'core';
  if(!TIER_LABEL[tier]) tier = 'core';
  const paint = ()=> document.querySelectorAll('#setTierRow .tierBtn')
    .forEach(b=> b.classList.toggle('on', b.dataset.tier === tier));
  document.querySelectorAll('#setTierRow .tierBtn').forEach(b=>{
    b.addEventListener('click', ()=>{
      const t = b.dataset.tier;
      if(t === 'ultra' && tier !== 'ultra' &&
         !confirm('⚠ Ultra uses the most powerful engine — best answers, but it uses your balance up to 25× faster per question. Continue?')) return;
      tier = t; localStorage.setItem('ra_tier', t); paint();
    });
  });
  paint();
  const saver = $('setSaver');
  if(saver){
    saver.checked = localStorage.getItem('ra_saver') === '1';
    saver.addEventListener('change', e=> localStorage.setItem('ra_saver', e.target.checked ? '1' : '0'));
  }
})();

loadAccount();
