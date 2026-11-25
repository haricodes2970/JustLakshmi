"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  DRIVE_ROOT_FOLDER_NAME,
  type AiMemoryItem,
  type AuditEvent,
  type Category,
  type DriveConnectionMetadata,
  type ISODate,
  type JournalEntry,
  type LocalTime,
  type Mood,
  type NotificationPreferences,
  type OfflineMutationOutboxItem,
  type ProgressEvent,
  type Recurrence,
  type ReminderConfig,
  type SyncConflictRecord,
  type SyncState,
  type TaskMode,
  type TaskOccurrence,
  type TaskTemplate,
  type Tombstone,
} from "@justlakshmi/shared";
import { closeLocalDb, scopeKeyOf, type WorkspaceScope } from "@/data/local/db";
import {
  DEFAULT_NOTIFICATION_PREFS,
  buildWorkspaceExport,
  createEmptySnapshot,
  dateKey,
  deleteAiMemoryLocal,
  exportLegacyUnscopedJson,
  importWorkspaceJsonIntoScope,
  inspectLegacyUnscopedData,
  loadLocalSnapshot,
  makeId,
  putAiMemoryLocal,
  putCategoryLocal,
  putConflictLocal,
  putJournalLocal,
  putMetaLocal,
  putOccurrenceLocal,
  putTemplateLocal,
  type LocalWorkspaceSnapshot,
} from "@/data/local/repository";
import { runDriveSync } from "@/data/sync/engine";
import { completionFromOccurrences, type DayCompletion } from "@/domain/analytics";
import { occurrenceId, occursOn, templatesOn } from "@/domain/recurrence";
import { useAuth } from "@/features/auth/auth-provider";
import { isApiConfigured, saveDriveConnection } from "@/lib/api-client";
import { createHabbitsFolder, verifyHabbitsFolder } from "@/lib/drive/client";
import { requestDriveAuthorization, revokeDriveAuthorization } from "@/lib/drive/oauth";
import { pickExistingHabbitsFolder } from "@/lib/drive/picker";
import { clearDriveAccessToken, hasActiveDriveToken } from "@/lib/drive/token-memory";
import { useClock } from "@/lib/use-clock";

export type NewTemplateInput = {
  title: string;
  description?: string;
  categoryId?: string;
  mode?: TaskMode;
  time?: LocalTime;
  recurrence: Recurrence;
  targetValue?: number;
  unit?: string;
  targetDurationMinutes?: number;
  reminder?: ReminderConfig;
};

export type EditScope = "this_occurrence" | "future_occurrences";

export type JournalPatch = {
  mood: Mood | null;
  energy: number | null;
  stress: number | null;
  wentWell: string;
  couldBeBetter: string;
  gratitude: string;
  learned: string;
  tomorrow: string;
  notes: string;
};

type WorkspaceContextValue = {
  ready: boolean;
  scope: WorkspaceScope;
  today: ISODate;
  timeZone: string;
  categories: readonly Category[];
  templates: readonly TaskTemplate[];
  occurrences: readonly TaskOccurrence[];
  auditEvents: readonly AuditEvent[];
  journalEntries: readonly JournalEntry[];
  aiMemories: readonly AiMemoryItem[];
  outboxCount: number;
  unresolvedConflicts: readonly SyncConflictRecord[];
  driveConnection: DriveConnectionMetadata | null;
  driveTokenActive: boolean;
  syncState: SyncState;
  syncMessage: string;
  notificationPrefs: NotificationPreferences;
  aiConsent: { granted: boolean; includeJournal: boolean; updatedAt: string };
  legacyUnscoped: { exists: boolean; recordCount: number };

  categoryName: (id?: string) => string;
  occurrencesOn: (date: ISODate) => TaskOccurrence[];
  completionOn: (date: ISODate) => DayCompletion;
  isDone: (templateId: string, date: ISODate) => boolean;
  auditForOccurrence: (occId: string) => AuditEvent[];

  addTask: (input: Omit<NewTemplateInput, "recurrence">, date: ISODate) => Promise<void>;
  addRoutine: (input: NewTemplateInput) => Promise<void>;
  editTemplate: (
    templateId: string,
    patch: Partial<Pick<TaskTemplate, "title" | "time" | "categoryId" | "recurrence" | "targetValue" | "unit" | "targetDurationMinutes" | "reminder">>,
    scope: EditScope,
    date: ISODate,
  ) => Promise<void>;
  archiveTemplate: (templateId: string) => Promise<void>;
  toggleOccurrence: (templateId: string, date: ISODate) => Promise<void>;
  recordProgress: (templateId: string, date: ISODate, delta: number) => Promise<void>;
  correctProgress: (templateId: string, date: ISODate, exactValue: number) => Promise<void>;

  createCategory: (name: string) => Promise<void>;
  renameCategory: (id: string, name: string) => Promise<void>;
  deleteCategory: (id: string, reassignToId?: string) => Promise<void>;

  getJournal: (date: ISODate) => JournalEntry | null;
  saveJournal: (date: ISODate, patch: JournalPatch) => Promise<void>;

  setAiConsent: (granted: boolean, includeJournal: boolean) => Promise<void>;
  addAiMemory: (content: string, category?: string) => Promise<void>;
  updateAiMemory: (id: string, content: string) => Promise<void>;
  togglePinAiMemory: (id: string) => Promise<void>;
  deleteAiMemory: (id: string) => Promise<void>;
  clearAllAiMemories: () => Promise<void>;

  updateNotificationPrefs: (patch: Partial<NotificationPreferences>) => Promise<void>;

  connectCreateDriveFolder: () => Promise<void>;
  connectSelectDriveFolder: () => Promise<void>;
  reauthorizeDrive: () => Promise<void>;
  disconnectDrive: () => Promise<void>;
  syncNow: () => Promise<void>;
  resolveConflict: (conflictId: string, strategy: "keep_local" | "keep_remote" | "keep_both") => Promise<void>;

  loadStarterRoutine: () => Promise<void>;
  exportJson: () => string;
  importJson: (rawJson: string) => Promise<number>;
  exportLegacyJson: () => Promise<string | null>;
};

const Ctx = createContext<WorkspaceContextValue | null>(null);

const byTime = (a: { time?: string; titleSnapshot: string }, b: { time?: string; titleSnapshot: string }) =>
  (a.time ?? "99:99").localeCompare(b.time ?? "99:99") || a.titleSnapshot.localeCompare(b.titleSnapshot);

function detectTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const clock = useClock();
  const auth = useAuth();
  const today = clock?.date ?? "1970-01-01";
  const timeZone = useMemo(() => detectTimeZone(), []);

  // Wait for auth restoration before opening a user-scoped IndexedDB database.
  const authUserId = auth.user?.id ?? null;
  const scope: WorkspaceScope = useMemo(
    () => (auth.status === "authenticated" && authUserId ? { kind: "user", userId: authUserId } : { kind: "guest" }),
    [auth.status, authUserId],
  );
  const activeScopeKey = scopeKeyOf(scope);

  const [loadedScopeKey, setLoadedScopeKey] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [occurrences, setOccurrences] = useState<TaskOccurrence[]>([]);
  const [progressEvents, setProgressEvents] = useState<ProgressEvent[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [aiMemories, setAiMemories] = useState<AiMemoryItem[]>([]);
  const [outbox, setOutbox] = useState<OfflineMutationOutboxItem[]>([]);
  const [conflicts, setConflicts] = useState<SyncConflictRecord[]>([]);
  const [tombstones, setTombstones] = useState<Tombstone[]>([]);
  const [driveConnection, setDriveConnection] = useState<DriveConnectionMetadata | null>(null);
  const [driveManifest, setDriveManifest] = useState<LocalWorkspaceSnapshot["driveManifest"]>(null);
  const [driveManifestEtag, setDriveManifestEtag] = useState<string | null>(null);
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFS);
  const [aiConsent, setAiConsentState] = useState({ granted: false, includeJournal: false, updatedAt: "" });
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [syncMessage, setSyncMessage] = useState("Saved locally on this device.");
  const [legacyUnscoped, setLegacyUnscoped] = useState<{ exists: boolean; recordCount: number }>({
    exists: false,
    recordCount: 0,
  });

  const prevScopeRef = useRef<WorkspaceScope | null>(null);
  const generationRef = useRef(0);
  const snapshotRef = useRef<LocalWorkspaceSnapshot | null>(null);

  useEffect(() => {
    snapshotRef.current = {
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
      driveConnection,
      driveManifest,
      driveManifestEtag,
      notificationPrefs,
      aiConsent,
    };
  }, [
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
    driveConnection,
    driveManifest,
    driveManifestEtag,
    notificationPrefs,
    aiConsent,
  ]);

  const applySnapshot = useCallback((snap: LocalWorkspaceSnapshot | null, targetScopeKey: string) => {
    const resolved = snap ?? createEmptySnapshot();
    setCategories(resolved.categories);
    setTemplates(resolved.templates);
    setOccurrences(resolved.occurrences);
    setProgressEvents(resolved.progressEvents);
    setAuditEvents(resolved.auditEvents);
    setJournalEntries(resolved.journalEntries);
    setAiMemories(resolved.aiMemories);
    setOutbox(resolved.outbox);
    setConflicts(resolved.conflicts);
    setTombstones(resolved.tombstones);
    setDriveConnection(resolved.driveConnection);
    setDriveManifest(resolved.driveManifest);
    setDriveManifestEtag(resolved.driveManifestEtag);
    setNotificationPrefs(resolved.notificationPrefs);
    setAiConsentState(resolved.aiConsent);

    if (resolved.conflicts.some((c) => !c.resolvedAt)) setSyncState("conflict");
    else if (resolved.driveConnection?.status === "reauth_required") setSyncState("reauth_required");
    else if (resolved.outbox.length > 0) setSyncState("pending");
    else if (resolved.driveConnection?.status === "connected") setSyncState("synced");
    else setSyncState("idle");

    setLoadedScopeKey(targetScopeKey);
  }, []);

  const reloadFromDb = useCallback(async () => {
    const gen = ++generationRef.current;
    const snap = await loadLocalSnapshot(scope).catch(() => null);
    if (generationRef.current !== gen) return;
    applySnapshot(snap, activeScopeKey);
  }, [scope, activeScopeKey, applySnapshot]);

  // Safe account-switch & logout lifecycle:
  // 1. Wait until auth finishes restoring session.
  // 2. Close previous user's IndexedDB handle & clear Drive token on scope change.
  // 3. Load strictly from the new user/guest DB with generation guard against race conditions.
  useEffect(() => {
    if (auth.status === "loading") return;

    const prevScope = prevScopeRef.current;
    if (prevScope && scopeKeyOf(prevScope) !== activeScopeKey) {
      clearDriveAccessToken();
      void closeLocalDb(prevScope);
    }
    prevScopeRef.current = scope;

    const gen = ++generationRef.current;
    let active = true;

    Promise.all([
      loadLocalSnapshot(scope).catch(() => null),
      inspectLegacyUnscopedData().catch(() => ({ exists: false, recordCount: 0 })),
    ]).then(([snap, legacy]) => {
      if (!active || generationRef.current !== gen) return;
      applySnapshot(snap, activeScopeKey);
      setLegacyUnscoped(legacy);
    });

    return () => {
      active = false;
    };
  }, [auth.status, scope, activeScopeKey, applySnapshot]);

  const materializeOccurrence = useCallback(
    (template: TaskTemplate, date: ISODate): TaskOccurrence => {
      const now = new Date().toISOString();
      return {
        id: occurrenceId(template.id, date),
        templateId: template.id,
        date,
        timeZone,
        titleSnapshot: template.title,
        categoryIdSnapshot: template.categoryId,
        mode: template.mode,
        time: template.time,
        targetValue: template.targetValue,
        unit: template.unit,
        targetDurationMinutes: template.targetDurationMinutes,
        completed: false,
        progressValue: 0,
        completedAt: null,
        isOverride: false,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
    },
    [timeZone],
  );

  const occurrencesOn = useCallback(
    (date: ISODate): TaskOccurrence[] => {
      const persisted = occurrences.filter((o) => o.date === date);
      const byId = new Map(persisted.map((o) => [o.id, o]));
      const activeTemplates = templatesOn(templates, date);
      for (const tpl of activeTemplates) {
        const id = occurrenceId(tpl.id, date);
        if (!byId.has(id)) {
          byId.set(id, materializeOccurrence(tpl, date));
        }
      }
      return Array.from(byId.values()).sort(byTime);
    },
    [occurrences, templates, materializeOccurrence],
  );

  const completionOn = useCallback(
    (date: ISODate): DayCompletion => completionFromOccurrences(date, occurrencesOn(date)),
    [occurrencesOn],
  );

  const isDone = useCallback(
    (templateId: string, date: ISODate): boolean => {
      const id = occurrenceId(templateId, date);
      return occurrences.find((o) => o.id === id)?.completed ?? false;
    },
    [occurrences],
  );

  const getOrCreateOccurrence = useCallback(
    (templateId: string, date: ISODate): TaskOccurrence | null => {
      const id = occurrenceId(templateId, date);
      const existing = occurrences.find((o) => o.id === id);
      if (existing) return existing;
      const tpl = templates.find((t) => t.id === templateId);
      if (!tpl) return null;
      return materializeOccurrence(tpl, date);
    },
    [occurrences, templates, materializeOccurrence],
  );

  const commitOccurrenceUpdate = useCallback(
    async (next: TaskOccurrence, audit: AuditEvent, progress?: ProgressEvent) => {
      await putOccurrenceLocal(scope, next, { progress, audit, enqueue: true });
      setOccurrences((prev) => [...prev.filter((o) => o.id !== next.id), next]);
      setAuditEvents((prev) => [...prev, audit]);
      if (progress) setProgressEvents((prev) => [...prev, progress]);
      setOutbox((prev) => [
        ...prev,
        {
          id: makeId("mut"),
          idempotencyKey: `taskOccurrence:${next.id}:upsert:v${next.version}`,
          entityType: "taskOccurrence",
          entityId: next.id,
          operation: "upsert",
          baseVersion: next.version,
          payload: next,
          status: "queued",
          attempts: 0,
          createdAt: next.updatedAt,
          nextRetryAt: null,
          lastError: null,
        },
      ]);
      setSyncState((cur) => (cur === "conflict" || cur === "reauth_required" ? cur : "pending"));
    },
    [scope],
  );

  const toggleOccurrence = useCallback(
    async (templateId: string, date: ISODate) => {
      const base = getOrCreateOccurrence(templateId, date);
      if (!base) return;
      const now = new Date().toISOString();
      const nextCompleted = !base.completed;
      const target = base.mode === "measurable" ? base.targetValue : base.mode === "duration" ? base.targetDurationMinutes : 1;
      const nextProgress = nextCompleted ? Math.max(base.progressValue, target ?? 1) : base.mode === "checkbox" ? 0 : base.progressValue;
      const next: TaskOccurrence = {
        ...base,
        completed: nextCompleted,
        progressValue: nextProgress,
        completedAt: nextCompleted ? now : null,
        version: base.version + 1,
        updatedAt: now,
      };
      const audit: AuditEvent = {
        id: makeId("aud"),
        entityType: "taskOccurrence",
        entityId: next.id,
        action: nextCompleted ? "completed" : "reopened",
        before: { completed: base.completed, progressValue: base.progressValue },
        after: { completed: next.completed, progressValue: next.progressValue },
        occurredAt: now,
      };
      await commitOccurrenceUpdate(next, audit);
    },
    [getOrCreateOccurrence, commitOccurrenceUpdate],
  );

  const recordProgress = useCallback(
    async (templateId: string, date: ISODate, delta: number) => {
      const base = getOrCreateOccurrence(templateId, date);
      if (!base) return;
      const now = new Date().toISOString();
      const newTotal = Math.max(0, Math.round((base.progressValue + delta) * 100) / 100);
      const target = base.mode === "measurable" ? base.targetValue : base.targetDurationMinutes;
      const reachedTarget = target !== undefined && newTotal >= target;
      const next: TaskOccurrence = {
        ...base,
        progressValue: newTotal,
        completed: reachedTarget ? true : base.completed && newTotal > 0,
        completedAt: reachedTarget ? base.completedAt ?? now : base.completedAt,
        version: base.version + 1,
        updatedAt: now,
      };
      const progress: ProgressEvent = {
        id: makeId("prog"),
        occurrenceId: next.id,
        delta,
        newTotal,
        unit: base.mode === "duration" ? "min" : (base.unit ?? "units"),
        recordedAt: now,
      };
      const audit: AuditEvent = {
        id: makeId("aud"),
        entityType: "taskOccurrence",
        entityId: next.id,
        action: reachedTarget && !base.completed ? "completed" : "progress_corrected",
        before: { progressValue: base.progressValue, completed: base.completed },
        after: { progressValue: next.progressValue, completed: next.completed },
        occurredAt: now,
      };
      await commitOccurrenceUpdate(next, audit, progress);
    },
    [getOrCreateOccurrence, commitOccurrenceUpdate],
  );

  const correctProgress = useCallback(
    async (templateId: string, date: ISODate, exactValue: number) => {
      const base = getOrCreateOccurrence(templateId, date);
      if (!base) return;
      await recordProgress(templateId, date, Math.max(0, exactValue) - base.progressValue);
    },
    [getOrCreateOccurrence, recordProgress],
  );

  const addRoutine = useCallback(
    async (input: NewTemplateInput) => {
      const now = new Date().toISOString();
      const tpl: TaskTemplate = {
        id: makeId(input.recurrence.kind === "once" ? "task" : "rt"),
        title: input.title.trim(),
        description: input.description?.trim() || undefined,
        categoryId: input.categoryId,
        mode: input.mode ?? "checkbox",
        time: input.time,
        recurrence: input.recurrence,
        targetValue: input.targetValue,
        unit: input.unit?.trim() || undefined,
        targetDurationMinutes: input.targetDurationMinutes,
        reminder: input.reminder ?? { enabled: false, overdueEnabled: false, overdueDelayMinutes: 30 },
        isArchived: false,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      const audit: AuditEvent = {
        id: makeId("aud"),
        entityType: "routineTemplate",
        entityId: tpl.id,
        action: "created",
        after: { title: tpl.title, mode: tpl.mode, recurrence: tpl.recurrence },
        occurredAt: now,
      };
      await putTemplateLocal(scope, tpl, audit, true);
      setTemplates((prev) => [...prev, tpl]);
      setAuditEvents((prev) => [...prev, audit]);
      setSyncState((cur) => (cur === "conflict" || cur === "reauth_required" ? cur : "pending"));
    },
    [scope],
  );

  const addTask = useCallback(
    async (input: Omit<NewTemplateInput, "recurrence">, date: ISODate) => {
      await addRoutine({ ...input, recurrence: { kind: "once", date } });
    },
    [addRoutine],
  );

  const editTemplate = useCallback(
    async (
      templateId: string,
      patch: Partial<Pick<TaskTemplate, "title" | "time" | "categoryId" | "recurrence" | "targetValue" | "unit" | "targetDurationMinutes" | "reminder">>,
      editScope: EditScope,
      date: ISODate,
    ) => {
      const existing = templates.find((t) => t.id === templateId);
      if (!existing) return;
      const now = new Date().toISOString();

      if (editScope === "this_occurrence") {
        const base = getOrCreateOccurrence(templateId, date);
        if (!base) return;
        const next: TaskOccurrence = {
          ...base,
          titleSnapshot: patch.title?.trim() || base.titleSnapshot,
          time: patch.time !== undefined ? patch.time : base.time,
          categoryIdSnapshot: patch.categoryId !== undefined ? patch.categoryId : base.categoryIdSnapshot,
          targetValue: patch.targetValue !== undefined ? patch.targetValue : base.targetValue,
          unit: patch.unit !== undefined ? patch.unit : base.unit,
          targetDurationMinutes: patch.targetDurationMinutes !== undefined ? patch.targetDurationMinutes : base.targetDurationMinutes,
          isOverride: true,
          version: base.version + 1,
          updatedAt: now,
        };
        const audit: AuditEvent = {
          id: makeId("aud"),
          entityType: "taskOccurrence",
          entityId: next.id,
          action: "updated",
          before: { title: base.titleSnapshot, time: base.time },
          after: { title: next.titleSnapshot, time: next.time, scope: "this_occurrence" },
          occurredAt: now,
        };
        await commitOccurrenceUpdate(next, audit);
        return;
      }

      const updated: TaskTemplate = {
        ...existing,
        ...patch,
        title: patch.title?.trim() || existing.title,
        version: existing.version + 1,
        updatedAt: now,
      };
      const audit: AuditEvent = {
        id: makeId("aud"),
        entityType: "routineTemplate",
        entityId: updated.id,
        action: "updated",
        before: { title: existing.title, recurrence: existing.recurrence, time: existing.time },
        after: { title: updated.title, recurrence: updated.recurrence, time: updated.time, scope: "future_occurrences" },
        occurredAt: now,
      };
      await putTemplateLocal(scope, updated, audit, true);
      setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setAuditEvents((prev) => [...prev, audit]);
      setSyncState((cur) => (cur === "conflict" || cur === "reauth_required" ? cur : "pending"));
    },
    [scope, templates, getOrCreateOccurrence, commitOccurrenceUpdate],
  );

  const archiveTemplate = useCallback(
    async (templateId: string) => {
      const existing = templates.find((t) => t.id === templateId);
      if (!existing) return;
      const now = new Date().toISOString();
      const archived: TaskTemplate = { ...existing, isArchived: true, version: existing.version + 1, updatedAt: now };
      const audit: AuditEvent = {
        id: makeId("aud"),
        entityType: "routineTemplate",
        entityId: archived.id,
        action: "deleted",
        before: { title: existing.title },
        occurredAt: now,
      };
      await putTemplateLocal(scope, archived, audit, true);
      setTemplates((prev) => prev.map((t) => (t.id === archived.id ? archived : t)));
      setAuditEvents((prev) => [...prev, audit]);
    },
    [scope, templates],
  );

  const createCategory = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const now = new Date().toISOString();
      const cat: Category = {
        id: makeId("cat"),
        name: trimmed,
        sortOrder: categories.length,
        isArchived: false,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      await putCategoryLocal(scope, cat, true);
      setCategories((prev) => [...prev, cat]);
    },
    [scope, categories.length],
  );

  const renameCategory = useCallback(
    async (id: string, name: string) => {
      const existing = categories.find((c) => c.id === id);
      if (!existing || !name.trim()) return;
      const updated: Category = {
        ...existing,
        name: name.trim(),
        version: existing.version + 1,
        updatedAt: new Date().toISOString(),
      };
      await putCategoryLocal(scope, updated, true);
      setCategories((prev) => prev.map((c) => (c.id === id ? updated : c)));
    },
    [scope, categories],
  );

  const deleteCategory = useCallback(
    async (id: string, reassignToId?: string) => {
      const existing = categories.find((c) => c.id === id);
      if (!existing) return;
      const now = new Date().toISOString();
      const archived: Category = { ...existing, isArchived: true, version: existing.version + 1, updatedAt: now };
      await putCategoryLocal(scope, archived, true);
      setCategories((prev) => prev.map((c) => (c.id === id ? archived : c)));

      const affected = templates.filter((t) => t.categoryId === id);
      for (const tpl of affected) {
        const next: TaskTemplate = { ...tpl, categoryId: reassignToId || undefined, version: tpl.version + 1, updatedAt: now };
        await putTemplateLocal(scope, next, undefined, true);
      }
      if (affected.length > 0) {
        setTemplates((prev) =>
          prev.map((t) =>
            t.categoryId === id ? { ...t, categoryId: reassignToId || undefined, version: t.version + 1, updatedAt: now } : t,
          ),
        );
      }
    },
    [scope, categories, templates],
  );

  const getJournal = useCallback(
    (date: ISODate): JournalEntry | null => journalEntries.find((j) => j.date === date) ?? null,
    [journalEntries],
  );

  const saveJournal = useCallback(
    async (date: ISODate, patch: JournalPatch) => {
      const existing = journalEntries.find((j) => j.date === date);
      const now = new Date().toISOString();
      const entry: JournalEntry = {
        id: existing?.id ?? dateKey(date),
        date,
        timeZone,
        ...patch,
        version: (existing?.version ?? 0) + 1,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      const audit: AuditEvent = {
        id: makeId("aud"),
        entityType: "journalEntry",
        entityId: entry.id,
        action: existing ? "updated" : "created",
        occurredAt: now,
      };
      await putJournalLocal(scope, entry, audit, true);
      setJournalEntries((prev) => [...prev.filter((j) => j.date !== date), entry]);
      setAuditEvents((prev) => [...prev, audit]);
      setSyncState((cur) => (cur === "conflict" || cur === "reauth_required" ? cur : "pending"));
    },
    [scope, journalEntries, timeZone],
  );

  const setAiConsent = useCallback(
    async (granted: boolean, includeJournal: boolean) => {
      const next = { granted, includeJournal: granted && includeJournal, updatedAt: new Date().toISOString() };
      await putMetaLocal(scope, "aiConsent", next);
      setAiConsentState(next);
    },
    [scope],
  );

  const addAiMemory = useCallback(
    async (content: string, category?: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      const now = new Date().toISOString();
      const item: AiMemoryItem = {
        id: makeId("mem"),
        content: trimmed,
        category: category?.trim() || undefined,
        pinned: false,
        provenance: "user",
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      await putAiMemoryLocal(scope, item, true);
      setAiMemories((prev) => [item, ...prev]);
    },
    [scope],
  );

  const updateAiMemory = useCallback(
    async (id: string, content: string) => {
      const existing = aiMemories.find((m) => m.id === id);
      if (!existing || !content.trim()) return;
      const updated: AiMemoryItem = {
        ...existing,
        content: content.trim(),
        version: existing.version + 1,
        updatedAt: new Date().toISOString(),
      };
      await putAiMemoryLocal(scope, updated, true);
      setAiMemories((prev) => prev.map((m) => (m.id === id ? updated : m)));
    },
    [scope, aiMemories],
  );

  const togglePinAiMemory = useCallback(
    async (id: string) => {
      const existing = aiMemories.find((m) => m.id === id);
      if (!existing) return;
      const updated: AiMemoryItem = {
        ...existing,
        pinned: !existing.pinned,
        version: existing.version + 1,
        updatedAt: new Date().toISOString(),
      };
      await putAiMemoryLocal(scope, updated, true);
      setAiMemories((prev) => prev.map((m) => (m.id === id ? updated : m)));
    },
    [scope, aiMemories],
  );

  const deleteAiMemory = useCallback(
    async (id: string) => {
      const existing = aiMemories.find((m) => m.id === id);
      if (!existing) return;
      const tomb = await deleteAiMemoryLocal(scope, existing);
      setAiMemories((prev) => prev.filter((m) => m.id !== id));
      setTombstones((prev) => [...prev, tomb]);
    },
    [scope, aiMemories],
  );

  const clearAllAiMemories = useCallback(async () => {
    for (const mem of aiMemories) {
      await deleteAiMemoryLocal(scope, mem);
    }
    setAiMemories([]);
  }, [scope, aiMemories]);

  const updateNotificationPrefs = useCallback(
    async (patch: Partial<NotificationPreferences>) => {
      const next: NotificationPreferences = { ...notificationPrefs, ...patch };
      await putMetaLocal(scope, "notificationPrefs", next);
      setNotificationPrefs(next);
    },
    [scope, notificationPrefs],
  );

  const persistDriveConnectionMetadata = useCallback(
    async (meta: DriveConnectionMetadata) => {
      await putMetaLocal(scope, "driveConnection", meta);
      setDriveConnection(meta);
      if (auth.accessToken && isApiConfigured()) {
        await saveDriveConnection(auth.accessToken, {
          status: meta.status,
          folderId: meta.folderId,
          folderName: DRIVE_ROOT_FOLDER_NAME,
          manifestFileId: meta.manifestFileId,
          verifiedAt: meta.verifiedAt,
          schemaVersion: meta.schemaVersion,
        }).catch(() => {
          // Backend metadata sync is best-effort when API or migration is not yet deployed.
        });
      }
    },
    [scope, auth.accessToken],
  );

  const syncNow = useCallback(async () => {
    const snap = snapshotRef.current;
    if (!snap) return;
    setSyncState("syncing");
    const result = await runDriveSync(scope, snap);
    setSyncState(result.state);
    setSyncMessage(result.message);
    if (result.manifest) setDriveManifest(result.manifest);
    await reloadFromDb();
  }, [scope, reloadFromDb]);

  const connectCreateDriveFolder = useCallback(async () => {
    const token = await requestDriveAuthorization({ promptConsent: true });
    const verified = await createHabbitsFolder(token);
    const now = new Date().toISOString();
    await putMetaLocal(scope, "driveManifest", verified.manifest);
    if (verified.manifestEtag) await putMetaLocal(scope, "driveManifestEtag", verified.manifestEtag);
    setDriveManifest(verified.manifest);
    const meta: DriveConnectionMetadata = {
      status: "connected",
      folderId: verified.folderId,
      folderName: DRIVE_ROOT_FOLDER_NAME,
      manifestFileId: verified.manifestFileId,
      schemaVersion: verified.manifest.schemaVersion,
      verifiedAt: verified.verifiedAt,
      lastSyncedAt: null,
      updatedAt: now,
    };
    await persistDriveConnectionMetadata(meta);
    const snap = snapshotRef.current ? { ...snapshotRef.current, driveConnection: meta, driveManifest: verified.manifest } : null;
    if (snap) {
      const res = await runDriveSync(scope, snap);
      setSyncState(res.state);
      setSyncMessage(res.message);
      await reloadFromDb();
    }
  }, [scope, persistDriveConnectionMetadata, reloadFromDb]);

  const connectSelectDriveFolder = useCallback(async () => {
    const token = await requestDriveAuthorization({ promptConsent: true });
    const picked = await pickExistingHabbitsFolder(token);
    if (!picked) return;
    const verified = await verifyHabbitsFolder(token, picked.folderId);
    const now = new Date().toISOString();
    await putMetaLocal(scope, "driveManifest", verified.manifest);
    if (verified.manifestEtag) await putMetaLocal(scope, "driveManifestEtag", verified.manifestEtag);
    setDriveManifest(verified.manifest);
    const meta: DriveConnectionMetadata = {
      status: "connected",
      folderId: verified.folderId,
      folderName: DRIVE_ROOT_FOLDER_NAME,
      manifestFileId: verified.manifestFileId,
      schemaVersion: verified.manifest.schemaVersion,
      verifiedAt: verified.verifiedAt,
      lastSyncedAt: null,
      updatedAt: now,
    };
    await persistDriveConnectionMetadata(meta);

    // Immediately hydrate & merge existing remote Drive records into IndexedDB before any upload.
    const snap = snapshotRef.current ? { ...snapshotRef.current, driveConnection: meta, driveManifest: verified.manifest } : null;
    if (snap) {
      const res = await runDriveSync(scope, snap);
      setSyncState(res.state);
      setSyncMessage(res.message);
      await reloadFromDb();
    }
  }, [scope, persistDriveConnectionMetadata, reloadFromDb]);

  const reauthorizeDrive = useCallback(async () => {
    await requestDriveAuthorization();
    if (driveConnection && driveConnection.folderId && driveConnection.manifestFileId && driveConnection.verifiedAt) {
      await persistDriveConnectionMetadata({
        ...driveConnection,
        status: "connected",
        updatedAt: new Date().toISOString(),
      });
    }
    await syncNow();
  }, [driveConnection, persistDriveConnectionMetadata, syncNow]);

  const disconnectDrive = useCallback(async () => {
    await revokeDriveAuthorization();
    const now = new Date().toISOString();
    await persistDriveConnectionMetadata({
      status: "not_connected",
      folderId: null,
      folderName: DRIVE_ROOT_FOLDER_NAME,
      manifestFileId: null,
      schemaVersion: 1,
      verifiedAt: null,
      lastSyncedAt: null,
      updatedAt: now,
    });
    setSyncState("idle");
    setSyncMessage('Disconnected from Google Drive. Your "Habbits" folder remains untouched in Drive.');
  }, [persistDriveConnectionMetadata]);

  const resolveConflict = useCallback(
    async (conflictId: string, strategy: "keep_local" | "keep_remote" | "keep_both") => {
      const target = conflicts.find((c) => c.id === conflictId);
      if (!target) return;
      const now = new Date().toISOString();

      if (strategy === "keep_remote" && target.remoteSnapshot) {
        if (target.entityType === "journalEntry") {
          await putJournalLocal(scope, target.remoteSnapshot as JournalEntry, undefined, false);
        } else if (target.entityType === "routineTemplate") {
          await putTemplateLocal(scope, target.remoteSnapshot as TaskTemplate, undefined, false);
        } else if (target.entityType === "taskOccurrence") {
          await putOccurrenceLocal(scope, target.remoteSnapshot as TaskOccurrence, { enqueue: false });
        } else if (target.entityType === "category") {
          await putCategoryLocal(scope, target.remoteSnapshot as Category, false);
        } else if (target.entityType === "aiMemory") {
          await putAiMemoryLocal(scope, target.remoteSnapshot as AiMemoryItem, false);
        }
      } else if (strategy === "keep_local" && target.localSnapshot) {
        const bumpedVersion = Math.max(target.localVersion, target.remoteVersion) + 1;
        const bumped = { ...(target.localSnapshot as Record<string, unknown>), version: bumpedVersion, updatedAt: now };
        if (target.entityType === "journalEntry") await putJournalLocal(scope, bumped as JournalEntry, undefined, true);
        else if (target.entityType === "routineTemplate") await putTemplateLocal(scope, bumped as TaskTemplate, undefined, true);
        else if (target.entityType === "taskOccurrence") await putOccurrenceLocal(scope, bumped as TaskOccurrence, { enqueue: true });
        else if (target.entityType === "category") await putCategoryLocal(scope, bumped as Category, true);
        else if (target.entityType === "aiMemory") await putAiMemoryLocal(scope, bumped as AiMemoryItem, true);
      }

      const resolved: SyncConflictRecord = { ...target, resolvedAt: now, resolution: strategy };
      await putConflictLocal(scope, resolved);
      await reloadFromDb();
      setSyncState("pending");
      setSyncMessage(`Conflict resolved (${strategy}). Sync when ready.`);
    },
    [scope, conflicts, reloadFromDb],
  );

  const loadStarterRoutine = useCallback(async () => {
    const now = new Date().toISOString();
    const starterCats: Category[] = [
      { id: "cat_morning", name: "Morning", sortOrder: 0, isArchived: false, version: 1, createdAt: now, updatedAt: now },
      { id: "cat_health", name: "Health", sortOrder: 1, isArchived: false, version: 1, createdAt: now, updatedAt: now },
      { id: "cat_focus", name: "Focus", sortOrder: 2, isArchived: false, version: 1, createdAt: now, updatedAt: now },
      { id: "cat_evening", name: "Evening", sortOrder: 3, isArchived: false, version: 1, createdAt: now, updatedAt: now },
    ];
    for (const c of starterCats) await putCategoryLocal(scope, c, true);
    const starterTemplates: TaskTemplate[] = [
      {
        id: "rt_water",
        title: "Hydration",
        categoryId: "cat_health",
        mode: "measurable",
        targetValue: 2000,
        unit: "ml",
        time: "07:00",
        recurrence: { kind: "daily", startsOn: today },
        reminder: { enabled: false, overdueEnabled: false, overdueDelayMinutes: 30 },
        isArchived: false,
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "rt_walk",
        title: "Morning walk",
        categoryId: "cat_health",
        mode: "duration",
        targetDurationMinutes: 30,
        time: "07:30",
        recurrence: { kind: "weekdays", days: [1, 2, 3, 4, 5, 6], startsOn: today },
        reminder: { enabled: false, overdueEnabled: false, overdueDelayMinutes: 30 },
        isArchived: false,
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "rt_read",
        title: "Focused reading",
        categoryId: "cat_focus",
        mode: "checkbox",
        time: "09:00",
        recurrence: { kind: "daily", startsOn: today },
        reminder: { enabled: false, overdueEnabled: false, overdueDelayMinutes: 30 },
        isArchived: false,
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "rt_plan",
        title: "Plan tomorrow",
        categoryId: "cat_evening",
        mode: "checkbox",
        time: "21:30",
        recurrence: { kind: "daily", startsOn: today },
        reminder: { enabled: false, overdueEnabled: false, overdueDelayMinutes: 30 },
        isArchived: false,
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
    ];
    for (const t of starterTemplates) await putTemplateLocal(scope, t, undefined, true);
    await reloadFromDb();
  }, [scope, today, reloadFromDb]);

  const exportJson = useCallback(() => {
    const snap = snapshotRef.current;
    if (!snap) return "{}";
    return JSON.stringify(buildWorkspaceExport(snap, timeZone), null, 2);
  }, [timeZone]);

  const importJson = useCallback(
    async (rawJson: string) => {
      const count = await importWorkspaceJsonIntoScope(scope, rawJson);
      await reloadFromDb();
      return count;
    },
    [scope, reloadFromDb],
  );

  const exportLegacyJson = useCallback(() => exportLegacyUnscopedJson(timeZone), [timeZone]);

  useEffect(() => {
    const onOnlineOrVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (navigator.onLine && hasActiveDriveToken() && snapshotRef.current?.driveConnection?.status === "connected") {
        void syncNow();
      }
    };
    window.addEventListener("online", onOnlineOrVisible);
    document.addEventListener("visibilitychange", onOnlineOrVisible);
    return () => {
      window.removeEventListener("online", onOnlineOrVisible);
      document.removeEventListener("visibilitychange", onOnlineOrVisible);
    };
  }, [syncNow]);

  const activeCategories = useMemo(() => categories.filter((c) => !c.isArchived), [categories]);
  const unresolvedConflicts = useMemo(() => conflicts.filter((c) => !c.resolvedAt), [conflicts]);
  const ready = auth.status !== "loading" && loadedScopeKey === activeScopeKey && clock !== null;

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      ready,
      scope,
      today,
      timeZone,
      categories: activeCategories,
      templates,
      occurrences,
      auditEvents,
      journalEntries,
      aiMemories,
      outboxCount: outbox.length,
      unresolvedConflicts,
      driveConnection,
      driveTokenActive: hasActiveDriveToken(),
      syncState,
      syncMessage,
      notificationPrefs,
      aiConsent,
      legacyUnscoped,
      categoryName: (id) => categories.find((c) => c.id === id)?.name ?? "Uncategorized",
      occurrencesOn,
      completionOn,
      isDone,
      auditForOccurrence: (occId) => auditEvents.filter((a) => a.entityId === occId),
      addTask,
      addRoutine,
      editTemplate,
      archiveTemplate,
      toggleOccurrence,
      recordProgress,
      correctProgress,
      createCategory,
      renameCategory,
      deleteCategory,
      getJournal,
      saveJournal,
      setAiConsent,
      addAiMemory,
      updateAiMemory,
      togglePinAiMemory,
      deleteAiMemory,
      clearAllAiMemories,
      updateNotificationPrefs,
      connectCreateDriveFolder,
      connectSelectDriveFolder,
      reauthorizeDrive,
      disconnectDrive,
      syncNow,
      resolveConflict,
      loadStarterRoutine,
      exportJson,
      importJson,
      exportLegacyJson,
    }),
    [
      ready,
      scope,
      today,
      timeZone,
      activeCategories,
      categories,
      templates,
      occurrences,
      auditEvents,
      journalEntries,
      aiMemories,
      outbox.length,
      unresolvedConflicts,
      driveConnection,
      syncState,
      syncMessage,
      notificationPrefs,
      aiConsent,
      legacyUnscoped,
      occurrencesOn,
      completionOn,
      isDone,
      addTask,
      addRoutine,
      editTemplate,
      archiveTemplate,
      toggleOccurrence,
      recordProgress,
      correctProgress,
      createCategory,
      renameCategory,
      deleteCategory,
      getJournal,
      saveJournal,
      setAiConsent,
      addAiMemory,
      updateAiMemory,
      togglePinAiMemory,
      deleteAiMemory,
      clearAllAiMemories,
      updateNotificationPrefs,
      connectCreateDriveFolder,
      connectSelectDriveFolder,
      reauthorizeDrive,
      disconnectDrive,
      syncNow,
      resolveConflict,
      loadStarterRoutine,
      exportJson,
      importJson,
      exportLegacyJson,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}

export { occursOn };
