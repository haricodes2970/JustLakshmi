import { z } from "zod";
import { DRIVE_ROOT_FOLDER_NAME } from "./constants.js";

export const DriveConnectionStatusSchema = z.enum(["not_connected", "connected", "reauth_required"]);
export type DriveConnectionStatus = z.infer<typeof DriveConnectionStatusSchema>;

function validateDriveConnectionInvariants(
  val: {
    status: DriveConnectionStatus;
    folderId: string | null;
    manifestFileId?: string | null;
    verifiedAt?: string | null;
  },
  ctx: z.RefinementCtx,
): void {
  const hasFolder = val.folderId !== null;
  const hasManifest = val.manifestFileId !== undefined && val.manifestFileId !== null;
  const isVerified = val.verifiedAt !== undefined && val.verifiedAt !== null;

  if (hasManifest && !hasFolder) {
    ctx.addIssue({
      code: "custom",
      path: ["manifestFileId"],
      message: "manifestFileId cannot exist without folderId.",
    });
  }

  if (isVerified && (!hasFolder || !hasManifest)) {
    ctx.addIssue({
      code: "custom",
      path: ["verifiedAt"],
      message: "verifiedAt requires both folderId and manifestFileId.",
    });
  }

  if (val.status === "connected" && (!hasFolder || !hasManifest || !isVerified)) {
    ctx.addIssue({
      code: "custom",
      path: ["status"],
      message: "status cannot be 'connected' until folderId, manifestFileId, and verifiedAt are verified.",
    });
  }
}

/**
 * Operational Drive connection metadata only.
 * Never includes Google access tokens, refresh tokens, or personal record contents.
 */
export const DriveConnectionMetadataSchema = z
  .object({
    status: DriveConnectionStatusSchema,
    folderId: z.string().min(1).max(256).nullable(),
    folderName: z.literal(DRIVE_ROOT_FOLDER_NAME),
    manifestFileId: z.string().min(1).max(256).nullable(),
    schemaVersion: z.number().int().positive(),
    verifiedAt: z.iso.datetime().nullable(),
    lastSyncedAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime(),
  })
  .superRefine(validateDriveConnectionInvariants);

export type DriveConnectionMetadata = z.infer<typeof DriveConnectionMetadataSchema>;

/**
 * Client-submitted Drive folder metadata update payload.
 * Strict object rejects unknown keys (e.g. accidental token or userId fields).
 */
export const UpdateDriveConnectionRequestSchema = z
  .strictObject({
    status: DriveConnectionStatusSchema,
    folderId: z.string().min(1).max(256).nullable(),
    folderName: z.literal(DRIVE_ROOT_FOLDER_NAME),
    manifestFileId: z.string().min(1).max(256).nullable().default(null),
    verifiedAt: z.iso.datetime().nullable().default(null),
    schemaVersion: z.number().int().positive().default(1),
  })
  .superRefine(validateDriveConnectionInvariants);

export type UpdateDriveConnectionRequest = z.infer<typeof UpdateDriveConnectionRequestSchema>;

export const DriveConnectionValidationResponseSchema = z.object({
  valid: z.literal(true),
  persisted: z.literal(false),
  metadata: UpdateDriveConnectionRequestSchema,
});

export type DriveConnectionValidationResponse = z.infer<typeof DriveConnectionValidationResponseSchema>;
