-- Make country_code nullable and set a default empty string.
-- The UI no longer collects country_code so inserts won't include it.

alter table work_authorizations
  alter column country_code drop not null,
  alter column country_code set default '';

-- Also drop the old unique constraint and RLS policies in one shot
-- (safe to re-run if already applied)
alter table work_authorizations
  drop constraint if exists work_authorizations_consultant_id_country_code_key;

alter table work_authorizations enable row level security;

drop policy if exists "auth users can manage work_authorizations" on work_authorizations;
create policy "auth users can manage work_authorizations"
  on work_authorizations for all to authenticated
  using (auth.uid() = consultant_id)
  with check (auth.uid() = consultant_id);

notify pgrst, 'reload schema';
