-- Per-user hourly rate limit on POST /api/byok/validate, so a signed-in
-- user can't use the endpoint as an unthrottled oracle to test arbitrary
-- keys against Google/OpenAI/Anthropic.

create table byok_validate_usage (
  owner_id uuid not null references auth.users(id) on delete cascade,
  hour_bucket text not null, -- UTC 'YYYY-MM-DDTHH', computed by the app
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (owner_id, hour_bucket)
);

alter table byok_validate_usage enable row level security;
create policy "byok_validate_usage_owner_select" on byok_validate_usage
  for select using (owner_id = auth.uid());

-- Atomic increment, same shape as increment_ai_usage (0009_ai_usage.sql):
-- prevents a lost increment under concurrent requests, not cap overrun by
-- one (the caller's check-then-act against this count is a separate step).
create or replace function increment_byok_validate_usage(p_owner_id uuid, p_hour_bucket text)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into byok_validate_usage (owner_id, hour_bucket, count, updated_at)
  values (p_owner_id, p_hour_bucket, 1, now())
  on conflict (owner_id, hour_bucket)
  do update set count = byok_validate_usage.count + 1, updated_at = now()
  returning count;
$$;
