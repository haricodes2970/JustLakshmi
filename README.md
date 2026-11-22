# JustLakshmi

**Plan. Track. Thrive.**

JustLakshmi is a multi-user, iPhone-first, installable Progressive Web App for daily routines, tasks, calendar history, completion analytics and (later) an optional AI productivity coach.

> **Status: Phase 1 - application foundation.** This is a navigable frontend shell that runs on clearly labelled **demo data only**. There is no authentication, no Google Drive integration, no backend, no AI provider and no notifications yet.

## Stack

- Next.js (App Router) + React, TypeScript (`strict`, plus `noUncheckedIndexedAccess`)
- Tailwind CSS v4 (design tokens in `src/app/globals.css`)
- Lucide icons
- Hand-written service worker (`public/sw.js`) and web app manifest (`src/app/manifest.ts`)
- No UI/state/chart libraries; charts are plain SVG/CSS.

Dependency versions are pinned by `package-lock.json`. ESLint is held on v9 and TypeScript on v5 because `eslint-config-next` does not yet support ESLint 10 / TypeScript 7 peers.

## Requirements

- Node.js 20.9+ (developed on 22)
- npm 10+

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

Production build:

```bash
npm run build
npm run start
```

Note: the production build downloads the Google Fonts (DM Sans, Instrument Serif) via `next/font`, so it needs network access. The service worker is registered **only in production builds**.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `start` | Production build and server |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run check` | lint + typecheck + build |
| `npm run icons` | Regenerate PWA icons and brand marks from `Assets/logo.png` (read-only) |
| `npm run check:pwa` | Validate the manifest, icons, service worker and offline page against a running server (`BASE_URL`, default `http://localhost:3000`) |

## Project structure

```
Assets/                  Supplied PRD, implementation context and original logo (never modified)
public/
  sw.js                  Service worker foundation (app shell + offline fallback)
  icons/, brand/         Generated from Assets/logo.png
scripts/                 generate-icons.mjs, check-pwa.mjs
src/
  app/                   Routes, root layout, manifest, offline + not-found
    (app)/               Shell route group: home, routines, calendar, analytics, ai, settings
  components/
    layout/              Logo, bottom nav, sidebar, mobile header
    ui/                  Reusable accessible primitives
    pwa/                 Service worker registration
  features/              Feature views: home, routines, calendar, analytics, ai, settings, tasks, demo
  domain/                Pure logic (recurrence, analytics/streaks) - no React
  data/demo/             Sample data (all of it is demo data)
  config/                Product constants and navigation
  theme/                 Theme store (light/dark/system) and pre-paint init script
  lib/                   Date utilities, clock hook, helpers
  types/                 Shared types
```

## Architecture notes (future phases)

The approved architecture is **Drive-first**:

| Layer | Responsibility |
|---|---|
| Vercel | Next.js frontend and lightweight APIs |
| Supabase | Authentication and minimal operational metadata only |
| Google Drive | Primary durable user records in a visible `Habbits` folder |
| IndexedDB | Offline working copy and mutation queue |
| Render | Background worker for scheduled jobs and push delivery |
| Lakshmi AI | Read-only retrieval over explicitly authorised records |

None of this exists in Phase 1. The code is prepared for it by keeping domain logic (`src/domain`) separate from UI, and by routing all task data through one in-memory store (`src/features/demo/demo-store.tsx`) that a repository-backed implementation can replace without changing views.

## Demo data

Everything under `src/data/demo` and everything shown on Home, Routines, Calendar and Analytics is sample data generated relative to today's date. Items added through quick add live in memory only and disappear on reload. Demo areas carry a visible "Demo data" badge.

## PWA

- Manifest at `/manifest.webmanifest`, icons derived from the official logo (192, 512, maskable 512, Apple touch 180).
- `viewport-fit=cover` with `env(safe-area-inset-*)` handling for iOS.
- The service worker caches static assets and visited pages and serves `/offline` when a page is not cached.
- **Not implemented:** background sync, push notifications, and any guarantee of iOS background execution.

## Theme

Light, dark or system, chosen in Settings and stored locally (`localStorage` key `jl-theme`). An inline script applies it before first paint to avoid a flash.

## Security

No secrets are required. `.env.example` lists reserved variable names only; never commit real `.env` files.
