-- Modular MVP initial schema
-- Mirrors the data model decisions in PLAN.md (fingerprint = macro contract only,
-- preamble union at compile time, per-resume section scoping, resume-wide entry
-- uniqueness, section_chunk exclusivity, last-write-wins autosave).

create extension if not exists "pgcrypto";

-- Private bucket for original archives (src/lib/storage.ts is the only code
-- that should touch it — see PLAN.md's storage decision).
insert into storage.buckets (id, name, public)
values ('resume-archives', 'resume-archives', false)
on conflict (id) do nothing;

-- owner_id is a hardcoded constant for the personal MVP (see PLAN.md).
-- Every table below carries it so RLS policies and the SSO cutover only
-- ever need to change how owner_id is derived, not the schema.

create table template_shell (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null,
  archive_path      text not null,           -- Storage path to original ZIP
  root_file         text not null,           -- root .tex within the archive
  adapter_id        text not null,           -- e.g. 'jakes-resume-v1'
  fingerprint       text not null,           -- macro-contract-only hash
  preamble          text not null,           -- fixed preamble/header/footer, as parsed
  created_at        timestamptz not null default now()
);

create index template_shell_owner_fingerprint_idx
  on template_shell (owner_id, fingerprint);

create table source_resume (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null,
  template_shell_id uuid not null references template_shell (id) on delete restrict,
  archive_path      text not null,
  import_status     text not null
    check (import_status in ('pending', 'importing', 'success', 'structural_mismatch', 'failed')),
  mismatch_report   jsonb,                   -- populated only when import_status = 'structural_mismatch'
  created_at        timestamptz not null default now()
);

create index source_resume_owner_idx on source_resume (owner_id);
create index source_resume_shell_idx on source_resume (template_shell_id);

create table bank_entry (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null,
  source_resume_id  uuid references source_resume (id) on delete set null,
  kind              text not null
    check (kind in ('subheading_entry', 'project_entry', 'section_chunk')),
  source_section    text not null,           -- section label at time of import
  raw_latex         text not null,           -- immutable, never regenerated from an AST
  source_offset_start integer,
  source_offset_end   integer,
  required_packages   text[] not null default '{}',  -- feeds the preamble union at compile
  display_name      text not null,
  tags              text[] not null default '{}',
  created_at        timestamptz not null default now()
);

-- source_resume_id uses ON DELETE SET NULL, not CASCADE: entries are immutable
-- snapshots and survive deletion of their parent as orphans (PLAN.md decision).
-- The application layer must not treat a null source_resume_id as an error —
-- render "source unavailable" instead of blocking use of the entry.

create index bank_entry_owner_idx on bank_entry (owner_id);
create index bank_entry_source_resume_idx on bank_entry (source_resume_id);

create table resume (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null,
  title                 text not null,
  template_shell_id     uuid not null references template_shell (id) on delete restrict,
  source_resume_id      uuid references source_resume (id) on delete set null, -- set only for the build auto-created on import
  compile_status        text not null default 'unbuilt'
    check (compile_status in ('unbuilt', 'compiling', 'success', 'failed', 'blocked_multipage')),
  last_compile_request_id uuid,              -- monotonic token; compile completions
                                              -- must no-op if this has moved on since dispatch
  pdf_artifact_path     text,
  latex_export_path     text,
  page_count            integer,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index resume_owner_idx on resume (owner_id);

create table resume_section (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null,
  resume_id     uuid not null references resume (id) on delete cascade,
  title         text not null,               -- exact section title, preserved verbatim
  position      integer not null,
  created_at    timestamptz not null default now(),
  unique (resume_id, title)                  -- enforces title-match merge, not duplicate sections
);

create index resume_section_resume_idx on resume_section (resume_id);

create table resume_section_entry (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null,
  resume_id         uuid not null references resume (id) on delete cascade,       -- denormalized for the resume-wide unique constraint below
  resume_section_id uuid not null references resume_section (id) on delete cascade,
  bank_entry_id     uuid not null references bank_entry (id) on delete restrict,  -- entries in use can't be hard-deleted
  position          integer not null,
  created_at        timestamptz not null default now(),
  unique (resume_id, bank_entry_id)          -- "no duplicate entry in one resume", spans all sections
);

create index resume_section_entry_section_idx on resume_section_entry (resume_section_id);

-- section_chunk exclusivity: a resume_section holding a section_chunk-kind bank_entry
-- must not hold any other resume_section_entry row. Enforced at the application layer
-- (checked before insert) rather than in SQL, since it requires a join to bank_entry.kind
-- that a simple CHECK constraint can't express; add a trigger later if this proves leaky.

-- Row Level Security: intentionally not enabled yet. The server talks to
-- Supabase with the service-role key (bypasses RLS by design), and there's
-- no user JWT to key policies off of pre-SSO. owner_id isolation is enforced
-- in the application layer instead (src/lib/db.ts wraps every query with
-- .eq('owner_id', ownerId)) via the single owner helper (src/lib/owner.ts).
-- Revisit RLS (auth.uid()-based policies) when Google SSO ships and requests
-- start carrying real user JWTs.
