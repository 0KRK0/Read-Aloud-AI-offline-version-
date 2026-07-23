/* ---------------- Wallet & plans ---------------- */
let me = null;
let walletPaise = 0;
/* ---------------- Universal ₹ wallet (money balance) ---------------- */
function fmtRs(paise){ return Lx.fmt.rupees(paise); }   /* → utils/format.js */
function renderWalletMoney(){ const el = $('walletMoney'); if(el) el.textContent = fmtRs(walletPaise); renderWalletButtons(); }
async function fetchWallet(){
  if(!session || !sb) return;
  try{
    const { data } = await sb.from('profiles').select('wallet_paise').eq('id', session.user.id).single();
    if(data && typeof data.wallet_paise === 'number') walletPaise = data.wallet_paise;
  }catch(e){}
  renderWalletMoney();
}
/* every paid engine card ALWAYS shows an action button:
   • wallet can cover it → orange "Switch to <Engine>" (pays from ₹ wallet)
   • not enough         → ghost "Buy ₹X" (Razorpay top-up/checkout) */
function renderWalletButtons(){
  const paidCur = (me && me.effective === 'paid') ? me.provider : null;
  document.querySelectorAll('.planCard[data-plan^="sub_"]').forEach(c=>{
    const price = Lx.plans.priceInr(c.dataset.plan);
    const name = ((c.querySelector('b') || {}).textContent || 'plan').trim();
    const prov = c.dataset.plan === 'sub_claude_99' ? 'anthropic' : 'openai';
    const afford = walletPaise >= price * 100;
    /* price line: only claim "· from wallet" when the balance can actually cover it */
    const priceEl = c.querySelector('.price');
    if(priceEl){
      const verb = (paidCur && prov === paidCur) ? 'top up' : 'switch';
      priceEl.innerHTML = '₹' + price +
        '<small style="font-weight:400"> ' + verb + (afford ? ' · from wallet' : '') + '</small>';
    }
    /* action button */
    let fw = c.querySelector('.fromWallet');
    if(!fw){ fw = document.createElement('button'); fw.type = 'button'; c.appendChild(fw); }
    if(afford){
      fw.className = 'fromWallet';
      /* full label on desktop, short on mobile (CSS toggles the spans) */
      fw.innerHTML = '<span class="bL">Switch to ' + name + '</span><span class="bS">Switch</span>';
      fw.onclick = e=>{ e.stopPropagation(); buyFromWallet(c.dataset.plan); };
    }else{
      fw.className = 'fromWallet insuff';
      fw.textContent = 'Buy ₹' + price;
      fw.onclick = e=>{ e.stopPropagation(); buy(c.dataset.plan); };
    }
    fw.style.display = '';
  });
}
async function buyFromWallet(planKey){
  $('plans').style.display = 'none';
  sayProgress('Paying from your ₹ wallet…');
  try{
    const v = await Lx.api.payments.walletBuysub({ plan: planKey });
    removeProgress();
    walletPaise = v.wallet_paise; renderWalletMoney();
    say(`✅ Done — paid from your ₹ wallet. You're on the ${ENGINE[v.provider] || 'Swift'} plan with ${fmtTokens(v.tokens_balance)} tokens. Wallet: ${fmtRs(v.wallet_paise)}.`);
    await fetchMe();
  }catch(e){
    removeProgress();
    /* the worker returns 402 {error:'insufficient'} → core throws an ApiError */
    if(e && (e.status === 402 || e.message === 'insufficient')){
      say("Your ₹ wallet doesn't have enough for that — top up and try again.");
      openPlans();
    }else say('Wallet payment error: ' + (e && e.message || 'unknown') + '.');
  }
}
function fmtTokens(n){ return Lx.fmt.tokens(n); }   /* → utils/format.js */
async function fetchMe(){
  if(!session || !configured) return;
  try{ me = await Lx.api.gateway.me(); renderWallet(); }catch(e){}
}
/* Plan prices / token sizes / rates live in the domain model (Lx.plans), which
   refreshes from the live payments /config with env-configured values (no
   redeploy drift, no hardcoded truth). Refresh it at boot. */
if(configured) Lx.plans.loadConfig();
/* user-facing engine names — provider ids never appear in the UI */
const ENGINE = Lx.plans.ENGINE;          /* → domain/metering.js (hidden-provider names) */
const TIER_LABEL = Lx.plans.TIER_LABEL;
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
    const base = '₹' + Lx.plans.priceInr(c.dataset.plan);
    const verb = (curProv && prov === curProv) ? 'top up' : 'switch';
    price.innerHTML = base + '<small style="font-weight:400"> ' + verb + '</small>';   /* renderWalletButtons adds "· from wallet" when affordable */
  });
  /* free switch card: active SUBSCRIPTION balance, both directions (doc packs are Swift-locked) */
  if(curProv && me.tokens_balance > 0 && me.plan !== 'doc'){
    const toSage = curProv === 'openai';
    const conv = Lx.plans.convertBalance(curProv, toSage ? 'anthropic' : 'openai', me.tokens_balance);
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
  fetchWallet();
  $('plans').style.display='flex';
}
$('upgradeBtn').addEventListener('click', openPlans);
/* ₹ wallet top-ups */
document.querySelectorAll('.wtop[data-inr]').forEach(b=> b.addEventListener('click', ()=> buy('wallet', { inr: +b.dataset.inr })));
{
  const wcb = $('wCustomBuy'), wca = $('wCustomAmt');
  if(wcb) wcb.addEventListener('click', ()=>{
    const inr = parseInt(wca && wca.value) || 0;
    if(inr < 20){ lxToast('The smallest top-up is ₹20.'); return; }
    if(inr > 5000){ if(wca) wca.value = '5000'; lxToast('The most you can add at once is ₹5,000.'); return; }
    buy('wallet', { inr });
  });
  if(wca) wca.addEventListener('input', ()=>{ if(parseInt(wca.value) > 5000){ wca.value = '5000'; lxToast('The most you can add at once is ₹5,000.'); } });
}
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
    const v = await Lx.api.payments.switchEngine();
    removeProgress();
    say(`🔁 Done! You are now on the ${ENGINE[v.provider]||'Swift'} plan with ${fmtTokens(v.tokens_balance)} tokens.`);
    await fetchMe();
  }catch(e){ removeProgress(); say('Switch error: '+(e && e.message || 'unknown')); }
}

/* our own toast notification (not a browser alert) */
function lxToast(msg){
  let t = document.getElementById('lxToast');
  if(!t){ t = document.createElement('div'); t.id = 'lxToast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(lxToast._t);
  lxToast._t = setTimeout(()=> t.classList.remove('show'), 2800);
}
/* custom amount: cap at ₹5000 as the user types, with a friendly in-app notice */
$('customAmt').addEventListener('input', ()=>{
  if(parseInt($('customAmt').value) > 5000){
    $('customAmt').value = '5000';
    lxToast('You can top up up to ₹5,000 at a time.');
  }
});
/* custom top-up: live token preview + provider lock for active subscribers */
function customPreview(){
  const amt = parseInt($('customAmt').value) || 0;
  const prov = $('customProv').value;
  $('customTok').textContent = (amt >= 49 && amt <= 5000)
    ? '≈ ' + fmtTokens(Lx.plans.tokensForRupees(prov, amt)) + ' tokens'
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
  if(!configured){ say('Payments are not set up yet.','sys'); return; }
  $('plans').style.display='none';
  sayProgress('Preparing payment…');
  try{
    await loadRzp();
    const order = await Lx.api.payments.order(Object.assign({plan: planKey, pages: numPages || 1}, extra || {}));
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
          const v = await Lx.api.payments.verify(resp);   /* throws on non-ok */
          removeProgress();
          if(planKey === 'wallet'){
            await fetchWallet();   /* authoritative ₹ balance from Supabase, not the verify payload */
            say(`🎉 Added to your ₹ wallet! Balance: ${fmtRs(walletPaise)}.`);
          }else{
            say(`🎉 Payment successful! ${fmtTokens(v.tokens_balance)} tokens in your wallet. Enjoy!`);
            await fetchMe();
          }
        }catch(e){ removeProgress(); say('Payment verification failed ('+(e && e.message || 'unknown')+'). If money was deducted, contact support.'); }
      }
    });
    rz.open();
  }catch(e){ removeProgress(); say('Payment could not start ('+e.message+').'); }
}
/* only the contextual ROWS (convert / just-this-document) are click-to-buy;
   engine cards use their explicit Switch/Buy buttons (renderWalletButtons). */
document.querySelectorAll('.pwRow[data-plan]').forEach(c=> c.addEventListener('click', ()=> buy(c.dataset.plan)));
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
