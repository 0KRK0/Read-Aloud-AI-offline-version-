/* ---------------- Wallet & plans ---------------- */
let me = null;
function fmtTokens(n){ return n >= 1e6 ? (n/1e6).toFixed(2)+'M' : n >= 1000 ? Math.round(n/1000)+'k' : String(n); }
async function fetchMe(){
  if(!session || !configured) return;
  try{
    const token = await authToken();
    if(!token) return;
    const r = await fetch(CONFIG.API_URL + '/me', {headers:{authorization:'Bearer '+token}});
    if(r.ok){ me = await r.json(); renderWallet(); }
  }catch(e){}
}
const PLAN_SIZES = { sub_openai_49: 500000, sub_claude_99: 120000 };
const PLAN_INR = { sub_openai_49: 49, sub_claude_99: 99 };
const RATE_INR = { openai: 49/500000, anthropic: 99/120000 };
/* live plan config from the payments worker — env-configured prices, no redeploy drift */
(async ()=>{
  try{
    if(!configured || CONFIG.PAY_URL.startsWith('PASTE')) return;
    const r = await fetch(CONFIG.PAY_URL + '/config');
    if(!r.ok) return;
    const c = await r.json();
    if(!c || !c.plans) return;
    for(const k of ['sub_openai_49','sub_claude_99']){
      const p = c.plans[k];
      if(!p || !p.inr || !p.tokens) continue;
      PLAN_SIZES[k] = p.tokens;
      PLAN_INR[k] = p.inr;
      RATE_INR[k === 'sub_claude_99' ? 'anthropic' : 'openai'] = p.inr / p.tokens;
    }
  }catch(e){ /* fall back to the built-in defaults */ }
})();
/* user-facing engine names — provider ids never appear in the UI */
const ENGINE = { openai: 'Swift', anthropic: 'Sage', free: 'Spark', bedrock: 'Spark' };
const TIER_LABEL = { core: 'Core', plus: 'Plus', ultra: 'Ultra' };
let aiTier = localStorage.getItem('ra_tier') || 'core';
let aiSaver = localStorage.getItem('ra_saver') === '1';
function renderWallet(){
  if(!me){ $('wallet').style.display='none'; return; }
  if(me.effective === 'paid'){
    $('wallet').style.display='block';
    const max = Math.max(me.tokens_balance + (me.tokens_used || 0), 1);
    const pct = Math.max(0, Math.min(100, Math.round(me.tokens_balance / max * 100)));
    const tierTag = me.plan === 'doc' ? 'this document' : TIER_LABEL[aiTier] || 'Core';
    const label = (ENGINE[me.provider] || 'Swift') + ' · ' + tierTag + ' · ' + pct + '% left';
    $('walletLabel').textContent = label;
    $('walletLabel').title = fmtTokens(me.tokens_balance) + ' of ' + fmtTokens(max) + ' tokens';
    $('walletFill').style.width = pct + '%';
    $('planStatus').textContent = 'Current: ' + label + '.';
  }else{
    $('wallet').style.display='block';
    $('walletLabel').textContent = 'Free plan · Spark engine';
    $('walletFill').style.width = '100%';
    $('planStatus').textContent = 'You are on the Free plan (Spark engine).';
  }
}
function updateBalance(left){
  if(me && typeof left === 'number'){ me.tokens_balance = left; if(left <= 0){ me.effective='free'; say('Your token pack is finished — you are back on the Free plan. Tap ⭐ to top up.','sys'); } renderWallet(); }
}

function openPlans(){
  if(!session){ say('Login first to upgrade.'); return; }
  /* label cards by current state: top-up vs switch */
  const curProv = (me && me.effective==='paid') ? me.provider : null;
  document.querySelectorAll('.planCard[data-plan^="sub_"]').forEach(c=>{
    const prov = c.dataset.plan==='sub_claude_99' ? 'anthropic' : 'openai';
    const price = c.querySelector('.price');
    const base = '₹' + (PLAN_INR[c.dataset.plan] || (c.dataset.plan==='sub_claude_99' ? 99 : 49));
    if(!curProv) price.textContent = base;
    else if(prov === curProv) price.innerHTML = base + '<br><small style="font-weight:400">top up</small>';
    else price.innerHTML = base + '<br><small style="font-weight:400">switch + buy</small>';
  });
  /* free switch card: active SUBSCRIPTION balance, both directions (doc packs are Swift-locked) */
  if(curProv && me.tokens_balance > 0 && me.plan !== 'doc'){
    const toSage = curProv === 'openai';
    const conv = Math.floor(me.tokens_balance * RATE_INR[curProv] / RATE_INR[toSage ? 'anthropic' : 'openai']);
    $('convertCard').querySelector('b').textContent = toSage ? 'Switch to Sage — free' : 'Switch to Swift — free';
    $('convertDesc').textContent = `${fmtTokens(me.tokens_balance)} ${toSage?'Swift':'Sage'} tokens → ~${fmtTokens(conv)} ${toSage?'Sage':'Swift'} tokens. Same money value.`;
    $('convertCard').style.display = 'flex';
  }else{
    $('convertCard').style.display = 'none';
  }
  /* pay-per-document: only for users WITHOUT an active paid balance */
  const onFree = !me || me.effective !== 'paid';
  if(onFree && lines.length && numPages){
    $('docPlanCard').style.display='flex';
    $('docPlanDesc').textContent = `One-time unlock for ${docLabel || 'this document'} (${numPages} pages) on Swift`;
    const tokens = numPages*800*4 + 50000;
    $('docPlanPrice').textContent = '₹' + Math.max(19, Math.ceil((tokens/1e6)*30*2.5));
  }else{
    $('docPlanCard').style.display='none';
  }
  /* custom top-up: active subscribers keep their engine; others pick */
  if(curProv && me.plan !== 'doc'){
    $('customProv').value = curProv;
    $('customProv').disabled = true;
  }else{
    $('customProv').disabled = false;
  }
  customPreview();
  /* engine power + Token Saver now live in Settings → AI Engine (read from localStorage) */
  renderWallet();
  $('plans').style.display='flex';
}
$('upgradeBtn').addEventListener('click', openPlans);
$('plansClose').addEventListener('click', ()=> $('plans').style.display='none');
$('plans').addEventListener('click', e=>{ if(e.target===$('plans')) $('plans').style.display='none'; });

function loadRzp(){
  return new Promise((res, rej)=>{
    if(window.Razorpay) return res();
    const sc = document.createElement('script');
    sc.src = 'https://checkout.razorpay.com/v1/checkout.js';
    sc.onload = res; sc.onerror = ()=>rej(new Error('Could not load payment window'));
    document.head.appendChild(sc);
  });
}
async function doFreeUpgrade(){
  $('plans').style.display='none';
  sayProgress('Switching your plan…');
  try{
    const {data:{session:s}} = await sb.auth.getSession();
    const r = await fetch(CONFIG.PAY_URL + '/switch', {
      method:'POST',
      headers:{'content-type':'application/json', authorization:'Bearer '+s.access_token},
      body:'{}'
    });
    const v = await r.json();
    removeProgress();
    if(v.ok){ say(`🔁 Done! You are now on the ${ENGINE[v.provider]||'Swift'} plan with ${fmtTokens(v.tokens_balance)} tokens.`); await fetchMe(); }
    else say('Switch failed: ' + (v.error||'unknown'));
  }catch(e){ removeProgress(); say('Switch error: '+e.message); }
}

/* custom top-up: live token preview + provider lock for active subscribers */
function customPreview(){
  const amt = parseInt($('customAmt').value) || 0;
  const prov = $('customProv').value;
  $('customTok').textContent = (amt >= 49 && amt <= 5000)
    ? '≈ ' + fmtTokens(Math.floor(amt / RATE_INR[prov])) + ' tokens'
    : 'min ₹49';
}
$('customAmt').addEventListener('input', customPreview);
$('customProv').addEventListener('change', customPreview);
$('customBuy').addEventListener('click', ()=>{
  const amt = parseInt($('customAmt').value) || 0;
  if(amt < 49){ $('customTok').textContent = 'min ₹49'; $('customAmt').focus(); return; }
  if(amt > 5000){ $('customTok').textContent = 'max ₹5000'; $('customAmt').focus(); return; }
  buy('topup', { inr: amt, provider: $('customProv').value });
});

async function buy(planKey, extra){
  if(CONFIG.PAY_URL.startsWith('PASTE')){ say('Payments are not set up yet.','sys'); return; }
  $('plans').style.display='none';
  sayProgress('Preparing payment…');
  try{
    await loadRzp();
    const {data:{session:s}} = await sb.auth.getSession();
    const or = await fetch(CONFIG.PAY_URL + '/order', {
      method:'POST',
      headers:{'content-type':'application/json', authorization:'Bearer '+s.access_token},
      body: JSON.stringify(Object.assign({plan: planKey, pages: numPages || 1}, extra || {}))
    });
    if(!or.ok){ const j = await or.json().catch(()=>({})); throw new Error(j.error||'order failed'); }
    const order = await or.json();
    removeProgress();
    const rz = new Razorpay({
      key: order.key_id,
      order_id: order.order_id,
      amount: order.amount,
      currency: 'INR',
      name: 'Lexora AI',
      description: order.label,
      prefill: { email: session.user.email },
      theme: { color: '#ffb347' },
      handler: async (resp)=>{
        sayProgress('Confirming payment…');
        try{
          const vr = await fetch(CONFIG.PAY_URL + '/verify', {
            method:'POST',
            headers:{'content-type':'application/json', authorization:'Bearer '+s.access_token},
            body: JSON.stringify(resp)
          });
          const v = await vr.json();
          removeProgress();
          if(v.ok){
            say(`🎉 Payment successful! ${fmtTokens(v.tokens_balance)} tokens in your wallet. Enjoy!`);
            await fetchMe();
          }else say('Payment verification failed: ' + (v.error||'unknown') + '. If money was deducted, contact support.');
        }catch(e){ removeProgress(); say('Payment verification error: '+e.message); }
      }
    });
    rz.open();
  }catch(e){ removeProgress(); say('Payment could not start ('+e.message+').'); }
}
document.querySelectorAll('.planCard[data-plan]').forEach(c=> c.addEventListener('click', ()=> buy(c.dataset.plan)));
$('convertCard').addEventListener('click', doFreeUpgrade);

/* ---------------- Theme ---------------- */
$('themeBtn').addEventListener('click', ()=>{
  document.body.classList.toggle('light');
  localStorage.setItem('ra_theme', document.body.classList.contains('light')?'light':'dark');
});
if(localStorage.getItem('ra_theme')==='light') document.body.classList.add('light');

/* ---------------- Boot ---------------- */
/* login.html hands guests over with #guest — skip the overlay for them */
if(location.hash === '#guest'){ guest = true; enterApp(null); }
/* settings/tools pages deep-link the plans dialog with #plans */
if(location.hash === '#plans') setTimeout(()=>{ try{ openPlans(); }catch(e){} }, 900);
initAuth();
updateMode();
