# Architecture

## Scope

eHealth LC Manager supports operational planning, supervision, working-day verification, payment consideration, and reporting for Yobe State's 16 LGAs. The foundation deliberately has no product screens, Supabase connection, users, or deployment configuration.

## Planned application layers

- `src/app`: Next.js App Router routes, layouts, and route handlers.
- `src/components`: shared presentational components.
- `src/features`: domain modules for plans, tasks, working days, reports, and supervision.
- `src/hooks`: shared React hooks.
- `src/lib`: server-only clients, authorization helpers, validation, and utilities.
- `src/types`: shared TypeScript types.
- `supabase/migrations`: reviewed PostgreSQL schema and RLS migrations.

Feature modules must use server-side authorization and Supabase RLS. Client-side navigation or hidden controls are never an authorization boundary.

## Data flow and boundaries

1. Supabase Auth identifies a user.
2. A `profiles` record supplies the application role and, for LGA Coordinators, the assigned LGA.
3. Server actions and route handlers validate inputs and use the user session.
4. PostgreSQL foreign keys, constraints, and RLS enforce ownership and supervisor access.
5. Supabase Storage will hold task evidence; storage policies must mirror database access before uploads are enabled.
6. Report exports and secure sharing are future server-side capabilities; they must use authorized report data only.

## Domain rules

- Contract responsibilities are a curated, seeded task library. Supervisor operational tasks remain distinct until an authorized supervisor promotes them.
- Monthly plans contain weekly plans; tasks belong to a weekly plan and may reference a library responsibility.
- An LC's task completion claim is separate from supervisor verification.
- The operational allocation is 15 approved working days per month. The contract's 22-working-day / 40-hour-week provision is stored separately as policy metadata, not replaced.
- Payment consideration uses `463636 / 15 * approved_days`; payment execution and bank data are out of scope.
- Historical data is retained through revisions, approvals, and audit records rather than destructive updates.

## Deployment posture

Vercel and a production Supabase project are planned later. Environment files contain placeholders only. Production credentials, user provisioning, secure sharing tokens, PWA offline caching, and export tooling require separate implementation and security review.
