-- source_resume had no user-editable display name (PLAN.md known gap) — the
-- bank pane fell back to a short id fragment to distinguish entries from
-- different uploads. Default to the uploaded file's original name at import
-- time (src/app/api/imports/route.ts already derives this for resume.title);
-- nullable so existing rows imported before this migration just keep
-- falling back to the id fragment in the UI rather than showing "null".
alter table source_resume add column display_name text;
