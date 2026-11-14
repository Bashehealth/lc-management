-- Working Days live workflow: atomic supervisor decisions and self-approval protection.
-- Apply after 20261031000200_security_integrity.sql.

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

  if new.status = 'approved' and old.status <> 'approved' and old.submitted_by = auth.uid() then
    raise exception 'supervisors may not approve their own working-day claims' using errcode = '42501';
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


create or replace function public.review_working_day_claim(
  p_record_id uuid,
  p_action text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  target public.working_day_records%rowtype;
  event_id uuid;
begin
  if auth.uid() is null or not public.is_supervisor() then
    raise exception 'only an authenticated supervisor may review working-day claims' using errcode = '42501';
  end if;
  if p_action not in ('approved', 'returned') then
    raise exception 'unsupported working-day decision' using errcode = '22023';
  end if;
  if p_action = 'returned' and length(trim(coalesce(p_note, ''))) = 0 then
    raise exception 'a reason is required when returning a claim' using errcode = '23514';
  end if;

  select * into target
  from public.working_day_records
  where id = p_record_id
  for update;

  if not found then
    raise exception 'working-day claim not found' using errcode = 'P0002';
  end if;
  perform public.require_lga_access(target.lga_id);
  if target.status <> 'claimed' then
    raise exception 'only pending claims can be reviewed' using errcode = '23514';
  end if;
  if p_action = 'approved' and target.submitted_by = auth.uid() then
    raise exception 'you cannot approve your own working-day claim' using errcode = '42501';
  end if;

  insert into public.working_day_approvals (
    working_day_record_id, action, note, acted_by
  ) values (
    target.id, p_action, nullif(trim(coalesce(p_note, '')), ''), auth.uid()
  ) returning id into event_id;

  update public.working_day_records
  set status = p_action::public.working_day_status,
      approved_by = case when p_action = 'approved' then auth.uid() else null end,
      approved_at = case when p_action = 'approved' then now() else null end,
      latest_approval_event_id = event_id
  where id = target.id;
end;
$$;

revoke all on function public.review_working_day_claim(uuid, text, text) from public, anon;
grant execute on function public.review_working_day_claim(uuid, text, text) to authenticated;
