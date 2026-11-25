import { AiModelSchema, type AiModel, type ModelCapability } from "@justlakshmi/shared";
import { classifyModelPricing } from "./pricing.js";
import type { RawProviderModel } from "./types.js";

function inferCapabilities(raw: RawProviderModel): ModelCapability[] {
  const caps = new Set<ModelCapability>(raw.capabilities ?? ["text"]);
  const id = raw.id.toLowerCase();
  if (/(^|[-/])(o1|o3|o4|r1|qwq|reason|thinking|gpt-oss)/.test(id)) caps.add("reasoning");
  if (/(vision|4o|4\.1|gemini-2|scout|maverick)/.test(id)) caps.add("vision");
  if (caps.has("vision") && caps.has("text")) caps.add("multimodal");
  if (/(whisper|tts|audio)/.test(id)) caps.add("audio");
  return Array.from(caps);
}

const TIER_ORDER = { free: 0, paid: 1, unknown: 2 } as const;
const AVAIL_ORDER = { available: 0, unknown: 1, unavailable: 2 } as const;

export function normalizeProviderModel(raw: RawProviderModel): AiModel {
  const pricing = classifyModelPricing(raw.provider, raw.id, raw.livePricing);
  const contextWindow =
    typeof raw.contextWindow === "number" && Number.isInteger(raw.contextWindow) && raw.contextWindow > 0
      ? raw.contextWindow
      : null;

  return AiModelSchema.parse({
    id: raw.id.trim(),
    name: (raw.name?.trim() || raw.id.trim()).slice(0, 200),
    provider: raw.provider,
    pricingTier: pricing.pricingTier,
    inputPricePerMillionTokens: pricing.inputPricePerMillionTokens,
    outputPricePerMillionTokens: pricing.outputPricePerMillionTokens,
    contextWindow,
    capabilities: inferCapabilities(raw),
    availability: raw.availability ?? "available",
    pricingSource: pricing.pricingSource,
    pricingVerifiedAt: pricing.pricingVerifiedAt,
  });
}

export function normalizeAndSortModels(rawModels: readonly RawProviderModel[]): AiModel[] {
  const seen = new Set<string>();
  const normalized: AiModel[] = [];

  for (const raw of rawModels) {
    if (!raw.id || typeof raw.id !== "string" || !raw.id.trim()) continue;
    const key = `${raw.provider}:${raw.id.trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(normalizeProviderModel(raw));
  }

  return normalized.sort(
    (a, b) =>
      AVAIL_ORDER[a.availability] - AVAIL_ORDER[b.availability] ||
      TIER_ORDER[a.pricingTier] - TIER_ORDER[b.pricingTier] ||
      a.name.localeCompare(b.name),
  );
}
