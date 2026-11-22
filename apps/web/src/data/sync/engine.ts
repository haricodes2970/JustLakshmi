import {
  AiMemoryItemSchema,
  AuditEventSchema,
  CURRENT_DRIVE_SCHEMA_VERSION,
  CategorySchema,
  DRIVE_ROOT_FOLDER_NAME,
  DriveManifestSchema,
  JournalEntrySchema,
  ProgressEventSchema,
  TaskOccurrenceSchema,
  TaskTemplateSchema,
  TombstoneSchema,
  type AiMemoryItem,
  type AuditEvent,
  type Category,
  type DriveEntityType,
  type DriveFileMetadata,
  type DriveManifest,
  type JournalEntry,
  type OfflineMutationOutboxItem,
  type ProgressEvent,
  type SyncConflictRecord,
  type SyncState,
  type TaskOccurrence,
  type TaskTemplate,
  type Tombstone,
} from "@justlakshmi/shared";
import { z } from "zod";
import {
  DriveApiError,
  getFileRevisionMeta,
  migrateDriveManifest,
  readJsonFile,
  upsertJsonFile,
} from "@/lib/drive/client";
import { clearDriveAccessToken, getDriveAccessToken } from "@/lib/drive/token-memory";
import {
  applyMergedRecordsLocal,
  clearOutboxItemsLocal,
  makeId,
  putConflictLocal,
  putMetaLocal,
  updateOutboxItemLocal,
  type LocalWorkspaceSnapshot,
} from "@/data/local/repository";
import type { WorkspaceScope } from "@/data/local/db";

const EventsBundleSchema = z.object({
  progress: z.array(ProgressEventSchema).default([]),
  audit: z.array(AuditEventSchema).default([]),
  tombstones: z.array(TombstoneSchema).default([]),
});

/** Exponential backoff with bounded jitter for transient Drive failures. */
export function computeBackoffMs(attempts: number, baseMs = 1000, maxMs = 60_000): number {
  const exp = Math.min(maxMs, baseMs * Math.pow(2, Math.max(0, attempts)));
  const jitter = Math.floor(exp * 0.25 * Math.random());
  return exp + jitter;
}

export type VersionedRecord = { id: string; version: number; updatedAt: string };

/**
 * Pure conflict detection for a single versioned record.
 * Retains both local and remote snapshots so conflicting data is never silently overwritten.
 */
export function detectVersionConflict<T extends VersionedRecord>(
  entityType: SyncConflictRecord["entityType"],
  local: T,
  remote: T | undefined,
  hasLocalPendingEdit = true,
): SyncConflictRecord | null {
  if (!remote) return null;
  if (JSON.stringify(remote) === JSON.stringify(local)) return null;
  if (!hasLocalPendingEdit && remote.version > local.version) return null;
  if (hasLocalPendingEdit && remote.version >= local.version) {
    return {
      id: makeId("conflict"),
      entityType,
      entityId: local.id,
      localVersion: local.version,
      remoteVersion: remote.version,
      localUpdatedAt: local.updatedAt,
      remoteUpdatedAt: remote.updatedAt,
      localSnapshot: local,
      remoteSnapshot: remote,
      detectedAt: new Date().toISOString(),
      resolvedAt: null,
      resolution: null,
    };
  }
  return null;
}

export type RemoteWorkspaceBundle = {
  categories: Category[];
  templates: TaskTemplate[];
  occurrences: TaskOccurrence[];
  progressEvents: ProgressEvent[];
  auditEvents: AuditEvent[];
  journalEntries: JournalEntry[];
  aiMemories: AiMemoryItem[];
  tombstones: Tombstone[];
};

export type MergeWorkspaceResult = {
  merged: RemoteWorkspaceBundle;
  removedIds: {
    category: string[];
    routineTemplate: string[];
    taskOccurrence: string[];
    journalEntry: string[];
    aiMemory: string[];
  };
  conflicts: SyncConflictRecord[];
  restoredCount: number;
};

function mergeAppendOnly<T extends { id: string }>(local: readonly T[], remote: readonly T[]): { items: T[]; restored: number } {
  const byId = new Map<string, T>();
  for (const item of local) byId.set(item.id, item);
  let restored = 0;
  for (const item of remote) {
    if (!byId.has(item.id)) {
      byId.set(item.id, item);
      restored += 1;
    }
  }
  return { items: Array.from(byId.values()), restored };
}

function mergeVersionedCollection<T extends VersionedRecord>(
  entityType: DriveEntityType,
  local: readonly T[],
  remote: readonly T[],
  outbox: readonly OfflineMutationOutboxItem[],
  tombstones: readonly Tombstone[],
): { items: T[]; removedIds: string[]; conflicts: SyncConflictRecord[]; restored: number } {
  const localMap = new Map(local.map((x) => [x.id, x]));
  const remoteMap = new Map(remote.map((x) => [x.id, x]));
  const pendingIds = new Set(outbox.filter((m) => m.entityType === entityType).map((m) => m.entityId));
  const tombstoneByEntityId = new Map<string, Tombstone>();
  for (const t of tombstones) {
    if (t.entityType !== entityType) continue;
    const prev = tombstoneByEntityId.get(t.entityId);
    if (!prev || t.baseVersion >= prev.baseVersion) tombstoneByEntityId.set(t.entityId, t);
  }

  const allIds = new Set<string>([...localMap.keys(), ...remoteMap.keys()]);
  const items: T[] = [];
  const removedIds: string[] = [];
  const conflicts: SyncConflictRecord[] = [];
  let restored = 0;

  for (const id of allIds) {
    const loc = localMap.get(id);
    const rem = remoteMap.get(id);
    const tomb = tombstoneByEntityId.get(id);

    // Tombstone wins if its deleted version is >= the record version (prevents resurrection).
    const locDeleted = loc && tomb && tomb.baseVersion >= loc.version;
    const remDeleted = rem && tomb && tomb.baseVersion >= rem.version;
    if ((locDeleted || !loc) && (remDeleted || !rem)) {
      if (loc) removedIds.push(id);
      continue;
    }

    if (!loc && rem) {
      items.push(rem);
      restored += 1;
      continue;
    }
    if (loc && !rem) {
      items.push(loc);
      continue;
    }
    if (loc && rem) {
      if (JSON.stringify(loc) === JSON.stringify(rem)) {
        items.push(rem.version >= loc.version ? rem : loc);
        continue;
      }

      const hasPending = pendingIds.has(id);
      if (!hasPending && rem.version > loc.version) {
        // Clean fast-forward from remote.
        items.push(rem);
        restored += 1;
        continue;
      }
      if (hasPending && loc.version > rem.version) {
        // Local edit strictly ahead of remote.
        items.push(loc);
        continue;
      }

      // Divergent versions (or same version with different contents) -> record conflict, preserve local until resolved.
      conflicts.push({
        id: makeId("conflict"),
        entityType,
        entityId: id,
        localVersion: loc.version,
        remoteVersion: rem.version,
        localUpdatedAt: loc.updatedAt,
        remoteUpdatedAt: rem.updatedAt,
        localSnapshot: loc,
        remoteSnapshot: rem,
        detectedAt: new Date().toISOString(),
        resolvedAt: null,
        resolution: null,
      });
      items.push(loc);
    }
  }

  return { items, removedIds, conflicts, restored };
}

/**
 * Pure bidirectional merge of local and remote workspace datasets.
 * Handles every versioned entity, append-only event log, and tombstone without silent overwrites.
 */
export function mergeWorkspaceDatasets(
  local: Pick<
    LocalWorkspaceSnapshot,
    "categories" | "templates" | "occurrences" | "progressEvents" | "auditEvents" | "journalEntries" | "aiMemories" | "tombstones" | "outbox"
  >,
  remote: RemoteWorkspaceBundle,
): MergeWorkspaceResult {
  const mergedTombstones = mergeAppendOnly(local.tombstones, remote.tombstones);
  const mergedProgress = mergeAppendOnly(local.progressEvents, remote.progressEvents);
  const mergedAudit = mergeAppendOnly(local.auditEvents, remote.auditEvents);

  const cats = mergeVersionedCollection("category", local.categories, remote.categories, local.outbox, mergedTombstones.items);
  const tpls = mergeVersionedCollection("routineTemplate", local.templates, remote.templates, local.outbox, mergedTombstones.items);
  const occs = mergeVersionedCollection("taskOccurrence", local.occurrences, remote.occurrences, local.outbox, mergedTombstones.items);
  const jrn = mergeVersionedCollection("journalEntry", local.journalEntries, remote.journalEntries, local.outbox, mergedTombstones.items);
  const mems = mergeVersionedCollection("aiMemory", local.aiMemories, remote.aiMemories, local.outbox, mergedTombstones.items);

  return {
    merged: {
      categories: cats.items,
      templates: tpls.items,
      occurrences: occs.items,
      progressEvents: mergedProgress.items,
      auditEvents: mergedAudit.items,
      journalEntries: jrn.items,
      aiMemories: mems.items,
      tombstones: mergedTombstones.items,
    },
    removedIds: {
      category: cats.removedIds,
      routineTemplate: tpls.removedIds,
      taskOccurrence: occs.removedIds,
      journalEntry: jrn.removedIds,
      aiMemory: mems.removedIds,
    },
    conflicts: [...cats.conflicts, ...tpls.conflicts, ...occs.conflicts, ...jrn.conflicts, ...mems.conflicts],
    restoredCount:
      cats.restored + tpls.restored + occs.restored + jrn.restored + mems.restored + mergedProgress.restored + mergedAudit.restored,
  };
}

export type SyncRunResult = {
  state: SyncState;
  syncedCount: number;
  restoredCount: number;
  conflictsFound: number;
  message: string;
  manifest?: DriveManifest;
  merged?: RemoteWorkspaceBundle;
};

async function downloadRemoteWorkspace(
  token: string,
  manifest: DriveManifest,
  fetchImpl: typeof fetch,
): Promise<RemoteWorkspaceBundle> {
  const fileIndex = new Map<string, DriveFileMetadata>(manifest.files.map((f) => [f.path, f]));

  async function readBundle<T>(path: string, schema: z.ZodType<T>, fallback: T): Promise<T> {
    const meta = fileIndex.get(path);
    if (!meta) return fallback;
    const { data } = await readJsonFile(token, meta.fileId, fetchImpl, meta.checksumSha256);
    return schema.parse(data);
  }

  const [categories, templates, occurrences, events, journalEntries, aiMemories] = await Promise.all([
    readBundle("routines/categories.json", z.array(CategorySchema), []),
    readBundle("routines/routines.json", z.array(TaskTemplateSchema), []),
    readBundle("history/occurrences.json", z.array(TaskOccurrenceSchema), []),
    readBundle("history/events.json", EventsBundleSchema, { progress: [], audit: [], tombstones: [] }),
    readBundle("journal/entries.json", z.array(JournalEntrySchema), []),
    readBundle("ai/memories.json", z.array(AiMemoryItemSchema), []),
  ]);

  return {
    categories,
    templates,
    occurrences,
    progressEvents: events.progress,
    auditEvents: events.audit,
    journalEntries,
    aiMemories,
    tombstones: events.tombstones,
  };
}

/**
 * Complete bidirectional Google Drive synchronization engine:
 * 1. Downloads & checksum-validates remote manifest + all referenced bundles (restoring fresh devices).
 * 2. Merges by stable IDs + tombstones and detects conflicts across all versioned entities.
 * 3. Persists non-conflicting restored records into the user's scoped IndexedDB immediately.
 * 4. Halts before overwriting remote if any conflicts exist.
 * 5. Uploads merged bundles and updates `manifest.json` with ETag + headRevisionId preconditions.
 * 6. Clears outbox items ONLY after durable confirmation of both bundle + manifest writes.
 */
export async function runDriveSync(
  scope: WorkspaceScope,
  snapshot: LocalWorkspaceSnapshot,
  fetchImpl: typeof fetch = fetch,
  options?: { persistToIndexedDb?: boolean },
): Promise<SyncRunResult> {
  const persist = options?.persistToIndexedDb !== false;
  const conn = snapshot.driveConnection;
  if (!conn || conn.status !== "connected" || !conn.folderId || !conn.manifestFileId) {
    return {
      state: snapshot.outbox.length > 0 ? "pending" : "idle",
      syncedCount: 0,
      restoredCount: 0,
      conflictsFound: 0,
      message: "Google Drive is not connected. Changes remain saved locally.",
    };
  }

  const token = getDriveAccessToken();
  if (!token) {
    return {
      state: "reauth_required",
      syncedCount: 0,
      restoredCount: 0,
      conflictsFound: 0,
      message: "Google Drive session expired. Reauthorize Drive to sync queued changes.",
    };
  }

  try {
    // Step 1: Read remote manifest + revision metadata for optimistic concurrency.
    const [manifestRead, revMeta] = await Promise.all([
      readJsonFile(token, conn.manifestFileId, fetchImpl),
      getFileRevisionMeta(token, conn.manifestFileId, fetchImpl),
    ]);
    const remoteManifest = migrateDriveManifest(manifestRead.data, conn.folderId);
    const manifestEtag = manifestRead.etag ?? revMeta.etag;
    const expectedHeadRevisionId = revMeta.headRevisionId;

    // Step 2: Download and validate every manifest-referenced file (with SHA-256 verification).
    const remoteBundle = await downloadRemoteWorkspace(token, remoteManifest, fetchImpl);

    // Step 3: Bidirectional merge across all entity types + tombstones.
    const mergeResult = mergeWorkspaceDatasets(snapshot, remoteBundle);

    if (persist) {
      await applyMergedRecordsLocal(scope, { ...mergeResult.merged, removedIds: mergeResult.removedIds });
    }

    // Step 4: Halt before uploading if conflicts were detected (never silently overwrite).
    if (mergeResult.conflicts.length > 0) {
      if (persist) {
        for (const conflict of mergeResult.conflicts) {
          await putConflictLocal(scope, conflict);
        }
      }
      return {
        state: "conflict",
        syncedCount: 0,
        restoredCount: mergeResult.restoredCount,
        conflictsFound: mergeResult.conflicts.length,
        message: `${mergeResult.conflicts.length} conflict(s) detected. Review in Settings before overwriting.`,
        merged: mergeResult.merged,
      };
    }

    // If nothing to upload (fresh device restore only and remote already has all records), mark synced cleanly.
    const needsUpload = snapshot.outbox.length > 0 || (remoteManifest.files.length === 0 && (
      mergeResult.merged.categories.length > 0 ||
      mergeResult.merged.templates.length > 0 ||
      mergeResult.merged.occurrences.length > 0 ||
      mergeResult.merged.journalEntries.length > 0 ||
      mergeResult.merged.aiMemories.length > 0
    ));

    if (!needsUpload) {
      const now = new Date().toISOString();
      if (persist) {
        await putMetaLocal(scope, "driveManifest", remoteManifest);
        if (manifestEtag) await putMetaLocal(scope, "driveManifestEtag", manifestEtag);
        await putMetaLocal(scope, "driveConnection", { ...conn, lastSyncedAt: now, updatedAt: now });
      }
      return {
        state: "synced",
        syncedCount: 0,
        restoredCount: mergeResult.restoredCount,
        conflictsFound: 0,
        message:
          mergeResult.restoredCount > 0
            ? `Restored ${mergeResult.restoredCount} record(s) from Google Drive (Habbits).`
            : "All records are up to date with Google Drive.",
        manifest: remoteManifest,
        merged: mergeResult.merged,
      };
    }

    // Step 5: Upload merged bundles and update manifest with ETag + headRevisionId preconditions.
    const fileIndex = new Map<string, DriveFileMetadata>(remoteManifest.files.map((f) => [f.path, f]));
    const bundles: Array<{ path: string; name: string; data: unknown }> = [
      { path: "routines/categories.json", name: "categories.json", data: mergeResult.merged.categories },
      { path: "routines/routines.json", name: "routines.json", data: mergeResult.merged.templates },
      { path: "history/occurrences.json", name: "occurrences.json", data: mergeResult.merged.occurrences },
      {
        path: "history/events.json",
        name: "events.json",
        data: {
          progress: mergeResult.merged.progressEvents,
          audit: mergeResult.merged.auditEvents,
          tombstones: mergeResult.merged.tombstones,
        },
      },
      { path: "journal/entries.json", name: "entries.json", data: mergeResult.merged.journalEntries },
      { path: "ai/memories.json", name: "memories.json", data: mergeResult.merged.aiMemories },
    ];

    const updatedFiles: DriveFileMetadata[] = [];
    for (const bundle of bundles) {
      const existing = fileIndex.get(bundle.path);
      const uploaded = await upsertJsonFile(
        token,
        conn.folderId,
        bundle.name,
        bundle.data,
        { existingFileId: existing?.fileId },
        fetchImpl,
      );
      updatedFiles.push({
        fileId: uploaded.fileId,
        path: bundle.path,
        mimeType: "application/json",
        schemaVersion: CURRENT_DRIVE_SCHEMA_VERSION,
        checksumSha256: uploaded.checksumSha256,
        modifiedTime: uploaded.modifiedTime,
      });
    }

    const now = new Date().toISOString();
    const nextManifest: DriveManifest = DriveManifestSchema.parse({
      schemaVersion: CURRENT_DRIVE_SCHEMA_VERSION,
      folderName: DRIVE_ROOT_FOLDER_NAME,
      folderId: conn.folderId,
      updatedAt: now,
      files: updatedFiles,
    });

    // Conditional manifest write protects against concurrent writes from another device.
    const manifestWrite = await upsertJsonFile(
      token,
      conn.folderId,
      "manifest.json",
      nextManifest,
      {
        existingFileId: conn.manifestFileId,
        ifMatchEtag: manifestEtag,
        expectedHeadRevisionId,
      },
      fetchImpl,
    );

    // Step 6: Clear outbox ONLY after durable confirmation of bundles + manifest.
    const syncedIds = snapshot.outbox.map((item) => item.id);
    if (persist) {
      await putMetaLocal(scope, "driveManifest", nextManifest);
      if (manifestWrite.etag) await putMetaLocal(scope, "driveManifestEtag", manifestWrite.etag);
      await putMetaLocal(scope, "driveConnection", { ...conn, lastSyncedAt: now, updatedAt: now });
      await clearOutboxItemsLocal(scope, syncedIds);
    }

    return {
      state: "synced",
      syncedCount: syncedIds.length,
      restoredCount: mergeResult.restoredCount,
      conflictsFound: 0,
      message: `Synced ${syncedIds.length} change(s) and restored ${mergeResult.restoredCount} record(s) with Google Drive.`,
      manifest: nextManifest,
      merged: mergeResult.merged,
    };
  } catch (err) {
    if (err instanceof DriveApiError && err.code === "REAUTH_REQUIRED") {
      clearDriveAccessToken();
      if (persist) {
        await putMetaLocal(scope, "driveConnection", {
          ...conn,
          status: "reauth_required",
          updatedAt: new Date().toISOString(),
        });
      }
      return {
        state: "reauth_required",
        syncedCount: 0,
        restoredCount: 0,
        conflictsFound: 0,
        message: err.message,
      };
    }

    if (err instanceof DriveApiError && err.code === "CONFLICT") {
      return {
        state: "conflict",
        syncedCount: 0,
        restoredCount: 0,
        conflictsFound: 0,
        message: err.message,
      };
    }

    const errorMessage = err instanceof Error ? err.message : "Sync failed.";
    if (persist) {
      for (const item of snapshot.outbox) {
        const attempts = item.attempts + 1;
        await updateOutboxItemLocal(scope, {
          ...item,
          attempts,
          status: attempts >= 5 ? "failed_permanent" : "failed_retryable",
          nextRetryAt: new Date(Date.now() + computeBackoffMs(attempts)).toISOString(),
          lastError: errorMessage.slice(0, 480),
        });
      }
    }

    return {
      state: "error",
      syncedCount: 0,
      restoredCount: 0,
      conflictsFound: 0,
      message: `${errorMessage} Local changes remain safely queued.`,
    };
  }
}
