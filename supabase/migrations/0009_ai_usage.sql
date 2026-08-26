-- Per-user monthly usage counter for the shared Gemini API key. Only ever
-- tracks calls made against the shared key, never BYOK calls (user's own
-- Gemini key).

create table ai_usage (
  owner_id uuid not null references auth.users(id) on delete cascade,
  period text not null, -- UTC 'YYYY-MM', computed by the app
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (owner_id, period)
);

alter table ai_usage enable row level security;
create policy "ai_usage_owner_select" on ai_usage for select using (owner_id = auth.uid());

-- Atomic increment, so two near-simultaneous imports from the same user
-- can't both read the same starting count and overwrite each other's
-- write. Doesn't prevent cap overrun by one (the caller's check-then-act
-- against this count is a separate step), only a lost increment.
create or replace function increment_ai_usage(p_owner_id uuid, p_period text)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into ai_usage (owner_id, period, count, updated_at)
  values (p_owner_id, p_period, 1, now())
  on conflict (owner_id, period)
  do update set count = ai_usage.count + 1, updated_at = now()
  returning count;
$$;
