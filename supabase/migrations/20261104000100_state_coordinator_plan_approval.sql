CREATE OR REPLACE FUNCTION public.protect_supervisor_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
BEGIN
  IF TG_TABLE_NAME IN ('monthly_plans', 'weekly_plans') THEN
    IF NEW.submitted_by IS DISTINCT FROM OLD.submitted_by THEN
      RAISE EXCEPTION 'plan submitter cannot be changed'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
      OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
      OR NEW.review_note IS DISTINCT FROM OLD.review_note
      OR NEW.status IS DISTINCT FROM OLD.status THEN

      IF public.current_app_role() = 'state_coordinator' THEN
        RETURN NEW;
      END IF;

      IF public.current_app_role() = 'lga_coordinator'
        AND OLD.status = 'returned'
        AND NEW.status IN ('draft', 'submitted')
        AND NEW.reviewed_by IS NULL
        AND NEW.reviewed_at IS NULL
        AND NEW.review_note IS NULL THEN
        RETURN NEW;
      END IF;

      RAISE EXCEPTION 'only the State Coordinator may review plans; LGA Coordinators may only correct returned plans'
        USING ERRCODE = '42501';
    END IF;

    IF public.current_app_role() NOT IN (
      'lga_coordinator',
      'state_coordinator'
    ) THEN
      RAISE EXCEPTION 'this role has read-only access to plans'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  IF public.is_supervisor() THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'tasks' THEN
    IF NEW.verified_by IS DISTINCT FROM OLD.verified_by
      OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
      OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'task verification and ownership may only be changed by a supervisor';
    END IF;
  ELSIF TG_TABLE_NAME = 'working_day_records' THEN
    IF NEW.status = 'approved'
      OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
      OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
      OR NEW.authorization_note IS DISTINCT FROM OLD.authorization_note THEN
      RAISE EXCEPTION 'working-day approval fields may only be changed by a supervisor';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_plan_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  period_changed boolean;
  review_required boolean;
  review_fields_changed boolean;
BEGIN
  PERFORM public.require_lga_access(NEW.lga_id);

  IF TG_OP = 'INSERT' THEN
    IF public.current_app_role() <> 'lga_coordinator' THEN
      RAISE EXCEPTION 'only LGA Coordinators may create plans'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.submitted_by <> auth.uid()
      OR NEW.status NOT IN ('draft', 'submitted')
      OR NEW.reviewed_by IS NOT NULL
      OR NEW.reviewed_at IS NOT NULL
      OR NEW.review_note IS NOT NULL THEN
      RAISE EXCEPTION 'invalid initial plan submission'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF TG_TABLE_NAME = 'monthly_plans' THEN
      period_changed := NEW.plan_month <> OLD.plan_month;
    ELSE
      period_changed := NEW.week_start <> OLD.week_start;
    END IF;

    IF NEW.lga_id <> OLD.lga_id
      OR period_changed
      OR NEW.submitted_by <> OLD.submitted_by THEN
      RAISE EXCEPTION 'plan LGA, period, and submitter are immutable'
        USING ERRCODE = '42501';
    END IF;

    IF NOT public.valid_plan_transition(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'invalid plan status transition'
        USING ERRCODE = '23514';
    END IF;

    review_fields_changed :=
      NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
      OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
      OR NEW.review_note IS DISTINCT FROM OLD.review_note;

    IF public.current_app_role() = 'state_coordinator' THEN
      IF NEW.status = OLD.status AND review_fields_changed THEN
        RAISE EXCEPTION 'a completed plan review cannot be silently modified'
          USING ERRCODE = '42501';
      END IF;

      IF NEW.status IN ('returned', 'approved') THEN
        IF NEW.reviewed_by <> auth.uid() THEN
          RAISE EXCEPTION 'reviewer must be the authenticated State Coordinator'
            USING ERRCODE = '42501';
        END IF;
      ELSIF review_fields_changed THEN
        RAISE EXCEPTION 'review metadata cannot be changed independently of a review decision'
          USING ERRCODE = '42501';
      END IF;

    ELSIF public.current_app_role() = 'lga_coordinator' THEN
      IF NEW.status IS DISTINCT FROM OLD.status
        OR review_fields_changed THEN
        IF OLD.status <> 'returned'
          OR NEW.status NOT IN ('draft', 'submitted')
          OR NEW.reviewed_by IS NOT NULL
          OR NEW.reviewed_at IS NOT NULL
          OR NEW.review_note IS NOT NULL THEN
          RAISE EXCEPTION 'LGA Coordinators may only clear review metadata when correcting a returned plan'
            USING ERRCODE = '42501';
        END IF;
      END IF;
    ELSE
      RAISE EXCEPTION 'this role cannot modify plans'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  review_required := NEW.status IN ('returned', 'approved');

  IF review_required AND (
    NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'returned and approved plans require reviewer metadata'
      USING ERRCODE = '23514';
  END IF;

  IF NOT review_required AND (
    NEW.reviewed_by IS NOT NULL
    OR NEW.reviewed_at IS NOT NULL
    OR NEW.review_note IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'unreviewed plans cannot retain review metadata'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'returned'
    AND COALESCE(LENGTH(TRIM(NEW.review_note)), 0) = 0 THEN
    RAISE EXCEPTION 'returned plans require a review note'
      USING ERRCODE = '23514';
  END IF;

  IF review_required
    AND public.current_app_role() <> 'state_coordinator' THEN
    RAISE EXCEPTION 'only the State Coordinator may approve or return plans'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_supervisor_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_plan_write() FROM PUBLIC, anon, authenticated;
-- Senior Supervisors may monitor plans statewide but cannot update them.
DROP POLICY IF EXISTS monthly_plans_update ON public.monthly_plans;

CREATE POLICY monthly_plans_update
ON public.monthly_plans
FOR UPDATE
TO authenticated
USING (
  public.current_app_role() IN ('lga_coordinator', 'state_coordinator')
  AND public.can_access_lga(lga_id)
)
WITH CHECK (
  public.current_app_role() IN ('lga_coordinator', 'state_coordinator')
  AND public.can_access_lga(lga_id)
);
DROP POLICY IF EXISTS weekly_plans_update ON public.weekly_plans;

CREATE POLICY weekly_plans_update
ON public.weekly_plans
FOR UPDATE
TO authenticated
USING (
  public.current_app_role() IN ('lga_coordinator', 'state_coordinator')
  AND public.can_access_lga(lga_id)
)
WITH CHECK (
  public.current_app_role() IN ('lga_coordinator', 'state_coordinator')
  AND public.can_access_lga(lga_id)
);
-- Only LGA Coordinators may create monthly and weekly plans.
DROP POLICY IF EXISTS monthly_plans_create ON public.monthly_plans;

CREATE POLICY monthly_plans_create
ON public.monthly_plans
FOR INSERT
TO authenticated
WITH CHECK (
  public.current_app_role() = 'lga_coordinator'
  AND public.can_access_lga(lga_id)
  AND submitted_by = auth.uid()
);

DROP POLICY IF EXISTS weekly_plans_create ON public.weekly_plans;

CREATE POLICY weekly_plans_create
ON public.weekly_plans
FOR INSERT
TO authenticated
WITH CHECK (
  public.current_app_role() = 'lga_coordinator'
  AND public.can_access_lga(lga_id)
  AND submitted_by = auth.uid()
);