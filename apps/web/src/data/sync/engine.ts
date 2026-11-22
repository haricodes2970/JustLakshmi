import {
  CURRENT_DRIVE_SCHEMA_VERSION,
  DRIVE_ROOT_FOLDER_NAME,
  DriveManifestSchema,
  type DriveFileMetadata,
  type DriveManifest,
  type SyncConflictRecord,
  type SyncState,
} from "@justlakshmi/shared";
import { DriveApiError, readJsonFile, upsertJsonFile } from "@/lib/drive/client";
import { clearDriveAccessToken, getDriveAccessToken } from "@/lib/drive/token-memory";
import {
  clearOutboxItemsLocal,
  makeId,
  putConflictLocal,
  putMetaLocal,
  updateOutboxItemLocal,
  type LocalWorkspaceSnapshot,
} from "@/data/local/repository";

/** Exponential backoff with bounded jitter for transient Drive failures. */
export function computeBackoffMs(attempts: number, baseMs = 1000, maxMs = 60_000): number {
  const exp = Math.min(maxMs, baseMs * Math.pow(2, Math.max(0, attempts)));
  const jitter = Math.floor(exp * 0.25 * Math.random());
  return exp + jitter;
}

export type VersionedRecord = { id: string; version: number; updatedAt: string };

/**
 * Pure conflict detection: if remote record has a higher version and differs from local,
 * produce a non-destructive SyncConflictRecord retaining both snapshots.
 */
export function detectVersionConflict<T extends VersionedRecord>(
  entityType: SyncConflictRecord["entityType"],
  local: T,
  remote: T | undefined,
): SyncConflictRecord | null {
  if (!remote) return null;
  if (remote.version <= local.version) return null;
  if (JSON.stringify(remote) === JSON.stringify(local)) return null;
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

export type SyncRunResult = {
  state: SyncState;
  syncedCount: number;
  conflictsFound: number;
  message: string;
  manifest?: DriveManifest;
};

/**
 * Synchronizes queued local mutations to the user's verified `Habbits` Google Drive folder.
 * - Never discards local outbox items until Drive confirms durable writes.
 * - Detects conflicts against remote snapshots before writing.
 * - Transitions cleanly to `reauth_required` on expired/revoked Drive token.
 */
export async function runDriveSync(
  snapshot: LocalWorkspaceSnapshot,
  fetchImpl: typeof fetch = fetch,
): Promise<SyncRunResult> {
  const conn = snapshot.driveConnection;
  if (!conn || conn.status !== "connected" || !conn.folderId || !conn.manifestFileId) {
    return {
      state: snapshot.outbox.length > 0 ? "pending" : "idle",
      syncedCount: 0,
      conflictsFound: 0,
      message: "Google Drive is not connected. Changes remain saved locally in IndexedDB.",
    };
  }

  const token = getDriveAccessToken();
  if (!token) {
    return {
      state: "reauth_required",
      syncedCount: 0,
      conflictsFound: 0,
      message: "Google Drive session expired. Reauthorize Drive to sync queued changes.",
    };
  }

  if (snapshot.outbox.length === 0) {
    return { state: "synced", syncedCount: 0, conflictsFound: 0, message: "All local changes are synced." };
  }

  try {
    const remoteManifestRaw = await readJsonFile(token, conn.manifestFileId, fetchImpl);
    const remoteManifest = DriveManifestSchema.parse(remoteManifestRaw);
    const fileIndex = new Map<string, DriveFileMetadata>(remoteManifest.files.map((f) => [f.path, f]));

    const conflicts: SyncConflictRecord[] = [];
    const journalFile = fileIndex.get("journal/entries.json");
    if (journalFile) {
      const remoteJournals = (await readJsonFile<VersionedRecord[]>(token, journalFile.fileId, fetchImpl).catch(() => [])) ?? [];
      const remoteById = new Map(remoteJournals.map((j) => [j.id, j]));
      for (const localEntry of snapshot.journalEntries) {
        const conflict = detectVersionConflict("journalEntry", localEntry, remoteById.get(localEntry.id));
        if (conflict) {
          conflicts.push(conflict);
          await putConflictLocal(conflict);
        }
      }
    }

    if (conflicts.length > 0) {
      return {
        state: "conflict",
        syncedCount: 0,
        conflictsFound: conflicts.length,
        message: `${conflicts.length} conflict(s) detected. Review conflicts in Settings before overwriting.`,
      };
    }

    const bundles: Array<{ path: string; name: string; data: unknown }> = [
      { path: "routines/categories.json", name: "categories.json", data: snapshot.categories },
      { path: "routines/routines.json", name: "routines.json", data: snapshot.templates },
      { path: "history/occurrences.json", name: "occurrences.json", data: snapshot.occurrences },
      { path: "history/events.json", name: "events.json", data: { progress: snapshot.progressEvents, audit: snapshot.auditEvents, tombstones: snapshot.tombstones } },
      { path: "journal/entries.json", name: "entries.json", data: snapshot.journalEntries },
      { path: "ai/memories.json", name: "memories.json", data: snapshot.aiMemories },
    ];

    const updatedFiles: DriveFileMetadata[] = [];
    for (const bundle of bundles) {
      const existing = fileIndex.get(bundle.path);
      const uploaded = await upsertJsonFile(token, conn.folderId, bundle.name, bundle.data, existing?.fileId, fetchImpl);
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

    await upsertJsonFile(token, conn.folderId, "manifest.json", nextManifest, conn.manifestFileId, fetchImpl);
    await putMetaLocal("driveManifest", nextManifest);
    await putMetaLocal("driveConnection", { ...conn, lastSyncedAt: now, updatedAt: now });

    const syncedIds = snapshot.outbox.map((item) => item.id);
    await clearOutboxItemsLocal(syncedIds);

    return {
      state: "synced",
      syncedCount: syncedIds.length,
      conflictsFound: 0,
      message: `Synced ${syncedIds.length} change(s) to Google Drive (Habbits).`,
      manifest: nextManifest,
    };
  } catch (err) {
    if (err instanceof DriveApiError && err.code === "REAUTH_REQUIRED") {
      clearDriveAccessToken();
      await putMetaLocal("driveConnection", { ...conn, status: "reauth_required", updatedAt: new Date().toISOString() });
      return {
        state: "reauth_required",
        syncedCount: 0,
        conflictsFound: 0,
        message: err.message,
      };
    }

    const errorMessage = err instanceof Error ? err.message : "Sync failed.";
    for (const item of snapshot.outbox) {
      const attempts = item.attempts + 1;
      await updateOutboxItemLocal({
        ...item,
        attempts,
        status: attempts >= 5 ? "failed_permanent" : "failed_retryable",
        nextRetryAt: new Date(Date.now() + computeBackoffMs(attempts)).toISOString(),
        lastError: errorMessage.slice(0, 480),
      });
    }

    return {
      state: "error",
      syncedCount: 0,
      conflictsFound: 0,
      message: `${errorMessage} Local changes remain safely queued.`,
    };
  }
}
