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
  | { key: "notificationPrefs"; value: NotificationPreferences }
  | { key: "aiConsent"; value: { granted: boolean; includeJournal: boolean; updatedAt: string } };

interface JustLakshmiDB extends DBSchema {
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

const DB_NAME = "justlakshmi-local";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<JustLakshmiDB>> | null = null;

export function isIndexedDbAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

export function getLocalDb(): Promise<IDBPDatabase<JustLakshmiDB>> {
  if (!isIndexedDbAvailable()) {
    return Promise.reject(new Error("IndexedDB is unavailable in this environment."));
  }
  if (!dbPromise) {
    dbPromise = openDB<JustLakshmiDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
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
      },
    });
  }
  return dbPromise;
}
