import type { AiProviderId } from "@justlakshmi/shared";
import { AiProviderError, type FetchLike } from "../model-registry/types.js";

const DEFAULT_TIMEOUT_MS = 18_000;

export async function fetchWithTimeoutAndRetry(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  options?: { timeoutMs?: number; maxRetries?: number },
): Promise<Response> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options?.maxRetries ?? 1;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (err instanceof Error && err.name === "AbortError") {
        if (attempt < maxRetries) continue;
        throw new AiProviderError("TIMEOUT", "Provider request timed out. Please try again.", 504, true);
      }
      if (attempt >= maxRetries) {
        throw new AiProviderError(
          "PROVIDER_ERROR",
          err instanceof Error ? err.message : "Network error while contacting AI provider.",
          502,
          true,
        );
      }
    }
  }
  throw new AiProviderError(
    "PROVIDER_ERROR",
    lastError instanceof Error ? lastError.message : "Provider request failed.",
    502,
  );
}

/** Classifies provider HTTP error responses into safe, actionable AiProviderError codes. */
export function classifyProviderHttpError(
  provider: AiProviderId,
  status: number,
  providerMessage?: string,
  providerCode?: string,
): AiProviderError {
  const detail = providerMessage?.trim();
  const combined = `${providerCode ?? ""} ${detail ?? ""}`.toLowerCase();

  if (status === 401 || status === 403 || /invalid[_ ]api[_ ]key|unauthorized|incorrect api key|authentication/.test(combined)) {
    return new AiProviderError(
      "INVALID_KEY",
      detail ? `${provider} rejected the API key: ${detail}` : `${provider} rejected the API key.`,
      401,
    );
  }
  if (
    status === 404 ||
    /model[_ ]not[_ ]found|decommissioned|does not exist|not supported|unavailable|deprecated/.test(combined)
  ) {
    return new AiProviderError(
      "MODEL_UNAVAILABLE",
      detail ? `Model unavailable on ${provider}: ${detail}` : `Selected model is unavailable on ${provider}.`,
      400,
    );
  }
  if (status === 429 || /rate[_ ]limit|quota|too many requests|insufficient_quota/.test(combined)) {
    return new AiProviderError(
      "RATE_LIMITED",
      detail ? `${provider} rate limit or quota reached: ${detail}` : `${provider} rate limit reached. Try again shortly.`,
      429,
      true,
    );
  }
  return new AiProviderError(
    "PROVIDER_ERROR",
    detail ? `${provider} error (${status}): ${detail}` : `${provider} returned HTTP ${status}.`,
    status >= 500 ? 502 : 400,
    status >= 500,
  );
}

type OpenAiChatChoice = {
  finish_reason?: string | null;
  message?: {
    content?: string | Array<{ type?: string; text?: string }> | null;
    refusal?: string | null;
    reasoning?: string | null;
    reasoning_content?: string | null;
  };
};

type OpenAiChatResponse = {
  choices?: OpenAiChatChoice[];
  error?: { message?: string; code?: string; type?: string };
};

/**
 * Extracts text cleanly from OpenAI-compatible chat completion responses (OpenAI, Groq, OpenRouter).
 * Fixes the Groq empty-response bug by:
 * - Handling array content parts as well as string content
 * - Detecting `finish_reason: "length"` when reasoning tokens exhausted the budget
 * - Surfacing explicit refusals and missing choices with actionable error codes
 */
export function parseOpenAiCompatibleResponse(provider: AiProviderId, body: unknown): string {
  const parsed = body as OpenAiChatResponse | null;
  const choice = parsed?.choices?.[0];
  if (!choice || !choice.message) {
    throw new AiProviderError(
      "EMPTY_RESPONSE",
      `${provider} returned no completion choices. The model may be unavailable or overloaded.`,
      502,
    );
  }

  const msg = choice.message;
  let text = "";
  if (typeof msg.content === "string") {
    text = msg.content.trim();
  } else if (Array.isArray(msg.content)) {
    text = msg.content
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("")
      .trim();
  }

  if (text.length > 0) {
    return text;
  }

  if (typeof msg.refusal === "string" && msg.refusal.trim().length > 0) {
    throw new AiProviderError("EMPTY_RESPONSE", `${provider} refused the request: ${msg.refusal.trim()}`, 400);
  }

  const hadReasoning =
    (typeof msg.reasoning === "string" && msg.reasoning.trim().length > 0) ||
    (typeof msg.reasoning_content === "string" && msg.reasoning_content.trim().length > 0);

  if (choice.finish_reason === "length" && hadReasoning) {
    throw new AiProviderError(
      "EMPTY_RESPONSE",
      `${provider} exhausted its token limit during reasoning before producing final text. Retry or select a non-reasoning model.`,
      502,
    );
  }

  if (choice.finish_reason === "content_filter") {
    throw new AiProviderError("EMPTY_RESPONSE", `${provider} filtered the response content.`, 400);
  }

  throw new AiProviderError(
    "EMPTY_RESPONSE",
    `${provider} returned an empty response (finish_reason: ${choice.finish_reason ?? "unknown"}).`,
    502,
  );
}
