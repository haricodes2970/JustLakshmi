import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import {
  API_PREFIX,
  ApiErrorResponseSchema,
  DRIVE_LEAST_PRIVILEGE_SCOPE,
  DRIVE_ROOT_FOLDER_NAME,
  DriveConnectionValidationResponseSchema,
} from "@justlakshmi/shared";
import { buildApp } from "../src/app.js";
import { makeTestEnv, makeTestVerifier, VALID_TEST_TOKEN } from "./helpers.js";

describe("shared package exports and request validation", () => {
  let app: FastifyInstance;

  before(async () => {
    app = await buildApp({ env: makeTestEnv(), tokenVerifier: makeTestVerifier(), logger: false });
  });

  after(async () => {
    await app.close();
  });

  it("exports expected constants from @justlakshmi/shared", () => {
    assert.equal(API_PREFIX, "/api/v1");
    assert.equal(DRIVE_ROOT_FOLDER_NAME, "Habbits");
    assert.equal(DRIVE_LEAST_PRIVILEGE_SCOPE, "https://www.googleapis.com/auth/drive.file");
  });

  it("accepts valid Drive metadata payload on /api/v1/drive/connection/validate", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/drive/connection/validate",
      headers: { authorization: `Bearer ${VALID_TEST_TOKEN}` },
      payload: {
        status: "connected",
        folderId: "1AbCdEfGhIjKlMnOp",
        folderName: "Habbits",
        manifestFileId: "1ManifestId",
        schemaVersion: 1,
      },
    });
    assert.equal(res.statusCode, 200);
    const parsed = DriveConnectionValidationResponseSchema.parse(res.json());
    assert.equal(parsed.valid, true);
    assert.equal(parsed.persisted, false);
  });

  it("rejects wrong Drive folder name with 400 VALIDATION_ERROR", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/drive/connection/validate",
      headers: { authorization: `Bearer ${VALID_TEST_TOKEN}` },
      payload: {
        status: "connected",
        folderId: "1AbCdEfGhIjKlMnOp",
        folderName: "Habits",
        schemaVersion: 1,
      },
    });
    assert.equal(res.statusCode, 400);
    const parsed = ApiErrorResponseSchema.parse(res.json());
    assert.equal(parsed.error.code, "VALIDATION_ERROR");
  });

  it("rejects unknown fields such as accessToken or userId (strict schema)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/drive/connection/validate",
      headers: { authorization: `Bearer ${VALID_TEST_TOKEN}` },
      payload: {
        status: "connected",
        folderId: "1AbCdEfGhIjKlMnOp",
        folderName: "Habbits",
        schemaVersion: 1,
        accessToken: "ya29.forbidden",
      },
    });
    assert.equal(res.statusCode, 400);
    const parsed = ApiErrorResponseSchema.parse(res.json());
    assert.equal(parsed.error.code, "VALIDATION_ERROR");
  });
});
