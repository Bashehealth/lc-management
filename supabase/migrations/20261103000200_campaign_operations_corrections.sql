-- eHealth LC Manager: Campaign Operations Corrections
-- Apply AFTER 20261103000100_campaign_operations.sql.
-- Additive hardening: preserves original submissions and records revisions/reviews.

-- 1. Ensure every existing LGA has its own campaign settings row.
INSERT INTO public.campaign_settings (lga_id)
SELECT id FROM public.lgas
ON CONFLICT (lga_id) DO NOTHING;

-- 2. Campaign settings: only supervisors may insert/update; no client deletes.
DROP POLICY IF EXISTS campaign_settings_supervisor_write
ON public.campaign_settings;

CREATE POLICY campaign_settings_supervisor_insert
ON public.campaign_settings
FOR INSERT TO authenticated
WITH CHECK (public.is_supervisor());

CREATE POLICY campaign_settings_supervisor_update
ON public.campaign_settings
FOR UPDATE TO authenticated
USING (public.is_supervisor())
WITH CHECK (public.is_supervisor());

CREATE OR REPLACE FUNCTION public.enforce_campaign_settings_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_supervisor() OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Only an authenticated State Coordinator or Senior Supervisor may change campaign settings'
      USING ERRCODE = '42501';
  END IF;

  NEW.updated_by := auth.uid();
  IF TG_OP = 'UPDATE' THEN
    NEW.id := OLD.id;
    NEW.lga_id := OLD.lga_id;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS campaign_settings_actor_enforce
ON public.campaign_settings;
CREATE TRIGGER campaign_settings_actor_enforce
BEFORE INSERT OR UPDATE ON public.campaign_settings
FOR EACH ROW EXECUTE FUNCTION public.enforce_campaign_settings_actor();

-- 3. Check-in date must be derived from the LGA's configured timezone.
CREATE OR REPLACE FUNCTION public.enforce_campaign_checkin_time()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lga_timezone text;
  is_enabled boolean;
  profile_role public.app_role;
  profile_lga uuid;
BEGIN
  SELECT timezone, checkin_enabled
    INTO lga_timezone, is_enabled
  FROM public.campaign_settings
  WHERE lga_id = NEW.lga_id;

  IF lga_timezone IS NULL THEN
    RAISE EXCEPTION 'Campaign settings are missing for this LGA'
      USING ERRCODE = '23514';
  END IF;

  IF NOT is_enabled THEN
    RAISE EXCEPTION 'Campaign check-ins are disabled for this LGA'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_timezone_names WHERE name = lga_timezone
  ) THEN
    RAISE EXCEPTION 'Invalid LGA timezone configuration'
      USING ERRCODE = '22023';
  END IF;

  SELECT role, lga_id INTO profile_role, profile_lga
  FROM public.profiles
  WHERE id = auth.uid();

  IF profile_role <> 'lga_coordinator'
     OR profile_lga IS DISTINCT FROM NEW.lga_id
     OR NEW.submitted_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the assigned LGA Coordinator may submit the LGA check-in'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.checkin_date IS DISTINCT FROM
     (NEW.checked_in_at AT TIME ZONE lga_timezone)::date THEN
    RAISE EXCEPTION 'Check-in date must match the timestamp in the LGA timezone (%)', lga_timezone
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS campaign_checkin_time_enforce
ON public.campaign_checkins;
CREATE TRIGGER campaign_checkin_time_enforce
BEFORE INSERT OR UPDATE ON public.campaign_checkins
FOR EACH ROW EXECUTE FUNCTION public.enforce_campaign_checkin_time();

-- 4. Device progress is submitted by the assigned LGA Coordinator only.
DROP POLICY IF EXISTS device_progress_create
ON public.campaign_device_progress;

CREATE POLICY device_progress_create
ON public.campaign_device_progress
FOR INSERT TO authenticated
WITH CHECK (
  public.current_app_role() = 'lga_coordinator'
  AND submitted_by = auth.uid()
  AND public.can_access_lga(lga_id)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'lga_coordinator'
      AND p.lga_id = campaign_device_progress.lga_id
  )
);

-- 5. Supportive supervision visits may be entered by an LGA Coordinator
-- for their own LGA, or by SC/Senior Supervisor for an LGA they supervise.
CREATE OR REPLACE FUNCTION public.enforce_supervision_visit_submitter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role public.app_role;
  actor_lga uuid;
BEGIN
  SELECT role, lga_id INTO actor_role, actor_lga
  FROM public.profiles
  WHERE id = auth.uid();

  IF NEW.submitted_by IS DISTINCT FROM auth.uid() OR actor_role IS NULL THEN
    RAISE EXCEPTION 'Visit submitter must be the authenticated profile'
      USING ERRCODE = '42501';
  END IF;

  IF actor_role = 'lga_coordinator' AND actor_lga IS DISTINCT FROM NEW.lga_id THEN
    RAISE EXCEPTION 'An LGA Coordinator may submit visits only for their assigned LGA'
      USING ERRCODE = '42501';
  ELSIF actor_role NOT IN ('lga_coordinator', 'state_coordinator', 'senior_supervisor') THEN
    RAISE EXCEPTION 'This role cannot submit supportive-supervision visits'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS supervision_visit_submitter_enforce
ON public.supportive_supervision_visits;
CREATE TRIGGER supervision_visit_submitter_enforce
BEFORE INSERT ON public.supportive_supervision_visits
FOR EACH ROW EXECUTE FUNCTION public.enforce_supervision_visit_submitter();

-- 6. Append-only supportive-supervision review history.
CREATE TABLE public.supportive_supervision_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL
    REFERENCES public.supportive_supervision_visits(id) ON DELETE RESTRICT,
  lga_id uuid NOT NULL REFERENCES public.lgas(id),
  reviewer_id uuid NOT NULL REFERENCES public.profiles(id),
  review_status text NOT NULL
    CHECK (review_status IN ('accepted', 'needs_follow_up', 'returned_for_revision')),
  review_note text NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX supervision_reviews_visit_date_idx
ON public.supportive_supervision_reviews (visit_id, reviewed_at DESC);

CREATE OR REPLACE FUNCTION public.enforce_supervision_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  visit_lga uuid;
BEGIN
  IF NOT public.is_supervisor() OR auth.uid() IS NULL
     OR NEW.reviewer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only an authenticated State Coordinator or Senior Supervisor may review a visit'
      USING ERRCODE = '42501';
  END IF;

  SELECT lga_id INTO visit_lga
  FROM public.supportive_supervision_visits
  WHERE id = NEW.visit_id;

  IF visit_lga IS NULL OR visit_lga IS DISTINCT FROM NEW.lga_id THEN
    RAISE EXCEPTION 'Review and visit must belong to the same LGA'
      USING ERRCODE = '23514';
  END IF;

  IF length(trim(NEW.review_note)) = 0 THEN
    RAISE EXCEPTION 'A review note is required'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER supervision_review_enforce
BEFORE INSERT ON public.supportive_supervision_reviews
FOR EACH ROW EXECUTE FUNCTION public.enforce_supervision_review();

ALTER TABLE public.supportive_supervision_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY supervision_reviews_read
ON public.supportive_supervision_reviews
FOR SELECT TO authenticated
USING (public.can_access_lga(lga_id));

CREATE POLICY supervision_reviews_supervisor_insert
ON public.supportive_supervision_reviews
FOR INSERT TO authenticated
WITH CHECK (
  public.is_supervisor()
  AND reviewer_id = auth.uid()
);

REVOKE UPDATE, DELETE ON public.supportive_supervision_reviews
FROM anon, authenticated;

-- 7. Append-only readiness report corrections. Original report is never overwritten.
CREATE TABLE public.campaign_readiness_report_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL
    REFERENCES public.campaign_readiness_reports(id) ON DELETE RESTRICT,
  lga_id uuid NOT NULL REFERENCES public.lgas(id),
  revision_number integer NOT NULL CHECK (revision_number > 0),
  correction_reason text NOT NULL,
  total_teams integer NOT NULL CHECK (total_teams >= 0),
  gts_clear_reinstall_total integer NOT NULL CHECK (gts_clear_reinstall_total >= 0),
  gts_pending integer NOT NULL CHECK (gts_pending >= 0),
  fionet_installed_total integer NOT NULL CHECK (fionet_installed_total >= 0),
  fionet_pending integer NOT NULL CHECK (fionet_pending >= 0),
  team_codes_populated integer NOT NULL CHECK (team_codes_populated >= 0),
  submitted_by uuid NOT NULL REFERENCES public.profiles(id),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, revision_number)
);

CREATE INDEX readiness_revision_report_idx
ON public.campaign_readiness_report_revisions (report_id, revision_number DESC);

CREATE OR REPLACE FUNCTION public.enforce_readiness_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  report_lga uuid;
  actor_lga uuid;
  actor_role public.app_role;
  next_revision integer;
BEGIN
  SELECT lga_id INTO report_lga
  FROM public.campaign_readiness_reports
  WHERE id = NEW.report_id;

  SELECT role, lga_id INTO actor_role, actor_lga
  FROM public.profiles
  WHERE id = auth.uid();

  IF report_lga IS NULL OR report_lga IS DISTINCT FROM NEW.lga_id THEN
    RAISE EXCEPTION 'Revision and original readiness report must belong to the same LGA'
      USING ERRCODE = '23514';
  END IF;

  IF actor_role <> 'lga_coordinator'
     OR actor_lga IS DISTINCT FROM NEW.lga_id
     OR NEW.submitted_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the assigned LGA Coordinator may correct a readiness report'
      USING ERRCODE = '42501';
  END IF;

  IF length(trim(NEW.correction_reason)) = 0 THEN
    RAISE EXCEPTION 'A correction reason is required'
      USING ERRCODE = '23514';
  END IF;

  -- Serialize revisions for the same report and assign the sequence server-side.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.report_id::text, 0));

  SELECT COALESCE(MAX(revision_number), 0) + 1
  INTO next_revision
  FROM public.campaign_readiness_report_revisions
  WHERE report_id = NEW.report_id;

  NEW.revision_number := next_revision;

  RETURN NEW;
END;
$$;

CREATE TRIGGER readiness_revision_enforce
BEFORE INSERT ON public.campaign_readiness_report_revisions
FOR EACH ROW EXECUTE FUNCTION public.enforce_readiness_revision();

ALTER TABLE public.campaign_readiness_report_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY readiness_revisions_read
ON public.campaign_readiness_report_revisions
FOR SELECT TO authenticated
USING (public.can_access_lga(lga_id));

CREATE POLICY readiness_revisions_lga_insert
ON public.campaign_readiness_report_revisions
FOR INSERT TO authenticated
WITH CHECK (
  public.current_app_role() = 'lga_coordinator'
  AND submitted_by = auth.uid()
  AND public.can_access_lga(lga_id)
);

REVOKE UPDATE, DELETE ON public.campaign_readiness_report_revisions
FROM anon, authenticated;

-- 8. Preserve both old and revised movement details when an LGA resubmits.
CREATE TABLE public.movement_request_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_request_id uuid NOT NULL
    REFERENCES public.movement_requests(id) ON DELETE RESTRICT,
  lga_id uuid NOT NULL REFERENCES public.lgas(id),
  revised_by uuid NOT NULL REFERENCES public.profiles(id),
  previous_reason text NOT NULL,
  previous_destination text NOT NULL,
  previous_departure_at timestamptz NOT NULL,
  previous_expected_return_at timestamptz NOT NULL,
  revised_reason text NOT NULL,
  revised_destination text NOT NULL,
  revised_departure_at timestamptz NOT NULL,
  revised_expected_return_at timestamptz NOT NULL,
  revised_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX movement_request_revisions_request_idx
ON public.movement_request_revisions (movement_request_id, revised_at DESC);

CREATE OR REPLACE FUNCTION public.record_movement_request_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'returned_to_lga'
     AND NEW.status = 'pending_state_review'
     AND (
       NEW.reason IS DISTINCT FROM OLD.reason
       OR NEW.destination IS DISTINCT FROM OLD.destination
       OR NEW.departure_at IS DISTINCT FROM OLD.departure_at
       OR NEW.expected_return_at IS DISTINCT FROM OLD.expected_return_at
     ) THEN
    INSERT INTO public.movement_request_revisions (
      movement_request_id, lga_id, revised_by,
      previous_reason, previous_destination,
      previous_departure_at, previous_expected_return_at,
      revised_reason, revised_destination,
      revised_departure_at, revised_expected_return_at
    ) VALUES (
      NEW.id, NEW.lga_id, auth.uid(),
      OLD.reason, OLD.destination,
      OLD.departure_at, OLD.expected_return_at,
      NEW.reason, NEW.destination,
      NEW.departure_at, NEW.expected_return_at
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER movement_request_revision_record
AFTER UPDATE ON public.movement_requests
FOR EACH ROW EXECUTE FUNCTION public.record_movement_request_revision();

ALTER TABLE public.movement_request_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY movement_request_revisions_read
ON public.movement_request_revisions
FOR SELECT TO authenticated
USING (
  public.current_app_role() IN ('state_coordinator', 'senior_supervisor')
  OR (
    public.current_app_role() = 'lga_coordinator'
    AND revised_by = auth.uid()
    AND public.can_access_lga(lga_id)
  )
  OR (
    public.current_app_role() = 'management_approver'
    AND EXISTS (
      SELECT 1 FROM public.movement_requests mr
      WHERE mr.id = movement_request_id
        AND mr.status IN ('pending_management', 'approved', 'rejected')
    )
  )
);

REVOKE INSERT, UPDATE, DELETE ON public.movement_request_revisions
FROM anon, authenticated;

-- 9. Scope movement history to the original request owner for LGA users.
DROP POLICY IF EXISTS movement_history_read
ON public.movement_request_history;

CREATE POLICY movement_history_read
ON public.movement_request_history
FOR SELECT TO authenticated
USING (
  (
    public.current_app_role() = 'lga_coordinator'
    AND EXISTS (
      SELECT 1 FROM public.movement_requests mr
      WHERE mr.id = movement_request_id
        AND mr.lga_id = movement_request_history.lga_id
        AND mr.requested_by = auth.uid()
    )
  )
  OR public.current_app_role() IN ('state_coordinator', 'senior_supervisor')
  OR (
    public.current_app_role() = 'management_approver'
    AND EXISTS (
      SELECT 1 FROM public.movement_requests mr
      WHERE mr.id = movement_request_id
        AND mr.status IN ('pending_management', 'approved', 'rejected')
    )
  )
);

-- 10. Once evidence is reviewed, freeze the entire evidence record.
CREATE OR REPLACE FUNCTION public.enforce_campaign_evidence_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_non_review jsonb;
  new_non_review jsonb;
BEGIN
  IF OLD.reviewed_at IS NOT NULL THEN
    IF to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
      RAISE EXCEPTION 'Evidence is immutable after review; upload a new evidence record for corrections'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  old_non_review := to_jsonb(OLD)
    - 'reviewed_by' - 'reviewed_at' - 'review_note';
  new_non_review := to_jsonb(NEW)
    - 'reviewed_by' - 'reviewed_at' - 'review_note';

  IF new_non_review IS DISTINCT FROM old_non_review THEN
    RAISE EXCEPTION 'Evidence metadata cannot be edited; upload a corrected evidence record'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR NEW.review_note IS DISTINCT FROM OLD.review_note THEN
    IF NOT public.is_supervisor()
       OR auth.uid() IS NULL
       OR NEW.reviewed_by IS DISTINCT FROM auth.uid()
       OR NEW.reviewed_at IS NULL
       OR OLD.reviewed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Only an authenticated supervisor may perform the first evidence review'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Evidence update must record a supervisor review'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- 11. Append-only protection for the new history tables.
CREATE OR REPLACE FUNCTION public.prevent_campaign_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Campaign history is append-only; create a new event instead'
    USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER supervision_reviews_no_change
BEFORE UPDATE OR DELETE ON public.supportive_supervision_reviews
FOR EACH ROW EXECUTE FUNCTION public.prevent_campaign_history_mutation();

CREATE TRIGGER readiness_revisions_no_change
BEFORE UPDATE OR DELETE ON public.campaign_readiness_report_revisions
FOR EACH ROW EXECUTE FUNCTION public.prevent_campaign_history_mutation();

CREATE TRIGGER movement_revisions_no_change
BEFORE UPDATE OR DELETE ON public.movement_request_revisions
FOR EACH ROW EXECUTE FUNCTION public.prevent_campaign_history_mutation();

REVOKE ALL ON FUNCTION public.enforce_campaign_settings_actor()
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_campaign_checkin_time()
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_supervision_visit_submitter()
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_supervision_review()
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_readiness_revision()
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_movement_request_revision()
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_campaign_history_mutation()
FROM PUBLIC, anon, authenticated;

-- End campaign operations corrections.
