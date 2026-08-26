-- Server-side encrypted storage for a user's own Gemini BYOK key, using
-- Supabase Vault (built on pgsodium, bundled with the platform at no extra
-- cost). Vault encrypts the secret at rest with a key Supabase manages
-- outside the database, so direct table access (even via the service-role
-- key) can't read the plaintext: only vault.decrypted_secrets can, and
-- only through the get_byok_key() function below.
create extension if not exists supabase_vault;

create table byok_keys (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  secret_id uuid not null,
  updated_at timestamptz not null default now()
);

alter table byok_keys enable row level security;
create policy "byok_keys_owner_select" on byok_keys for select using (owner_id = auth.uid());
-- No client-side write policies: all writes go through the RPCs below,
-- called with the service-role client.

create or replace function upsert_byok_key(p_owner_id uuid, p_api_key text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
begin
  select secret_id into v_secret_id from byok_keys where owner_id = p_owner_id;

  if v_secret_id is not null then
    perform vault.update_secret(v_secret_id, p_api_key);
    update byok_keys set updated_at = now() where owner_id = p_owner_id;
  else
    v_secret_id := vault.create_secret(p_api_key, 'byok:' || p_owner_id::text);
    insert into byok_keys (owner_id, secret_id) values (p_owner_id, v_secret_id);
  end if;
end;
$$;

create or replace function get_byok_key(p_owner_id uuid)
returns text
language sql
security definer
set search_path = public, vault
as $$
  select ds.decrypted_secret
  from vault.decrypted_secrets ds
  join byok_keys bk on bk.secret_id = ds.id
  where bk.owner_id = p_owner_id;
$$;

create or replace function delete_byok_key(p_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
begin
  select secret_id into v_secret_id from byok_keys where owner_id = p_owner_id;
  if v_secret_id is not null then
    delete from vault.secrets where id = v_secret_id;
    delete from byok_keys where owner_id = p_owner_id;
  end if;
end;
$$;
