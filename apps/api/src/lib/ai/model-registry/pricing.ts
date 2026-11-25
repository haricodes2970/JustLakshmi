import type { AiProviderId, ModelPricingTier } from "@justlakshmi/shared";
import type { LivePricingInput } from "./types.js";

export type VerifiedPricingEntry = {
  provider: AiProviderId;
  /** Exact model ID or prefix matcher (matched most-specific first). */
  match: string;
  matchType: "exact" | "prefix";
  pricingTier: ModelPricingTier;
  inputPricePerMillionTokens: number;
  outputPricePerMillionTokens: number;
  pricingSource: string;
  pricingVerifiedAt: string;
};

/**
 * Verified official pricing catalogue for providers whose `/models` endpoints
 * do not return per-token pricing metadata (OpenAI, Gemini, Groq).
 *
 * STRICT RULES:
 * - Never assume a model is free because it is open-source or has a developer free tier.
 * - OpenRouter models use live pricing returned directly by OpenRouter's API.
 * - Any model not matched here and without live pricing is classified as `"unknown"`.
 */
export const VERIFIED_PRICING_CATALOGUE: readonly VerifiedPricingEntry[] = [
  // OpenAI — https://openai.com/api/pricing/
  {
    provider: "openai",
    match: "gpt-4.1-nano",
    matchType: "prefix",
    pricingTier: "paid",
    inputPricePerMillionTokens: 0.1,
    outputPricePerMillionTokens: 0.4,
    pricingSource: "https://openai.com/api/pricing/",
    pricingVerifiedAt: "2026-11-25",
  },
  {
    provider: "openai",
    match: "gpt-4.1-mini",
    matchType: "prefix",
    pricingTier: "paid",
    inputPricePerMillionTokens: 0.4,
    outputPricePerMillionTokens: 1.6,
    pricingSource: "https://openai.com/api/pricing/",
    pricingVerifiedAt: "2026-11-25",
  },
  {
    provider: "openai",
    match: "gpt-4.1",
    matchType: "prefix",
    pricingTier: "paid",
    inputPricePerMillionTokens: 2.0,
    outputPricePerMillionTokens: 8.0,
    pricingSource: "https://openai.com/api/pricing/",
    pricingVerifiedAt: "2026-11-25",
  },
  {
    provider: "openai",
    match: "gpt-4o-mini",
    matchType: "prefix",
    pricingTier: "paid",
    inputPricePerMillionTokens: 0.15,
    outputPricePerMillionTokens: 0.6,
    pricingSource: "https://openai.com/api/pricing/",
    pricingVerifiedAt: "2026-11-25",
  },
  {
    provider: "openai",
    match: "gpt-4o",
    matchType: "prefix",
    pricingTier: "paid",
    inputPricePerMillionTokens: 2.5,
    outputPricePerMillionTokens: 10.0,
    pricingSource: "https://openai.com/api/pricing/",
    pricingVerifiedAt: "2026-11-25",
  },
  {
    provider: "openai",
    match: "o4-mini",
    matchType: "prefix",
    pricingTier: "paid",
    inputPricePerMillionTokens: 1.1,
    outputPricePerMillionTokens: 4.4,
    pricingSource: "https://openai.com/api/pricing/",
    pricingVerifiedAt: "2026-11-25",
  },
  {
    provider: "openai",
    match: "o3-mini",
    matchType: "prefix",
    pricingTier: "paid",
    inputPricePerMillionTokens: 1.1,
    outputPricePerMillionTokens: 4.4,
    pricingSource: "https://openai.com/api/pricing/",
    pricingVerifiedAt: "2026-11-25",
  },

  // Google Gemini (official paid API rates; AI Studio free tier depends on account/region so never classified as guaranteed free)
  // https://ai.google.dev/gemini-api/docs/pricing
  {
    provider: "gemini",
    match: "gemini-2.5-flash-lite",
    matchType: "prefix",
    pricingTier: "paid",
    inputPricePerMillionTokens: 0.1,
    outputPricePerMillionTokens: 0.4,
    pricingSource: "https://ai.google.dev/gemini-api/docs/pricing",
    pricingVerifiedAt: "2026-11-25",
  },
  {
    provider: "gemini",
    match: "gemini-2.5-flash",
    matchType: "prefix",
    pricingTier: "paid",
    inputPricePerMillionTokens: 0.3,
    outputPricePerMillionTokens: 2.5,
    pricingSource: "https://ai.google.dev/gemini-api/docs/pricing",
    pricingVerifiedAt: "2026-11-25",
  },
  {
    provider: "gemini",
    match: "gemini-2.5-pro",
    matchType: "prefix",
    pricingTier: "paid",
    inputPricePerMillionTokens: 1.25,
    outputPricePerMillionTokens: 10.0,
    pricingSource: "https://ai.google.dev/gemini-api/docs/pricing",
    pricingVerifiedAt: "2026-11-25",
  },
  {
    provider: "gemini",
    match: "gemini-2.0-flash-lite",
    matchType: "prefix",
    pricingTier: "paid",
    inputPricePerMillionTokens: 0.075,
    outputPricePerMillionTokens: 0.3,
    pricingSource: "https://ai.google.dev/gemini-api/docs/pricing",
    pricingVerifiedAt: "2026-11-25",
  },
  {
    provider: "gemini",
    match: "gemini-2.0-flash",
    matchType: "prefix",
    pricingTier: "paid",
    inputPricePerMillionTokens: 0.1,
    outputPricePerMillionTokens: 0.4,
    pricingSource: "https://ai.google.dev/gemini-api/docs/pricing",
    pricingVerifiedAt: "2026-11-25",
  },

  // Groq (official on-demand API pricing; developer free tier limits vary by account so never classified as guaranteed free)
  // https://groq.com/pricing/
  {
    provider: "groq",
    match: "llama-3.1-8b-instant",
    matchType: "exact",
    pricingTier: "paid",
    inputPricePerMillionTokens: 0.05,
    outputPricePerMillionTokens: 0.08,
    pricingSource: "https://groq.com/pricing/",
    pricingVerifiedAt: "2026-11-25",
  },
  {
    provider: "groq",
    match: "llama-3.3-70b-versatile",
    matchType: "exact",
    pricingTier: "paid",
    inputPricePerMillionTokens: 0.59,
    outputPricePerMillionTokens: 0.79,
    pricingSource: "https://groq.com/pricing/",
    pricingVerifiedAt: "2026-11-25",
  },
  {
    provider: "groq",
    match: "meta-llama/llama-4-scout-17b-16e-instruct",
    matchType: "exact",
    pricingTier: "paid",
    inputPricePerMillionTokens: 0.11,
    outputPricePerMillionTokens: 0.34,
    pricingSource: "https://groq.com/pricing/",
    pricingVerifiedAt: "2026-11-25",
  },
  {
    provider: "groq",
    match: "meta-llama/llama-4-maverick-17b-128e-instruct",
    matchType: "exact",
    pricingTier: "paid",
    inputPricePerMillionTokens: 0.2,
    outputPricePerMillionTokens: 0.6,
    pricingSource: "https://groq.com/pricing/",
    pricingVerifiedAt: "2026-11-25",
  },
  {
    provider: "groq",
    match: "qwen/qwen3-32b",
    matchType: "exact",
    pricingTier: "paid",
    inputPricePerMillionTokens: 0.29,
    outputPricePerMillionTokens: 0.59,
    pricingSource: "https://groq.com/pricing/",
    pricingVerifiedAt: "2026-11-25",
  },
  {
    provider: "groq",
    match: "openai/gpt-oss-20b",
    matchType: "exact",
    pricingTier: "paid",
    inputPricePerMillionTokens: 0.075,
    outputPricePerMillionTokens: 0.3,
    pricingSource: "https://groq.com/pricing/",
    pricingVerifiedAt: "2026-11-25",
  },
  {
    provider: "groq",
    match: "openai/gpt-oss-120b",
    matchType: "exact",
    pricingTier: "paid",
    inputPricePerMillionTokens: 0.15,
    outputPricePerMillionTokens: 0.6,
    pricingSource: "https://groq.com/pricing/",
    pricingVerifiedAt: "2026-11-25",
  },
];

export type ClassifiedPricing = {
  pricingTier: ModelPricingTier;
  inputPricePerMillionTokens: number | null;
  outputPricePerMillionTokens: number | null;
  pricingSource: string | null;
  pricingVerifiedAt: string | null;
};

function isValidPrice(val: number | null | undefined): val is number {
  return typeof val === "number" && Number.isFinite(val) && val >= 0;
}

/**
 * Classifies model pricing strictly:
 * - Free ONLY when verified live or catalogue pricing has BOTH input === 0 and output === 0.
 * - Paid when verified input > 0 or output > 0.
 * - Unknown whenever reliable pricing is missing, negative, or unverified.
 */
export function classifyModelPricing(
  provider: AiProviderId,
  modelId: string,
  livePricing?: LivePricingInput,
): ClassifiedPricing {
  if (livePricing) {
    const inp = livePricing.inputPerMillion;
    const out = livePricing.outputPerMillion;
    if (isValidPrice(inp) && isValidPrice(out)) {
      const tier: ModelPricingTier = inp === 0 && out === 0 ? "free" : "paid";
      return {
        pricingTier: tier,
        inputPricePerMillionTokens: Math.round(inp * 10000) / 10000,
        outputPricePerMillionTokens: Math.round(out * 10000) / 10000,
        pricingSource: livePricing.source,
        pricingVerifiedAt: livePricing.verifiedAt,
      };
    }
    return {
      pricingTier: "unknown",
      inputPricePerMillionTokens: null,
      outputPricePerMillionTokens: null,
      pricingSource: null,
      pricingVerifiedAt: null,
    };
  }

  const lowerId = modelId.toLowerCase();
  const candidates = VERIFIED_PRICING_CATALOGUE.filter((e) => e.provider === provider).filter((e) =>
    e.matchType === "exact" ? lowerId === e.match.toLowerCase() : lowerId.startsWith(e.match.toLowerCase()),
  );
  // Pick the most specific match (longest match string).
  const best = candidates.sort((a, b) => b.match.length - a.match.length)[0];
  if (!best) {
    return {
      pricingTier: "unknown",
      inputPricePerMillionTokens: null,
      outputPricePerMillionTokens: null,
      pricingSource: null,
      pricingVerifiedAt: null,
    };
  }

  return {
    pricingTier: best.pricingTier,
    inputPricePerMillionTokens: best.inputPricePerMillionTokens,
    outputPricePerMillionTokens: best.outputPricePerMillionTokens,
    pricingSource: best.pricingSource,
    pricingVerifiedAt: best.pricingVerifiedAt,
  };
}
