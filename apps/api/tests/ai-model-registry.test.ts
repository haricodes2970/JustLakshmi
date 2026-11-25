import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import {
  AiDiscoverModelsResponseSchema,
  AiTestProviderResponseSchema,
  ApiErrorResponseSchema,
} from "@justlakshmi/shared";
import { buildApp } from "../src/app.js";
import { classifyModelPricing } from "../src/lib/ai/model-registry/pricing.js";
import { createAiProviderService } from "../src/lib/ai/providers.js";
import { makeTestEnv, makeTestVerifier, VALID_TEST_TOKEN } from "./helpers.js";

describe("Dynamic AI Model Registry, Pricing Classification & Groq Empty-Response Regression", () => {
  let app: FastifyInstance;
  let lastGroqRequestBody: Record<string, unknown> | null = null;
  let modelFetchCount = 0;

  before(async () => {
    const mockFetch: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization ?? "";
      const googKey = (init?.headers as Record<string, string> | undefined)?.["x-goog-api-key"] ?? "";

      if (auth.includes("invalid-key") || googKey.includes("invalid-key")) {
        return new Response(JSON.stringify({ error: { message: "Invalid API key" } }), { status: 401 });
      }
      if (auth.includes("timeout-key")) {
        const err = new Error("Aborted");
        err.name = "AbortError";
        throw err;
      }

      // OpenAI models
      if (url === "https://api.openai.com/v1/models") {
        modelFetchCount += 1;
        return new Response(
          JSON.stringify({
            data: [{ id: "gpt-4o-mini" }, { id: "gpt-custom-unlisted" }, { id: "text-embedding-3-small" }],
          }),
          { status: 200 },
        );
      }

      // Gemini models
      if (url === "https://generativelanguage.googleapis.com/v1beta/models") {
        return new Response(
          JSON.stringify({
            models: [
              {
                name: "models/gemini-2.5-flash",
                displayName: "Gemini 2.5 Flash",
                inputTokenLimit: 1048576,
                supportedGenerationMethods: ["generateContent"],
              },
              {
                name: "models/text-embedding-004",
                displayName: "Embedding",
                supportedGenerationMethods: ["embedContent"],
              },
            ],
          }),
          { status: 200 },
        );
      }

      // Groq models
      if (url === "https://api.groq.com/openai/v1/models") {
        if (auth.includes("malformed-key")) {
          return new Response(JSON.stringify({ unexpected: true }), { status: 200 });
        }
        if (auth.includes("empty-key")) {
          return new Response(JSON.stringify({ data: [] }), { status: 200 });
        }
        return new Response(
          JSON.stringify({
            data: [
              { id: "llama-3.3-70b-versatile", active: true, context_window: 128000 },
              { id: "openai/gpt-oss-120b", active: true, context_window: 131072 },
              { id: "whisper-large-v3", active: true },
            ],
          }),
          { status: 200 },
        );
      }

      // OpenRouter auth + models
      if (url === "https://openrouter.ai/api/v1/auth/key") {
        return new Response(JSON.stringify({ data: { label: "ok" } }), { status: 200 });
      }
      if (url === "https://openrouter.ai/api/v1/models") {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "meta-llama/llama-3.3-70b-instruct:free",
                name: "Llama 3.3 70B (Free)",
                context_length: 131072,
                pricing: { prompt: "0", completion: "0" },
              },
              {
                id: "openai/gpt-4o-mini",
                name: "OpenAI GPT-4o Mini",
                context_length: 128000,
                pricing: { prompt: "0.00000015", completion: "0.0000006" },
              },
              {
                id: "openrouter/auto",
                name: "Auto Router",
                context_length: 128000,
                pricing: { prompt: "-1", completion: "-1" },
              },
            ],
          }),
          { status: 200 },
        );
      }

      // Groq chat completions (regression tests for empty response, array parts, 404, 429, 500)
      if (url === "https://api.groq.com/openai/v1/chat/completions") {
        const parsed = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        lastGroqRequestBody = parsed;
        const model = String(parsed.model ?? "");

        if (model === "decommissioned-model") {
          return new Response(
            JSON.stringify({ error: { message: "The model has been decommissioned", code: "model_decommissioned" } }),
            { status: 400 },
          );
        }
        if (model === "rate-limited-model") {
          return new Response(JSON.stringify({ error: { message: "Rate limit exceeded" } }), { status: 429 });
        }
        if (model === "server-error-model") {
          return new Response(JSON.stringify({ error: { message: "Internal error" } }), { status: 500 });
        }
        if (model === "reasoning-exhausted-model") {
          return new Response(
            JSON.stringify({
              choices: [
                {
                  finish_reason: "length",
                  message: { content: "", reasoning_content: "thinking about OK..." },
                },
              ],
            }),
            { status: 200 },
          );
        }
        if (model === "array-parts-model") {
          return new Response(
            JSON.stringify({
              choices: [
                {
                  finish_reason: "stop",
                  message: { content: [{ type: "text", text: "OK" }] },
                },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "OK" } }] }),
          { status: 200 },
        );
      }

      return new Response("Not found", { status: 404 });
    };

    app = await buildApp({
      env: makeTestEnv(),
      tokenVerifier: makeTestVerifier(),
      aiService: createAiProviderService(mockFetch),
      logger: false,
    });
  });

  after(async () => {
    await app.close();
  });

  it("classifies pricing strictly: free only when verified $0, paid when > 0, unknown otherwise", () => {
    const free = classifyModelPricing("openrouter", "m:free", {
      inputPerMillion: 0,
      outputPerMillion: 0,
      source: "https://openrouter.ai/api/v1/models",
      verifiedAt: "2026-11-25",
    });
    assert.equal(free.pricingTier, "free");

    const paid = classifyModelPricing("openai", "gpt-4o-mini");
    assert.equal(paid.pricingTier, "paid");
    assert.equal(paid.inputPricePerMillionTokens, 0.15);

    const unknownMissing = classifyModelPricing("openai", "brand-new-unlisted-model");
    assert.equal(unknownMissing.pricingTier, "unknown");
    assert.equal(unknownMissing.inputPricePerMillionTokens, null);

    const unknownNegative = classifyModelPricing("openrouter", "openrouter/auto", {
      inputPerMillion: -1,
      outputPerMillion: -1,
      source: "https://openrouter.ai/api/v1/models",
      verifiedAt: "2026-11-25",
    });
    assert.equal(unknownNegative.pricingTier, "unknown");
  });

  it("discovers and normalizes models for OpenAI, Gemini, Groq, and OpenRouter (with caching)", async () => {
    // OpenAI + cache check
    const openai1 = await app.inject({
      method: "POST",
      url: "/api/v1/ai/models",
      headers: { authorization: `Bearer ${VALID_TEST_TOKEN}` },
      payload: { provider: "openai", apiKey: "sk-valid-openai-key" },
    });
    assert.equal(openai1.statusCode, 200);
    const openaiBody1 = AiDiscoverModelsResponseSchema.parse(openai1.json());
    assert.equal(openaiBody1.cached, false);
    assert.equal(openaiBody1.models.length, 2); // embedding filtered out
    assert.equal(openaiBody1.models.find((m) => m.id === "gpt-4o-mini")?.pricingTier, "paid");
    assert.equal(openaiBody1.models.find((m) => m.id === "gpt-custom-unlisted")?.pricingTier, "unknown");

    const openai2 = await app.inject({
      method: "POST",
      url: "/api/v1/ai/models",
      headers: { authorization: `Bearer ${VALID_TEST_TOKEN}` },
      payload: { provider: "openai", apiKey: "sk-valid-openai-key" },
    });
    assert.equal(AiDiscoverModelsResponseSchema.parse(openai2.json()).cached, true);
    assert.equal(modelFetchCount, 1);

    // Gemini
    const gemini = await app.inject({
      method: "POST",
      url: "/api/v1/ai/models",
      headers: { authorization: `Bearer ${VALID_TEST_TOKEN}` },
      payload: { provider: "gemini", apiKey: "AIzaSyValidGeminiKey" },
    });
    assert.equal(gemini.statusCode, 200);
    const geminiBody = AiDiscoverModelsResponseSchema.parse(gemini.json());
    assert.equal(geminiBody.models.length, 1);
    assert.equal(geminiBody.models[0]?.id, "gemini-2.5-flash");
    assert.equal(geminiBody.models[0]?.pricingTier, "paid");

    // Groq
    const groq = await app.inject({
      method: "POST",
      url: "/api/v1/ai/models",
      headers: { authorization: `Bearer ${VALID_TEST_TOKEN}` },
      payload: { provider: "groq", apiKey: "gsk_valid_groq_key" },
    });
    assert.equal(groq.statusCode, 200);
    const groqBody = AiDiscoverModelsResponseSchema.parse(groq.json());
    assert.equal(groqBody.models.length, 2); // whisper filtered out
    assert.equal(groqBody.models.some((m) => m.id === "openai/gpt-oss-120b" && m.capabilities.includes("reasoning")), true);

    // OpenRouter (free, paid, unknown all classified accurately)
    const or = await app.inject({
      method: "POST",
      url: "/api/v1/ai/models",
      headers: { authorization: `Bearer ${VALID_TEST_TOKEN}` },
      payload: { provider: "openrouter", apiKey: "sk-or-valid-key" },
    });
    assert.equal(or.statusCode, 200);
    const orBody = AiDiscoverModelsResponseSchema.parse(or.json());
    assert.equal(orBody.models.find((m) => m.id.endsWith(":free"))?.pricingTier, "free");
    assert.equal(orBody.models.find((m) => m.id === "openai/gpt-4o-mini")?.pricingTier, "paid");
    assert.equal(orBody.models.find((m) => m.id === "openrouter/auto")?.pricingTier, "unknown");
  });

  it("handles unauthenticated requests, invalid keys, malformed/empty catalogues, timeouts, and unknown fields", async () => {
    const unauth = await app.inject({
      method: "POST",
      url: "/api/v1/ai/models",
      payload: { provider: "groq", apiKey: "gsk_valid_groq_key" },
    });
    assert.equal(unauth.statusCode, 401);

    const invalidKey = await app.inject({
      method: "POST",
      url: "/api/v1/ai/models",
      headers: { authorization: `Bearer ${VALID_TEST_TOKEN}` },
      payload: { provider: "openrouter", apiKey: "invalid-key-12345" },
    });
    assert.equal(invalidKey.statusCode, 401);

    const malformed = await app.inject({
      method: "POST",
      url: "/api/v1/ai/models",
      headers: { authorization: `Bearer ${VALID_TEST_TOKEN}` },
      payload: { provider: "groq", apiKey: "malformed-key-12345" },
    });
    assert.equal(malformed.statusCode, 502);

    const empty = await app.inject({
      method: "POST",
      url: "/api/v1/ai/models",
      headers: { authorization: `Bearer ${VALID_TEST_TOKEN}` },
      payload: { provider: "groq", apiKey: "empty-key-12345" },
    });
    assert.equal(empty.statusCode, 200);
    assert.equal(AiDiscoverModelsResponseSchema.parse(empty.json()).models.length, 0);

    const timeout = await app.inject({
      method: "POST",
      url: "/api/v1/ai/models",
      headers: { authorization: `Bearer ${VALID_TEST_TOKEN}` },
      payload: { provider: "groq", apiKey: "timeout-key-12345" },
    });
    assert.equal(timeout.statusCode, 504);

    const unknownField = await app.inject({
      method: "POST",
      url: "/api/v1/ai/models",
      headers: { authorization: `Bearer ${VALID_TEST_TOKEN}` },
      payload: { provider: "groq", apiKey: "gsk_valid_key", customUrl: "https://evil.example" },
    });
    assert.equal(unknownField.statusCode, 400);
    assert.equal(ApiErrorResponseSchema.parse(unknownField.json()).error.code, "VALIDATION_ERROR");
  });

  it("fixes Groq empty-response bug and distinguishes all connection test failure modes", async () => {
    // Generous max_completion_tokens + array content parts parsed cleanly
    const arrayOk = await app.inject({
      method: "POST",
      url: "/api/v1/ai/test-provider",
      headers: { authorization: `Bearer ${VALID_TEST_TOKEN}` },
      payload: { provider: "groq", apiKey: "gsk_valid_key", model: "array-parts-model" },
    });
    assert.equal(arrayOk.statusCode, 200);
    assert.equal(AiTestProviderResponseSchema.parse(arrayOk.json()).ok, true);
    assert.ok(Number(lastGroqRequestBody?.max_completion_tokens) >= 256);

    // Reasoning token exhaustion surfaces actionable EMPTY_RESPONSE instead of opaque error
    const exhausted = await app.inject({
      method: "POST",
      url: "/api/v1/ai/test-provider",
      headers: { authorization: `Bearer ${VALID_TEST_TOKEN}` },
      payload: { provider: "groq", apiKey: "gsk_valid_key", model: "reasoning-exhausted-model" },
    });
    const exBody = AiTestProviderResponseSchema.parse(exhausted.json());
    assert.equal(exBody.ok, false);
    assert.equal(exBody.errorCode, "EMPTY_RESPONSE");
    assert.match(exBody.message, /reasoning/i);

    // Decommissioned / unavailable model
    const decomm = await app.inject({
      method: "POST",
      url: "/api/v1/ai/test-provider",
      headers: { authorization: `Bearer ${VALID_TEST_TOKEN}` },
      payload: { provider: "groq", apiKey: "gsk_valid_key", model: "decommissioned-model" },
    });
    const decommBody = AiTestProviderResponseSchema.parse(decomm.json());
    assert.equal(decommBody.ok, false);
    assert.equal(decommBody.errorCode, "MODEL_UNAVAILABLE");

    // Rate limited
    const rateLim = await app.inject({
      method: "POST",
      url: "/api/v1/ai/test-provider",
      headers: { authorization: `Bearer ${VALID_TEST_TOKEN}` },
      payload: { provider: "groq", apiKey: "gsk_valid_key", model: "rate-limited-model" },
    });
    assert.equal(AiTestProviderResponseSchema.parse(rateLim.json()).errorCode, "RATE_LIMITED");

    // Provider 500
    const srvErr = await app.inject({
      method: "POST",
      url: "/api/v1/ai/test-provider",
      headers: { authorization: `Bearer ${VALID_TEST_TOKEN}` },
      payload: { provider: "groq", apiKey: "gsk_valid_key", model: "server-error-model" },
    });
    assert.equal(AiTestProviderResponseSchema.parse(srvErr.json()).errorCode, "PROVIDER_ERROR");

    // Missing explicit model ID rejected (no hidden default fallback)
    const noModel = await app.inject({
      method: "POST",
      url: "/api/v1/ai/test-provider",
      headers: { authorization: `Bearer ${VALID_TEST_TOKEN}` },
      payload: { provider: "groq", apiKey: "gsk_valid_key" },
    });
    assert.equal(noModel.statusCode, 400);
  });
});
