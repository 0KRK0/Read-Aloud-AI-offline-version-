# Lexora AI — Repository Structure (the "why is nothing in subfolders" answer)

For a static Cloudflare Pages site, **root-level filenames ARE the URLs**
(`merge-pdf.html` → lexoraai.online/merge-pdf via clean URLs). Moving HTML into
subfolders would change every public URL, break the 52-URL sitemap, canonicals
and internal links. So pages live at root BY DESIGN — everything else is
foldered. Do not "tidy" the HTML into subfolders.

```
online/
├─ *.html                  ← ALL public pages (root = URL structure, on purpose)
│   ├─ index.html            the reader app + public landing
│   ├─ tools/scan/settings/login.html   app pages
│   ├─ faq/about/security/contact/privacy/terms.html   trust pages
│   └─ 43 SEO pages (merge-pdf.html … explain-pdf-with-ai.html)
├─ scripts/                ← ALL frontend JS (classic scripts, load order matters — HANDOVER §2)
├─ styles/                 ← app.css, theme.css, pages.css, landing.css
├─ lib/                    ← bundled third-party (pdf.js, tesseract, mammoth…) — immutable, hard-cached
├─ icons/                  ← app icons + og-card (KRK adds the PNGs)
├─ convert-server/         ← Railway service: document conversions (Node + engines)
├─ translate-server/       ← Railway service: NLLB translation (Python + CT2)
├─ docs/                   ← guides (CAPACITOR-GUIDE.md; new docs go here)
├─ worker-*.js             ← the 3 Cloudflare Workers (paste into dashboard)
├─ schema.sql              ← Supabase schema (idempotent)
├─ sw.js, manifest.webmanifest, favicon.svg, robots.txt, sitemap.xml, _headers
├─ HANDOVER.md             ← THE living continuation doc (always at root)
└─ SETUP*.md, DEPLOY.md, SEO-LAUNCH-CHECKLIST.md, LEXORA-VOICE-HANDOVER.md
```

Conventions for future files: new SEO page = root shell + `scripts/seo-data.js`
entry + sitemap line. New backend service = its own top-level folder with
Dockerfile + README (like translate-server). New doc = `docs/`. Legacy docs at
root stay (moving files isn't possible from the assistant sandbox; new docs
keep the rule). `index.pre-1b.backup.html` is dead weight — KRK can delete it
manually anytime.
