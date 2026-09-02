-- Every account gets one sample resume (the Jake's Resume fixture) seeded at
-- first login, so a new user has something to open, edit, compile and export
-- before importing anything of their own.
--
-- The seed is gated on a row here, not on "this owner has no resumes": deleting
-- the sample has to stay deleted, and a count-based guard would resurrect it on
-- the next login. Rows are inserted once and never removed.

create table sample_resume_seed (
  owner_id   uuid primary key references auth.users (id) on delete cascade,
  seeded_at  timestamptz not null default now()
);

-- RLS as a backstop only, same as 0008_rls.sql: the seed runs through the
-- service-role client, which bypasses these.
alter table sample_resume_seed enable row level security;

create policy "sample_resume_seed_owner_select" on sample_resume_seed for select using (owner_id = auth.uid());
create policy "sample_resume_seed_owner_insert" on sample_resume_seed for insert with check (owner_id = auth.uid());
create policy "sample_resume_seed_owner_update" on sample_resume_seed for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "sample_resume_seed_owner_delete" on sample_resume_seed for delete using (owner_id = auth.uid());
