-- Per-user notification delivery preferences
-- Structure: { [type]: { in_app: bool, email: bool } }
-- Missing key or missing channel = both enabled (opt-out model)

alter table users
  add column if not exists notification_prefs jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
