import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import type { ApiErrorCode, ApiErrorDetail, ApiErrorResponse } from "@justlakshmi/shared";

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly details?: ApiErrorDetail[];

  constructor(statusCode: number, code: ApiErrorCode, message: string, details?: ApiErrorDetail[]) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function buildErrorBody(
  code: ApiErrorCode,
  message: string,
  requestId: string,
  details?: ApiErrorDetail[],
): ApiErrorResponse {
  return {
    error: {
      code,
      message,
      requestId,
      ...(details && details.length > 0 ? { details } : {}),
    },
  };
}

function isZodLikeError(error: unknown): error is ZodError {
  return (
    error instanceof ZodError ||
    (error instanceof Error &&
      error.name === "ZodError" &&
      "issues" in error &&
      Array.isArray((error as { issues?: unknown }).issues))
  );
}

export function registerErrorHandlers(app: FastifyInstance): void {
  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    reply
      .code(404)
      .send(buildErrorBody("NOT_FOUND", `Route ${request.method} ${request.url} not found.`, request.id));
  });

  app.setErrorHandler((error: FastifyError | AppError | ZodError | Error, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof AppError) {
      reply.code(error.statusCode).send(buildErrorBody(error.code, error.message, request.id, error.details));
      return;
    }

    if (isZodLikeError(error)) {
      const details: ApiErrorDetail[] = error.issues.map((issue) => ({
        path: issue.path.join(".") || "body",
        message: issue.message,
      }));
      reply.code(400).send(buildErrorBody("VALIDATION_ERROR", "Request validation failed.", request.id, details));
      return;
    }

    const fastifyErr = error as FastifyError;
    if (typeof fastifyErr.statusCode === "number" && fastifyErr.statusCode >= 400 && fastifyErr.statusCode < 500) {
      const code: ApiErrorCode =
        fastifyErr.statusCode === 401
          ? "UNAUTHORIZED"
          : fastifyErr.statusCode === 403
            ? "FORBIDDEN"
            : fastifyErr.statusCode === 404
              ? "NOT_FOUND"
              : fastifyErr.statusCode === 429
                ? "RATE_LIMITED"
                : "VALIDATION_ERROR";
      reply.code(fastifyErr.statusCode).send(buildErrorBody(code, fastifyErr.message || "Bad request.", request.id));
      return;
    }

    request.log.error({ err: { name: error.name, message: error.message } }, "Unhandled server error");
    reply.code(500).send(buildErrorBody("INTERNAL_ERROR", "An unexpected error occurred.", request.id));
  });
}
