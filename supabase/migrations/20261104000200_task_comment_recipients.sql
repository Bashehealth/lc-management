-- Allow task comments to be addressed to a specific responsible role.
ALTER TABLE public.task_comments
ADD COLUMN addressed_to_role text;

ALTER TABLE public.task_comments
ADD CONSTRAINT task_comments_addressed_to_role_check
CHECK (
  addressed_to_role IS NULL
  OR addressed_to_role IN ('lga_coordinator', 'state_coordinator')
);

CREATE INDEX task_comments_task_created_idx
ON public.task_comments (task_id, created_at);