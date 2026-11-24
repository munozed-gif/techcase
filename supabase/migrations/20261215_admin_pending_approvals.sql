-- Every approval that is waiting for someone, for admins and managers: team and case invitations,
-- customer and headhunter invitations, partner / seller sign-ups, case applications, headhunter
-- proposals, delivery bids, customer spec reviews and questions, proposals sent, blueprint and
-- transport approvals. Columns that not every database has are read through to_jsonb(row). Read-only; RLS keeps these rows private to their parties otherwise.
create or replace function public.admin_pending_approvals()
returns table (kind text, id uuid, title text, approver text, approver_email text, requested_by text,
               created_at timestamptz, expires_at timestamptz, status text, case_id uuid, project_id uuid)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  return query
  select x.kind::text, x.id::uuid, x.title::text, x.approver::text, x.approver_email::text, x.requested_by::text,
         x.created_at::timestamptz, x.expires_at::timestamptz, x.status::text, x.case_id::uuid, x.project_id::uuid
  from (
  -- Consultant team invitations: the invitee accepts.
  select 'team_invite'::text as kind, m.id, t.name::text as title, coalesce(u.full_name, m.email)::text as approver, m.email::text as approver_email,
         o.full_name::text as requested_by, m.invited_at as created_at, null::timestamptz as expires_at,
         m.status::text as status, null::uuid as case_id, null::uuid as project_id
    from consultant_team_members m join consultant_teams t on t.id = m.team_id
    left join users u on u.id = m.user_id left join users o on o.id = t.created_by
   where m.status::text = 'pending'
  union all
  -- Customer team members invited by a client.
  select 'client_team_invite', c.id, coalesce(cu.full_name, 'Client team'), coalesce(c.full_name, c.name, c.email), c.email, cu.full_name,
         c.created_at, null, to_jsonb(c)->>'status', null, null
    from client_team_members c left join users cu on cu.id = c.client_id
   where coalesce(to_jsonb(c)->>'status', '') in ('pending', 'invited')
  union all
  -- Case invitations (client user invited to a case).
  select 'case_invite', i.id, cs.title, coalesce(i.invited_name, i.invited_email), i.invited_email, ib.full_name,
         i.created_at, i.expires_at, i.status::text, i.case_id, cs.project_id
    from case_invitations i left join cases cs on cs.id = i.case_id left join users ib on ib.id = i.invited_by
   where i.status::text = 'pending'
  union all
  -- Customer user invitations.
  select 'customer_invite', ci.id, null, ci.email, ci.email, ib.full_name,
         ci.created_at, null, ci.status::text, null, null
    from customer_invites ci left join users ib on ib.id = ci.invited_by
   where ci.status::text = 'pending'
  union all
  -- Headhunter invitations to consultants.
  select 'hh_invite', h.id, null, coalesce(h.name, h.email), h.email, hu.full_name,
         h.created_at, h.expires_at, h.status::text, null, null
    from hh_candidate_invites h left join users hu on hu.id = h.headhunter_id
   where h.status::text = 'pending'
  union all
  -- Partner sign-ups (the platform approves).
  select 'partner_signup', p.id, p.name, 'Platform', null, ow.full_name,
         p.created_at, null, p.status::text, null, null
    from partners p left join users ow on ow.id = p.owner_id
   where p.status::text in ('pending', 'requested')
  union all
  -- Seller sign-ups (the platform or the partner approves).
  select 'seller_signup', s.user_id, coalesce(pa.name, 'Arena'), coalesce(pa.name, 'Platform'), null, su.full_name,
         s.created_at, null, s.status::text, null, null
    from sellers s left join users su on su.id = s.user_id left join partners pa on pa.id = s.partner_id
   where s.status::text = 'pending'
  union all
  -- Consultant applications to cases.
  select 'application', a.id, cs.title, coalesce(mg.full_name, 'Case manager'), mg.email, au.full_name,
         a.submitted_at, null, a.status::text, a.case_id, cs.project_id
    from applications a left join cases cs on cs.id = a.case_id
    left join users au on au.id = a.consultant_id left join users mg on mg.id = cs.manager_id
   where a.status::text = 'pending'
  union all
  -- Headhunter proposals on cases.
  select 'hh_proposal', hp.id, cs.title, coalesce(mg.full_name, 'Case manager'), mg.email, hu.full_name,
         coalesce(hp.submitted_at, (to_jsonb(hp)->>'created_at')::timestamptz), null, hp.status::text, hp.case_id, cs.project_id
    from hh_proposals hp left join cases cs on cs.id = hp.case_id
    left join users hu on hu.id = hp.headhunter_id left join users mg on mg.id = cs.manager_id
   where hp.status::text in ('pending', 'submitted')
  union all
  -- Delivery bids on sales opportunities.
  select 'delivery_bid', d.id, coalesce(pr.name, 'Opportunity'), 'Seller', null, sb.full_name,
         d.created_at, null, d.status::text, null, d.project_id
    from project_deliveries d left join projects pr on pr.id = d.project_id left join users sb on sb.id = d.submitted_by
   where d.status::text in ('requested', 'submitted')
  union all
  -- Specs shared with the customer for approval.
  select 'spec_review', r.id, coalesce(r.case_title, cs.title), coalesce(r.customer_name, 'Customer'), r.customer_email, cb.full_name,
         r.created_at, r.expires_at, r.status::text, r.case_id, cs.project_id
    from spec_review_tokens r left join cases cs on cs.id = r.case_id left join users cb on cb.id = r.created_by
   where r.status::text = 'pending'
  union all
  -- Questions sent to the customer.
  select 'spec_questions', q.id, coalesce(q.case_title, cs.title), coalesce(q.customer_name, 'Customer'), q.customer_email, cb.full_name,
         q.created_at, q.expires_at, q.status::text, q.case_id, cs.project_id
    from spec_question_links q left join cases cs on cs.id = q.case_id left join users cb on cb.id = q.created_by
   where q.status::text = 'pending'
  union all
  -- Proposals sent to the customer.
  select 'proposal', pp.id, pp.title, 'Customer', null, cb.full_name,
         coalesce(pp.sent_at, pp.created_at), pp.valid_until::timestamptz, pp.status::text, null, pp.project_id
    from project_proposals pp left join users cb on cb.id = pp.created_by
   where pp.status::text in ('sent', 'viewed')
  union all
  -- Blueprint / object approvals by token.
  select 'blueprint_approval', ar.id, coalesce(cs.title, pr.name), coalesce(ar.reviewer_name, ar.reviewer_email), ar.reviewer_email, null,
         ar.created_at, ar.expires_at, ar.status::text, ar.case_id, coalesce(ar.project_id, cs.project_id)
    from approval_requests ar left join cases cs on cs.id = ar.case_id left join projects pr on pr.id = ar.project_id
   where ar.status::text = 'pending'
     and exists (select 1 from approval_request_objects o where o.approval_request_id = ar.id and o.decision is null)
  union all
  -- Transport requests waiting for approval.
  select 'transport', tr.id, coalesce(tr.request_number, '') || coalesce(' — ' || tr.description, ''), 'Approver', null, cb.full_name,
         tr.created_at, null, tr.approval_status::text, tr.case_id, tr.project_id
    from case_transport_requests tr left join users cb on cb.id = tr.created_by
   where tr.approval_status::text = 'pending_review'
  ) x
  order by x.created_at desc nulls last;
end $$;
revoke execute on function public.admin_pending_approvals() from public, anon;
grant execute on function public.admin_pending_approvals() to authenticated, service_role;
