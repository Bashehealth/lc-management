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
      raise exception 'plan submitter must be the authenticated user'
        using errcode = '42501';
    end if;
  else
    if tg_table_name = 'monthly_plans' then
      period_changed := new.plan_month <> old.plan_month;
    else
      period_changed := new.week_start <> old.week_start;
    end if;

    if new.lga_id <> old.lga_id
      or period_changed
      or new.submitted_by <> old.submitted_by then
      raise exception 'plan LGA, period, and submitter are immutable'
        using errcode = '42501';
    end if;

    if not public.valid_plan_transition(old.status, new.status) then
      raise exception 'invalid plan status transition'
        using errcode = '23514';
    end if;
  end if;

  review_required := new.status in ('returned', 'approved');

  if review_required and (new.reviewed_by is null or new.reviewed_at is null) then
    raise exception 'returned and approved plans require reviewer metadata'
      using errcode = '23514';
  end if;

  if not review_required and (
    new.reviewed_by is not null
    or new.reviewed_at is not null
    or new.review_note is not null
  ) then
    raise exception 'unreviewed plans cannot retain review metadata'
      using errcode = '23514';
  end if;

  if new.status = 'returned'
    and coalesce(length(trim(new.review_note)), 0) = 0 then
    raise exception 'returned plans require a review note'
      using errcode = '23514';
  end if;

  if public.is_supervisor() then
    if review_required and new.reviewed_by <> auth.uid() then
      raise exception 'a reviewer must be the authenticated supervisor'
        using errcode = '42501';
    end if;
  elsif review_required then
    raise exception 'only a supervisor may return or approve a plan'
      using errcode = '42501';
  end if;

  return new;
end;
$$;
