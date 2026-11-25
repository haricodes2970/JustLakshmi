import { createHash } from "node:crypto";
import type { AiProviderId } from "@justlakshmi/shared";
import { geminiAdapter } from "../providers/gemini.js";
import { groqAdapter } from "../providers/groq.js";
import { openaiAdapter } from "../providers/openai.js";
import { openrouterAdapter } from "../providers/openrouter.js";
import { normalizeAndSortModels } from "./normalizer.js";
import type { FetchLike, NormalizedCatalogue, ProviderAdapter } from "./types.js";

const ADAPTERS: Record<AiProviderId, ProviderAdapter> = {
  openai: openaiAdapter,
  gemini: geminiAdapter,
  groq: groqAdapter,
  openrouter: openrouterAdapter,
};

export function getProviderAdapter(provider: AiProviderId): ProviderAdapter {
  return ADAPTERS[provider];
}

type CacheEntry = {
  catalogue: Omit<NormalizedCatalogue, "cached">;
  expiresAtMs: number;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 64;

/**
 * Short-lived, per-key-hash in-memory model catalogue cache + in-flight deduplicator.
 * - Never stores raw user API keys (keys are hashed with SHA-256).
 * - Never mixes account entitlements across different API keys.
 * - Prevents duplicate concurrent provider discovery requests.
 */
export function createModelRegistry(fetchImpl: FetchLike = fetch) {
  const cache = new Map<string, CacheEntry>();
  const inflight = new Map<string, Promise<Omit<NormalizedCatalogue, "cached">>>();

  function cacheKey(provider: AiProviderId, apiKey: string): string {
    const hash = createHash("sha256").update(`${provider}:${apiKey}`).digest("hex");
    return `${provider}:${hash}`;
  }

  return {
    async discover(provider: AiProviderId, apiKey: string): Promise<NormalizedCatalogue> {
      const key = cacheKey(provider, apiKey);
      const now = Date.now();
      const hit = cache.get(key);
      if (hit && hit.expiresAtMs > now) {
        return { ...hit.catalogue, cached: true };
      }

      const existing = inflight.get(key);
      if (existing) {
        const res = await existing;
        return { ...res, cached: false };
      }

      const adapter = getProviderAdapter(provider);
      const task = (async () => {
        const rawModels = await adapter.listModels(apiKey, fetchImpl);
        const models = normalizeAndSortModels(rawModels);
        const catalogue: Omit<NormalizedCatalogue, "cached"> = {
          provider,
          models,
          fetchedAt: new Date().toISOString(),
        };
        if (cache.size >= MAX_CACHE_ENTRIES) {
          const oldest = cache.keys().next().value;
          if (oldest) cache.delete(oldest);
        }
        cache.set(key, { catalogue, expiresAtMs: Date.now() + CACHE_TTL_MS });
        return catalogue;
      })();

      inflight.set(key, task);
      try {
        const catalogue = await task;
        return { ...catalogue, cached: false };
      } finally {
        inflight.delete(key);
      }
    },
  };
}
