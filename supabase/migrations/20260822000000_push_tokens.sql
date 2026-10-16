-- Push tokens: one row per (user, device). A user can have multiple tokens
-- (phone + tablet); a token is unique so re-registering the same device just
-- updates ownership/timestamp instead of duplicating.
create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  platform text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_user_id_idx on public.push_tokens(user_id);

alter table public.push_tokens enable row level security;

drop policy if exists "Users can manage their own push tokens" on public.push_tokens;
create policy "Users can manage their own push tokens"
  on public.push_tokens
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- The send-push Edge Function reads tokens across users with the service
-- role key (which bypasses RLS), so no separate read policy is needed there.
