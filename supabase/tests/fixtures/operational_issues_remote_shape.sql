-- Local-only test fixture matching the verified remote Operational Issues
-- column shape. It is not an application migration and is never run remotely.
CREATE TABLE public.operational_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lga_id uuid NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  severity text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  assigned_to uuid,
  assigned_by uuid,
  deadline date,
  resolution_note text,
  verified_by uuid,
  verified_at timestamptz,
  closed_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.operational_issues ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.operational_issues TO authenticated;

CREATE POLICY operational_issues_read
ON public.operational_issues FOR SELECT TO authenticated
USING (public.can_access_lga(lga_id));

CREATE POLICY operational_issues_create
ON public.operational_issues FOR INSERT TO authenticated
WITH CHECK (public.is_supervisor() AND created_by = auth.uid() AND public.can_access_lga(lga_id));

CREATE POLICY operational_issues_supervisor_update
ON public.operational_issues FOR UPDATE TO authenticated
USING (public.is_supervisor())
WITH CHECK (public.is_supervisor());

CREATE POLICY operational_issues_assignee_update
ON public.operational_issues FOR UPDATE TO authenticated
USING (public.can_access_lga(lga_id) AND assigned_to = auth.uid() AND status NOT IN ('resolved','closed'))
WITH CHECK (public.can_access_lga(lga_id) AND assigned_to = auth.uid());
