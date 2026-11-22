import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";
import {
  CancelNotificationJobRequestSchema,
  NotificationJobResponseSchema,
  PushSubscriptionInputSchema,
  ScheduleNotificationJobRequestSchema,
  type NotificationJobResponse,
} from "@justlakshmi/shared";
import { AppError } from "../../plugins/error-handler.js";
import type { NotificationScheduler } from "../../workers/notification-scheduler.js";

const DeleteSubscriptionSchema = z.strictObject({ endpoint: z.url() });

export async function registerNotificationRoutes(
  app: FastifyInstance,
  options: { requireAuth: preHandlerHookHandler; scheduler: NotificationScheduler },
): Promise<void> {
  app.post("/push/subscriptions", { preHandler: [options.requireAuth] }, async (request) => {
    if (!request.authUser) throw new AppError(401, "UNAUTHORIZED", "Authentication required.");
    const sub = PushSubscriptionInputSchema.parse(request.body);
    return options.scheduler.registerSubscription(request.authUser.id, sub);
  });

  app.delete("/push/subscriptions", { preHandler: [options.requireAuth] }, async (request) => {
    if (!request.authUser) throw new AppError(401, "UNAUTHORIZED", "Authentication required.");
    const { endpoint } = DeleteSubscriptionSchema.parse(request.body);
    return options.scheduler.removeSubscription(request.authUser.id, endpoint);
  });

  app.post(
    "/push/schedule",
    { preHandler: [options.requireAuth] },
    async (request): Promise<NotificationJobResponse> => {
      if (!request.authUser) throw new AppError(401, "UNAUTHORIZED", "Authentication required.");
      const job = ScheduleNotificationJobRequestSchema.parse(request.body);
      const res = await options.scheduler.scheduleJob(request.authUser.id, job);
      return NotificationJobResponseSchema.parse(res);
    },
  );

  app.post("/push/cancel", { preHandler: [options.requireAuth] }, async (request) => {
    if (!request.authUser) throw new AppError(401, "UNAUTHORIZED", "Authentication required.");
    const { occurrenceId } = CancelNotificationJobRequestSchema.parse(request.body);
    return options.scheduler.cancelOccurrenceJobs(request.authUser.id, occurrenceId);
  });
}
