import type { AuthUser } from "@justlakshmi/shared";
import type { ApiEnv } from "../src/config/env.js";
import type { TokenVerifier } from "../src/lib/auth.js";

export const TEST_USER: AuthUser = {
  id: "11111111-2222-4333-8444-555555555555",
  email: "user@example.com",
  provider: "google",
  role: "authenticated",
};

export const VALID_TEST_TOKEN = "valid-test-jwt-token";

export function makeTestEnv(overrides: Partial<ApiEnv> = {}): ApiEnv {
  return {
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    PORT: 4000,
    LOG_LEVEL: "silent",
    CORS_ORIGINS: ["http://localhost:3000", "https://justlakshmi.vercel.app"],
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key",
    ...overrides,
  };
}

export function makeTestVerifier(): TokenVerifier {
  return {
    async verifyAccessToken(token: string) {
      return token === VALID_TEST_TOKEN ? TEST_USER : null;
    },
  };
}
