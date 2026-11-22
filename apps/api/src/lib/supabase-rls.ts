import { createClient } from "@supabase/supabase-js";
import {
  DRIVE_ROOT_FOLDER_NAME,
  DriveConnectionMetadataSchema,
  type DriveConnectionMetadata,
  type UpdateDriveConnectionRequest,
} from "@justlakshmi/shared";

export interface DriveConnectionStore {
  getForUser(userId: string, accessToken: string): Promise<DriveConnectionMetadata | null>;
  upsertForUser(
    userId: string,
    accessToken: string,
    input: UpdateDriveConnectionRequest,
  ): Promise<DriveConnectionMetadata>;
}

/**
 * User-scoped Supabase repository using ONLY the publishable key + the caller's
 * verified Bearer JWT so Postgres RLS enforces `(select auth.uid()) = user_id`.
 * Never uses the service_role key.
 */
export function createSupabaseDriveConnectionStore(
  supabaseUrl: string,
  supabasePublishableKey: string,
): DriveConnectionStore {
  function scopedClient(accessToken: string) {
    return createClient(supabaseUrl, supabasePublishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
  }

  return {
    async getForUser(userId: string, accessToken: string): Promise<DriveConnectionMetadata | null> {
      const client = scopedClient(accessToken);
      const { data, error } = await client
        .from("drive_connections")
        .select("drive_folder_id, drive_manifest_file_id, schema_version, connection_status, verified_at, last_synced_at, updated_at")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        throw new Error(`Drive connection lookup failed: ${error.message}`);
      }
      if (!data) return null;

      return DriveConnectionMetadataSchema.parse({
        status: data.connection_status,
        folderId: data.drive_folder_id,
        folderName: DRIVE_ROOT_FOLDER_NAME,
        manifestFileId: data.drive_manifest_file_id,
        schemaVersion: data.schema_version,
        verifiedAt: data.verified_at,
        lastSyncedAt: data.last_synced_at,
        updatedAt: data.updated_at,
      });
    },

    async upsertForUser(
      userId: string,
      accessToken: string,
      input: UpdateDriveConnectionRequest,
    ): Promise<DriveConnectionMetadata> {
      const client = scopedClient(accessToken);
      const { data, error } = await client
        .from("drive_connections")
        .upsert(
          {
            user_id: userId,
            drive_folder_id: input.folderId,
            drive_manifest_file_id: input.manifestFileId,
            schema_version: input.schemaVersion,
            connection_status: input.status,
            verified_at: input.verifiedAt,
          },
          { onConflict: "user_id" },
        )
        .select("drive_folder_id, drive_manifest_file_id, schema_version, connection_status, verified_at, last_synced_at, updated_at")
        .single();

      if (error || !data) {
        throw new Error(`Drive connection update failed: ${error?.message ?? "no row returned"}`);
      }

      return DriveConnectionMetadataSchema.parse({
        status: data.connection_status,
        folderId: data.drive_folder_id,
        folderName: DRIVE_ROOT_FOLDER_NAME,
        manifestFileId: data.drive_manifest_file_id,
        schemaVersion: data.schema_version,
        verifiedAt: data.verified_at,
        lastSyncedAt: data.last_synced_at,
        updatedAt: data.updated_at,
      });
    },
  };
}
