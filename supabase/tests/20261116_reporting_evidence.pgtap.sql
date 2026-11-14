-- Isolated local test only. Requires the 20261115 security proposal followed
-- by 20261116 reporting/evidence proposal and the local seed fixtures.
SELECT plan(39);
SET LOCAL ROLE authenticated;

-- LGA Coordinator report creation, submission, immutability, and scope.
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000001',true);
SELECT is((SELECT count(*)::integer FROM public.reports WHERE id='58000000-0000-4000-8000-000000000001'),1,'LC can read own LGA report');
SELECT is((SELECT count(*)::integer FROM public.reports WHERE id='58000000-0000-4000-8000-000000000002'),0,'LC cannot read another state report');
SELECT lives_ok($$INSERT INTO public.reports(id,lga_id,report_type,period_start,period_end,status,created_by,content) VALUES('58000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000001','lga_monthly',date '2026-11-01',date '2026-11-30','draft',auth.uid(),'{"cadence":"Monthly","achievements":"Local test submission"}')$$,'LC can create a persistent report draft');
SELECT lives_ok($$UPDATE public.reports SET content='{"cadence":"Monthly","achievements":"Edited local test submission"}',status='submitted' WHERE id='58000000-0000-4000-8000-000000000010'$$,'LC can edit and submit own draft');
SELECT is((SELECT status::text FROM public.reports WHERE id='58000000-0000-4000-8000-000000000010'),'submitted','LC submission is persisted');
SELECT is((WITH changed AS (UPDATE public.reports SET content='{"achievements":"Unauthorized edit"}' WHERE id='58000000-0000-4000-8000-000000000010' RETURNING id) SELECT count(*)::integer FROM changed),0,'LC cannot edit a submitted report');

-- State Coordinator reads only in-state LGA reports and records review history.
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000101',true);
SELECT is((SELECT count(*)::integer FROM public.reports WHERE id='58000000-0000-4000-8000-000000000001'),1,'SC reads a same-state LGA report');
SELECT is((SELECT count(*)::integer FROM public.reports WHERE id='58000000-0000-4000-8000-000000000002'),0,'SC cannot read a cross-state LGA report');
SELECT lives_ok($$UPDATE public.reports SET status='approved',reviewed_by=auth.uid(),reviewed_at=now(),feedback='Reviewed in isolated test' WHERE id='58000000-0000-4000-8000-000000000001' AND status='submitted'$$,'SC can approve an in-state submitted LGA report');
SELECT is((SELECT feedback FROM public.reports WHERE id='58000000-0000-4000-8000-000000000001'),'Reviewed in isolated test','SC review note persists');
SELECT lives_ok($$INSERT INTO public.reports(id,state_id,report_type,period_start,period_end,status,created_by,content) VALUES('58000000-0000-4000-8000-000000000011',(SELECT state_id FROM public.profiles WHERE id=auth.uid()),'state_monthly',date '2026-11-01',date '2026-11-30','draft',auth.uid(),'{"summary":"Yobe test report"}')$$,'SC can create assigned-state report draft');
SELECT lives_ok($$UPDATE public.reports SET status='submitted' WHERE id='58000000-0000-4000-8000-000000000011' AND status='draft'$$,'SC can submit state report');
SELECT is((SELECT status::text FROM public.reports WHERE id='58000000-0000-4000-8000-000000000011'),'submitted','State report submission persists');

-- Senior review, consolidation and sharing lifecycle.
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000201',true);
SELECT is((SELECT count(*)::integer FROM public.reports WHERE id='58000000-0000-4000-8000-000000000011'),1,'Senior Supervisor reads same-state SC report');
SELECT is((SELECT count(*)::integer FROM public.reports WHERE id='58000000-0000-4000-8000-000000000002'),0,'Senior Supervisor cannot read cross-state LGA report');
SELECT lives_ok($$UPDATE public.reports SET status='approved',reviewed_by=auth.uid(),reviewed_at=now(),feedback='Senior review complete' WHERE id='58000000-0000-4000-8000-000000000011' AND status='submitted'$$,'Senior Supervisor can approve submitted SC report');
SELECT is((SELECT status::text FROM public.reports WHERE id='58000000-0000-4000-8000-000000000011'),'approved','Senior approval persists');
SELECT lives_ok($$INSERT INTO public.reports(id,state_id,report_type,period_start,period_end,status,created_by,content) VALUES('58000000-0000-4000-8000-000000000012',(SELECT state_id FROM public.profiles WHERE id=auth.uid()),'consolidated_monthly',date '2026-11-01',date '2026-11-30','draft',auth.uid(),'{"summary":"Consolidated test"}')$$,'Senior can create persistent consolidated report');
SELECT lives_ok($$UPDATE public.reports SET status='submitted' WHERE id='58000000-0000-4000-8000-000000000012' AND status='draft'$$,'Senior can submit consolidated report for peer approval');
SELECT throws_ok($$UPDATE public.reports SET status='approved',reviewed_by=auth.uid(),reviewed_at=now(),feedback='Self approval' WHERE id='58000000-0000-4000-8000-000000000012'$$,'42501','A report author cannot approve or return their own report','report author cannot self-approve');
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000203',true);
SELECT lives_ok($$UPDATE public.reports SET status='approved',reviewed_by=auth.uid(),reviewed_at=now(),feedback='Peer approved' WHERE id='58000000-0000-4000-8000-000000000012' AND status='submitted'$$,'second same-state Senior can approve consolidation');
CREATE TEMP TABLE pg_temp.share_test_tokens(kind text, token text) ON COMMIT DROP;
SELECT lives_ok($$INSERT INTO pg_temp.share_test_tokens SELECT 'valid',token FROM public.create_report_share('58000000-0000-4000-8000-000000000011','Office of Boss',now()+interval '7 days')$$,'Senior can share an approved report in assigned state');
SELECT is((SELECT count(*)::integer FROM public.get_shared_report((SELECT token FROM pg_temp.share_test_tokens WHERE kind='valid'))),1,'valid token redeems approved report through restricted RPC');
SELECT is((SELECT count(*)::integer FROM public.report_shares WHERE report_id='58000000-0000-4000-8000-000000000011' AND revoked_at IS NULL),1,'report share history is persistent');
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000101',true);
SELECT throws_ok($$SELECT * FROM public.create_report_share('58000000-0000-4000-8000-000000000011','Unauthorized SC',now()+interval '7 days')$$,'42501','Only Senior Supervisors may share approved reports','SC cannot create management shares');
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000201',true);
SELECT lives_ok($$SELECT public.revoke_report_share((SELECT id FROM public.report_shares WHERE report_id='58000000-0000-4000-8000-000000000011' AND revoked_at IS NULL LIMIT 1))$$,'Senior can revoke own-state report share');
SELECT ok((SELECT revoked_at IS NOT NULL FROM public.report_shares WHERE report_id='58000000-0000-4000-8000-000000000011'),'revocation is persisted');
SELECT is((SELECT count(*)::integer FROM public.get_shared_report((SELECT token FROM pg_temp.share_test_tokens WHERE kind='valid'))),0,'revoked token no longer redeems');
SELECT lives_ok($$INSERT INTO pg_temp.share_test_tokens SELECT 'expiring',token FROM public.create_report_share('58000000-0000-4000-8000-000000000011','Expiry test',clock_timestamp()+interval '1 second')$$,'Senior can create a short-lived test share');
SELECT pg_sleep(1.2);
SELECT is((SELECT count(*)::integer FROM public.get_shared_report((SELECT token FROM pg_temp.share_test_tokens WHERE kind='expiring'))),0,'expired token is rejected');

-- Boss has no direct operational table access, only the authorized RPC contract.
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000501',true);
SELECT is((SELECT count(*)::integer FROM public.reports),0,'Boss cannot directly read report table');
SELECT is((SELECT count(*)::integer FROM public.tasks),0,'Boss cannot directly read task rows');
SELECT is((SELECT count(*)::integer FROM public.campaign_checkins),0,'Boss cannot directly read campaign records');
SELECT is((SELECT count(*)::integer FROM public.boss_lga_comparisons()),4,'Boss comparison RPC returns aggregate rows for seeded LGAs');
SELECT is((SELECT count(*)::integer FROM public.boss_report_archive() WHERE status='approved'),3,'Boss archive RPC returns only approved reports');
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000401',true);
SELECT throws_ok($$SELECT * FROM public.boss_lga_comparisons()$$,'42501','Boss reporting access required','Management cannot call Boss reporting RPC');
SELECT is((SELECT count(*)::integer FROM public.reports),0,'Management has no report read access');

-- Storage bucket is private; task evidence metadata remains assignment-gated.
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000001',true);
SELECT lives_ok($$INSERT INTO public.task_evidence(task_id,storage_path,file_name,mime_type,uploaded_by) VALUES('52000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/tasks/52000000-0000-4000-8000-000000000001/test-proof.pdf','test-proof.pdf','application/pdf',auth.uid())$$,'active task assignee can register evidence metadata');
RESET ROLE;
SELECT ok((SELECT NOT public FROM storage.buckets WHERE id='campaign-evidence'),'evidence bucket is private');

SELECT * FROM finish();
