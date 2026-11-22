import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { parseEnv } from "../src/config/env.js";
import { makeTestEnv, makeTestVerifier } from "./helpers.js";

describe("CORS and environment security", () => {
  let app: FastifyInstance;

  before(async () => {
    app = await buildApp({ env: makeTestEnv(), tokenVerifier: makeTestVerifier(), logger: false });
  });

  after(async () => {
    await app.close();
  });

  it("allows configured frontend origin", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "http://localhost:3000" },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["access-control-allow-origin"], "http://localhost:3000");
  });

  it("rejects unapproved origin with 403", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://evil.example.com" },
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.headers["access-control-allow-origin"], undefined);
  });

  it("parseEnv rejects wildcard (*) CORS origin", () => {
    assert.throws(
      () =>
        parseEnv({
          CORS_ORIGINS: "*",
          SUPABASE_URL: "https://example.supabase.co",
          SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
        }),
      /Wildcard CORS origin/,
    );
  });

  it("parseEnv rejects Supabase secret key passed as publishable key", () => {
    assert.throws(
      () =>
        parseEnv({
          CORS_ORIGINS: "http://localhost:3000",
          SUPABASE_URL: "https://example.supabase.co",
          SUPABASE_PUBLISHABLE_KEY: "sb_secret_should_never_be_used",
        }),
      /secret\/service_role/,
    );
  });
});
