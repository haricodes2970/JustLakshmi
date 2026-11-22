# JustLakshmi — Deployment Guide (Vercel & Render)

> **Status:** Documentation only. Do **not** change the existing Vercel production Root Directory until a preview deployment from `apps/web` is verified, and do **not** deploy `apps/api` to Render until explicitly approved.

---

## 1. Frontend — Vercel (`apps/web`)

### Safe Migration Sequence (Zero Production Disruption)
1. Push `feature/phase-2-backend-foundation` and verify a **Preview Deployment** (or temporary staging Vercel project) configured with Root Directory `apps/web`.
2. Confirm the preview serves `/`, `/routines`, `/calendar`, `/analytics`, `/ai`, `/settings`, `/manifest.webmanifest`, `/sw.js`, and `/offline`.
3. Only after preview verification passes and the Phase 2 PR is merged to the production branch, update the Vercel Production Project's **Root Directory** to `apps/web`.

### Vercel Project Settings
| Setting | Value |
|---|---|
| Framework Preset | Next.js |
| Root Directory | `apps/web` |
| Install Command | Default (`npm install` — Vercel detects root npm workspaces and `package-lock.json`) |
| Build Command | `npm run build` (runs inside `apps/web`; `transpilePackages: ["@justlakshmi/shared"]` and `turbopack.root` resolve workspace packages) |
| Node.js Version | `22.x` |

### Vercel Environment Variables (Public Only — No Secrets)
| Variable | Purpose | Required Now |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Base URL of the deployed Render API (no trailing slash) | Optional until backend is deployed |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (`https://<ref>.supabase.co`) | Later phase (Auth UI) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key (never `service_role`) | Later phase (Auth UI) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Public Google OAuth / Picker Client ID (never Client Secret) | Later phase (Drive OAuth) |

---

## 2. Backend — Render (`apps/api`, Deferred)

### Render Web Service Settings
Because `apps/api` depends on the workspace package `@justlakshmi/shared`, build from the repository root while scoping execution to the API workspace (or set Root Directory to `.` and target the workspaces explicitly):

| Setting | Value |
|---|---|
| Service Type | Web Service (Node) |
| Runtime | Node 22 |
| Root Directory | `.` (monorepo root so npm workspaces link `@justlakshmi/shared` cleanly into `apps/api`) |
| Build Command | `npm ci && npm run build --workspace=@justlakshmi/shared && npm run build --workspace=@justlakshmi/api` |
| Start Command | `npm run start --workspace=@justlakshmi/api` |
| Health Check Path | `/health` |

> Alternative if setting Render Root Directory to `apps/api`: Render must still install from the monorepo root (`cd ../.. && npm ci && npm run build --workspace=@justlakshmi/shared && npm run build --workspace=@justlakshmi/api`) and start with `node dist/server.js`. Using `.` as Render Root Directory with workspace commands is simpler and less brittle.

### Render Environment Variables (Names Only — Never Commit Secrets)
| Variable | Example / Notes |
|---|---|
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `PORT` | Injected automatically by Render (Fastify binds to `env.PORT`) |
| `LOG_LEVEL` | `info` |
| `CORS_ORIGINS` | Comma-separated exact frontend origins (e.g. `https://justlakshmi.vercel.app`). Wildcard `*` is rejected at startup. |
| `SUPABASE_URL` | Supabase project URL (`https://<ref>.supabase.co`) |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key only (`sb_secret_*` is rejected at startup; never use `service_role` here). |
