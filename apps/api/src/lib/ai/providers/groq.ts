import { AiProviderError, type CompletionInput, type CompletionResult, type FetchLike, type ProviderAdapter, type RawProviderModel } from "../model-registry/types.js";
import { classifyProviderHttpError, fetchWithTimeoutAndRetry, parseOpenAiCompatibleResponse } from "./http.js";

const GROQ_MODELS_URL = "https://api.groq.com/openai/v1/models";
const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

type GroqModelEntry = {
  id?: string;
  active?: boolean;
  context_window?: number;
};

function isNonChatGroqModel(id: string): boolean {
  return /(whisper|playai-tts|distil-whisper|prompt-guard|llama-guard)/i.test(id);
}

export const groqAdapter: ProviderAdapter = {
  id: "groq",

  async listModels(apiKey: string, fetchImpl: FetchLike): Promise<RawProviderModel[]> {
    const res = await fetchWithTimeoutAndRetry(fetchImpl, GROQ_MODELS_URL, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const body = (await res.json().catch(() => null)) as {
      data?: GroqModelEntry[];
      error?: { message?: string; code?: string };
    } | null;

    if (!res.ok) {
      throw classifyProviderHttpError("groq", res.status, body?.error?.message, body?.error?.code);
    }
    if (!body || !Array.isArray(body.data)) {
      throw new AiProviderError("PROVIDER_ERROR", "Groq returned a malformed model list response.", 502);
    }

    return body.data
      .filter((m): m is GroqModelEntry & { id: string } => typeof m?.id === "string" && !isNonChatGroqModel(m.id))
      .map((m) => ({
        id: m.id,
        name: m.id,
        provider: "groq",
        contextWindow: typeof m.context_window === "number" && m.context_window > 0 ? m.context_window : null,
        capabilities: ["text", "tools"],
        availability: m.active === false ? "unavailable" : "available",
      }));
  },

  async complete(input: CompletionInput, fetchImpl: FetchLike): Promise<CompletionResult> {
    // Use generous max_completion_tokens so Groq reasoning models (e.g. gpt-oss / qwen3)
    // do not exhaust the entire budget in internal reasoning before emitting content.
    const maxCompletionTokens = Math.max(input.maxTokens, 256);

    const res = await fetchWithTimeoutAndRetry(fetchImpl, GROQ_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        temperature: 0.3,
        max_completion_tokens: maxCompletionTokens,
        messages: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: input.userPrompt },
        ],
      }),
    });

    const body = (await res.json().catch(() => null)) as { error?: { message?: string; code?: string } } | null;
    if (!res.ok) {
      throw classifyProviderHttpError("groq", res.status, body?.error?.message, body?.error?.code);
    }
    return { text: parseOpenAiCompatibleResponse("groq", body) };
  },
};
