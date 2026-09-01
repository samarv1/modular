-- increment_ai_usage's own comment admits the caller's check-then-act
-- against the cap is a separate step, so concurrent requests can all read
-- the same under-cap count before any of them record usage, letting a
-- burst of parallel calls blow past SHARED_KEY_MONTHLY_CAP. Fold the check
-- into the increment itself: reserve a slot atomically, and roll back if
-- that reservation pushed the count over the cap.
create or replace function try_reserve_ai_usage(
  p_owner_id uuid,
  p_period text,
  p_cap integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  insert into ai_usage (owner_id, period, count, updated_at)
  values (p_owner_id, p_period, 1, now())
  on conflict (owner_id, period)
  do update set count = ai_usage.count + 1, updated_at = now()
  returning count into new_count;

  if new_count > p_cap then
    update ai_usage set count = count - 1, updated_at = now()
    where owner_id = p_owner_id and period = p_period;
    return false;
  end if;

  return true;
end;
$$;

-- Releases a reservation from try_reserve_ai_usage when the AI call it was
-- guarding ends up failing, so a failed call doesn't cost the user quota.
create or replace function release_ai_usage(p_owner_id uuid, p_period text)
returns void
language sql
security definer
set search_path = public
as $$
  update ai_usage set count = greatest(count - 1, 0), updated_at = now()
  where owner_id = p_owner_id and period = p_period;
$$;

revoke execute on function try_reserve_ai_usage(uuid, text, integer) from public, anon, authenticated;
revoke execute on function release_ai_usage(uuid, text) from public, anon, authenticated;
