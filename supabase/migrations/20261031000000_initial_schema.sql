-- eHealth LC Manager foundation. Review before applying to any Supabase project.
create extension if not exists pgcrypto;

create type public.app_role as enum ('lga_coordinator', 'state_coordinator', 'senior_supervisor');
create type public.plan_status as enum ('draft', 'submitted', 'returned', 'approved');
create type public.task_status as enum ('planned', 'ongoing', 'completed', 'returned_for_revision', 'cancelled');
create type public.working_day_status as enum ('claimed', 'approved', 'returned', 'rejected');
create type public.report_status as enum ('draft', 'submitted', 'returned', 'approved', 'shared');

create table public.lgas (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  coordinator_reference_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.app_role not null,
  lga_id uuid references public.lgas(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_lga_role_check check (
    (role = 'lga_coordinator' and lga_id is not null)
    or (role in ('state_coordinator', 'senior_supervisor') and lga_id is null)
  )
);

create table public.operational_policy_settings (
  id uuid primary key default gen_random_uuid(),
  effective_from date not null unique,
  monthly_working_day_allocation integer not null default 15 check (monthly_working_day_allocation > 0),
  confirmed_monthly_take_home numeric(12,2) not null default 463636.00 check (confirmed_monthly_take_home >= 0),
  contract_working_days_per_month integer not null default 22 check (contract_working_days_per_month > 0),
  contract_hours_per_week integer not null default 40 check (contract_hours_per_week > 0),
  contract_working_pattern text not null default 'Monday to Friday',
  created_at timestamptz not null default now()
);

create table public.responsibilities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source text not null check (source in ('official_contract', 'operational')),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  promoted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_promotion_check check (
    (source = 'official_contract' and created_by is null)
    or (source = 'operational' and created_by is not null and promoted_at is not null)
  )
);

create table public.monthly_plans (
  id uuid primary key default gen_random_uuid(),
  lga_id uuid not null references public.lgas(id),
  plan_month date not null check (date_trunc('month', plan_month)::date = plan_month),
  status public.plan_status not null default 'draft',
  submitted_by uuid references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lga_id, plan_month)
);

create table public.weekly_plans (
  id uuid primary key default gen_random_uuid(),
  monthly_plan_id uuid not null references public.monthly_plans(id) on delete restrict,
  lga_id uuid not null references public.lgas(id),
  week_start date not null,
  status public.plan_status not null default 'draft',
  submitted_by uuid references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lga_id, week_start)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  weekly_plan_id uuid references public.weekly_plans(id) on delete restrict,
  lga_id uuid not null references public.lgas(id),
  responsibility_id uuid references public.responsibilities(id),
  source text not null check (source in ('official_library', 'custom_operational', 'supervisor_assigned')),
  title text not null,
  activity_description text,
  expected_deliverable text not null,
  planned_date date,
  deadline date,
  priority smallint not null default 3 check (priority between 1 and 5),
  progress_percent smallint not null default 0 check (progress_percent between 0 and 100),
  status public.task_status not null default 'planned',
  completed_at timestamptz,
  verified_at timestamptz,
  verified_by uuid references public.profiles(id),
  created_by uuid not null references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_source_check check (
    (source = 'official_library' and responsibility_id is not null)
    or (source in ('custom_operational', 'supervisor_assigned'))
  ),
  constraint task_date_check check (deadline is null or planned_date is null or deadline >= planned_date)
);

create table public.task_assignments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  assignee_id uuid not null references public.profiles(id),
  assigned_by uuid not null references public.profiles(id),
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz,
  unique (task_id, assignee_id, assigned_at)
);

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  author_role public.app_role not null,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.task_evidence (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  uploaded_by uuid not null references public.profiles(id),
  uploaded_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text
);

create table public.plan_revisions (
  id uuid primary key default gen_random_uuid(),
  monthly_plan_id uuid references public.monthly_plans(id) on delete restrict,
  weekly_plan_id uuid references public.weekly_plans(id) on delete restrict,
  task_id uuid references public.tasks(id) on delete restrict,
  revision_number integer not null check (revision_number > 0),
  action text not null check (action in ('submitted', 'returned', 'amended', 'approved', 'cancelled')),
  note text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint one_revision_subject check (num_nonnulls(monthly_plan_id, weekly_plan_id, task_id) = 1)
);

create table public.working_day_records (
  id uuid primary key default gen_random_uuid(),
  lga_id uuid not null references public.lgas(id),
  working_date date not null,
  status public.working_day_status not null default 'claimed',
  claim_note text,
  submitted_by uuid not null references public.profiles(id),
  submitted_at timestamptz not null default now(),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  authorization_note text,
  updated_at timestamptz not null default now(),
  unique (lga_id, working_date),
  constraint approval_metadata_check check ((status <> 'approved') or (approved_by is not null and approved_at is not null))
);

create table public.working_day_approvals (
  id uuid primary key default gen_random_uuid(),
  working_day_record_id uuid not null references public.working_day_records(id) on delete cascade,
  action text not null check (action in ('claimed', 'approved', 'returned', 'rejected', 'corrected')),
  note text,
  acted_by uuid not null references public.profiles(id),
  acted_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  lga_id uuid references public.lgas(id),
  report_type text not null check (report_type in ('lga_monthly', 'state_monthly', 'consolidated_monthly', 'payment_consideration')),
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  status public.report_status not null default 'draft',
  created_by uuid not null references public.profiles(id),
  recipient_label text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  feedback text,
  export_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.report_shares (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  recipient_label text not null,
  created_by uuid not null references public.profiles(id),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  lga_id uuid references public.lgas(id),
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  lga_id uuid references public.lgas(id),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index monthly_plans_lga_month_idx on public.monthly_plans (lga_id, plan_month desc);
create index weekly_plans_lga_week_idx on public.weekly_plans (lga_id, week_start desc);
create index tasks_lga_status_deadline_idx on public.tasks (lga_id, status, deadline);
create index tasks_assignee_idx on public.task_assignments (assignee_id, unassigned_at);
create index working_days_lga_date_idx on public.working_day_records (lga_id, working_date desc);
create index reports_lga_period_idx on public.reports (lga_id, period_start desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;

create or replace function public.current_app_role()
returns public.app_role language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.can_access_lga(target_lga_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.current_app_role() in ('state_coordinator', 'senior_supervisor') or exists (select 1 from public.profiles where id = auth.uid() and lga_id = target_lga_id) $$;

create or replace function public.is_supervisor()
returns boolean language sql stable security definer set search_path = public
as $$ select public.current_app_role() in ('state_coordinator', 'senior_supervisor') $$;

create or replace function public.protect_supervisor_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_supervisor() then return new; end if;

  if tg_table_name in ('monthly_plans', 'weekly_plans') then
    if new.reviewed_by is distinct from old.reviewed_by
      or new.reviewed_at is distinct from old.reviewed_at
      or new.review_note is distinct from old.review_note
      or new.status = 'approved'
      or new.submitted_by is distinct from old.submitted_by then
      raise exception 'supervisor review fields may only be changed by a supervisor';
    end if;
  elsif tg_table_name = 'tasks' then
    if new.verified_by is distinct from old.verified_by
      or new.verified_at is distinct from old.verified_at
      or new.created_by is distinct from old.created_by then
      raise exception 'task verification and ownership may only be changed by a supervisor';
    end if;
  elsif tg_table_name = 'working_day_records' then
    if new.status = 'approved'
      or new.approved_by is distinct from old.approved_by
      or new.approved_at is distinct from old.approved_at
      or new.authorization_note is distinct from old.authorization_note then
      raise exception 'working-day approval fields may only be changed by a supervisor';
    end if;
  end if;
  return new;
end;
$$;

create trigger lgas_updated_at before update on public.lgas for each row execute function public.set_updated_at();
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger responsibilities_updated_at before update on public.responsibilities for each row execute function public.set_updated_at();
create trigger monthly_plans_updated_at before update on public.monthly_plans for each row execute function public.set_updated_at();
create trigger weekly_plans_updated_at before update on public.weekly_plans for each row execute function public.set_updated_at();
create trigger tasks_updated_at before update on public.tasks for each row execute function public.set_updated_at();
create trigger task_comments_updated_at before update on public.task_comments for each row execute function public.set_updated_at();
create trigger working_day_records_updated_at before update on public.working_day_records for each row execute function public.set_updated_at();
create trigger reports_updated_at before update on public.reports for each row execute function public.set_updated_at();
create trigger monthly_plans_protect_supervisor_fields before update on public.monthly_plans for each row execute function public.protect_supervisor_fields();
create trigger weekly_plans_protect_supervisor_fields before update on public.weekly_plans for each row execute function public.protect_supervisor_fields();
create trigger tasks_protect_supervisor_fields before update on public.tasks for each row execute function public.protect_supervisor_fields();
create trigger working_days_protect_supervisor_fields before update on public.working_day_records for each row execute function public.protect_supervisor_fields();

alter table public.lgas enable row level security;
alter table public.profiles enable row level security;
alter table public.operational_policy_settings enable row level security;
alter table public.responsibilities enable row level security;
alter table public.monthly_plans enable row level security;
alter table public.weekly_plans enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignments enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_evidence enable row level security;
alter table public.plan_revisions enable row level security;
alter table public.working_day_records enable row level security;
alter table public.working_day_approvals enable row level security;
alter table public.reports enable row level security;
alter table public.report_shares enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

create policy lgas_read on public.lgas for select to authenticated using (true);
create policy profiles_read on public.profiles for select to authenticated using (id = auth.uid() or public.is_supervisor());
create policy policies_read on public.operational_policy_settings for select to authenticated using (true);
create policy responsibilities_read on public.responsibilities for select to authenticated using (true);
create policy responsibilities_supervisor_create on public.responsibilities for insert to authenticated with check (public.is_supervisor());
create policy responsibilities_supervisor_update on public.responsibilities for update to authenticated using (public.is_supervisor()) with check (public.is_supervisor());

create policy monthly_plans_read on public.monthly_plans for select to authenticated using (public.can_access_lga(lga_id));
create policy monthly_plans_create on public.monthly_plans for insert to authenticated with check (public.can_access_lga(lga_id) and (public.is_supervisor() or submitted_by = auth.uid()));
create policy monthly_plans_update on public.monthly_plans for update to authenticated using (public.can_access_lga(lga_id)) with check (public.can_access_lga(lga_id));
create policy weekly_plans_read on public.weekly_plans for select to authenticated using (public.can_access_lga(lga_id));
create policy weekly_plans_create on public.weekly_plans for insert to authenticated with check (public.can_access_lga(lga_id) and (public.is_supervisor() or submitted_by = auth.uid()));
create policy weekly_plans_update on public.weekly_plans for update to authenticated using (public.can_access_lga(lga_id)) with check (public.can_access_lga(lga_id));
create policy tasks_read on public.tasks for select to authenticated using (public.can_access_lga(lga_id));
create policy tasks_create on public.tasks for insert to authenticated with check (public.can_access_lga(lga_id) and created_by = auth.uid());
create policy tasks_update on public.tasks for update to authenticated using (public.can_access_lga(lga_id)) with check (public.can_access_lga(lga_id));
create policy assignments_read on public.task_assignments for select to authenticated using (exists (select 1 from public.tasks t where t.id = task_id and public.can_access_lga(t.lga_id)));
create policy assignments_supervisor_create on public.task_assignments for insert to authenticated with check (public.is_supervisor() and assigned_by = auth.uid());
create policy assignments_supervisor_update on public.task_assignments for update to authenticated using (public.is_supervisor()) with check (public.is_supervisor());
create policy comments_read on public.task_comments for select to authenticated using (exists (select 1 from public.tasks t where t.id = task_id and public.can_access_lga(t.lga_id)));
create policy comments_create on public.task_comments for insert to authenticated with check (author_id = auth.uid() and exists (select 1 from public.tasks t where t.id = task_id and public.can_access_lga(t.lga_id)));
create policy evidence_read on public.task_evidence for select to authenticated using (exists (select 1 from public.tasks t where t.id = task_id and public.can_access_lga(t.lga_id)));
create policy evidence_create on public.task_evidence for insert to authenticated with check (uploaded_by = auth.uid() and exists (select 1 from public.tasks t where t.id = task_id and public.can_access_lga(t.lga_id)));
create policy revisions_access on public.plan_revisions for select to authenticated using (public.is_supervisor() or exists (select 1 from public.monthly_plans p where p.id = monthly_plan_id and public.can_access_lga(p.lga_id)) or exists (select 1 from public.weekly_plans p where p.id = weekly_plan_id and public.can_access_lga(p.lga_id)) or exists (select 1 from public.tasks t where t.id = task_id and public.can_access_lga(t.lga_id)));
create policy revisions_create on public.plan_revisions for insert to authenticated with check (public.is_supervisor() or created_by = auth.uid());
create policy working_days_read on public.working_day_records for select to authenticated using (public.can_access_lga(lga_id));
create policy working_days_create on public.working_day_records for insert to authenticated with check (public.can_access_lga(lga_id) and submitted_by = auth.uid());
create policy working_days_update on public.working_day_records for update to authenticated using (public.can_access_lga(lga_id)) with check (public.can_access_lga(lga_id));
create policy working_day_history_access on public.working_day_approvals for select to authenticated using (exists (select 1 from public.working_day_records w where w.id = working_day_record_id and public.can_access_lga(w.lga_id)));
create policy working_day_history_create on public.working_day_approvals for insert to authenticated with check (acted_by = auth.uid());
create policy reports_access on public.reports for select to authenticated using (public.is_supervisor() or (lga_id is not null and public.can_access_lga(lga_id)));
create policy reports_create on public.reports for insert to authenticated with check (created_by = auth.uid() and (public.is_supervisor() or (lga_id is not null and public.can_access_lga(lga_id))));
create policy reports_supervisor_update on public.reports for update to authenticated using (public.is_supervisor()) with check (public.is_supervisor());
create policy report_shares_supervisor_access on public.report_shares for all to authenticated using (public.is_supervisor()) with check (public.is_supervisor());
create policy notifications_recipient_access on public.notifications for select to authenticated using (recipient_id = auth.uid());
create policy notifications_recipient_update on public.notifications for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy audit_logs_read on public.audit_logs for select to authenticated using (public.is_supervisor() or (lga_id is not null and public.can_access_lga(lga_id)));

insert into public.lgas (code, name, coordinator_reference_name) values
  ('BADE', 'Bade', 'Haruna Bello Ibrahim'), ('BURSARI', 'Bursari', 'Ibrahim Yusuf Muhammad'),
  ('DAMATURU', 'Damaturu', 'Mustapha Jibrin'), ('FIKA', 'Fika', 'Abubakar Musa'),
  ('FUNE', 'Fune', 'Bashir Abubakar'), ('GEIDAM', 'Geidam', 'Mohammed Gaji'),
  ('GUJBA', 'Gujba', 'Mamman Abdulwakil'), ('JAKUSKO', 'Jakusko', 'Mohammed Aliyu Suleiman'),
  ('KARASUWA', 'Karasuwa', 'Mubarak Isa'), ('MACHINA', 'Machina', 'Bashir Mohammed Idris'),
  ('NANGERE', 'Nangere', 'Halima Ahmad Usman'), ('NGURU', 'Nguru', 'Jamilu Aminu Yunusa'),
  ('POTISKUM', 'Potiskum', 'Abubakar Ibrahim'), ('TARMUWA', 'Tarmuwa', 'Hafsatu Umar Machina'),
  ('YUNUSARI', 'Yunusari', 'Adam Bello'), ('YUSUFARI', 'Yusufari', 'Wakil Grema');

insert into public.operational_policy_settings (effective_from) values ('2026-07-01');

insert into public.responsibilities (title, source) values
  ('Support update and management of assigned state Master List of Settlements (MLoS).', 'official_contract'),
  ('Support settlement validation at LGA level.', 'official_contract'),
  ('Support development of micro-plan templates and ward-level maps for each campaign round.', 'official_contract'),
  ('Train LGA teams on using maps to guide microplanning.', 'official_contract'),
  ('Implement coverage analysis and provide feedback at LGA level.', 'official_contract'),
  ('Liaison between eHA, implementation partners, and government agencies at LGA level.', 'official_contract'),
  ('Provide weekly, monthly, and end-of-activity reports to SC.', 'official_contract'),
  ('Train LGA teams on use of maps and tracker handling.', 'official_contract'),
  ('Using GTS and ODK, track special intervention teams during implementation.', 'official_contract'),
  ('Work with project team, business representatives, interdepartmental teams, external vendors and maintain positive relationships.', 'official_contract'),
  ('Assign tasks to internal teams and assist with schedule management.', 'official_contract'),
  ('Ensure clients'' needs are met as projects evolve.', 'official_contract'),
  ('Help prepare budgets, risk analysis, and opportunity searches.', 'official_contract'),
  ('Monitor project progress and handle issues in assigned state.', 'official_contract'),
  ('Act as point of contact and communicate project status to all participants in assigned state.', 'official_contract'),
  ('Assign and retrieve trackers daily from vaccination teams.', 'official_contract'),
  ('Upload tracking data to GTS daily.', 'official_contract'),
  ('Timely travel to assigned locations.', 'official_contract'),
  ('Work with Project Manager to eliminate blockers.', 'official_contract'),
  ('Use tools to monitor working hours, plans, and expenditures.', 'official_contract'),
  ('Promote positive, supportive, cooperative team environment.', 'official_contract'),
  ('Adhere to policies and procedures.', 'official_contract'),
  ('Adhere to eHA code of conduct and ethical standards, including consistency at work and punctuality.', 'official_contract');
