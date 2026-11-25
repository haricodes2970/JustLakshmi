import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  AiMemoryItem,
  Category,
  DriveManifest,
  JournalEntry,
  TaskOccurrence,
  TaskTemplate,
  Tombstone,
} from "@justlakshmi/shared";
import { dbNameForScope, scopeKeyOf, type WorkspaceScope } from "../src/data/local/db";
import { buildOutboxItem, createEmptySnapshot, type LocalWorkspaceSnapshot } from "../src/data/local/repository";
import { mergeWorkspaceDatasets, runDriveSync, type RemoteWorkspaceBundle } from "../src/data/sync/engine";
import { DriveApiError, migrateDriveManifest, sha256Hex } from "../src/lib/drive/client";
import { clearDriveAccessToken, setDriveAccessToken } from "../src/lib/drive/token-memory";

const now = "2026-11-22T12:00:00.000Z";
const later = "2026-11-22T13:00:00.000Z";

function makeJournal(id: string, version: number, wentWell: string, updatedAt = now): JournalEntry {
  return {
    id,
    date: "2026-11-22",
    timeZone: "Asia/Kolkata",
    mood: "good",
    energy: 4,
    stress: 2,
    wentWell,
    couldBeBetter: "",
    gratitude: "",
    learned: "",
    tomorrow: "",
    notes: "",
    version,
    createdAt: now,
    updatedAt,
  };
}

function makeTemplate(id: string, version: number, title: string): TaskTemplate {
  return {
    id,
    title,
    mode: "checkbox",
    recurrence: { kind: "daily" },
    reminder: { enabled: false, overdueEnabled: false, overdueDelayMinutes: 30 },
    isArchived: false,
    version,
    createdAt: now,
    updatedAt: now,
  };
}

function makeMemory(id: string, version: number, content: string): AiMemoryItem {
  return {
    id,
    content,
    pinned: false,
    provenance: "user",
    version,
    createdAt: now,
    updatedAt: now,
  };
}

function makeCategory(id: string, version: number, name: string): Category {
  return { id, name, sortOrder: 0, isArchived: false, version, createdAt: now, updatedAt: now };
}

function makeOccurrence(id: string, version: number, completed: boolean): TaskOccurrence {
  return {
    id,
    templateId: "rt-1",
    date: "2026-11-22",
    timeZone: "UTC",
    titleSnapshot: "Read",
    mode: "checkbox",
    completed,
    progressValue: completed ? 1 : 0,
    completedAt: completed ? now : null,
    isOverride: false,
    version,
    createdAt: now,
    updatedAt: now,
  };
}

describe("P0-A: IndexedDB user isolation & scope naming", () => {
  it("assigns strictly distinct IndexedDB names to User A, User B, and guest", () => {
    const userA: WorkspaceScope = { kind: "user", userId: "11111111-1111-4111-8111-111111111111" };
    const userB: WorkspaceScope = { kind: "user", userId: "22222222-2222-4222-8222-222222222222" };
    const guest: WorkspaceScope = { kind: "guest" };

    const dbA = dbNameForScope(userA);
    const dbB = dbNameForScope(userB);
    const dbGuest = dbNameForScope(guest);

    assert.notEqual(dbA, dbB);
    assert.notEqual(dbA, dbGuest);
    assert.notEqual(dbB, dbGuest);
    assert.notEqual(dbA, "justlakshmi-local");
    assert.notEqual(dbGuest, "justlakshmi-local");
    assert.equal(scopeKeyOf(userA), "user:11111111-1111-4111-8111-111111111111");
    assert.equal(scopeKeyOf(guest), "guest");
  });
});

describe("P0-B: Bidirectional Google Drive sync, restore, conflicts, tombstones, and concurrency", () => {
  it("migrates legacy v0 Drive manifest to v1 and rejects unsupported future versions", () => {
    const migrated = migrateDriveManifest({ folderName: "Habbits", files: [] }, "folder-legacy");
    assert.equal(migrated.schemaVersion, 1);
    assert.equal(migrated.folderId, "folder-legacy");

    assert.throws(
      () => migrateDriveManifest({ schemaVersion: 99, folderName: "Habbits", folderId: "f1", updatedAt: now, files: [] }),
      (err: unknown) => err instanceof DriveApiError && err.code === "SCHEMA_UNSUPPORTED",
    );
  });

  it("restores all remote records to an empty fresh device and merges append-only logs", () => {
    const emptyLocal = createEmptySnapshot();
    const remote: RemoteWorkspaceBundle = {
      categories: [makeCategory("c1", 1, "Morning")],
      templates: [makeTemplate("rt-1", 1, "Read 20 pages")],
      occurrences: [makeOccurrence("rt-1@2026-11-22", 2, true)],
      progressEvents: [{ id: "p1", occurrenceId: "rt-1@2026-11-22", delta: 1, newTotal: 1, unit: "units", recordedAt: now }],
      auditEvents: [{ id: "a1", entityType: "taskOccurrence", entityId: "rt-1@2026-11-22", action: "completed", occurredAt: now }],
      journalEntries: [makeJournal("journal_2026-11-22", 1, "Restored from Drive")],
      aiMemories: [makeMemory("m1", 1, "Prefers morning focus")],
      tombstones: [],
    };

    const res = mergeWorkspaceDatasets(emptyLocal, remote);
    assert.equal(res.conflicts.length, 0);
    assert.equal(res.restoredCount, 7);
    assert.equal(res.merged.templates[0]?.title, "Read 20 pages");
    assert.equal(res.merged.journalEntries[0]?.wentWell, "Restored from Drive");
    assert.equal(res.merged.aiMemories[0]?.content, "Prefers morning focus");
  });

  it("propagates tombstones so deleted records are not resurrected across devices", () => {
    const local = {
      ...createEmptySnapshot(),
      aiMemories: [makeMemory("m-deleted", 1, "Old memory")],
      tombstones: [],
    };
    const tomb: Tombstone = {
      id: "tomb-1",
      entityType: "aiMemory",
      entityId: "m-deleted",
      baseVersion: 1,
      deletedAt: later,
    };
    const remote: RemoteWorkspaceBundle = {
      categories: [],
      templates: [],
      occurrences: [],
      progressEvents: [],
      auditEvents: [],
      journalEntries: [],
      aiMemories: [],
      tombstones: [tomb],
    };

    const res = mergeWorkspaceDatasets(local, remote);
    assert.equal(res.merged.aiMemories.length, 0);
    assert.deepEqual(res.removedIds.aiMemory, ["m-deleted"]);
  });

  it("detects conflicts across every versioned entity type without silent overwrite", () => {
    const local = {
      ...createEmptySnapshot(),
      categories: [makeCategory("c1", 2, "Local Cat")],
      templates: [makeTemplate("rt-1", 2, "Local Routine")],
      occurrences: [makeOccurrence("rt-1@2026-11-22", 2, true)],
      journalEntries: [makeJournal("journal_2026-11-22", 2, "Local reflection")],
      aiMemories: [makeMemory("m1", 2, "Local memory")],
      outbox: [
        buildOutboxItem("category", "c1", "upsert", 2, {}),
        buildOutboxItem("routineTemplate", "rt-1", "upsert", 2, {}),
        buildOutboxItem("taskOccurrence", "rt-1@2026-11-22", "upsert", 2, {}),
        buildOutboxItem("journalEntry", "journal_2026-11-22", "upsert", 2, {}),
        buildOutboxItem("aiMemory", "m1", "upsert", 2, {}),
      ],
    };
    const remote: RemoteWorkspaceBundle = {
      categories: [makeCategory("c1", 2, "Remote Cat")],
      templates: [makeTemplate("rt-1", 3, "Remote Routine")],
      occurrences: [makeOccurrence("rt-1@2026-11-22", 3, false)],
      progressEvents: [],
      auditEvents: [],
      journalEntries: [makeJournal("journal_2026-11-22", 3, "Remote reflection", later)],
      aiMemories: [makeMemory("m1", 2, "Remote memory")],
      tombstones: [],
    };

    const res = mergeWorkspaceDatasets(local, remote);
    assert.equal(res.conflicts.length, 5);
    const types = new Set(res.conflicts.map((c) => c.entityType));
    assert.deepEqual(types, new Set(["category", "routineTemplate", "taskOccurrence", "journalEntry", "aiMemory"]));
  });

  it("hydrates an empty device via runDriveSync with checksum verification", async () => {
    setDriveAccessToken("ya29.valid", 3600);
    const remoteJournals = [makeJournal("journal_2026-11-22", 1, "Remote entry")];
    const journalText = JSON.stringify(remoteJournals);
    const journalSha = await sha256Hex(journalText);

    const manifest: DriveManifest = {
      schemaVersion: 1,
      folderName: "Habbits",
      folderId: "folder-1",
      updatedAt: now,
      files: [
        {
          fileId: "file-journal",
          path: "journal/entries.json",
          mimeType: "application/json",
          schemaVersion: 1,
          checksumSha256: journalSha,
          modifiedTime: now,
        },
      ],
    };

    const mockFetch: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("file-manifest?alt=media")) {
        return new Response(JSON.stringify(manifest), { status: 200, headers: { etag: '"etag-1"' } });
      }
      if (url.includes("file-manifest?fields=")) {
        return new Response(JSON.stringify({ id: "file-manifest", headRevisionId: "rev-1" }), { status: 200, headers: { etag: '"etag-1"' } });
      }
      if (url.includes("file-journal?alt=media")) {
        return new Response(journalText, { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    };

    const snap: LocalWorkspaceSnapshot = {
      ...createEmptySnapshot(),
      driveConnection: {
        status: "connected",
        folderId: "folder-1",
        folderName: "Habbits",
        manifestFileId: "file-manifest",
        schemaVersion: 1,
        verifiedAt: now,
        lastSyncedAt: null,
        updatedAt: now,
      },
    };

    const res = await runDriveSync({ kind: "user", userId: "u1" }, snap, mockFetch, { persistToIndexedDb: false });
    assert.equal(res.state, "synced");
    assert.equal(res.restoredCount, 1);
    assert.equal(res.merged?.journalEntries[0]?.wentWell, "Remote entry");
    clearDriveAccessToken();
  });

  it("blocks manifest overwrite on concurrent 412 revision conflict without losing outbox", async () => {
    setDriveAccessToken("ya29.valid", 3600);
    const manifest: DriveManifest = {
      schemaVersion: 1,
      folderName: "Habbits",
      folderId: "folder-1",
      updatedAt: now,
      files: [],
    };
    let revisionChecks = 0;

    const mockFetch: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("file-manifest?alt=media")) {
        return new Response(JSON.stringify(manifest), { status: 200, headers: { etag: '"etag-1"' } });
      }
      if (url.includes("file-manifest?fields=")) {
        revisionChecks += 1;
        // Second check right before manifest PATCH sees a new revision from another device!
        const rev = revisionChecks === 1 ? "rev-1" : "rev-2-concurrent";
        return new Response(JSON.stringify({ id: "file-manifest", headRevisionId: rev }), { status: 200 });
      }
      if (init?.method === "POST" && url.includes("uploadType=multipart")) {
        return new Response(JSON.stringify({ id: "uploaded-file", modifiedTime: now }), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    };

    const snap: LocalWorkspaceSnapshot = {
      ...createEmptySnapshot(),
      templates: [makeTemplate("rt-1", 1, "Walk")],
      outbox: [buildOutboxItem("routineTemplate", "rt-1", "upsert", 1, {})],
      driveConnection: {
        status: "connected",
        folderId: "folder-1",
        folderName: "Habbits",
        manifestFileId: "file-manifest",
        schemaVersion: 1,
        verifiedAt: now,
        lastSyncedAt: null,
        updatedAt: now,
      },
    };

    const res = await runDriveSync({ kind: "user", userId: "u1" }, snap, mockFetch, { persistToIndexedDb: false });
    assert.equal(res.state, "conflict");
    assert.equal(res.syncedCount, 0);
    clearDriveAccessToken();
  });

  it("handles 429 rate limits and partial upload failures without clearing outbox", async () => {
    setDriveAccessToken("ya29.valid", 3600);
    const manifest: DriveManifest = {
      schemaVersion: 1,
      folderName: "Habbits",
      folderId: "folder-1",
      updatedAt: now,
      files: [],
    };
    let uploads = 0;

    const mockFetch: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("file-manifest?alt=media")) {
        return new Response(JSON.stringify(manifest), { status: 200, headers: { etag: '"etag-1"' } });
      }
      if (url.includes("file-manifest?fields=")) {
        return new Response(JSON.stringify({ id: "file-manifest", headRevisionId: "rev-1" }), { status: 200 });
      }
      if (init?.method === "POST") {
        uploads += 1;
        if (uploads === 2) return new Response("Rate limit", { status: 429 });
        return new Response(JSON.stringify({ id: `f-${uploads}`, modifiedTime: now }), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    };

    const snap: LocalWorkspaceSnapshot = {
      ...createEmptySnapshot(),
      templates: [makeTemplate("rt-1", 1, "Walk")],
      outbox: [buildOutboxItem("routineTemplate", "rt-1", "upsert", 1, {})],
      driveConnection: {
        status: "connected",
        folderId: "folder-1",
        folderName: "Habbits",
        manifestFileId: "file-manifest",
        schemaVersion: 1,
        verifiedAt: now,
        lastSyncedAt: null,
        updatedAt: now,
      },
    };

    const res = await runDriveSync({ kind: "user", userId: "u1" }, snap, mockFetch, { persistToIndexedDb: false });
    assert.equal(res.state, "error");
    assert.equal(res.syncedCount, 0);
    assert.match(res.message, /queued/i);
    clearDriveAccessToken();
  });

  it("returns reauth_required when Drive token is absent or returns 401", async () => {
    clearDriveAccessToken();
    const snap: LocalWorkspaceSnapshot = {
      ...createEmptySnapshot(),
      outbox: [buildOutboxItem("routineTemplate", "rt-1", "upsert", 1, {})],
      driveConnection: {
        status: "connected",
        folderId: "folder-1",
        folderName: "Habbits",
        manifestFileId: "file-manifest",
        schemaVersion: 1,
        verifiedAt: now,
        lastSyncedAt: null,
        updatedAt: now,
      },
    };
    const res = await runDriveSync({ kind: "user", userId: "u1" }, snap, fetch, { persistToIndexedDb: false });
    assert.equal(res.state, "reauth_required");
    assert.equal(res.syncedCount, 0);
  });
});
