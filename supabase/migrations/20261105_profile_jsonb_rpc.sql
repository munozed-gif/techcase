-- RPC to update JSONB/array columns in consultant_profiles,
-- bypassing PostgREST schema cache (which silently drops unknown columns on UPDATE).
-- Called from the client whenever certifications, education, or languages change.
--
-- p_languages is jsonb (not text[]) to avoid type-mismatch errors when the
-- languages column itself is jsonb in some environments. The function detects
-- the actual column type at runtime and casts accordingly.

drop function if exists update_profile_jsonb_fields(uuid, jsonb, jsonb, text[]);

create or replace function update_profile_jsonb_fields(
  p_id              uuid,
  p_certifications  jsonb   default null,
  p_education       jsonb   default null,
  p_languages       jsonb   default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lang_type text;
begin
  if auth.uid() != p_id then
    raise exception 'unauthorized';
  end if;

  if p_certifications is not null then
    update consultant_profiles set certifications = p_certifications where id = p_id;
  end if;
  if p_education is not null then
    update consultant_profiles set education = p_education where id = p_id;
  end if;
  if p_languages is not null then
    -- Detect actual column type to handle both text[] and jsonb environments
    select udt_name into v_lang_type
    from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'consultant_profiles'
      and column_name  = 'languages'
    limit 1;
    if v_lang_type = '_text' then
      update consultant_profiles
      set languages = array(select jsonb_array_elements_text(p_languages))
      where id = p_id;
    else
      update consultant_profiles set languages = p_languages where id = p_id;
    end if;
  end if;
end;
$$;

grant execute on function update_profile_jsonb_fields(uuid, jsonb, jsonb, jsonb) to authenticated;
