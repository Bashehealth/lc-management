-- eHealth LC Manager: Campaign Operations
-- Additive migration. Does not rewrite existing migrations.
-- Requires 20261103000000_add_management_approver_role.sql first.

-- 1. Allow management profiles without an LGA assignment.
ALTER TABLE public.profiles
  DROP CONSTRAINT profile_lga_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profile_lga_role_check CHECK (
    (role = 'lga_coordinator' AND lga_id IS NOT NULL)
    OR
    (role IN ('state_coordinator', 'senior_supervisor', 'management_approver')
      AND lga_id IS NULL)
  );

-- 2. Configurable campaign check-in policy.
CREATE TABLE public.campaign_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lga_id uuid NOT NULL UNIQUE REFERENCES public.lgas(id),
  checkin_deadline time NOT NULL DEFAULT '10:30',
  timezone text NOT NULL DEFAULT 'Africa/Lagos',
  checkin_enabled boolean NOT NULL DEFAULT true,
  evidence_retention_days integer NOT NULL DEFAULT 365
    CHECK (evidence_retention_days BETWEEN 1 AND 3650),
  updated_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Daily LGA presence check-ins.
CREATE TABLE public.campaign_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lga_id uuid NOT NULL REFERENCES public.lgas(id),
  checkin_date date NOT NULL DEFAULT CURRENT_DATE,
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  latitude numeric(10,7) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric(10,7) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_meters numeric(10,2) CHECK (accuracy_meters >= 0),
  location_source text NOT NULL DEFAULT 'odk'
    CHECK (location_source IN ('odk', 'manual')),
  reported_location text,
  exception_note text,
  submitted_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lga_id, checkin_date)
);

-- 4. Morning and evening campaign readiness.
CREATE TABLE public.campaign_readiness_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lga_id uuid NOT NULL REFERENCES public.lgas(id),
  report_date date NOT NULL DEFAULT CURRENT_DATE,
  reporting_period text NOT NULL
    CHECK (reporting_period IN ('morning', 'evening')),
  total_teams integer NOT NULL DEFAULT 0 CHECK (total_teams >= 0),
  gts_clear_reinstall_total integer NOT NULL DEFAULT 0
    CHECK (gts_clear_reinstall_total >= 0),
  gts_pending integer NOT NULL DEFAULT 0 CHECK (gts_pending >= 0),
  fionet_installed_total integer NOT NULL DEFAULT 0
    CHECK (fionet_installed_total >= 0),
  fionet_pending integer NOT NULL DEFAULT 0 CHECK (fionet_pending >= 0),
  team_codes_populated integer NOT NULL DEFAULT 0
    CHECK (team_codes_populated >= 0),
  notes text,
  submitted_by uuid NOT NULL REFERENCES public.profiles(id),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lga_id, report_date, reporting_period)
);

-- 5. Device installation and progress updates.
CREATE TABLE public.campaign_device_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lga_id uuid NOT NULL REFERENCES public.lgas(id),
  task_id uuid REFERENCES public.tasks(id) ON DELETE RESTRICT,
  activity_category text NOT NULL,
  device_name text NOT NULL,
  expected_quantity integer NOT NULL CHECK (expected_quantity >= 0),
  completed_quantity integer NOT NULL CHECK (completed_quantity >= 0),
  pending_quantity integer NOT NULL CHECK (pending_quantity >= 0),
  progress_description text,
  blockers text,
  reported_at timestamptz NOT NULL DEFAULT now(),
  submitted_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (completed_quantity + pending_quantity = expected_quantity)
);

-- 6. Supportive supervision visits.
CREATE TABLE public.supportive_supervision_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lga_id uuid NOT NULL REFERENCES public.lgas(id),
  task_id uuid REFERENCES public.tasks(id) ON DELETE RESTRICT,
  campaign_name text NOT NULL,
  ward text NOT NULL,
  settlement text NOT NULL,
  team_code text NOT NULL,
  visited_at timestamptz NOT NULL DEFAULT now(),
  latitude numeric(10,7) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric(10,7) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_meters numeric(10,2) CHECK (accuracy_meters >= 0),
  observations text NOT NULL,
  submitted_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 7. Campaign evidence. A record belongs to one task or one visit.
CREATE TABLE public.campaign_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lga_id uuid NOT NULL REFERENCES public.lgas(id),
  task_id uuid REFERENCES public.tasks(id) ON DELETE RESTRICT,
  supervision_visit_id uuid REFERENCES public.supportive_supervision_visits(id)
    ON DELETE RESTRICT,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  evidence_type text NOT NULL
    CHECK (evidence_type IN ('photo', 'video', 'document')),
  captured_at timestamptz,
  latitude numeric(10,7) CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric(10,7) CHECK (longitude BETWEEN -180 AND 180),
  accuracy_meters numeric(10,2) CHECK (accuracy_meters >= 0),
  description text,
  uploaded_by uuid NOT NULL REFERENCES public.profiles(id),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  review_note text,
  retention_until date,
  CHECK (num_nonnulls(task_id, supervision_visit_id) = 1),
  CHECK ((reviewed_by IS NULL) = (reviewed_at IS NULL))
);

-- 8. Movement requests: LC -> SC -> Management.
CREATE TABLE public.movement_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lga_id uuid NOT NULL REFERENCES public.lgas(id),
  requested_by uuid NOT NULL REFERENCES public.profiles(id),
  reason text NOT NULL,
  destination text NOT NULL,
  departure_at timestamptz NOT NULL,
  expected_return_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending_state_review'
    CHECK (status IN (
      'pending_state_review',
      'returned_to_lga',
      'pending_management',
      'approved',
      'rejected'
    )),
  state_reviewed_by uuid REFERENCES public.profiles(id),
  state_reviewed_at timestamptz,
  state_recommendation text,
  management_decided_by uuid REFERENCES public.profiles(id),
  management_decided_at timestamptz,
  management_decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expected_return_at > departure_at),
  CHECK (
    (status NOT IN ('pending_management', 'approved', 'rejected'))
    OR
    (state_reviewed_by IS NOT NULL AND state_reviewed_at IS NOT NULL)
  ),
  CHECK (
    (status NOT IN ('approved', 'rejected'))
    OR
    (management_decided_by IS NOT NULL AND management_decided_at IS NOT NULL)
  )
);

-- 9. Enforce movement approval authority and immutable request details.
CREATE OR REPLACE FUNCTION public.enforce_movement_request_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role public.app_role;
BEGIN
  SELECT role INTO actor_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF TG_OP = 'INSERT' THEN
    IF actor_role <> 'lga_coordinator'
       OR NEW.requested_by <> auth.uid()
       OR NOT public.can_access_lga(NEW.lga_id) THEN
      RAISE EXCEPTION 'Only the assigned LGA Coordinator may submit a movement request'
        USING ERRCODE = '42501';
    END IF;

    NEW.status := 'pending_state_review';
    RETURN NEW;
  END IF;

  IF NEW.lga_id IS DISTINCT FROM OLD.lga_id
     OR NEW.requested_by IS DISTINCT FROM OLD.requested_by
     OR NEW.reason IS DISTINCT FROM OLD.reason
     OR NEW.destination IS DISTINCT FROM OLD.destination
     OR NEW.departure_at IS DISTINCT FROM OLD.departure_at
     OR NEW.expected_return_at IS DISTINCT FROM OLD.expected_return_at THEN
    RAISE EXCEPTION 'Movement request details cannot be changed after submission'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    IF actor_role NOT IN ('state_coordinator', 'senior_supervisor', 'management_approver') THEN
      RAISE EXCEPTION 'Only authorized reviewers may update movement requests'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IN ('pending_state_review', 'returned_to_lga')
     AND NEW.status IN ('pending_management', 'returned_to_lga') THEN
    IF actor_role <> 'state_coordinator'
       OR NEW.state_reviewed_by <> auth.uid()
       OR NEW.state_reviewed_at IS NULL THEN
      RAISE EXCEPTION 'Only the State Coordinator may review and forward movement requests'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'pending_management'
     AND NEW.status IN ('approved', 'rejected') THEN
    IF actor_role <> 'management_approver'
       OR NEW.management_decided_by <> auth.uid()
       OR NEW.management_decided_at IS NULL THEN
      RAISE EXCEPTION 'Only Management may make the final movement decision'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid movement request status transition'
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER movement_requests_enforce_workflow
BEFORE INSERT OR UPDATE ON public.movement_requests
FOR EACH ROW EXECUTE FUNCTION public.enforce_movement_request_workflow();

-- 10. Append-only audit history for campaign records.
CREATE TABLE public.campaign_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lga_id uuid REFERENCES public.lgas(id),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  actor_id uuid REFERENCES public.profiles(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  old_values jsonb,
  new_values jsonb
);

CREATE OR REPLACE FUNCTION public.audit_campaign_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_row jsonb;
  new_row jsonb;
  subject_id uuid;
  subject_lga_id uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_row := to_jsonb(OLD);
    subject_id := (old_row ->> 'id')::uuid;
    subject_lga_id := (old_row ->> 'lga_id')::uuid;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    new_row := to_jsonb(NEW);
    subject_id := (new_row ->> 'id')::uuid;
    subject_lga_id := (new_row ->> 'lga_id')::uuid;
  END IF;

  INSERT INTO public.campaign_audit_events (
    lga_id, entity_type, entity_id, action, actor_id, old_values, new_values
  )
  VALUES (
    subject_lga_id, TG_TABLE_NAME, subject_id, lower(TG_OP), auth.uid(),
    old_row, new_row
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

-- 11. Updated-at triggers.
CREATE TRIGGER campaign_settings_updated_at
BEFORE UPDATE ON public.campaign_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER movement_requests_updated_at
BEFORE UPDATE ON public.movement_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 12. Audit triggers.
CREATE TRIGGER campaign_checkins_audit
AFTER INSERT OR UPDATE OR DELETE ON public.campaign_checkins
FOR EACH ROW EXECUTE FUNCTION public.audit_campaign_mutation();

CREATE TRIGGER campaign_readiness_audit
AFTER INSERT OR UPDATE OR DELETE ON public.campaign_readiness_reports
FOR EACH ROW EXECUTE FUNCTION public.audit_campaign_mutation();

CREATE TRIGGER campaign_device_progress_audit
AFTER INSERT OR UPDATE OR DELETE ON public.campaign_device_progress
FOR EACH ROW EXECUTE FUNCTION public.audit_campaign_mutation();

CREATE TRIGGER supportive_supervision_audit
AFTER INSERT OR UPDATE OR DELETE ON public.supportive_supervision_visits
FOR EACH ROW EXECUTE FUNCTION public.audit_campaign_mutation();

CREATE TRIGGER campaign_evidence_audit
AFTER INSERT OR UPDATE OR DELETE ON public.campaign_evidence
FOR EACH ROW EXECUTE FUNCTION public.audit_campaign_mutation();

CREATE TRIGGER movement_requests_audit
AFTER INSERT OR UPDATE OR DELETE ON public.movement_requests
FOR EACH ROW EXECUTE FUNCTION public.audit_campaign_mutation();

-- 13. Indexes.
CREATE INDEX campaign_checkins_lga_date_idx
  ON public.campaign_checkins (lga_id, checkin_date DESC);

CREATE INDEX campaign_readiness_lga_date_idx
  ON public.campaign_readiness_reports (lga_id, report_date DESC, reporting_period);

CREATE INDEX campaign_device_lga_date_idx
  ON public.campaign_device_progress (lga_id, reported_at DESC);

CREATE INDEX supervision_visits_lga_date_idx
  ON public.supportive_supervision_visits (lga_id, visited_at DESC);

CREATE INDEX campaign_evidence_lga_date_idx
  ON public.campaign_evidence (lga_id, uploaded_at DESC);

CREATE INDEX movement_requests_status_date_idx
  ON public.movement_requests (status, created_at DESC);

CREATE INDEX campaign_audit_lga_date_idx
  ON public.campaign_audit_events (lga_id, occurred_at DESC);

-- 14. Enable row-level security.
ALTER TABLE public.campaign_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_readiness_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_device_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supportive_supervision_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movement_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_audit_events ENABLE ROW LEVEL SECURITY;

-- 15. Campaign settings: supervisors manage; LGA users read their own settings.
CREATE POLICY campaign_settings_read
ON public.campaign_settings FOR SELECT TO authenticated
USING (public.can_access_lga(lga_id));

CREATE POLICY campaign_settings_supervisor_write
ON public.campaign_settings FOR ALL TO authenticated
USING (public.is_supervisor())
WITH CHECK (public.is_supervisor());

-- 16. LGA-scoped campaign access.
CREATE POLICY campaign_checkins_read
ON public.campaign_checkins FOR SELECT TO authenticated
USING (public.can_access_lga(lga_id));

CREATE POLICY campaign_checkins_create
ON public.campaign_checkins FOR INSERT TO authenticated
WITH CHECK (
  public.can_access_lga(lga_id)
  AND submitted_by = auth.uid()
  AND public.current_app_role() = 'lga_coordinator'
);

CREATE POLICY readiness_read
ON public.campaign_readiness_reports FOR SELECT TO authenticated
USING (public.can_access_lga(lga_id));

CREATE POLICY readiness_create
ON public.campaign_readiness_reports FOR INSERT TO authenticated
WITH CHECK (
  public.can_access_lga(lga_id)
  AND submitted_by = auth.uid()
  AND public.current_app_role() = 'lga_coordinator'
);

CREATE POLICY device_progress_read
ON public.campaign_device_progress FOR SELECT TO authenticated
USING (public.can_access_lga(lga_id));

CREATE POLICY device_progress_create
ON public.campaign_device_progress FOR INSERT TO authenticated
WITH CHECK (
  public.can_access_lga(lga_id)
  AND submitted_by = auth.uid()
);

CREATE POLICY supervision_visits_read
ON public.supportive_supervision_visits FOR SELECT TO authenticated
USING (public.can_access_lga(lga_id));

CREATE POLICY supervision_visits_create
ON public.supportive_supervision_visits FOR INSERT TO authenticated
WITH CHECK (
  public.can_access_lga(lga_id)
  AND submitted_by = auth.uid()
);

CREATE POLICY campaign_evidence_read
ON public.campaign_evidence FOR SELECT TO authenticated
USING (public.can_access_lga(lga_id));

CREATE POLICY campaign_evidence_create
ON public.campaign_evidence FOR INSERT TO authenticated
WITH CHECK (
  public.can_access_lga(lga_id)
  AND uploaded_by = auth.uid()
  AND reviewed_by IS NULL
  AND reviewed_at IS NULL
  AND review_note IS NULL
);

CREATE POLICY campaign_evidence_supervisor_review
ON public.campaign_evidence FOR UPDATE TO authenticated
USING (public.is_supervisor() AND public.can_access_lga(lga_id))
WITH CHECK (public.is_supervisor() AND public.can_access_lga(lga_id));

-- 17. Movement request permissions.
CREATE POLICY movement_requests_read
ON public.movement_requests FOR SELECT TO authenticated
USING (
  (public.current_app_role() = 'lga_coordinator' AND public.can_access_lga(lga_id))
  OR public.current_app_role() IN ('state_coordinator', 'senior_supervisor')
  OR (
    public.current_app_role() = 'management_approver'
    AND status IN ('pending_management', 'approved', 'rejected')
  )
);

CREATE POLICY movement_requests_create
ON public.movement_requests FOR INSERT TO authenticated
WITH CHECK (
  public.current_app_role() = 'lga_coordinator'
  AND public.can_access_lga(lga_id)
  AND requested_by = auth.uid()
);

CREATE POLICY movement_requests_review
ON public.movement_requests FOR UPDATE TO authenticated
USING (
  public.current_app_role() IN ('state_coordinator', 'management_approver')
)
WITH CHECK (
  public.current_app_role() IN ('state_coordinator', 'management_approver')
);

-- 18. Campaign audit history is read-only to authenticated users.
CREATE POLICY campaign_audit_read
ON public.campaign_audit_events FOR SELECT TO authenticated
USING (
  public.is_supervisor()
  OR (lga_id IS NOT NULL AND public.can_access_lga(lga_id))
);

-- No direct client writes to campaign audit history.
REVOKE INSERT, UPDATE, DELETE ON public.campaign_audit_events
FROM anon, authenticated;

-- Internal trigger functions are not client-callable.
REVOKE ALL ON FUNCTION public.enforce_movement_request_workflow()
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.audit_campaign_mutation()
FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 19. CAMPAIGN SECURITY HARDENING
-- ============================================================

-- Replace the permissive movement update policy.
DROP POLICY IF EXISTS movement_requests_review
ON public.movement_requests;

CREATE POLICY movement_requests_review
ON public.movement_requests
FOR UPDATE TO authenticated
USING (
  (
    public.current_app_role() = 'state_coordinator'
    AND status IN ('pending_state_review', 'returned_to_lga')
  )
  OR
  (
    public.current_app_role() = 'management_approver'
    AND status = 'pending_management'
  )
)
WITH CHECK (
  (
    public.current_app_role() = 'state_coordinator'
    AND status IN ('pending_management', 'returned_to_lga')
  )
  OR
  (
    public.current_app_role() = 'management_approver'
    AND status IN ('approved', 'rejected')
  )
);

-- Strictly enforce each movement approval stage.
CREATE OR REPLACE FUNCTION public.enforce_movement_request_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role public.app_role;
BEGIN
  SELECT role INTO actor_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF actor_role IS NULL THEN
    RAISE EXCEPTION 'Authenticated profile required'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF actor_role <> 'lga_coordinator'
       OR NEW.requested_by <> auth.uid()
       OR NOT public.can_access_lga(NEW.lga_id)
       OR NEW.status <> 'pending_state_review'
       OR NEW.state_reviewed_by IS NOT NULL
       OR NEW.state_reviewed_at IS NOT NULL
       OR NEW.state_recommendation IS NOT NULL
       OR NEW.management_decided_by IS NOT NULL
       OR NEW.management_decided_at IS NOT NULL
       OR NEW.management_decision_note IS NOT NULL THEN
      RAISE EXCEPTION 'Invalid movement request submission'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  -- No reviewer may change the identity or ownership of a request.
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.lga_id IS DISTINCT FROM OLD.lga_id
     OR NEW.requested_by IS DISTINCT FROM OLD.requested_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Movement request ownership is immutable'
      USING ERRCODE = '42501';
  END IF;

  -- A returned request may be revised and resubmitted by its owner.
  IF actor_role = 'lga_coordinator'
     AND OLD.status = 'returned_to_lga'
     AND NEW.status = 'pending_state_review' THEN

    IF OLD.requested_by <> auth.uid()
       OR NOT public.can_access_lga(OLD.lga_id)
       OR NEW.state_reviewed_by IS NOT NULL
       OR NEW.state_reviewed_at IS NOT NULL
       OR NEW.state_recommendation IS NOT NULL
       OR NEW.management_decided_by IS NOT NULL
       OR NEW.management_decided_at IS NOT NULL
       OR NEW.management_decision_note IS NOT NULL THEN
      RAISE EXCEPTION 'Only the original LGA Coordinator may revise and resubmit a returned request'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  -- State Coordinator: review, return, or forward.
  IF actor_role = 'state_coordinator'
     AND OLD.status IN ('pending_state_review', 'returned_to_lga')
     AND NEW.status IN ('pending_management', 'returned_to_lga') THEN

    IF NEW.reason IS DISTINCT FROM OLD.reason
       OR NEW.destination IS DISTINCT FROM OLD.destination
       OR NEW.departure_at IS DISTINCT FROM OLD.departure_at
       OR NEW.expected_return_at IS DISTINCT FROM OLD.expected_return_at
       OR NEW.management_decided_by IS DISTINCT FROM OLD.management_decided_by
       OR NEW.management_decided_at IS DISTINCT FROM OLD.management_decided_at
       OR NEW.management_decision_note IS DISTINCT FROM OLD.management_decision_note
       OR NEW.state_reviewed_by <> auth.uid()
       OR NEW.state_reviewed_at IS NULL
       OR NEW.state_recommendation IS NULL
       OR length(trim(NEW.state_recommendation)) = 0 THEN
      RAISE EXCEPTION 'Invalid State Coordinator review or forwarding operation'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  -- Management: final decision only.
  IF actor_role = 'management_approver'
     AND OLD.status = 'pending_management'
     AND NEW.status IN ('approved', 'rejected') THEN

    IF NEW.reason IS DISTINCT FROM OLD.reason
       OR NEW.destination IS DISTINCT FROM OLD.destination
       OR NEW.departure_at IS DISTINCT FROM OLD.departure_at
       OR NEW.expected_return_at IS DISTINCT FROM OLD.expected_return_at
       OR NEW.state_reviewed_by IS DISTINCT FROM OLD.state_reviewed_by
       OR NEW.state_reviewed_at IS DISTINCT FROM OLD.state_reviewed_at
       OR NEW.state_recommendation IS DISTINCT FROM OLD.state_recommendation
       OR NEW.management_decided_by <> auth.uid()
       OR NEW.management_decided_at IS NULL
       OR NEW.management_decision_note IS NULL
       OR length(trim(NEW.management_decision_note)) = 0 THEN
      RAISE EXCEPTION 'Invalid Management final decision'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Unauthorized or invalid movement request transition'
    USING ERRCODE = '42501';
END;
$$;

-- Prevent campaign records from referencing another LGA's task.
CREATE OR REPLACE FUNCTION public.enforce_campaign_task_lga()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  task_lga uuid;
  visit_lga uuid;
BEGIN
  IF NEW.task_id IS NOT NULL THEN
    SELECT lga_id INTO task_lga
    FROM public.tasks
    WHERE id = NEW.task_id;

    IF task_lga IS NULL OR task_lga <> NEW.lga_id THEN
      RAISE EXCEPTION 'Task and campaign record must belong to the same LGA'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'campaign_evidence'
     AND NEW.supervision_visit_id IS NOT NULL THEN

    SELECT lga_id INTO visit_lga
    FROM public.supportive_supervision_visits
    WHERE id = NEW.supervision_visit_id;

    IF visit_lga IS NULL OR visit_lga <> NEW.lga_id THEN
      RAISE EXCEPTION 'Evidence and supervision visit must belong to the same LGA'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER campaign_device_task_lga_check
BEFORE INSERT OR UPDATE ON public.campaign_device_progress
FOR EACH ROW EXECUTE FUNCTION public.enforce_campaign_task_lga();

CREATE TRIGGER supervision_task_lga_check
BEFORE INSERT OR UPDATE ON public.supportive_supervision_visits
FOR EACH ROW EXECUTE FUNCTION public.enforce_campaign_task_lga();

CREATE TRIGGER campaign_evidence_lga_check
BEFORE INSERT OR UPDATE ON public.campaign_evidence
FOR EACH ROW EXECUTE FUNCTION public.enforce_campaign_task_lga();

-- Evidence review must be performed by the authenticated supervisor.
CREATE OR REPLACE FUNCTION public.enforce_campaign_evidence_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.lga_id IS DISTINCT FROM OLD.lga_id
     OR NEW.task_id IS DISTINCT FROM OLD.task_id
     OR NEW.supervision_visit_id IS DISTINCT FROM OLD.supervision_visit_id
     OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
     OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by
     OR NEW.uploaded_at IS DISTINCT FROM OLD.uploaded_at THEN
    RAISE EXCEPTION 'Evidence ownership and storage reference are immutable'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR NEW.review_note IS DISTINCT FROM OLD.review_note THEN

    IF NOT public.is_supervisor()
       OR NEW.reviewed_by <> auth.uid()
       OR NEW.reviewed_at IS NULL THEN
      RAISE EXCEPTION 'Only an authenticated supervisor may review campaign evidence'
        USING ERRCODE = '42501';
    END IF;

    IF OLD.reviewed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Evidence review is immutable once recorded'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER campaign_evidence_review_enforce
BEFORE UPDATE ON public.campaign_evidence
FOR EACH ROW EXECUTE FUNCTION public.enforce_campaign_evidence_review();

-- Audit records must never be changed or deleted by application users.
CREATE OR REPLACE FUNCTION public.prevent_campaign_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Campaign audit history is append-only'
    USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER campaign_audit_no_update
BEFORE UPDATE OR DELETE ON public.campaign_audit_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_campaign_audit_mutation();

REVOKE ALL ON FUNCTION public.enforce_movement_request_workflow()
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.enforce_campaign_task_lga()
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.enforce_campaign_evidence_review()
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.prevent_campaign_audit_mutation()
FROM PUBLIC, anon, authenticated;

-- End campaign security hardening.

-- ============================================================
-- 20. MOVEMENT RESUBMISSION AND DECISION HISTORY
-- ============================================================

-- Allow the original LGA Coordinator to revise a returned request.
DROP POLICY IF EXISTS movement_requests_lga_resubmit
ON public.movement_requests;

CREATE POLICY movement_requests_lga_resubmit
ON public.movement_requests
FOR UPDATE TO authenticated
USING (
  public.current_app_role() = 'lga_coordinator'
  AND requested_by = auth.uid()
  AND public.can_access_lga(lga_id)
  AND status = 'returned_to_lga'
)
WITH CHECK (
  public.current_app_role() = 'lga_coordinator'
  AND requested_by = auth.uid()
  AND public.can_access_lga(lga_id)
  AND status = 'pending_state_review'
);

-- Separate, append-only movement decision history.
CREATE TABLE public.movement_request_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_request_id uuid NOT NULL
    REFERENCES public.movement_requests(id) ON DELETE RESTRICT,
  lga_id uuid NOT NULL REFERENCES public.lgas(id),
  previous_status text,
  new_status text NOT NULL,
  action text NOT NULL,
  actor_id uuid REFERENCES public.profiles(id),
  actor_role public.app_role,
  decision_note text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX movement_history_request_date_idx
ON public.movement_request_history
  (movement_request_id, occurred_at);

CREATE INDEX movement_history_lga_date_idx
ON public.movement_request_history
  (lga_id, occurred_at DESC);

-- Record every submission and status transition.
CREATE OR REPLACE FUNCTION public.record_movement_request_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role public.app_role;
  action_name text;
  note_text text;
BEGIN
  SELECT role INTO actor_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF TG_OP = 'INSERT' THEN
    action_name := 'submitted';
    note_text := NEW.reason;

    INSERT INTO public.movement_request_history (
      movement_request_id, lga_id, previous_status, new_status,
      action, actor_id, actor_role, decision_note
    )
    VALUES (
      NEW.id, NEW.lga_id, NULL, NEW.status,
      action_name, auth.uid(), actor_role, note_text
    );

    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    action_name := CASE NEW.status
      WHEN 'pending_state_review' THEN 'resubmitted'
      WHEN 'returned_to_lga' THEN 'returned'
      WHEN 'pending_management' THEN 'forwarded_to_management'
      WHEN 'approved' THEN 'approved'
      WHEN 'rejected' THEN 'rejected'
      ELSE 'status_changed'
    END;

    IF actor_role = 'state_coordinator' THEN
      note_text := NEW.state_recommendation;
    ELSIF actor_role = 'management_approver' THEN
      note_text := NEW.management_decision_note;
    ELSE
      note_text := 'Request revised and resubmitted';
    END IF;

    INSERT INTO public.movement_request_history (
      movement_request_id, lga_id, previous_status, new_status,
      action, actor_id, actor_role, decision_note
    )
    VALUES (
      NEW.id, NEW.lga_id, OLD.status, NEW.status,
      action_name, auth.uid(), actor_role, note_text
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER movement_request_history_record
AFTER INSERT OR UPDATE ON public.movement_requests
FOR EACH ROW
EXECUTE FUNCTION public.record_movement_request_history();

-- History visibility follows the request's role-based access.
ALTER TABLE public.movement_request_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY movement_history_read
ON public.movement_request_history
FOR SELECT TO authenticated
USING (
  (
    public.current_app_role() = 'lga_coordinator'
    AND public.can_access_lga(lga_id)
  )
  OR public.current_app_role() IN (
    'state_coordinator',
    'senior_supervisor'
  )
  OR (
    public.current_app_role() = 'management_approver'
    AND EXISTS (
      SELECT 1
      FROM public.movement_requests request
      WHERE request.id = movement_request_id
        AND request.status IN (
          'pending_management',
          'approved',
          'rejected'
        )
    )
  )
);

REVOKE INSERT, UPDATE, DELETE
ON public.movement_request_history
FROM anon, authenticated;

REVOKE ALL
ON FUNCTION public.record_movement_request_history()
FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 21. REDACT SENSITIVE VALUES FROM CAMPAIGN AUDIT SNAPSHOTS
-- ============================================================

CREATE OR REPLACE FUNCTION public.audit_campaign_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_row jsonb;
  new_row jsonb;
  subject_id uuid;
  subject_lga_id uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_row := to_jsonb(OLD)
      - 'latitude'
      - 'longitude'
      - 'storage_path';
    subject_id := (to_jsonb(OLD) ->> 'id')::uuid;
    subject_lga_id := (to_jsonb(OLD) ->> 'lga_id')::uuid;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    new_row := to_jsonb(NEW)
      - 'latitude'
      - 'longitude'
      - 'storage_path';
    subject_id := (to_jsonb(NEW) ->> 'id')::uuid;
    subject_lga_id := (to_jsonb(NEW) ->> 'lga_id')::uuid;
  END IF;

  INSERT INTO public.campaign_audit_events (
    lga_id, entity_type, entity_id, action,
    actor_id, old_values, new_values
  )
  VALUES (
    subject_lga_id,
    TG_TABLE_NAME,
    subject_id,
    lower(TG_OP),
    auth.uid(),
    old_row,
    new_row
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION public.audit_campaign_mutation()
FROM PUBLIC, anon, authenticated;

-- End movement workflow and audit privacy corrections.

-- ============================================================
-- 22. STRICT AUDIT SNAPSHOT WHITELIST
-- Never store unrestricted user-entered text, GPS or file paths.
-- ============================================================

CREATE OR REPLACE FUNCTION public.audit_campaign_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_data jsonb;
  new_data jsonb;
  old_safe jsonb;
  new_safe jsonb;
  subject_id uuid;
  subject_lga_id uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_data := to_jsonb(OLD);
    subject_id := (old_data ->> 'id')::uuid;
    subject_lga_id := (old_data ->> 'lga_id')::uuid;

    CASE TG_TABLE_NAME
      WHEN 'campaign_checkins' THEN
        old_safe := jsonb_build_object(
          'checkin_date', old_data -> 'checkin_date',
          'checked_in_at', old_data -> 'checked_in_at',
          'location_source', old_data -> 'location_source',
          'submitted_by', old_data -> 'submitted_by'
        );

      WHEN 'campaign_readiness_reports' THEN
        old_safe := jsonb_build_object(
          'report_date', old_data -> 'report_date',
          'reporting_period', old_data -> 'reporting_period',
          'total_teams', old_data -> 'total_teams',
          'gts_clear_reinstall_total', old_data -> 'gts_clear_reinstall_total',
          'gts_pending', old_data -> 'gts_pending',
          'fionet_installed_total', old_data -> 'fionet_installed_total',
          'fionet_pending', old_data -> 'fionet_pending',
          'team_codes_populated', old_data -> 'team_codes_populated',
          'submitted_by', old_data -> 'submitted_by',
          'submitted_at', old_data -> 'submitted_at'
        );

      WHEN 'campaign_device_progress' THEN
        old_safe := jsonb_build_object(
          'task_id', old_data -> 'task_id',
          'expected_quantity', old_data -> 'expected_quantity',
          'completed_quantity', old_data -> 'completed_quantity',
          'pending_quantity', old_data -> 'pending_quantity',
          'reported_at', old_data -> 'reported_at',
          'submitted_by', old_data -> 'submitted_by'
        );

      WHEN 'supportive_supervision_visits' THEN
        old_safe := jsonb_build_object(
          'task_id', old_data -> 'task_id',
          'campaign_name', old_data -> 'campaign_name',
          'ward', old_data -> 'ward',
          'settlement', old_data -> 'settlement',
          'team_code', old_data -> 'team_code',
          'visited_at', old_data -> 'visited_at',
          'submitted_by', old_data -> 'submitted_by'
        );

      WHEN 'campaign_evidence' THEN
        old_safe := jsonb_build_object(
          'task_id', old_data -> 'task_id',
          'supervision_visit_id', old_data -> 'supervision_visit_id',
          'evidence_type', old_data -> 'evidence_type',
          'mime_type', old_data -> 'mime_type',
          'captured_at', old_data -> 'captured_at',
          'uploaded_by', old_data -> 'uploaded_by',
          'uploaded_at', old_data -> 'uploaded_at',
          'reviewed_by', old_data -> 'reviewed_by',
          'reviewed_at', old_data -> 'reviewed_at',
          'retention_until', old_data -> 'retention_until'
        );

      WHEN 'movement_requests' THEN
        old_safe := jsonb_build_object(
          'requested_by', old_data -> 'requested_by',
          'status', old_data -> 'status',
          'state_reviewed_by', old_data -> 'state_reviewed_by',
          'state_reviewed_at', old_data -> 'state_reviewed_at',
          'management_decided_by', old_data -> 'management_decided_by',
          'management_decided_at', old_data -> 'management_decided_at'
        );

      ELSE
        RAISE EXCEPTION 'Audit not configured for table: %',
          TG_TABLE_NAME;
    END CASE;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    new_data := to_jsonb(NEW);
    subject_id := (new_data ->> 'id')::uuid;
    subject_lga_id := (new_data ->> 'lga_id')::uuid;

    CASE TG_TABLE_NAME
      WHEN 'campaign_checkins' THEN
        new_safe := jsonb_build_object(
          'checkin_date', new_data -> 'checkin_date',
          'checked_in_at', new_data -> 'checked_in_at',
          'location_source', new_data -> 'location_source',
          'submitted_by', new_data -> 'submitted_by'
        );

      WHEN 'campaign_readiness_reports' THEN
        new_safe := jsonb_build_object(
          'report_date', new_data -> 'report_date',
          'reporting_period', new_data -> 'reporting_period',
          'total_teams', new_data -> 'total_teams',
          'gts_clear_reinstall_total', new_data -> 'gts_clear_reinstall_total',
          'gts_pending', new_data -> 'gts_pending',
          'fionet_installed_total', new_data -> 'fionet_installed_total',
          'fionet_pending', new_data -> 'fionet_pending',
          'team_codes_populated', new_data -> 'team_codes_populated',
          'submitted_by', new_data -> 'submitted_by',
          'submitted_at', new_data -> 'submitted_at'
        );

      WHEN 'campaign_device_progress' THEN
        new_safe := jsonb_build_object(
          'task_id', new_data -> 'task_id',
          'expected_quantity', new_data -> 'expected_quantity',
          'completed_quantity', new_data -> 'completed_quantity',
          'pending_quantity', new_data -> 'pending_quantity',
          'reported_at', new_data -> 'reported_at',
          'submitted_by', new_data -> 'submitted_by'
        );

      WHEN 'supportive_supervision_visits' THEN
        new_safe := jsonb_build_object(
          'task_id', new_data -> 'task_id',
          'campaign_name', new_data -> 'campaign_name',
          'ward', new_data -> 'ward',
          'settlement', new_data -> 'settlement',
          'team_code', new_data -> 'team_code',
          'visited_at', new_data -> 'visited_at',
          'submitted_by', new_data -> 'submitted_by'
        );

      WHEN 'campaign_evidence' THEN
        new_safe := jsonb_build_object(
          'task_id', new_data -> 'task_id',
          'supervision_visit_id', new_data -> 'supervision_visit_id',
          'evidence_type', new_data -> 'evidence_type',
          'mime_type', new_data -> 'mime_type',
          'captured_at', new_data -> 'captured_at',
          'uploaded_by', new_data -> 'uploaded_by',
          'uploaded_at', new_data -> 'uploaded_at',
          'reviewed_by', new_data -> 'reviewed_by',
          'reviewed_at', new_data -> 'reviewed_at',
          'retention_until', new_data -> 'retention_until'
        );

      WHEN 'movement_requests' THEN
        new_safe := jsonb_build_object(
          'requested_by', new_data -> 'requested_by',
          'status', new_data -> 'status',
          'state_reviewed_by', new_data -> 'state_reviewed_by',
          'state_reviewed_at', new_data -> 'state_reviewed_at',
          'management_decided_by', new_data -> 'management_decided_by',
          'management_decided_at', new_data -> 'management_decided_at'
        );

      ELSE
        RAISE EXCEPTION 'Audit not configured for table: %',
          TG_TABLE_NAME;
    END CASE;
  END IF;

  INSERT INTO public.campaign_audit_events (
    lga_id, entity_type, entity_id, action,
    actor_id, old_values, new_values
  )
  VALUES (
    subject_lga_id,
    TG_TABLE_NAME,
    subject_id,
    lower(TG_OP),
    auth.uid(),
    old_safe,
    new_safe
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION public.audit_campaign_mutation()
FROM PUBLIC, anon, authenticated;

-- End strict audit snapshot whitelist.
