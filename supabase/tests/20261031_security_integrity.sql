-- Run in a non-production Supabase/PostgreSQL test project after all migrations.
-- Required psql variables are UUIDs for pre-provisioned test profiles only:
--   -v lc_bade=<uuid> -v lc_bursari=<uuid> -v sc=<uuid> -v senior_supervisor=<uuid>
-- This script creates no Auth users or credentials and rolls back all fixture data.

begin;
set local role authenticated;

create or replace function pg_temp.expect_sqlstate(label text, expected_state text, statement text)
returns void language plpgsql as $$
declare
  actual_state text;
begin
  execute statement;
  raise exception using errcode = 'P0001', message = format('statement unexpectedly succeeded: %s', label);
exception
  when others then
    actual_state := sqlstate;
    if actual_state <> expected_state then
      raise exception 'Test % expected SQLSTATE %, received %: %', label, expected_state, actual_state, sqlerrm;
    end if;
end;
$$;

create or replace function pg_temp.expect_no_rows(label text, query text)
returns void language plpgsql as $$
declare
  row_count integer;
begin
  execute format('select count(*) from (%s) as test_rows', query) into row_count;
  if row_count <> 0 then
    raise exception 'Test % expected zero rows, received %', label, row_count;
  end if;
end;
$$;

create or replace function pg_temp.expect_true(label text, condition boolean)
returns void language plpgsql as $$
begin
  if condition is distinct from true then
    raise exception 'Test failed: %', label;
  end if;
end;
$$;

-- Create SC-owned cross-LGA fixtures.
select set_config('request.jwt.claim.sub', :'sc', true);
insert into public.monthly_plans (lga_id, plan_month, status, submitted_by)
values ((select id from public.lgas where code = 'BURSARI'), date '2026-12-01', 'draft', auth.uid())
returning id as bursari_monthly_id \gset

-- LC creates own plan, task, evidence, and working-day claim.
select set_config('request.jwt.claim.sub', :'lc_bade', true);
insert into public.monthly_plans (lga_id, plan_month, status, submitted_by)
values ((select id from public.lgas where code = 'BADE'), date '2026-12-01', 'draft', auth.uid())
returning id as bade_monthly_id \gset
insert into public.weekly_plans (monthly_plan_id, lga_id, week_start, status, submitted_by)
values (:'bade_monthly_id', (select id from public.lgas where code = 'BADE'), date '2026-12-07', 'draft', auth.uid())
returning id as bade_weekly_id \gset
insert into public.tasks (weekly_plan_id, lga_id, source, title, expected_deliverable, created_by)
values (:'bade_weekly_id', (select id from public.lgas where code = 'BADE'), 'custom_operational', 'Integrity test task', 'Evidence', auth.uid())
returning id as bade_task_id \gset
insert into public.task_evidence (task_id, storage_path, file_name, uploaded_by)
values (:'bade_task_id', 'test/integrity-evidence.txt', 'integrity-evidence.txt', auth.uid())
returning id as bade_evidence_id \gset
insert into public.working_day_records (lga_id, working_date, status, submitted_by, claim_note)
values ((select id from public.lgas where code = 'BADE'), date '2026-12-08', 'claimed', auth.uid(), 'Test claim')
returning id as bade_working_day_id \gset

-- LC cannot read, insert into, or update another LGA.
select pg_temp.expect_no_rows(
  'LC cannot select Bursari plans',
  $sql$select id from public.monthly_plans where lga_id = (select id from public.lgas where code = 'BURSARI')$sql$
);
select pg_temp.expect_sqlstate(
  'LC cannot insert Bursari plan', '42501',
  $sql$insert into public.monthly_plans (lga_id, plan_month, status, submitted_by)
       values ((select id from public.lgas where code = 'BURSARI'), date '2027-01-01', 'draft', auth.uid())$sql$
);
select pg_temp.expect_no_rows(
  'LC cannot update Bursari plan',
  $sql$with changed as (
         update public.monthly_plans set status = 'submitted'
         where lga_id = (select id from public.lgas where code = 'BURSARI')
         returning id
       ) select id from changed$sql$
);

-- LC cannot self-approve and cannot forge privileged fields or roles.
select pg_temp.expect_sqlstate(
  'LC cannot self-approve plan', '42501',
  $sql$update public.monthly_plans
       set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
       where lga_id = (select id from public.lgas where code = 'BADE') and plan_month = date '2026-12-01'$sql$
);
select pg_temp.expect_sqlstate(
  'LC cannot self-verify task', '42501',
  $sql$update public.tasks
       set status = 'completed', verified_by = auth.uid(), verified_at = now()
       where title = 'Integrity test task'$sql$
);
insert into public.task_comments (task_id, author_id, author_role, body)
values (:'bade_task_id', auth.uid(), 'senior_supervisor', 'Forged supervisor role')
returning id as forged_comment_id \gset
select pg_temp.expect_true(
  'comment role is derived from profile',
  (select author_id = :'lc_bade' and author_role = 'lga_coordinator' from public.task_comments where id = :'forged_comment_id')
);
select pg_temp.expect_no_rows(
  'LC cannot review evidence',
  $sql$with changed as (
         update public.task_evidence set reviewed_by = auth.uid(), reviewed_at = now()
         where storage_path = 'test/integrity-evidence.txt'
         returning id
       ) select id from changed$sql$
);
select pg_temp.expect_sqlstate(
  'LC cannot create approval history', '42501',
  $sql$insert into public.working_day_approvals (working_day_record_id, action, acted_by)
       values ((select id from public.working_day_records where working_date = date '2026-12-08'), 'approved', auth.uid())$sql$
);

-- LC submits plan; SC then performs legitimate review, evidence review, approval history, and approval.
update public.monthly_plans set status = 'submitted'
where id = :'bade_monthly_id';
select set_config('request.jwt.claim.sub', :'sc', true);
update public.monthly_plans
set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), review_note = 'SC approved'
where id = :'bade_monthly_id';
update public.tasks set status = 'ongoing' where id = :'bade_task_id';
update public.tasks
set status = 'completed', verified_by = auth.uid(), verified_at = now()
where id = :'bade_task_id';
update public.task_evidence
set reviewed_by = auth.uid(), reviewed_at = now(), review_note = 'SC reviewed'
where id = :'bade_evidence_id';
insert into public.working_day_approvals (working_day_record_id, action, acted_by, note)
values (:'bade_working_day_id', 'approved', auth.uid(), 'SC approved')
returning id as working_day_approval_id \gset
update public.working_day_records
set status = 'approved', approved_by = auth.uid(), approved_at = now(), latest_approval_event_id = :'working_day_approval_id'
where id = :'bade_working_day_id';
select pg_temp.expect_true(
  'SC approval, verification, and evidence review succeeded',
  (select status = 'approved' and reviewed_by = :'sc' from public.monthly_plans where id = :'bade_monthly_id')
  and (select verified_by = :'sc' from public.tasks where id = :'bade_task_id')
  and (select reviewed_by = :'sc' from public.task_evidence where id = :'bade_evidence_id')
  and (select approved_by = :'sc' and latest_approval_event_id = :'working_day_approval_id' from public.working_day_records where id = :'bade_working_day_id')
);

-- Supervisors cannot rewrite original ownership; invalid relationships fail by their expected constraint SQLSTATE.
select pg_temp.expect_sqlstate(
  'SC cannot rewrite plan ownership', '42501',
  $sql$update public.monthly_plans set lga_id = (select id from public.lgas where code = 'BURSARI')
       where lga_id = (select id from public.lgas where code = 'BADE') and plan_month = date '2026-12-01'$sql$
);
select pg_temp.expect_sqlstate(
  'SC cannot rewrite task source', '42501',
  $sql$update public.tasks set source = 'supervisor_assigned' where title = 'Integrity test task'$sql$
);
select pg_temp.expect_sqlstate(
  'weekly plan must match monthly-plan LGA', '23503',
  $sql$insert into public.weekly_plans (monthly_plan_id, lga_id, week_start, status, submitted_by)
       values ((select id from public.monthly_plans where lga_id = (select id from public.lgas where code = 'BADE') and plan_month = date '2026-12-01'), (select id from public.lgas where code = 'BURSARI'), date '2026-12-14', 'draft', auth.uid())$sql$
);
select pg_temp.expect_sqlstate(
  'task must match weekly-plan LGA', '23503',
  $sql$insert into public.tasks (weekly_plan_id, lga_id, source, title, expected_deliverable, created_by)
       values ((select id from public.weekly_plans where id = :'bade_weekly_id'), (select id from public.lgas where code = 'BURSARI'), 'custom_operational', 'Bad relation', 'No', auth.uid())$sql$
);
select pg_temp.expect_sqlstate(
  'assignment must use task LGA Coordinator', '23503',
  $sql$insert into public.task_assignments (task_id, lga_id, assignee_id, assigned_by)
       values (:'bade_task_id', (select id from public.lgas where code = 'BADE'), :'lc_bursari', auth.uid())$sql$
);
insert into public.task_assignments (task_id, lga_id, assignee_id, assigned_by)
values (:'bade_task_id', (select id from public.lgas where code = 'BADE'), :'lc_bade', auth.uid());

-- Audit entries contain a before/after snapshot and authenticated users cannot mutate them.
select pg_temp.expect_true(
  'working-day audit snapshot is present',
  exists (
    select 1 from public.audit_logs
    where entity_type = 'working_day_records'
      and entity_id = :'bade_working_day_id'
      and metadata ? 'before' and metadata ? 'after'
      and metadata -> 'before' ->> 'status' = 'claimed'
      and metadata -> 'after' ->> 'status' = 'approved'
  )
);
select set_config('request.jwt.claim.sub', :'lc_bade', true);
select pg_temp.expect_sqlstate(
  'authenticated client cannot modify audit record', '42501',
  $sql$update public.audit_logs set action = 'forged' where entity_type = 'working_day_records'$sql$
);

-- Senior Supervisor can consolidate a report without gaining permission to rewrite historical ownership.
select set_config('request.jwt.claim.sub', :'senior_supervisor', true);
insert into public.reports (report_type, period_start, period_end, status, created_by, recipient_label)
values ('consolidated_monthly', date '2026-12-01', date '2026-12-31', 'approved', auth.uid(), 'Boss')
returning id as consolidated_report_id \gset
select pg_temp.expect_true(
  'Senior Supervisor consolidated report',
  exists (select 1 from public.reports where id = :'consolidated_report_id' and status = 'approved' and created_by = :'senior_supervisor')
);

select 'Security integrity tests passed; transaction will roll back.' as result;
rollback;
