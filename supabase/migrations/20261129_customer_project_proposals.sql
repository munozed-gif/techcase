-- Customers logged into the platform see the proposals sent to them in the project's Proposals tab,
-- with the same view and decision as the secure link (they reuse the proposal token).
-- A user is the project's customer when they belong to the project's customer company
-- (is_customer_member) or are the project's client user. Drafts are never returned.
-- No DROP / DELETE.

CREATE OR REPLACE FUNCTION public.is_project_customer(p_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = p_project
      AND ((p.customer_id IS NOT NULL AND public.is_customer_member(p.customer_id)) OR p.client_id = auth.uid())
  );
$$;
REVOKE ALL ON FUNCTION public.is_project_customer(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_project_customer(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.customer_project_proposals(p_project uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_project_customer(p_project) THEN RETURN '[]'::jsonb; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', v.id, 'title', v.title, 'version', v.version, 'status', v.status, 'token', v.token,
      'currency', v.currency, 'sent_at', v.sent_at, 'decided_at', v.decided_at, 'valid_until', v.valid_until,
      'type', coalesce(v.totals ->> 'type', 'cases'), 'total', v.totals -> 'total',
      'hours_month', v.totals -> 'hoursMonth', 'accepted_option', v.accepted_option
    ) ORDER BY coalesce(v.sent_at, v.created_at) DESC)
    FROM project_proposals v
    WHERE v.project_id = p_project AND v.status <> 'draft'), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.customer_project_proposals(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.customer_project_proposals(uuid) TO authenticated;
