import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { API_PREFIX } from "@justlakshmi/shared";
import type { ApiEnv } from "./config/env.js";
import { createAiProviderService, type AiProviderService } from "./lib/ai/providers.js";
import { createSupabaseTokenVerifier, type TokenVerifier } from "./lib/auth.js";
import { createSupabaseDriveConnectionStore, type DriveConnectionStore } from "./lib/supabase-rls.js";
import { AppError, registerErrorHandlers } from "./plugins/error-handler.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerV1Routes } from "./routes/v1/index.js";
import { createDeferredNotificationScheduler, type NotificationScheduler } from "./workers/notification-scheduler.js";

export type BuildAppOptions = {
  env: ApiEnv;
  tokenVerifier?: TokenVerifier;
  driveStore?: DriveConnectionStore;
  aiService?: AiProviderService;
  notificationScheduler?: NotificationScheduler;
  logger?: boolean;
};

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { env } = options;
  const allowedOrigins = new Set(env.CORS_ORIGINS);

  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : {
            level: env.LOG_LEVEL,
            redact: {
              paths: [
                "req.headers.authorization",
                "req.headers.cookie",
                "*.token",
                "*.accessToken",
                "*.refreshToken",
                "*.apiKey",
                "*.password",
              ],
              censor: "[REDACTED]",
            },
          },
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "same-site" },
  });

  await app.register(rateLimit, {
    max: env.NODE_ENV === "test" ? 1000 : 120,
    timeWindow: "1 minute",
  });

  await app.register(cors, {
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new AppError(403, "FORBIDDEN", "Origin is not allowed by CORS policy."), false);
    },
  });

  registerErrorHandlers(app);

  const tokenVerifier =
    options.tokenVerifier ?? createSupabaseTokenVerifier(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY);
  const driveStore =
    options.driveStore ?? createSupabaseDriveConnectionStore(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY);
  const aiService = options.aiService ?? createAiProviderService();
  const notificationScheduler = options.notificationScheduler ?? createDeferredNotificationScheduler();

  await registerHealthRoute(app);
  await app.register(
    async (v1) => {
      await registerV1Routes(v1, { tokenVerifier, driveStore, aiService, notificationScheduler });
    },
    { prefix: API_PREFIX },
  );

  return app;
}
