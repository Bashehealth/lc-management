-- PROPOSAL ONLY: review and apply only to an isolated test database first.
-- Depends on states.state_id, profiles.state_id, profiles.role, lgas.state_id,
-- working_day_records, public.current_app_role(), and DPM/Boss app roles.
-- No payment rates or amounts are stored or calculated.

CREATE TABLE public.monthly_lc_timesheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporting_month date NOT NULL CHECK (date_trunc('month', reporting_month)::date = reporting_month),
  version_number integer NOT NULL CHECK (version_number > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected')),
  prepared_by uuid NOT NULL REFERENCES public.profiles(id),
  prepared_at timestamptz NOT NULL DEFAULT now(),
  submitted_by uuid REFERENCES public.profiles(id),
  submitted_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  decision_note text,
  source_fingerprint text,
  state_directory_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(state_directory_snapshot) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reporting_month, version_number),
  CHECK (
    (status = 'draft' AND submitted_by IS NULL AND submitted_at IS NULL AND reviewed_by IS NULL AND reviewed_at IS NULL AND decision_note IS NULL)
    OR (status = 'submitted' AND submitted_by IS NOT NULL AND submitted_at IS NOT NULL AND reviewed_by IS NULL AND reviewed_at IS NULL AND decision_note IS NULL)
    OR (status IN ('approved','rejected') AND submitted_by IS NOT NULL AND submitted_at IS NOT NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND length(trim(decision_note)) >= 3)
  )
);

CREATE TABLE public.monthly_lc_timesheet_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timesheet_id uuid NOT NULL REFERENCES public.monthly_lc_timesheets(id) ON DELETE CASCADE,
  state_id uuid NOT NULL REFERENCES public.states(id),
  state_name_snapshot text NOT NULL,
  lga_id uuid NOT NULL REFERENCES public.lgas(id),
  lga_name_snapshot text NOT NULL,
  lga_coordinator_id uuid NOT NULL REFERENCES public.profiles(id),
  lga_coordinator_name_snapshot text NOT NULL,
  reporting_month date NOT NULL,
  total_submitted_days integer NOT NULL CHECK (total_submitted_days >= 0),
  verified_days integer NOT NULL CHECK (verified_days >= 0),
  pending_review_records integer NOT NULL CHECK (pending_review_records >= 0),
  rejected_records integer NOT NULL CHECK (rejected_records >= 0),
  returned_records integer NOT NULL CHECK (returned_records >= 0),
  eligibility_status text NOT NULL CHECK (eligibility_status IN ('no_records','ready_for_review','incomplete')),
  CHECK (total_submitted_days = verified_days + pending_review_records + rejected_records + returned_records),
  UNIQUE (timesheet_id, lga_id, lga_coordinator_id)
);

CREATE TABLE public.monthly_lc_timesheet_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timesheet_id uuid NOT NULL REFERENCES public.monthly_lc_timesheets(id) ON DELETE CASCADE,
  line_id uuid REFERENCES public.monthly_lc_timesheet_lines(id) ON DELETE CASCADE,
  working_day_record_id uuid NOT NULL REFERENCES public.working_day_records(id) ON DELETE RESTRICT,
  state_id uuid NOT NULL REFERENCES public.states(id),
  lga_id uuid NOT NULL REFERENCES public.lgas(id),
  submitted_by uuid NOT NULL REFERENCES public.profiles(id),
  submitter_name_snapshot text NOT NULL,
  working_date date NOT NULL,
  status_snapshot text NOT NULL CHECK (status_snapshot IN ('claimed','approved','returned','rejected')),
  submitted_at_snapshot timestamptz NOT NULL,
  approved_by_snapshot uuid REFERENCES public.profiles(id),
  approved_at_snapshot timestamptz,
  issue_code text CHECK (issue_code IS NULL OR issue_code = 'profile_not_assigned_to_source_lga'),
  UNIQUE (timesheet_id, working_day_record_id)
);

CREATE TABLE public.monthly_lc_timesheet_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timesheet_id uuid NOT NULL REFERENCES public.monthly_lc_timesheets(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('submitted','approved','rejected')),
  actor_id uuid NOT NULL REFERENCES public.profiles(id),
  note text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CHECK (action = 'submitted' OR length(trim(note)) >= 3)
);

CREATE INDEX monthly_lc_timesheets_month_idx
  ON public.monthly_lc_timesheets(reporting_month DESC, version_number DESC);
CREATE INDEX monthly_lc_timesheet_lines_parent_idx
  ON public.monthly_lc_timesheet_lines(timesheet_id, state_id, lga_id);
CREATE INDEX monthly_lc_timesheet_sources_parent_idx
  ON public.monthly_lc_timesheet_sources(timesheet_id, working_date, lga_id);
CREATE INDEX monthly_lc_timesheet_events_parent_idx
  ON public.monthly_lc_timesheet_events(timesheet_id, occurred_at DESC);

ALTER TABLE public.monthly_lc_timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_lc_timesheet_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_lc_timesheet_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_lc_timesheet_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.monthly_lc_timesheets, public.monthly_lc_timesheet_lines,
  public.monthly_lc_timesheet_sources, public.monthly_lc_timesheet_events
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_monthly_lc_timesheet_header()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  IF OLD.status = 'draft' AND NEW.status = 'submitted'
     AND public.current_app_role()::text = 'dpm'
     AND NEW.id = OLD.id AND NEW.reporting_month = OLD.reporting_month
     AND NEW.version_number = OLD.version_number AND NEW.prepared_by = OLD.prepared_by
     AND NEW.prepared_at = OLD.prepared_at AND NEW.submitted_by = auth.uid()
     AND NEW.submitted_at IS NOT NULL AND NEW.source_fingerprint IS NOT NULL
     AND jsonb_array_length(NEW.state_directory_snapshot) = 15
     AND NEW.reviewed_by IS NULL AND NEW.reviewed_at IS NULL AND NEW.decision_note IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'submitted' AND NEW.status IN ('approved','rejected')
     AND public.current_app_role()::text = 'boss'
     AND NEW.id = OLD.id AND NEW.reporting_month = OLD.reporting_month
     AND NEW.version_number = OLD.version_number AND NEW.prepared_by = OLD.prepared_by
     AND NEW.prepared_at = OLD.prepared_at AND NEW.submitted_by = OLD.submitted_by
     AND NEW.submitted_at = OLD.submitted_at AND NEW.source_fingerprint = OLD.source_fingerprint
     AND NEW.state_directory_snapshot = OLD.state_directory_snapshot AND NEW.created_at = OLD.created_at
     AND NEW.reviewed_by = auth.uid() AND NEW.reviewed_at IS NOT NULL
     AND length(trim(NEW.decision_note)) >= 3 THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Timesheet snapshots allow only DPM submission and one Boss decision'
    USING ERRCODE = '42501';
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_monthly_lc_timesheet_snapshot()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE target_id uuid;
BEGIN
  target_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.timesheet_id ELSE NEW.timesheet_id END;
  IF EXISTS (SELECT 1 FROM public.monthly_lc_timesheets t WHERE t.id = target_id AND t.status <> 'draft') THEN
    RAISE EXCEPTION 'Submitted timesheet snapshots are immutable' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_monthly_lc_timesheet_event()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  RAISE EXCEPTION 'Timesheet event history is append-only' USING ERRCODE = '55000';
END;
$function$;

CREATE TRIGGER monthly_lc_timesheet_header_guard
  BEFORE UPDATE ON public.monthly_lc_timesheets
  FOR EACH ROW EXECUTE FUNCTION public.guard_monthly_lc_timesheet_header();
CREATE TRIGGER monthly_lc_timesheet_lines_immutable
  BEFORE UPDATE OR DELETE ON public.monthly_lc_timesheet_lines
  FOR EACH ROW EXECUTE FUNCTION public.guard_monthly_lc_timesheet_snapshot();
CREATE TRIGGER monthly_lc_timesheet_sources_immutable
  BEFORE UPDATE OR DELETE ON public.monthly_lc_timesheet_sources
  FOR EACH ROW EXECUTE FUNCTION public.guard_monthly_lc_timesheet_snapshot();
CREATE TRIGGER monthly_lc_timesheet_events_append_only
  BEFORE UPDATE OR DELETE ON public.monthly_lc_timesheet_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_monthly_lc_timesheet_event();

CREATE OR REPLACE FUNCTION public.dpm_monthly_timesheet_preview(p_month date)
RETURNS TABLE (
  state_id uuid, state_code text, state_name text,
  lga_id uuid, lga_name text, lc_id uuid, lc_name text,
  total_submitted_days bigint, verified_days bigint,
  pending_review_records bigint, rejected_records bigint, returned_records bigint,
  eligibility_status text, source_records jsonb, source_fingerprint text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' SET row_security = off
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.current_app_role()::text <> 'dpm' THEN
    RAISE EXCEPTION 'DPM access required' USING ERRCODE = '42501';
  END IF;
  IF p_month IS NULL OR date_trunc('month', p_month)::date <> p_month THEN
    RAISE EXCEPTION 'Reporting month must be the first day of a month' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH source_fingerprint AS (
    SELECT md5(
      COALESCE((SELECT string_agg('STATE:' || st.id::text || ':' || st.code || ':' || st.name, '|' ORDER BY st.code)
        FROM public.states st WHERE st.is_active), '') || '#' ||
      COALESCE((SELECT string_agg('LC:' || p.id::text || ':' || COALESCE(p.full_name, '') || ':' || l.id::text || ':' || l.name || ':' || l.state_id::text, '|' ORDER BY p.id::text)
        FROM public.profiles p JOIN public.lgas l ON l.id = p.lga_id
        WHERE p.role::text = 'lga_coordinator' AND l.state_id IS NOT NULL), '') || '#' ||
      COALESCE((SELECT string_agg('WD:' || w.id::text || ':' || w.working_date::text || ':' || w.status::text || ':' || w.submitted_by::text || ':' || w.submitted_at::text || ':' || COALESCE(w.approved_by::text, '') || ':' || COALESCE(w.approved_at::text, ''), '|' ORDER BY w.id::text)
        FROM public.working_day_records w
        WHERE w.working_date >= p_month AND w.working_date < (p_month + interval '1 month')::date), '')
    ) AS value
  )
  SELECT st.id, st.code, st.name, l.id, l.name, p.id, p.full_name,
    count(w.id), count(w.id) FILTER (WHERE w.status::text = 'approved'),
    count(w.id) FILTER (WHERE w.status::text = 'claimed'),
    count(w.id) FILTER (WHERE w.status::text = 'rejected'),
    count(w.id) FILTER (WHERE w.status::text = 'returned'),
    CASE WHEN count(w.id) = 0 THEN 'no_records'
         WHEN count(w.id) = count(w.id) FILTER (WHERE w.status::text = 'approved') THEN 'ready_for_review'
         ELSE 'incomplete' END,
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', w.id, 'working_date', w.working_date, 'status', w.status,
      'submitted_at', w.submitted_at, 'approved_by', w.approved_by, 'approved_at', w.approved_at
    ) ORDER BY w.working_date, w.id) FILTER (WHERE w.id IS NOT NULL), '[]'::jsonb),
    fingerprint.value
  FROM public.profiles p
  JOIN public.lgas l ON l.id = p.lga_id
  JOIN public.states st ON st.id = l.state_id AND st.is_active
  LEFT JOIN public.working_day_records w
    ON w.lga_id = l.id AND w.submitted_by = p.id
   AND w.working_date >= p_month AND w.working_date < (p_month + interval '1 month')::date
  CROSS JOIN source_fingerprint fingerprint
  WHERE p.role::text = 'lga_coordinator'
  GROUP BY st.id, st.code, st.name, l.id, l.name, p.id, p.full_name, fingerprint.value
  ORDER BY st.name, l.name, p.full_name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.dpm_submit_monthly_timesheet(p_month date, p_expected_fingerprint text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET row_security = off
AS $function$
DECLARE
  actual_fingerprint text;
  target_id uuid;
  target_version integer;
  target_status text;
  state_snapshot jsonb;
  active_state_count integer;
BEGIN
  IF auth.uid() IS NULL OR public.current_app_role()::text <> 'dpm' THEN
    RAISE EXCEPTION 'DPM access required' USING ERRCODE = '42501';
  END IF;
  IF p_month IS NULL OR date_trunc('month', p_month)::date <> p_month THEN
    RAISE EXCEPTION 'Reporting month must be the first day of a month' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('monthly-lc-timesheet:' || p_month::text, 0));
  SELECT preview.source_fingerprint INTO actual_fingerprint
    FROM public.dpm_monthly_timesheet_preview(p_month) preview LIMIT 1;
  IF actual_fingerprint IS NULL OR p_expected_fingerprint IS DISTINCT FROM actual_fingerprint THEN
    RAISE EXCEPTION 'Working-day or LC assignments changed after preview; refresh the timesheet before submitting.' USING ERRCODE = '40001';
  END IF;

  SELECT count(*), COALESCE(jsonb_agg(jsonb_build_object(
      'state_id', st.id, 'code', st.code, 'name', st.name,
      'lga_count', (SELECT count(*) FROM public.lgas l WHERE l.state_id = st.id),
      'assigned_lc_count', (SELECT count(*) FROM public.profiles p
        JOIN public.lgas l ON l.id = p.lga_id
        WHERE p.role::text = 'lga_coordinator' AND l.state_id = st.id)
    ) ORDER BY st.code), '[]'::jsonb)
  INTO active_state_count, state_snapshot
  FROM public.states st WHERE st.is_active;
  IF active_state_count <> 15 THEN
    RAISE EXCEPTION 'Expected 15 configured active programme states; found %.', active_state_count USING ERRCODE = '55000';
  END IF;

  SELECT t.id, t.version_number, t.status INTO target_id, target_version, target_status
    FROM public.monthly_lc_timesheets t
    WHERE t.reporting_month = p_month AND t.status = 'draft'
    ORDER BY t.version_number DESC LIMIT 1 FOR UPDATE;

  IF target_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.monthly_lc_timesheets t WHERE t.reporting_month = p_month AND t.status IN ('submitted','approved')) THEN
      RAISE EXCEPTION 'A submitted or approved timesheet already exists for this month.' USING ERRCODE = '55000';
    END IF;
    SELECT COALESCE(max(t.version_number), 0) + 1 INTO target_version
      FROM public.monthly_lc_timesheets t WHERE t.reporting_month = p_month;
    INSERT INTO public.monthly_lc_timesheets(reporting_month, version_number, prepared_by)
      VALUES (p_month, target_version, auth.uid()) RETURNING id INTO target_id;
  ELSE
    DELETE FROM public.monthly_lc_timesheet_lines WHERE timesheet_id = target_id;
    DELETE FROM public.monthly_lc_timesheet_sources WHERE timesheet_id = target_id;
  END IF;

  INSERT INTO public.monthly_lc_timesheet_lines (
    timesheet_id, state_id, state_name_snapshot, lga_id, lga_name_snapshot,
    lga_coordinator_id, lga_coordinator_name_snapshot, reporting_month,
    total_submitted_days, verified_days, pending_review_records,
    rejected_records, returned_records, eligibility_status
  )
  SELECT target_id, preview.state_id, preview.state_name, preview.lga_id, preview.lga_name,
    preview.lc_id, preview.lc_name, p_month, preview.total_submitted_days::integer,
    preview.verified_days::integer, preview.pending_review_records::integer,
    preview.rejected_records::integer, preview.returned_records::integer, preview.eligibility_status
  FROM public.dpm_monthly_timesheet_preview(p_month) preview;

  INSERT INTO public.monthly_lc_timesheet_sources (
    timesheet_id, line_id, working_day_record_id, state_id, lga_id,
    submitted_by, submitter_name_snapshot, working_date, status_snapshot,
    submitted_at_snapshot, approved_by_snapshot, approved_at_snapshot, issue_code
  )
  SELECT target_id, line.id, w.id, l.state_id, l.id, w.submitted_by,
    submitter.full_name, w.working_date, w.status::text, w.submitted_at,
    w.approved_by, w.approved_at,
    CASE WHEN submitter.role::text <> 'lga_coordinator' OR submitter.lga_id IS DISTINCT FROM l.id
      THEN 'profile_not_assigned_to_source_lga' ELSE NULL END
  FROM public.working_day_records w
  JOIN public.lgas l ON l.id = w.lga_id
  JOIN public.profiles submitter ON submitter.id = w.submitted_by
  LEFT JOIN public.monthly_lc_timesheet_lines line
    ON line.timesheet_id = target_id AND line.lga_id = l.id AND line.lga_coordinator_id = submitter.id
  WHERE w.working_date >= p_month AND w.working_date < (p_month + interval '1 month')::date;

  UPDATE public.monthly_lc_timesheets
  SET status = 'submitted', submitted_by = auth.uid(), submitted_at = now(),
      source_fingerprint = actual_fingerprint, state_directory_snapshot = state_snapshot
  WHERE id = target_id;

  INSERT INTO public.monthly_lc_timesheet_events(timesheet_id, action, actor_id)
    VALUES (target_id, 'submitted', auth.uid());
  RETURN target_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.dpm_monthly_timesheet_list()
RETURNS TABLE (
  timesheet_id uuid, reporting_month date, version_number integer, status text,
  prepared_by uuid, prepared_by_name text, submitted_at timestamptz,
  reviewed_by uuid, reviewed_at timestamptz, decision_note text, event_history jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' SET row_security = off
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.current_app_role()::text <> 'dpm' THEN
    RAISE EXCEPTION 'DPM access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT t.id, t.reporting_month, t.version_number, t.status, t.prepared_by,
    p.full_name, t.submitted_at, t.reviewed_by, t.reviewed_at, t.decision_note,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('action', e.action, 'actor_id', e.actor_id, 'note', e.note, 'occurred_at', e.occurred_at) ORDER BY e.occurred_at)
      FROM public.monthly_lc_timesheet_events e WHERE e.timesheet_id = t.id), '[]'::jsonb)
  FROM public.monthly_lc_timesheets t JOIN public.profiles p ON p.id = t.prepared_by
  ORDER BY t.reporting_month DESC, t.version_number DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.boss_monthly_timesheet_list()
RETURNS TABLE (
  timesheet_id uuid, reporting_month date, version_number integer, status text,
  prepared_by uuid, prepared_by_name text, submitted_by uuid, submitted_by_name text,
  submitted_at timestamptz, reviewed_by uuid, reviewed_by_name text,
  reviewed_at timestamptz, decision_note text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' SET row_security = off
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.current_app_role()::text <> 'boss' THEN
    RAISE EXCEPTION 'Boss access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT t.id, t.reporting_month, t.version_number, t.status, t.prepared_by,
    prepared.full_name, t.submitted_by, submitted.full_name, t.submitted_at,
    t.reviewed_by, reviewer.full_name, t.reviewed_at, t.decision_note
  FROM public.monthly_lc_timesheets t
  JOIN public.profiles prepared ON prepared.id = t.prepared_by
  LEFT JOIN public.profiles submitted ON submitted.id = t.submitted_by
  LEFT JOIN public.profiles reviewer ON reviewer.id = t.reviewed_by
  WHERE t.status IN ('submitted','approved','rejected')
  ORDER BY t.reporting_month DESC, t.version_number DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.boss_monthly_timesheet_details(p_timesheet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' SET row_security = off
AS $function$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR public.current_app_role()::text <> 'boss' THEN
    RAISE EXCEPTION 'Boss access required' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'timesheet', to_jsonb(t) || jsonb_build_object('timesheet_id', t.id, 'prepared_by_name', prepared.full_name, 'submitted_by_name', submitted.full_name, 'reviewed_by_name', reviewer.full_name),
    'lines', COALESCE((SELECT jsonb_agg(to_jsonb(line) ORDER BY line.state_name_snapshot, line.lga_name_snapshot, line.lga_coordinator_name_snapshot)
      FROM public.monthly_lc_timesheet_lines line WHERE line.timesheet_id = t.id), '[]'::jsonb),
    'sources', COALESCE((SELECT jsonb_agg(to_jsonb(source) ORDER BY source.state_id, source.lga_id, source.working_date, source.working_day_record_id)
      FROM public.monthly_lc_timesheet_sources source WHERE source.timesheet_id = t.id), '[]'::jsonb),
    'events', COALESCE((SELECT jsonb_agg(jsonb_build_object('action', event.action, 'actor_id', event.actor_id, 'actor_name', actor.full_name, 'note', event.note, 'occurred_at', event.occurred_at) ORDER BY event.occurred_at)
      FROM public.monthly_lc_timesheet_events event JOIN public.profiles actor ON actor.id = event.actor_id WHERE event.timesheet_id = t.id), '[]'::jsonb)
  ) INTO result
  FROM public.monthly_lc_timesheets t
  JOIN public.profiles prepared ON prepared.id = t.prepared_by
  LEFT JOIN public.profiles submitted ON submitted.id = t.submitted_by
  LEFT JOIN public.profiles reviewer ON reviewer.id = t.reviewed_by
  WHERE t.id = p_timesheet_id AND t.status IN ('submitted','approved','rejected');
  IF result IS NULL THEN RAISE EXCEPTION 'Submitted timesheet not found' USING ERRCODE = 'P0002'; END IF;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.boss_decide_monthly_timesheet(
  p_timesheet_id uuid, p_decision text, p_note text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET row_security = off
AS $function$
DECLARE current_status text;
BEGIN
  IF auth.uid() IS NULL OR public.current_app_role()::text <> 'boss' THEN
    RAISE EXCEPTION 'Boss access required' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('approved','rejected') OR p_note IS NULL OR length(trim(p_note)) < 3 THEN
    RAISE EXCEPTION 'Choose approve or reject and provide a decision note of at least 3 characters.' USING ERRCODE = '22023';
  END IF;
  SELECT t.status INTO current_status FROM public.monthly_lc_timesheets t WHERE t.id = p_timesheet_id FOR UPDATE;
  IF NOT FOUND OR current_status <> 'submitted' THEN
    RAISE EXCEPTION 'Only a submitted timesheet can receive one decision.' USING ERRCODE = '55000';
  END IF;
  UPDATE public.monthly_lc_timesheets
    SET status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(), decision_note = trim(p_note)
    WHERE id = p_timesheet_id;
  INSERT INTO public.monthly_lc_timesheet_events(timesheet_id, action, actor_id, note)
    VALUES (p_timesheet_id, p_decision, auth.uid(), trim(p_note));
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_monthly_lc_timesheet_header() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_monthly_lc_timesheet_snapshot() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_monthly_lc_timesheet_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dpm_monthly_timesheet_preview(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dpm_submit_monthly_timesheet(date,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dpm_monthly_timesheet_list() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.boss_monthly_timesheet_list() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.boss_monthly_timesheet_details(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.boss_decide_monthly_timesheet(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dpm_monthly_timesheet_preview(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dpm_submit_monthly_timesheet(date,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dpm_monthly_timesheet_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.boss_monthly_timesheet_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.boss_monthly_timesheet_details(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.boss_decide_monthly_timesheet(uuid,text,text) TO authenticated;
