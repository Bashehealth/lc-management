-- Tests the local fixture plus proposed additive state-scope hardening only.
SELECT plan(6);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000101',true);
INSERT INTO public.operational_issues(id,lga_id,title,description,category,severity,created_by)
VALUES ('59000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Yobe issue','Local scope fixture','reporting','medium','30000000-0000-4000-8000-000000000101');
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000102',true);
INSERT INTO public.operational_issues(id,lga_id,title,description,category,severity,created_by)
VALUES ('59000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003','Kano issue','Local scope fixture','reporting','medium','30000000-0000-4000-8000-000000000102');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000101',true);
SELECT is((SELECT count(*)::integer FROM public.operational_issues WHERE id='59000000-0000-4000-8000-000000000001'),1,'SC reads same-state operational issue');
SELECT is((SELECT count(*)::integer FROM public.operational_issues WHERE id='59000000-0000-4000-8000-000000000002'),0,'SC cannot read cross-state operational issue');
SELECT lives_ok($$INSERT INTO public.operational_issues(lga_id,title,description,category,severity,created_by) VALUES('20000000-0000-4000-8000-000000000002','Scoped issue','Same-state fixture','reporting','low',auth.uid())$$,'SC can create issue in assigned state');
SELECT throws_ok($$INSERT INTO public.operational_issues(lga_id,title,description,category,severity,created_by) VALUES('20000000-0000-4000-8000-000000000004','Cross-state issue','Denied fixture','reporting','low',auth.uid())$$,'42501','new row violates row-level security policy for table "operational_issues"','SC cannot create issue in another state');
SELECT is((WITH changed AS (UPDATE public.operational_issues SET title='Unauthorised cross-state edit' WHERE id='59000000-0000-4000-8000-000000000002' RETURNING id) SELECT count(*)::integer FROM changed),0,'SC cannot update cross-state issue');

SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000201',true);
SELECT lives_ok($$UPDATE public.operational_issues SET title='Same-state review' WHERE id='59000000-0000-4000-8000-000000000001'$$,'Senior Supervisor can update same-state issue');

SELECT * FROM finish();
