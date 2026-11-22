import { z } from "zod";
import { RecordIdSchema, SchemaVersionSchema } from "./sync.js";

export const ISODateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD.");
export type ISODate = z.infer<typeof ISODateSchema>;

export const LocalTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Must be HH:mm (24-hour).");
export type LocalTime = z.infer<typeof LocalTimeSchema>;

export const WeekdaySchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);
export type Weekday = z.infer<typeof WeekdaySchema>;

export const TaskModeSchema = z.enum(["checkbox", "measurable", "duration"]);
export type TaskMode = z.infer<typeof TaskModeSchema>;

export const RecurrenceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("once"),
    date: ISODateSchema,
  }),
  z.object({
    kind: z.literal("daily"),
    startsOn: ISODateSchema.optional(),
    endsOn: ISODateSchema.optional(),
  }),
  z.object({
    kind: z.literal("weekdays"),
    days: z.array(WeekdaySchema).min(1).max(7),
    startsOn: ISODateSchema.optional(),
    endsOn: ISODateSchema.optional(),
  }),
  z.object({
    kind: z.literal("custom"),
    intervalDays: z.number().int().min(1).max(365),
    startsOn: ISODateSchema,
    endsOn: ISODateSchema.optional(),
  }),
]);
export type Recurrence = z.infer<typeof RecurrenceSchema>;

export const ReminderConfigSchema = z.object({
  enabled: z.boolean().default(false),
  time: LocalTimeSchema.optional(),
  overdueEnabled: z.boolean().default(false),
  overdueDelayMinutes: z.number().int().min(5).max(240).default(30),
});
export type ReminderConfig = z.infer<typeof ReminderConfigSchema>;

export const CategorySchema = z.object({
  id: RecordIdSchema,
  name: z.string().trim().min(1).max(60),
  sortOrder: z.number().int().nonnegative().default(0),
  isArchived: z.boolean().default(false),
  version: z.number().int().positive().default(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Category = z.infer<typeof CategorySchema>;

export const TaskTemplateSchema = z.object({
  id: RecordIdSchema,
  title: z.string().trim().min(1).max(160),
  description: z.string().max(1000).optional(),
  categoryId: RecordIdSchema.optional(),
  mode: TaskModeSchema.default("checkbox"),
  time: LocalTimeSchema.optional(),
  recurrence: RecurrenceSchema,
  targetValue: z.number().positive().optional(),
  unit: z.string().trim().min(1).max(24).optional(),
  targetDurationMinutes: z.number().positive().optional(),
  reminder: ReminderConfigSchema.default({ enabled: false, overdueEnabled: false, overdueDelayMinutes: 30 }),
  isArchived: z.boolean().default(false),
  version: z.number().int().positive().default(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type TaskTemplate = z.infer<typeof TaskTemplateSchema>;

/** Date-specific immutable snapshot derived from a template or one-time task. */
export const TaskOccurrenceSchema = z.object({
  id: RecordIdSchema,
  templateId: RecordIdSchema,
  date: ISODateSchema,
  timeZone: z.string().min(1).max(64),
  titleSnapshot: z.string().trim().min(1).max(160),
  categoryIdSnapshot: RecordIdSchema.optional(),
  mode: TaskModeSchema,
  time: LocalTimeSchema.optional(),
  targetValue: z.number().positive().optional(),
  unit: z.string().trim().min(1).max(24).optional(),
  targetDurationMinutes: z.number().positive().optional(),
  completed: z.boolean().default(false),
  progressValue: z.number().nonnegative().default(0),
  completedAt: z.iso.datetime().nullable().default(null),
  isOverride: z.boolean().default(false),
  version: z.number().int().positive().default(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type TaskOccurrence = z.infer<typeof TaskOccurrenceSchema>;

export const ProgressEventSchema = z.object({
  id: RecordIdSchema,
  occurrenceId: RecordIdSchema,
  delta: z.number(),
  newTotal: z.number().nonnegative(),
  unit: z.string().min(1).max(24),
  recordedAt: z.iso.datetime(),
});
export type ProgressEvent = z.infer<typeof ProgressEventSchema>;

export const AuditActionSchema = z.enum([
  "created",
  "updated",
  "completed",
  "reopened",
  "progress_corrected",
  "deleted",
]);
export type AuditAction = z.infer<typeof AuditActionSchema>;

export const AuditEventSchema = z.object({
  id: RecordIdSchema,
  entityType: z.enum(["taskOccurrence", "routineTemplate", "journalEntry", "category"]),
  entityId: RecordIdSchema,
  action: AuditActionSchema,
  before: z.unknown().optional(),
  after: z.unknown().optional(),
  occurredAt: z.iso.datetime(),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

export const MoodSchema = z.enum(["happy", "good", "neutral", "low", "stressed"]);
export type Mood = z.infer<typeof MoodSchema>;

export const JournalEntrySchema = z.object({
  id: RecordIdSchema,
  date: ISODateSchema,
  timeZone: z.string().min(1).max(64),
  mood: MoodSchema.nullable().default(null),
  energy: z.number().int().min(1).max(5).nullable().default(null),
  stress: z.number().int().min(1).max(5).nullable().default(null),
  wentWell: z.string().max(2000).default(""),
  couldBeBetter: z.string().max(2000).default(""),
  gratitude: z.string().max(2000).default(""),
  learned: z.string().max(2000).default(""),
  tomorrow: z.string().max(2000).default(""),
  notes: z.string().max(4000).default(""),
  version: z.number().int().positive().default(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type JournalEntry = z.infer<typeof JournalEntrySchema>;

export const AiMemoryItemSchema = z.object({
  id: RecordIdSchema,
  content: z.string().trim().min(1).max(1000),
  category: z.string().trim().max(60).optional(),
  pinned: z.boolean().default(false),
  provenance: z.string().max(120).default("user"),
  version: z.number().int().positive().default(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type AiMemoryItem = z.infer<typeof AiMemoryItemSchema>;

/** Full user-owned JSON export. Explicitly excludes OAuth tokens and API keys. */
export const WorkspaceExportSchema = z.object({
  schemaVersion: SchemaVersionSchema,
  exportedAt: z.iso.datetime(),
  timeZone: z.string().min(1).max(64),
  categories: z.array(CategorySchema),
  routineTemplates: z.array(TaskTemplateSchema),
  taskOccurrences: z.array(TaskOccurrenceSchema),
  progressEvents: z.array(ProgressEventSchema),
  auditEvents: z.array(AuditEventSchema),
  journalEntries: z.array(JournalEntrySchema),
  aiMemories: z.array(AiMemoryItemSchema),
});
export type WorkspaceExport = z.infer<typeof WorkspaceExportSchema>;
