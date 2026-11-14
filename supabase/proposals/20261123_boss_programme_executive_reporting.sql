-- PROPOSAL ONLY. Requires the active schema migrations plus
-- 20261116_reporting_and_evidence_contract.sql,
-- 20261120_programme_state_directory.sql, and
-- 20261122_boss_directory_data.sql.
-- These RPCs are the only Boss path to operational and contact data.

CREATE OR REPLACE FUNCTION public.boss_executive_overview(p_month date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' SET row_security = off
AS $function$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR public.current_app_role()::text <> 'boss' THEN
    RAISE EXCEPTION 'Boss reporting access required' USING ERRCODE = '42501';
  END IF;
  IF p_month IS NULL OR date_trunc('month', p_month)::date <> p_month THEN
    RAISE EXCEPTION 'Reporting month must be the first day of a month' USING ERRCODE = '22023';
  END IF;

  WITH state_rows AS (
    SELECT st.id AS state_id, st.code AS state_code, st.name AS state_name,
      (SELECT count(*) FROM public.lgas l WHERE l.state_id = st.id) AS registered_lgas,
      (SELECT CASE
        WHEN count(*) = 0 THEN 0
        WHEN count(*) FILTER (WHERE l.is_active IS NOT NULL) = count(*)
          THEN count(*) FILTER (WHERE l.is_active IS TRUE)
        ELSE NULL END
       FROM public.lgas l WHERE l.state_id = st.id) AS active_lgas,
      (SELECT count(*) FROM public.profiles p JOIN public.lgas l ON l.id = p.lga_id
        WHERE p.role::text = 'lga_coordinator' AND l.state_id = st.id) AS lga_coordinators,
      (SELECT count(*) FROM public.profiles p WHERE p.role::text = 'state_coordinator' AND p.state_id = st.id) AS state_coordinators,
      (SELECT count(*) FROM public.profiles p WHERE p.role::text = 'senior_supervisor' AND p.state_id = st.id) AS senior_supervisors,
      (SELECT count(*) FROM public.working_day_records w JOIN public.lgas l ON l.id = w.lga_id
        WHERE l.state_id = st.id AND w.working_date >= p_month
          AND w.working_date < (p_month + interval '1 month')::date AND w.status::text = 'approved') AS verified_working_days,
      (SELECT count(*) FROM public.working_day_records w JOIN public.lgas l ON l.id = w.lga_id
        WHERE l.state_id = st.id AND w.working_date >= p_month
          AND w.working_date < (p_month + interval '1 month')::date AND w.status::text = 'claimed') AS pending_working_days,
      (SELECT count(*) FROM public.working_day_records w JOIN public.lgas l ON l.id = w.lga_id
        WHERE l.state_id = st.id AND w.working_date >= p_month
          AND w.working_date < (p_month + interval '1 month')::date AND w.status::text = 'returned') AS returned_working_days,
      (SELECT count(*) FROM public.working_day_records w JOIN public.lgas l ON l.id = w.lga_id
        WHERE l.state_id = st.id AND w.working_date >= p_month
          AND w.working_date < (p_month + interval '1 month')::date AND w.status::text = 'rejected') AS rejected_working_days
    FROM public.states st
    WHERE st.is_active AND st.code IN (
      'NG-YO','NG-BO','NG-BA','NG-GO','NG-AD','NG-JI','NG-KN','NG-KD',
      'NG-KT','NG-ZA','NG-SO','NG-KE','NG-NI','NG-NA','NG-KO'
    )
  )
  SELECT jsonb_build_object(
    'summary', jsonb_build_object(
      'programme_state_count', 15,
      'lga_coordinator_count', (SELECT count(*) FROM public.profiles p JOIN public.lgas l ON l.id = p.lga_id JOIN public.states st ON st.id = l.state_id
        WHERE p.role::text = 'lga_coordinator' AND st.is_active AND st.code IN ('NG-YO','NG-BO','NG-BA','NG-GO','NG-AD','NG-JI','NG-KN','NG-KD','NG-KT','NG-ZA','NG-SO','NG-KE','NG-NI','NG-NA','NG-KO')),
      'state_coordinator_count', (SELECT count(*) FROM public.profiles p JOIN public.states st ON st.id = p.state_id
        WHERE p.role::text = 'state_coordinator' AND st.is_active AND st.code IN ('NG-YO','NG-BO','NG-BA','NG-GO','NG-AD','NG-JI','NG-KN','NG-KD','NG-KT','NG-ZA','NG-SO','NG-KE','NG-NI','NG-NA','NG-KO')),
      'senior_supervisor_count', (SELECT count(*) FROM public.profiles p JOIN public.states st ON st.id = p.state_id
        WHERE p.role::text = 'senior_supervisor' AND st.is_active AND st.code IN ('NG-YO','NG-BO','NG-BA','NG-GO','NG-AD','NG-JI','NG-KN','NG-KD','NG-KT','NG-ZA','NG-SO','NG-KE','NG-NI','NG-NA','NG-KO')),
      'registered_lga_count', (SELECT count(*) FROM public.lgas l JOIN public.states st ON st.id = l.state_id
        WHERE st.is_active AND st.code IN ('NG-YO','NG-BO','NG-BA','NG-GO','NG-AD','NG-JI','NG-KN','NG-KD','NG-KT','NG-ZA','NG-SO','NG-KE','NG-NI','NG-NA','NG-KO')),
      'active_lga_count', (SELECT CASE
        WHEN count(*) = 0 THEN 0
        WHEN count(*) FILTER (WHERE l.is_active IS NOT NULL) = count(*)
          THEN count(*) FILTER (WHERE l.is_active IS TRUE)
        ELSE NULL END FROM public.lgas l JOIN public.states st ON st.id = l.state_id
        WHERE st.is_active AND st.code IN ('NG-YO','NG-BO','NG-BA','NG-GO','NG-AD','NG-JI','NG-KN','NG-KD','NG-KT','NG-ZA','NG-SO','NG-KE','NG-NI','NG-NA','NG-KO')),
      'verified_working_days', (SELECT count(*) FROM public.working_day_records w JOIN public.lgas l ON l.id = w.lga_id JOIN public.states st ON st.id = l.state_id
        WHERE st.is_active AND st.code IN ('NG-YO','NG-BO','NG-BA','NG-GO','NG-AD','NG-JI','NG-KN','NG-KD','NG-KT','NG-ZA','NG-SO','NG-KE','NG-NI','NG-NA','NG-KO')
          AND w.working_date >= p_month AND w.working_date < (p_month + interval '1 month')::date AND w.status::text = 'approved')
    ),
    'states', COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.state_name) FROM state_rows s), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.boss_personnel_directory(
  p_state_id uuid, p_role text, p_search text, p_month date
)
RETURNS TABLE (
  person_id uuid, role text, full_name text, state_id uuid, state_code text,
  state_name text, lga_id uuid, lga_name text, email text, phone_number text,
  verified_working_days bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' SET row_security = off
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.current_app_role()::text <> 'boss' THEN
    RAISE EXCEPTION 'Boss reporting access required' USING ERRCODE = '42501';
  END IF;
  IF p_month IS NULL OR date_trunc('month', p_month)::date <> p_month THEN
    RAISE EXCEPTION 'Reporting month must be the first day of a month' USING ERRCODE = '22023';
  END IF;
  IF p_role IS NOT NULL AND p_role NOT IN ('lga_coordinator','state_coordinator','senior_supervisor') THEN
    RAISE EXCEPTION 'Unsupported personnel role filter' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT p.id, p.role::text, p.full_name,
    COALESCE(p.state_id, l.state_id), st.code, st.name, p.lga_id, l.name,
    au.email, contact.phone_number,
    CASE WHEN p.role::text = 'lga_coordinator' THEN
      (SELECT count(*) FROM public.working_day_records w
       WHERE w.lga_id = p.lga_id AND w.submitted_by = p.id
         AND w.working_date >= p_month AND w.working_date < (p_month + interval '1 month')::date
         AND w.status::text = 'approved')
    ELSE 0 END
  FROM public.profiles p
  LEFT JOIN public.lgas l ON l.id = p.lga_id
  LEFT JOIN public.states st ON st.id = COALESCE(p.state_id, l.state_id)
  LEFT JOIN auth.users au ON au.id = p.id
  LEFT JOIN public.profile_contact_details contact ON contact.profile_id = p.id
  WHERE p.role::text IN ('lga_coordinator','state_coordinator','senior_supervisor')
    AND st.is_active
    AND st.code IN ('NG-YO','NG-BO','NG-BA','NG-GO','NG-AD','NG-JI','NG-KN','NG-KD','NG-KT','NG-ZA','NG-SO','NG-KE','NG-NI','NG-NA','NG-KO')
    AND (p_state_id IS NULL OR COALESCE(p.state_id, l.state_id) = p_state_id)
    AND (p_role IS NULL OR p.role::text = p_role)
    AND (COALESCE(trim(p_search), '') = '' OR p.full_name ILIKE '%' || trim(p_search) || '%')
  ORDER BY st.name NULLS LAST, l.name NULLS FIRST, p.full_name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.boss_state_drilldown(p_state_id uuid, p_month date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' SET row_security = off
AS $function$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR public.current_app_role()::text <> 'boss' THEN
    RAISE EXCEPTION 'Boss reporting access required' USING ERRCODE = '42501';
  END IF;
  IF p_month IS NULL OR date_trunc('month', p_month)::date <> p_month THEN
    RAISE EXCEPTION 'Reporting month must be the first day of a month' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_build_object(
    'state', jsonb_build_object(
      'state_id', st.id, 'state_code', st.code, 'state_name', st.name,
      'lga_coordinators', (SELECT count(*) FROM public.profiles p JOIN public.lgas l ON l.id = p.lga_id
        WHERE p.role::text = 'lga_coordinator' AND l.state_id = st.id),
      'state_coordinators', (SELECT count(*) FROM public.profiles p WHERE p.role::text = 'state_coordinator' AND p.state_id = st.id),
      'senior_supervisors', (SELECT count(*) FROM public.profiles p WHERE p.role::text = 'senior_supervisor' AND p.state_id = st.id),
      'registered_lgas', (SELECT count(*) FROM public.lgas l WHERE l.state_id = st.id)
    ),
    'lgas', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'lga_id', l.id, 'lga_name', l.name,
      'lga_coordinators', (SELECT count(*) FROM public.profiles p WHERE p.role::text = 'lga_coordinator' AND p.lga_id = l.id),
      'active_lga', l.is_active,
      'verified_working_days', (SELECT count(*) FROM public.working_day_records w WHERE w.lga_id = l.id
        AND w.working_date >= p_month AND w.working_date < (p_month + interval '1 month')::date AND w.status::text = 'approved'),
      'pending_working_days', (SELECT count(*) FROM public.working_day_records w WHERE w.lga_id = l.id
        AND w.working_date >= p_month AND w.working_date < (p_month + interval '1 month')::date AND w.status::text = 'claimed'),
      'returned_working_days', (SELECT count(*) FROM public.working_day_records w WHERE w.lga_id = l.id
        AND w.working_date >= p_month AND w.working_date < (p_month + interval '1 month')::date AND w.status::text = 'returned'),
      'rejected_working_days', (SELECT count(*) FROM public.working_day_records w WHERE w.lga_id = l.id
        AND w.working_date >= p_month AND w.working_date < (p_month + interval '1 month')::date AND w.status::text = 'rejected')
    ) ORDER BY l.name) FROM public.lgas l WHERE l.state_id = st.id), '[]'::jsonb)
  ) INTO result
  FROM public.states st
  WHERE st.id = p_state_id AND st.is_active
    AND st.code IN ('NG-YO','NG-BO','NG-BA','NG-GO','NG-AD','NG-JI','NG-KN','NG-KD','NG-KT','NG-ZA','NG-SO','NG-KE','NG-NI','NG-NA','NG-KO');

  IF result IS NULL THEN RAISE EXCEPTION 'Programme state not found or not configured' USING ERRCODE = 'P0002'; END IF;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.boss_working_day_overview(p_month date)
RETURNS TABLE (
  state_id uuid, state_code text, state_name text, lga_id uuid, lga_name text,
  lc_id uuid, lc_name text, approved_days bigint, pending_days bigint,
  returned_days bigint, rejected_days bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' SET row_security = off
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.current_app_role()::text <> 'boss' THEN
    RAISE EXCEPTION 'Boss reporting access required' USING ERRCODE = '42501';
  END IF;
  IF p_month IS NULL OR date_trunc('month', p_month)::date <> p_month THEN
    RAISE EXCEPTION 'Reporting month must be the first day of a month' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT st.id, st.code, st.name, l.id, l.name, p.id,
    p.full_name,
    count(w.id) FILTER (WHERE w.status::text = 'approved'),
    count(w.id) FILTER (WHERE w.status::text = 'claimed'),
    count(w.id) FILTER (WHERE w.status::text = 'returned'),
    count(w.id) FILTER (WHERE w.status::text = 'rejected')
  FROM public.working_day_records w
  JOIN public.lgas l ON l.id = w.lga_id
  JOIN public.states st ON st.id = l.state_id AND st.is_active
  LEFT JOIN public.profiles p ON p.id = w.submitted_by
    AND p.role::text = 'lga_coordinator' AND p.lga_id = l.id
  WHERE w.working_date >= p_month AND w.working_date < (p_month + interval '1 month')::date
    AND st.code IN ('NG-YO','NG-BO','NG-BA','NG-GO','NG-AD','NG-JI','NG-KN','NG-KD','NG-KT','NG-ZA','NG-SO','NG-KE','NG-NI','NG-NA','NG-KO')
  GROUP BY st.id, st.code, st.name, l.id, l.name, p.id, p.full_name
  ORDER BY st.name, l.name, p.full_name NULLS LAST;
END;
$function$;

-- Keep the existing Boss comparison and archive contracts inside the same
-- 15-state programme boundary when the earlier reporting proposal is applied.
CREATE OR REPLACE FUNCTION public.boss_lga_comparisons()
RETURNS TABLE (
  state_name text, lga_id uuid, lga_name text, task_total bigint,
  task_completed bigint, working_days_approved bigint,
  campaign_checkins bigint, readiness_reports bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' SET row_security = off
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.current_app_role()::text <> 'boss' THEN
    RAISE EXCEPTION 'Boss reporting access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT st.name, l.id, l.name,
    (SELECT count(*) FROM public.tasks t WHERE t.lga_id = l.id),
    (SELECT count(*) FROM public.tasks t WHERE t.lga_id = l.id AND t.status::text = 'completed'),
    (SELECT count(*) FROM public.working_day_records w WHERE w.lga_id = l.id AND w.status::text = 'approved'),
    (SELECT count(*) FROM public.campaign_checkins c WHERE c.lga_id = l.id),
    (SELECT count(*) FROM public.campaign_readiness_reports r WHERE r.lga_id = l.id)
  FROM public.lgas l JOIN public.states st ON st.id = l.state_id
  WHERE st.is_active AND st.code IN ('NG-YO','NG-BO','NG-BA','NG-GO','NG-AD','NG-JI','NG-KN','NG-KD','NG-KT','NG-ZA','NG-SO','NG-KE','NG-NI','NG-NA','NG-KO')
  ORDER BY st.name, l.name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.boss_report_archive()
RETURNS TABLE (
  report_id uuid, state_name text, lga_name text, report_type text,
  period_start date, period_end date, status text, created_at timestamptz,
  reviewed_at timestamptz, content jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' SET row_security = off
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.current_app_role()::text <> 'boss' THEN
    RAISE EXCEPTION 'Boss reporting access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT r.id, st.name, l.name, r.report_type, r.period_start, r.period_end,
    r.status::text, r.created_at, r.reviewed_at, r.content
  FROM public.reports r
  LEFT JOIN public.lgas l ON l.id = r.lga_id
  LEFT JOIN public.states st ON st.id = COALESCE(r.state_id, l.state_id)
  WHERE r.status::text = 'approved' AND st.is_active
    AND st.code IN ('NG-YO','NG-BO','NG-BA','NG-GO','NG-AD','NG-JI','NG-KN','NG-KD','NG-KT','NG-ZA','NG-SO','NG-KE','NG-NI','NG-NA','NG-KO')
  ORDER BY r.period_end DESC, r.created_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.boss_executive_overview(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.boss_personnel_directory(uuid,text,text,date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.boss_state_drilldown(uuid,date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.boss_working_day_overview(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.boss_lga_comparisons() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.boss_report_archive() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.boss_executive_overview(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.boss_personnel_directory(uuid,text,text,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.boss_state_drilldown(uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.boss_working_day_overview(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.boss_lga_comparisons() TO authenticated;
GRANT EXECUTE ON FUNCTION public.boss_report_archive() TO authenticated;
