-- Admins and managers decide any pending approval on behalf of the person it is waiting on.
-- Each kind reuses the platform's own decision function where one exists (partner / seller review,
-- delivery requests and bids, headhunter link, proposal decision) or applies the same updates and
-- notifications the app applies, so the effects are the same as if that person had decided.
-- Every decision is recorded in audit_logs with who decided on whose behalf.
-- Also fixes the pending list: transports wait in 'pending_review', delivery requests in 'requested',
-- client team members in 'invited', and blueprint reviews only while an object is undecided.

create or replace function public.admin_decide_approval(p_kind text, p_id uuid, p_approve boolean, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me users%rowtype; v_note text := nullif(trim(coalesce(p_note, '')), ''); v_by text; v_res text;
  r_team consultant_team_members%rowtype; r_hh hh_candidate_invites%rowtype; r_app applications%rowtype;
  r_hp hh_proposals%rowtype; r_d project_deliveries%rowtype; r_rev spec_review_tokens%rowtype;
  r_prop project_proposals%rowtype; u_id uuid; v_case cases%rowtype; v_name text;
begin
  if not public.is_staff() then raise exception 'Only administrators and managers' using errcode = '42501'; end if;
  select * into me from users where id = auth.uid();
  v_by := coalesce(me.full_name, me.email, 'an administrator');
  if not p_approve and v_note is null and p_kind in ('spec_review', 'proposal') then
    raise exception 'Add a comment to reject or ask for changes' using errcode = '22023';
  end if;

  if p_kind = 'team_invite' then
    select * into r_team from consultant_team_members where id = p_id for update;
    if not found or r_team.status <> 'pending' then raise exception 'Invitation not found or already answered' using errcode = '22023'; end if;
    if p_approve and r_team.user_id is null then raise exception 'The invitee has no account yet — it can only be declined' using errcode = '22023'; end if;
    update consultant_team_members set status = case when p_approve then 'accepted' else 'declined' end, responded_at = now() where id = p_id;
    select coalesce(t.name, 'the team') into v_name from consultant_teams t where t.id = r_team.team_id;
    if r_team.user_id is not null then
      insert into notifications (user_id, title, body, is_read, event_type)
      values (r_team.user_id, 'Team invitation ' || case when p_approve then 'accepted' else 'declined' end,
              format('An administrator (%s) %s your invitation to "%s" on your behalf.', v_by, case when p_approve then 'accepted' else 'declined' end, v_name), false, 'team_invitation');
    end if;
    insert into notifications (user_id, title, body, is_read, event_type)
    select t.created_by, 'Team invitation ' || case when p_approve then 'accepted' else 'declined' end,
           format('%s was %s in "%s" by an administrator (%s).', r_team.email, case when p_approve then 'added' else 'declined' end, v_name, v_by), false, 'team_invitation'
      from consultant_teams t where t.id = r_team.team_id and t.created_by is not null;
    v_res := case when p_approve then 'accepted' else 'declined' end;

  elsif p_kind = 'client_team_invite' then
    update client_team_members set status = case when p_approve then 'active' else 'inactive' end
     where id = p_id and status = 'invited';
    if not found then raise exception 'Invitation not found or already answered' using errcode = '22023'; end if;
    v_res := case when p_approve then 'active' else 'inactive' end;

  elsif p_kind = 'case_invite' then
    if p_approve then raise exception 'A case invitation is accepted by the invitee creating their account — it can only be revoked' using errcode = '22023'; end if;
    update case_invitations set status = 'expired', expires_at = least(coalesce(expires_at, now()), now()) where id = p_id and status = 'pending';
    if not found then raise exception 'Invitation not found or already answered' using errcode = '22023'; end if;
    v_res := 'revoked';

  elsif p_kind = 'customer_invite' then
    if p_approve then raise exception 'A customer invitation is accepted by the invitee signing in — it can only be revoked' using errcode = '22023'; end if;
    update customer_invites set status = 'revoked' where id = p_id and status = 'pending';
    if not found then raise exception 'Invitation not found or already answered' using errcode = '22023'; end if;
    v_res := 'revoked';

  elsif p_kind = 'hh_invite' then
    select * into r_hh from hh_candidate_invites where id = p_id for update;
    if not found or r_hh.status <> 'pending' then raise exception 'Invitation not found or already answered' using errcode = '22023'; end if;
    if p_approve then
      select id into u_id from users where lower(email) = lower(r_hh.email) and role = 'consultant' limit 1;
      if u_id is null then raise exception 'There is no consultant account with % yet — it can only be declined' , r_hh.email using errcode = '22023'; end if;
      update hh_candidate_invites set status = 'accepted', consultant_id = u_id, responded_at = now() where id = p_id;
      perform public._hh_link(r_hh.headhunter_id, u_id, 'invite', r_hh.id);
    else
      update hh_candidate_invites set status = 'declined', responded_at = now() where id = p_id;
      insert into notifications (user_id, type, title, body, payload, event_type)
      values (r_hh.headhunter_id, 'headhunter', 'Invitation declined', coalesce(r_hh.name, r_hh.email) || ' — declined by an administrator.', '{}'::jsonb, 'headhunter');
    end if;
    v_res := case when p_approve then 'accepted' else 'declined' end;

  elsif p_kind = 'partner_signup' then
    perform public.review_partner(p_id, case when p_approve then 'approved' else 'rejected' end, null, v_note);
    v_res := case when p_approve then 'approved' else 'rejected' end;

  elsif p_kind = 'seller_signup' then
    perform public.seller_review(p_id, case when p_approve then 'approved' else 'rejected' end, v_note);
    v_res := case when p_approve then 'approved' else 'rejected' end;

  elsif p_kind = 'application' then
    select * into r_app from applications where id = p_id for update;
    if not found or r_app.status::text <> 'pending' then raise exception 'Application not found or already decided' using errcode = '22023'; end if;
    -- status is text in some databases and the application_status enum in others: a literal fits both.
    execute format('update applications set status = %L, notes = coalesce($1, notes), reviewed_at = now(), reviewed_by = auth.uid() where id = $2',
                   case when p_approve then 'accepted' else 'rejected' end) using v_note, p_id;
    select * into v_case from cases where id = r_app.case_id;
    if p_approve then
      if not exists (select 1 from case_assignments where case_id = r_app.case_id and consultant_id = r_app.consultant_id and coalesce(is_active, true)) then
        insert into case_assignments (case_id, consultant_id, time_commitment)
        values (r_app.case_id, r_app.consultant_id, r_app.time_commitment);
      end if;
      insert into notifications (user_id, title, body, is_read, event_type)
      values (r_app.consultant_id, 'Application accepted', format('Your application to "%s" has been accepted. You are now assigned to the case.', v_case.title), false, 'case_assignment');
    else
      insert into notifications (user_id, title, body, is_read, event_type)
      values (r_app.consultant_id, 'Application not selected', format('Your application to "%s" was reviewed but was not selected.', v_case.title), false, 'case_assignment');
    end if;
    v_res := case when p_approve then 'accepted' else 'rejected' end;

  elsif p_kind = 'hh_proposal' then
    select * into r_hp from hh_proposals where id = p_id for update;
    if not found or r_hp.status::text <> 'pending' then raise exception 'Proposal not found or already decided' using errcode = '22023'; end if;
    select * into v_case from cases where id = r_hp.case_id;
    update hh_proposals set status = case when p_approve then 'accepted' else 'rejected' end, reviewed_at = now(), reviewed_by = auth.uid() where id = p_id;
    if p_approve then
      update cases set head_hunter_id = r_hp.headhunter_id where id = r_hp.case_id;
      update hh_proposals set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid()
       where case_id = r_hp.case_id and id <> p_id and status::text = 'pending';
    end if;
    insert into notifications (user_id, title, body, is_read, event_type)
    values (r_hp.headhunter_id, case when p_approve then 'Proposal accepted' else 'Proposal not selected' end,
            format('Your proposal for "%s" was %s.', v_case.title, case when p_approve then 'accepted' else 'not selected' end), false, 'headhunter');
    v_res := case when p_approve then 'accepted' else 'rejected' end;

  elsif p_kind = 'delivery_bid' then
    select * into r_d from project_deliveries where id = p_id;
    if not found then raise exception 'Delivery not found' using errcode = '22023'; end if;
    if r_d.status = 'requested' then
      perform public.delivery_respond(p_id, p_approve, v_note);
    elsif r_d.status = 'submitted' then
      if p_approve then perform public.delivery_award(p_id);
      else
        update project_deliveries set status = 'not_selected', decided_at = now() where id = p_id;
        if r_d.submitted_by is not null then
          insert into notifications (user_id, type, title, body, payload, event_type)
          values (r_d.submitted_by, 'sales', 'Bid not selected', 'Your delivery bid was not selected.', '{}'::jsonb, 'sales');
        end if;
      end if;
    else raise exception 'This delivery was already decided' using errcode = '22023';
    end if;
    v_res := case when p_approve then 'awarded' else 'declined' end;

  elsif p_kind = 'spec_review' then
    select * into r_rev from spec_review_tokens where id = p_id for update;
    if not found or r_rev.status <> 'pending' then raise exception 'Review not found or already answered' using errcode = '22023'; end if;
    update spec_review_tokens
       set status = case when p_approve then 'approved' else 'changes_requested' end,
           approved_at = case when p_approve then now() else approved_at end,
           feedback = format('[%s on behalf of the customer by %s]%s', case when p_approve then 'Approved' else 'Changes requested' end, v_by, coalesce(' ' || v_note, ''))
     where id = p_id;
    if r_rev.created_by is not null then
      insert into notifications (user_id, title, body, is_read, event_type)
      values (r_rev.created_by, 'Spec review ' || case when p_approve then 'approved' else 'changes requested' end,
              format('"%s" was %s on behalf of the customer by %s.%s', coalesce(r_rev.case_title, 'The spec'), case when p_approve then 'approved' else 'sent back with changes' end, v_by, coalesce(' ' || v_note, '')), false, 'spec_review');
    end if;
    v_res := case when p_approve then 'approved' else 'changes_requested' end;

  elsif p_kind = 'spec_questions' then
    if p_approve then raise exception 'Questions are answered by the customer — record the answers in the case, or revoke the link' using errcode = '22023'; end if;
    update spec_question_links set status = 'revoked' where id = p_id and status = 'pending';
    if not found then raise exception 'Link not found or already answered' using errcode = '22023'; end if;
    v_res := 'revoked';

  elsif p_kind = 'proposal' then
    select * into r_prop from project_proposals where id = p_id;
    if not found then raise exception 'Proposal not found' using errcode = '22023'; end if;
    perform public.proposal_decide_v2(r_prop.token::text, case when p_approve then 'accepted' else 'rejected' end,
                                      v_by || ' (administrator, on behalf of the customer)', coalesce(v_note, case when p_approve then null else 'Rejected by an administrator' end), null);
    v_res := case when p_approve then 'accepted' else 'rejected' end;

  elsif p_kind = 'blueprint_approval' then
    -- Decide every undecided object; the consultant's Sync reviews then applies them to the blueprint.
    update approval_request_objects
       set decision = case when p_approve then 'approved' else 'rejected' end,
           rejection_reason = case when p_approve then null else coalesce(v_note, 'Rejected by an administrator') end,
           decided_at = now()
     where approval_request_id = p_id and decision is null;
    if not found then raise exception 'Nothing left to decide in this review' using errcode = '22023'; end if;
    v_res := case when p_approve then 'approved' else 'rejected' end;

  elsif p_kind = 'transport' then
    update case_transport_requests set approval_status = case when p_approve then 'approved' else 'rejected' end, updated_at = now()
     where id = p_id and approval_status = 'pending_review';
    if not found then raise exception 'Transport not found or already decided' using errcode = '22023'; end if;
    v_res := case when p_approve then 'approved' else 'rejected' end;

  else
    raise exception 'Unknown approval type %', p_kind using errcode = '22023';
  end if;

  insert into audit_logs (user_id, user_email, user_name, event_type, entity_type, entity_id, new_value, metadata)
  values (auth.uid(), me.email, me.full_name, 'approval.decided_on_behalf', p_kind, p_id::text, to_jsonb(v_res),
          jsonb_build_object('kind', p_kind, 'result', v_res, 'approve', p_approve, 'note', v_note));
  return jsonb_build_object('ok', true, 'result', v_res);
end $$;
revoke execute on function public.admin_decide_approval(text, uuid, boolean, text) from public, anon;
grant execute on function public.admin_decide_approval(text, uuid, boolean, text) to authenticated, service_role;
