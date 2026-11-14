-- Integration regression script for the proposal in
-- supabase/proposals/20261115_task_movement_state_integrity.sql.
-- RUN ONLY against an isolated dev/test DB after applying that proposal.
-- Requires psql variables containing pre-provisioned profile/LGA UUIDs:
--   lc_assigned, lc_same_lga_unassigned, lc_other_state, sc_yobe,
--   senior_yobe, sc_other_state, management, boss, dpm,
--   yobe_lga, other_state_lga.
-- Test Auth users/profiles must exist; this script creates only rolled-back
-- application rows. It does not create credentials or connect to any project.

\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;

CREATE OR REPLACE FUNCTION pg_temp.expect_sqlstate(label text, expected_state text, statement text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual_state text;
BEGIN
  EXECUTE statement;
  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('unexpected success: %s', label);
EXCEPTION WHEN OTHERS THEN
  actual_state := SQLSTATE;
  IF actual_state <> expected_state THEN
    RAISE EXCEPTION 'Test % expected SQLSTATE %, received %: %', label, expected_state, actual_state, SQLERRM;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_no_rows(label text, query text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE row_count integer;
BEGIN
  EXECUTE format('SELECT count(*) FROM (%s) AS test_rows', query) INTO row_count;
  IF row_count <> 0 THEN RAISE EXCEPTION 'Test % expected 0 rows, got %', label, row_count; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_true(label text, condition boolean)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Test failed: %', label; END IF;
END;
$$;

-- Supervisor creates a task and two assignments in its state. One assignment
-- remains active; the other is ended to exercise expiration behavior.
SELECT set_config('request.jwt.claim.sub', :'sc_yobe', true);
INSERT INTO public.tasks (lga_id, source, title, expected_deliverable, created_by)
VALUES (:'yobe_lga', 'custom_operational', 'Integrity active assignment', 'Progress evidence', auth.uid())
RETURNING id AS active_task_id \gset
INSERT INTO public.task_assignments (task_id, lga_id, assignee_id, assigned_by)
VALUES (:'active_task_id', :'yobe_lga', :'lc_assigned', auth.uid());

INSERT INTO public.tasks (lga_id, source, title, expected_deliverable, created_by)
VALUES (:'yobe_lga', 'custom_operational', 'Integrity ended assignment', 'Progress evidence', auth.uid())
RETURNING id AS ended_task_id \gset
INSERT INTO public.task_assignments (task_id, lga_id, assignee_id, assigned_by)
VALUES (:'ended_task_id', :'yobe_lga', :'lc_assigned', auth.uid())
RETURNING id AS ended_assignment_id \gset
UPDATE public.task_assignments SET unassigned_at = now() WHERE id = :'ended_assignment_id';

INSERT INTO public.tasks (lga_id, source, title, expected_deliverable, created_by)
VALUES (:'yobe_lga', 'custom_operational', 'Integrity unassigned task', 'Progress evidence', auth.uid())
RETURNING id AS unassigned_task_id \gset

-- Create a request fixture in another state and an unreviewed request in Yobe.
SELECT set_config('request.jwt.claim.sub', :'lc_other_state', true);
INSERT INTO public.movement_requests (lga_id, requested_by, destination, reason, departure_at, expected_return_at)
VALUES (:'other_state_lga', auth.uid(), 'Other State Hub', 'Other state fixture', now() + interval '10 days', now() + interval '10 days 8 hours')
RETURNING id AS foreign_request_id \gset

SELECT set_config('request.jwt.claim.sub', :'lc_assigned', true);
SELECT (now() + interval '20 days')::timestamptz AS request_departure \gset
SELECT (now() + interval '20 days 8 hours')::timestamptz AS request_return \gset
INSERT INTO public.movement_requests (lga_id, requested_by, destination, reason, departure_at, expected_return_at)
VALUES (:'yobe_lga', auth.uid(), 'Damaturu Office', 'Routine coordination', :'request_departure', :'request_return')
RETURNING id AS yobe_request_id \gset

-- LC task access: active assignment succeeds; ended and never-assigned rows do not.
UPDATE public.tasks SET progress_percent = 25, updated_by = auth.uid()
WHERE id = :'active_task_id' AND lga_id = :'yobe_lga';
SELECT pg_temp.expect_true('LC progress update is saved without changing status',
  (SELECT progress_percent = 25 AND status = 'planned' FROM public.tasks WHERE id = :'active_task_id'));
SELECT pg_temp.expect_sqlstate('LC cannot change task status', '42501',
  $sql$UPDATE public.tasks SET status = 'ongoing', updated_by = auth.uid() WHERE id = :'active_task_id'$sql$);
SELECT pg_temp.expect_sqlstate('LC cannot change task title', '42501',
  $sql$UPDATE public.tasks SET title = 'forged title', updated_by = auth.uid() WHERE id = :'active_task_id'$sql$);
SELECT pg_temp.expect_no_rows('LC cannot update a never-assigned task',
  $sql$WITH changed AS (UPDATE public.tasks SET progress_percent = 50, updated_by = auth.uid() WHERE id = :'unassigned_task_id' RETURNING id) SELECT id FROM changed$sql$);
SELECT pg_temp.expect_no_rows('ended assignment does not authorize LC update',
  $sql$WITH changed AS (UPDATE public.tasks SET progress_percent = 50, updated_by = auth.uid() WHERE id = :'ended_task_id' RETURNING id) SELECT id FROM changed$sql$);

-- SC oversight works in-state; a different-state SC cannot read or update it.
SELECT set_config('request.jwt.claim.sub', :'sc_yobe', true);
SELECT pg_temp.expect_true('same-state SC can read task', EXISTS (SELECT 1 FROM public.tasks WHERE id = :'active_task_id'));
UPDATE public.tasks SET status = 'ongoing', updated_by = auth.uid()
WHERE id = :'active_task_id' AND lga_id = :'yobe_lga';
SELECT set_config('request.jwt.claim.sub', :'sc_other_state', true);
SELECT pg_temp.expect_no_rows('other-state SC cannot read Yobe task',
  $sql$SELECT id FROM public.tasks WHERE id = :'active_task_id'$sql$);
SELECT pg_temp.expect_no_rows('other-state SC cannot update Yobe task',
  $sql$WITH changed AS (UPDATE public.tasks SET status = 'completed', updated_by = auth.uid() WHERE id = :'active_task_id' RETURNING id) SELECT id FROM changed$sql$);
SELECT set_config('request.jwt.claim.sub', :'senior_yobe', true);
SELECT pg_temp.expect_true('same-state Senior Supervisor can read task', EXISTS (SELECT 1 FROM public.tasks WHERE id = :'active_task_id'));

-- A same-LGA LC who is not assigned to the task cannot update it.
SELECT set_config('request.jwt.claim.sub', :'lc_same_lga_unassigned', true);
SELECT pg_temp.expect_no_rows('same-LGA unassigned LC cannot update another assignment',
  $sql$WITH changed AS (UPDATE public.tasks SET progress_percent = 75, updated_by = auth.uid() WHERE id = :'active_task_id' RETURNING id) SELECT id FROM changed$sql$);

-- Boss and DPM have no task/movement operational-table scope.
SELECT set_config('request.jwt.claim.sub', :'boss', true);
SELECT pg_temp.expect_no_rows('Boss cannot read task rows', $sql$SELECT id FROM public.tasks$sql$);
SELECT pg_temp.expect_no_rows('Boss cannot read movement rows', $sql$SELECT id FROM public.movement_requests$sql$);
SELECT set_config('request.jwt.claim.sub', :'dpm', true);
SELECT pg_temp.expect_no_rows('DPM cannot read task rows', $sql$SELECT id FROM public.tasks$sql$);
SELECT pg_temp.expect_no_rows('DPM cannot read movement rows', $sql$SELECT id FROM public.movement_requests$sql$);

-- Movement request scope and stage transitions.
SELECT set_config('request.jwt.claim.sub', :'sc_yobe', true);
SELECT pg_temp.expect_true('same-state SC can read Yobe movement request', EXISTS (SELECT 1 FROM public.movement_requests WHERE id = :'yobe_request_id'));
SELECT pg_temp.expect_no_rows('Yobe SC cannot read other-state request',
  $sql$SELECT id FROM public.movement_requests WHERE id = :'foreign_request_id'$sql$);
SELECT pg_temp.expect_sqlstate('SC cannot forward without a decision note', '42501',
  $sql$UPDATE public.movement_requests SET status = 'pending_management', state_reviewed_by = auth.uid(), state_reviewed_at = now(), state_recommendation = '  ' WHERE id = :'yobe_request_id'$sql$);
SELECT pg_temp.expect_sqlstate('SC cannot issue a same-status review update', '42501',
  $sql$UPDATE public.movement_requests SET state_reviewed_by = auth.uid(), state_reviewed_at = now(), state_recommendation = 'Return note' WHERE id = :'yobe_request_id' AND status = 'pending_state_review'$sql$);
SELECT set_config('request.jwt.claim.sub', :'senior_yobe', true);
SELECT pg_temp.expect_no_rows('Senior Supervisor cannot perform SC movement review',
  $sql$WITH changed AS (UPDATE public.movement_requests SET status = 'returned_to_lga', state_reviewed_by = auth.uid(), state_reviewed_at = now(), state_recommendation = 'Return this request' WHERE id = :'yobe_request_id' RETURNING id) SELECT id FROM changed$sql$);
SELECT set_config('request.jwt.claim.sub', :'sc_yobe', true);
UPDATE public.movement_requests
SET status = 'returned_to_lga', state_reviewed_by = auth.uid(), state_reviewed_at = now(), state_recommendation = 'Please clarify the travel purpose'
WHERE id = :'yobe_request_id' AND status = 'pending_state_review';
SELECT pg_temp.expect_true('State return is appended to history', EXISTS (
  SELECT 1 FROM public.movement_request_history WHERE movement_request_id = :'yobe_request_id' AND new_status = 'returned_to_lga' AND decision_note = 'Please clarify the travel purpose'
));
SELECT set_config('request.jwt.claim.sub', :'lc_assigned', true);
SELECT (:'request_departure'::timestamptz + interval '30 minutes') AS revised_departure \gset
SELECT (:'request_return'::timestamptz + interval '30 minutes') AS revised_return \gset
UPDATE public.movement_requests
SET destination = 'Damaturu Office Annex', reason = 'Revised routine coordination', departure_at = :'revised_departure', expected_return_at = :'revised_return',
    status = 'pending_state_review', state_reviewed_by = NULL, state_reviewed_at = NULL, state_recommendation = NULL,
    management_decided_by = NULL, management_decided_at = NULL, management_decision_note = NULL
WHERE id = :'yobe_request_id' AND status = 'returned_to_lga' AND requested_by = auth.uid();
SELECT pg_temp.expect_true('LC resubmission history is appended', EXISTS (
  SELECT 1 FROM public.movement_request_history WHERE movement_request_id = :'yobe_request_id' AND new_status = 'pending_state_review' AND action = 'resubmitted'
));
SELECT pg_temp.expect_true('LC can read its recorded request revision', EXISTS (
  SELECT 1 FROM public.movement_request_revisions WHERE movement_request_id = :'yobe_request_id' AND revised_by = auth.uid()
));
SELECT set_config('request.jwt.claim.sub', :'sc_yobe', true);
UPDATE public.movement_requests
SET status = 'pending_management', state_reviewed_by = auth.uid(), state_reviewed_at = now(), state_recommendation = 'Recommended for approval'
WHERE id = :'yobe_request_id' AND status = 'pending_state_review';
SELECT pg_temp.expect_true('State review is appended to history', EXISTS (
  SELECT 1 FROM public.movement_request_history WHERE movement_request_id = :'yobe_request_id' AND new_status = 'pending_management' AND decision_note = 'Recommended for approval'
));
SELECT pg_temp.expect_no_rows('SC cannot perform Management final decision',
  $sql$WITH changed AS (UPDATE public.movement_requests SET status = 'approved', management_decided_by = auth.uid(), management_decided_at = now(), management_decision_note = 'not authorized' WHERE id = :'yobe_request_id' RETURNING id) SELECT id FROM changed$sql$);

-- Management cannot decide before State review, then can make one final decision.
SELECT set_config('request.jwt.claim.sub', :'management', true);
SELECT pg_temp.expect_no_rows('Management cannot decide a pending-State request',
  $sql$WITH changed AS (UPDATE public.movement_requests SET status = 'approved', management_decided_by = auth.uid(), management_decided_at = now(), management_decision_note = 'premature decision' WHERE id = :'foreign_request_id' RETURNING id) SELECT id FROM changed$sql$);
SELECT pg_temp.expect_true('Management can read State-forwarded history', EXISTS (
  SELECT 1 FROM public.movement_request_history WHERE movement_request_id = :'yobe_request_id' AND new_status = 'pending_management'
));
UPDATE public.movement_requests
SET status = 'approved', management_decided_by = auth.uid(), management_decided_at = now(), management_decision_note = 'Approved for stated purpose'
WHERE id = :'yobe_request_id' AND status = 'pending_management';
SELECT pg_temp.expect_true('final decision and note are persisted in history', EXISTS (
  SELECT 1 FROM public.movement_request_history WHERE movement_request_id = :'yobe_request_id' AND new_status = 'approved' AND decision_note = 'Approved for stated purpose'
));
SELECT pg_temp.expect_no_rows('duplicate final decision affects no row',
  $sql$WITH changed AS (UPDATE public.movement_requests SET status = 'rejected', management_decided_by = auth.uid(), management_decided_at = now(), management_decision_note = 'Second decision' WHERE id = :'yobe_request_id' AND status = 'pending_management' RETURNING id) SELECT id FROM changed$sql$);

-- Management is statewide in this model because its profile has no state_id;
-- it remains limited to requests that passed SC review.
SELECT set_config('request.jwt.claim.sub', :'sc_other_state', true);
UPDATE public.movement_requests
SET status = 'pending_management', state_reviewed_by = auth.uid(), state_reviewed_at = now(), state_recommendation = 'Other state recommendation'
WHERE id = :'foreign_request_id' AND status = 'pending_state_review';
SELECT set_config('request.jwt.claim.sub', :'management', true);
SELECT pg_temp.expect_true('Management can view state-forwarded request in another state', EXISTS (SELECT 1 FROM public.movement_requests WHERE id = :'foreign_request_id'));
UPDATE public.movement_requests
SET status = 'rejected', management_decided_by = auth.uid(), management_decided_at = now(), management_decision_note = 'Rejected after review'
WHERE id = :'foreign_request_id' AND status = 'pending_management';
SELECT pg_temp.expect_true('other-state final decision was recorded', EXISTS (
  SELECT 1 FROM public.movement_request_history WHERE movement_request_id = :'foreign_request_id' AND new_status = 'rejected' AND decision_note = 'Rejected after review'
));

-- Active-trip duplicate protection is atomic at the database index.
SELECT set_config('request.jwt.claim.sub', :'lc_assigned', true);
SELECT pg_temp.expect_sqlstate('identical active trip is rejected atomically', '23505',
  $sql$INSERT INTO public.movement_requests (lga_id, requested_by, destination, reason, departure_at, expected_return_at)
       VALUES (:'yobe_lga', auth.uid(), 'Damaturu Office Annex', 'Revised routine coordination', :'revised_departure', :'revised_return')$sql$);

-- Authenticated users cannot mutate the append-only decision history.
SELECT set_config('request.jwt.claim.sub', :'management', true);
SELECT pg_temp.expect_sqlstate('history update is denied', '42501',
  $sql$UPDATE public.movement_request_history SET decision_note = 'rewrite' WHERE movement_request_id = :'yobe_request_id'$sql$);
SELECT pg_temp.expect_sqlstate('history delete is denied', '42501',
  $sql$DELETE FROM public.movement_request_history WHERE movement_request_id = :'yobe_request_id'$sql$);

SELECT 'Task and movement integrity proposal regression script passed; transaction rolled back.' AS result;
ROLLBACK;
