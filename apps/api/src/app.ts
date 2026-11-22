import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import Fastify, { type FastifyInstance } from "fastify";
import { API_PREFIX } from "@justlakshmi/shared";
import type { ApiEnv } from "./config/env.js";
import { createSupabaseTokenVerifier, type TokenVerifier } from "./lib/auth.js";
import { AppError, registerErrorHandlers } from "./plugins/error-handler.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerV1Routes } from "./routes/v1/index.js";

export type BuildAppOptions = {
  env: ApiEnv;
  tokenVerifier?: TokenVerifier;
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

  await app.register(cors, {
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
    origin(origin, callback) {
      // Allow non-browser / same-origin requests without an Origin header.
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

  await registerHealthRoute(app);
  await app.register(
    async (v1) => {
      await registerV1Routes(v1, { tokenVerifier });
    },
    { prefix: API_PREFIX },
  );

  return app;
}
