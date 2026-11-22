# JustLakshmi — Phase 3 Implementation Progress

Branch: `feature/phase-3-product-implementation` (branched from `feature/phase-2-backend-foundation` @ `78d0edc`).

## Phase A — Repository Audit

### Already Implemented (Phases 1 & 2)
- Monorepo (`npm workspaces`): `apps/web`, `apps/api`, `packages/shared`, `packages/config`.
- Next.js 16 App Router PWA (`apps/web`): responsive shell (mobile bottom nav + desktop sidebar), safe-area handling, light/dark/system theme persistence, manifest, service worker app-shell + `/offline`, icons derived from `Assets/logo.png`.
- Fastify v5 API (`apps/api`): Zod v4 env validation, Pino log redaction, Helmet, strict CORS allowlist, centralized `ApiErrorResponse`, `GET /health`, `GET /api/v1/status`, `GET /api/v1/auth/me`, `POST /api/v1/drive/connection/validate`, Supabase publishable-key JWT verifier, 19 inject tests.
- Draft Supabase migration (`supabase/migrations/20261122091000_create_drive_connections.sql`) with strict RLS (not applied).
- Shared Zod v4 contracts (`packages/shared`) and typed frontend API client (`apps/web/src/lib/api-client.ts`).

### Gaps Identified for Phase 3
1. **Authentication:** No Supabase Auth browser client, OAuth callback route, session refresh, sign-in/sign-out UI, or API rate limiting / RLS-backed Drive connection endpoints.
2. **Google Drive:** No GIS `drive.file` OAuth flow, Google Picker integration, in-memory token store, folder verification, or manifest/file read-write client.
3. **Offline-First Data Layer:** Currently in-memory demo store only; no IndexedDB (`idb`) database, durable outbox, sync engine, conflict resolution, or tombstones.
4. **Product Features:** Missing measurable/duration task modes, incremental progress + audit history, custom recurrence, recurring edit scope (`this_occurrence` vs `future_occurrences`), category CRUD with safe reassignment, structured daily journal (mood/energy/stress + prompts), and JSON data export.
5. **Lakshmi AI:** Placeholder only; missing BYOK provider adapters (OpenAI, Gemini, Groq, OpenRouter), explicit consent flow, local read-only RAG retriever, and persistent Drive-backed AI memory controls.
6. **Notifications:** Missing per-task/global notification preferences, Web Push subscription lifecycle, worker-compatible scheduler interfaces, and service worker `push` handler.

## Execution Checklist
- [x] Phase A — Repository audit, branch setup, dependency installation
- [ ] Phase B — Supabase Auth integration, session/callback handling, API rate limiting & RLS endpoints
- [ ] Phase C — Google Drive `drive.file` OAuth, Google Picker, folder/manifest verification & REST client
- [ ] Phase D — IndexedDB repository, durable outbox, sync engine, conflict resolution & unit tests
- [ ] Phase E — Routines, tasks (checkbox/measurable/duration + audit), calendar, real analytics, journal & settings/export
- [ ] Phase F — Lakshmi AI (BYOK 1–2 keys, OpenAI/Gemini/Groq/OpenRouter adapters, read-only RAG, persistent memory)
- [ ] Phase G — Notifications (preferences, Web Push subscription, worker-compatible scheduler, SW push handler)
- [ ] Phase H — Full verification (lint, typecheck, unit/integration tests, builds, npm audit, PWA, Playwright E2E)
