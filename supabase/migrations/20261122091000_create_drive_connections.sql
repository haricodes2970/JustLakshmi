-- Migration: 20261122091000_create_drive_connections.sql
-- Status: PROPOSED DRAFT — DO NOT APPLY WITHOUT EXPLICIT APPROVAL.
--
-- Drive-first metadata boundary:
--   Stores minimal per-user Google Drive connection metadata only.
--   NEVER stores Google OAuth access tokens, refresh tokens, API keys,
--   tasks, routines, journals, mood records, analytics, or AI conversations.
--   Identity is provided directly by auth.users(id); no account_links table is needed.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.drive_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  drive_folder_id text,
  drive_manifest_file_id text,
  schema_version integer not null default 1,
  connection_status text not null default 'not_connected',
  verified_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint drive_connections_status_check
    check (connection_status in ('not_connected', 'connected', 'reauth_required')),
  constraint drive_connections_folder_id_len_check
    check (drive_folder_id is null or char_length(btrim(drive_folder_id)) between 1 and 256),
  constraint drive_connections_manifest_id_len_check
    check (drive_manifest_file_id is null or char_length(btrim(drive_manifest_file_id)) between 1 and 256),
  constraint drive_connections_manifest_requires_folder_check
    check (drive_manifest_file_id is null or drive_folder_id is not null),
  constraint drive_connections_verified_requires_folder_and_manifest_check
    check (verified_at is null or (drive_folder_id is not null and drive_manifest_file_id is not null)),
  constraint drive_connections_connected_requires_verified_folder_and_manifest_check
    check (
      connection_status <> 'connected'
      or (drive_folder_id is not null and drive_manifest_file_id is not null and verified_at is not null)
    ),
  constraint drive_connections_schema_version_check
    check (schema_version >= 1)
);

comment on table public.drive_connections is
  'Minimal operational metadata for each user''s visible Google Drive "Habbits" folder. Contains no OAuth tokens or personal record data.';

create trigger drive_connections_set_updated_at
  before update on public.drive_connections
  for each row
  execute function public.set_updated_at();

-- Strict Row Level Security: authenticated users may read, create, and update only their own row.
-- DELETE is intentionally omitted: disconnecting transitions connection_status to 'not_connected',
-- and account deletion cleans up this row via ON DELETE CASCADE from auth.users(id).
alter table public.drive_connections enable row level security;
alter table public.drive_connections force row level security;

revoke all on table public.drive_connections from anon, public;
grant select, insert, update on table public.drive_connections to authenticated;

create policy drive_connections_select_own
  on public.drive_connections
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy drive_connections_insert_own
  on public.drive_connections
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy drive_connections_update_own
  on public.drive_connections
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
