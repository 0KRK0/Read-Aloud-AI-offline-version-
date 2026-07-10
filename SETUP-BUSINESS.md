# ReadAloud AI — Business Layer Setup (wallet, metering, multi-model)

Do these AFTER the basic setup in SETUP.md works.

## 1. Database (5 min)
Supabase dashboard → **SQL Editor → New query** → paste all of `schema.sql` → **Run**.
This creates: profiles (with token wallet), transactions, usage_log, and the
credit/deduct functions. Every new signup automatically gets a profile.

## 2. Get the service key (1 min)
Supabase → **Project Settings → API Keys** → reveal the **secret / service_role** key.
This key bypasses security rules — it must ONLY ever live inside the Cloudflare Worker
as a Secret. Never in the app, never in GitHub.

## 3. Upgrade the worker (5 min)
Cloudflare → your `readaloudai` worker → Edit code → replace everything with
`worker-gateway.js` → Deploy. Then Settings → Variables and Secrets:

| Variable | Value | Type |
|---|---|---|
| SUPABASE_URL | https://lgwqqytjqoenozhjhbkr.supabase.co | Text |
| SUPABASE_ANON_KEY | sb_publishable_... | Text |
| SUPABASE_SERVICE_KEY | the secret key from step 2 | **Secret** |
| OPENAI_API_KEY | sk-... | **Secret** |
| ANTHROPIC_API_KEY | sk-ant-... | **Secret** |
| ALLOWED_ORIGIN | your site origin | Text |
| FREE_PROVIDER | openai (switch to bedrock later) | Text |

The old worker.js / worker-free.js are no longer needed — one gateway does both.

## 4. Amazon Nova free tier (optional, later)
1. aws.amazon.com → create account → console → **Bedrock** → Model access →
   request access to **Amazon Nova Micro** (instant for most regions)
2. IAM → Users → create user `readaloud-bedrock` → attach policy
   **AmazonBedrockRuntimeInferenceAccess** (or a minimal custom invoke policy) →
   Security credentials → create access key
3. Worker variables: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (Secrets),
   `AWS_REGION` (e.g. us-east-1), and set `FREE_PROVIDER` = `bedrock`
Nova Micro ≈ $0.035/M input — free tier cost per question drops ~75%.

## 5. What the app receives now
Every /chat answer includes `tokens_used`, `tokens_left` (paid users), `plan`.
GET /me returns the full wallet — the app's progress bar reads this.

## 6. Paid plans & models (whitelist in worker-gateway.js)
- anthropic: claude-haiku-4-5 (web search ON), claude-sonnet-5 (premium)
- openai: gpt-4o-mini, gpt-4o
Users on 'sub'/'doc' plans with tokens_balance > 0 get their chosen model;
at zero balance they automatically fall back to the free tier. No refunds —
state it in your Terms.

## 7. Payments — BUILT (worker-payments.js)
Deployed as a second worker (e.g. `readaloudai-pay`). Endpoints: /order, /verify,
/switch, /webhook. Test mode works now; live payments need your business KYC
(razorpay.com → PAN + bank account), then just swap RAZORPAY_KEY_ID/SECRET to
the rzp_live_ pair.

### 7a. Webhook (safety net — do this once, 3 min)
The webhook credits the wallet even if the user closes the tab before the app
can call /verify. Razorpay's servers call the worker directly.

1. Make up a strong random string (this is the webhook secret).
2. Cloudflare → `readaloudai-pay` worker → Settings → Variables and Secrets →
   add `RAZORPAY_WEBHOOK_SECRET` = that string (**Secret**) → deploy the
   updated worker-payments.js.
3. Razorpay Dashboard → **Settings → Webhooks → Add New Webhook**:
   - Webhook URL: `https://readaloudai-pay.<your-subdomain>.workers.dev/webhook`
   - Secret: the same string from step 1
   - Active Events: tick **payment.captured** only
   - Save.
4. Test: make a test payment and close the tab immediately at the "processing"
   moment — the wallet should still get credited within a few seconds
   (check Supabase → transactions table). Duplicate credits are impossible:
   the transactions table rejects a repeated razorpay_payment_id.

## Pricing hint (₹, with margin)
Raw cost ≈ ₹0.04/question (Haiku) or ₹0.006 (4o-mini). Suggested retail:
₹99/mo ≈ 1.2M tokens Claude Haiku; ₹49/mo ≈ 2M tokens GPT-4o-mini;
pay-per-doc: (pages × 800 tokens × 3 questions-worth) × 2.5 margin, min ₹19.
