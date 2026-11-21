-- Creating a consultant team used two client requests (team, then owner membership).
-- If the second failed (network drop), the team was left without an owner and was
-- invisible/unmanageable. The owner row is now added in the same transaction by a trigger.
-- No DROP / DELETE.

CREATE OR REPLACE FUNCTION public.consultant_team_add_owner()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM consultant_team_members m WHERE m.team_id = NEW.id AND m.user_id = NEW.created_by
  ) THEN
    INSERT INTO consultant_team_members (team_id, user_id, email, role, status, responded_at)
    SELECT NEW.id, NEW.created_by, coalesce(u.email, ''), 'owner', 'accepted', now()
    FROM (SELECT NEW.created_by AS id) x LEFT JOIN users u ON u.id = x.id;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER consultant_team_add_owner
  AFTER INSERT ON public.consultant_teams
  FOR EACH ROW EXECUTE FUNCTION public.consultant_team_add_owner();

-- Repair teams created without their owner membership
INSERT INTO public.consultant_team_members (team_id, user_id, email, role, status, responded_at)
SELECT t.id, t.created_by, coalesce(u.email, ''), 'owner', 'accepted', now()
FROM public.consultant_teams t
LEFT JOIN public.users u ON u.id = t.created_by
WHERE t.created_by IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.consultant_team_members m WHERE m.team_id = t.id AND m.user_id = t.created_by);
