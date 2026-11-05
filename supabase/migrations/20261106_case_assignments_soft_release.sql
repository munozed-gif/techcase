alter table case_assignments
  add column if not exists is_active   boolean                  not null default true,
  add column if not exists released_at timestamptz;

notify pgrst, 'reload schema';
