# Supabase Migrations (Drive-First Boundary)

Supabase is used **only** for authentication (`auth.users`) and minimal operational metadata. Personal records (routines, tasks, history, journals, mood/energy/stress, AI conversations, AI memory) belong exclusively in each user's visible Google Drive `Habbits` folder and local IndexedDB cache.

## Proposed Migrations

### `20261122091000_create_drive_connections.sql` (Draft — Not Applied)

Creates `public.drive_connections` (at most one row per authenticated user via `UNIQUE (user_id)`).

| Column | Type | Justification |
|---|---|---|
| `id` | `uuid` PK | Stable opaque record identifier for operational references. |
| `user_id` | `uuid` NOT NULL UNIQUE FK -> `auth.users(id)` | Enforces 1:1 ownership and cascades cleanup on account deletion. |
| `drive_folder_id` | `text` nullable | Google Drive folder ID for the user's `Habbits` folder. |
| `drive_manifest_file_id` | `text` nullable | Google Drive file ID of `Habbits/manifest.json`; cannot exist without `drive_folder_id`. |
| `schema_version` | `integer` NOT NULL DEFAULT 1 | Tracks Drive workspace schema version for safe client migrations. |
| `connection_status` | `text` NOT NULL | Constrained to `'not_connected'`, `'connected'`, `'reauth_required'`. |
| `verified_at` | `timestamptz` nullable | Timestamp when the app verified both the `Habbits` folder and its manifest; required before `connection_status = 'connected'`. |
| `last_synced_at` | `timestamptz` nullable | Operational timestamp of the last confirmed Drive sync. |
| `created_at` / `updated_at` | `timestamptz` NOT NULL | Row lifecycle timestamps (`updated_at` maintained by `public.set_updated_at()` trigger). |

### Integrity Constraints

- `drive_connections_manifest_requires_folder_check`: `drive_manifest_file_id` cannot be set without `drive_folder_id`.
- `drive_connections_verified_requires_folder_and_manifest_check`: `verified_at` cannot be set unless both `drive_folder_id` and `drive_manifest_file_id` are present.
- `drive_connections_connected_requires_verified_folder_and_manifest_check`: `connection_status` cannot be `'connected'` until `drive_folder_id`, `drive_manifest_file_id`, and `verified_at` are all non-null.

### Deliberately Omitted

- **`account_links`**: Not created. `auth.users(id)` is already the canonical identity.
- **`DELETE` grant and policy**: Omitted. Disconnecting transitions `connection_status` to `'not_connected'` via `UPDATE`; account deletion removes the row automatically via `ON DELETE CASCADE` on `auth.users(id)`.
- **Google OAuth access/refresh tokens**: Never stored in Supabase, `localStorage`, or logs.
- **Personal data tables**: No tables for routines, tasks, occurrences, journals, moods, analytics, or AI conversations/memory.

### Security & RLS

- `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` enabled on `public.drive_connections`.
- `anon` and `public` have all privileges revoked; only `authenticated` is granted `SELECT`, `INSERT`, `UPDATE`.
- Three explicit policies (`SELECT`, `INSERT`, `UPDATE`) enforce `(select auth.uid()) = user_id` (scalar subquery avoids per-row re-evaluation).
- No `service_role` key is used by the frontend or standard API paths.
