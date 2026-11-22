# JustLakshmi — Phase 3.1 Critical Hardening

Branch: `feature/phase-3.1-data-integrity-hardening`

## P0-A: Per-User IndexedDB Isolation

### Problem Addressed
Previously, IndexedDB used a single global database (`justlakshmi-local`) and `WorkspaceProvider` loaded records before authentication finished resolving. On shared browsers, User B could see User A's cached records or guest records could mix with an authenticated account.

### Implemented Strategy
- **Scoped Database Names (`apps/web/src/data/local/db.ts`):**
  - Authenticated user: `justlakshmi-user-<sanitizedSupabaseUserId>`
  - Unauthenticated / local guest: `justlakshmi-guest`
  - Legacy Phase 3.0 unscoped DB (`justlakshmi-local`) is **never** automatically attached to an authenticated user or guest workspace.
- **Complete Scope Isolation:** All 11 object stores (`categories`, `routineTemplates`, `taskOccurrences`, `progressEvents`, `auditEvents`, `journalEntries`, `aiMemories`, `syncOutbox`, `syncConflicts`, `tombstones`, `meta` [Drive connection, notification prefs, AI consent]) live inside the active scope's database.
- **Auth-First Loading & Safe Account Switch (`apps/web/src/features/workspace/workspace-provider.tsx`):**
  - `WorkspaceProvider` waits until `auth.status !== "loading"` before opening IndexedDB, preserving offline access for a previously established Supabase session.
  - On sign-out or account change, the previous DB handle is closed (`closeLocalDb`), the in-memory Google Drive token is cleared (`clearDriveAccessToken`), `AiViewInner` remounts via `key={auth.user?.id ?? "guest"}` (wiping in-memory BYOK keys and chat history), and a monotonic generation counter prevents stale async loads from populating the new user's workspace.
- **Deliberate Legacy Migration:** Settings exposes an explicit **Export legacy unscoped data** control when `justlakshmi-local` contains records, plus `importWorkspaceJsonIntoScope()` for explicit validated imports.

## P0-B: Complete Bidirectional Google Drive Synchronization

### Implemented Strategy (`apps/web/src/lib/drive/client.ts`, `apps/web/src/data/sync/engine.ts`)
1. **Remote Hydration Before Upload:** `runDriveSync` always reads `manifest.json` + its `ETag`/`headRevisionId` and downloads every manifest-referenced bundle (`categories`, `routines`, `occurrences`, `events` [progress, audit, tombstones], `journal`, `aiMemories`) **before** any upload. Reconnecting an existing `Habbits` folder immediately hydrates remote records into IndexedDB, and an empty new device never reports sync complete while remote records are missing locally.
2. **Schema Migration & Checksum Verification:** `migrateDriveManifest` upgrades legacy `schemaVersion < 1` manifests safely to `v1` and rejects unsupported future versions (`SCHEMA_UNSUPPORTED`). Every downloaded bundle is verified against its SHA-256 checksum (`CHECKSUM_MISMATCH` aborts before touching local data) and validated with Zod v4 schemas.
3. **Deterministic Merge, Tombstones & Full Conflict Detection:**
   - `mergeWorkspaceDatasets` merges all versioned entities (`category`, `routineTemplate`, `taskOccurrence`, `journalEntry`, `aiMemory`) by stable ID and merges append-only logs (`progressEvents`, `auditEvents`, `tombstones`) by union.
   - Tombstones propagate deletions across devices and prevent resurrection.
   - Divergent edits on **any** versioned entity produce a `SyncConflictRecord` retaining both `localSnapshot` and `remoteSnapshot` and halt upload until the user resolves the conflict (`keep_local` / `keep_remote` / `keep_both`).
4. **Concurrency Protection & Durable Outbox:**
   - `manifest.json` updates enforce both `If-Match` ETag and pre-write `headRevisionId` revision checks (`412 CONFLICT` aborts cleanly without overwriting concurrent edits from another device).
   - Outbox items are cleared **only** after both all bundle uploads and the conditional manifest write succeed.
   - `429`, Drive quota `403`, and `5xx` errors keep outbox items queued with exponential backoff + jitter; `401`/revoked `403` clears the in-memory Drive token and transitions to `reauth_required` without losing local data.

## Additional Security Hardening
- Added HTTP security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`) in `apps/web/next.config.ts`.
- Service worker (`apps/web/public/sw.js`) explicitly bypasses `/api/` and `/auth/` routes and all cross-origin requests.
- Revoking AI consent immediately aborts any in-flight AI request via `AbortController`.
- Verified all private `/api/v1/*` routes enforce `requireAuth` and derive tenant identity exclusively from server-verified Supabase JWTs.
