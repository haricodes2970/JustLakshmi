# Supabase Migrations (Drive-First Boundary)

Supabase is used **only** for authentication (`auth.users`) and minimal operational metadata. Personal records (routines, tasks, history, journals, mood/energy/stress, AI conversations, AI memory) belong exclusively in each user's visible Google Drive `Habbits` folder and local IndexedDB cache.

## Proposed Migrations

### `20261122091000_create_drive_connections.sql` (Draft — Not Applied)

Creates `public.drive_connections` (at most one row per authenticated user via `UNIQUE (user_id)`).

| Column | Type | Justification |
|---|---|---|
| `id` | `uuid` PK | Stable opaque record identifier for operational references. |
| `user_id` | `uuid` NOT NULL UNIQUE FK -> `auth.users(id)` | Enforces 1:1 ownership and cascades cleanup on account deletion. |
| `drive_folder_id` | `text` nullable | Google Drive folder ID for the user's `Habbits` folder; required when `connection_status = 'connected'`. |
| `drive_manifest_file_id` | `text` nullable | Google Drive file ID of `Habbits/manifest.json` to avoid repeated folder scans. |
| `schema_version` | `integer` NOT NULL DEFAULT 1 | Tracks Drive workspace schema version for safe client migrations. |
| `connection_status` | `text` NOT NULL | Constrained to `'not_connected'`, `'connected'`, `'reauth_required'`. |
| `last_synced_at` | `timestamptz` nullable | Operational timestamp of the last confirmed Drive sync. |
| `created_at` / `updated_at` | `timestamptz` NOT NULL | Row lifecycle timestamps (`updated_at` maintained by `public.set_updated_at()` trigger). |

### Deliberately Omitted

- **`account_links`**: Not created. `auth.users(id)` is already the canonical identity; no external identity mapping table is required.
- **Google OAuth access/refresh tokens**: Never stored in Supabase, `localStorage`, or logs.
- **Personal data tables**: No tables for routines, tasks, occurrences, journals, moods, analytics, or AI conversations/memory.

### Security & RLS

- `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` enabled on `public.drive_connections`.
- `anon` and `public` have all privileges revoked; only `authenticated` is granted CRUD.
- Four explicit policies (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) enforce `(select auth.uid()) = user_id` (wrapped in a scalar subquery to avoid per-row re-evaluation).
- No `service_role` key is used by the frontend or standard API paths.
