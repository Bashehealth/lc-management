-- Run in a non-production Supabase/PostgreSQL test project after both migrations.
-- Required psql variables are UUIDs for pre-provisioned test profiles only:
--   -v lc_bade=<uuid> -v lc_bursari=<uuid> -v sc=<uuid> -v senior_supervisor=<uuid>
-- The script creates no Auth users or credentials and rolls back all fixture data.

begin;
set local role authenticated;

create or replace function pg_temp.expect_failure(label text, statement text)
returns void language plpgsql as $$
begin
  execute statement;
  raise exception 'Expected failure did not occur: %', label;
exception
  when others then
    if sqlerrm like 'Expected failure did not occur:%' then raise; end if;
    raise notice 'Expected failure (%): %', label, sqlerrm;
end;
$$;

select set_config('request.jwt.claim.sub', :'sc', true);

insert into public.monthly_plans (lga_id, plan_month, status, submitted_by)
values ((select id from public.lgas where code = 'BADE'), date '2026-11-01', 'draft', :'sc')
returning id as bade_monthly_plan_id \gset

insert into public.monthly_plans (lga_id, plan_month, status, submitted_by)
values ((select id from public.lgas where code = 'BURSARI'), date '2026-11-01', 'draft', :'sc')
returning id as bursari_monthly_plan_id \gset

insert into public.weekly_plans (monthly_plan_id, lga_id, week_start, status, submitted_by)
values (:'bade_monthly_plan_id', (select id from public.lgas where code = 'BADE'), date '2026-11-02', 'draft', :'sc')
returning id as bade_weekly_plan_id \gset

insert into public.tasks (weekly_plan_id, lga_id, source, title, expected_deliverable, created_by)
values (:'bade_weekly_plan_id', (select id from public.lgas where code = 'BADE'), 'custom_operational', 'Test task', 'Test deliverable', :'sc')
returning id as bade_task_id \gset

-- LGA Coordinator: cross-LGA access and self-approval fail on INSERT and UPDATE.
select set_config('request.jwt.claim.sub', :'lc_bade', true);
select pg_temp.expect_failure(
  'LC cross-LGA monthly plan',
  $sql$insert into public.monthly_plans (lga_id, plan_month, status, submitted_by)
       values ((select id from public.lgas where code = 'BURSARI'), date '2026-12-01', 'draft', auth.uid())$sql$
);
select pg_temp.expect_failure(
  'LC self-approves monthly plan on insert',
  $sql$insert into public.monthly_plans (lga_id, plan_month, status, submitted_by, reviewed_by, reviewed_at)
       values ((select id from public.lgas where code = 'BADE'), date '2026-12-01', 'approved', auth.uid(), auth.uid(), now())$sql$
);
select pg_temp.expect_failure(
  'LC self-approves weekly plan on insert',
  $sql$insert into public.weekly_plans (monthly_plan_id, lga_id, week_start, status, submitted_by, reviewed_by, reviewed_at)
       values ((select id from public.monthly_plans where lga_id = (select id from public.lgas where code = 'BADE') and plan_month = date '2026-11-01'), (select id from public.lgas where code = 'BADE'), date '2026-11-09', 'approved', auth.uid(), auth.uid(), now())$sql$
);
insert into public.monthly_plans (lga_id, plan_month, status, submitted_by)
values ((select id from public.lgas where code = 'BADE'), date '2027-01-01', 'draft', auth.uid())
returning id as lc_monthly_plan_id \gset
select pg_temp.expect_failure(
  'LC self-approves monthly plan on update',
  $sql$update public.monthly_plans set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
       where lga_id = (select id from public.lgas where code = 'BADE') and plan_month = date '2027-01-01'$sql$
);
select pg_temp.expect_failure(
  'LC creates verified task',
  $sql$insert into public.tasks (weekly_plan_id, lga_id, source, title, expected_deliverable, created_by, verified_by, verified_at)
       values ((select id from public.weekly_plans where lga_id = (select id from public.lgas where code = 'BADE') and week_start = date '2026-11-02'), (select id from public.lgas where code = 'BADE'), 'custom_operational', 'Forged verification', 'No', auth.uid(), auth.uid(), now())$sql$
);
select pg_temp.expect_failure(
  'LC creates supervisor-assigned task',
  $sql$insert into public.tasks (weekly_plan_id, lga_id, source, title, expected_deliverable, created_by)
       values ((select id from public.weekly_plans where lga_id = (select id from public.lgas where code = 'BADE') and week_start = date '2026-11-02'), (select id from public.lgas where code = 'BADE'), 'supervisor_assigned', 'Forged task', 'No', auth.uid())$sql$
);
select pg_temp.expect_failure(
  'LC supplies evidence review metadata',
  $sql$insert into public.task_evidence (task_id, storage_path, file_name, uploaded_by, reviewed_by, reviewed_at)
       values ((select id from public.tasks where title = 'Test task'), 'test/forged-evidence.txt', 'forged-evidence.txt', auth.uid(), auth.uid(), now())$sql$
);
insert into public.task_evidence (task_id, storage_path, file_name, uploaded_by)
values (:'bade_task_id', 'test/lc-evidence.txt', 'lc-evidence.txt', auth.uid())
returning id as lc_evidence_id \gset
select pg_temp.expect_failure(
  'LC updates evidence with review metadata',
  $sql$update public.task_evidence set reviewed_by = auth.uid(), reviewed_at = now() where storage_path = 'test/lc-evidence.txt'$sql$
);
insert into public.task_comments (task_id, author_id, author_role, body)
values (:'bade_task_id', auth.uid(), 'senior_supervisor', 'Forged role attempt')
returning id as forged_comment_id \gset
select 1 / case when exists (
  select 1 from public.task_comments where body = 'Forged role attempt' and author_role = 'lga_coordinator'
) then 1 else 0 end as forged_comment_role_was_replaced;
select pg_temp.expect_failure(
  'LC creates working-day self-approval on insert',
  $sql$insert into public.working_day_records (lga_id, working_date, status, submitted_by, approved_by, approved_at)
       values ((select id from public.lgas where code = 'BADE'), date '2026-11-03', 'approved', auth.uid(), auth.uid(), now())$sql$
);
insert into public.working_day_records (lga_id, working_date, submitted_by, claim_note)
values ((select id from public.lgas where code = 'BADE'), date '2026-11-03', auth.uid(), 'Legitimate claim')
returning id as bade_working_day_id \gset
select pg_temp.expect_failure(
  'LC self-approves working-day record on update',
  $sql$update public.working_day_records set status = 'approved', approved_by = auth.uid(), approved_at = now()
       where lga_id = (select id from public.lgas where code = 'BADE') and working_date = date '2026-11-03'$sql$
);
select pg_temp.expect_failure(
  'LC creates approval history',
  $sql$insert into public.working_day_approvals (working_day_record_id, action, acted_by)
       values ((select id from public.working_day_records where lga_id = (select id from public.lgas where code = 'BADE') and working_date = date '2026-11-03'), 'approved', auth.uid())$sql$
);
select pg_temp.expect_failure(
  'LC creates supervisor revision action',
  $sql$insert into public.plan_revisions (monthly_plan_id, revision_number, action, created_by)
       values ((select id from public.monthly_plans where lga_id = (select id from public.lgas where code = 'BADE') and plan_month = date '2026-11-01'), 1, 'approved', auth.uid())$sql$
);
select pg_temp.expect_failure(
  'LC creates privileged report',
  $sql$insert into public.reports (lga_id, report_type, period_start, period_end, status, created_by, reviewed_by, reviewed_at)
       values ((select id from public.lgas where code = 'BADE'), 'lga_monthly', date '2026-11-01', date '2026-11-30', 'approved', auth.uid(), auth.uid(), now())$sql$
);

-- SC: invalid cross-LGA relationships fail; legitimate approvals succeed.
select set_config('request.jwt.claim.sub', :'sc', true);
select pg_temp.expect_failure(
  'weekly plan points to a different-LGA monthly plan',
  $sql$insert into public.weekly_plans (monthly_plan_id, lga_id, week_start, status, submitted_by)
       values ((select id from public.monthly_plans where lga_id = (select id from public.lgas where code = 'BADE') and plan_month = date '2026-11-01'), (select id from public.lgas where code = 'BURSARI'), date '2026-11-16', 'draft', auth.uid())$sql$
);
select pg_temp.expect_failure(
  'task points to a different-LGA weekly plan',
  $sql$insert into public.tasks (weekly_plan_id, lga_id, source, title, expected_deliverable, created_by)
       values ((select id from public.weekly_plans where lga_id = (select id from public.lgas where code = 'BADE') and week_start = date '2026-11-02'), (select id from public.lgas where code = 'BURSARI'), 'custom_operational', 'Cross LGA task', 'No', auth.uid())$sql$
);
select pg_temp.expect_failure(
  'task assigned to another LGA Coordinator',
  $sql$insert into public.task_assignments (task_id, lga_id, assignee_id, assigned_by)
       values ((select id from public.tasks where title = 'Test task'), (select id from public.lgas where code = 'BADE'), (select id from public.profiles where lga_id = (select id from public.lgas where code = 'BURSARI')), auth.uid())$sql$
);
update public.monthly_plans
set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), review_note = 'SC approved'
where id = :'bade_monthly_plan_id';
update public.working_day_records
set status = 'approved', approved_by = auth.uid(), approved_at = now()
where id = :'bade_working_day_id';
insert into public.working_day_approvals (working_day_record_id, action, acted_by, note)
values (:'bade_working_day_id', 'approved', auth.uid(), 'SC approved');
update public.task_evidence
set reviewed_by = auth.uid(), reviewed_at = now(), review_note = 'SC reviewed'
where id = :'lc_evidence_id';

-- Senior Supervisor: privileged reporting and hashed share generation succeed.
select set_config('request.jwt.claim.sub', :'senior_supervisor', true);
insert into public.reports (report_type, period_start, period_end, status, created_by, recipient_label)
values ('consolidated_monthly', date '2026-11-01', date '2026-11-30', 'approved', auth.uid(), 'Boss')
returning id as consolidated_report_id \gset
select * from public.create_report_share(:'consolidated_report_id', 'Boss', now() + interval '7 days') \gset
select 1 / case when exists (
  select 1 from public.report_shares
  where id = :'share_id' and token_hash = extensions.digest(:'token', 'sha256') and expires_at > now() and revoked_at is null
) then 1 else 0 end as report_share_token_is_hashed;

select 'Schema hardening role tests passed; transaction will roll back.' as result;
rollback;
