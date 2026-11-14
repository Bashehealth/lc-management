-- Disposable local-test fixtures only. Never run this seed against production.
-- `supabase db reset` against the isolated project is the supported setup path.

INSERT INTO public.states (code, name, country_code) VALUES
  ('NG-YO', 'Yobe State', 'NG'), ('NG-BO', 'Borno State', 'NG'),
  ('NG-BA', 'Bauchi State', 'NG'), ('NG-GO', 'Gombe State', 'NG'),
  ('NG-AD', 'Adamawa State', 'NG'), ('NG-JI', 'Jigawa State', 'NG'),
  ('NG-KN', 'Kano State', 'NG'), ('NG-KD', 'Kaduna State', 'NG'),
  ('NG-KT', 'Katsina State', 'NG'), ('NG-ZA', 'Zamfara State', 'NG'),
  ('NG-SO', 'Sokoto State', 'NG'), ('NG-KE', 'Kebbi State', 'NG'),
  ('NG-NI', 'Niger State', 'NG'), ('NG-NA', 'Nasarawa State', 'NG'),
  ('NG-KO', 'Kogi State', 'NG')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.lgas (id, code, name, coordinator_reference_name, state_id) VALUES
  ('20000000-0000-4000-8000-000000000001', 'TEST-BADE', 'Test Bade', 'Test LC Bade', (SELECT id FROM public.states WHERE code='NG-YO')),
  ('20000000-0000-4000-8000-000000000002', 'TEST-BURSARI', 'Test Bursari', 'Test LC Bursari', (SELECT id FROM public.states WHERE code='NG-YO')),
  ('20000000-0000-4000-8000-000000000003', 'TEST-KANO-METRO', 'Test Kano Metro', 'Test LC Kano Metro', (SELECT id FROM public.states WHERE code='NG-KN')),
  ('20000000-0000-4000-8000-000000000004', 'TEST-KURA', 'Test Kura', 'Test LC Kura', (SELECT id FROM public.states WHERE code='NG-KN'))
ON CONFLICT (id) DO NOTHING;

-- These fixed Auth users and passwords are disposable local fixtures.
-- Password for every fixture: LocalOnly-Test-2026!
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('00000000-0000-0000-0000-000000000000','30000000-0000-4000-8000-000000000001','authenticated','authenticated','lc.bade@ehealth-lc.test',extensions.crypt('LocalOnly-Test-2026!',extensions.gen_salt('bf')),now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','30000000-0000-4000-8000-000000000002','authenticated','authenticated','lc.bursari@ehealth-lc.test',extensions.crypt('LocalOnly-Test-2026!',extensions.gen_salt('bf')),now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','30000000-0000-4000-8000-000000000003','authenticated','authenticated','lc.kano-metro@ehealth-lc.test',extensions.crypt('LocalOnly-Test-2026!',extensions.gen_salt('bf')),now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','30000000-0000-4000-8000-000000000004','authenticated','authenticated','lc.kura@ehealth-lc.test',extensions.crypt('LocalOnly-Test-2026!',extensions.gen_salt('bf')),now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','30000000-0000-4000-8000-000000000101','authenticated','authenticated','sc.yobe@ehealth-lc.test',extensions.crypt('LocalOnly-Test-2026!',extensions.gen_salt('bf')),now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','30000000-0000-4000-8000-000000000102','authenticated','authenticated','sc.kano@ehealth-lc.test',extensions.crypt('LocalOnly-Test-2026!',extensions.gen_salt('bf')),now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','30000000-0000-4000-8000-000000000201','authenticated','authenticated','senior.yobe@ehealth-lc.test',extensions.crypt('LocalOnly-Test-2026!',extensions.gen_salt('bf')),now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','30000000-0000-4000-8000-000000000203','authenticated','authenticated','senior.yobe.reviewer@ehealth-lc.test',extensions.crypt('LocalOnly-Test-2026!',extensions.gen_salt('bf')),now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000202','30000000-0000-4000-8000-000000000202','authenticated','authenticated','senior.kano@ehealth-lc.test',extensions.crypt('LocalOnly-Test-2026!',extensions.gen_salt('bf')),now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','30000000-0000-4000-8000-000000000301','authenticated','authenticated','dpm@ehealth-lc.test',extensions.crypt('LocalOnly-Test-2026!',extensions.gen_salt('bf')),now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','30000000-0000-4000-8000-000000000401','authenticated','authenticated','management@ehealth-lc.test',extensions.crypt('LocalOnly-Test-2026!',extensions.gen_salt('bf')),now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','30000000-0000-4000-8000-000000000501','authenticated','authenticated','boss@ehealth-lc.test',extensions.crypt('LocalOnly-Test-2026!',extensions.gen_salt('bf')),now(),'{}','{}',now(),now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, full_name, role, lga_id, state_id) VALUES
  ('30000000-0000-4000-8000-000000000001','Local Test LC Bade','lga_coordinator','20000000-0000-4000-8000-000000000001',NULL),
  ('30000000-0000-4000-8000-000000000002','Local Test LC Bursari','lga_coordinator','20000000-0000-4000-8000-000000000002',NULL),
  ('30000000-0000-4000-8000-000000000003','Local Test LC Kano Metro','lga_coordinator','20000000-0000-4000-8000-000000000003',NULL),
  ('30000000-0000-4000-8000-000000000004','Local Test LC Kura','lga_coordinator','20000000-0000-4000-8000-000000000004',NULL),
  ('30000000-0000-4000-8000-000000000101','Local Test SC Yobe','state_coordinator',NULL,(SELECT id FROM public.states WHERE code='NG-YO')),
  ('30000000-0000-4000-8000-000000000102','Local Test SC Kano','state_coordinator',NULL,(SELECT id FROM public.states WHERE code='NG-KN')),
  ('30000000-0000-4000-8000-000000000201','Local Test Senior Yobe','senior_supervisor',NULL,(SELECT id FROM public.states WHERE code='NG-YO')),
  ('30000000-0000-4000-8000-000000000203','Local Test Senior Yobe Reviewer','senior_supervisor',NULL,(SELECT id FROM public.states WHERE code='NG-YO')),
  ('30000000-0000-4000-8000-000000000202','Local Test Senior Kano','senior_supervisor',NULL,(SELECT id FROM public.states WHERE code='NG-KN')),
  ('30000000-0000-4000-8000-000000000301','Local Test DPM','dpm',NULL,NULL),
  ('30000000-0000-4000-8000-000000000401','Local Test Management Approver','management_approver',NULL,NULL),
  ('30000000-0000-4000-8000-000000000501','Local Test Boss','boss',NULL,NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.responsibilities (id, title, source) VALUES
  ('40000000-0000-4000-8000-000000000001','Local test responsibility','official_contract')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.operational_policy_settings (effective_from) VALUES (date '2026-01-01')
ON CONFLICT (effective_from) DO NOTHING;

-- Seed campaign settings separately for each state's fixture SC so the
-- state-scoped supervisor policy is exercised even during local seeding.
DO $$
DECLARE supervisor_profile record;
DECLARE target_lga record;
BEGIN
  FOR supervisor_profile IN
    SELECT id, state_id FROM public.profiles
    WHERE role = 'state_coordinator'
      AND id IN ('30000000-0000-4000-8000-000000000101', '30000000-0000-4000-8000-000000000102')
  LOOP
    PERFORM set_config('request.jwt.claim.sub', supervisor_profile.id::text, false);
    FOR target_lga IN
      SELECT id FROM public.lgas
      WHERE code LIKE 'TEST-%' AND state_id = supervisor_profile.state_id
    LOOP
      INSERT INTO public.campaign_settings (lga_id, updated_by)
      VALUES (target_lga.id, supervisor_profile.id)
      ON CONFLICT (lga_id) DO NOTHING;
    END LOOP;
  END LOOP;
END;
$$;

SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000001',false);
INSERT INTO public.monthly_plans (id,lga_id,plan_month,status,submitted_by) VALUES
 ('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',date '2026-11-01','draft','30000000-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.weekly_plans (id,monthly_plan_id,lga_id,week_start,status,submitted_by) VALUES
 ('51000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',date '2026-11-02','draft','30000000-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;

SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000003',false);
INSERT INTO public.monthly_plans (id,lga_id,plan_month,status,submitted_by) VALUES
 ('50000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003',date '2026-11-01','draft','30000000-0000-4000-8000-000000000003')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.weekly_plans (id,monthly_plan_id,lga_id,week_start,status,submitted_by) VALUES
 ('51000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003',date '2026-11-02','draft','30000000-0000-4000-8000-000000000003')
ON CONFLICT (id) DO NOTHING;

SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000101',false);
INSERT INTO public.tasks (id,weekly_plan_id,lga_id,responsibility_id,source,title,expected_deliverable,deadline,created_by) VALUES
 ('52000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','official_library','Local test task','Demonstration deliverable',date '2026-11-30','30000000-0000-4000-8000-000000000101'),
 ('52000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000001','official_library','Cross-state test task','Demonstration deliverable',date '2026-11-30','30000000-0000-4000-8000-000000000102')
ON CONFLICT (id) DO NOTHING;

SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000101',false);
INSERT INTO public.task_assignments (id,task_id,lga_id,assignee_id,assigned_by) VALUES
 ('53000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000101')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.working_day_records (id,lga_id,working_date,submitted_by,claim_note) VALUES
 ('54000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',date '2026-11-03','30000000-0000-4000-8000-000000000001','Local fixture claim')
ON CONFLICT (id) DO NOTHING;

SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000003',false);
INSERT INTO public.working_day_records (id,lga_id,working_date,submitted_by,claim_note) VALUES
 ('54000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003',date '2026-11-03','30000000-0000-4000-8000-000000000003','Local fixture claim')
ON CONFLICT (id) DO NOTHING;

SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000001',false);
INSERT INTO public.campaign_readiness_reports (id,lga_id,report_date,reporting_period,total_teams,submitted_by) VALUES
 ('55000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',date '2026-11-03','morning',4,'30000000-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.campaign_device_progress (id,lga_id,activity_category,device_name,expected_quantity,completed_quantity,pending_quantity,submitted_by) VALUES
 ('56000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','test','Test device',2,1,1,'30000000-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.movement_requests (id,lga_id,requested_by,reason,destination,departure_at,expected_return_at) VALUES
 ('57000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Local movement test','Test destination',now()+interval '2 days',now()+interval '3 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.reports (id,lga_id,report_type,period_start,period_end,status,created_by) VALUES
 ('58000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','lga_monthly',date '2026-11-01',date '2026-11-30','submitted','30000000-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;

SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000003',false);
INSERT INTO public.reports (id,lga_id,report_type,period_start,period_end,status,created_by) VALUES
 ('58000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003','lga_monthly',date '2026-11-01',date '2026-11-30','submitted','30000000-0000-4000-8000-000000000003')
ON CONFLICT (id) DO NOTHING;
