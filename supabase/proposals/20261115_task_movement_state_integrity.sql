-- REVIEW PROPOSAL ONLY. DO NOT APPLY UNTIL MIGRATION PROVENANCE, DUPLICATE
-- PREFLIGHT, STATE ASSIGNMENTS, AND TESTS ARE VERIFIED IN A SEPARATE DEV DB.
-- Depends on profiles.state_id and lgas.state_id from
-- 20261114000200_state_aware_dpm_leave_workflow.sql.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='state_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='lgas' AND column_name='state_id'
  ) THEN
    RAISE EXCEPTION 'Apply the state assignment schema before this security proposal';
  END IF;
  IF to_regclass('public.task_assignments') IS NULL
     OR to_regclass('public.movement_request_history') IS NULL THEN
    RAISE EXCEPTION 'Task assignment and movement history tables are required';
  END IF;
END;
$$;

-- 1) Scope LC access to its assigned LGA and SC/Senior Supervisor access to
--    LGAs in their assigned state. DPM, Management Approver, and Boss receive
--    no access through this helper.
CREATE OR REPLACE FUNCTION public.can_access_lga(target_lga_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    JOIN public.lgas AS lga ON lga.id = target_lga_id
    WHERE profile.id = auth.uid()
      AND (
        (profile.role = 'lga_coordinator'
          AND profile.lga_id = target_lga_id
          AND profile.state_id IS NULL)
        OR
        (profile.role IN ('state_coordinator', 'senior_supervisor')
          AND profile.state_id IS NOT NULL
          AND profile.state_id = lga.state_id)
      )
  );
$$;

-- Keep supervisor profile lookup state-scoped. LC users and all other roles
-- may read only their own profile; state supervisors may read profiles whose
-- LGA or supervisor assignment belongs to their state.
DROP POLICY IF EXISTS profiles_read ON public.profiles;
CREATE POLICY profiles_read
ON public.profiles FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR (
    public.current_app_role() IN ('state_coordinator', 'senior_supervisor')
    AND (
      (role = 'lga_coordinator' AND public.can_access_lga(lga_id))
      OR
      (role IN ('state_coordinator', 'senior_supervisor') AND EXISTS (
        SELECT 1 FROM public.lgas AS assigned_lga
        WHERE assigned_lga.state_id = profiles.state_id
          AND public.can_access_lga(assigned_lga.id)
      ))
    )
  )
);

-- Task revision reads must follow the parent row's LGA/state, without the
-- role-only supervisor bypass in the foundation migration.
DROP POLICY IF EXISTS revisions_access ON public.plan_revisions;
CREATE POLICY revisions_access
ON public.plan_revisions FOR SELECT TO authenticated
USING (
  (monthly_plan_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.monthly_plans AS plan
    WHERE plan.id = monthly_plan_id AND public.can_access_lga(plan.lga_id)
  ))
  OR
  (weekly_plan_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.weekly_plans AS plan
    WHERE plan.id = weekly_plan_id AND public.can_access_lga(plan.lga_id)
  ))
  OR
  (task_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.tasks AS task
    WHERE task.id = task_id AND public.can_access_lga(task.lga_id)
  ))
);

-- SC feedback was role-readable across all states. Bind it to the task LGA.
DROP POLICY IF EXISTS comments_read ON public.task_comments;
CREATE POLICY comments_read
ON public.task_comments FOR SELECT TO authenticated
USING (
  (public.current_app_role() = 'lga_coordinator'
    AND addressed_to_role = 'lga_coordinator'
    AND EXISTS (
      SELECT 1 FROM public.tasks AS task
      WHERE task.id = task_comments.task_id AND public.can_access_lga(task.lga_id)
    ))
  OR
  (public.current_app_role() = 'state_coordinator'
    AND addressed_to_role = 'state_coordinator'
    AND EXISTS (
      SELECT 1 FROM public.tasks AS task
      WHERE task.id = task_comments.task_id AND public.can_access_lga(task.lga_id)
    ))
  OR
  (public.current_app_role() = 'senior_supervisor' AND author_id = auth.uid())
);

-- 2) Task updates: LC can update only a currently assigned task in its LGA.
--    State supervisors retain their existing task-review capability, scoped
--    by the state-aware can_access_lga().
DROP POLICY IF EXISTS tasks_update ON public.tasks;
CREATE POLICY tasks_update
ON public.tasks FOR UPDATE TO authenticated
USING (
  public.can_access_lga(lga_id)
  AND (
    (public.current_app_role() = 'lga_coordinator' AND EXISTS (
      SELECT 1 FROM public.task_assignments AS assignment
      WHERE assignment.task_id = tasks.id
        AND assignment.lga_id = tasks.lga_id
        AND assignment.assignee_id = auth.uid()
        AND assignment.unassigned_at IS NULL
    ))
    OR public.is_supervisor()
  )
)
WITH CHECK (
  public.can_access_lga(lga_id)
  AND (
    (public.current_app_role() = 'lga_coordinator' AND EXISTS (
      SELECT 1 FROM public.task_assignments AS assignment
      WHERE assignment.task_id = tasks.id
        AND assignment.lga_id = tasks.lga_id
        AND assignment.assignee_id = auth.uid()
        AND assignment.unassigned_at IS NULL
    ))
    OR public.is_supervisor()
  )
);

-- Replace the trigger body while retaining supervisor transitions, verification
-- metadata checks, and immutable task ownership. LC writes may change only the
-- progress value and updated_by; task status remains a supervisor decision.
CREATE OR REPLACE FUNCTION public.enforce_task_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  verification_changed boolean;
  actor_role public.app_role;
BEGIN
  actor_role := public.current_app_role();
  PERFORM public.require_lga_access(NEW.lga_id);

  IF TG_OP = 'INSERT' THEN
    IF NEW.created_by <> auth.uid() THEN
      RAISE EXCEPTION 'task creator must be the authenticated user' USING ERRCODE = '42501';
    END IF;
    IF NOT public.is_supervisor()
       AND (NEW.source = 'supervisor_assigned' OR NEW.verified_by IS NOT NULL OR NEW.verified_at IS NOT NULL) THEN
      RAISE EXCEPTION 'LGA Coordinators may not create supervisor tasks or task verifications' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.lga_id IS DISTINCT FROM OLD.lga_id
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.weekly_plan_id IS DISTINCT FROM OLD.weekly_plan_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.source IS DISTINCT FROM OLD.source THEN
    RAISE EXCEPTION 'task ownership, plan, creator, and source are immutable' USING ERRCODE = '42501';
  END IF;

  IF NOT public.valid_task_transition(OLD.status, NEW.status) THEN
    RAISE EXCEPTION 'invalid task status transition' USING ERRCODE = '23514';
  END IF;

  IF (NEW.verified_by IS NULL) <> (NEW.verified_at IS NULL) THEN
    RAISE EXCEPTION 'verified_by and verified_at must be set together' USING ERRCODE = '23514';
  END IF;
  IF NEW.verified_by IS NOT NULL AND NEW.status <> 'completed' THEN
    RAISE EXCEPTION 'only completed tasks may be verified' USING ERRCODE = '23514';
  END IF;

  verification_changed := NEW.verified_by IS DISTINCT FROM OLD.verified_by
    OR NEW.verified_at IS DISTINCT FROM OLD.verified_at;

  IF actor_role = 'lga_coordinator' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.task_assignments AS assignment
      WHERE assignment.task_id = OLD.id
        AND assignment.lga_id = OLD.lga_id
        AND assignment.assignee_id = auth.uid()
        AND assignment.unassigned_at IS NULL
    ) THEN
      RAISE EXCEPTION 'task must be actively assigned to this LGA Coordinator' USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.responsibility_id IS DISTINCT FROM OLD.responsibility_id
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.activity_description IS DISTINCT FROM OLD.activity_description
       OR NEW.expected_deliverable IS DISTINCT FROM OLD.expected_deliverable
       OR NEW.planned_date IS DISTINCT FROM OLD.planned_date
       OR NEW.deadline IS DISTINCT FROM OLD.deadline
       OR NEW.priority IS DISTINCT FROM OLD.priority
       OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
       OR verification_changed
       OR NEW.updated_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'LGA Coordinators may update only task progress' USING ERRCODE = '42501';
    END IF;
  ELSIF public.is_supervisor() THEN
    IF verification_changed THEN
      IF NEW.verified_by <> auth.uid() THEN
        RAISE EXCEPTION 'a verifier must be the authenticated supervisor' USING ERRCODE = '42501';
      END IF;
      IF OLD.verified_by IS NOT NULL THEN
        RAISE EXCEPTION 'task verification is immutable once recorded' USING ERRCODE = '42501';
      END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'role is not authorized to update tasks' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- Task evidence is available only to an active assignee. The trigger protects
-- direct writes as well as the UI path; evidence cannot be assigned to another
-- task or annotated as reviewed by the uploader.
DROP POLICY IF EXISTS evidence_create ON public.task_evidence;
CREATE POLICY evidence_create
ON public.task_evidence FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_note IS NULL
  AND EXISTS (
    SELECT 1 FROM public.tasks task
    JOIN public.task_assignments assignment ON assignment.task_id = task.id
    WHERE task.id = task_evidence.task_id
      AND public.can_access_lga(task.lga_id)
      AND assignment.lga_id = task.lga_id
      AND assignment.assignee_id = auth.uid()
      AND assignment.unassigned_at IS NULL
  )
);

CREATE OR REPLACE FUNCTION public.enforce_evidence_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET row_security = off AS $$
DECLARE task_lga uuid;
BEGIN
  SELECT task.lga_id INTO task_lga FROM public.tasks task WHERE task.id=NEW.task_id;
  IF task_lga IS NULL THEN RAISE EXCEPTION 'Evidence task does not exist' USING ERRCODE='23503'; END IF;
  PERFORM public.require_lga_access(task_lga);
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Evidence records are immutable after submission' USING ERRCODE='42501'; END IF;
  IF public.current_app_role() <> 'lga_coordinator' OR NEW.uploaded_by <> auth.uid()
     OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.review_note IS NOT NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.task_assignments assignment
       WHERE assignment.task_id=NEW.task_id AND assignment.lga_id=task_lga
         AND assignment.assignee_id=auth.uid() AND assignment.unassigned_at IS NULL
     ) THEN
    RAISE EXCEPTION 'Only the active task assignee may submit evidence' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END; $$;

-- Assignment writes are supervisor-only, state-scoped, and one-way. An expired
-- assignment cannot be reactivated or edited into a different ownership row.
DROP POLICY IF EXISTS assignments_supervisor_create ON public.task_assignments;
CREATE POLICY assignments_supervisor_create
ON public.task_assignments FOR INSERT TO authenticated
WITH CHECK (
  public.is_supervisor()
  AND public.can_access_lga(lga_id)
  AND assigned_by = auth.uid()
  AND unassigned_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.tasks AS task
    WHERE task.id = task_id AND task.lga_id = task_assignments.lga_id
  )
);

DROP POLICY IF EXISTS assignments_supervisor_update ON public.task_assignments;
CREATE POLICY assignments_supervisor_update
ON public.task_assignments FOR UPDATE TO authenticated
USING (
  public.is_supervisor()
  AND public.can_access_lga(lga_id)
  AND unassigned_at IS NULL
)
WITH CHECK (
  public.is_supervisor()
  AND public.can_access_lga(lga_id)
  AND unassigned_at IS NOT NULL
);

CREATE OR REPLACE FUNCTION public.enforce_task_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  assignee_role public.app_role;
BEGIN
  IF NOT public.is_supervisor() OR NOT public.can_access_lga(NEW.lga_id) THEN
    RAISE EXCEPTION 'only an authorized state supervisor may manage this assignment' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tasks AS task
    WHERE task.id = NEW.task_id AND task.lga_id = NEW.lga_id
  ) THEN
    RAISE EXCEPTION 'assignment must reference a task in the same LGA' USING ERRCODE = '23503';
  END IF;
  SELECT profile.role INTO assignee_role
  FROM public.profiles AS profile
  WHERE profile.id = NEW.assignee_id AND profile.lga_id = NEW.lga_id;
  IF assignee_role IS DISTINCT FROM 'lga_coordinator'::public.app_role THEN
    RAISE EXCEPTION 'tasks must be assigned to the LGA Coordinator for the task LGA' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_by <> auth.uid() OR NEW.unassigned_at IS NOT NULL THEN
      RAISE EXCEPTION 'new assignments must be active and recorded by the current supervisor' USING ERRCODE = '42501';
    END IF;
    NEW.assigned_at := now();
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.task_id IS DISTINCT FROM OLD.task_id
       OR NEW.lga_id IS DISTINCT FROM OLD.lga_id
       OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id
       OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by
       OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at
       OR OLD.unassigned_at IS NOT NULL
       OR NEW.unassigned_at IS NULL THEN
      RAISE EXCEPTION 'assignments may only be ended once; ownership is immutable' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 3) Atomic de-duplication of active or approved trips. Rejected requests may
--    be resubmitted as a new request; an approved trip remains protected.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.movement_requests
    WHERE status IN ('pending_state_review', 'returned_to_lga', 'pending_management', 'approved')
    GROUP BY lga_id, requested_by, lower(btrim(destination)),
      date_trunc('minute', departure_at AT TIME ZONE 'UTC'),
      date_trunc('minute', expected_return_at AT TIME ZONE 'UTC')
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Resolve duplicate active movement requests before creating the unique index';
  END IF;
END;
$$;

CREATE UNIQUE INDEX movement_requests_active_trip_unique
ON public.movement_requests (
  lga_id, requested_by, lower(btrim(destination)),
  date_trunc('minute', departure_at AT TIME ZONE 'UTC'),
  date_trunc('minute', expected_return_at AT TIME ZONE 'UTC')
)
WHERE status IN ('pending_state_review', 'returned_to_lga', 'pending_management', 'approved');

-- Replace movement RLS so SC/Senior Supervisor reads and SC review are scoped
-- to the assigned state. Management has no state_id in the current role model,
-- so its authorized scope is statewide, but only at final-review statuses.
DROP POLICY IF EXISTS movement_requests_read ON public.movement_requests;
CREATE POLICY movement_requests_read
ON public.movement_requests FOR SELECT TO authenticated
USING (
  (public.current_app_role() = 'lga_coordinator'
    AND requested_by = auth.uid()
    AND public.can_access_lga(lga_id))
  OR
  (public.current_app_role() IN ('state_coordinator', 'senior_supervisor')
    AND public.can_access_lga(lga_id))
  OR
  (public.current_app_role() = 'management_approver'
    AND status IN ('pending_management', 'approved', 'rejected'))
);

DROP POLICY IF EXISTS movement_requests_review ON public.movement_requests;
CREATE POLICY movement_requests_review
ON public.movement_requests FOR UPDATE TO authenticated
USING (
  (public.current_app_role() = 'state_coordinator'
    AND public.can_access_lga(lga_id)
    AND status IN ('pending_state_review', 'returned_to_lga'))
  OR
  (public.current_app_role() = 'management_approver'
    AND status = 'pending_management')
)
WITH CHECK (
  (public.current_app_role() = 'state_coordinator'
    AND public.can_access_lga(lga_id)
    AND status IN ('pending_management', 'returned_to_lga'))
  OR
  (public.current_app_role() = 'management_approver'
    AND status IN ('approved', 'rejected'))
);

DROP POLICY IF EXISTS movement_requests_lga_resubmit ON public.movement_requests;
CREATE POLICY movement_requests_lga_resubmit
ON public.movement_requests FOR UPDATE TO authenticated
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

DROP POLICY IF EXISTS movement_history_read ON public.movement_request_history;
CREATE POLICY movement_history_read
ON public.movement_request_history FOR SELECT TO authenticated
USING (
  (public.current_app_role() = 'lga_coordinator' AND EXISTS (
    SELECT 1 FROM public.movement_requests AS request
    WHERE request.id = movement_request_id
      AND request.lga_id = movement_request_history.lga_id
      AND request.requested_by = auth.uid()
  ))
  OR
  (public.current_app_role() IN ('state_coordinator', 'senior_supervisor') AND EXISTS (
    SELECT 1 FROM public.movement_requests AS request
    WHERE request.id = movement_request_id
      AND request.lga_id = movement_request_history.lga_id
      AND public.can_access_lga(request.lga_id)
  ))
  OR
  (public.current_app_role() = 'management_approver' AND EXISTS (
    SELECT 1 FROM public.movement_requests AS request
    WHERE request.id = movement_request_id
      AND request.status IN ('pending_management', 'approved', 'rejected')
  ))
);

DROP POLICY IF EXISTS movement_request_revisions_read ON public.movement_request_revisions;
CREATE POLICY movement_request_revisions_read
ON public.movement_request_revisions FOR SELECT TO authenticated
USING (
  (public.current_app_role() = 'lga_coordinator'
    AND revised_by = auth.uid()
    AND public.can_access_lga(lga_id))
  OR
  (public.current_app_role() IN ('state_coordinator', 'senior_supervisor')
    AND public.can_access_lga(lga_id))
  OR
  (public.current_app_role() = 'management_approver' AND EXISTS (
    SELECT 1 FROM public.movement_requests AS request
    WHERE request.id = movement_request_id
      AND request.status IN ('pending_management', 'approved', 'rejected')
  ))
);

-- Every status update must be an authorized stage transition. A repeated
-- same-status State update is rejected so review notes cannot change without
-- an append-only history event.
CREATE OR REPLACE FUNCTION public.enforce_movement_request_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  actor_role public.app_role;
BEGIN
  actor_role := public.current_app_role();
  IF auth.uid() IS NULL OR actor_role IS NULL THEN
    RAISE EXCEPTION 'Authenticated profile required' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF actor_role <> 'lga_coordinator'
       OR NEW.requested_by <> auth.uid()
       OR NOT public.can_access_lga(NEW.lga_id)
       OR NEW.status <> 'pending_state_review'
       OR length(trim(NEW.destination)) = 0
       OR length(trim(NEW.reason)) = 0
       OR NEW.state_reviewed_by IS NOT NULL OR NEW.state_reviewed_at IS NOT NULL
       OR NEW.state_recommendation IS NOT NULL
       OR NEW.management_decided_by IS NOT NULL OR NEW.management_decided_at IS NOT NULL
       OR NEW.management_decision_note IS NOT NULL THEN
      RAISE EXCEPTION 'Invalid movement request submission' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.lga_id IS DISTINCT FROM OLD.lga_id
     OR NEW.requested_by IS DISTINCT FROM OLD.requested_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Movement request identity and ownership are immutable' USING ERRCODE = '42501';
  END IF;
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Movement request updates must perform an authorized status transition' USING ERRCODE = '42501';
  END IF;
  IF length(trim(NEW.destination)) = 0 OR length(trim(NEW.reason)) = 0 THEN
    RAISE EXCEPTION 'Destination and reason are required' USING ERRCODE = '23514';
  END IF;

  IF actor_role = 'lga_coordinator'
     AND OLD.status = 'returned_to_lga'
     AND NEW.status = 'pending_state_review' THEN
    IF OLD.requested_by <> auth.uid()
       OR NOT public.can_access_lga(OLD.lga_id)
       OR NEW.state_reviewed_by IS NOT NULL OR NEW.state_reviewed_at IS NOT NULL
       OR NEW.state_recommendation IS NOT NULL
       OR NEW.management_decided_by IS NOT NULL OR NEW.management_decided_at IS NOT NULL
       OR NEW.management_decision_note IS NOT NULL THEN
      RAISE EXCEPTION 'Only the original LGA Coordinator may revise and resubmit this request' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF actor_role = 'state_coordinator'
     AND public.can_access_lga(OLD.lga_id)
     AND OLD.status IN ('pending_state_review', 'returned_to_lga')
     AND NEW.status IN ('pending_management', 'returned_to_lga') THEN
    IF NEW.reason IS DISTINCT FROM OLD.reason
       OR NEW.destination IS DISTINCT FROM OLD.destination
       OR NEW.departure_at IS DISTINCT FROM OLD.departure_at
       OR NEW.expected_return_at IS DISTINCT FROM OLD.expected_return_at
       OR NEW.management_decided_by IS DISTINCT FROM OLD.management_decided_by
       OR NEW.management_decided_at IS DISTINCT FROM OLD.management_decided_at
       OR NEW.management_decision_note IS DISTINCT FROM OLD.management_decision_note
       OR NEW.state_reviewed_by IS DISTINCT FROM auth.uid()
       OR NEW.state_reviewed_at IS NULL
       OR length(trim(coalesce(NEW.state_recommendation, ''))) < 3 THEN
      RAISE EXCEPTION 'Invalid State Coordinator review or recommendation' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

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
       OR NEW.management_decided_by IS DISTINCT FROM auth.uid()
       OR NEW.management_decided_at IS NULL
       OR length(trim(coalesce(NEW.management_decision_note, ''))) < 3 THEN
      RAISE EXCEPTION 'Invalid Management final decision' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Unauthorized or invalid movement request transition' USING ERRCODE = '42501';
END;
$$;

-- Enforce append-only history even if a future grant is added accidentally.
CREATE OR REPLACE FUNCTION public.prevent_movement_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Movement request history is append-only' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS movement_history_no_change ON public.movement_request_history;
CREATE TRIGGER movement_history_no_change
BEFORE UPDATE OR DELETE ON public.movement_request_history
FOR EACH ROW EXECUTE FUNCTION public.prevent_movement_history_mutation();

REVOKE INSERT, UPDATE, DELETE ON public.movement_request_history FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_movement_history_mutation() FROM PUBLIC, anon, authenticated;

COMMIT;
