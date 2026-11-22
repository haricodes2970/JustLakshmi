import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { JournalEntry, TaskOccurrence, TaskTemplate } from "@justlakshmi/shared";
import { categoryBreakdown, habitStreak, overallStreak } from "../src/domain/analytics";
import { describeRecurrence, occursOn } from "../src/domain/recurrence";
import { computeBackoffMs, detectVersionConflict } from "../src/data/sync/engine";
import { buildGroundedAiContext } from "../src/lib/ai/rag";
import { createHabbitsFolder, DriveApiError, verifyHabbitsFolder } from "../src/lib/drive/client";
import { clearDriveAccessToken, getDriveAccessToken, setDriveAccessToken } from "../src/lib/drive/token-memory";

const now = "2026-11-22T09:00:00.000Z";

function makeTemplate(overrides: Partial<TaskTemplate>): TaskTemplate {
  return {
    id: "tpl-1",
    title: "Walk",
    mode: "checkbox",
    recurrence: { kind: "daily" },
    reminder: { enabled: false, overdueEnabled: false, overdueDelayMinutes: 30 },
    isArchived: false,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("recurrence and analytics domain logic", () => {
  it("evaluates daily, weekday, once, and custom interval recurrences accurately", () => {
    assert.equal(occursOn({ kind: "once", date: "2026-11-22" }, "2026-11-22"), true);
    assert.equal(occursOn({ kind: "once", date: "2026-11-22" }, "2026-11-23"), false);
    assert.equal(occursOn({ kind: "daily", startsOn: "2026-11-20" }, "2026-11-19"), false);
    assert.equal(occursOn({ kind: "daily", startsOn: "2026-11-20" }, "2026-11-22"), true);
    // 2026-11-22 is Sunday (0), 2026-11-23 is Monday (1)
    assert.equal(occursOn({ kind: "weekdays", days: [1, 3, 5] }, "2026-11-22"), false);
    assert.equal(occursOn({ kind: "weekdays", days: [1, 3, 5] }, "2026-11-23"), true);
    assert.equal(occursOn({ kind: "custom", intervalDays: 3, startsOn: "2026-11-16" }, "2026-11-19"), true);
    assert.equal(occursOn({ kind: "custom", intervalDays: 3, startsOn: "2026-11-16" }, "2026-11-20"), false);
    assert.equal(describeRecurrence({ kind: "custom", intervalDays: 3, startsOn: "2026-11-16" }), "Every 3 days");
  });

  it("never breaks a habit streak on unscheduled days", () => {
    const monWedFri = makeTemplate({ id: "mwf", recurrence: { kind: "weekdays", days: [1, 3, 5] } });
    // 2026-11-22 is Sun; prior Fri=20, Wed=18, Mon=16
    const done = new Set(["2026-11-20", "2026-11-18", "2026-11-16"]);
    const streak = habitStreak(monWedFri, "2026-11-22", (_id, d) => done.has(d), 14);
    assert.equal(streak, 3);
  });

  it("calculates overall streak and category breakdown from real occurrences", () => {
    const days = [
      { date: "2026-11-19", scheduled: 4, completed: 4 },
      { date: "2026-11-20", scheduled: 4, completed: 3 },
      { date: "2026-11-21", scheduled: 4, completed: 4 },
      { date: "2026-11-22", scheduled: 4, completed: 0 }, // today pending does not break streak
    ];
    assert.equal(overallStreak(days, 70), 3);

    const occs: TaskOccurrence[] = [
      {
        id: "a@2026-11-22",
        templateId: "a",
        date: "2026-11-22",
        timeZone: "UTC",
        titleSnapshot: "Read",
        categoryIdSnapshot: "c1",
        mode: "checkbox",
        completed: true,
        progressValue: 1,
        completedAt: now,
        isOverride: false,
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
    ];
    const breakdown = categoryBreakdown(occs, [
      { id: "c1", name: "Focus", sortOrder: 0, isArchived: false, version: 1, createdAt: now, updatedAt: now },
    ]);
    assert.equal(breakdown[0]?.name, "Focus");
    assert.equal(breakdown[0]?.percent, 100);
  });
});

describe("Drive token memory, client, sync conflict detection, and RAG privacy", () => {
  it("stores Drive tokens strictly in memory and respects expiry", () => {
    setDriveAccessToken("ya29.test", 3600);
    assert.equal(getDriveAccessToken(), "ya29.test");
    clearDriveAccessToken();
    assert.equal(getDriveAccessToken(), null);
  });

  it("creates and verifies Habbits folder and rejects wrong folder name or expired token", async () => {
    let call = 0;
    const mockFetch: typeof fetch = async (input) => {
      call += 1;
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/drive/v3/files?fields=id")) {
        return new Response(JSON.stringify({ id: "folder-1", name: "Habbits" }), { status: 200 });
      }
      if (url.includes("uploadType=multipart")) {
        return new Response(JSON.stringify({ id: "manifest-1", modifiedTime: now }), { status: 200 });
      }
      if (url.includes("folder-bad")) {
        return new Response(JSON.stringify({ id: "folder-bad", name: "WrongName", mimeType: "application/vnd.google-apps.folder", trashed: false }), { status: 200 });
      }
      if (url.includes("folder-401")) {
        return new Response("Unauthorized", { status: 401 });
      }
      return new Response("Not found", { status: 404 });
    };

    const created = await createHabbitsFolder("ya29.ok", mockFetch);
    assert.equal(created.folderId, "folder-1");
    assert.equal(created.manifestFileId, "manifest-1");
    assert.equal(call, 2);

    await assert.rejects(
      () => verifyHabbitsFolder("ya29.ok", "folder-bad", mockFetch),
      (err: unknown) => err instanceof DriveApiError && err.code === "INVALID_FOLDER",
    );

    await assert.rejects(
      () => verifyHabbitsFolder("ya29.expired", "folder-401", mockFetch),
      (err: unknown) => err instanceof DriveApiError && err.code === "REAUTH_REQUIRED",
    );
  });

  it("detects multi-device conflicts without silent overwrite and computes bounded backoff", () => {
    const local = { id: "j1", version: 1, updatedAt: now, notes: "Local" };
    const remote = { id: "j1", version: 2, updatedAt: now, notes: "Remote" };
    const conflict = detectVersionConflict("journalEntry", local, remote);
    assert.ok(conflict);
    assert.equal(conflict.localVersion, 1);
    assert.equal(conflict.remoteVersion, 2);
    assert.ok(computeBackoffMs(3) >= 8000);
  });

  it("excludes journal records from AI RAG context unless explicitly consented", () => {
    const journal: JournalEntry = {
      id: "journal_2026-11-22",
      date: "2026-11-22",
      timeZone: "UTC",
      mood: "good",
      energy: 4,
      stress: 2,
      wentWell: "Private reflection",
      couldBeBetter: "",
      gratitude: "",
      learned: "",
      tomorrow: "",
      notes: "",
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    const withoutJournal = buildGroundedAiContext({
      today: "2026-11-22",
      templates: [],
      occurrences: [],
      journalEntries: [journal],
      memories: [],
      includeJournalContext: false,
    });
    assert.equal(withoutJournal.contextRecords.some((r) => r.kind === "journal"), false);

    const withJournal = buildGroundedAiContext({
      today: "2026-11-22",
      templates: [],
      occurrences: [],
      journalEntries: [journal],
      memories: [],
      includeJournalContext: true,
    });
    assert.equal(withJournal.contextRecords.some((r) => r.kind === "journal"), true);
  });
});
