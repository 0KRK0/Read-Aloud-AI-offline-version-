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

  /* --- bottom account section --- */
  function syncAccount(){
    const email = (window.session && session.user && session.user.email) || '';
    const b = $$('acctEmail'), a = $$('acctAvatar');
    if(b) b.textContent = email || 'Guest';
    if(a) a.textContent = email ? email[0].toUpperCase() : '👤';
    const lo = $$('acctLogout'), li = $$('acctLogin');
    if(lo) lo.style.display = email ? 'block' : 'none';
    if(li) li.style.display = email ? 'none' : 'block';
  }
  setInterval(syncAccount, 1500);
  syncAccount();

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
  document.querySelectorAll('#sideNav nav a, #sideNav nav button, #sideNav .account button')
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
