# Lexora AI — UI Redesign Brief (hand this + screenshots to the design session)

## 1. What Lexora AI is (so the design has a soul)
"Your AI Companion for Every Document." A privacy-first web app, made in India:
a reader that speaks documents aloud with karaoke highlighting, an AI companion
that explains/answers/navigates by voice, and 40+ PDF/Word/image tools that run
in the browser (files never leave the device). Competitors to beat on feel:
Adobe Acrobat web, Smallpdf, iLovePDF, Speechify, ChatPDF. The brand promise the
UI must radiate: **calm, trustworthy, private, effortless — a companion, not a
control panel.**

## 2. Current design system (evolve it, don't discard it)
- Palette: near-black `#111110` bg · off-white `#faf9f5` · panels `#1a1a19` ·
  lines `#2a2a28` · muted `#9aa1b5` · ONE accent orange `#e07a3f` (light mode
  `#c96431`). **Hard rule: black/white/orange only, NO gradients.**
- Type: Georgia serif for display headings (Claude-like), system sans for body.
- Shapes: 9–14px radii, soft shadows, 1px hairline borders, generous padding.
- Light + dark themes (toggle everywhere, `body.light`).
- Tone of copy: warm, plain-language, honest ("never a bigger file, promise").

## 3. Surface inventory — screenshot ALL of these (dark + light, desktop + mobile)
1. **Public landing** (log out, open lexoraai.online) — hero, features grid,
   popular tools, pricing cards, FAQ accordion, footer.
2. **Login page** (/login) — Google/Apple/email-OTP card, guest link.
3. **Reader (the heart)** (open a PDF as guest) — capture: empty dropzone state;
   document rendering with karaoke highlight mid-read; playbar (speed/voice/page,
   expanded + collapsed); selection bar ("Explain this"); page spinner.
4. **Companion panel** — chat with a few messages, "Thinking…", voice mic state,
   collapsed state, mobile bottom-sheet state.
5. **Tools catalog** (/tools) — chips row (All/PDF/Word/Image/Scan&AI/★Premium),
   card grid with ★ badges, dark+light.
6. **Tool flow, every stage**: drop screen → file preview (thumbnails) →
   options sidebar → progress screen → done screen (with "Open in the reader"
   button). Shoot at least: Merge (multi-file), Split (page-picker), Compress.
7. **Interactive editors** (the most custom UI): Sign PDF (draw/type/import
   tabs, drag+resize on page), Edit PDF (tap-to-edit highlight, text box,
   white-out), Crop (rectangle + dimming), Redact, Compare (side-by-side diff),
   Fill Forms (field list), Edit Word (page-like editor).
8. **★ Premium consent modal** (run OCR/compress in ★ mode) — the quote/price/
   consent card; also the free⟷★ toggle in tool options.
9. **Scan page** (/scan) — camera view, edge detection overlay, filters.
10. **Settings** (/settings) — every section, esp. AI Engine (tier buttons,
    Token Saver, the 3-way Private/Smart/Deep "Document understanding" row).
11. **Plans & wallet modal** (index → Plans) — wallet card, plan cards,
    "pay from wallet" buttons.
12. **SEO/marketing pages** — one tool page (e.g. /merge-pdf), FAQ, About.
13. **Small parts**: toasts, onboarding spotlight tour, account popover,
    sidebar/drawer (mobile), 9-dot menu, loading spinners, drop-veil.

## 4. Known UI weaknesses (design targets, be brutal)
- Overall: functional but utilitarian — lacks a memorable visual signature,
  hierarchy sometimes flat (everything is a same-weight panel).
- Reader: playbar is crowded on mobile; karaoke highlight could feel more
  premium; empty state is plain.
- Tools grid: 40+ cards = wall of sameness; needs better scanning (grouping,
  size rhythm, iconography system instead of emoji glyphs).
- Emoji-as-icons everywhere (🧩✂️📉) — replace with a consistent line-icon set.
- Editors: floating handles/boxes feel dev-made; deserve polished manipulation
  UI (snap guides, subtle shadows, better handles).
- Modals (consent, plans) are text-heavy; need clearer visual pricing.
- Landing is solid but generic-SaaS; wants ONE signature visual (e.g. a living
  karaoke-highlight motif) used consistently.
- Mobile: usable but designed desktop-first; bottom-sheet patterns inconsistent.

## 5. HARD constraints for the designer (or the design won't be buildable)
1. Keep the palette rule: black/white/orange, no gradients, both themes.
2. Keep Georgia-serif display + system sans (or propose ONE self-hostable free
   font pair — no paid fonts, mind font-loading perf).
3. **CSS-first redesign**: the app is plain HTML + classic JS that creates DOM
   by element IDs — layouts can change, but element IDs and rough DOM nesting
   must survive. Deliver as design tokens + per-surface specs, NOT a React
   rebuild. No component frameworks.
4. Performance is a feature: no heavy images, no animation libraries; subtle
   CSS transitions only. Core Web Vitals must not regress.
5. Accessibility: AA contrast in both themes, visible focus states, hit areas
   ≥40px on mobile.
6. Privacy messaging (🔒 "never leaves your device") must stay visually
   prominent — it's the brand differentiator, not fine print.

## 6. What to ask the design session to DELIVER
1. **Design tokens** — a drop-in replacement for theme.css `:root` variables
   (colors incl. any new neutrals, radii, shadows, spacing scale, type scale).
2. **Icon direction** — a named open-source line-icon set (e.g. Lucide/Tabler,
   MIT) + mapping for the ~45 tool icons.
3. **Per-surface mockups** for: landing, reader+playbar+companion, tools
   catalog, tool flow (4 stages), one editor (Sign), consent modal, settings,
   plans/wallet, mobile reader + mobile tools.
4. **A signature element** — one ownable visual motif used across surfaces.
5. **Spec notes per mockup** — spacing/typography/state annotations, both themes.
6. Format: images + a single markdown spec doc, so the build session can
   implement it as CSS (theme.css/pages.css/app.css/landing.css evolution).

## 7. How it will be implemented (for planning)
Staged, low-risk: tokens first (instant global reskin) → catalog + tool flow →
reader/playbar → editors → modals/settings → landing/SEO pages. Each stage is
CSS + minimal markup edits, verified against the JS-created DOM. HANDOVER.md
gets a Step entry per stage.
