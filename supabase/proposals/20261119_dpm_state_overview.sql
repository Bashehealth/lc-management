-- PROPOSAL ONLY: do not apply to production without review and approval.
-- Exposes state-scoped aggregate data and coordinator names to DPM only.
-- It does not grant table access or change existing RLS policies.
-- submitted_lga_report_count deliberately excludes state-level reports whose
-- current reports schema has no state_id association.

CREATE OR REPLACE FUNCTION public.dpm_state_overview()
RETURNS TABLE (
  state_id uuid,
  state_code text,
  state_name text,
  state_coordinators text[],
  lga_count bigint,
  plan_count bigint,
  completed_task_count bigint,
  pending_review_count bigint,
  submitted_lga_report_count bigint,
  working_day_record_count bigint,
  leave_request_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
BEGIN
  IF COALESCE(public.current_app_role()::text, '') <> 'dpm' THEN
    RAISE EXCEPTION 'DPM access required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT st.id, st.code, st.name,
    COALESCE((
      SELECT array_agg(p.full_name ORDER BY p.full_name)
      FROM public.profiles p
      WHERE p.role::text = 'state_coordinator' AND p.state_id = st.id
    ), ARRAY[]::text[]),
    (SELECT count(*) FROM public.lgas l WHERE l.state_id = st.id),
    (SELECT count(*) FROM public.monthly_plans mp JOIN public.lgas l ON l.id = mp.lga_id WHERE l.state_id = st.id)
      + (SELECT count(*) FROM public.weekly_plans wp JOIN public.lgas l ON l.id = wp.lga_id WHERE l.state_id = st.id),
    (SELECT count(*) FROM public.tasks t JOIN public.lgas l ON l.id = t.lga_id WHERE l.state_id = st.id AND t.status::text = 'completed'),
    (SELECT count(*) FROM public.monthly_plans mp JOIN public.lgas l ON l.id = mp.lga_id WHERE l.state_id = st.id AND mp.status::text = 'submitted')
      + (SELECT count(*) FROM public.weekly_plans wp JOIN public.lgas l ON l.id = wp.lga_id WHERE l.state_id = st.id AND wp.status::text = 'submitted')
      + (SELECT count(*) FROM public.reports r JOIN public.lgas l ON l.id = r.lga_id WHERE l.state_id = st.id AND r.status::text = 'submitted'),
    (SELECT count(*) FROM public.reports r JOIN public.lgas l ON l.id = r.lga_id WHERE l.state_id = st.id AND r.status::text = 'submitted'),
    (SELECT count(*) FROM public.working_day_records w JOIN public.lgas l ON l.id = w.lga_id WHERE l.state_id = st.id),
    (SELECT count(*) FROM public.leave_requests lr JOIN public.profiles p ON p.id = lr.requester_id JOIN public.lgas l ON l.id = p.lga_id WHERE l.state_id = st.id)
  FROM public.states st
  WHERE st.is_active
  ORDER BY st.name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.dpm_state_lga_overview(p_state_id uuid)
RETURNS TABLE (
  lga_id uuid,
  lga_name text,
  lga_coordinators text[],
  plan_count bigint,
  completed_task_count bigint,
  pending_review_count bigint,
  submitted_lga_report_count bigint,
  working_day_record_count bigint,
  leave_request_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
BEGIN
  IF COALESCE(public.current_app_role()::text, '') <> 'dpm' THEN
    RAISE EXCEPTION 'DPM access required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.states st WHERE st.id = p_state_id AND st.is_active) THEN
    RAISE EXCEPTION 'Active state not found' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT l.id, l.name,
    COALESCE((
      SELECT array_agg(p.full_name ORDER BY p.full_name)
      FROM public.profiles p
      WHERE p.role::text = 'lga_coordinator' AND p.lga_id = l.id
    ), ARRAY[]::text[]),
    (SELECT count(*) FROM public.monthly_plans mp WHERE mp.lga_id = l.id)
      + (SELECT count(*) FROM public.weekly_plans wp WHERE wp.lga_id = l.id),
    (SELECT count(*) FROM public.tasks t WHERE t.lga_id = l.id AND t.status::text = 'completed'),
    (SELECT count(*) FROM public.monthly_plans mp WHERE mp.lga_id = l.id AND mp.status::text = 'submitted')
      + (SELECT count(*) FROM public.weekly_plans wp WHERE wp.lga_id = l.id AND wp.status::text = 'submitted')
      + (SELECT count(*) FROM public.reports r WHERE r.lga_id = l.id AND r.status::text = 'submitted'),
    (SELECT count(*) FROM public.reports r WHERE r.lga_id = l.id AND r.status::text = 'submitted'),
    (SELECT count(*) FROM public.working_day_records w WHERE w.lga_id = l.id),
    (SELECT count(*) FROM public.leave_requests lr JOIN public.profiles p ON p.id = lr.requester_id WHERE p.lga_id = l.id)
  FROM public.lgas l
  WHERE l.state_id = p_state_id
  ORDER BY l.name;
END;
$function$;

REVOKE ALL ON FUNCTION public.dpm_state_overview() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dpm_state_lga_overview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dpm_state_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.dpm_state_lga_overview(uuid) TO authenticated;
