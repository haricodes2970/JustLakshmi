import type { ModelCapability } from "@justlakshmi/shared";
import { AiProviderError, type CompletionInput, type CompletionResult, type FetchLike, type ProviderAdapter, type RawProviderModel } from "../model-registry/types.js";
import { classifyProviderHttpError, fetchWithTimeoutAndRetry, parseOpenAiCompatibleResponse } from "./http.js";

const OPENROUTER_AUTH_KEY_URL = "https://openrouter.ai/api/v1/auth/key";
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

type OpenRouterModelEntry = {
  id?: string;
  name?: string;
  context_length?: number;
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
  };
  pricing?: {
    prompt?: string | number;
    completion?: string | number;
  };
};

function parsePerMillion(perToken: string | number | undefined): number | null {
  if (perToken === undefined || perToken === null || perToken === "") return null;
  const n = Number(perToken);
  if (!Number.isFinite(n) || n < 0) return null;
  return n * 1_000_000;
}

export const openrouterAdapter: ProviderAdapter = {
  id: "openrouter",

  async listModels(apiKey: string, fetchImpl: FetchLike): Promise<RawProviderModel[]> {
    // OpenRouter's /models endpoint is public, so verify the user's API key first via /auth/key.
    const authRes = await fetchWithTimeoutAndRetry(fetchImpl, OPENROUTER_AUTH_KEY_URL, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!authRes.ok) {
      const authErr = (await authRes.json().catch(() => null)) as { error?: { message?: string; code?: string } } | null;
      throw classifyProviderHttpError("openrouter", authRes.status, authErr?.error?.message, authErr?.error?.code);
    }

    const res = await fetchWithTimeoutAndRetry(fetchImpl, OPENROUTER_MODELS_URL, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const body = (await res.json().catch(() => null)) as {
      data?: OpenRouterModelEntry[];
      error?: { message?: string; code?: string };
    } | null;

    if (!res.ok) {
      throw classifyProviderHttpError("openrouter", res.status, body?.error?.message, body?.error?.code);
    }
    if (!body || !Array.isArray(body.data)) {
      throw new AiProviderError("PROVIDER_ERROR", "OpenRouter returned a malformed model list response.", 502);
    }

    const verifiedAt = new Date().toISOString();
    const results: RawProviderModel[] = [];

    for (const m of body.data) {
      if (typeof m?.id !== "string" || !m.id.trim()) continue;
      const inMods = m.architecture?.input_modalities ?? ["text"];
      const capabilities: ModelCapability[] = ["text"];
      if (inMods.includes("image")) capabilities.push("vision", "multimodal");
      if (inMods.includes("audio")) capabilities.push("audio");

      const inputPerMillion = parsePerMillion(m.pricing?.prompt);
      const outputPerMillion = parsePerMillion(m.pricing?.completion);

      results.push({
        id: m.id,
        name: m.name?.trim() || m.id,
        provider: "openrouter",
        contextWindow: typeof m.context_length === "number" && m.context_length > 0 ? m.context_length : null,
        capabilities,
        availability: "available",
        livePricing: {
          inputPerMillion,
          outputPerMillion,
          source: OPENROUTER_MODELS_URL,
          verifiedAt,
        },
      });
    }

    return results;
  },

  async complete(input: CompletionInput, fetchImpl: FetchLike): Promise<CompletionResult> {
    const res = await fetchWithTimeoutAndRetry(fetchImpl, OPENROUTER_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
        "HTTP-Referer": "https://justlakshmi.app",
        "X-Title": "JustLakshmi",
      },
      body: JSON.stringify({
        model: input.model,
        temperature: 0.3,
        max_tokens: Math.max(input.maxTokens, 256),
        messages: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: input.userPrompt },
        ],
      }),
    });

    const body = (await res.json().catch(() => null)) as { error?: { message?: string; code?: string } } | null;
    if (!res.ok) {
      throw classifyProviderHttpError("openrouter", res.status, body?.error?.message, body?.error?.code);
    }
    return { text: parseOpenAiCompatibleResponse("openrouter", body) };
  },
};
