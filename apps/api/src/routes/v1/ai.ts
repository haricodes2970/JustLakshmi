import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import {
  AiChatRequestSchema,
  AiChatResponseSchema,
  AiDiscoverModelsRequestSchema,
  AiDiscoverModelsResponseSchema,
  AiTestProviderRequestSchema,
  AiTestProviderResponseSchema,
  type AiChatResponse,
  type AiDiscoverModelsResponse,
  type AiTestProviderResponse,
} from "@justlakshmi/shared";
import { AiProviderError } from "../../lib/ai/model-registry/types.js";
import type { AiProviderService } from "../../lib/ai/providers.js";
import { AppError } from "../../plugins/error-handler.js";

/**
 * Read-only Lakshmi AI endpoints.
 * BYOK keys travel over HTTPS per request and are never persisted or logged.
 */
export async function registerAiRoutes(
  app: FastifyInstance,
  options: { requireAuth: preHandlerHookHandler; aiService: AiProviderService },
): Promise<void> {
  app.post(
    "/ai/models",
    { preHandler: [options.requireAuth], bodyLimit: 16 * 1024 },
    async (request): Promise<AiDiscoverModelsResponse> => {
      const input = AiDiscoverModelsRequestSchema.parse(request.body);
      try {
        const result = await options.aiService.discoverModels(input);
        return AiDiscoverModelsResponseSchema.parse(result);
      } catch (err) {
        if (err instanceof AiProviderError) {
          const code =
            err.code === "INVALID_KEY"
              ? "UNAUTHORIZED"
              : err.code === "RATE_LIMITED"
                ? "RATE_LIMITED"
                : "SERVICE_UNAVAILABLE";
          throw new AppError(err.httpStatus, code, err.message);
        }
        throw new AppError(502, "SERVICE_UNAVAILABLE", "Failed to fetch provider model catalogue.");
      }
    },
  );

  app.post(
    "/ai/test-provider",
    { preHandler: [options.requireAuth], bodyLimit: 16 * 1024 },
    async (request): Promise<AiTestProviderResponse> => {
      const input = AiTestProviderRequestSchema.parse(request.body);
      const result = await options.aiService.testProvider(input);
      return AiTestProviderResponseSchema.parse(result);
    },
  );

  app.post(
    "/ai/chat",
    { preHandler: [options.requireAuth], bodyLimit: 64 * 1024 },
    async (request): Promise<AiChatResponse> => {
      const input = AiChatRequestSchema.parse(request.body);
      try {
        const result = await options.aiService.chat(input);
        return AiChatResponseSchema.parse(result);
      } catch (err) {
        if (err instanceof AiProviderError) {
          const code =
            err.code === "INVALID_KEY"
              ? "UNAUTHORIZED"
              : err.code === "RATE_LIMITED"
                ? "RATE_LIMITED"
                : err.code === "MODEL_UNAVAILABLE"
                  ? "VALIDATION_ERROR"
                  : "SERVICE_UNAVAILABLE";
          throw new AppError(err.httpStatus, code, err.message);
        }
        throw new AppError(
          502,
          "SERVICE_UNAVAILABLE",
          err instanceof Error ? err.message : "AI provider request failed.",
        );
      }
    },
  );
}
