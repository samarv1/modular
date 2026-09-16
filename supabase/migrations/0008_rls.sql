-- Service-role queries bypass RLS, so ownerScopedTable remains the primary
-- boundary. These policies protect future session and browser clients.

alter table template_shell enable row level security;
alter table source_resume enable row level security;
alter table bank_entry enable row level security;
alter table resume enable row level security;
alter table resume_section enable row level security;
alter table resume_section_entry enable row level security;
alter table resume_folder enable row level security;

create policy "template_shell_owner_select" on template_shell for select using (owner_id = auth.uid());
create policy "template_shell_owner_insert" on template_shell for insert with check (owner_id = auth.uid());
create policy "template_shell_owner_update" on template_shell for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "template_shell_owner_delete" on template_shell for delete using (owner_id = auth.uid());

create policy "source_resume_owner_select" on source_resume for select using (owner_id = auth.uid());
create policy "source_resume_owner_insert" on source_resume for insert with check (owner_id = auth.uid());
create policy "source_resume_owner_update" on source_resume for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "source_resume_owner_delete" on source_resume for delete using (owner_id = auth.uid());

create policy "bank_entry_owner_select" on bank_entry for select using (owner_id = auth.uid());
create policy "bank_entry_owner_insert" on bank_entry for insert with check (owner_id = auth.uid());
create policy "bank_entry_owner_update" on bank_entry for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "bank_entry_owner_delete" on bank_entry for delete using (owner_id = auth.uid());

create policy "resume_owner_select" on resume for select using (owner_id = auth.uid());
create policy "resume_owner_insert" on resume for insert with check (owner_id = auth.uid());
create policy "resume_owner_update" on resume for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "resume_owner_delete" on resume for delete using (owner_id = auth.uid());

create policy "resume_section_owner_select" on resume_section for select using (owner_id = auth.uid());
create policy "resume_section_owner_insert" on resume_section for insert with check (owner_id = auth.uid());
create policy "resume_section_owner_update" on resume_section for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "resume_section_owner_delete" on resume_section for delete using (owner_id = auth.uid());

create policy "resume_section_entry_owner_select" on resume_section_entry for select using (owner_id = auth.uid());
create policy "resume_section_entry_owner_insert" on resume_section_entry for insert with check (owner_id = auth.uid());
create policy "resume_section_entry_owner_update" on resume_section_entry for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "resume_section_entry_owner_delete" on resume_section_entry for delete using (owner_id = auth.uid());

create policy "resume_folder_owner_select" on resume_folder for select using (owner_id = auth.uid());
create policy "resume_folder_owner_insert" on resume_folder for insert with check (owner_id = auth.uid());
create policy "resume_folder_owner_update" on resume_folder for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "resume_folder_owner_delete" on resume_folder for delete using (owner_id = auth.uid());
