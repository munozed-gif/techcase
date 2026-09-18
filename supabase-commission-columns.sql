-- Commission tracking columns on applications
-- Lets headhunters mark commission as paid/pending directly on the
-- application row so the status persists across devices and sessions.

alter table public.applications
  add column if not exists headhunter_commission_paid      boolean     not null default false,
  add column if not exists headhunter_commission_paid_at   timestamptz,
  add column if not exists headhunter_commission_amount    numeric(10,2);
