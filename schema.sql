-- ============================================================
-- ReadAloud AI — database schema (run in Supabase: SQL Editor > New query > paste > Run)
-- Safe to run more than once.
-- ============================================================

-- 1) User profiles + token wallet
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  plan text not null default 'free',        -- free | sub | doc
  provider text not null default 'free',    -- free | anthropic | openai
  model text,                               -- chosen model for paid users
  tokens_balance bigint not null default 0, -- paid tokens remaining
  tokens_used bigint not null default 0,    -- lifetime used (paid)
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.profiles enable row level security;

drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles
  for select using (auth.uid() = id);
-- Users cannot insert/update/delete directly; only the backend (service role) can.

-- Auto-create a profile whenever someone signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Backfill profiles for users who signed up before this schema existed
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- 2) Payments / credits history
create table if not exists public.transactions (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  kind text not null,                 -- sub | doc | admin_credit
  amount_inr numeric,
  tokens_credited bigint,
  provider text,
  razorpay_payment_id text unique,    -- prevents double-crediting the same payment
  created_at timestamptz default now()
);
alter table public.transactions enable row level security;
drop policy if exists "own tx read" on public.transactions;
create policy "own tx read" on public.transactions
  for select using (auth.uid() = user_id);

-- 3) Usage log (every AI request)
create table if not exists public.usage_log (
  id bigint generated always as identity primary key,
  user_id uuid,
  provider text,
  model text,
  tokens_in int,
  tokens_out int,
  created_at timestamptz default now()
);
alter table public.usage_log enable row level security;
drop policy if exists "own usage read" on public.usage_log;
create policy "own usage read" on public.usage_log
  for select using (auth.uid() = user_id);

-- 4) Atomic wallet deduction (no race conditions)
create or replace function public.deduct_tokens(uid uuid, amount bigint)
returns bigint language plpgsql security definer set search_path = public as $$
declare newbal bigint;
begin
  update public.profiles
     set tokens_balance = greatest(tokens_balance - amount, 0),
         tokens_used = tokens_used + amount,
         updated_at = now()
   where id = uid
   returning tokens_balance into newbal;
  return coalesce(newbal, 0);
end; $$;

-- 5) Atomic wallet credit (used by the payment webhook)
create or replace function public.credit_tokens(uid uuid, amount bigint, new_plan text, new_provider text, new_model text)
returns bigint language plpgsql security definer set search_path = public as $$
declare newbal bigint;
begin
  update public.profiles
     set tokens_balance = tokens_balance + amount,
         plan = coalesce(new_plan, plan),
         provider = coalesce(new_provider, provider),
         model = coalesce(new_model, model),
         updated_at = now()
   where id = uid
   returning tokens_balance into newbal;
  return coalesce(newbal, 0);
end; $$;
