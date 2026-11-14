-- DPM workflow foundation.
-- Requires 20261114000100_add_dpm_boss_roles.sql to be committed first.
-- Preserves existing supervisor and management permissions.

CREATE TABLE IF NOT EXISTS public.states (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    name text NOT NULL UNIQUE,
    country_code text NOT NULL DEFAULT 'NG',
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.states (code, name, country_code)
VALUES ('NG-YO', 'Yobe', 'NG')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.lgas
ADD COLUMN IF NOT EXISTS state_id uuid REFERENCES public.states(id);

UPDATE public.lgas
SET state_id = (SELECT id FROM public.states WHERE code = 'NG-YO')
WHERE state_id IS NULL;

ALTER TABLE public.lgas
ALTER COLUMN state_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS lgas_state_id_idx
ON public.lgas(state_id);

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS state_id uuid REFERENCES public.states(id);

UPDATE public.profiles
SET state_id = (SELECT id FROM public.states WHERE code = 'NG-YO')
WHERE role IN ('state_coordinator', 'senior_supervisor')
AND state_id IS NULL;

ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profile_lga_role_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profile_lga_role_check CHECK (
    (role = 'lga_coordinator' AND lga_id IS NOT NULL AND state_id IS NULL)
    OR
    (role IN ('state_coordinator', 'senior_supervisor')
        AND lga_id IS NULL AND state_id IS NOT NULL)
    OR
    (role IN ('management_approver', 'boss', 'dpm')
        AND lga_id IS NULL AND state_id IS NULL)
);

CREATE INDEX IF NOT EXISTS profiles_state_id_idx
ON public.profiles(state_id);

-- Separate DPM permission. Do not replace can_access_lga().
CREATE OR REPLACE FUNCTION public.can_monitor_working_days(target_lga_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
    SELECT public.current_app_role() = 'dpm'
        OR public.can_access_lga(target_lga_id);
$$;

REVOKE ALL ON FUNCTION public.can_monitor_working_days(uuid)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.can_monitor_working_days(uuid)
TO authenticated;

DROP POLICY IF EXISTS working_days_read
ON public.working_day_records;

CREATE POLICY working_days_read
ON public.working_day_records
FOR SELECT TO authenticated
USING (public.can_monitor_working_days(lga_id));

DROP POLICY IF EXISTS working_day_history_access
ON public.working_day_approvals;

CREATE POLICY working_day_history_access
ON public.working_day_approvals
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.working_day_records w
        WHERE w.id = working_day_record_id
        AND public.can_monitor_working_days(w.lga_id)
    )
);

-- Do not broaden profiles_read. DPM does not receive unrestricted
-- access to personal profile records.

CREATE TABLE IF NOT EXISTS public.leave_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    leave_type text NOT NULL CHECK (
        leave_type IN ('annual','sick','casual','maternity','paternity','other')
    ),
    start_date date NOT NULL,
    end_date date NOT NULL,
    reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 5 AND 2000),
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','approved','rejected')),
    decision_note text,
    reviewed_by uuid REFERENCES public.profiles(id),
    reviewed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (end_date >= start_date),
    CHECK (
        (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
        OR
        (status IN ('approved','rejected')
            AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS leave_requests_status_date_idx
ON public.leave_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS leave_requests_requester_idx
ON public.leave_requests(requester_id, created_at DESC);

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leave_requests_read
ON public.leave_requests;

CREATE POLICY leave_requests_read
ON public.leave_requests
FOR SELECT TO authenticated
USING (
    requester_id = auth.uid()
    OR public.current_app_role() = 'dpm'
);

DROP POLICY IF EXISTS leave_requests_submit
ON public.leave_requests;

CREATE POLICY leave_requests_submit
ON public.leave_requests
FOR INSERT TO authenticated
WITH CHECK (
    requester_id = auth.uid()
    AND public.current_app_role() = 'lga_coordinator'
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
);

CREATE TABLE IF NOT EXISTS public.leave_request_decisions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id uuid NOT NULL REFERENCES public.leave_requests(id) ON DELETE RESTRICT,
    decision text NOT NULL CHECK (decision IN ('approved','rejected')),
    decision_note text NOT NULL CHECK (length(trim(decision_note)) >= 3),
    reviewed_by uuid NOT NULL REFERENCES public.profiles(id),
    reviewed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leave_decisions_request_idx
ON public.leave_request_decisions(request_id, reviewed_at DESC);

ALTER TABLE public.leave_request_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY leave_decisions_read
ON public.leave_request_decisions
FOR SELECT TO authenticated
USING (
    public.current_app_role() = 'dpm'
    OR EXISTS (
        SELECT 1
        FROM public.leave_requests lr
        WHERE lr.id = request_id
        AND lr.requester_id = auth.uid()
    )
);

REVOKE INSERT, UPDATE, DELETE
ON public.leave_request_decisions
FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.prevent_leave_decision_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'Leave decision history is append-only';
END;
$$;

CREATE TRIGGER leave_decisions_append_only
BEFORE UPDATE OR DELETE ON public.leave_request_decisions
FOR EACH ROW
EXECUTE FUNCTION public.prevent_leave_decision_mutation();

CREATE OR REPLACE FUNCTION public.review_leave_request(
    p_request_id uuid,
    p_decision text,
    p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
    request_status text;
BEGIN
    IF auth.uid() IS NULL
       OR public.current_app_role() <> 'dpm' THEN
        RAISE EXCEPTION 'Only DPM can review leave requests'
            USING ERRCODE = '42501';
    END IF;

    IF p_decision NOT IN ('approved','rejected') THEN
        RAISE EXCEPTION 'Decision must be approved or rejected'
            USING ERRCODE = '22023';
    END IF;

    IF p_note IS NULL OR length(trim(p_note)) < 3 THEN
        RAISE EXCEPTION 'A decision note is required'
            USING ERRCODE = '22023';
    END IF;

    SELECT status
    INTO request_status
    FROM public.leave_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Leave request not found'
            USING ERRCODE = 'P0002';
    END IF;

    IF request_status <> 'pending' THEN
        RAISE EXCEPTION 'This leave request has already been reviewed'
            USING ERRCODE = '55000';
    END IF;

    INSERT INTO public.leave_request_decisions (
        request_id, decision, decision_note, reviewed_by
    )
    VALUES (
        p_request_id, p_decision, trim(p_note), auth.uid()
    );

    UPDATE public.leave_requests
    SET status = p_decision,
        decision_note = trim(p_note),
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        updated_at = now()
    WHERE id = p_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.review_leave_request(uuid,text,text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.review_leave_request(uuid,text,text)
TO authenticated;

ALTER TABLE public.states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS states_read_authenticated
ON public.states;

CREATE POLICY states_read_authenticated
ON public.states
FOR SELECT TO authenticated
USING (true);

GRANT SELECT ON public.states TO authenticated;

-- DPM and Boss profiles must have no LGA or state assignment.
-- This migration does not create Auth users or passwords.

-- Explicit table privileges; row access remains controlled by RLS.
GRANT SELECT, INSERT ON public.leave_requests TO authenticated;
GRANT SELECT ON public.leave_request_decisions TO authenticated;
