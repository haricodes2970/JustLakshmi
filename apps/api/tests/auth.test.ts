import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { ApiErrorResponseSchema, AuthMeResponseSchema } from "@justlakshmi/shared";
import { buildApp } from "../src/app.js";
import { makeTestEnv, makeTestVerifier, TEST_USER, VALID_TEST_TOKEN } from "./helpers.js";

describe("authentication verification", () => {
  let app: FastifyInstance;

  before(async () => {
    app = await buildApp({ env: makeTestEnv(), tokenVerifier: makeTestVerifier(), logger: false });
  });

  after(async () => {
    await app.close();
  });

  it("rejects missing Authorization header with 401", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/auth/me" });
    assert.equal(res.statusCode, 401);
    const parsed = ApiErrorResponseSchema.parse(res.json());
    assert.equal(parsed.error.code, "UNAUTHORIZED");
  });

  it("rejects malformed Authorization header with 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: "Basic abc123" },
    });
    assert.equal(res.statusCode, 401);
  });

  it("rejects invalid Bearer token with 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: "Bearer invalid-token" },
    });
    assert.equal(res.statusCode, 401);
  });

  it("accepts verified token and ignores client-supplied userId headers or query params", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me?userId=99999999-9999-4999-8999-999999999999",
      headers: {
        authorization: `Bearer ${VALID_TEST_TOKEN}`,
        "x-user-id": "99999999-9999-4999-8999-999999999999",
      },
    });
    assert.equal(res.statusCode, 200);
    const parsed = AuthMeResponseSchema.parse(res.json());
    assert.equal(parsed.user.id, TEST_USER.id);
    assert.equal(parsed.user.email, TEST_USER.email);
  });

  it("returns 503 if token verification backend throws", async () => {
    const failingApp = await buildApp({
      env: makeTestEnv(),
      tokenVerifier: {
        async verifyAccessToken() {
          throw new Error("upstream down");
        },
      },
      logger: false,
    });
    try {
      const res = await failingApp.inject({
        method: "GET",
        url: "/api/v1/auth/me",
        headers: { authorization: `Bearer ${VALID_TEST_TOKEN}` },
      });
      assert.equal(res.statusCode, 503);
      const parsed = ApiErrorResponseSchema.parse(res.json());
      assert.equal(parsed.error.code, "SERVICE_UNAVAILABLE");
    } finally {
      await failingApp.close();
    }
  });
});
