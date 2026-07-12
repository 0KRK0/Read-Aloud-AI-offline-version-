/* Lexora AI — sidebar navigation & companion collapse (Phase 1) */
(function(){
  'use strict';
  const $$ = id => document.getElementById(id);

  /* --- sidebar actions (text-first, Claude style) --- */
  const wire = (id, fn) => { const el = $$(id); if(el) el.addEventListener('click', fn); };

  wire('navHome', ()=>{ if(typeof closeTools === 'function') closeTools(); window.scrollTo(0,0); });
  wire('navTools', ()=>{ location.href = 'tools.html'; });
  wire('navScan',  ()=>{ location.href = 'scan.html'; });
  wire('navSettings', ()=>{ location.href = 'settings.html'; });
  wire('navPlans', ()=>{ if(typeof openPlans === 'function') openPlans(); });

  /* --- bottom account section (Claude-style popover) --- */
  /* NOTE: `session` is a top-level `let` in app-core.js — it lives in the shared
     script scope, NOT on window. Reading window.session always gave undefined,
     which is why the sidebar was stuck on "Guest" even after login. */
  function niceName(email){
    const raw = (email.split('@')[0] || '').replace(/[._-]+/g, ' ').trim();
    if(!raw) return 'You';
    return raw.replace(/\b\w/g, c => c.toUpperCase());   /* Konarajeshkumar011 → Konarajeshkumar011 */
  }
  function syncAccount(){
    const s = (typeof session !== 'undefined' && session && session.user) ? session : null;
    const email = (s && s.user.email) || '';
    const nm = $$('acctName'), sub = $$('acctSub'), a = $$('acctAvatar');
    if(nm) nm.textContent = email ? niceName(email) : 'Guest';
    if(sub) sub.textContent = email || 'Not signed in';
    if(a) a.textContent = email ? email[0].toUpperCase() : '👤';
    const lo = $$('acctLogout'), li = $$('acctLogin');
    if(lo) lo.style.display = email ? 'block' : 'none';
    if(li) li.style.display = email ? 'none' : 'block';
  }
  setInterval(syncAccount, 1500);
  syncAccount();

  /* account popover: opens above the account row, closes on outside click / item click */
  const acctWrap = $$('acctWrap'), acctBtn = $$('acctBtn');
  if(acctBtn && acctWrap){
    acctBtn.addEventListener('click', e=>{
      e.stopPropagation();
      const open = acctWrap.classList.toggle('open');
      acctBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    acctWrap.querySelectorAll('.acctMenu button').forEach(el=>
      el.addEventListener('click', ()=>{ acctWrap.classList.remove('open'); acctBtn.setAttribute('aria-expanded','false'); }));
    document.addEventListener('click', e=>{
      if(acctWrap.classList.contains('open') && !acctWrap.contains(e.target)){
        acctWrap.classList.remove('open'); acctBtn.setAttribute('aria-expanded','false');
      }
    });
  }

  wire('acctTheme', ()=>{ const t = $$('themeBtn'); if(t) t.click(); });
  wire('acctLogout', ()=>{ const l = $$('logoutBtn'); if(l) l.click(); });
  wire('acctLogin', ()=>{ location.href = 'login.html'; });
  wire('acctUpgrade', ()=>{ if(typeof openPlans === 'function') openPlans(); });

  /* --- companion collapse / reopen (desktop) --- */
  wire('compCollapse', ()=>{ document.body.classList.add('compHidden'); });
  wire('compReopen',  ()=>{ document.body.classList.remove('compHidden'); });

  /* --- mobile drawer (Claude-style: same sidebar slides in from the left) --- */
  wire('hambBtn', ()=> document.body.classList.toggle('navOpen'));
  wire('navVeil', ()=> document.body.classList.remove('navOpen'));
  document.querySelectorAll('#sideNav nav a, #sideNav nav button, #sideNav .acctMenu button')
    .forEach(el=> el.addEventListener('click', ()=> document.body.classList.remove('navOpen')));

  /* --- chat attach (paperclip) opens a document --- */
  wire('attachBtn', ()=>{ const f = $$('fileInput'); if(f) f.click(); });

  /* --- header 9-dot menu --- */
  const menu = $$('hdrMenu');
  wire('gridBtn', e=>{ e.stopPropagation(); menu.classList.toggle('open'); });
  if(menu){
    menu.querySelectorAll('.mItem').forEach(el=> el.addEventListener('click', ()=> menu.classList.remove('open')));
    document.addEventListener('click', e=>{
      if(menu.classList.contains('open') && !menu.contains(e.target) && e.target.id !== 'gridBtn') menu.classList.remove('open');
    });
  }
})();
