import type { FastifyInstance } from "fastify";
import {
  API_VERSION,
  ApiV1StatusResponseSchema,
  AuthMeResponseSchema,
  DRIVE_ROOT_FOLDER_NAME,
  DriveConnectionMetadataSchema,
  DriveConnectionValidationResponseSchema,
  UpdateDriveConnectionRequestSchema,
  type ApiV1StatusResponse,
  type AuthMeResponse,
  type DriveConnectionValidationResponse,
} from "@justlakshmi/shared";
import type { AiProviderService } from "../../lib/ai/providers.js";
import type { TokenVerifier } from "../../lib/auth.js";
import type { DriveConnectionStore } from "../../lib/supabase-rls.js";
import { createRequireAuth } from "../../plugins/auth.js";
import { AppError } from "../../plugins/error-handler.js";
import type { NotificationScheduler } from "../../workers/notification-scheduler.js";
import { registerAiRoutes } from "./ai.js";
import { registerNotificationRoutes } from "./notifications.js";

export type V1RouteDeps = {
  tokenVerifier: TokenVerifier;
  driveStore: DriveConnectionStore;
  aiService: AiProviderService;
  notificationScheduler: NotificationScheduler;
};

export async function registerV1Routes(app: FastifyInstance, deps: V1RouteDeps): Promise<void> {
  const requireAuth = createRequireAuth(deps.tokenVerifier);

  app.get("/status", async (): Promise<ApiV1StatusResponse> => {
    return ApiV1StatusResponseSchema.parse({
      version: API_VERSION,
      driveFolderName: DRIVE_ROOT_FOLDER_NAME,
      authMode: "supabase-jwt",
    });
  });

  app.get("/auth/me", { preHandler: [requireAuth] }, async (request): Promise<AuthMeResponse> => {
    if (!request.authUser) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required.");
    }
    return AuthMeResponseSchema.parse({ user: request.authUser });
  });

  /** User-scoped Drive metadata lookup (enforced via Supabase RLS). */
  app.get("/drive/connection", { preHandler: [requireAuth] }, async (request) => {
    if (!request.authUser || !request.accessToken) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required.");
    }
    const connection = await deps.driveStore.getForUser(request.authUser.id, request.accessToken);
    return { connection: connection ? DriveConnectionMetadataSchema.parse(connection) : null };
  });

  /** User-scoped Drive metadata upsert (never accepts tokens or client userId). */
  app.put("/drive/connection", { preHandler: [requireAuth] }, async (request) => {
    if (!request.authUser || !request.accessToken) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required.");
    }
    const input = UpdateDriveConnectionRequestSchema.parse(request.body);
    const connection = await deps.driveStore.upsertForUser(request.authUser.id, request.accessToken, input);
    return { connection: DriveConnectionMetadataSchema.parse(connection) };
  });

  /** Dry-run contract validation endpoint for Drive connection metadata. */
  app.post(
    "/drive/connection/validate",
    { preHandler: [requireAuth] },
    async (request): Promise<DriveConnectionValidationResponse> => {
      const metadata = UpdateDriveConnectionRequestSchema.parse(request.body);
      return DriveConnectionValidationResponseSchema.parse({
        valid: true,
        persisted: false,
        metadata,
      });
    },
  );

  await registerAiRoutes(app, { requireAuth, aiService: deps.aiService });
  await registerNotificationRoutes(app, { requireAuth, scheduler: deps.notificationScheduler });
}
