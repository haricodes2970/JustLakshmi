import { z } from "zod";
import { DRIVE_ROOT_FOLDER_NAME } from "./constants.js";

export const CURRENT_DRIVE_SCHEMA_VERSION = 1 as const;

export const RecordIdSchema = z.string().min(1).max(128);
export type RecordId = z.infer<typeof RecordIdSchema>;

export const SchemaVersionSchema = z.number().int().positive();
export type SchemaVersion = z.infer<typeof SchemaVersionSchema>;

export const DriveAuthStateSchema = z.enum([
  "unauthenticated",
  "signed_in_no_drive",
  "drive_authorized",
  "drive_token_expired",
]);
export type DriveAuthState = z.infer<typeof DriveAuthStateSchema>;

export const DriveEntityTypeSchema = z.enum([
  "profile",
  "category",
  "routineTemplate",
  "taskOccurrence",
  "progressEvent",
  "auditEvent",
  "journalEntry",
  "aiMemory",
]);
export type DriveEntityType = z.infer<typeof DriveEntityTypeSchema>;

export const DriveFileMetadataSchema = z.object({
  fileId: z.string().min(1).max(256),
  path: z.string().min(1).max(512),
  mimeType: z.string().min(1).max(128),
  schemaVersion: SchemaVersionSchema,
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/i, "Must be a 64-character hex SHA-256 checksum."),
  modifiedTime: z.iso.datetime(),
  sizeBytes: z.number().int().nonnegative().optional(),
});
export type DriveFileMetadata = z.infer<typeof DriveFileMetadataSchema>;

/** Root manifest stored at `Habbits/manifest.json` in the user's Google Drive. */
export const DriveManifestSchema = z.object({
  schemaVersion: SchemaVersionSchema,
  folderName: z.literal(DRIVE_ROOT_FOLDER_NAME),
  folderId: z.string().min(1).max(256),
  updatedAt: z.iso.datetime(),
  files: z.array(DriveFileMetadataSchema),
});
export type DriveManifest = z.infer<typeof DriveManifestSchema>;

export const SyncStateSchema = z.enum([
  "idle",
  "synced",
  "pending",
  "syncing",
  "error",
  "reauth_required",
  "conflict",
]);
export type SyncState = z.infer<typeof SyncStateSchema>;

export const SyncMutationOperationSchema = z.enum(["upsert", "delete"]);
export type SyncMutationOperation = z.infer<typeof SyncMutationOperationSchema>;

/** Tombstone record ensures deletes propagate across devices without resurrecting records. */
export const TombstoneSchema = z.object({
  id: RecordIdSchema,
  entityType: DriveEntityTypeSchema,
  entityId: RecordIdSchema,
  baseVersion: z.number().int().nonnegative(),
  deletedAt: z.iso.datetime(),
});
export type Tombstone = z.infer<typeof TombstoneSchema>;

export const OutboxItemStatusSchema = z.enum([
  "queued",
  "in_flight",
  "failed_retryable",
  "failed_permanent",
]);
export type OutboxItemStatus = z.infer<typeof OutboxItemStatusSchema>;

/** Durable IndexedDB mutation outbox entry for idempotent Drive synchronization. */
export const OfflineMutationOutboxItemSchema = z.object({
  id: RecordIdSchema,
  idempotencyKey: z.string().min(1).max(128),
  entityType: DriveEntityTypeSchema,
  entityId: RecordIdSchema,
  operation: SyncMutationOperationSchema,
  baseVersion: z.number().int().nonnegative(),
  payload: z.unknown(),
  status: OutboxItemStatusSchema,
  attempts: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  nextRetryAt: z.iso.datetime().nullable(),
  lastError: z.string().max(500).nullable(),
});
export type OfflineMutationOutboxItem = z.infer<typeof OfflineMutationOutboxItemSchema>;

export const ConflictResolutionStrategySchema = z.enum([
  "keep_local",
  "keep_remote",
  "keep_both",
  "manual_merge",
]);
export type ConflictResolutionStrategy = z.infer<typeof ConflictResolutionStrategySchema>;

/**
 * Detected multi-device divergence.
 * Both snapshots are retained so conflicting user data is never silently overwritten.
 */
export const SyncConflictRecordSchema = z.object({
  id: RecordIdSchema,
  entityType: DriveEntityTypeSchema,
  entityId: RecordIdSchema,
  localVersion: z.number().int().nonnegative(),
  remoteVersion: z.number().int().nonnegative(),
  localUpdatedAt: z.iso.datetime(),
  remoteUpdatedAt: z.iso.datetime(),
  localSnapshot: z.unknown(),
  remoteSnapshot: z.unknown(),
  detectedAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().nullable(),
  resolution: ConflictResolutionStrategySchema.nullable(),
});
export type SyncConflictRecord = z.infer<typeof SyncConflictRecordSchema>;
