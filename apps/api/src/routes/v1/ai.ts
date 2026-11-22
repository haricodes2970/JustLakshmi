import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import {
  AiChatRequestSchema,
  AiChatResponseSchema,
  AiTestProviderRequestSchema,
  AiTestProviderResponseSchema,
  type AiChatResponse,
  type AiTestProviderResponse,
} from "@justlakshmi/shared";
import type { AiProviderService } from "../../lib/ai/providers.js";
import { AppError } from "../../plugins/error-handler.js";

/**
 * Read-only Lakshmi AI endpoints.
 * BYOK keys are passed per-request over HTTPS and never persisted or logged.
 */
export async function registerAiRoutes(
  app: FastifyInstance,
  options: { requireAuth: preHandlerHookHandler; aiService: AiProviderService },
): Promise<void> {
  app.post(
    "/ai/test-provider",
    { preHandler: [options.requireAuth] },
    async (request): Promise<AiTestProviderResponse> => {
      const input = AiTestProviderRequestSchema.parse(request.body);
      const result = await options.aiService.testProvider(input);
      return AiTestProviderResponseSchema.parse(result);
    },
  );

  app.post("/ai/chat", { preHandler: [options.requireAuth] }, async (request): Promise<AiChatResponse> => {
    const input = AiChatRequestSchema.parse(request.body);
    try {
      const result = await options.aiService.chat(input);
      return AiChatResponseSchema.parse(result);
    } catch (err) {
      throw new AppError(
        502,
        "SERVICE_UNAVAILABLE",
        err instanceof Error ? err.message : "AI provider request failed.",
      );
    }
  });
}
