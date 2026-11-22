import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { ApiErrorResponseSchema, ApiV1StatusResponseSchema, HealthResponseSchema } from "@justlakshmi/shared";
import { buildApp } from "../src/app.js";
import { makeTestEnv, makeTestVerifier } from "./helpers.js";

describe("health and status endpoints", () => {
  let app: FastifyInstance;

  before(async () => {
    app = await buildApp({ env: makeTestEnv(), tokenVerifier: makeTestVerifier(), logger: false });
  });

  after(async () => {
    await app.close();
  });

  it("GET /health returns 200 with valid HealthResponse and security headers", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    assert.equal(res.statusCode, 200);
    const parsed = HealthResponseSchema.safeParse(res.json());
    assert.equal(parsed.success, true);
    assert.equal(res.headers["x-content-type-options"], "nosniff");
  });

  it("GET /api/v1/status returns versioned API metadata", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/status" });
    assert.equal(res.statusCode, 200);
    const parsed = ApiV1StatusResponseSchema.safeParse(res.json());
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.version, "v1");
      assert.equal(parsed.data.driveFolderName, "Habbits");
    }
  });

  it("unknown route returns standardized 404 ApiErrorResponse", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/does-not-exist" });
    assert.equal(res.statusCode, 404);
    const parsed = ApiErrorResponseSchema.safeParse(res.json());
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.error.code, "NOT_FOUND");
    }
  });
});
