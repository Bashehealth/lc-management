-- REVIEW PROPOSAL ONLY. Apply after 20261115_task_movement_state_integrity.sql
-- and 20261116_reporting_and_evidence_contract.sql, after isolated testing.
-- This closes supervisor-only access paths not covered by those proposals.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.audit_logs') IS NULL
     OR to_regclass('public.working_day_overage_authorizations') IS NULL
     OR to_regprocedure('public.get_feedback_author_names(uuid[])') IS NULL
     OR to_regprocedure('public.can_access_lga(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Required state-scoped access objects are missing';
  END IF;
END;
$$;

-- Audit rows without an LGA cannot safely be attributed to a supervisor's
-- state, so they are not exposed through this operational audit policy.
DROP POLICY IF EXISTS audit_logs_read ON public.audit_logs;
CREATE POLICY audit_logs_read
ON public.audit_logs FOR SELECT TO authenticated
USING (lga_id IS NOT NULL AND public.can_access_lga(lga_id));

-- Overage authorizations follow the LGA's state. DPM remains read-only for
-- working-day records and does not gain authority to create overage grants.
DROP POLICY IF EXISTS working_day_overage_supervisor_read
ON public.working_day_overage_authorizations;
CREATE POLICY working_day_overage_supervisor_read
ON public.working_day_overage_authorizations FOR SELECT TO authenticated
USING (public.is_supervisor() AND public.can_access_lga(lga_id));

DROP POLICY IF EXISTS working_day_overage_supervisor_create
ON public.working_day_overage_authorizations;
CREATE POLICY working_day_overage_supervisor_create
ON public.working_day_overage_authorizations FOR INSERT TO authenticated
WITH CHECK (
  public.is_supervisor()
  AND public.can_access_lga(lga_id)
  AND authorized_by = auth.uid()
);

-- The security-definer RPC returns reviewer names for comments addressed to
-- the caller only when their parent task is in the caller's authorized LGA or
-- state. Replacing the RLS policy alone would not protect this RPC.
CREATE OR REPLACE FUNCTION public.get_feedback_author_names(p_comment_ids uuid[])
RETURNS TABLE(comment_id uuid, author_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  SELECT
    comment.id AS comment_id,
    COALESCE(author.full_name, 'Unknown user') AS author_name
  FROM public.task_comments AS comment
  JOIN public.tasks AS task ON task.id = comment.task_id
  JOIN public.profiles AS viewer ON viewer.id = auth.uid()
  LEFT JOIN public.profiles AS author ON author.id = comment.author_id
  WHERE comment.id = ANY(p_comment_ids)
    AND auth.uid() IS NOT NULL
    AND public.can_access_lga(task.lga_id)
    AND (
      (viewer.role = 'lga_coordinator'
        AND comment.addressed_to_role = 'lga_coordinator')
      OR
      (viewer.role = 'state_coordinator'
        AND comment.addressed_to_role = 'state_coordinator')
      OR
      (viewer.role = 'senior_supervisor'
        AND comment.author_id = auth.uid())
    );
$$;

REVOKE ALL ON FUNCTION public.get_feedback_author_names(uuid[])
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_feedback_author_names(uuid[])
TO authenticated;

COMMIT;
