-- Questions for the customer answered inside the app as well as by link: the customer-side users of
-- a case (case client, reviewer, key users, project client, customer company members) see the
-- pending question links in My reviews and are notified when the consultant sends them.
create or replace function public._is_case_customer(p_case uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user is not null and exists (
    select 1 from cases c left join projects p on p.id = c.project_id
     where c.id = p_case
       and (c.client_id = p_user or c.reviewer_user_id = p_user or p.client_id = p_user
            or exists (select 1 from case_key_users k where k.case_id = c.id and k.user_id = p_user)
            or (c.customer_id is not null and public._customer_member(c.customer_id, p_user))));
$$;
revoke execute on function public._is_case_customer(uuid, uuid) from public, anon, authenticated;

-- Pending question links waiting on the signed-in customer user.
create or replace function public.my_customer_questions()
returns table (id uuid, token uuid, case_id uuid, case_title text, project text, questions int, answered int,
               created_at timestamptz, expires_at timestamptz, created_by_name text)
language sql stable security definer set search_path = public as $$
  select l.id, l.token, l.case_id, coalesce(l.case_title, c.title), p.name,
         jsonb_array_length(l.questions), (select count(*)::int from jsonb_object_keys(l.answers)),
         l.created_at, l.expires_at, u.full_name
    from spec_question_links l join cases c on c.id = l.case_id
    left join projects p on p.id = c.project_id left join users u on u.id = l.created_by
   where l.status = 'pending' and l.expires_at > now()
     and public._is_case_customer(l.case_id, auth.uid())
   order by l.created_at desc;
$$;
revoke execute on function public.my_customer_questions() from public, anon;
grant execute on function public.my_customer_questions() to authenticated, service_role;

-- In-app notification to the case's customer users when a question link is sent.
create or replace function public.spec_questions_notify(p_link uuid)
returns int language plpgsql security definer set search_path = public as $$
declare l spec_question_links%rowtype; n int := 0; r record;
begin
  select * into l from spec_question_links where id = p_link;
  if not found or not public.user_can_access_case(l.case_id) then raise exception 'Not allowed' using errcode = '42501'; end if;
  for r in select u.id from users u where public._is_case_customer(l.case_id, u.id) loop
    insert into notifications (user_id, title, body, is_read, event_type, case_id)
    values (r.id, 'Preguntas sobre su requerimiento',
            format('Hay %s preguntas sobre "%s". Respóndalas en Mis revisiones.', jsonb_array_length(l.questions), coalesce(l.case_title, 'su requerimiento')),
            false, 'spec_questions', l.case_id);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.spec_questions_notify(uuid) from public, anon;
grant execute on function public.spec_questions_notify(uuid) to authenticated, service_role;
