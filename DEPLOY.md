# Deploy ReadAloud AI to lexoraai.online (Cloudflare Pages)

Domain: **lexoraai.online** — registrar Namecheap (registrar only),
DNS + SSL + hosting all on Cloudflare. Universal SSL is automatic; never buy SSL separately.

## 1. Create the Pages project (5 min, no git needed)

1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Upload assets** (Direct Upload)
2. Project name: `readaloud-ai`
3. Drag the whole **contents** of `D:\Pdf to Voice\ReadAloud AI\online`
   (index.html, privacy.html, lib folder — the .md/.sql/worker files are harmless but you can skip them)
4. Deploy → you get `readaloud-ai.pages.dev` — check it loads.

Future updates: Workers & Pages → readaloud-ai → **Create new deployment** → drag the folder again.

## 2. Attach your domain (2 min)

Pages project → **Custom domains → Set up a custom domain** → `lexoraai.online` → Activate.
(Cloudflare adds the DNS record itself because the zone is already on Cloudflare.)
Optionally add `www.lexoraai.online` too.
SSL is automatic — the site is https within minutes.

## 3. Point the backend at the new origin (5 min)

1. Worker `readaloudai` → Settings → Variables →
   `ALLOWED_ORIGIN` = `http://localhost:8977,https://lexoraai.online,https://readaloud-ai.pages.dev`
2. Worker `readaloudai-pay` → same value.
3. Supabase → Authentication → URL Configuration →
   - Site URL: `https://lexoraai.online`
   - Redirect URLs: add `https://lexoraai.online/**` (and the pages.dev one if you want)

## 4. Google login (optional but recommended, 10 min, free)

1. console.cloud.google.com → new project → **APIs & Services → OAuth consent screen**
   → External → fill app name ReadAloud AI + your email → save
2. **Credentials → Create credentials → OAuth client ID** → Web application →
   Authorized redirect URI: `https://lgwqqytjqoenozhjhbkr.supabase.co/auth/v1/callback`
3. Copy Client ID + Secret → Supabase → **Authentication → Sign In / Providers → Google**
   → enable, paste both → Save.
The app's "Continue with Google" button then works instantly.

## 5. Login emails (do once — fixes "rate limit exceeded")

See SETUP-BUSINESS.md §9: Resend.com free SMTP (3,000/month) + raise Supabase
email rate limit + add `Your code: {{ .Token }}` to the Magic Link template
so the 6-digit code login works.

## 6. Razorpay webhook (if not done yet)

See SETUP-BUSINESS.md §7a — webhook URL is your pay worker /webhook.
Later you can also give the workers pretty subdomains (api.lexoraai.online,
pay.lexoraai.online) via Worker → Settings → Domains & Routes → nothing else changes
except CONFIG.API_URL/PAY_URL in index.html.

## 7. Test from your phone

https://lexoraai.online → login (Google or email code) → open a PDF → play →
scan with camera → test payment (card 5267 3181 8797 5449).

Live! 🎉
