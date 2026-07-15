# Lexora AI — SEO / Launch checklist (15 July 2026 audit)

Everything automatable was implemented in the code (see HANDOVER §11 Step 5c).
This file lists what needs YOUR hands (accounts, dashboards, one folder copy).

## 1. REQUIRED — copy the icon files
The sandbox could not write binary files into the project folder, so the generated
icons were handed to you as downloads (icon-192.png, icon-512.png,
icon-maskable-512.png, apple-touch-icon.png, og-card.png — also in lexora-icons.zip).
→ Create the folder **`online/icons/`** and drop all five PNGs in it, then deploy.
The HTML already references them (`/icons/...`); until you do this, social-share
cards and iOS home-screen icons will 404 (the SVG favicon works regardless).

## 2. Deploy
Re-upload the whole `online/` folder to Cloudflare Pages (new files: robots.txt,
sitemap.xml, _headers, manifest.webmanifest, favicon.svg, faq.html, about.html,
security.html, contact.html, scripts/analytics.js + edits to every existing page).
Hard-refresh after deploy.

## 3. Google Search Console
1. https://search.google.com/search-console → Add property → Domain → lexoraai.online
2. Verify via DNS TXT record (Cloudflare DNS → add the TXT Google shows you).
3. Submit the sitemap: `https://lexoraai.online/sitemap.xml`
4. URL Inspection → request indexing for /, /tools, /faq, /scan.

## 4. Bing Webmaster Tools (also powers ChatGPT search / DuckDuckGo)
https://www.bing.com/webmasters → Import from Google Search Console (one click).

## 5. Analytics (all optional, all OFF by default)
- GA4: create a property at https://analytics.google.com → copy the `G-…` id into
  `scripts/analytics.js` → `LX_GA4_ID`. IP anonymization is already on.
- Microsoft Clarity: https://clarity.microsoft.com → new project → copy the id into
  `LX_CLARITY_ID` in the same file.
- Cloudflare Web Analytics: Dashboard → Analytics → Web Analytics → enable for
  lexoraai.online (no code needed — it can inject its beacon automatically on Pages).
- Conversion events: call `lxTrack('purchase',{value})` etc. at the wiring points
  listed at the top of scripts/analytics.js (sign-up in app-core's auth callback,
  purchases in app-wallet's verify success, tool runs in tools-page.js show('tvDone')).

## 6. Biggest remaining SEO lever (recommended next build)
The apex (/) JS-redirects logged-out visitors to /login — Google can crawl it, but
a real **public landing page** at / (hero, feature sections, tool links, footer)
would dramatically improve rankings + Discover eligibility. Equally big: per-tool
landing pages (`/merge-pdf`, `/compress-pdf`, …) like iLovePDF/Smallpdf — each a
static page with the tool description + FAQ + a "start" button into tools.html#id.
These were NOT auto-built because they change the site's routing surface — a
product decision for KRK.

## 7. Nice-to-haves documented, intentionally not done
- Service worker/offline cache: risky with the current cache-sensitive pages.css
  history; revisit with versioned asset names.
- CSP header: the app inlines scripts and loads CDNs; a strict CSP needs a
  careful allowlist pass. Start with `Content-Security-Policy-Report-Only`.
- Google Discover: needs large (1200px+) images per page and article-style
  content — applies if/when a blog is added (a blog on document tips would be a
  strong SEO + Discover play).
- hreflang/i18n: single locale today; the UI language work (Phase 5+) should add
  `hreflang` alternates when real translations exist.
