import type { ModelCapability } from "@justlakshmi/shared";
import { AiProviderError, type CompletionInput, type CompletionResult, type FetchLike, type ProviderAdapter, type RawProviderModel } from "../model-registry/types.js";
import { classifyProviderHttpError, fetchWithTimeoutAndRetry } from "./http.js";

const GEMINI_MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models";

type GeminiModelEntry = {
  name?: string;
  displayName?: string;
  inputTokenLimit?: number;
  supportedGenerationMethods?: string[];
};

export const geminiAdapter: ProviderAdapter = {
  id: "gemini",

  async listModels(apiKey: string, fetchImpl: FetchLike): Promise<RawProviderModel[]> {
    const res = await fetchWithTimeoutAndRetry(fetchImpl, GEMINI_MODELS_URL, {
      method: "GET",
      headers: { "x-goog-api-key": apiKey },
    });

    const body = (await res.json().catch(() => null)) as {
      models?: GeminiModelEntry[];
      error?: { message?: string; status?: string };
    } | null;

    if (!res.ok) {
      throw classifyProviderHttpError("gemini", res.status, body?.error?.message, body?.error?.status);
    }
    if (!body || !Array.isArray(body.models)) {
      throw new AiProviderError("PROVIDER_ERROR", "Gemini returned a malformed model list response.", 502);
    }

    const results: RawProviderModel[] = [];
    for (const m of body.models) {
      if (typeof m?.name !== "string") continue;
      if (!Array.isArray(m.supportedGenerationMethods) || !m.supportedGenerationMethods.includes("generateContent")) {
        continue;
      }
      const id = m.name.replace(/^models\//, "");
      if (!id || /embedding|aqa|imagen|veo/i.test(id)) continue;

      const capabilities: ModelCapability[] = ["text", "tools"];
      if (/gemini-(1\.5|2|2\.5)/i.test(id)) capabilities.push("vision", "multimodal");

      results.push({
        id,
        name: m.displayName?.trim() || id,
        provider: "gemini",
        contextWindow: typeof m.inputTokenLimit === "number" && m.inputTokenLimit > 0 ? m.inputTokenLimit : null,
        capabilities,
        availability: "available",
      });
    }
    return results;
  },

  async complete(input: CompletionInput, fetchImpl: FetchLike): Promise<CompletionResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent`;
    const res = await fetchWithTimeoutAndRetry(fetchImpl, url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": input.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: input.userPrompt }] }],
        generationConfig: { maxOutputTokens: input.maxTokens, temperature: 0.3 },
      }),
    });

    const body = (await res.json().catch(() => null)) as {
      candidates?: Array<{
        finishReason?: string;
        content?: { parts?: Array<{ text?: string }> };
      }>;
      error?: { message?: string; status?: string };
    } | null;

    if (!res.ok) {
      throw classifyProviderHttpError("gemini", res.status, body?.error?.message, body?.error?.status);
    }

    const candidate = body?.candidates?.[0];
    const text = (candidate?.content?.parts ?? [])
      .map((p) => (typeof p?.text === "string" ? p.text : ""))
      .join("")
      .trim();

    if (!text) {
      throw new AiProviderError(
        "EMPTY_RESPONSE",
        `Gemini returned an empty response (finishReason: ${candidate?.finishReason ?? "unknown"}).`,
        502,
      );
    }

    return { text };
  },
};
