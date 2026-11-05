-- RPC to update JSONB/array columns in consultant_profiles,
-- bypassing PostgREST schema cache (which silently drops unknown columns on UPDATE).
--
-- Pre-req for environments where certifications/education were created as text[]:
--   alter table consultant_profiles
--     alter column certifications type jsonb using '[]'::jsonb,
--     alter column certifications set default '[]'::jsonb;
--   alter table consultant_profiles
--     alter column education type jsonb using '[]'::jsonb,
--     alter column education set default '[]'::jsonb;
--
-- languages may be text[] or jsonb depending on env; the function detects at runtime.

drop function if exists update_profile_jsonb_fields(uuid, jsonb, jsonb, text[]);
drop function if exists update_profile_jsonb_fields(uuid, jsonb, jsonb, jsonb);

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
    -- languages is text[] on some envs and jsonb on others; detect and cast
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
