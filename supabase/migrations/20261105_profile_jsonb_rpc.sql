-- RPC to update JSONB/array columns in consultant_profiles,
-- bypassing PostgREST schema cache (which silently drops unknown columns on UPDATE).
-- Called from the client whenever certifications, education, or languages change.

create or replace function update_profile_jsonb_fields(
  p_id              uuid,
  p_certifications  jsonb   default null,
  p_education       jsonb   default null,
  p_languages       text[]  default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() != p_id then
    raise exception 'unauthorized';
  end if;

  update consultant_profiles
  set
    certifications = case when p_certifications is not null then p_certifications else certifications end,
    education      = case when p_education      is not null then p_education      else education      end,
    languages      = case when p_languages      is not null then p_languages      else languages      end
  where id = p_id;
end;
$$;

grant execute on function update_profile_jsonb_fields(uuid, jsonb, jsonb, text[]) to authenticated;
