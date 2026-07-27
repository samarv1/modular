-- Phase 6: home page desktop — flat folders holding resumes, freely
-- draggable, positions persisted per-container (see PLAN.md's position
-- storage decision: position_x/position_y always mean "position within
-- whichever canvas currently renders this row" — the desktop if
-- resume.folder_id is null, the folder's own canvas otherwise).

create table resume_folder (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null,
  name          text not null,
  position_x    integer not null default 0,
  position_y    integer not null default 0,
  created_at    timestamptz not null default now()
);

create index resume_folder_owner_idx on resume_folder (owner_id);

-- folder_id uses ON DELETE SET NULL, not CASCADE: deleting a folder orphans
-- its resumes back onto the desktop rather than deleting them, same
-- non-destructive pattern as bank_entry.source_resume_id (0001_init.sql).
alter table resume
  add column folder_id   uuid references resume_folder (id) on delete set null,
  add column position_x  integer not null default 0,
  add column position_y  integer not null default 0;

create index resume_folder_id_idx on resume (folder_id);

-- Row Level Security: intentionally not enabled, same as every other table
-- (see 0001_init.sql) — owner_id isolation is enforced by ownerScopedTable()
-- in the application layer, not by Postgres policies.
