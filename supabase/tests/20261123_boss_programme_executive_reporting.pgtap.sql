-- Isolated local tests only. Requires the state-directory, contact-data and
-- Boss executive reporting proposals plus supabase/seed.sql.
SELECT plan(34);
SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000501',true);
SELECT lives_ok($$SELECT public.boss_executive_overview(date '2026-11-01')$$,'Boss can load the programme overview');
SELECT is((public.boss_executive_overview(date '2026-11-01') #>> '{summary,programme_state_count}'),'15','overview reports the 15-state programme directory');
SELECT is(jsonb_array_length(public.boss_executive_overview(date '2026-11-01')->'states'),15,'all 15 configured states are included');
SELECT is((SELECT count(*)::integer FROM jsonb_array_elements(public.boss_executive_overview(date '2026-11-01')->'states') state WHERE state->>'state_code'='NG-BO' AND state->>'lga_coordinators'='0' AND state->>'state_coordinators'='0' AND state->>'senior_supervisors'='0'),1,'a state with no personnel remains visible with zero personnel counts');
SELECT is((public.boss_executive_overview(date '2026-11-01') #>> '{summary,lga_coordinator_count}'),'4','overview counts registered LGA Coordinators from profiles');
SELECT is((public.boss_executive_overview(date '2026-11-01') #>> '{summary,state_coordinator_count}'),'2','overview counts registered State Coordinators from profiles');
SELECT is((public.boss_executive_overview(date '2026-11-01') #>> '{summary,senior_supervisor_count}'),'3','overview counts registered Senior Supervisors from profiles');
SELECT is((public.boss_executive_overview(date '2026-11-01') #>> '{summary,active_lga_count}'),NULL,'unknown LGA activity is not assumed');

SELECT is((SELECT count(*)::integer FROM public.boss_personnel_directory(NULL,NULL,NULL,date '2026-11-01')),9,'Boss can view all authorized directory personnel');
SELECT is((SELECT count(*)::integer FROM public.boss_personnel_directory((SELECT id FROM public.states WHERE code='NG-YO'),NULL,NULL,date '2026-11-01')),5,'state filter returns only Yobe profiles');
SELECT is((SELECT count(*)::integer FROM public.boss_personnel_directory(NULL,'state_coordinator',NULL,date '2026-11-01')),2,'role filter returns only State Coordinators');
SELECT is((SELECT count(*)::integer FROM public.boss_personnel_directory((SELECT id FROM public.states WHERE code='NG-YO'),'lga_coordinator',NULL,date '2026-11-01')),2,'state and role filters combine');
SELECT is((SELECT email FROM public.boss_personnel_directory(NULL,'lga_coordinator','Bade',date '2026-11-01') WHERE person_id='30000000-0000-4000-8000-000000000001'),'lc.bade@ehealth-lc.test','name search returns the linked Auth email only');
SELECT is((SELECT phone_number FROM public.boss_personnel_directory(NULL,'lga_coordinator','Bade',date '2026-11-01') WHERE person_id='30000000-0000-4000-8000-000000000001'),NULL::text,'missing phone data remains null');

SELECT is(jsonb_array_length(public.boss_state_drilldown((SELECT id FROM public.states WHERE code='NG-YO'),date '2026-11-01')->'lgas'),2,'state drilldown includes both assigned LGAs');
SELECT is((public.boss_state_drilldown((SELECT id FROM public.states WHERE code='NG-YO'),date '2026-11-01') #>> '{state,state_coordinators}'),'1','state drilldown shows the registered SC count');
SELECT is((SELECT count(*)::integer FROM public.boss_lga_comparisons()),4,'Boss comparisons stay within the two fixture programme states');
SELECT lives_ok($$SELECT * FROM public.boss_report_archive()$$,'Boss can read the approved archive contract');

SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000101',true);
SELECT lives_ok($sql$
DO $body$
BEGIN
  IF EXISTS (SELECT 1 FROM public.working_day_records WHERE id='54000000-0000-4000-8000-000000000001' AND status::text='claimed') THEN
    PERFORM public.review_working_day_claim('54000000-0000-4000-8000-000000000001','approved','Boss dashboard test fixture verified');
  END IF;
END
$body$;
$sql$,'SC review fixture remains approved when earlier isolated tests already reviewed it');
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000501',true);
SELECT is((SELECT sum(approved_days)::integer FROM public.boss_working_day_overview(date '2026-11-01')),1,'approved records alone count as verified');
SELECT is((SELECT sum(pending_days)::integer FROM public.boss_working_day_overview(date '2026-11-01')),1,'claimed records remain pending and unverified');
SELECT is((SELECT sum(returned_days)::integer FROM public.boss_working_day_overview(date '2026-11-01')),0,'returned records do not count as verified');
SELECT is((SELECT sum(rejected_days)::integer FROM public.boss_working_day_overview(date '2026-11-01')),0,'rejected records do not count as verified');
SELECT is((SELECT count(*)::integer FROM public.boss_working_day_overview(date '2026-11-01')),2,'state/LGA/LC breakdown includes both seeded submitters');
SELECT lives_ok($$SELECT * FROM public.boss_working_day_overview(date '2035-01-01')$$,'working-day reporting works without a timesheet for that month');
SELECT is(position('monthly_lc_timesheets' in pg_get_functiondef('public.boss_working_day_overview(date)'::regprocedure)),0,'working-day reporting does not depend on the timesheet tables');
SELECT is((SELECT count(*)::integer FROM public.working_day_records),0,'Boss has no direct RLS-visible working-day rows');
SELECT ok(NOT has_table_privilege('authenticated','public.profile_contact_details','SELECT'),'clients have no direct contact-table privilege');

SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000001',true);
SELECT throws_ok($$SELECT public.boss_executive_overview(date '2026-11-01')$$,'42501','Boss reporting access required','LC cannot call the Boss overview');
SELECT throws_ok($$SELECT * FROM public.boss_personnel_directory(NULL,NULL,NULL,date '2026-11-01')$$,'42501','Boss reporting access required','LC cannot call the Boss personnel directory');
SELECT throws_ok($$SELECT public.boss_state_drilldown((SELECT id FROM public.states WHERE code='NG-YO'),date '2026-11-01')$$,'42501','Boss reporting access required','LC cannot call the Boss state drilldown');
SELECT throws_ok($$SELECT * FROM public.boss_working_day_overview(date '2026-11-01')$$,'42501','Boss reporting access required','LC cannot call the Boss working-day report');
SELECT throws_ok($$SELECT * FROM public.boss_lga_comparisons()$$,'42501','Boss reporting access required','LC cannot call Boss LGA comparisons');
SELECT throws_ok($$SELECT * FROM public.boss_report_archive()$$,'42501','Boss reporting access required','LC cannot call the Boss report archive');

RESET ROLE;
SELECT * FROM finish();
