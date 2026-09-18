-- Case ratings table
-- All app code (useCaseHooks.js, Dashboard.jsx) queries this as `case_ratings`.
-- The earlier supabase-ratings-rls.sql file created a table named `ratings` —
-- this migration creates the correct table name.

create table if not exists public.case_ratings (
  id          uuid        primary key default gen_random_uuid(),
  case_id     uuid        not null references public.cases(id) on delete cascade,
  rater_id    uuid        not null references auth.users(id) on delete cascade,
  ratee_id    uuid        references auth.users(id) on delete set null,
  rater_role  text,
  ratee_role  text,
  scores      jsonb       not null default '{}',
  comment     text,
  created_at  timestamptz not null default now(),
  unique (case_id, rater_id)
);

create index if not exists case_ratings_case_id    on public.case_ratings(case_id);
create index if not exists case_ratings_ratee_id   on public.case_ratings(ratee_id);

alter table public.case_ratings enable row level security;

-- Anyone authenticated can read ratings (for profiles/leaderboards)
create policy "read_case_ratings"
  on public.case_ratings for select
  using (auth.uid() is not null);

-- Users can only insert their own rating rows
create policy "insert_own_rating"
  on public.case_ratings for insert
  with check (rater_id = auth.uid());

-- Users can update their own ratings
create policy "update_own_rating"
  on public.case_ratings for update
  using (rater_id = auth.uid());
