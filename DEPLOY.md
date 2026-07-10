# Deploy ReadAloud AI online to GitHub Pages

The whole `online\` folder goes to GitHub. Nothing in it is secret
(the CONFIG values in index.html are publishable by design).

## Option A — with git (recommended, one-time 5 minutes)

If git is not installed: download from https://git-scm.com/download/win (defaults are fine).

Open PowerShell and run, line by line:

```powershell
cd "D:\Pdf to Voice\ReadAloud AI\online"
git init
git add .
git commit -m "ReadAloud AI online v1"
```

On github.com (logged in as 0KRK0): **New repository** → name: `readaloud-ai` →
Public → do NOT add a README → Create. Then back in PowerShell:

```powershell
git branch -M main
git remote add origin https://github.com/0KRK0/readaloud-ai.git
git push -u origin main
```

(git will open a browser window to log you in the first time.)

Future updates are just:
```powershell
cd "D:\Pdf to Voice\ReadAloud AI\online"
git add . ; git commit -m "update" ; git push
```

## Option B — GitHub Desktop (no commands)

1. Install https://desktop.github.com → sign in
2. File → Add local repository → choose `D:\Pdf to Voice\ReadAloud AI\online`
   → "create a repository" when asked → Publish repository → name `readaloud-ai`,
   untick "Keep this code private" → Publish
3. Future updates: open GitHub Desktop → write a summary → Commit → Push

(Plain web upload is NOT practical here — lib\cmaps has ~170 files and the
upload page takes max 100 files at a time.)

## Turn on GitHub Pages

Repo page → **Settings → Pages** → Source: *Deploy from a branch* →
Branch: `main`, folder `/ (root)` → Save.
After ~1 minute your app is live at:

    https://0krk0.github.io/readaloud-ai/

## After deploy — 3 config changes (5 min)

1. **Cloudflare worker `readaloudai`** → Settings → Variables →
   `ALLOWED_ORIGIN` = `http://localhost:8977,https://0krk0.github.io`
2. **Cloudflare worker `readaloudai-pay`** → same `ALLOWED_ORIGIN` value.
3. **Supabase** → Authentication → URL Configuration →
   - Site URL: `https://0krk0.github.io/readaloud-ai/`
   - Redirect URLs: add `https://0krk0.github.io/readaloud-ai/**`
   (otherwise magic-link emails keep sending people to localhost)

## Test from your phone

Open https://0krk0.github.io/readaloud-ai/ → login (magic link) → open a PDF
→ play → ask the companion something → make a ₹49 TEST payment
(card 5267 3181 8797 5449, any future expiry, any CVV).

Done — the product is public. 🎉
