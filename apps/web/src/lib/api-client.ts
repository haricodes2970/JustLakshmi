import {
  API_PREFIX,
  AiChatRequestSchema,
  AiChatResponseSchema,
  AiDiscoverModelsRequestSchema,
  AiDiscoverModelsResponseSchema,
  AiTestProviderRequestSchema,
  AiTestProviderResponseSchema,
  ApiErrorResponseSchema,
  ApiV1StatusResponseSchema,
  AuthMeResponseSchema,
  DriveConnectionMetadataSchema,
  DriveConnectionValidationResponseSchema,
  HealthResponseSchema,
  NotificationJobResponseSchema,
  PushSubscriptionInputSchema,
  ScheduleNotificationJobRequestSchema,
  UpdateDriveConnectionRequestSchema,
  type AiChatRequest,
  type AiChatResponse,
  type AiDiscoverModelsRequest,
  type AiDiscoverModelsResponse,
  type AiTestProviderRequest,
  type AiTestProviderResponse,
  type ApiErrorCode,
  type ApiErrorDetail,
  type ApiV1StatusResponse,
  type AuthMeResponse,
  type DriveConnectionMetadata,
  type DriveConnectionValidationResponse,
  type HealthResponse,
  type NotificationJobResponse,
  type PushSubscriptionInput,
  type ScheduleNotificationJobRequest,
  type UpdateDriveConnectionRequest,
} from "@justlakshmi/shared";
import { z } from "zod";

type Parseable<T> = { parse: (input: unknown) => T };

export class ApiClientError extends Error {
  readonly code: ApiErrorCode | "NETWORK_ERROR" | "NOT_CONFIGURED";
  readonly status: number;
  readonly requestId?: string;
  readonly details?: ApiErrorDetail[];

  constructor(params: {
    code: ApiErrorCode | "NETWORK_ERROR" | "NOT_CONFIGURED";
    status: number;
    message: string;
    requestId?: string;
    details?: ApiErrorDetail[];
  }) {
    super(params.message);
    this.name = "ApiClientError";
    this.code = params.code;
    this.status = params.status;
    this.requestId = params.requestId;
    this.details = params.details;
  }
}

/**
 * Returns the configured backend API base URL without trailing slash, or null
 * when `NEXT_PUBLIC_API_BASE_URL` is not set. Never hardcodes localhost or prod URLs.
 */
export function getApiBaseUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

export function isApiConfigured(): boolean {
  return getApiBaseUrl() !== null;
}

export type ApiRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  accessToken?: string;
  body?: unknown;
  signal?: AbortSignal;
};

export async function apiRequest<T>(
  path: string,
  responseSchema: Parseable<T>,
  options: ApiRequestOptions = {},
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    throw new ApiClientError({
      code: "NOT_CONFIGURED",
      status: 0,
      message: "API base URL is not configured (NEXT_PUBLIC_API_BASE_URL).",
    });
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`;
  }
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch {
    throw new ApiClientError({
      code: "NETWORK_ERROR",
      status: 0,
      message: "Unable to reach the API server. Check your connection and try again.",
    });
  }

  const rawJson: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsedError = ApiErrorResponseSchema.safeParse(rawJson);
    if (parsedError.success) {
      throw new ApiClientError({
        code: parsedError.data.error.code,
        status: response.status,
        message: parsedError.data.error.message,
        requestId: parsedError.data.error.requestId,
        details: parsedError.data.error.details,
      });
    }
    throw new ApiClientError({
      code: "INTERNAL_ERROR",
      status: response.status,
      message: `API request failed with status ${response.status}.`,
    });
  }

  return responseSchema.parse(rawJson);
}

export function fetchApiHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return apiRequest("/health", HealthResponseSchema, { signal });
}

export function fetchApiV1Status(signal?: AbortSignal): Promise<ApiV1StatusResponse> {
  return apiRequest(`${API_PREFIX}/status`, ApiV1StatusResponseSchema, { signal });
}

export function fetchAuthMe(accessToken: string, signal?: AbortSignal): Promise<AuthMeResponse> {
  return apiRequest(`${API_PREFIX}/auth/me`, AuthMeResponseSchema, { accessToken, signal });
}

export function validateDriveConnectionMetadata(
  accessToken: string,
  payload: UpdateDriveConnectionRequest,
  signal?: AbortSignal,
): Promise<DriveConnectionValidationResponse> {
  const validatedBody = UpdateDriveConnectionRequestSchema.parse(payload);
  return apiRequest(`${API_PREFIX}/drive/connection/validate`, DriveConnectionValidationResponseSchema, {
    method: "POST",
    accessToken,
    body: validatedBody,
    signal,
  });
}

const DriveConnectionEnvelopeSchema = z.object({
  connection: DriveConnectionMetadataSchema.nullable(),
});

export async function fetchDriveConnection(
  accessToken: string,
  signal?: AbortSignal,
): Promise<DriveConnectionMetadata | null> {
  const res = await apiRequest(`${API_PREFIX}/drive/connection`, DriveConnectionEnvelopeSchema, {
    accessToken,
    signal,
  });
  return res.connection;
}

export async function saveDriveConnection(
  accessToken: string,
  payload: UpdateDriveConnectionRequest,
  signal?: AbortSignal,
): Promise<DriveConnectionMetadata | null> {
  const validatedBody = UpdateDriveConnectionRequestSchema.parse(payload);
  const res = await apiRequest(`${API_PREFIX}/drive/connection`, DriveConnectionEnvelopeSchema, {
    method: "PUT",
    accessToken,
    body: validatedBody,
    signal,
  });
  return res.connection;
}

export function discoverAiModels(
  accessToken: string,
  payload: AiDiscoverModelsRequest,
  signal?: AbortSignal,
): Promise<AiDiscoverModelsResponse> {
  const validatedBody = AiDiscoverModelsRequestSchema.parse(payload);
  return apiRequest(`${API_PREFIX}/ai/models`, AiDiscoverModelsResponseSchema, {
    method: "POST",
    accessToken,
    body: validatedBody,
    signal,
  });
}

export function testAiProvider(
  accessToken: string,
  payload: AiTestProviderRequest,
  signal?: AbortSignal,
): Promise<AiTestProviderResponse> {
  const validatedBody = AiTestProviderRequestSchema.parse(payload);
  return apiRequest(`${API_PREFIX}/ai/test-provider`, AiTestProviderResponseSchema, {
    method: "POST",
    accessToken,
    body: validatedBody,
    signal,
  });
}

export function sendAiChat(
  accessToken: string,
  payload: AiChatRequest,
  signal?: AbortSignal,
): Promise<AiChatResponse> {
  const validatedBody = AiChatRequestSchema.parse(payload);
  return apiRequest(`${API_PREFIX}/ai/chat`, AiChatResponseSchema, {
    method: "POST",
    accessToken,
    body: validatedBody,
    signal,
  });
}

export function registerPushSubscription(
  accessToken: string,
  sub: PushSubscriptionInput,
  signal?: AbortSignal,
): Promise<{ stored: boolean; workerConfigured: boolean }> {
  const validatedBody = PushSubscriptionInputSchema.parse(sub);
  return apiRequest(
    `${API_PREFIX}/push/subscriptions`,
    z.object({ stored: z.boolean(), workerConfigured: z.boolean() }),
    { method: "POST", accessToken, body: validatedBody, signal },
  );
}

export function scheduleNotificationJob(
  accessToken: string,
  job: ScheduleNotificationJobRequest,
  signal?: AbortSignal,
): Promise<NotificationJobResponse> {
  const validatedBody = ScheduleNotificationJobRequestSchema.parse(job);
  return apiRequest(`${API_PREFIX}/push/schedule`, NotificationJobResponseSchema, {
    method: "POST",
    accessToken,
    body: validatedBody,
    signal,
  });
}

export function cancelNotificationJobs(
  accessToken: string,
  occurrenceId: string,
  signal?: AbortSignal,
): Promise<{ cancelledCount: number }> {
  return apiRequest(`${API_PREFIX}/push/cancel`, z.object({ cancelledCount: z.number().int().nonnegative() }), {
    method: "POST",
    accessToken,
    body: { occurrenceId },
    signal,
  });
}
