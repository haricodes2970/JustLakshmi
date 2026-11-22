# JustLakshmi — Drive-First Data Architecture

> Status: Phase 2C Architecture & Contracts (drafted; migrations not applied, full sync engine deferred).

## 1. Data Ownership Model

Each user owns their personal records in a visible Google Drive folder named **`Habbits`** (exact spelling, preserved across all versions).

| Layer | Responsibility | Strict Boundary |
|---|---|---|
| **Google Drive (`Habbits/`)** | Primary durable source of truth for routines, tasks, occurrences, history, journals, mood/energy/stress, and AI memory. | User-owned; restorable without Supabase. |
| **IndexedDB (Browser)** | Offline working copy, cache, and durable mutation outbox. | Working copy only; never holds plaintext OAuth tokens. |
| **Supabase** | Authentication (`auth.users`) and minimal operational metadata (`public.drive_connections`). | Zero plaintext personal records; zero Google OAuth tokens; zero `account_links`. |
| **Vercel (`apps/web`)** | Next.js App Router PWA frontend. | Publishable keys only; never receives `service_role` key. |
| **Render (`apps/api`, deferred)** | Fastify v5 TypeScript API (auth verification, metadata ops, future notification scheduling). | No general Drive access; no Drive refresh tokens; never reads user Drive files. |

## 2. Supabase Metadata Architecture

- **Identity:** Supabase Auth (`auth.users.id`) is the canonical user ID. No `account_links` table is created.
- **Proposed table:** `public.drive_connections` ([20261122091000_create_drive_connections.sql](../supabase/migrations/20261122091000_create_drive_connections.sql)) stores only `id`, `user_id` (1:1 unique FK with `ON DELETE CASCADE`), `drive_folder_id`, `drive_manifest_file_id`, `schema_version`, `connection_status`, `last_synced_at`, `created_at`, and `updated_at`.
- **Isolation:** `ENABLE` + `FORCE ROW LEVEL SECURITY`, `anon`/`public` revoked, `authenticated` granted CRUD with four policies enforcing `(select auth.uid()) = user_id`.

## 3. Google Drive Authorization Architecture

Google sign-in (Supabase Auth identity) and Google Drive authorization are **strictly separate grants**. Signing in does not grant Drive API access.

### Scope & Folder Discovery
- **Least-privilege scope:** `https://www.googleapis.com/auth/drive.file` only. Broad `drive` scope is never requested for convenience.
- **Create-new-folder flow:** App creates `Habbits` directly via Drive API under `drive.file`, records the returned `drive_folder_id`, initializes `Habbits/manifest.json`, and saves only the folder/manifest IDs to `drive_connections`.
- **Select-existing-folder flow:** Because `drive.file` does not grant silent visibility to pre-existing folders, the user selects their existing `Habbits` folder via **Google Picker**. The app then verifies folder name/access and reads/validates `manifest.json` before attaching.

### Token Lifecycle & Threat Model
- **Short-lived in-memory access tokens:** Google Drive OAuth access tokens live in browser memory only. They are **never** written to `localStorage`, `sessionStorage`, IndexedDB, Supabase, URLs, or logs.
- **No backend refresh tokens:** Neither Vercel nor Render stores Google Drive refresh tokens, preventing the platform operator from routinely reading user Drive files.
- **Reauthorization strategy:** When an access token expires, local work continues uninterrupted in IndexedDB. Pending mutations remain queued in the outbox, UI displays `reauth_required`, and the user triggers an explicit reconnect prompt to resume syncing.
- **Revocation:** Users can revoke Drive access from Google Account permissions or disconnect in Settings; disconnecting sets `connection_status = 'not_connected'` without deleting their `Habbits` folder.
- **Ownership & access checks:** Before writing, the client verifies the target `folderId` is accessible, not trashed, and matches the expected `manifest.json` schema version.
- **Error handling:** `401`/`403` -> transition to `reauth_required` (preserve outbox); `404` -> prompt user to locate/recreate `Habbits` via Picker; `429`/`5xx` -> exponential backoff with jitter.

## 4. Synchronization Design & Shared Contracts

All sync contracts live in `packages/shared/src/sync.ts`:

- **Manifest & versioning:** `DriveManifestSchema` tracks `schemaVersion`, `folderId`, `updatedAt`, and per-file `DriveFileMetadataSchema` (including SHA-256 checksums and `modifiedTime`).
- **Stable IDs & idempotency:** Every record uses a stable ID (`RecordIdSchema`). Outbox mutations (`OfflineMutationOutboxItemSchema`) carry `idempotencyKey`, `baseVersion`, `attempts`, `nextRetryAt`, and `status` (`queued | in_flight | failed_retryable | failed_permanent`).
- **Historical integrity & conflicts:** Routine templates are separated from date-specific task occurrences. Concurrent edits where `remoteVersion !== baseVersion` produce a `SyncConflictRecordSchema` retaining **both** `localSnapshot` and `remoteSnapshot` — never silent last-write-wins overwrite.
- **Deletes:** `TombstoneSchema` propagates deletions across devices without resurrecting removed records.
- **iOS honesty:** Sync runs when the PWA is active and online; no claim of reliable closed-app iOS background sync.

## 5. API Contracts & Frontend Client

- Shared Zod schemas in `@justlakshmi/shared` validate both server and client boundaries.
- `apps/web/src/lib/api-client.ts` reads `NEXT_PUBLIC_API_BASE_URL` (zero hardcoded URLs), forwards `Authorization: Bearer <token>`, parses standardized `ApiErrorResponseSchema` errors into `ApiClientError`, and validates all responses against shared schemas.

## 6. Remaining Implementation Work (Post-Phase 2C)

1. Human approval and application of `20261122091000_create_drive_connections.sql`.
2. Phase 2D: Final verification pass + Vercel (`apps/web`) and Render (`apps/api`) deployment documentation.
3. Subsequent phases: Live Supabase Google Auth UI, `drive.file` + Google Picker OAuth spike, IndexedDB repository + outbox sync engine, conflict resolution UI.
