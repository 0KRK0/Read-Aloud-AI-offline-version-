'use strict';
/* ============================================================
   Lexora AI — shared renderer for the SEO landing pages.
   Each page is a tiny shell: unique <head> + static <h1>/intro (crawlable
   without JS), body[data-page=slug]. Everything below the hero — the privacy
   note, benefits, how-it-works, FAQs, related tools, footer and the JSON-LD
   (BreadcrumbList + FAQPage) — is rendered here from scripts/seo-data.js.
   One renderer + one data file = zero duplicated page code.
   ============================================================ */
(function(){
  var slug = document.body.getAttribute('data-page');
  var d = (window.LX_SEO || {})[slug];
  var root = document.getElementById('seoRoot');
  if(!d || !root) return;
  var esc = function(s){ return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); };

  var h = '';
  /* privacy / trust line */
  h += '<p class="seoPriv">' + (d.free
    ? '🔒 <b>100% private:</b> this tool runs entirely in your browser — your file is never uploaded.'
    : '★ <b>Premium tool:</b> runs on our secure server with your consent — 50 pages free every day, then about ₹0.10 a page. Files are deleted right after the job.') + '</p>';

  /* benefits */
  h += '<h2>Why do it with Lexora AI</h2><div class="seoGrid">';
  (d.benefits || []).forEach(function(b){ h += '<div class="seoCard">' + b + '</div>'; });
  h += '</div>';

  /* how it works */
  h += '<h2>How it works</h2><ol class="seoSteps">';
  (d.steps || []).forEach(function(s){ h += '<li>' + s + '</li>'; });
  h += '</ol>';
  h += '<p><a class="seoCta" href="' + esc(d.cta) + '">' + esc(d.ctaText) + ' →</a></p>';

  /* FAQs */
  if(d.faqs && d.faqs.length){
    h += '<h2>Frequently asked questions</h2>';
    d.faqs.forEach(function(f){
      h += '<details><summary>' + esc(f[0]) + '</summary><p>' + f[1] + '</p></details>';
    });
  }

  /* related tools (internal linking) */
  if(d.related && d.related.length){
    h += '<h2>Related tools</h2><div class="seoRel">';
    d.related.forEach(function(r){
      var rd = LX_SEO[r];
      if(rd) h += '<a href="' + r + '.html">' + esc(rd.name) + '</a>';
    });
    h += '<a href="tools.html">All 40+ tools →</a></div>';
  }

  /* footer */
  h += '<div class="seoFoot"><a href="index.html">Lexora AI</a><a href="tools.html">Tools</a><a href="faq.html">FAQ</a><a href="security.html">Security</a><a href="privacy.html">Privacy</a><span style="flex:1"></span><span>Free · Private · Made in India</span></div>';

  root.innerHTML = h;

  /* JSON-LD: breadcrumbs + FAQ (JS-injected structured data is read by Google) */
  var url = 'https://lexoraai.online/' + slug;
  var ld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'BreadcrumbList', 'itemListElement': [
      { '@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': 'https://lexoraai.online/' },
      { '@type': 'ListItem', 'position': 2, 'name': 'Tools', 'item': 'https://lexoraai.online/tools' },
      { '@type': 'ListItem', 'position': 3, 'name': d.name, 'item': url } ] }
  ]};
  if(d.faqs && d.faqs.length){
    ld['@graph'].push({ '@type': 'FAQPage', 'mainEntity': d.faqs.map(function(f){
      return { '@type': 'Question', 'name': f[0],
        'acceptedAnswer': { '@type': 'Answer', 'text': f[1].replace(/<[^>]+>/g, '') } };
    })});
  }
  var s = document.createElement('script');
  s.type = 'application/ld+json';
  s.textContent = JSON.stringify(ld);
  document.head.appendChild(s);

  /* visible breadcrumb (above the h1, prepended into the hero) */
  var crumb = document.createElement('nav');
  crumb.className = 'seoCrumbs';
  crumb.setAttribute('aria-label', 'Breadcrumb');
  crumb.innerHTML = '<a href="index.html">Home</a> › <a href="tools.html">Tools</a> › <span>' + esc(d.name) + '</span>';
  var main = document.querySelector('main .wrap') || document.body;
  main.insertBefore(crumb, main.firstChild);
})();

/* styles — injected (same pages.css-caching rationale as the app's editors) */
(function(){
  var css = '.seoPriv{background:var(--panel); border:1px solid var(--line); border-left:3px solid var(--accent); border-radius:10px; padding:12px 14px; font-size:14px; margin:18px 0 8px; line-height:1.55}'
    + '.seoCrumbs{font-size:12.5px; color:var(--muted); margin:4px 0 18px}'
    + '.seoCrumbs a{color:var(--muted); text-decoration:none}'
    + '.seoCrumbs a:hover{color:var(--accent)}'
    + 'main h2{font-family:Georgia,"Times New Roman",serif; font-size:24px; margin:40px 0 16px}'
    + '.seoGrid{display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:12px}'
    + '.seoCard{background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:16px 15px; font-size:13.5px; line-height:1.55; color:var(--muted)}'
    + '.seoCard b{color:var(--text); display:block; margin-bottom:5px}'
    + '.seoSteps{padding-left:22px; max-width:640px}'
    + '.seoSteps li{margin-bottom:10px; line-height:1.6; color:var(--muted)}'
    + '.seoSteps li b{color:var(--text)}'
    + '.seoCta{display:inline-block; background:var(--accent); color:#fff; border-radius:11px; padding:14px 26px; font-size:15.5px; font-weight:600; text-decoration:none; margin-top:6px}'
    + '.seoCta:hover{filter:brightness(1.07)}'
    + 'main details{background:var(--panel); border:1px solid var(--line); border-radius:11px; padding:13px 15px; margin-bottom:10px; max-width:760px}'
    + 'main details summary{cursor:pointer; font-weight:600; font-size:14.5px}'
    + 'main details p{color:var(--muted); font-size:13.5px; line-height:1.6; margin:10px 0 0}'
    + '.seoRel{display:flex; flex-wrap:wrap; gap:9px}'
    + '.seoRel a{background:var(--panel); border:1px solid var(--line); border-radius:9px; padding:9px 14px; color:var(--text); text-decoration:none; font-size:13px}'
    + '.seoRel a:hover{border-color:var(--accent); color:var(--accent)}'
    + '.seoFoot{margin-top:56px; padding-top:18px; border-top:1px solid var(--line); display:flex; flex-wrap:wrap; gap:8px 18px; color:var(--muted); font-size:12.5px}'
    + '.seoFoot a{color:var(--muted); text-decoration:none}'
    + '.seoFoot a:hover{color:var(--accent)}';
  var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
})();
