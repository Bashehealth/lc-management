-- ============================================================
-- OPERATIONAL ISSUES MVP
-- Roles:
--   lga_coordinator
--   state_coordinator
--   senior_supervisor
--
-- Existing dependencies:
--   public.profiles(id, role, lga_id, full_name)
--   public.lgas(id, name)
--   public.current_app_role()
--   public.is_supervisor()
--   public.can_access_lga(uuid)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- 1. OPERATIONAL ISSUES
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.operational_issues (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    lga_id uuid NOT NULL REFERENCES public.lgas(id),

    title text NOT NULL CHECK (length(trim(title)) BETWEEN 3 AND 200),
    description text NOT NULL CHECK (length(trim(description)) >= 3),

    category text NOT NULL CHECK (length(trim(category)) BETWEEN 2 AND 80),

    severity text NOT NULL DEFAULT 'medium'
        CHECK (severity IN ('low', 'medium', 'high', 'critical')),

    status text NOT NULL DEFAULT 'open'
        CHECK (status IN (
            'open',
            'assigned',
            'in_progress',
            'pending_verification',
            'returned',
            'resolved',
            'closed'
        )),

    assigned_to uuid REFERENCES public.profiles(id),
    assigned_by uuid REFERENCES public.profiles(id),

    deadline date,

    resolution_note text,

    verified_by uuid REFERENCES public.profiles(id),
    verified_at timestamptz,
    closed_at timestamptz,

    created_by uuid NOT NULL REFERENCES public.profiles(id),

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT operational_issues_assignment_status_check
        CHECK (
            (assigned_to IS NULL AND status = 'open')
            OR
            (assigned_to IS NOT NULL AND status <> 'open')
        ),

    CONSTRAINT operational_issues_resolution_note_check
        CHECK (
            status NOT IN ('pending_verification', 'resolved', 'closed')
            OR (
                resolution_note IS NOT NULL
                AND length(trim(resolution_note)) >= 3
            )
        ),

    CONSTRAINT operational_issues_verification_check
        CHECK (
            status NOT IN ('resolved', 'closed')
            OR (
                verified_by IS NOT NULL
                AND verified_at IS NOT NULL
            )
        )
);

CREATE INDEX IF NOT EXISTS idx_operational_issues_lga
    ON public.operational_issues(lga_id);

CREATE INDEX IF NOT EXISTS idx_operational_issues_assigned
    ON public.operational_issues(assigned_to);

CREATE INDEX IF NOT EXISTS idx_operational_issues_status
    ON public.operational_issues(status);

CREATE INDEX IF NOT EXISTS idx_operational_issues_created
    ON public.operational_issues(created_at DESC);


-- ------------------------------------------------------------
-- 2. ISSUE UPDATES
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.issue_updates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    issue_id uuid NOT NULL
        REFERENCES public.operational_issues(id) ON DELETE CASCADE,

    lga_id uuid NOT NULL REFERENCES public.lgas(id),

    update_type text NOT NULL
        CHECK (update_type IN (
            'progress',
            'resolution',
            'verification',
            'returned',
            'management_decision'
        )),

    note text NOT NULL CHECK (length(trim(note)) >= 2),

    evidence_reference text,

    created_by uuid NOT NULL REFERENCES public.profiles(id),

    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_issue_updates_issue
    ON public.issue_updates(issue_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_issue_updates_lga
    ON public.issue_updates(lga_id);


-- ------------------------------------------------------------
-- 3. ISSUE AUDIT LOGS
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.issue_audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    issue_id uuid NOT NULL
        REFERENCES public.operational_issues(id) ON DELETE CASCADE,

    lga_id uuid NOT NULL REFERENCES public.lgas(id),

    action text NOT NULL,

    old_values jsonb,
    new_values jsonb,

    actor_id uuid REFERENCES public.profiles(id),

    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_issue_audit_issue
    ON public.issue_audit_logs(issue_id, created_at DESC);


-- ------------------------------------------------------------
-- 4. ENABLE ROW LEVEL SECURITY
-- ------------------------------------------------------------

ALTER TABLE public.operational_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issue_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issue_audit_logs ENABLE ROW LEVEL SECURITY;


-- ------------------------------------------------------------
-- 5. OPERATIONAL ISSUE ACCESS POLICIES
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "oi_select_access"
    ON public.operational_issues;

CREATE POLICY "oi_select_access"
ON public.operational_issues
FOR SELECT
TO authenticated
USING (
    (
        public.is_supervisor()
        AND public.can_access_lga(lga_id)
    )
    OR
    (
        public.current_app_role()::text = 'lga_coordinator'
        AND assigned_to = auth.uid()
        AND public.can_access_lga(lga_id)
    )
);

DROP POLICY IF EXISTS "oi_insert_supervisors"
    ON public.operational_issues;

CREATE POLICY "oi_insert_supervisors"
ON public.operational_issues
FOR INSERT
TO authenticated
WITH CHECK (
    public.is_supervisor()
    AND public.can_access_lga(lga_id)
    AND created_by = auth.uid()
    AND assigned_by = auth.uid()
);

DROP POLICY IF EXISTS "oi_update_access"
    ON public.operational_issues;

CREATE POLICY "oi_update_access"
ON public.operational_issues
FOR UPDATE
TO authenticated
USING (
    (
        public.is_supervisor()
        AND public.can_access_lga(lga_id)
    )
    OR
    (
        public.current_app_role()::text = 'lga_coordinator'
        AND assigned_to = auth.uid()
        AND public.can_access_lga(lga_id)
    )
)
WITH CHECK (
    (
        public.is_supervisor()
        AND public.can_access_lga(lga_id)
    )
    OR
    (
        public.current_app_role()::text = 'lga_coordinator'
        AND assigned_to = auth.uid()
        AND public.can_access_lga(lga_id)
    )
);


-- ------------------------------------------------------------
-- 6. ISSUE UPDATE ACCESS POLICIES
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "issue_updates_select_access"
    ON public.issue_updates;

CREATE POLICY "issue_updates_select_access"
ON public.issue_updates
FOR SELECT
TO authenticated
USING (
    (
        public.is_supervisor()
        AND public.can_access_lga(lga_id)
    )
    OR
    EXISTS (
        SELECT 1
        FROM public.operational_issues oi
        WHERE oi.id = issue_updates.issue_id
          AND oi.assigned_to = auth.uid()
          AND public.current_app_role()::text = 'lga_coordinator'
          AND public.can_access_lga(oi.lga_id)
    )
);

DROP POLICY IF EXISTS "issue_updates_insert_access"
    ON public.issue_updates;

CREATE POLICY "issue_updates_insert_access"
ON public.issue_updates
FOR INSERT
TO authenticated
WITH CHECK (
    created_by = auth.uid()
    AND
    (
        (
            public.is_supervisor()
            AND public.can_access_lga(lga_id)
        )
        OR
        EXISTS (
            SELECT 1
            FROM public.operational_issues oi
            WHERE oi.id = issue_updates.issue_id
              AND oi.lga_id = issue_updates.lga_id
              AND oi.assigned_to = auth.uid()
              AND public.current_app_role()::text = 'lga_coordinator'
              AND public.can_access_lga(oi.lga_id)
        )
    )
);


-- ------------------------------------------------------------
-- 7. AUDIT LOG READ POLICY
-- No direct INSERT, UPDATE or DELETE policy.
-- Audit records are generated by database triggers.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "issue_audit_select_access"
    ON public.issue_audit_logs;

CREATE POLICY "issue_audit_select_access"
ON public.issue_audit_logs
FOR SELECT
TO authenticated
USING (
    (
        public.is_supervisor()
        AND public.can_access_lga(lga_id)
    )
    OR
    EXISTS (
        SELECT 1
        FROM public.operational_issues oi
        WHERE oi.id = issue_audit_logs.issue_id
          AND oi.assigned_to = auth.uid()
          AND public.current_app_role()::text = 'lga_coordinator'
          AND public.can_access_lga(oi.lga_id)
    )
);


-- ------------------------------------------------------------
-- 8. VALIDATE ASSIGNEE AND ISSUE CREATION
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_operational_issue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_assignee_role text;
    v_assignee_lga uuid;
    v_role text;
    v_actor uuid;
BEGIN
    v_actor := auth.uid();
    v_role := public.current_app_role()::text;

    IF TG_OP = 'INSERT' THEN
        IF NOT public.is_supervisor() THEN
            RAISE EXCEPTION 'Only supervisors can create operational issues';
        END IF;

        IF NEW.created_by <> v_actor OR NEW.assigned_by <> v_actor THEN
            RAISE EXCEPTION 'Invalid issue creator or assigner';
        END IF;

        IF NEW.assigned_to IS NOT NULL THEN
            SELECT p.role::text, p.lga_id
            INTO v_assignee_role, v_assignee_lga
            FROM public.profiles p
            WHERE p.id = NEW.assigned_to;

            IF v_assignee_role IS DISTINCT FROM 'lga_coordinator' THEN
                RAISE EXCEPTION 'Assignee must be an LGA Coordinator';
            END IF;

            IF v_assignee_lga IS DISTINCT FROM NEW.lga_id THEN
                RAISE EXCEPTION 'Coordinator must belong to the selected LGA';
            END IF;

            NEW.status := 'assigned';
        ELSE
            NEW.status := 'open';
        END IF;

        NEW.updated_at := now();
        RETURN NEW;
    END IF;

    -- Identity and origin fields are immutable.
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.lga_id IS DISTINCT FROM OLD.lga_id
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Issue identity and origin fields cannot be changed';
    END IF;

    IF v_role = 'lga_coordinator' THEN

        IF OLD.assigned_to <> v_actor THEN
            RAISE EXCEPTION 'You can only update issues assigned to you';
        END IF;

        IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
           OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by
           OR NEW.title IS DISTINCT FROM OLD.title
           OR NEW.description IS DISTINCT FROM OLD.description
           OR NEW.category IS DISTINCT FROM OLD.category
           OR NEW.severity IS DISTINCT FROM OLD.severity
           OR NEW.deadline IS DISTINCT FROM OLD.deadline
           OR NEW.verified_by IS DISTINCT FROM OLD.verified_by
           OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
           OR NEW.closed_at IS DISTINCT FROM OLD.closed_at THEN
            RAISE EXCEPTION 'Coordinator cannot modify supervisor-controlled fields';
        END IF;

        IF NEW.status IS DISTINCT FROM OLD.status THEN
            IF NOT (
                (
                    OLD.status IN ('assigned', 'returned')
                    AND NEW.status = 'in_progress'
                )
                OR
                (
                    OLD.status = 'in_progress'
                    AND NEW.status = 'pending_verification'
                )
            ) THEN
                RAISE EXCEPTION 'Invalid coordinator status transition';
            END IF;
        END IF;

    ELSIF public.is_supervisor() THEN

        IF NEW.assigned_by IS DISTINCT FROM OLD.assigned_by
           OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
            RAISE EXCEPTION 'Original creator and assigner cannot be changed';
        END IF;

        IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
            IF NEW.assigned_to IS NOT NULL THEN
                SELECT p.role::text, p.lga_id
                INTO v_assignee_role, v_assignee_lga
                FROM public.profiles p
                WHERE p.id = NEW.assigned_to;

                IF v_assignee_role IS DISTINCT FROM 'lga_coordinator'
                   OR v_assignee_lga IS DISTINCT FROM NEW.lga_id THEN
                    RAISE EXCEPTION 'Assignee must be a coordinator in this LGA';
                END IF;
            END IF;
        END IF;

        IF NEW.status IS DISTINCT FROM OLD.status THEN
            IF NOT (
                (
                    OLD.status = 'open'
                    AND NEW.status = 'assigned'
                    AND NEW.assigned_to IS NOT NULL
                )
                OR
                (
                    OLD.status = 'assigned'
                    AND NEW.status = 'assigned'
                )
                OR
                (
                    OLD.status = 'pending_verification'
                    AND NEW.status IN ('resolved', 'returned')
                )
                OR
                (
                    OLD.status = 'resolved'
                    AND NEW.status = 'closed'
                )
            ) THEN
                RAISE EXCEPTION 'Invalid supervisor status transition';
            END IF;
        END IF;

        IF NEW.status = 'resolved' THEN
            IF NEW.assigned_to = v_actor THEN
                RAISE EXCEPTION 'You cannot verify your own assigned resolution';
            END IF;

            NEW.verified_by := v_actor;
            NEW.verified_at := now();
        END IF;

        IF NEW.status = 'closed' THEN
            NEW.closed_at := now();
        END IF;

        IF NEW.status = 'returned' THEN
            NEW.verified_by := NULL;
            NEW.verified_at := NULL;
        END IF;

    ELSE
        RAISE EXCEPTION 'Your role cannot modify operational issues';
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_operational_issue
    ON public.operational_issues;

CREATE TRIGGER trg_validate_operational_issue
BEFORE INSERT OR UPDATE ON public.operational_issues
FOR EACH ROW
EXECUTE FUNCTION public.validate_operational_issue();


-- ------------------------------------------------------------
-- 9. VALIDATE ISSUE UPDATE HISTORY
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_issue_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_issue public.operational_issues%ROWTYPE;
    v_role text;
BEGIN
    SELECT *
    INTO v_issue
    FROM public.operational_issues
    WHERE id = NEW.issue_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Operational issue not found';
    END IF;

    IF NEW.lga_id IS DISTINCT FROM v_issue.lga_id THEN
        RAISE EXCEPTION 'Update LGA does not match issue LGA';
    END IF;

    IF NEW.created_by <> auth.uid() THEN
        RAISE EXCEPTION 'Invalid update author';
    END IF;

    v_role := public.current_app_role()::text;

    IF v_role = 'lga_coordinator' THEN
        IF v_issue.assigned_to <> auth.uid() THEN
            RAISE EXCEPTION 'You are not assigned to this issue';
        END IF;

        IF NEW.update_type = 'progress' AND v_issue.status <> 'in_progress' THEN
            RAISE EXCEPTION 'Progress updates require an in-progress issue';
        END IF;

        IF NEW.update_type = 'resolution'
           AND v_issue.status <> 'pending_verification' THEN
            RAISE EXCEPTION 'Resolution updates require pending verification status';
        END IF;

        IF NEW.update_type NOT IN ('progress', 'resolution') THEN
            RAISE EXCEPTION 'Coordinator cannot create this update type';
        END IF;

    ELSIF public.is_supervisor() THEN
        IF NOT public.can_access_lga(v_issue.lga_id) THEN
            RAISE EXCEPTION 'You cannot access this LGA';
        END IF;

        IF NEW.update_type = 'verification'
           AND v_issue.status <> 'resolved' THEN
            RAISE EXCEPTION 'Verification update requires a resolved issue';
        END IF;

        IF NEW.update_type = 'returned'
           AND v_issue.status <> 'returned' THEN
            RAISE EXCEPTION 'Return update requires returned status';
        END IF;

        IF NEW.update_type NOT IN ('verification', 'returned') THEN
            RAISE EXCEPTION 'Supervisors can only create verification or return updates';
        END IF;

        IF NEW.update_type = 'verification'
           AND v_issue.verified_by <> auth.uid() THEN
            RAISE EXCEPTION 'Only the verifying supervisor can record verification';
        END IF;

    ELSE
        RAISE EXCEPTION 'Your role cannot create issue updates';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_issue_update
    ON public.issue_updates;

CREATE TRIGGER trg_validate_issue_update
BEFORE INSERT ON public.issue_updates
FOR EACH ROW
EXECUTE FUNCTION public.validate_issue_update();


-- ------------------------------------------------------------
-- 10. PREVENT EDITING OR DELETING HISTORY
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prevent_issue_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'Issue history is append-only and cannot be changed or deleted';
END;
$$;

DROP TRIGGER IF EXISTS trg_issue_updates_append_only
    ON public.issue_updates;

CREATE TRIGGER trg_issue_updates_append_only
BEFORE UPDATE OR DELETE ON public.issue_updates
FOR EACH ROW
EXECUTE FUNCTION public.prevent_issue_history_mutation();

DROP TRIGGER IF EXISTS trg_issue_audit_append_only
    ON public.issue_audit_logs;

CREATE TRIGGER trg_issue_audit_append_only
BEFORE UPDATE OR DELETE ON public.issue_audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.prevent_issue_history_mutation();


-- ------------------------------------------------------------
-- 11. AUDIT ISSUE CREATION AND CHANGES
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.audit_operational_issue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.issue_audit_logs (
            issue_id,
            lga_id,
            action,
            old_values,
            new_values,
            actor_id
        )
        VALUES (
            NEW.id,
            NEW.lga_id,
            'issue_created',
            NULL,
            to_jsonb(NEW),
            auth.uid()
        );

        RETURN NEW;
    END IF;

    INSERT INTO public.issue_audit_logs (
        issue_id,
        lga_id,
        action,
        old_values,
        new_values,
        actor_id
    )
    VALUES (
        NEW.id,
        NEW.lga_id,
        CASE
            WHEN OLD.assigned_to IS DISTINCT FROM NEW.assigned_to
                THEN 'issue_reassigned'
            WHEN OLD.status IS DISTINCT FROM NEW.status
                THEN 'status_changed'
            ELSE 'issue_updated'
        END,
        to_jsonb(OLD),
        to_jsonb(NEW),
        auth.uid()
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_operational_issue
    ON public.operational_issues;

CREATE TRIGGER trg_audit_operational_issue
AFTER INSERT OR UPDATE ON public.operational_issues
FOR EACH ROW
EXECUTE FUNCTION public.audit_operational_issue();


-- ------------------------------------------------------------
-- 12. AUDIT ISSUE UPDATE HISTORY
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.audit_issue_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.issue_audit_logs (
        issue_id,
        lga_id,
        action,
        old_values,
        new_values,
        actor_id
    )
    VALUES (
        NEW.issue_id,
        NEW.lga_id,
        'update_' || NEW.update_type,
        NULL,
        to_jsonb(NEW),
        auth.uid()
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_issue_update
    ON public.issue_updates;

CREATE TRIGGER trg_audit_issue_update
AFTER INSERT ON public.issue_updates
FOR EACH ROW
EXECUTE FUNCTION public.audit_issue_update();


-- ------------------------------------------------------------
-- 13. TABLE PRIVILEGES
-- ------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE
ON public.operational_issues
TO authenticated;

GRANT SELECT, INSERT
ON public.issue_updates
TO authenticated;

GRANT SELECT
ON public.issue_audit_logs
TO authenticated;

-- No direct audit-log write permissions.
REVOKE INSERT, UPDATE, DELETE
ON public.issue_audit_logs
FROM authenticated;

-- No history editing permissions.
REVOKE UPDATE, DELETE
ON public.issue_updates
FROM authenticated;

-- ------------------------------------------------------------
-- END OPERATIONAL ISSUES MVP
-- ------------------------------------------------------------
