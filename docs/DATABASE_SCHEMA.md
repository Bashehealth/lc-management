# Database schema

The initial draft is in `supabase/migrations/20261031000000_initial_schema.sql`; additive hardening is in `supabase/migrations/20261031000100_schema_hardening.sql`. All primary keys are UUIDs, all mutable records carry timestamps, and authenticated authors/reviewers are retained where relevant.

## Identity and reference data

| Table | Purpose |
| --- | --- |
| `profiles` | Application role, display name, and LGA assignment for an Auth user. |
| `lgas` | The 16 Yobe LGAs and their coordinator reference names; not user accounts. |
| `responsibilities` | Official contract responsibilities and separately tagged supervisor-promoted operational library entries. |
| `operational_policy_settings` | Versioned operational constants, including 15-day allocation, confirmed monthly amount, and retained contract terms. |

## Planning and task delivery

| Table | Purpose |
| --- | --- |
| `monthly_plans` | One LGA planning record per calendar month. |
| `weekly_plans` | Weekly planning records linked to a monthly plan. |
| `tasks` | Planned and supervisor-assigned work, including source, status, progress, evidence requirement, and verification state. |
| `task_assignments` | Assignment history for a task and its assignee. |
| `task_comments` | Attributed discussion, review, and revision requests on a task. |
| `task_evidence` | Metadata for approved Storage objects; object access is not enabled by this migration. |
| `plan_revisions` | Immutable revision/request metadata for monthly plans, weekly plans, and tasks. |

## Working days, reports, and history

| Table | Purpose |
| --- | --- |
| `working_day_records` | A claimed date, approval state, reviewer, and correction note; the LGA/date uniqueness constraint prevents duplicate claims. |
| `working_day_approvals` | Approval and correction history for each working-day record. |
| `reports` | LGA, state, and consolidated report metadata, period, workflow state, recipient, and export metadata. |
| `report_shares` | Read-only sharing metadata with a SHA-256 token hash, hint, expiry, and revocation timestamp; no anonymous access is enabled. |
| `notifications` | Authenticated in-app notices and read state. |
| `audit_logs` | Append-only application audit events, linked to actor and LGA where applicable. |

## Key constraints and calculations

- `lgas.name` and `lgas.code` are unique. The migration seeds the 16 supplied LGAs and names only; it creates no users.
- LGA Coordinators have exactly one LGA on `profiles`; supervisor profiles have no LGA assignment.
- A monthly plan is unique for each LGA/month; a weekly plan is unique for each LGA/week start.
- Task status is limited to Planned, Ongoing, Completed, Returned for revision, or Cancelled. `verified_at` is separate from task status.
- Working-day claims are unique per LGA/date and retain claim, approval, and review history. Application reporting calculates remaining days as `15 - approved days`.
- Payment consideration uses the seeded operational policy values. More than 15 approved days requires an explicit authorization note and must be reviewed.
- Reports are historical records; sharing does not grant a recipient operational access.
- Composite foreign keys require weekly plans to use their monthly plan's LGA, tasks to use their weekly plan's LGA, and assignments to use both the task's LGA and that LGA's LC profile.
- Sensitive writes are enforced by RLS plus trigger guards. Audit rows are written by database triggers and cannot be changed or deleted by ordinary authenticated users.

## Search and reporting

Indexes cover LGA/period, status, assignee, planned dates, and report periods. This supports filtering by LGA, coordinator, month, week, task, and state. Verified task completion uses `verified_at IS NOT NULL`, not an LC-provided progress claim.
