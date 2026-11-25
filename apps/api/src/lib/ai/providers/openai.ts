import { AiProviderError, type CompletionInput, type CompletionResult, type FetchLike, type ProviderAdapter, type RawProviderModel } from "../model-registry/types.js";
import { classifyProviderHttpError, fetchWithTimeoutAndRetry, parseOpenAiCompatibleResponse } from "./http.js";

const OPENAI_MODELS_URL = "https://api.openai.com/v1/models";
const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

const NON_CHAT_PREFIXES = ["text-embedding-", "whisper-", "tts-", "dall-e-", "omni-moderation", "text-moderation", "babbage-", "davinci-"];

function isChatCapableOpenAiModel(id: string): boolean {
  const lower = id.toLowerCase();
  if (NON_CHAT_PREFIXES.some((p) => lower.startsWith(p))) return false;
  return /^(gpt-|o1|o3|o4|chatgpt-)/.test(lower);
}

export const openaiAdapter: ProviderAdapter = {
  id: "openai",

  async listModels(apiKey: string, fetchImpl: FetchLike): Promise<RawProviderModel[]> {
    const res = await fetchWithTimeoutAndRetry(fetchImpl, OPENAI_MODELS_URL, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const body = (await res.json().catch(() => null)) as {
      data?: Array<{ id?: string }>;
      error?: { message?: string; code?: string };
    } | null;

    if (!res.ok) {
      throw classifyProviderHttpError("openai", res.status, body?.error?.message, body?.error?.code);
    }
    if (!body || !Array.isArray(body.data)) {
      throw new AiProviderError("PROVIDER_ERROR", "OpenAI returned a malformed model list response.", 502);
    }

    return body.data
      .filter((m): m is { id: string } => typeof m?.id === "string" && isChatCapableOpenAiModel(m.id))
      .map((m) => ({
        id: m.id,
        name: m.id,
        provider: "openai",
        capabilities: ["text", "tools"],
        availability: "available",
      }));
  },

  async complete(input: CompletionInput, fetchImpl: FetchLike): Promise<CompletionResult> {
    const isReasoning = /^(o1|o3|o4)/.test(input.model.toLowerCase());
    const payload: Record<string, unknown> = {
      model: input.model,
      messages: [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: input.userPrompt },
      ],
    };
    if (isReasoning) {
      payload.max_completion_tokens = Math.max(input.maxTokens, 512);
    } else {
      payload.max_completion_tokens = input.maxTokens;
      payload.temperature = 0.3;
    }

    const res = await fetchWithTimeoutAndRetry(fetchImpl, OPENAI_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const body = (await res.json().catch(() => null)) as { error?: { message?: string; code?: string } } | null;
    if (!res.ok) {
      throw classifyProviderHttpError("openai", res.status, body?.error?.message, body?.error?.code);
    }
    return { text: parseOpenAiCompatibleResponse("openai", body) };
  },
};
