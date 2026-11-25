import type { AiModel, AiProviderErrorCode, AiProviderId, ModelAvailability, ModelCapability } from "@justlakshmi/shared";

export type FetchLike = typeof fetch;

export type LivePricingInput = {
  /** USD per 1M input tokens (already converted from per-token if needed). */
  inputPerMillion: number | null;
  /** USD per 1M output tokens. */
  outputPerMillion: number | null;
  source: string;
  verifiedAt: string;
};

export type RawProviderModel = {
  id: string;
  name?: string;
  provider: AiProviderId;
  contextWindow?: number | null;
  capabilities?: ModelCapability[];
  availability?: ModelAvailability;
  livePricing?: LivePricingInput;
};

export type CompletionInput = {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
};

export type CompletionResult = {
  text: string;
};

export class AiProviderError extends Error {
  readonly code: AiProviderErrorCode;
  readonly httpStatus: number;
  readonly retryable: boolean;

  constructor(code: AiProviderErrorCode, message: string, httpStatus = 502, retryable = false) {
    super(message);
    this.name = "AiProviderError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
  }
}

export interface ProviderAdapter {
  readonly id: AiProviderId;
  listModels(apiKey: string, fetchImpl: FetchLike): Promise<RawProviderModel[]>;
  complete(input: CompletionInput, fetchImpl: FetchLike): Promise<CompletionResult>;
}

export type NormalizedCatalogue = {
  provider: AiProviderId;
  models: AiModel[];
  fetchedAt: string;
  cached: boolean;
};
