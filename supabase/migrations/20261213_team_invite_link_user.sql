-- Team invitations: link the invitee's account by email in the database. The browser can no longer
-- read other users' rows (security hardening), so invitations to existing users were saved without
-- user_id and treated as new users (never shown in their Teams tab).
create or replace function public.consultant_team_member_link_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is null and new.email is not null then
    select u.id into new.user_id from users u where lower(u.email) = lower(trim(new.email)) limit 1;
  end if;
  return new;
end $$;

create or replace trigger consultant_team_member_link_user
  before insert or update of email on public.consultant_team_members
  for each row execute function public.consultant_team_member_link_user();

-- Someone invited before having an account: link the invitation when the account is created.
create or replace function public.users_link_team_invites()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is not null then
    update consultant_team_members set user_id = new.id
     where user_id is null and lower(email) = lower(new.email);
  end if;
  return new;
end $$;

create or replace trigger users_link_team_invites
  after insert or update of email on public.users
  for each row execute function public.users_link_team_invites();

-- Invitations already saved without the account.
update public.consultant_team_members m set user_id = u.id
  from public.users u
 where m.user_id is null and m.email is not null and lower(u.email) = lower(m.email);

revoke execute on function public.consultant_team_member_link_user() from public, anon, authenticated;
revoke execute on function public.users_link_team_invites() from public, anon, authenticated;
