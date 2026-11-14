SELECT plan(24);
SET LOCAL ROLE authenticated;

-- LC: assigned LGA reads, cross-LGA is hidden, active assignment permits only
-- progress updates, and expired assignments do not authorize updates.
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000001',true);
SELECT is((SELECT count(*)::integer FROM public.monthly_plans WHERE lga_id='20000000-0000-4000-8000-000000000001'),1,'LC reads own LGA plan');
SELECT is((SELECT count(*)::integer FROM public.monthly_plans WHERE lga_id='20000000-0000-4000-8000-000000000003'),0,'LC cannot read another LGA plan');
SELECT is((WITH changed AS (UPDATE public.tasks SET progress_percent=25,updated_by=auth.uid() WHERE id='52000000-0000-4000-8000-000000000001' RETURNING id) SELECT count(*)::integer FROM changed),1,'assigned LC can update task progress');
SELECT throws_ok($$UPDATE public.tasks SET status='ongoing' WHERE id='52000000-0000-4000-8000-000000000001'$$,'42501','LGA Coordinators may update only task progress','LC cannot change task status');
SELECT throws_ok($$UPDATE public.tasks SET completed_at=now() WHERE id='52000000-0000-4000-8000-000000000001'$$,'42501','LGA Coordinators may update only task progress','LC cannot update task administrative fields');
SELECT throws_ok($$UPDATE public.tasks SET lga_id='20000000-0000-4000-8000-000000000002' WHERE id='52000000-0000-4000-8000-000000000001'$$,'42501','not authorized for this LGA','LC cannot change task LGA');
SELECT is((WITH changed AS (UPDATE public.task_assignments SET assignee_id='30000000-0000-4000-8000-000000000002' WHERE id='53000000-0000-4000-8000-000000000001' RETURNING id) SELECT count(*)::integer FROM changed),0,'LC cannot change task assignment');
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000101',true);
UPDATE public.task_assignments SET unassigned_at=now() WHERE id='53000000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000001',true);
SELECT is((WITH changed AS (UPDATE public.tasks SET progress_percent=40,updated_by=auth.uid() WHERE id='52000000-0000-4000-8000-000000000001' RETURNING id) SELECT count(*)::integer FROM changed),0,'unassigned LC cannot update task');

-- SC and Senior Supervisor: access only their assigned state's LGAs.
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000101',true);
SELECT is((SELECT count(*)::integer FROM public.monthly_plans WHERE lga_id='20000000-0000-4000-8000-000000000001'),1,'SC reads same-state LGA');
SELECT is((SELECT count(*)::integer FROM public.monthly_plans WHERE lga_id='20000000-0000-4000-8000-000000000003'),0,'SC cannot read cross-state LGA');
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000201',true);
SELECT is((SELECT count(*)::integer FROM public.monthly_plans WHERE lga_id='20000000-0000-4000-8000-000000000001'),1,'Senior Supervisor reads same-state LGA');
SELECT is((SELECT count(*)::integer FROM public.monthly_plans WHERE lga_id='20000000-0000-4000-8000-000000000003'),0,'Senior Supervisor cannot read cross-state LGA');

-- DPM can monitor cross-LGA working days but has no update authority.
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000301',true);
SELECT is((SELECT count(*)::integer FROM public.working_day_records WHERE id IN ('54000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000002')),2,'DPM can monitor records across states');
SELECT is((WITH changed AS (UPDATE public.working_day_records SET claim_note='unauthorized' WHERE id='54000000-0000-4000-8000-000000000001' RETURNING id) SELECT count(*)::integer FROM changed),0,'DPM cannot modify working-day records');

-- State -> Management movement workflow and final-stage-only authority.
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000101',true);
SELECT is((SELECT count(*)::integer FROM public.movement_requests WHERE id='57000000-0000-4000-8000-000000000001'),1,'SC reads same-state movement request');
SELECT is((WITH changed AS (UPDATE public.movement_requests SET status='pending_management',state_reviewed_by=auth.uid(),state_reviewed_at=now(),state_recommendation='Recommended for final review' WHERE id='57000000-0000-4000-8000-000000000001' RETURNING id) SELECT count(*)::integer FROM changed),1,'SC can forward an in-state request');
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000401',true);
SELECT throws_ok($$UPDATE public.movement_requests SET status='approved',management_decided_by=auth.uid(),management_decided_at=now(),management_decision_note=NULL WHERE id='57000000-0000-4000-8000-000000000001'$$,'42501','Invalid Management final decision','Management decision requires a note');
SELECT is((WITH changed AS (UPDATE public.movement_requests SET status='approved',management_decided_by=auth.uid(),management_decided_at=now(),management_decision_note='Approved after final review' WHERE id='57000000-0000-4000-8000-000000000001' RETURNING id) SELECT count(*)::integer FROM changed),1,'Management can make final-stage decision');
SELECT is((SELECT count(*)::integer FROM public.movement_request_history WHERE movement_request_id='57000000-0000-4000-8000-000000000001' AND new_status='approved'),1,'Management decision is in persistent history');
SELECT throws_ok($$UPDATE public.movement_request_history SET decision_note='tampered' WHERE movement_request_id='57000000-0000-4000-8000-000000000001'$$,'42501','permission denied for table movement_request_history','movement history cannot be edited');
RESET ROLE;
SELECT throws_ok($$UPDATE public.movement_request_history SET decision_note='tampered' WHERE movement_request_id='57000000-0000-4000-8000-000000000001'$$,'42501','Movement request history is append-only','history trigger blocks even privileged edits');
SET LOCAL ROLE authenticated;

-- Boss has no direct operational-table reporting access. A separate narrow
-- reporting RPC/view contract remains a proposal and is not presumed here.
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000501',true);
SELECT is((SELECT count(*)::integer FROM public.reports),0,'Boss cannot directly read operational report rows');

SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000401',true);
SELECT is((WITH changed AS (UPDATE public.movement_requests SET status='approved',management_decided_by=auth.uid(),management_decided_at=now(),management_decision_note='Unauthorized early decision' WHERE id='57000000-0000-4000-8000-000000000001' RETURNING id) SELECT count(*)::integer FROM changed),0,'Management cannot decide before SC review stage');

-- Atomic duplicate index regression. The seeded trip has the matching interval.
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000001',true);
SELECT throws_ok($$INSERT INTO public.movement_requests (lga_id,requested_by,reason,destination,departure_at,expected_return_at) SELECT lga_id,requested_by,reason,destination,departure_at,expected_return_at FROM public.movement_requests WHERE id='57000000-0000-4000-8000-000000000001'$$,'23505','duplicate key value violates unique constraint "movement_requests_active_trip_unique"','duplicate active trip is rejected atomically');

SELECT * FROM finish();
