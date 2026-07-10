# ReadAloud AI — Online Version Setup

The online version has three parts. All free tiers except the AI usage itself.

```
User's browser (index.html on GitHub Pages)
        │  login
        ▼
Supabase  ──►  gives the user a session
        │
        ▼
Cloudflare Worker (worker.js) ──► checks session ──► asks Claude ──► answer back
```

Your Claude API key lives ONLY inside the Cloudflare Worker. Users never see it.

---

## Step 1 — Supabase (login system, free)

1. Go to https://supabase.com → Sign up → **New project** (any name, e.g. `readaloud-ai`)
2. You need TWO values:
   - **Project URL** — it is `https://YOUR-PROJECT-REF.supabase.co`.
     Find it under **Project Settings → Data API** (or look at your dashboard address:
     `supabase.com/dashboard/project/lgwqqytjqoenozhjhbkr` → your URL is
     `https://lgwqqytjqoenozhjhbkr.supabase.co`)
   - **Publishable key** — under **Project Settings → API Keys**, the one starting
     `sb_publishable_lK4DQ5LVguBYO-4afNbbVw_J_WLNlWv`. This is the modern name for the old "anon key" — same thing,
     safe to use in the browser. Copy it.
   - (Ignore the "Secret keys" section completely — never put those in the app.)
3. Go to **Authentication → URL Configuration** and set **Site URL** to your GitHub Pages
   address, e.g. `https://0krk0.github.io/YOUR-REPO/` (login links from email redirect there).
   You can change this later when you know the final address.

Email login (magic link) is on by default — nothing else to enable.

> Wherever this guide or the app says `SUPABASE_ANON_KEY`, paste your
> `sb_publishable_...` key. Same thing, new name.

## Step 2 — Anthropic API key (the AI brain, paid per use)

1. Go to https://console.anthropic.com → sign up → **API Keys → Create key** → copy it (starts `sk-ant-`)
2. Add a small amount of credit under Billing (the app uses the cheapest model, Haiku — a typical explanation costs a fraction of a rupee, but YOU pay for ALL users' questions, so start small and watch usage)

## Step 3 — Cloudflare Worker (the backend, free)

1. Go to https://dash.cloudflare.com → sign up → **Workers & Pages → Create → Worker**
2. Name it `readaloud-ai` → Deploy → then click **Edit code**
3. Delete everything, paste the contents of `worker.js`, click **Deploy**
4. Go to the worker's **Settings → Variables and Secrets** and add these variables:
   - `ANTHROPIC_API_KEY` = "sk...." (choose type **Secret**)
   - `SUPABASE_URL` = your Supabase Project URL
   - `SUPABASE_ANON_KEY` = your Supabase anon key
   - `ALLOWED_ORIGIN` = your site origin, e.g. `https://0krk0.github.io`
     (protects your backend — only your site can use it)
   - optional: `RATE_PER_MIN` (default 8) and `RATE_PER_DAY` (default 100) — AI questions allowed per user
5. Recommended — reliable rate limiting: in Cloudflare go to **Storage & Databases → KV → Create namespace** (name it `readaloud-rate`), then in the worker **Settings → Bindings → Add → KV namespace**, variable name `RATE`, select the namespace. Without this the limits still work, just less strictly.
6. Copy the worker's URL, like `https://readaloud-ai.YOURNAME.workers.dev`

## Step 4 — Connect the app

Open `index.html`, find the CONFIG block near the top of the `<script>`:

```js
const CONFIG = {
  SUPABASE_URL: 'PASTE_SUPABASE_URL',
  SUPABASE_ANON_KEY: 'PASTE_SUPABASE_ANON_KEY',
  API_URL: 'PASTE_WORKER_URL'
};
```

Paste your three values. Done.

## Step 5 — Deploy

Push this `online` folder (index.html + lib) to a GitHub repo → enable Pages, same as before. The `lib` folder is required — use GitHub Desktop or git command line (too many files for web upload).

`worker.js` and this SETUP.md do NOT need to be uploaded (worker.js lives in Cloudflare).

---

## Quick test checklist

1. Open the site → login card appears
2. "Continue without login" → reader works (no AI)
3. Login with email → click link in inbox → companion greets you
4. Open a PDF → companion asks where to start → answer by typing or 🎤
5. Hover any line → 💡 Explain button → spoken explanation
6. Ask a free question ("what is this document about?") → AI answers

## Costs summary

- GitHub Pages: free
- Supabase: free (up to 50,000 users/month)
- Cloudflare Worker: free (100,000 requests/day)
- Claude API: pay per use — only cost, only for AI questions/explanations. Reading aloud costs nothing (happens in the browser).
