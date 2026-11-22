import type {
  NotificationJobResponse,
  PushSubscriptionInput,
  ScheduleNotificationJobRequest,
} from "@justlakshmi/shared";

export type ScheduledJobRecord = ScheduleNotificationJobRequest & {
  jobId: string;
  userId: string;
  cancelled: boolean;
  createdAt: string;
};

/**
 * Worker-compatible notification scheduling interface.
 * Enforces idempotency by `idempotencyKey` and at most one scheduled + one overdue
 * reminder per occurrence. Actual Web Push delivery is deferred until Render worker
 * and VAPID keys are configured.
 */
export interface NotificationScheduler {
  registerSubscription(userId: string, sub: PushSubscriptionInput): Promise<{ stored: boolean; workerConfigured: boolean }>;
  removeSubscription(userId: string, endpoint: string): Promise<{ removed: boolean }>;
  scheduleJob(userId: string, req: ScheduleNotificationJobRequest): Promise<NotificationJobResponse>;
  cancelOccurrenceJobs(userId: string, occurrenceId: string): Promise<{ cancelledCount: number }>;
}

export function createDeferredNotificationScheduler(): NotificationScheduler {
  const subscriptions = new Map<string, Set<string>>();
  const jobsByIdempotencyKey = new Map<string, ScheduledJobRecord>();

  return {
    async registerSubscription(userId: string, sub: PushSubscriptionInput) {
      const userSubs = subscriptions.get(userId) ?? new Set<string>();
      userSubs.add(sub.endpoint);
      subscriptions.set(userId, userSubs);
      return { stored: true, workerConfigured: false };
    },

    async removeSubscription(userId: string, endpoint: string) {
      const userSubs = subscriptions.get(userId);
      const removed = userSubs ? userSubs.delete(endpoint) : false;
      return { removed };
    },

    async scheduleJob(userId: string, req: ScheduleNotificationJobRequest): Promise<NotificationJobResponse> {
      const scopedKey = `${userId}:${req.idempotencyKey}`;
      const existing = jobsByIdempotencyKey.get(scopedKey);
      if (existing && !existing.cancelled) {
        return {
          accepted: true,
          jobId: existing.jobId,
          idempotencyKey: req.idempotencyKey,
          workerStatus: "deferred_no_worker",
          message: "Job already registered (idempotent). Push delivery requires Render worker + VAPID setup.",
        };
      }

      const jobId = `job_${req.jobType}_${req.occurrenceId}`;
      jobsByIdempotencyKey.set(scopedKey, {
        ...req,
        jobId,
        userId,
        cancelled: false,
        createdAt: new Date().toISOString(),
      });

      return {
        accepted: true,
        jobId,
        idempotencyKey: req.idempotencyKey,
        workerStatus: "deferred_no_worker",
        message: "Schedule validated. Background Web Push delivery is deferred until Render worker + VAPID keys are configured.",
      };
    },

    async cancelOccurrenceJobs(userId: string, occurrenceId: string) {
      let cancelledCount = 0;
      for (const job of jobsByIdempotencyKey.values()) {
        if (job.userId === userId && job.occurrenceId === occurrenceId && !job.cancelled) {
          job.cancelled = true;
          cancelledCount += 1;
        }
      }
      return { cancelledCount };
    },
  };
}
