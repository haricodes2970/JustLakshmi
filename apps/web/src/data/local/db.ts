import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  AiMemoryItem,
  AuditEvent,
  Category,
  DriveConnectionMetadata,
  DriveManifest,
  JournalEntry,
  NotificationPreferences,
  OfflineMutationOutboxItem,
  ProgressEvent,
  SyncConflictRecord,
  TaskOccurrence,
  TaskTemplate,
  Tombstone,
} from "@justlakshmi/shared";

export type LocalMetaValue =
  | { key: "driveConnection"; value: DriveConnectionMetadata | null }
  | { key: "driveManifest"; value: DriveManifest | null }
  | { key: "driveManifestEtag"; value: string | null }
  | { key: "notificationPrefs"; value: NotificationPreferences }
  | { key: "aiConsent"; value: { granted: boolean; includeJournal: boolean; updatedAt: string } };

export interface JustLakshmiDB extends DBSchema {
  categories: { key: string; value: Category };
  routineTemplates: { key: string; value: TaskTemplate };
  taskOccurrences: { key: string; value: TaskOccurrence; indexes: { "by-date": string; "by-template": string } };
  progressEvents: { key: string; value: ProgressEvent; indexes: { "by-occurrence": string } };
  auditEvents: { key: string; value: AuditEvent; indexes: { "by-entity": string } };
  journalEntries: { key: string; value: JournalEntry; indexes: { "by-date": string } };
  aiMemories: { key: string; value: AiMemoryItem };
  syncOutbox: { key: string; value: OfflineMutationOutboxItem; indexes: { "by-status": string } };
  syncConflicts: { key: string; value: SyncConflictRecord };
  tombstones: { key: string; value: Tombstone };
  meta: { key: string; value: LocalMetaValue };
}

export type WorkspaceScope = { kind: "user"; userId: string } | { kind: "guest" };

export const LEGACY_UNSCOPED_DB_NAME = "justlakshmi-local";
const DB_VERSION = 1;

const openDbs = new Map<string, Promise<IDBPDatabase<JustLakshmiDB>>>();

function sanitizeScopeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
}

/**
 * Returns a strictly isolated IndexedDB database name per authenticated Supabase user ID.
 * Unauthenticated guest workspaces use a separate `justlakshmi-guest` database and never
 * share storage with any authenticated user or with the legacy unscoped database.
 */
export function dbNameForScope(scope: WorkspaceScope): string {
  if (scope.kind === "user") {
    return `justlakshmi-user-${sanitizeScopeId(scope.userId)}`;
  }
  return "justlakshmi-guest";
}

export function scopeKeyOf(scope: WorkspaceScope): string {
  return scope.kind === "user" ? `user:${scope.userId}` : "guest";
}

export function isIndexedDbAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

function createSchema(db: IDBPDatabase<JustLakshmiDB>): void {
  if (!db.objectStoreNames.contains("categories")) db.createObjectStore("categories", { keyPath: "id" });
  if (!db.objectStoreNames.contains("routineTemplates")) db.createObjectStore("routineTemplates", { keyPath: "id" });
  if (!db.objectStoreNames.contains("taskOccurrences")) {
    const store = db.createObjectStore("taskOccurrences", { keyPath: "id" });
    store.createIndex("by-date", "date");
    store.createIndex("by-template", "templateId");
  }
  if (!db.objectStoreNames.contains("progressEvents")) {
    const store = db.createObjectStore("progressEvents", { keyPath: "id" });
    store.createIndex("by-occurrence", "occurrenceId");
  }
  if (!db.objectStoreNames.contains("auditEvents")) {
    const store = db.createObjectStore("auditEvents", { keyPath: "id" });
    store.createIndex("by-entity", "entityId");
  }
  if (!db.objectStoreNames.contains("journalEntries")) {
    const store = db.createObjectStore("journalEntries", { keyPath: "id" });
    store.createIndex("by-date", "date", { unique: true });
  }
  if (!db.objectStoreNames.contains("aiMemories")) db.createObjectStore("aiMemories", { keyPath: "id" });
  if (!db.objectStoreNames.contains("syncOutbox")) {
    const store = db.createObjectStore("syncOutbox", { keyPath: "id" });
    store.createIndex("by-status", "status");
  }
  if (!db.objectStoreNames.contains("syncConflicts")) db.createObjectStore("syncConflicts", { keyPath: "id" });
  if (!db.objectStoreNames.contains("tombstones")) db.createObjectStore("tombstones", { keyPath: "id" });
  if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
}

export function openNamedDb(dbName: string): Promise<IDBPDatabase<JustLakshmiDB>> {
  if (!isIndexedDbAvailable()) {
    return Promise.reject(new Error("IndexedDB is unavailable in this environment."));
  }
  const existing = openDbs.get(dbName);
  if (existing) return existing;

  const promise = openDB<JustLakshmiDB>(dbName, DB_VERSION, {
    upgrade(db) {
      createSchema(db);
    },
    terminated() {
      openDbs.delete(dbName);
    },
  });
  openDbs.set(dbName, promise);
  return promise;
}

export function getLocalDb(scope: WorkspaceScope): Promise<IDBPDatabase<JustLakshmiDB>> {
  return openNamedDb(dbNameForScope(scope));
}

export async function closeLocalDb(scope: WorkspaceScope): Promise<void> {
  const name = dbNameForScope(scope);
  const existing = openDbs.get(name);
  if (!existing) return;
  openDbs.delete(name);
  try {
    const db = await existing;
    db.close();
  } catch {
    // Ignore close errors on already-closed connections.
  }
}

export async function closeAllLocalDbs(): Promise<void> {
  const entries = Array.from(openDbs.entries());
  openDbs.clear();
  await Promise.all(
    entries.map(async ([, p]) => {
      try {
        (await p).close();
      } catch {
        // Ignore close errors.
      }
    }),
  );
}

/** Checks if the legacy Phase 3.0 unscoped DB exists on this browser (never auto-migrated). */
export async function legacyUnscopedDbExists(): Promise<boolean> {
  if (!isIndexedDbAvailable()) return false;
  if (typeof indexedDB.databases !== "function") return false;
  try {
    const dbs = await indexedDB.databases();
    return dbs.some((d) => d.name === LEGACY_UNSCOPED_DB_NAME);
  } catch {
    return false;
  }
}
