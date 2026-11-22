# JustLakshmi

**Plan. Track. Thrive.**

JustLakshmi is a multi-user, iPhone-first, installable Progressive Web App for daily routines, tasks, calendar history, completion analytics and (later) an optional AI productivity coach.

> **Status: Phase 2 foundation complete.** Monorepo with Next.js PWA (`apps/web`), Fastify v5 API foundation (`apps/api`), shared Zod v4 contracts (`packages/shared`), shared TS/ESLint config (`packages/config`), and draft Drive-first Supabase metadata migration (`supabase/`). Live OAuth, Drive sync, remote migrations, and Render deployment are deferred to subsequent phases.

## Workspace Layout

```text
JL/
  apps/
    web/         # @justlakshmi/web  — Next.js App Router PWA (demo data + typed API client)
    api/         # @justlakshmi/api  — Fastify v5 TypeScript API (health, CORS, Supabase JWT auth)
  packages/
    shared/      # @justlakshmi/shared — Zod v4 schemas, API contracts, Drive sync types
    config/      # @justlakshmi/config — Shared tsconfig and ESLint flat configs
  supabase/      # Local config + draft drive_connections migration (not applied)
  docs/          # DRIVE_FIRST_ARCHITECTURE.md, DEPLOYMENT.md
  Assets/        # Supplied PRD, implementation context and original logo (untouched)
```

## Requirements

- Node.js 20.9+ (developed on 22)
- npm 10+

## Getting Started

```bash
npm install
npm run dev:web     # Frontend: http://localhost:3000
npm run dev:api     # Backend:  http://localhost:4000 (requires apps/api/.env)
```

## Root Scripts

| Script | Purpose |
|---|---|
| `npm run dev` / `dev:web` | Start Next.js frontend dev server |
| `npm run dev:api` | Start Fastify API dev server with `tsx watch` |
| `npm run build` | Build `shared`, `api`, and `web` |
| `npm run build:web` / `build:api` | Build frontend or backend independently (with `shared`) |
| `npm run lint` | Run ESLint across all workspaces |
| `npm run typecheck` | Type-check all workspaces |
| `npm run test` | Run API Fastify inject test suite |
| `npm run icons` | Regenerate PWA icons from `Assets/logo.png` (read-only) |
| `npm run check:pwa` | Validate manifest, icons, service worker and `/offline` against running web server |
| `npm run check` | Run `lint`, `typecheck`, `test`, and `build` |

## Architecture & Deployment Docs

- [docs/DRIVE_FIRST_ARCHITECTURE.md](docs/DRIVE_FIRST_ARCHITECTURE.md) — Drive-first data ownership, Google OAuth (`drive.file`) + Picker flow, token lifecycle, and sync/conflict design.
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Vercel (`apps/web`) migration checklist and Render (`apps/api`, deferred) service configuration.
- [supabase/README.md](supabase/README.md) — Minimal `drive_connections` metadata schema and RLS policy design.
