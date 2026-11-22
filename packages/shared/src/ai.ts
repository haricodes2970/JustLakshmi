import { z } from "zod";

export const AiProviderIdSchema = z.enum(["openai", "gemini", "groq", "openrouter"]);
export type AiProviderId = z.infer<typeof AiProviderIdSchema>;

export const AI_DEFAULT_MODELS: Record<AiProviderId, string> = {
  openai: "gpt-4o-mini",
  gemini: "gemini-2.0-flash",
  groq: "llama-3.3-70b-versatile",
  openrouter: "openai/gpt-4o-mini",
};

export const AiTestProviderRequestSchema = z.strictObject({
  provider: AiProviderIdSchema,
  apiKey: z.string().trim().min(8).max(256),
  model: z.string().trim().min(1).max(128).optional(),
});
export type AiTestProviderRequest = z.infer<typeof AiTestProviderRequestSchema>;

export const AiTestProviderResponseSchema = z.object({
  ok: z.boolean(),
  provider: AiProviderIdSchema,
  model: z.string(),
  latencyMs: z.number().nonnegative(),
  message: z.string(),
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
  model: z.string().trim().min(1).max(128).optional(),
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
