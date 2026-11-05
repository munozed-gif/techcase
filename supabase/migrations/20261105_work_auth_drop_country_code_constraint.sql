-- Drop the unique constraint on (consultant_id, country_code) since country_code
-- is no longer used in the UI. Add a unique constraint on (consultant_id, country_name)
-- instead to prevent exact duplicate country entries.

alter table work_authorizations
  drop constraint if exists work_authorizations_consultant_id_country_code_key;

-- Prevent duplicate country names per consultant
drop index if exists work_authorizations_consultant_id_country_name_key;
create unique index if not exists work_authorizations_consultant_id_country_name_key
  on work_authorizations (consultant_id, lower(country_name));

notify pgrst, 'reload schema';
