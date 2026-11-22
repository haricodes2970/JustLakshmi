import { z } from "zod";
import { LocalTimeSchema } from "./domain.js";

export const NotificationPreferencesSchema = z.object({
  masterEnabled: z.boolean().default(false),
  defaultOverdueDelayMinutes: z.number().int().min(5).max(240).default(30),
  quietHoursEnabled: z.boolean().default(false),
  quietStart: LocalTimeSchema.default("22:00"),
  quietEnd: LocalTimeSchema.default("07:00"),
  motivationalCopy: z.boolean().default(true),
});
export type NotificationPreferences = z.infer<typeof NotificationPreferencesSchema>;

export const PushSubscriptionInputSchema = z.strictObject({
  endpoint: z.url(),
  keys: z.strictObject({
    p256dh: z.string().min(16).max(256),
    auth: z.string().min(8).max(128),
  }),
});
export type PushSubscriptionInput = z.infer<typeof PushSubscriptionInputSchema>;

export const NotificationJobTypeSchema = z.enum(["scheduled", "overdue"]);
export type NotificationJobType = z.infer<typeof NotificationJobTypeSchema>;

/**
 * Opaque notification job contract for Render worker scheduling.
 * Carries no plaintext journals, routines, or Drive tokens.
 */
export const ScheduleNotificationJobRequestSchema = z.strictObject({
  occurrenceId: z.string().min(1).max(128),
  jobType: NotificationJobTypeSchema,
  dueAt: z.iso.datetime(),
  idempotencyKey: z.string().min(1).max(160),
  timeZone: z.string().min(1).max(64),
  encryptedPayload: z.string().max(2048).optional(),
});
export type ScheduleNotificationJobRequest = z.infer<typeof ScheduleNotificationJobRequestSchema>;

export const CancelNotificationJobRequestSchema = z.strictObject({
  occurrenceId: z.string().min(1).max(128),
});
export type CancelNotificationJobRequest = z.infer<typeof CancelNotificationJobRequestSchema>;

export const NotificationJobResponseSchema = z.object({
  accepted: z.boolean(),
  jobId: z.string(),
  idempotencyKey: z.string(),
  workerStatus: z.enum(["scheduled", "deferred_no_worker"]),
  message: z.string(),
});
export type NotificationJobResponse = z.infer<typeof NotificationJobResponseSchema>;
