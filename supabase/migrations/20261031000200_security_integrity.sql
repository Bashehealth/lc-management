-- Additive security and audit-integrity hardening.
-- Apply after 20261031000100_schema_hardening.sql.

create schema if not exists extensions;
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pgcrypto') then
    alter extension pgcrypto set schema extensions;
  else
    create extension pgcrypto with schema extensions;
  end if;
end;
$$;

create table public.working_day_overage_authorizations (
  id uuid primary key default gen_random_uuid(),
  lga_id uuid not null references public.lgas(id),
  calendar_month date not null check (date_trunc('month', calendar_month)::date = calendar_month),
  additional_days integer not null check (additional_days > 0),
  authorized_by uuid not null references public.profiles(id),
  authorized_at timestamptz not null default now(),
  reason text not null check (length(trim(reason)) > 0),
  created_at timestamptz not null default now(),
  unique (lga_id, calendar_month)
);

alter table public.working_day_records
  add column latest_approval_event_id uuid;

alter table public.working_day_records
  add constraint working_day_records_latest_event_fk
    foreign key (latest_approval_event_id)
    references public.working_day_approvals(id);

create or replace function public.valid_plan_transition(
  old_status public.plan_status,
  new_status public.plan_status
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (old_status = new_status)
    or (old_status = 'draft' and new_status = 'submitted')
    or (old_status = 'submitted' and new_status in ('returned', 'approved'))
    or (old_status = 'returned' and new_status in ('draft', 'submitted'))
$$;

create or replace function public.valid_task_transition(
  old_status public.task_status,
  new_status public.task_status
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (old_status = new_status)
    or (old_status = 'planned' and new_status in ('ongoing', 'cancelled'))
    or (old_status = 'ongoing' and new_status in ('completed', 'returned_for_revision', 'cancelled'))
    or (old_status = 'completed' and new_status = 'returned_for_revision')
    or (old_status = 'returned_for_revision' and new_status in ('ongoing', 'cancelled'))
$$;

create or replace function public.enforce_plan_write()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  period_changed boolean;
  review_required boolean;
begin
  perform public.require_lga_access(new.lga_id);
  if tg_op = 'INSERT' then
    if new.submitted_by <> auth.uid() then
      raise exception 'plan submitter must be the authenticated user' using errcode = '42501';
    end if;
  else
    period_changed := case
      when tg_table_name = 'monthly_plans' then new.plan_month <> old.plan_month
      else new.week_start <> old.week_start
    end;
    if new.lga_id <> old.lga_id
      or period_changed
      or new.submitted_by <> old.submitted_by then
      raise exception 'plan LGA, period, and submitter are immutable' using errcode = '42501';
    end if;
    if not public.valid_plan_transition(old.status, new.status) then
      raise exception 'invalid plan status transition' using errcode = '23514';
    end if;
  end if;

  review_required := new.status in ('returned', 'approved');
  if review_required and (new.reviewed_by is null or new.reviewed_at is null) then
    raise exception 'returned and approved plans require reviewer metadata' using errcode = '23514';
  end if;
  if not review_required and (new.reviewed_by is not null or new.reviewed_at is not null or new.review_note is not null) then
    raise exception 'unreviewed plans cannot retain review metadata' using errcode = '23514';
  end if;
  if new.status = 'returned' and coalesce(length(trim(new.review_note)), 0) = 0 then
    raise exception 'returned plans require a review note' using errcode = '23514';
  end if;

  if public.is_supervisor() then
    if review_required and new.reviewed_by <> auth.uid() then
      raise exception 'a reviewer must be the authenticated supervisor' using errcode = '42501';
    end if;
  elsif review_required then
    raise exception 'only a supervisor may return or approve a plan' using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_task_write()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  verification_changed boolean;
begin
  perform public.require_lga_access(new.lga_id);

  if tg_op = 'INSERT' then
    if new.created_by <> auth.uid() then
      raise exception 'task creator must be the authenticated user' using errcode = '42501';
    end if;
  else
    if new.lga_id <> old.lga_id
      or new.weekly_plan_id is distinct from old.weekly_plan_id
      or new.created_by <> old.created_by
      or new.source <> old.source then
      raise exception 'task LGA, plan, creator, and source are immutable' using errcode = '42501';
    end if;
    if not public.valid_task_transition(old.status, new.status) then
      raise exception 'invalid task status transition' using errcode = '23514';
    end if;
  end if;

  if (new.verified_by is null) <> (new.verified_at is null) then
    raise exception 'verified_by and verified_at must be set together' using errcode = '23514';
  end if;
  if new.verified_by is not null and new.status <> 'completed' then
    raise exception 'only completed tasks may be verified' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    verification_changed := new.verified_by is not null;
  else
    verification_changed := new.verified_by is distinct from old.verified_by
      or new.verified_at is distinct from old.verified_at;
  end if;

  if public.is_supervisor() then
    if verification_changed then
      if new.verified_by <> auth.uid() then
        raise exception 'a verifier must be the authenticated supervisor' using errcode = '42501';
      end if;
      if tg_op = 'UPDATE' and old.verified_by is not null then
        raise exception 'task verification is immutable once recorded' using errcode = '42501';
      end if;
    end if;
  else
    if new.source = 'supervisor_assigned' or verification_changed then
      raise exception 'LGA Coordinators may not create supervisor tasks or task verifications' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.enforce_evidence_write()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  target_lga_id uuid;
  review_changed boolean;
begin
  select task.lga_id into target_lga_id from public.tasks as task where task.id = new.task_id;
  perform public.require_lga_access(target_lga_id);

  if tg_op = 'UPDATE' and (new.task_id <> old.task_id or new.uploaded_by <> old.uploaded_by) then
    raise exception 'evidence task association and uploader are immutable' using errcode = '42501';
  end if;
  if (new.reviewed_by is null) <> (new.reviewed_at is null) then
    raise exception 'evidence reviewer and review timestamp must be set together' using errcode = '23514';
  end if;
  review_changed := case when tg_op = 'INSERT' then new.reviewed_by is not null else
    new.reviewed_by is distinct from old.reviewed_by
    or new.reviewed_at is distinct from old.reviewed_at
    or new.review_note is distinct from old.review_note end;

  if public.is_supervisor() then
    if review_changed and new.reviewed_by <> auth.uid() then
      raise exception 'an evidence reviewer must be the authenticated supervisor' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and old.reviewed_by is not null and review_changed then
      raise exception 'evidence review is immutable once recorded' using errcode = '42501';
    end if;
  elsif review_changed then
    raise exception 'only a supervisor may review evidence' using errcode = '42501';
  elsif tg_op = 'INSERT' and new.uploaded_by <> auth.uid() then
    raise exception 'evidence uploader must be the authenticated user' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_working_day_write()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  allocation integer;
  approved_days integer;
  approved_overage integer;
  event_action text;
  material_change boolean;
begin
  perform public.require_lga_access(new.lga_id);

  if tg_op = 'INSERT' then
    if new.submitted_by <> auth.uid() then
      raise exception 'working-day submitter must be the authenticated user' using errcode = '42501';
    end if;
    if not public.is_supervisor() and (new.status <> 'claimed' or new.approved_by is not null or new.approved_at is not null or new.authorization_note is not null) then
      raise exception 'LGA Coordinators may only submit unapproved claims' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.lga_id <> old.lga_id
    or new.working_date <> old.working_date
    or new.submitted_by <> old.submitted_by
    or new.submitted_at <> old.submitted_at then
    raise exception 'working-day ownership, date, and submitter are immutable' using errcode = '42501';
  end if;

  material_change := new.status is distinct from old.status
    or new.claim_note is distinct from old.claim_note
    or new.approved_by is distinct from old.approved_by
    or new.approved_at is distinct from old.approved_at
    or new.authorization_note is distinct from old.authorization_note;

  if not public.is_supervisor() then
    if material_change or new.latest_approval_event_id is distinct from old.latest_approval_event_id then
      raise exception 'LGA Coordinators may not alter submitted working-day records' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.status = 'approved' and (new.approved_by is null or new.approved_at is null or new.approved_by <> auth.uid()) then
    raise exception 'approved working days require the authenticated supervisor metadata' using errcode = '23514';
  end if;
  if new.status <> 'approved' and (new.approved_by is not null or new.approved_at is not null) then
    raise exception 'unapproved working days cannot contain approval metadata' using errcode = '23514';
  end if;

  if material_change then
    if new.latest_approval_event_id is null or new.latest_approval_event_id = old.latest_approval_event_id then
      raise exception 'supervisor corrections require a new approval-history event' using errcode = '23514';
    end if;
    select approval.action into event_action
    from public.working_day_approvals as approval
    where approval.id = new.latest_approval_event_id
      and approval.working_day_record_id = new.id
      and approval.acted_by = auth.uid();
    if event_action is null or event_action not in ('approved', 'returned', 'rejected', 'corrected') then
      raise exception 'working-day correction must reference an authorized approval event' using errcode = '23514';
    end if;
  end if;

  if new.status = 'approved' then
    select setting.monthly_working_day_allocation into allocation
    from public.operational_policy_settings as setting
    where setting.effective_from <= date_trunc('month', new.working_date)::date
    order by setting.effective_from desc limit 1;
    select count(*) into approved_days
    from public.working_day_records as record
    where record.lga_id = new.lga_id
      and date_trunc('month', record.working_date)::date = date_trunc('month', new.working_date)::date
      and record.status = 'approved';
    if old.status <> 'approved' then approved_days := approved_days + 1; end if;
    if approved_days > allocation then
      select overage_auth.additional_days into approved_overage
      from public.working_day_overage_authorizations as overage_auth
      where overage_auth.lga_id = new.lga_id
        and overage_auth.calendar_month = date_trunc('month', new.working_date)::date;
      if coalesce(approved_overage, 0) < approved_days - allocation then
        raise exception 'approved days exceed the authorized monthly allocation' using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.audit_snapshot(target_table text, row_data jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
begin
  if row_data is null then return null; end if;
  case target_table
    when 'monthly_plans' then return jsonb_build_object('lga_id', row_data -> 'lga_id', 'plan_month', row_data -> 'plan_month', 'status', row_data -> 'status', 'submitted_by', row_data -> 'submitted_by', 'reviewed_by', row_data -> 'reviewed_by', 'reviewed_at', row_data -> 'reviewed_at', 'review_note', row_data -> 'review_note');
    when 'weekly_plans' then return jsonb_build_object('lga_id', row_data -> 'lga_id', 'week_start', row_data -> 'week_start', 'status', row_data -> 'status', 'submitted_by', row_data -> 'submitted_by', 'reviewed_by', row_data -> 'reviewed_by', 'reviewed_at', row_data -> 'reviewed_at', 'review_note', row_data -> 'review_note');
    when 'tasks' then return jsonb_build_object('lga_id', row_data -> 'lga_id', 'weekly_plan_id', row_data -> 'weekly_plan_id', 'source', row_data -> 'source', 'status', row_data -> 'status', 'progress_percent', row_data -> 'progress_percent', 'verified_by', row_data -> 'verified_by', 'verified_at', row_data -> 'verified_at');
    when 'task_evidence' then return jsonb_build_object('task_id', row_data -> 'task_id', 'uploaded_by', row_data -> 'uploaded_by', 'reviewed_by', row_data -> 'reviewed_by', 'reviewed_at', row_data -> 'reviewed_at', 'review_note', row_data -> 'review_note');
    when 'task_assignments' then return jsonb_build_object('task_id', row_data -> 'task_id', 'lga_id', row_data -> 'lga_id', 'assignee_id', row_data -> 'assignee_id', 'assigned_by', row_data -> 'assigned_by', 'unassigned_at', row_data -> 'unassigned_at');
    when 'working_day_records' then return jsonb_build_object('lga_id', row_data -> 'lga_id', 'working_date', row_data -> 'working_date', 'status', row_data -> 'status', 'submitted_by', row_data -> 'submitted_by', 'approved_by', row_data -> 'approved_by', 'approved_at', row_data -> 'approved_at', 'authorization_note', row_data -> 'authorization_note', 'latest_approval_event_id', row_data -> 'latest_approval_event_id');
    when 'reports' then return jsonb_build_object('lga_id', row_data -> 'lga_id', 'report_type', row_data -> 'report_type', 'period_start', row_data -> 'period_start', 'period_end', row_data -> 'period_end', 'status', row_data -> 'status', 'reviewed_by', row_data -> 'reviewed_by', 'reviewed_at', row_data -> 'reviewed_at');
    when 'report_shares' then return jsonb_build_object('report_id', row_data -> 'report_id', 'expires_at', row_data -> 'expires_at', 'revoked_at', row_data -> 'revoked_at');
    else return jsonb_build_object('id', row_data -> 'id');
  end case;
end;
$$;

create or replace function public.audit_sensitive_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  before_data jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  after_data jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  subject_data jsonb;
  subject_lga_id uuid;
  subject_id uuid;
begin
  subject_data := coalesce(after_data, before_data);
  subject_id := (subject_data ->> 'id')::uuid;
  subject_lga_id := nullif(subject_data ->> 'lga_id', '')::uuid;
  if subject_lga_id is null and tg_table_name = 'task_evidence' then
    select task.lga_id into subject_lga_id from public.tasks as task where task.id = (subject_data ->> 'task_id')::uuid;
  elsif subject_lga_id is null and tg_table_name = 'working_day_approvals' then
    select record.lga_id into subject_lga_id from public.working_day_records as record where record.id = (subject_data ->> 'working_day_record_id')::uuid;
  elsif subject_lga_id is null and tg_table_name = 'plan_revisions' then
    select coalesce(monthly.lga_id, weekly.lga_id, task.lga_id) into subject_lga_id
    from (select (subject_data ->> 'monthly_plan_id')::uuid as monthly_plan_id, (subject_data ->> 'weekly_plan_id')::uuid as weekly_plan_id, (subject_data ->> 'task_id')::uuid as task_id) as subject
    left join public.monthly_plans as monthly on monthly.id = subject.monthly_plan_id
    left join public.weekly_plans as weekly on weekly.id = subject.weekly_plan_id
    left join public.tasks as task on task.id = subject.task_id;
  elsif subject_lga_id is null and tg_table_name = 'report_shares' then
    select report.lga_id into subject_lga_id from public.reports as report where report.id = (subject_data ->> 'report_id')::uuid;
  end if;

  insert into public.audit_logs (actor_id, lga_id, entity_type, entity_id, action, metadata)
  values (
    auth.uid(), subject_lga_id, tg_table_name, subject_id, lower(tg_op),
    jsonb_strip_nulls(jsonb_build_object(
      'source', 'database_trigger',
      'before', public.audit_snapshot(tg_table_name, before_data),
      'after', public.audit_snapshot(tg_table_name, after_data)
    ))
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create policy task_evidence_supervisor_update on public.task_evidence for update to authenticated
  using (public.is_supervisor() and exists (select 1 from public.tasks as task where task.id = task_evidence.task_id and public.can_access_lga(task.lga_id)))
  with check (public.is_supervisor() and exists (select 1 from public.tasks as task where task.id = task_evidence.task_id and public.can_access_lga(task.lga_id)));

alter table public.working_day_overage_authorizations enable row level security;
create policy working_day_overage_supervisor_read on public.working_day_overage_authorizations for select to authenticated using (public.is_supervisor());
create policy working_day_overage_supervisor_create on public.working_day_overage_authorizations for insert to authenticated
  with check (public.is_supervisor() and authorized_by = auth.uid());

revoke all on function public.valid_plan_transition(public.plan_status, public.plan_status) from public, anon, authenticated;
revoke all on function public.valid_task_transition(public.task_status, public.task_status) from public, anon, authenticated;
revoke all on function public.enforce_plan_write() from public, anon, authenticated;
revoke all on function public.enforce_task_write() from public, anon, authenticated;
revoke all on function public.enforce_evidence_write() from public, anon, authenticated;
revoke all on function public.enforce_working_day_write() from public, anon, authenticated;
revoke all on function public.audit_snapshot(text, jsonb) from public, anon, authenticated;
revoke all on function public.audit_sensitive_mutation() from public, anon, authenticated;
