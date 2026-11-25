import { z } from "zod";

export const AiProviderIdSchema = z.enum(["openai", "gemini", "groq", "openrouter"]);
export type AiProviderId = z.infer<typeof AiProviderIdSchema>;

export const ModelPricingTierSchema = z.enum(["free", "paid", "unknown"]);
export type ModelPricingTier = z.infer<typeof ModelPricingTierSchema>;

export const ModelCapabilitySchema = z.enum([
  "text",
  "vision",
  "reasoning",
  "tools",
  "audio",
  "multimodal",
]);
export type ModelCapability = z.infer<typeof ModelCapabilitySchema>;

export const ModelAvailabilitySchema = z.enum(["available", "unavailable", "unknown"]);
export type ModelAvailability = z.infer<typeof ModelAvailabilitySchema>;

export const AiModelSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  provider: AiProviderIdSchema,
  pricingTier: ModelPricingTierSchema,
  inputPricePerMillionTokens: z.number().nonnegative().nullable(),
  outputPricePerMillionTokens: z.number().nonnegative().nullable(),
  contextWindow: z.number().int().positive().nullable(),
  capabilities: z.array(ModelCapabilitySchema),
  availability: ModelAvailabilitySchema,
  pricingSource: z.string().max(300).nullable(),
  pricingVerifiedAt: z.string().max(64).nullable(),
});
export type AiModel = z.infer<typeof AiModelSchema>;

export const AiDiscoverModelsRequestSchema = z.strictObject({
  provider: AiProviderIdSchema,
  apiKey: z.string().trim().min(8, "API key appears too short.").max(256, "API key exceeds maximum length."),
});
export type AiDiscoverModelsRequest = z.infer<typeof AiDiscoverModelsRequestSchema>;

export const AiDiscoverModelsResponseSchema = z.object({
  provider: AiProviderIdSchema,
  models: z.array(AiModelSchema),
  fetchedAt: z.iso.datetime(),
  cached: z.boolean(),
});
export type AiDiscoverModelsResponse = z.infer<typeof AiDiscoverModelsResponseSchema>;

export const AiProviderErrorCodeSchema = z.enum([
  "INVALID_KEY",
  "MODEL_UNAVAILABLE",
  "EMPTY_RESPONSE",
  "RATE_LIMITED",
  "PROVIDER_ERROR",
  "TIMEOUT",
]);
export type AiProviderErrorCode = z.infer<typeof AiProviderErrorCodeSchema>;

export const AiTestProviderRequestSchema = z.strictObject({
  provider: AiProviderIdSchema,
  apiKey: z.string().trim().min(8).max(256),
  model: z.string().trim().min(1, "An explicit model ID is required.").max(200),
});
export type AiTestProviderRequest = z.infer<typeof AiTestProviderRequestSchema>;

export const AiTestProviderResponseSchema = z.object({
  ok: z.boolean(),
  provider: AiProviderIdSchema,
  model: z.string(),
  latencyMs: z.number().nonnegative(),
  message: z.string(),
  errorCode: AiProviderErrorCodeSchema.optional(),
});
export type AiTestProviderResponse = z.infer<typeof AiTestProviderResponseSchema>;

export const AiContextRecordSchema = z.strictObject({
  kind: z.enum(["occurrence", "routine", "analytics", "journal"]),
  date: z.string().max(32),
  summary: z.string().max(600),
});
export type AiContextRecord = z.infer<typeof AiContextRecordSchema>;

export const AiChatRequestSchema = z.strictObject({
  provider: AiProviderIdSchema,
  apiKey: z.string().trim().min(8).max(256),
  model: z.string().trim().min(1, "An explicit model ID is required.").max(200),
  consentGranted: z.literal(true, {
    error: "Explicit user consent is required before sending records to an external AI provider.",
  }),
  includeJournalContext: z.boolean().default(false),
  message: z.string().trim().min(1).max(2000),
  contextRecords: z.array(AiContextRecordSchema).max(60).default([]),
  memories: z.array(z.string().max(500)).max(30).default([]),
});
export type AiChatRequest = z.infer<typeof AiChatRequestSchema>;

export const AiChatResponseSchema = z.object({
  answer: z.string(),
  provider: AiProviderIdSchema,
  model: z.string(),
  readOnlyEnforced: z.literal(true),
  groundedRecordCount: z.number().int().nonnegative(),
});
export type AiChatResponse = z.infer<typeof AiChatResponseSchema>;
