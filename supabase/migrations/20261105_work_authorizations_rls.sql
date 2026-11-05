-- Fix RLS on work_authorizations, consultant_customers, and consultant_projects
-- These tables were created without RLS policies, causing insert failures.

alter table work_authorizations enable row level security;

drop policy if exists "auth users can manage work_authorizations" on work_authorizations;
create policy "auth users can manage work_authorizations"
  on work_authorizations for all to authenticated
  using (auth.uid() = consultant_id)
  with check (auth.uid() = consultant_id);

-- Apply the same fix to related profile tables in case they have the same issue
alter table consultant_customers enable row level security;

drop policy if exists "auth users can manage consultant_customers" on consultant_customers;
create policy "auth users can manage consultant_customers"
  on consultant_customers for all to authenticated
  using (auth.uid() = consultant_id)
  with check (auth.uid() = consultant_id);

alter table consultant_projects enable row level security;

drop policy if exists "auth users can manage consultant_projects" on consultant_projects;
create policy "auth users can manage consultant_projects"
  on consultant_projects for all to authenticated
  using (auth.uid() = consultant_id)
  with check (auth.uid() = consultant_id);

notify pgrst, 'reload schema';
