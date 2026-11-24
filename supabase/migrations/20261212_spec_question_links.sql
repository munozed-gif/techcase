-- Questions for the customer: the consultant sends the open questions of a case (contradictions,
-- ambiguities, missing information) by link; the customer answers them on /questions/:token without
-- logging in. The answers come back into the case's spec analysis.
create table if not exists public.spec_question_links (
  id            uuid primary key default gen_random_uuid(),
  token         uuid not null unique default gen_random_uuid(),
  case_id       uuid not null references public.cases(id) on delete cascade,
  case_title    text,
  questions     jsonb not null default '[]'::jsonb,   -- snapshot sent: [{ id, kind, text, sources, assumption }]
  answers       jsonb not null default '{}'::jsonb,   -- { [questionId]: { answer, at } }
  status        text not null default 'pending' check (status in ('pending', 'answered', 'revoked')),
  customer_name text,
  customer_email text,
  answered_at   timestamptz,
  imported_at   timestamptz,                          -- when the answers were taken into the case
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '30 days'),
  platform      jsonb
);
create index if not exists spec_question_links_case_idx on public.spec_question_links(case_id);

alter table public.spec_question_links enable row level security;
create policy sql_case_team on public.spec_question_links for all to authenticated
  using ((select public.is_approved_user()) and public.user_can_access_case(case_id))
  with check ((select public.is_approved_user()) and public.user_can_access_case(case_id));
revoke all on public.spec_question_links from anon;

-- Customer page: read by token.
create or replace function public.spec_questions_by_token(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', l.id, 'case_title', l.case_title, 'questions', l.questions, 'answers', l.answers,
    'status', l.status, 'customer_name', l.customer_name, 'answered_at', l.answered_at,
    'expires_at', l.expires_at, 'expired', l.expires_at < now(), 'platform', l.platform,
    'project', (select p.name from cases c join projects p on p.id = c.project_id where c.id = l.case_id),
    'creator_name', (select u.full_name from users u where u.id = l.created_by))
  from spec_question_links l
  where l.token::text = p_token and l.status <> 'revoked'
  limit 1;
$$;

-- Customer page: save answers (draft) or submit them (p_final).
create or replace function public.spec_questions_answer(p_token text, p_answers jsonb, p_name text default null,
                                                        p_email text default null, p_final boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v spec_question_links%rowtype; v_clean jsonb := '{}'::jsonb; k text; a text;
begin
  select * into v from spec_question_links where token::text = p_token;
  if not found or v.status = 'revoked' then raise exception 'Link not found' using errcode = '42501'; end if;
  if v.expires_at < now() then raise exception 'This link has expired' using errcode = '42501'; end if;
  if v.status = 'answered' then raise exception 'The answers were already sent' using errcode = '42501'; end if;
  if jsonb_typeof(p_answers) <> 'object' then raise exception 'Invalid answers' using errcode = '22023'; end if;
  -- Only questions of this link, text up to 8000 characters.
  for k, a in select key, value->>'answer' from jsonb_each(p_answers) loop
    if exists (select 1 from jsonb_array_elements(v.questions) q where q->>'id' = k) and coalesce(trim(a), '') <> '' then
      v_clean := v_clean || jsonb_build_object(k, jsonb_build_object('answer', left(trim(a), 8000), 'at', now()));
    end if;
  end loop;
  if p_final and coalesce(trim(p_name), '') = '' then raise exception 'Your name is required' using errcode = '22023'; end if;
  update spec_question_links
     set answers = v_clean,
         customer_name = coalesce(nullif(trim(coalesce(p_name, '')), ''), customer_name),
         customer_email = coalesce(nullif(trim(coalesce(p_email, '')), ''), customer_email),
         status = case when p_final then 'answered' else status end,
         answered_at = case when p_final then now() else answered_at end
   where id = v.id;
  return jsonb_build_object('ok', true, 'final', p_final, 'answered', (select count(*) from jsonb_object_keys(v_clean)));
end $$;

revoke execute on function public.spec_questions_by_token(text) from public;
revoke execute on function public.spec_questions_answer(text, jsonb, text, text, boolean) from public;
grant execute on function public.spec_questions_by_token(text) to anon, authenticated, service_role;
grant execute on function public.spec_questions_answer(text, jsonb, text, text, boolean) to anon, authenticated, service_role;
