-- Additive security hardening for the initial eHealth LC Manager schema.
-- Apply after 20261031000000_initial_schema.sql.

alter table public.monthly_plans
  add constraint monthly_plans_id_lga_unique unique (id, lga_id);

alter table public.weekly_plans
  add constraint weekly_plans_id_lga_unique unique (id, lga_id),
  add constraint weekly_plans_monthly_plan_lga_fk
    foreign key (monthly_plan_id, lga_id)
    references public.monthly_plans (id, lga_id);

alter table public.tasks
  add constraint tasks_id_lga_unique unique (id, lga_id),
  add constraint tasks_weekly_plan_lga_fk
    foreign key (weekly_plan_id, lga_id)
    references public.weekly_plans (id, lga_id);

alter table public.profiles
  add constraint profiles_id_lga_unique unique (id, lga_id);

alter table public.task_assignments add column lga_id uuid;

update public.task_assignments assignment
set lga_id = task.lga_id
from public.tasks task
where task.id = assignment.task_id;

alter table public.task_assignments
  alter column lga_id set not null,
  add constraint task_assignments_task_lga_fk
    foreign key (task_id, lga_id) references public.tasks (id, lga_id),
  add constraint task_assignments_assignee_lga_fk
    foreign key (assignee_id, lga_id) references public.profiles (id, lga_id);

alter table public.report_shares
  add column token_hash bytea,
  add column token_hint text,
  add constraint report_shares_expiry_check check (expires_at > created_at);

alter table public.report_shares alter column token_hash set not null;
alter table public.report_shares alter column expires_at set not null;
create unique index report_shares_token_hash_unique on public.report_shares (token_hash);

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select profile.role
  from public.profiles as profile
  where profile.id = auth.uid()
$$;

create or replace function public.is_supervisor()
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select public.current_app_role() in ('state_coordinator', 'senior_supervisor')
$$;

create or replace function public.can_access_lga(target_lga_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select public.is_supervisor()
    or exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role = 'lga_coordinator'
        and profile.lga_id = target_lga_id
    )
$$;

create or replace function public.require_lga_access(target_lga_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if not public.can_access_lga(target_lga_id) then
    raise exception 'not authorized for this LGA' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.enforce_plan_write()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  perform public.require_lga_access(new.lga_id);

  if public.is_supervisor() then
    if new.reviewed_by is not null and new.reviewed_by <> auth.uid() then
      raise exception 'a supervisor may only record their own review' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.submitted_by <> auth.uid()
      or new.status not in ('draft', 'submitted')
      or new.reviewed_by is not null
      or new.reviewed_at is not null
      or new.review_note is not null then
      raise exception 'LGA Coordinators may only create unreviewed draft or submitted plans' using errcode = '42501';
    end if;
  else
    if new.lga_id <> old.lga_id
      or new.submitted_by <> old.submitted_by
      or new.reviewed_by is distinct from old.reviewed_by
      or new.reviewed_at is distinct from old.reviewed_at
      or new.review_note is distinct from old.review_note
      or new.status = 'approved' then
      raise exception 'LGA Coordinators may not approve or review plans' using errcode = '42501';
    end if;
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
begin
  perform public.require_lga_access(new.lga_id);

  if public.is_supervisor() then
    if new.verified_by is not null and new.verified_by <> auth.uid() then
      raise exception 'a supervisor may only record their own verification' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.created_by <> auth.uid()
      or new.source = 'supervisor_assigned'
      or new.verified_by is not null
      or new.verified_at is not null then
      raise exception 'LGA Coordinators may not create supervisor tasks or task verifications' using errcode = '42501';
    end if;
  else
    if new.lga_id <> old.lga_id
      or new.created_by <> old.created_by
      or new.source = 'supervisor_assigned'
      or new.verified_by is distinct from old.verified_by
      or new.verified_at is distinct from old.verified_at then
      raise exception 'LGA Coordinators may not modify task assignment or verification fields' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_task_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  assignee_role public.app_role;
begin
  if not public.is_supervisor() or new.assigned_by <> auth.uid() then
    raise exception 'only a supervisor may assign tasks' using errcode = '42501';
  end if;

  select profile.role into assignee_role
  from public.profiles as profile
  where profile.id = new.assignee_id and profile.lga_id = new.lga_id;

  if assignee_role <> 'lga_coordinator' then
    raise exception 'tasks must be assigned to the LGA Coordinator for the task LGA' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.set_comment_author()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  authenticated_role public.app_role;
begin
  select profile.role into authenticated_role
  from public.profiles as profile
  where profile.id = auth.uid();

  if authenticated_role is null then
    raise exception 'authenticated profile required' using errcode = '42501';
  end if;
  new.author_id := auth.uid();
  new.author_role := authenticated_role;
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
begin
  select task.lga_id into target_lga_id from public.tasks as task where task.id = new.task_id;
  perform public.require_lga_access(target_lga_id);

  if public.is_supervisor() then
    if new.reviewed_by is not null and new.reviewed_by <> auth.uid() then
      raise exception 'a supervisor may only record their own evidence review' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.uploaded_by <> auth.uid()
      or new.reviewed_by is not null
      or new.reviewed_at is not null
      or new.review_note is not null then
      raise exception 'LGA Coordinators may not supply evidence review metadata' using errcode = '42501';
    end if;
  else
    if new.task_id <> old.task_id
      or new.uploaded_by <> old.uploaded_by
      or new.reviewed_by is distinct from old.reviewed_by
      or new.reviewed_at is distinct from old.reviewed_at
      or new.review_note is distinct from old.review_note then
      raise exception 'LGA Coordinators may not modify evidence review metadata' using errcode = '42501';
    end if;
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
begin
  perform public.require_lga_access(new.lga_id);

  if public.is_supervisor() then
    if new.approved_by is not null and new.approved_by <> auth.uid() then
      raise exception 'a supervisor may only record their own approval' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.submitted_by <> auth.uid()
      or new.status <> 'claimed'
      or new.approved_by is not null
      or new.approved_at is not null
      or new.authorization_note is not null then
      raise exception 'LGA Coordinators may only create unapproved working-day claims' using errcode = '42501';
    end if;
  else
    if new.lga_id <> old.lga_id
      or new.working_date <> old.working_date
      or new.submitted_by <> old.submitted_by
      or new.submitted_at <> old.submitted_at
      or new.status <> old.status
      or new.approved_by is distinct from old.approved_by
      or new.approved_at is distinct from old.approved_at
      or new.authorization_note is distinct from old.authorization_note then
      raise exception 'LGA Coordinators may not alter submitted working-day records or approvals' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_working_day_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  target_lga_id uuid;
begin
  if not public.is_supervisor() or new.acted_by <> auth.uid() then
    raise exception 'only a supervisor may create working-day approval history' using errcode = '42501';
  end if;
  select record.lga_id into target_lga_id
  from public.working_day_records as record
  where record.id = new.working_day_record_id;
  if target_lga_id is null then
    raise exception 'working-day record does not exist' using errcode = '23503';
  end if;
  perform public.require_lga_access(target_lga_id);
  return new;
end;
$$;

create or replace function public.enforce_plan_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  target_lga_id uuid;
begin
  if new.created_by <> auth.uid() then
    raise exception 'revision author must be the authenticated user' using errcode = '42501';
  end if;

  select plan.lga_id into target_lga_id from public.monthly_plans as plan where plan.id = new.monthly_plan_id;
  if target_lga_id is null then
    select plan.lga_id into target_lga_id from public.weekly_plans as plan where plan.id = new.weekly_plan_id;
  end if;
  if target_lga_id is null then
    select task.lga_id into target_lga_id from public.tasks as task where task.id = new.task_id;
  end if;
  if target_lga_id is null then
    raise exception 'revision subject does not exist' using errcode = '23503';
  end if;
  perform public.require_lga_access(target_lga_id);

  if new.action in ('returned', 'approved', 'cancelled') and not public.is_supervisor() then
    raise exception 'only a supervisor may return, approve, or cancel a revision' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_report_write()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if new.created_by <> auth.uid() then
    raise exception 'report author must be the authenticated user' using errcode = '42501';
  end if;
  if public.is_supervisor() then return new; end if;

  if new.lga_id is null
    or not public.can_access_lga(new.lga_id)
    or new.report_type <> 'lga_monthly'
    or new.status not in ('draft', 'submitted')
    or new.reviewed_by is not null
    or new.reviewed_at is not null
    or new.feedback is not null then
    raise exception 'LGA Coordinators may only create unreviewed LGA draft or submitted reports' using errcode = '42501';
  end if;
  return new;
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
  row_data jsonb;
  subject_lga_id uuid;
  subject_id uuid;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  subject_id := (row_data ->> 'id')::uuid;
  subject_lga_id := nullif(row_data ->> 'lga_id', '')::uuid;

  if subject_lga_id is null and tg_table_name = 'task_evidence' then
    select task.lga_id into subject_lga_id from public.tasks as task where task.id = (row_data ->> 'task_id')::uuid;
  elsif subject_lga_id is null and tg_table_name = 'working_day_approvals' then
    select record.lga_id into subject_lga_id from public.working_day_records as record where record.id = (row_data ->> 'working_day_record_id')::uuid;
  elsif subject_lga_id is null and tg_table_name = 'plan_revisions' then
    select coalesce(monthly.lga_id, weekly.lga_id, task.lga_id) into subject_lga_id
    from (select (row_data ->> 'monthly_plan_id')::uuid as monthly_plan_id, (row_data ->> 'weekly_plan_id')::uuid as weekly_plan_id, (row_data ->> 'task_id')::uuid as task_id) as subject
    left join public.monthly_plans as monthly on monthly.id = subject.monthly_plan_id
    left join public.weekly_plans as weekly on weekly.id = subject.weekly_plan_id
    left join public.tasks as task on task.id = subject.task_id;
  elsif subject_lga_id is null and tg_table_name = 'report_shares' then
    select report.lga_id into subject_lga_id from public.reports as report where report.id = (row_data ->> 'report_id')::uuid;
  end if;

  insert into public.audit_logs (actor_id, lga_id, entity_type, entity_id, action, metadata)
  values (auth.uid(), subject_lga_id, tg_table_name, subject_id, lower(tg_op), jsonb_build_object('source', 'database_trigger'));
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.enforce_report_share_update()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if not public.is_supervisor() then
    raise exception 'only a supervisor may revoke a report share' using errcode = '42501';
  end if;
  if new.report_id <> old.report_id
    or new.recipient_label <> old.recipient_label
    or new.created_by <> old.created_by
    or new.token_hash <> old.token_hash
    or new.token_hint is distinct from old.token_hint
    or new.expires_at <> old.expires_at
    or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) then
    raise exception 'report shares are immutable except for one-way revocation' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.create_report_share(
  target_report_id uuid,
  target_recipient_label text,
  target_expires_at timestamptz
)
returns table (share_id uuid, token text)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  raw_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if not public.is_supervisor() then
    raise exception 'only a supervisor may create report shares' using errcode = '42501';
  end if;
  if target_expires_at <= now() then
    raise exception 'report share expiry must be in the future' using errcode = '23514';
  end if;
  if not exists (select 1 from public.reports as report where report.id = target_report_id) then
    raise exception 'report does not exist' using errcode = '23503';
  end if;

  insert into public.report_shares (report_id, recipient_label, created_by, token_hash, token_hint, expires_at)
  values (target_report_id, target_recipient_label, auth.uid(), extensions.digest(raw_token, 'sha256'), left(raw_token, 8), target_expires_at)
  returning id into share_id;
  token := raw_token;
  return next;
end;
$$;

drop trigger if exists monthly_plans_protect_supervisor_fields on public.monthly_plans;
drop trigger if exists weekly_plans_protect_supervisor_fields on public.weekly_plans;
drop trigger if exists tasks_protect_supervisor_fields on public.tasks;
drop trigger if exists working_days_protect_supervisor_fields on public.working_day_records;

create trigger monthly_plans_enforce_write before insert or update on public.monthly_plans for each row execute function public.enforce_plan_write();
create trigger weekly_plans_enforce_write before insert or update on public.weekly_plans for each row execute function public.enforce_plan_write();
create trigger tasks_enforce_write before insert or update on public.tasks for each row execute function public.enforce_task_write();
create trigger task_assignments_enforce_write before insert or update on public.task_assignments for each row execute function public.enforce_task_assignment();
create trigger task_comments_set_author before insert on public.task_comments for each row execute function public.set_comment_author();
create trigger task_evidence_enforce_write before insert or update on public.task_evidence for each row execute function public.enforce_evidence_write();
create trigger working_days_enforce_write before insert or update on public.working_day_records for each row execute function public.enforce_working_day_write();
create trigger working_day_approvals_enforce_write before insert on public.working_day_approvals for each row execute function public.enforce_working_day_approval();
create trigger plan_revisions_enforce_write before insert on public.plan_revisions for each row execute function public.enforce_plan_revision();
create trigger reports_enforce_write before insert on public.reports for each row execute function public.enforce_report_write();
create trigger report_shares_enforce_update before update on public.report_shares for each row execute function public.enforce_report_share_update();

create trigger monthly_plans_audit after insert or update or delete on public.monthly_plans for each row execute function public.audit_sensitive_mutation();
create trigger weekly_plans_audit after insert or update or delete on public.weekly_plans for each row execute function public.audit_sensitive_mutation();
create trigger tasks_audit after insert or update or delete on public.tasks for each row execute function public.audit_sensitive_mutation();
create trigger task_assignments_audit after insert or update or delete on public.task_assignments for each row execute function public.audit_sensitive_mutation();
create trigger task_evidence_audit after insert or update or delete on public.task_evidence for each row execute function public.audit_sensitive_mutation();
create trigger plan_revisions_audit after insert on public.plan_revisions for each row execute function public.audit_sensitive_mutation();
create trigger working_day_records_audit after insert or update or delete on public.working_day_records for each row execute function public.audit_sensitive_mutation();
create trigger working_day_approvals_audit after insert on public.working_day_approvals for each row execute function public.audit_sensitive_mutation();
create trigger reports_audit after insert or update or delete on public.reports for each row execute function public.audit_sensitive_mutation();
create trigger report_shares_audit after insert or update on public.report_shares for each row execute function public.audit_sensitive_mutation();

drop policy if exists responsibilities_supervisor_create on public.responsibilities;
drop policy if exists responsibilities_supervisor_update on public.responsibilities;
create policy responsibilities_operational_create on public.responsibilities for insert to authenticated
  with check (public.is_supervisor() and source = 'operational' and created_by = auth.uid() and promoted_at is not null);
create policy responsibilities_operational_update on public.responsibilities for update to authenticated
  using (public.is_supervisor() and source = 'operational')
  with check (public.is_supervisor() and source = 'operational');

drop policy if exists tasks_create on public.tasks;
create policy tasks_create on public.tasks for insert to authenticated
  with check (public.can_access_lga(lga_id) and created_by = auth.uid() and (source <> 'supervisor_assigned' or public.is_supervisor()));

drop policy if exists evidence_create on public.task_evidence;
create policy evidence_create on public.task_evidence for insert to authenticated
  with check (uploaded_by = auth.uid() and reviewed_by is null and reviewed_at is null and review_note is null and exists (select 1 from public.tasks as task where task.id = task_id and public.can_access_lga(task.lga_id)));

drop policy if exists revisions_create on public.plan_revisions;
create policy revisions_create on public.plan_revisions for insert to authenticated with check (created_by = auth.uid());

drop policy if exists working_day_history_create on public.working_day_approvals;
create policy working_day_history_supervisor_create on public.working_day_approvals for insert to authenticated
  with check (public.is_supervisor() and acted_by = auth.uid() and exists (select 1 from public.working_day_records as record where record.id = working_day_record_id and public.can_access_lga(record.lga_id)));

drop policy if exists reports_create on public.reports;
create policy reports_create on public.reports for insert to authenticated
  with check (created_by = auth.uid() and (public.is_supervisor() or (lga_id is not null and public.can_access_lga(lga_id) and report_type = 'lga_monthly' and status in ('draft', 'submitted') and reviewed_by is null and reviewed_at is null and feedback is null)));

drop policy if exists report_shares_supervisor_access on public.report_shares;
create policy report_shares_supervisor_read on public.report_shares for select to authenticated using (public.is_supervisor());
create policy report_shares_supervisor_update on public.report_shares for update to authenticated using (public.is_supervisor()) with check (public.is_supervisor());

revoke insert, update, delete on public.audit_logs from anon, authenticated;

revoke all on function public.current_app_role() from public, anon, authenticated;
revoke all on function public.is_supervisor() from public, anon, authenticated;
revoke all on function public.can_access_lga(uuid) from public, anon, authenticated;
revoke all on function public.require_lga_access(uuid) from public, anon, authenticated;
revoke all on function public.enforce_plan_write() from public, anon, authenticated;
revoke all on function public.enforce_task_write() from public, anon, authenticated;
revoke all on function public.enforce_task_assignment() from public, anon, authenticated;
revoke all on function public.set_comment_author() from public, anon, authenticated;
revoke all on function public.enforce_evidence_write() from public, anon, authenticated;
revoke all on function public.enforce_working_day_write() from public, anon, authenticated;
revoke all on function public.enforce_working_day_approval() from public, anon, authenticated;
revoke all on function public.enforce_plan_revision() from public, anon, authenticated;
revoke all on function public.enforce_report_write() from public, anon, authenticated;
revoke all on function public.audit_sensitive_mutation() from public, anon, authenticated;
revoke all on function public.enforce_report_share_update() from public, anon, authenticated;
revoke all on function public.create_report_share(uuid, text, timestamptz) from public, anon;

grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_supervisor() to authenticated;
grant execute on function public.can_access_lga(uuid) to authenticated;
grant execute on function public.create_report_share(uuid, text, timestamptz) to authenticated;
