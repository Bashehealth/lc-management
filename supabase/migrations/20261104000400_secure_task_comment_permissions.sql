-- Restrict task comment visibility to the intended recipients.
DROP POLICY IF EXISTS comments_read ON public.task_comments;

CREATE POLICY comments_read
ON public.task_comments
FOR SELECT
TO authenticated
USING (
    (
        public.current_app_role() = 'lga_coordinator'
        AND addressed_to_role = 'lga_coordinator'
        AND EXISTS (
            SELECT 1
            FROM public.tasks AS t
            WHERE t.id = task_id
              AND public.can_access_lga(t.lga_id)
        )
    )
    OR
    (
        public.current_app_role() = 'state_coordinator'
        AND addressed_to_role = 'state_coordinator'
    )
    OR
    (
        public.current_app_role() = 'senior_supervisor'
        AND author_id = auth.uid()
    )
);

-- Only Senior Supervisors may create operational feedback.
-- The authenticated user must be the actual comment author.
DROP POLICY IF EXISTS comments_create ON public.task_comments;

CREATE POLICY comments_create
ON public.task_comments
FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() IS NOT NULL
    AND author_id = auth.uid()
    AND author_role = 'senior_supervisor'
    AND public.current_app_role() = 'senior_supervisor'
    AND addressed_to_role IN (
        'lga_coordinator',
        'state_coordinator'
    )
    AND EXISTS (
        SELECT 1
        FROM public.tasks AS t
        WHERE t.id = task_id
          AND public.can_access_lga(t.lga_id)
    )
);
