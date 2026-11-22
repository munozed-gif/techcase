-- "Proposed by {headhunter}" on a case's applications. The commission % is returned to admins/managers,
-- the proposing headhunter, and the customer only on headhunter-managed cases (they accepted it in the
-- headhunter's proposal). No DROP / DELETE.
CREATE OR REPLACE FUNCTION public.hh_application_meta(p_case uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c cases%ROWTYPE; v_staff boolean := public.is_staff();
BEGIN
  SELECT * INTO c FROM cases WHERE id = p_case;
  IF NOT FOUND THEN RETURN '[]'::jsonb; END IF;
  IF NOT (v_staff OR c.client_id = auth.uid() OR public.user_can_access_case(p_case)
          OR EXISTS (SELECT 1 FROM applications a WHERE a.case_id = p_case AND a.submitted_by_headhunter_id = auth.uid())) THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'application_id', a.id, 'headhunter_id', a.submitted_by_headhunter_id, 'headhunter_name', h.full_name,
      'commission_pct', CASE WHEN v_staff OR a.submitted_by_headhunter_id = auth.uid()
                               OR (c.client_id = auth.uid() AND coalesce(c.is_head_hunter, false)) THEN a.headhunter_commission_pct END))
    FROM applications a JOIN users h ON h.id = a.submitted_by_headhunter_id
    WHERE a.case_id = p_case AND a.submitted_by_headhunter_id IS NOT NULL), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.hh_application_meta(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.hh_application_meta(uuid) TO authenticated;
