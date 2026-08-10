-- The name/contact block before the first \section{} was never captured by
-- the extractor and had nowhere to live in bank_entry.kind. header_chunk
-- entries behave like section_chunk (exclusive, rendered as-is) except
-- assemble() skips the \section{title} wrapper for them.
alter table bank_entry drop constraint bank_entry_kind_check;
alter table bank_entry add constraint bank_entry_kind_check
  check (kind in ('subheading_entry', 'project_entry', 'section_chunk', 'header_chunk'));
