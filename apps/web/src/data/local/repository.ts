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
import { getLocalDb, isIndexedDbAvailable } from "./db";

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
  notificationPrefs: NotificationPreferences;
  aiConsent: { granted: boolean; includeJournal: boolean; updatedAt: string };
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = NotificationPreferencesSchema.parse({});

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
    idempotencyKey: `${entityType}:${entityId}:${operation}:v${baseVersion}:${Date.now()}`,
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

export async function loadLocalSnapshot(): Promise<LocalWorkspaceSnapshot | null> {
  if (!isIndexedDbAvailable()) return null;
  const db = await getLocalDb();
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
    notificationPrefs:
      (metaMap.get("notificationPrefs") as NotificationPreferences | undefined) ?? DEFAULT_NOTIFICATION_PREFS,
    aiConsent: (metaMap.get("aiConsent") as { granted: boolean; includeJournal: boolean; updatedAt: string } | undefined) ?? {
      granted: false,
      includeJournal: false,
      updatedAt: new Date().toISOString(),
    },
  };
}

export async function putCategoryLocal(category: Category, enqueue = true): Promise<void> {
  if (!isIndexedDbAvailable()) return;
  const db = await getLocalDb();
  const tx = db.transaction(["categories", "syncOutbox"], "readwrite");
  await tx.objectStore("categories").put(category);
  if (enqueue) {
    await tx.objectStore("syncOutbox").put(buildOutboxItem("category", category.id, "upsert", category.version, category));
  }
  await tx.done;
}

export async function putTemplateLocal(template: TaskTemplate, audit?: AuditEvent, enqueue = true): Promise<void> {
  if (!isIndexedDbAvailable()) return;
  const db = await getLocalDb();
  const tx = db.transaction(["routineTemplates", "auditEvents", "syncOutbox"], "readwrite");
  await tx.objectStore("routineTemplates").put(template);
  if (audit) await tx.objectStore("auditEvents").put(audit);
  if (enqueue) {
    await tx.objectStore("syncOutbox").put(buildOutboxItem("routineTemplate", template.id, "upsert", template.version, template));
  }
  await tx.done;
}

export async function putOccurrenceLocal(
  occurrence: TaskOccurrence,
  opts?: { progress?: ProgressEvent; audit?: AuditEvent; enqueue?: boolean },
): Promise<void> {
  if (!isIndexedDbAvailable()) return;
  const db = await getLocalDb();
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

export async function putJournalLocal(entry: JournalEntry, audit?: AuditEvent, enqueue = true): Promise<void> {
  if (!isIndexedDbAvailable()) return;
  const db = await getLocalDb();
  const tx = db.transaction(["journalEntries", "auditEvents", "syncOutbox"], "readwrite");
  await tx.objectStore("journalEntries").put(entry);
  if (audit) await tx.objectStore("auditEvents").put(audit);
  if (enqueue) {
    await tx.objectStore("syncOutbox").put(buildOutboxItem("journalEntry", entry.id, "upsert", entry.version, entry));
  }
  await tx.done;
}

export async function putAiMemoryLocal(memory: AiMemoryItem, enqueue = true): Promise<void> {
  if (!isIndexedDbAvailable()) return;
  const db = await getLocalDb();
  const tx = db.transaction(["aiMemories", "syncOutbox"], "readwrite");
  await tx.objectStore("aiMemories").put(memory);
  if (enqueue) {
    await tx.objectStore("syncOutbox").put(buildOutboxItem("aiMemory", memory.id, "upsert", memory.version, memory));
  }
  await tx.done;
}

export async function deleteAiMemoryLocal(memory: AiMemoryItem): Promise<Tombstone> {
  const tombstone: Tombstone = {
    id: makeId("tomb"),
    entityType: "aiMemory",
    entityId: memory.id,
    baseVersion: memory.version,
    deletedAt: new Date().toISOString(),
  };
  if (!isIndexedDbAvailable()) return tombstone;
  const db = await getLocalDb();
  const tx = db.transaction(["aiMemories", "tombstones", "syncOutbox"], "readwrite");
  await tx.objectStore("aiMemories").delete(memory.id);
  await tx.objectStore("tombstones").put(tombstone);
  await tx.objectStore("syncOutbox").put(buildOutboxItem("aiMemory", memory.id, "delete", memory.version, tombstone));
  await tx.done;
  return tombstone;
}

export async function putMetaLocal(
  key: "driveConnection" | "driveManifest" | "notificationPrefs" | "aiConsent",
  value: unknown,
): Promise<void> {
  if (!isIndexedDbAvailable()) return;
  const db = await getLocalDb();
  await db.put("meta", { key, value } as never);
}

export async function putConflictLocal(conflict: SyncConflictRecord): Promise<void> {
  if (!isIndexedDbAvailable()) return;
  const db = await getLocalDb();
  await db.put("syncConflicts", conflict);
}

export async function clearOutboxItemsLocal(ids: readonly string[]): Promise<void> {
  if (!isIndexedDbAvailable() || ids.length === 0) return;
  const db = await getLocalDb();
  const tx = db.transaction("syncOutbox", "readwrite");
  for (const id of ids) {
    await tx.store.delete(id);
  }
  await tx.done;
}

export async function updateOutboxItemLocal(item: OfflineMutationOutboxItem): Promise<void> {
  if (!isIndexedDbAvailable()) return;
  const db = await getLocalDb();
  await db.put("syncOutbox", item);
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
