/* Lexora AI — themed dropdowns.
   Progressive enhancement over native <select>: the real <select> stays in the
   DOM (so every $(id).value read and every existing listener keeps working) —
   we just hide it and drive a styled popup that matches the theme (orange
   highlight, panel background) instead of the OS-blue native list.
   Handles dynamically-injected selects (tool options) and programmatic value
   changes, so labels never go stale. Mark a <select data-native> to skip it. */
(function(){
  'use strict';

  function enhance(sel){
    if(!sel || sel.dataset.lx === '1' || sel.hasAttribute('data-native')) return;
    sel.dataset.lx = '1';

    var wrap = document.createElement('div');
    wrap.className = 'lxsel';
    if(sel.style.maxWidth) wrap.style.maxWidth = sel.style.maxWidth;
    if(sel.style.width && sel.style.width !== 'auto') wrap.style.width = sel.style.width;
    if(sel.style.width === 'auto') wrap.style.display = 'inline-block';
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lxsel-btn';
    btn.innerHTML = '<span class="lxsel-label"></span>' +
      '<svg class="lxsel-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
    wrap.appendChild(btn);

    var list = document.createElement('div');
    list.className = 'lxsel-list';
    wrap.appendChild(list);

    var labelEl = btn.querySelector('.lxsel-label');
    function syncLabel(){
      var o = sel.options[sel.selectedIndex];
      labelEl.textContent = o ? o.textContent : '';
      btn.disabled = sel.disabled;
    }
    function buildList(){
      list.innerHTML = '';
      Array.prototype.forEach.call(sel.options, function(o, i){
        var it = document.createElement('div');
        it.className = 'lxsel-opt' + (i === sel.selectedIndex ? ' sel' : '');
        it.textContent = o.textContent;
        it.addEventListener('click', function(e){
          e.stopPropagation();
          if(sel.selectedIndex !== i){ sel.selectedIndex = i; sel.dispatchEvent(new Event('change', {bubbles:true})); }
          syncLabel(); closeList();
        });
        list.appendChild(it);
      });
    }

    var isOpen = false;
    function openList(){
      if(sel.disabled) return;
      buildList();
      wrap.classList.add('open'); isOpen = true;
      var r = btn.getBoundingClientRect();
      var below = window.innerHeight - r.bottom;
      wrap.classList.toggle('up', below < 260 && r.top > below);   /* flip up near the bottom */
      var s = list.querySelector('.lxsel-opt.sel'); if(s) s.scrollIntoView({block:'nearest'});
    }
    function closeList(){ wrap.classList.remove('open','up'); isOpen = false; }

    btn.addEventListener('click', function(e){ e.stopPropagation(); isOpen ? closeList() : openList(); });
    document.addEventListener('click', function(e){ if(isOpen && !wrap.contains(e.target)) closeList(); });
    btn.addEventListener('keydown', function(e){
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); isOpen ? closeList() : openList(); }
      else if(e.key === 'Escape'){ closeList(); }
      else if(e.key === 'ArrowDown' && sel.selectedIndex < sel.options.length - 1){ e.preventDefault(); sel.selectedIndex++; sel.dispatchEvent(new Event('change',{bubbles:true})); syncLabel(); }
      else if(e.key === 'ArrowUp' && sel.selectedIndex > 0){ e.preventDefault(); sel.selectedIndex--; sel.dispatchEvent(new Event('change',{bubbles:true})); syncLabel(); }
    });

    sel.addEventListener('change', syncLabel);
    /* option list filled later (voices/pages) or disabled toggled → refresh label */
    new MutationObserver(syncLabel).observe(sel, {attributes:true, attributeFilter:['disabled'], childList:true});
    /* reflect programmatic sel.value / sel.selectedIndex assignments */
    try{
      var vD = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
      Object.defineProperty(sel, 'value', { configurable:true, get:function(){ return vD.get.call(this); }, set:function(v){ vD.set.call(this, v); syncLabel(); } });
      var iD = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');
      Object.defineProperty(sel, 'selectedIndex', { configurable:true, get:function(){ return iD.get.call(this); }, set:function(v){ iD.set.call(this, v); syncLabel(); } });
    }catch(e){}

    syncLabel();
  }

  function enhanceAll(root){
    (root || document).querySelectorAll('select:not([data-lx]):not([data-native])').forEach(enhance);
  }
  function boot(){
    enhanceAll(document);
    var c = document.getElementById('tvSideOpts');   /* tool options are injected here */
    if(c) new MutationObserver(function(){ enhanceAll(c); }).observe(c, {childList:true, subtree:true});
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
