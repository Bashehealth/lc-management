CREATE OR REPLACE FUNCTION public.get_feedback_author_names(
    p_comment_ids uuid[]
)
RETURNS TABLE (
    comment_id uuid,
    author_name text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
    SELECT
        c.id AS comment_id,
        COALESCE(author.full_name, 'Unknown user') AS author_name
    FROM public.task_comments AS c
    JOIN public.tasks AS t
        ON t.id = c.task_id
    JOIN public.profiles AS viewer
        ON viewer.id = auth.uid()
    LEFT JOIN public.profiles AS author
        ON author.id = c.author_id
    WHERE
        c.id = ANY(p_comment_ids)
        AND auth.uid() IS NOT NULL
        AND (
            (
                viewer.role = 'lga_coordinator'
                AND c.addressed_to_role = 'lga_coordinator'
                AND public.can_access_lga(t.lga_id)
            )
            OR
            (
                viewer.role = 'state_coordinator'
                AND c.addressed_to_role = 'state_coordinator'
            )
            OR
            (
                viewer.role = 'senior_supervisor'
                AND c.author_id = auth.uid()
            )
        );
$$;

REVOKE ALL ON FUNCTION public.get_feedback_author_names(uuid[])
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_feedback_author_names(uuid[])
TO authenticated;
