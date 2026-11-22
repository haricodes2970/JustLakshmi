import { z } from "zod";
import { DRIVE_ROOT_FOLDER_NAME } from "./constants.js";

export const DriveConnectionStatusSchema = z.enum(["not_connected", "connected", "reauth_required"]);
export type DriveConnectionStatus = z.infer<typeof DriveConnectionStatusSchema>;

/**
 * Operational Drive connection metadata only.
 * Never includes Google access tokens, refresh tokens, or personal record contents.
 */
export const DriveConnectionMetadataSchema = z.object({
  status: DriveConnectionStatusSchema,
  folderId: z.string().min(1).max(256).nullable(),
  folderName: z.literal(DRIVE_ROOT_FOLDER_NAME),
  manifestFileId: z.string().min(1).max(256).nullable(),
  schemaVersion: z.number().int().positive(),
  lastSyncedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
});

export type DriveConnectionMetadata = z.infer<typeof DriveConnectionMetadataSchema>;

/**
 * Client-submitted Drive folder metadata update payload.
 * Strict object rejects unknown keys (e.g. accidental token or userId fields).
 */
export const UpdateDriveConnectionRequestSchema = z
  .object({
    status: DriveConnectionStatusSchema,
    folderId: z.string().min(1).max(256).nullable(),
    folderName: z.literal(DRIVE_ROOT_FOLDER_NAME),
    manifestFileId: z.string().min(1).max(256).nullable().optional(),
    schemaVersion: z.number().int().positive().default(1),
  })
  .strict();

export type UpdateDriveConnectionRequest = z.infer<typeof UpdateDriveConnectionRequestSchema>;

export const DriveConnectionValidationResponseSchema = z.object({
  valid: z.literal(true),
  persisted: z.literal(false),
  metadata: UpdateDriveConnectionRequestSchema,
});

export type DriveConnectionValidationResponse = z.infer<typeof DriveConnectionValidationResponseSchema>;
