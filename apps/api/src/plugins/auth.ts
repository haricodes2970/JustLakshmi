import type { FastifyRequest, preHandlerHookHandler } from "fastify";
import type { AuthUser } from "@justlakshmi/shared";
import { extractBearerToken, type TokenVerifier } from "../lib/auth.js";
import { AppError } from "./error-handler.js";

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthUser;
    accessToken?: string;
  }
}

/**
 * Enforces server-side Supabase Bearer JWT verification.
 * Derives `request.authUser` exclusively from the verified token.
 */
export function createRequireAuth(verifier: TokenVerifier): preHandlerHookHandler {
  return async function requireAuth(request: FastifyRequest): Promise<void> {
    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      throw new AppError(401, "UNAUTHORIZED", "Missing or malformed Authorization Bearer token.");
    }

    let user: AuthUser | null;
    try {
      user = await verifier.verifyAccessToken(token);
    } catch {
      throw new AppError(503, "SERVICE_UNAVAILABLE", "Authentication verification is temporarily unavailable.");
    }

    if (!user) {
      throw new AppError(401, "UNAUTHORIZED", "Invalid or expired access token.");
    }

    request.authUser = user;
    request.accessToken = token;
  };
}
