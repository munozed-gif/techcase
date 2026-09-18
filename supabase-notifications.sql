-- Notifications table
-- Stores in-app notifications for all users.
-- The notify(), notifyManagers(), notifyCaseParticipants() helpers in src/lib/utils.js
-- insert rows here; the NotificationBell and NotificationsView read them.

create table if not exists public.notifications (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references public.users(id) on delete cascade,
  title       text        not null,
  body        text,
  is_read     boolean     not null default false,
  event_type  text,
  case_id     uuid        references public.cases(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_unread
  on public.notifications(user_id, is_read);

create index if not exists notifications_user_created
  on public.notifications(user_id, created_at desc);

alter table public.notifications enable row level security;

-- Each user can only see and manage their own notifications
create policy "users_own_notifications"
  on public.notifications
  for all
  using (user_id = auth.uid());

-- Allow the service role (used by server-side helpers) full access
create policy "service_role_full_access"
  on public.notifications
  for all
  to service_role
  using (true)
  with check (true);
