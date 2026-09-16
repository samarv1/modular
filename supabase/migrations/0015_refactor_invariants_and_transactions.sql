create or replace function try_reserve_byok_validate_usage(
  p_owner_id uuid,
  p_hour_bucket text,
  p_cap integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  insert into byok_validate_usage (owner_id, hour_bucket, count, updated_at)
  values (p_owner_id, p_hour_bucket, 1, now())
  on conflict (owner_id, hour_bucket)
  do update set count = byok_validate_usage.count + 1, updated_at = now()
  returning count into new_count;

  if new_count > p_cap then
    update byok_validate_usage set count = count - 1, updated_at = now()
    where owner_id = p_owner_id and hour_bucket = p_hour_bucket;
    return false;
  end if;

  return true;
end;
$$;

revoke execute on function try_reserve_byok_validate_usage(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function try_reserve_byok_validate_usage(uuid, text, integer)
  to service_role;

grant execute on function get_byok_key(uuid) to service_role;
grant execute on function upsert_byok_key(uuid, text) to service_role;
grant execute on function delete_byok_key(uuid) to service_role;
grant execute on function try_reserve_ai_usage(uuid, text, integer)
  to service_role;
grant execute on function release_ai_usage(uuid, text) to service_role;

create or replace function delete_source_resume(
  p_owner_id uuid,
  p_source_resume_id uuid
)
returns table (archive_path text, shell_archive_path text)
language plpgsql
security definer
set search_path = public
as $$
declare
  source_archive_path text;
  referenced_shell_archive_path text;
begin
  select sr.archive_path, ts.archive_path
  into source_archive_path, referenced_shell_archive_path
  from source_resume sr
  join template_shell ts on ts.id = sr.template_shell_id
  where sr.id = p_source_resume_id and sr.owner_id = p_owner_id;

  if not found then
    return;
  end if;

  delete from resume_section_entry
  where owner_id = p_owner_id
    and bank_entry_id in (
      select id from bank_entry
      where source_resume_id = p_source_resume_id and owner_id = p_owner_id
    );
  delete from bank_entry
  where source_resume_id = p_source_resume_id and owner_id = p_owner_id;
  delete from source_resume
  where id = p_source_resume_id and owner_id = p_owner_id;

  archive_path := source_archive_path;
  shell_archive_path := referenced_shell_archive_path;
  return next;
end;
$$;

revoke execute on function delete_source_resume(uuid, uuid)
  from public, anon, authenticated;
grant execute on function delete_source_resume(uuid, uuid)
  to service_role;

create or replace function duplicate_resume(
  p_owner_id uuid,
  p_source_resume_id uuid,
  p_title text,
  p_folder_id uuid,
  p_position_x integer,
  p_position_y integer
)
returns resume
language plpgsql
security definer
set search_path = public
as $$
declare
  source_row resume;
  new_resume resume;
  source_section resume_section;
  new_section_id uuid;
begin
  select * into source_row from resume
  where id = p_source_resume_id and owner_id = p_owner_id;
  if not found then
    raise exception 'resume to duplicate not found' using errcode = 'P0002';
  end if;

  if p_folder_id is not null and not exists (
    select 1 from resume_folder
    where id = p_folder_id and owner_id = p_owner_id
  ) then
    raise exception 'folder not found' using errcode = 'P0001';
  end if;

  insert into resume (
    owner_id, title, template_shell_id, folder_id, position_x, position_y
  ) values (
    p_owner_id, p_title, source_row.template_shell_id,
    p_folder_id, p_position_x, p_position_y
  ) returning * into new_resume;

  for source_section in
    select * from resume_section
    where resume_id = p_source_resume_id and owner_id = p_owner_id
    order by position
  loop
    insert into resume_section (owner_id, resume_id, title, position)
    values (
      p_owner_id, new_resume.id, source_section.title, source_section.position
    ) returning id into new_section_id;

    insert into resume_section_entry (
      owner_id, resume_id, resume_section_id, bank_entry_id, position
    )
    select p_owner_id, new_resume.id, new_section_id, bank_entry_id, position
    from resume_section_entry
    where resume_section_id = source_section.id and owner_id = p_owner_id
    order by position;
  end loop;

  return new_resume;
end;
$$;

revoke execute on function duplicate_resume(uuid, uuid, text, uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function duplicate_resume(uuid, uuid, text, uuid, integer, integer)
  to service_role;

create or replace function update_source_resume_entries(
  p_owner_id uuid,
  p_source_resume_id uuid,
  p_updates jsonb,
  p_delete_ids uuid[]
)
returns setof bank_entry
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  entry_id uuid;
begin
  if not exists (
    select 1 from source_resume
    where id = p_source_resume_id and owner_id = p_owner_id
  ) then
    raise exception 'source resume not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from resume_section_entry rse
    where rse.owner_id = p_owner_id
      and rse.bank_entry_id = any(coalesce(p_delete_ids, '{}'::uuid[]))
  ) then
    raise exception 'entry is used in a resume' using errcode = '23503';
  end if;

  delete from bank_entry
  where owner_id = p_owner_id
    and source_resume_id = p_source_resume_id
    and id = any(coalesce(p_delete_ids, '{}'::uuid[]));

  for item in select * from jsonb_array_elements(coalesce(p_updates, '[]'::jsonb))
  loop
    entry_id := (item ->> 'id')::uuid;
    update bank_entry set
      display_name = coalesce(item ->> 'display_name', display_name),
      tags = case
        when item ? 'tags'
          then array(select jsonb_array_elements_text(item -> 'tags'))
        else tags
      end,
      raw_latex = coalesce(item ->> 'raw_latex', raw_latex),
      source_offset_start = case
        when item ? 'raw_latex' then null else source_offset_start
      end,
      source_offset_end = case
        when item ? 'raw_latex' then null else source_offset_end
      end
    where id = entry_id
      and owner_id = p_owner_id
      and source_resume_id = p_source_resume_id;
    if not found then
      raise exception 'entry % not found for source resume', entry_id
        using errcode = 'P0002';
    end if;
  end loop;

  return query
  select * from bank_entry
  where owner_id = p_owner_id and source_resume_id = p_source_resume_id
  order by created_at;
end;
$$;

revoke execute on function update_source_resume_entries(uuid, uuid, jsonb, uuid[])
  from public, anon, authenticated;
grant execute on function update_source_resume_entries(uuid, uuid, jsonb, uuid[])
  to service_role;

create unique index template_shell_owner_adapter_fingerprint_uidx
  on template_shell (owner_id, adapter_id, fingerprint);

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
  v_section_title text;
  v_entry_id_text text;
  v_entry_pos     integer;
  v_entry_count   integer;
  v_kind          text;
  v_source_section text;
begin
  perform 1 from resume where id = p_resume_id and owner_id = p_owner_id;
  if not found then
    raise exception 'resume % not found for owner', p_resume_id using errcode = 'P0002';
  end if;

  delete from resume_section where resume_id = p_resume_id;

  for v_section in select * from jsonb_array_elements(coalesce(p_sections, '[]'::jsonb))
  loop
    v_entry_count := jsonb_array_length(v_section -> 'entries');
    if v_entry_count = 0 then
      continue;
    end if;

    v_section_title := v_section ->> 'title';
    v_section_pos := v_section_pos + 1;
    insert into resume_section (owner_id, resume_id, title, position)
    values (p_owner_id, p_resume_id, v_section_title, v_section_pos)
    returning id into v_section_id;

    v_entry_pos := 0;
    for v_entry_id_text in select value from jsonb_array_elements_text(v_section -> 'entries')
    loop
      v_entry_pos := v_entry_pos + 1;

      select kind, source_section into v_kind, v_source_section
      from bank_entry
      where id = v_entry_id_text::uuid and owner_id = p_owner_id;

      if not found then
        raise exception 'bank entry % not found for owner', v_entry_id_text using errcode = 'P0002';
      end if;
      if lower(btrim(v_source_section)) <> lower(btrim(v_section_title)) then
        raise exception 'entry % must remain in its source section', v_entry_id_text
          using errcode = 'P0001';
      end if;
      if v_kind in ('section_chunk', 'header_chunk') and v_entry_count > 1 then
        raise exception '% entry % must occupy its section exclusively', v_kind, v_entry_id_text
          using errcode = 'P0001';
      end if;

      insert into resume_section_entry
        (owner_id, resume_id, resume_section_id, bank_entry_id, position)
      values
        (p_owner_id, p_resume_id, v_section_id, v_entry_id_text::uuid, v_entry_pos);
    end loop;
  end loop;

  update resume set updated_at = now() where id = p_resume_id;
end;
$$;

revoke execute on function set_resume_composition(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function set_resume_composition(uuid, uuid, jsonb)
  to service_role;
