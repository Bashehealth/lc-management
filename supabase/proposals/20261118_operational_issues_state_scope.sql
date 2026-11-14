-- REVIEW PROPOSAL ONLY. Do not apply to production without approval.
-- Additive hardening for the existing live Operational Issues schema. This
-- preserves its tables, columns, data, constraints, and existing workflow guard.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.operational_issues') IS NULL
     OR to_regprocedure('public.can_access_lga(uuid)') IS NULL
     OR to_regprocedure('public.current_app_role()') IS NULL THEN
    RAISE EXCEPTION 'Operational Issues table and scoped authorization helpers are required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='operational_issues' AND column_name='lga_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='operational_issues' AND column_name='created_by'
  ) THEN
    RAISE EXCEPTION 'Live Operational Issues schema is not the verified LGA-scoped shape';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='operational_issues'
      AND policyname='operational_issues_create'
      AND coalesce(with_check,'') LIKE '%can_access_lga%'
  ) THEN
    RAISE EXCEPTION 'Expected state-scoped Operational Issues create policy is missing';
  END IF;
END;
$$;

-- The live create policy already calls can_access_lga(); proposal 20261115
-- makes that helper state-aware. Only the update policy is role-only.
DROP POLICY IF EXISTS operational_issues_supervisor_update ON public.operational_issues;
CREATE POLICY operational_issues_supervisor_update
ON public.operational_issues FOR UPDATE TO authenticated
USING (
  public.current_app_role() IN ('state_coordinator','senior_supervisor')
  AND public.can_access_lga(lga_id)
)
WITH CHECK (
  public.current_app_role() IN ('state_coordinator','senior_supervisor')
  AND public.can_access_lga(lga_id)
);

-- Keep the remote guard function intact and add an independent state boundary
-- so a future policy regression cannot permit a cross-state supervisor write.
CREATE OR REPLACE FUNCTION public.enforce_operational_issue_state_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE actor_role text := public.current_app_role()::text;
BEGIN
  IF actor_role IN ('state_coordinator','senior_supervisor') THEN
    IF NOT public.can_access_lga(NEW.lga_id)
       OR (TG_OP = 'UPDATE' AND NOT public.can_access_lga(OLD.lga_id)) THEN
      RAISE EXCEPTION 'Operational issue is outside the supervisor assigned state'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_operational_issue_state_scope() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS operational_issue_state_scope_guard ON public.operational_issues;
CREATE TRIGGER operational_issue_state_scope_guard
BEFORE INSERT OR UPDATE ON public.operational_issues
FOR EACH ROW EXECUTE FUNCTION public.enforce_operational_issue_state_scope();

COMMIT;
