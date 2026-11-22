import type { FastifyInstance } from "fastify";
import {
  API_VERSION,
  ApiV1StatusResponseSchema,
  AuthMeResponseSchema,
  DRIVE_ROOT_FOLDER_NAME,
  DriveConnectionValidationResponseSchema,
  UpdateDriveConnectionRequestSchema,
  type ApiV1StatusResponse,
  type AuthMeResponse,
  type DriveConnectionValidationResponse,
} from "@justlakshmi/shared";
import type { TokenVerifier } from "../../lib/auth.js";
import { createRequireAuth } from "../../plugins/auth.js";
import { AppError } from "../../plugins/error-handler.js";

export async function registerV1Routes(app: FastifyInstance, options: { tokenVerifier: TokenVerifier }): Promise<void> {
  const requireAuth = createRequireAuth(options.tokenVerifier);

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

  /**
   * Contract validation endpoint for Drive connection metadata (Phase 2B dry-run).
   * Validates schema strictly (rejecting tokens or unknown fields) without writing to DB.
   */
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
}
