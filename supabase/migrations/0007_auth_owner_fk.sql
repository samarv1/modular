-- Google SSO ships: owner_id now holds real Supabase Auth user ids
-- (auth.users.id), not a single hardcoded MODULAR_OWNER_ID constant.
-- This adds the FK that was deferred since 0001_init.sql.
--
-- IMPORTANT: this migration must only be run after scripts/reassign-owner.mjs
-- has reassigned every existing row's owner_id from MODULAR_OWNER_ID to a
-- real auth.users id — otherwise the FK add fails, since MODULAR_OWNER_ID
-- was never a real Supabase Auth user.
--
-- ON DELETE CASCADE: deleting a Supabase Auth account wipes that user's
-- resumes/entries/uploads automatically (personal-workspace-per-user model,
-- no manual cleanup step to remember).

alter table template_shell
  add constraint template_shell_owner_id_fkey
  foreign key (owner_id) references auth.users (id) on delete cascade;

alter table source_resume
  add constraint source_resume_owner_id_fkey
  foreign key (owner_id) references auth.users (id) on delete cascade;

alter table bank_entry
  add constraint bank_entry_owner_id_fkey
  foreign key (owner_id) references auth.users (id) on delete cascade;

alter table resume
  add constraint resume_owner_id_fkey
  foreign key (owner_id) references auth.users (id) on delete cascade;

alter table resume_section
  add constraint resume_section_owner_id_fkey
  foreign key (owner_id) references auth.users (id) on delete cascade;

alter table resume_section_entry
  add constraint resume_section_entry_owner_id_fkey
  foreign key (owner_id) references auth.users (id) on delete cascade;

alter table resume_folder
  add constraint resume_folder_owner_id_fkey
  foreign key (owner_id) references auth.users (id) on delete cascade;
