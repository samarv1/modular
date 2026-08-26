-- Postgres grants EXECUTE on new functions to PUBLIC by default, which
-- PostgREST exposes to any caller holding the anon key. These RPCs take an
-- arbitrary p_owner_id with no auth.uid() check, since they're only ever
-- meant to be called server-side via the service-role client. Without this
-- revoke, anyone with the project's anon key could call get_byok_key with
-- another user's owner_id and read their plaintext Gemini key over the
-- public REST API.
revoke execute on function get_byok_key(uuid) from public, anon, authenticated;
revoke execute on function upsert_byok_key(uuid, text) from public, anon, authenticated;
revoke execute on function delete_byok_key(uuid) from public, anon, authenticated;
revoke execute on function increment_ai_usage(uuid, text) from public, anon, authenticated;
revoke execute on function increment_byok_validate_usage(uuid, text) from public, anon, authenticated;
