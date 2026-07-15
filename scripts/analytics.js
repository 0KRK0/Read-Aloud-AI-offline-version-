'use strict';
/* ============================================================
   Lexora AI — analytics loader (privacy-first: OFF until IDs are set).
   Fill in the IDs below and redeploy — nothing loads while they are empty,
   so the site ships with zero third-party tracking by default.

   window.lxTrack(event, params) is always available (no-ops when analytics
   is off). Suggested conversion events to wire up over time:
     lxTrack('sign_up')            — after first successful login
     lxTrack('tool_run',{tool})    — a tool completes on tools.html
     lxTrack('premium_run',{tool}) — a ★ premium job completes
     lxTrack('purchase',{value})   — wallet top-up / plan purchase verified
   ============================================================ */
var LX_GA4_ID = '';        /* e.g. 'G-XXXXXXXXXX'  (Google Analytics 4)   */
var LX_CLARITY_ID = '';    /* e.g. 'abcdefghij'    (Microsoft Clarity)    */

(function(){
  var q = [];
  window.lxTrack = function(ev, params){
    try{
      if(window.gtag) window.gtag('event', ev, params || {});
      else q.push([ev, params]);
    }catch(e){}
  };

  if(LX_GA4_ID){
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + LX_GA4_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function(){ dataLayer.push(arguments); };
    gtag('js', new Date());
    gtag('config', LX_GA4_ID, { anonymize_ip: true });
    q.forEach(function(x){ gtag('event', x[0], x[1] || {}); });
    q = [];
  }

  if(LX_CLARITY_ID){
    (function(c, l, a, r, i){
      c[a] = c[a] || function(){ (c[a].q = c[a].q || []).push(arguments); };
      var t = l.createElement(r); t.async = 1;
      t.src = 'https://www.clarity.ms/tag/' + i;
      var y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', LX_CLARITY_ID);
  }
})();
