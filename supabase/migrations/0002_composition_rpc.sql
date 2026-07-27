-- Phase 5: atomic composition write.
-- The API layer builds the full ordered section/entry tree for a resume and
-- hands it to this function in one call, so a mid-write failure can't leave
-- a resume's composition half-deleted (see PLAN.md's composition decision).
--
-- p_sections shape: [{ "title": text, "entries": [bank_entry_id, ...] }, ...]
-- Both section order and entry order within a section come from array order.

create or replace function set_resume_composition(
  p_resume_id uuid,
  p_owner_id uuid,
  p_sections jsonb
) returns void
language plpgsql
as $$
declare
  v_section       jsonb;
  v_section_id    uuid;
  v_section_pos   integer := 0;
  v_entry_id_text text;
  v_entry_pos     integer;
  v_entry_count   integer;
  v_kind          text;
begin
  perform 1 from resume where id = p_resume_id and owner_id = p_owner_id;
  if not found then
    raise exception 'resume % not found for owner', p_resume_id using errcode = 'P0002';
  end if;

  -- resume_section_entry rows cascade-delete with their resume_section.
  delete from resume_section where resume_id = p_resume_id;

  for v_section in select * from jsonb_array_elements(coalesce(p_sections, '[]'::jsonb))
  loop
    -- Empty sections aren't written — pruned on write rather than left
    -- lingering (PLAN.md decision for this phase).
    v_entry_count := jsonb_array_length(v_section -> 'entries');
    if v_entry_count = 0 then
      continue;
    end if;

    v_section_pos := v_section_pos + 1;
    insert into resume_section (owner_id, resume_id, title, position)
    values (p_owner_id, p_resume_id, v_section ->> 'title', v_section_pos)
    returning id into v_section_id;

    v_entry_pos := 0;
    for v_entry_id_text in select value from jsonb_array_elements_text(v_section -> 'entries')
    loop
      v_entry_pos := v_entry_pos + 1;

      select kind into v_kind
      from bank_entry
      where id = v_entry_id_text::uuid and owner_id = p_owner_id;

      if not found then
        raise exception 'bank entry % not found for owner', v_entry_id_text using errcode = 'P0002';
      end if;

      -- section_chunk exclusivity (0001_init.sql lines 114-117): a section
      -- holding one must hold nothing else, checked both directions by this
      -- single test — if the section has more than one entry, no member of
      -- it may be a section_chunk.
      if v_kind = 'section_chunk' and v_entry_count > 1 then
        raise exception 'section_chunk entry % must occupy its section exclusively', v_entry_id_text
          using errcode = 'P0001';
      end if;

      -- Resume-wide duplicate-entry prevention: unique(resume_id, bank_entry_id)
      -- on resume_section_entry raises 23505 here if this entry is already
      -- placed elsewhere in the same resume; the caller maps that to a 409.
      insert into resume_section_entry
        (owner_id, resume_id, resume_section_id, bank_entry_id, position)
      values
        (p_owner_id, p_resume_id, v_section_id, v_entry_id_text::uuid, v_entry_pos);
    end loop;
  end loop;

  -- Nothing else bumps updated_at (0001_init.sql has no trigger for it).
  update resume set updated_at = now() where id = p_resume_id;
end;
$$;
