-- DPM security hardening: least-privilege table grants

REVOKE ALL ON public.working_day_records FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.working_day_approvals FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.leave_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.leave_request_decisions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.states FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE
ON public.working_day_records TO authenticated;

GRANT SELECT, INSERT
ON public.working_day_approvals TO authenticated;

GRANT SELECT, INSERT
ON public.leave_requests TO authenticated;

GRANT SELECT
ON public.leave_request_decisions TO authenticated;

GRANT SELECT
ON public.states TO authenticated;
