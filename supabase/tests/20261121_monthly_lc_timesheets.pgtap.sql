-- Isolated local database only. Requires 20261120 state directory, the DPM
-- state overview proposal, 20261121 timesheet proposal, and supabase/seed.sql.
SELECT plan(26);
SET LOCAL ROLE authenticated;

SELECT is((SELECT count(*)::integer FROM public.states WHERE is_active),15,'the configured programme directory has 15 active states');
SELECT is((SELECT count(DISTINCT code)::integer FROM public.states WHERE is_active),15,'each programme state has one unique code');

-- A State Coordinator verifies an existing fixture record before the DPM
-- preview. The source record remains linked to the real fixture LC and LGA.
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000101',true);
SELECT lives_ok($$SELECT public.review_working_day_claim('54000000-0000-4000-8000-000000000001','approved','Local fixture verified')$$,'SC can verify the fixture working-day claim');

SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000301',true);
SELECT is((SELECT count(*)::integer FROM public.dpm_state_overview()),15,'DPM aggregate RPC lists all configured programme states');
SELECT is((SELECT count(*)::integer FROM public.dpm_monthly_timesheet_preview(date '2026-11-01')),4,'monthly preview includes every assigned test LC across both states');
SELECT is((SELECT total_submitted_days::integer FROM public.dpm_monthly_timesheet_preview(date '2026-11-01') WHERE lc_id='30000000-0000-4000-8000-000000000001'),1,'preview counts one submitted source day for the assigned LC');
SELECT is((SELECT verified_days::integer FROM public.dpm_monthly_timesheet_preview(date '2026-11-01') WHERE lc_id='30000000-0000-4000-8000-000000000001'),1,'only the approved source entry counts as verified');
SELECT is((SELECT pending_review_records::integer FROM public.dpm_monthly_timesheet_preview(date '2026-11-01') WHERE lc_id='30000000-0000-4000-8000-000000000001'),0,'approved entry is no longer pending review');
SELECT is((SELECT count(DISTINCT source_fingerprint)::integer FROM public.dpm_monthly_timesheet_preview(date '2026-11-01')),1,'all preview rows share the same reviewed source fingerprint');

SELECT lives_ok($$SELECT public.dpm_submit_monthly_timesheet(date '2026-11-01',(SELECT source_fingerprint FROM public.dpm_monthly_timesheet_preview(date '2026-11-01') LIMIT 1))$$,'DPM can submit one immutable snapshot from the reviewed preview');
SELECT is((SELECT count(*)::integer FROM public.dpm_monthly_timesheet_list() WHERE reporting_month=date '2026-11-01'),1,'DPM submission appears in persistent history');
SELECT is((SELECT status FROM public.dpm_monthly_timesheet_list() WHERE reporting_month=date '2026-11-01'),'submitted','snapshot enters Boss review');
SELECT throws_ok($$SELECT public.dpm_submit_monthly_timesheet(date '2026-11-01',(SELECT source_fingerprint FROM public.dpm_monthly_timesheet_preview(date '2026-11-01') LIMIT 1))$$,'55000','A submitted or approved timesheet already exists for this month.','DPM cannot submit a duplicate monthly snapshot');
SELECT ok(NOT has_table_privilege('authenticated','public.monthly_lc_timesheets','UPDATE'),'authenticated clients cannot update snapshot headers directly');

-- Existing (LGA, date) uniqueness and snapshot source uniqueness prevent a
-- duplicate source day from inflating the submitted count.
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000001',true);
SELECT throws_ok($$INSERT INTO public.working_day_records(lga_id,working_date,submitted_by) VALUES('20000000-0000-4000-8000-000000000001',date '2026-11-03',auth.uid())$$,'23505','duplicate key value violates unique constraint "working_day_records_lga_id_working_date_key"','same LGA cannot submit a duplicate working day');
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000301',true);
SELECT throws_ok($$SELECT * FROM public.boss_monthly_timesheet_list()$$,'42501','Boss access required','DPM cannot call Boss approval queue');

SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000501',true);
SELECT is((SELECT count(*)::integer FROM public.boss_monthly_timesheet_list() WHERE reporting_month=date '2026-11-01' AND status='submitted'),1,'Boss sees the submitted snapshot with preparer and submitter');
SELECT is(jsonb_array_length(public.boss_monthly_timesheet_details((SELECT timesheet_id FROM public.boss_monthly_timesheet_list() WHERE reporting_month=date '2026-11-01')) -> 'lines'),4,'Boss can inspect all four LGA Coordinator lines');
SELECT is(jsonb_array_length(public.boss_monthly_timesheet_details((SELECT timesheet_id FROM public.boss_monthly_timesheet_list() WHERE reporting_month=date '2026-11-01')) -> 'sources'),1,'Boss can inspect the exact source working-day record');
SELECT is((public.boss_monthly_timesheet_details((SELECT timesheet_id FROM public.boss_monthly_timesheet_list() WHERE reporting_month=date '2026-11-01')) #>> '{sources,0,status_snapshot}'),'approved','snapshot preserves the approved source status');
SELECT throws_ok($$SELECT public.boss_decide_monthly_timesheet((SELECT timesheet_id FROM public.boss_monthly_timesheet_list() WHERE reporting_month=date '2026-11-01'),'approved','  ')$$,'22023','Choose approve or reject and provide a decision note of at least 3 characters.','Boss decision requires a note');
SELECT lives_ok($$SELECT public.boss_decide_monthly_timesheet((SELECT timesheet_id FROM public.boss_monthly_timesheet_list() WHERE reporting_month=date '2026-11-01'),'approved','Reviewed and verified in isolated test')$$,'Boss can approve the submitted snapshot with a required note');
SELECT is((SELECT status FROM public.boss_monthly_timesheet_list() WHERE reporting_month=date '2026-11-01'),'approved','Boss approval is persisted');
SELECT is(jsonb_array_length(public.boss_monthly_timesheet_details((SELECT timesheet_id FROM public.boss_monthly_timesheet_list() WHERE reporting_month=date '2026-11-01')) -> 'events'),2,'submission and decision history are both present');
SELECT throws_ok($$SELECT public.boss_decide_monthly_timesheet((SELECT timesheet_id FROM public.boss_monthly_timesheet_list() WHERE reporting_month=date '2026-11-01'),'approved','Duplicate decision attempt')$$,'55000','Only a submitted timesheet can receive one decision.','Boss cannot decide the same version twice');
SELECT is((SELECT count(*)::integer FROM public.working_day_records),0,'Boss still has no direct working-day table access');

RESET ROLE;
SELECT * FROM finish();
