# eHealth LC Manager

eHealth LC Manager is a planned mobile-first operational management and reporting application for Yobe State LGA Coordinators, the State Coordinator, and the Senior Supervisor.

This repository currently contains the application foundation only: the Next.js starter, architecture and data-design documentation, environment placeholders, and a draft Supabase migration. No feature screens, user accounts, production services, or deployments are included.

## Technology

- Next.js App Router and TypeScript (strict mode)
- Tailwind CSS
- Supabase PostgreSQL, Auth, and Storage (integration to be added later)
- PWA, PDF, and Excel reporting are planned for later phases

## Local setup

1. Install Node.js 20.9 or later.
2. Copy `.env.example` to `.env.local` and add values for a local Supabase project only when integration work is approved.
3. Install dependencies with `npm.cmd install`.
4. Start the development server with `npm.cmd run dev`.
5. Open `http://localhost:3000`.

## Verification

```powershell
npm.cmd run build
npx.cmd tsc --noEmit
```

## Database draft

The initial SQL draft is at `supabase/migrations/20261031000000_initial_schema.sql`. Review it before applying it to any Supabase project. It creates reference data and security policies, but does not create Auth users, credentials, or external connections.

## Documentation

- `docs/ARCHITECTURE.md` — system boundaries and planned layers
- `docs/DATABASE_SCHEMA.md` — entities, constraints, and reporting model
- `docs/ROLE_PERMISSIONS.md` — access model and RLS boundaries
- `docs/DEPENDENCY_AUDIT.md` — dependency-vulnerability assessment

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
