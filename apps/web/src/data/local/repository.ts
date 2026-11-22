import {
  CURRENT_DRIVE_SCHEMA_VERSION,
  NotificationPreferencesSchema,
  WorkspaceExportSchema,
  type AiMemoryItem,
  type AuditEvent,
  type Category,
  type DriveConnectionMetadata,
  type DriveEntityType,
  type DriveManifest,
  type ISODate,
  type JournalEntry,
  type NotificationPreferences,
  type OfflineMutationOutboxItem,
  type ProgressEvent,
  type SyncConflictRecord,
  type TaskOccurrence,
  type TaskTemplate,
  type Tombstone,
  type WorkspaceExport,
} from "@justlakshmi/shared";
import {
  LEGACY_UNSCOPED_DB_NAME,
  getLocalDb,
  isIndexedDbAvailable,
  legacyUnscopedDbExists,
  openNamedDb,
  type JustLakshmiDB,
  type WorkspaceScope,
} from "./db";
import type { IDBPDatabase } from "idb";

export type LocalWorkspaceSnapshot = {
  categories: Category[];
  templates: TaskTemplate[];
  occurrences: TaskOccurrence[];
  progressEvents: ProgressEvent[];
  auditEvents: AuditEvent[];
  journalEntries: JournalEntry[];
  aiMemories: AiMemoryItem[];
  outbox: OfflineMutationOutboxItem[];
  conflicts: SyncConflictRecord[];
  tombstones: Tombstone[];
  driveConnection: DriveConnectionMetadata | null;
  driveManifest: DriveManifest | null;
  driveManifestEtag: string | null;
  notificationPrefs: NotificationPreferences;
  aiConsent: { granted: boolean; includeJournal: boolean; updatedAt: string };
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = NotificationPreferencesSchema.parse({});

export function createEmptySnapshot(): LocalWorkspaceSnapshot {
  return {
    categories: [],
    templates: [],
    occurrences: [],
    progressEvents: [],
    auditEvents: [],
    journalEntries: [],
    aiMemories: [],
    outbox: [],
    conflicts: [],
    tombstones: [],
    driveConnection: null,
    driveManifest: null,
    driveManifestEtag: null,
    notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
    aiConsent: { granted: false, includeJournal: false, updatedAt: "" },
  };
}

export function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function buildOutboxItem(
  entityType: DriveEntityType,
  entityId: string,
  operation: "upsert" | "delete",
  baseVersion: number,
  payload: unknown,
): OfflineMutationOutboxItem {
  const now = new Date().toISOString();
  return {
    id: makeId("mut"),
    idempotencyKey: `${entityType}:${entityId}:${operation}:v${baseVersion}`,
    entityType,
    entityId,
    operation,
    baseVersion,
    payload,
    status: "queued",
    attempts: 0,
    createdAt: now,
    nextRetryAt: null,
    lastError: null,
  };
}

async function readSnapshotFromDb(db: IDBPDatabase<JustLakshmiDB>): Promise<LocalWorkspaceSnapshot> {
  const [
    categories,
    templates,
    occurrences,
    progressEvents,
    auditEvents,
    journalEntries,
    aiMemories,
    outbox,
    conflicts,
    tombstones,
    metaAll,
  ] = await Promise.all([
    db.getAll("categories"),
    db.getAll("routineTemplates"),
    db.getAll("taskOccurrences"),
    db.getAll("progressEvents"),
    db.getAll("auditEvents"),
    db.getAll("journalEntries"),
    db.getAll("aiMemories"),
    db.getAll("syncOutbox"),
    db.getAll("syncConflicts"),
    db.getAll("tombstones"),
    db.getAll("meta"),
  ]);

  const metaMap = new Map(metaAll.map((m) => [m.key, m.value]));
  return {
    categories: categories.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    templates,
    occurrences,
    progressEvents,
    auditEvents,
    journalEntries,
    aiMemories,
    outbox,
    conflicts,
    tombstones,
    driveConnection: (metaMap.get("driveConnection") as DriveConnectionMetadata | null | undefined) ?? null,
    driveManifest: (metaMap.get("driveManifest") as DriveManifest | null | undefined) ?? null,
    driveManifestEtag: (metaMap.get("driveManifestEtag") as string | null | undefined) ?? null,
    notificationPrefs:
      (metaMap.get("notificationPrefs") as NotificationPreferences | undefined) ?? DEFAULT_NOTIFICATION_PREFS,
    aiConsent: (metaMap.get("aiConsent") as { granted: boolean; includeJournal: boolean; updatedAt: string } | undefined) ?? {
      granted: false,
      includeJournal: false,
      updatedAt: "",
    },
  };
}

export async function loadLocalSnapshot(scope: WorkspaceScope): Promise<LocalWorkspaceSnapshot | null> {
  if (!isIndexedDbAvailable()) return null;
  const db = await getLocalDb(scope);
  return readSnapshotFromDb(db);
}

/**
 * Checks whether legacy unscoped `justlakshmi-local` contains user records.
 * Never automatically attaches them to any authenticated account.
 */
export async function inspectLegacyUnscopedData(): Promise<{ exists: boolean; recordCount: number }> {
  const exists = await legacyUnscopedDbExists();
  if (!exists) return { exists: false, recordCount: 0 };
  const db = await openNamedDb(LEGACY_UNSCOPED_DB_NAME);
  const snap = await readSnapshotFromDb(db);
  const recordCount =
    snap.templates.length + snap.occurrences.length + snap.journalEntries.length + snap.aiMemories.length;
  db.close();
  return { exists: true, recordCount };
}

export async function exportLegacyUnscopedJson(timeZone: string): Promise<string | null> {
  const exists = await legacyUnscopedDbExists();
  if (!exists) return null;
  const db = await openNamedDb(LEGACY_UNSCOPED_DB_NAME);
  const snap = await readSnapshotFromDb(db);
  db.close();
  return JSON.stringify(buildWorkspaceExport(snap, timeZone), null, 2);
}

export async function putCategoryLocal(scope: WorkspaceScope, category: Category, enqueue = true): Promise<void> {
  if (!isIndexedDbAvailable()) return;
  const db = await getLocalDb(scope);
  const tx = db.transaction(["categories", "syncOutbox"], "readwrite");
  await tx.objectStore("categories").put(category);
  if (enqueue) {
    await tx.objectStore("syncOutbox").put(buildOutboxItem("category", category.id, "upsert", category.version, category));
  }
  await tx.done;
}

export async function putTemplateLocal(
  scope: WorkspaceScope,
  template: TaskTemplate,
  audit?: AuditEvent,
  enqueue = true,
): Promise<void> {
  if (!isIndexedDbAvailable()) return;
  const db = await getLocalDb(scope);
  const tx = db.transaction(["routineTemplates", "auditEvents", "syncOutbox"], "readwrite");
  await tx.objectStore("routineTemplates").put(template);
  if (audit) await tx.objectStore("auditEvents").put(audit);
  if (enqueue) {
    await tx.objectStore("syncOutbox").put(buildOutboxItem("routineTemplate", template.id, "upsert", template.version, template));
  }
  await tx.done;
}

export async function putOccurrenceLocal(
  scope: WorkspaceScope,
  occurrence: TaskOccurrence,
  opts?: { progress?: ProgressEvent; audit?: AuditEvent; enqueue?: boolean },
): Promise<void> {
  if (!isIndexedDbAvailable()) return;
  const db = await getLocalDb(scope);
  const tx = db.transaction(["taskOccurrences", "progressEvents", "auditEvents", "syncOutbox"], "readwrite");
  await tx.objectStore("taskOccurrences").put(occurrence);
  if (opts?.progress) await tx.objectStore("progressEvents").put(opts.progress);
  if (opts?.audit) await tx.objectStore("auditEvents").put(opts.audit);
  if (opts?.enqueue !== false) {
    await tx
      .objectStore("syncOutbox")
      .put(buildOutboxItem("taskOccurrence", occurrence.id, "upsert", occurrence.version, occurrence));
  }
  await tx.done;
}

export async function putJournalLocal(
  scope: WorkspaceScope,
  entry: JournalEntry,
  audit?: AuditEvent,
  enqueue = true,
): Promise<void> {
  if (!isIndexedDbAvailable()) return;
  const db = await getLocalDb(scope);
  const tx = db.transaction(["journalEntries", "auditEvents", "syncOutbox"], "readwrite");
  await tx.objectStore("journalEntries").put(entry);
  if (audit) await tx.objectStore("auditEvents").put(audit);
  if (enqueue) {
    await tx.objectStore("syncOutbox").put(buildOutboxItem("journalEntry", entry.id, "upsert", entry.version, entry));
  }
  await tx.done;
}

export async function putAiMemoryLocal(scope: WorkspaceScope, memory: AiMemoryItem, enqueue = true): Promise<void> {
  if (!isIndexedDbAvailable()) return;
  const db = await getLocalDb(scope);
  const tx = db.transaction(["aiMemories", "syncOutbox"], "readwrite");
  await tx.objectStore("aiMemories").put(memory);
  if (enqueue) {
    await tx.objectStore("syncOutbox").put(buildOutboxItem("aiMemory", memory.id, "upsert", memory.version, memory));
  }
  await tx.done;
}

export async function deleteAiMemoryLocal(scope: WorkspaceScope, memory: AiMemoryItem): Promise<Tombstone> {
  const tombstone: Tombstone = {
    id: makeId("tomb"),
    entityType: "aiMemory",
    entityId: memory.id,
    baseVersion: memory.version,
    deletedAt: new Date().toISOString(),
  };
  if (!isIndexedDbAvailable()) return tombstone;
  const db = await getLocalDb(scope);
  const tx = db.transaction(["aiMemories", "tombstones", "syncOutbox"], "readwrite");
  await tx.objectStore("aiMemories").delete(memory.id);
  await tx.objectStore("tombstones").put(tombstone);
  await tx.objectStore("syncOutbox").put(buildOutboxItem("aiMemory", memory.id, "delete", memory.version, tombstone));
  await tx.done;
  return tombstone;
}

export async function putMetaLocal(
  scope: WorkspaceScope,
  key: "driveConnection" | "driveManifest" | "driveManifestEtag" | "notificationPrefs" | "aiConsent",
  value: unknown,
): Promise<void> {
  if (!isIndexedDbAvailable()) return;
  const db = await getLocalDb(scope);
  await db.put("meta", { key, value } as never);
}

export async function putConflictLocal(scope: WorkspaceScope, conflict: SyncConflictRecord): Promise<void> {
  if (!isIndexedDbAvailable()) return;
  const db = await getLocalDb(scope);
  await db.put("syncConflicts", conflict);
}

export async function clearOutboxItemsLocal(scope: WorkspaceScope, ids: readonly string[]): Promise<void> {
  if (!isIndexedDbAvailable() || ids.length === 0) return;
  const db = await getLocalDb(scope);
  const tx = db.transaction("syncOutbox", "readwrite");
  for (const id of ids) {
    await tx.store.delete(id);
  }
  await tx.done;
}

export async function updateOutboxItemLocal(scope: WorkspaceScope, item: OfflineMutationOutboxItem): Promise<void> {
  if (!isIndexedDbAvailable()) return;
  const db = await getLocalDb(scope);
  await db.put("syncOutbox", item);
}

/** Atomically persists a merged remote+local dataset into the scoped IndexedDB without enqueuing redundant outbox items. */
export async function applyMergedRecordsLocal(
  scope: WorkspaceScope,
  merged: {
    categories: readonly Category[];
    templates: readonly TaskTemplate[];
    occurrences: readonly TaskOccurrence[];
    progressEvents: readonly ProgressEvent[];
    auditEvents: readonly AuditEvent[];
    journalEntries: readonly JournalEntry[];
    aiMemories: readonly AiMemoryItem[];
    tombstones: readonly Tombstone[];
    removedIds?: {
      category?: readonly string[];
      routineTemplate?: readonly string[];
      taskOccurrence?: readonly string[];
      journalEntry?: readonly string[];
      aiMemory?: readonly string[];
    };
  },
): Promise<void> {
  if (!isIndexedDbAvailable()) return;
  const db = await getLocalDb(scope);
  const tx = db.transaction(
    [
      "categories",
      "routineTemplates",
      "taskOccurrences",
      "progressEvents",
      "auditEvents",
      "journalEntries",
      "aiMemories",
      "tombstones",
    ],
    "readwrite",
  );
  for (const c of merged.categories) await tx.objectStore("categories").put(c);
  for (const t of merged.templates) await tx.objectStore("routineTemplates").put(t);
  for (const o of merged.occurrences) await tx.objectStore("taskOccurrences").put(o);
  for (const p of merged.progressEvents) await tx.objectStore("progressEvents").put(p);
  for (const a of merged.auditEvents) await tx.objectStore("auditEvents").put(a);
  for (const j of merged.journalEntries) await tx.objectStore("journalEntries").put(j);
  for (const m of merged.aiMemories) await tx.objectStore("aiMemories").put(m);
  for (const tomb of merged.tombstones) await tx.objectStore("tombstones").put(tomb);

  for (const id of merged.removedIds?.category ?? []) await tx.objectStore("categories").delete(id);
  for (const id of merged.removedIds?.routineTemplate ?? []) await tx.objectStore("routineTemplates").delete(id);
  for (const id of merged.removedIds?.taskOccurrence ?? []) await tx.objectStore("taskOccurrences").delete(id);
  for (const id of merged.removedIds?.journalEntry ?? []) await tx.objectStore("journalEntries").delete(id);
  for (const id of merged.removedIds?.aiMemory ?? []) await tx.objectStore("aiMemories").delete(id);
  await tx.done;
}

/** Explicit user-initiated import of a validated WorkspaceExport JSON into the active scope. */
export async function importWorkspaceJsonIntoScope(scope: WorkspaceScope, rawJson: string): Promise<number> {
  const parsed: WorkspaceExport = WorkspaceExportSchema.parse(JSON.parse(rawJson));
  for (const c of parsed.categories) await putCategoryLocal(scope, c, true);
  for (const t of parsed.routineTemplates) await putTemplateLocal(scope, t, undefined, true);
  for (const o of parsed.taskOccurrences) await putOccurrenceLocal(scope, o, { enqueue: true });
  for (const j of parsed.journalEntries) await putJournalLocal(scope, j, undefined, true);
  for (const m of parsed.aiMemories) await putAiMemoryLocal(scope, m, true);
  return (
    parsed.categories.length +
    parsed.routineTemplates.length +
    parsed.taskOccurrences.length +
    parsed.journalEntries.length +
    parsed.aiMemories.length
  );
}

export function buildWorkspaceExport(snapshot: LocalWorkspaceSnapshot, timeZone: string): WorkspaceExport {
  return WorkspaceExportSchema.parse({
    schemaVersion: CURRENT_DRIVE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    timeZone,
    categories: snapshot.categories,
    routineTemplates: snapshot.templates,
    taskOccurrences: snapshot.occurrences,
    progressEvents: snapshot.progressEvents,
    auditEvents: snapshot.auditEvents,
    journalEntries: snapshot.journalEntries,
    aiMemories: snapshot.aiMemories,
  });
}

export function dateKey(date: ISODate): string {
  return `journal_${date}`;
}
