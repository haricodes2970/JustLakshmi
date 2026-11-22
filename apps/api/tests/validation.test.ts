import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import {
  API_PREFIX,
  ApiErrorResponseSchema,
  CURRENT_DRIVE_SCHEMA_VERSION,
  DRIVE_LEAST_PRIVILEGE_SCOPE,
  DRIVE_ROOT_FOLDER_NAME,
  DriveConnectionValidationResponseSchema,
  DriveManifestSchema,
  OfflineMutationOutboxItemSchema,
  SyncConflictRecordSchema,
  TombstoneSchema,
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

  it("accepts valid verified Drive metadata payload on /api/v1/drive/connection/validate", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/drive/connection/validate",
      headers: { authorization: `Bearer ${VALID_TEST_TOKEN}` },
      payload: {
        status: "connected",
        folderId: "1AbCdEfGhIjKlMnOp",
        folderName: "Habbits",
        manifestFileId: "1ManifestId",
        verifiedAt: "2026-11-22T09:15:00.000Z",
        schemaVersion: 1,
      },
    });
    assert.equal(res.statusCode, 200);
    const parsed = DriveConnectionValidationResponseSchema.parse(res.json());
    assert.equal(parsed.valid, true);
    assert.equal(parsed.persisted, false);
  });

  it("rejects connected status when verifiedAt or manifestFileId is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/drive/connection/validate",
      headers: { authorization: `Bearer ${VALID_TEST_TOKEN}` },
      payload: {
        status: "connected",
        folderId: "1AbCdEfGhIjKlMnOp",
        folderName: "Habbits",
        manifestFileId: "1ManifestId",
        verifiedAt: null,
        schemaVersion: 1,
      },
    });
    assert.equal(res.statusCode, 400);
    const parsed = ApiErrorResponseSchema.parse(res.json());
    assert.equal(parsed.error.code, "VALIDATION_ERROR");
  });

  it("rejects manifestFileId when folderId is null", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/drive/connection/validate",
      headers: { authorization: `Bearer ${VALID_TEST_TOKEN}` },
      payload: {
        status: "not_connected",
        folderId: null,
        folderName: "Habbits",
        manifestFileId: "1OrphanManifest",
        verifiedAt: null,
        schemaVersion: 1,
      },
    });
    assert.equal(res.statusCode, 400);
    const parsed = ApiErrorResponseSchema.parse(res.json());
    assert.equal(parsed.error.code, "VALIDATION_ERROR");
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

  it("validates shared Drive sync, manifest, tombstone, outbox and conflict contracts", () => {
    const now = "2026-11-22T09:00:00.000Z";
    const sha = "a".repeat(64);
    const manifest = DriveManifestSchema.parse({
      schemaVersion: CURRENT_DRIVE_SCHEMA_VERSION,
      folderName: "Habbits",
      folderId: "1FolderId",
      updatedAt: now,
      files: [
        {
          fileId: "1FileId",
          path: "routines/routines.json",
          mimeType: "application/json",
          schemaVersion: 1,
          checksumSha256: sha,
          modifiedTime: now,
        },
      ],
    });
    assert.equal(manifest.files.length, 1);

    const outbox = OfflineMutationOutboxItemSchema.parse({
      id: "mut-1",
      idempotencyKey: "idem-1",
      entityType: "taskOccurrence",
      entityId: "occ-1",
      operation: "upsert",
      baseVersion: 1,
      payload: { completed: true },
      status: "queued",
      attempts: 0,
      createdAt: now,
      nextRetryAt: null,
      lastError: null,
    });
    assert.equal(outbox.status, "queued");

    const tombstone = TombstoneSchema.parse({
      id: "tomb-1",
      entityType: "routineTemplate",
      entityId: "rt-1",
      baseVersion: 2,
      deletedAt: now,
    });
    assert.equal(tombstone.entityId, "rt-1");

    const conflict = SyncConflictRecordSchema.parse({
      id: "conf-1",
      entityType: "journalEntry",
      entityId: "2026-11-22",
      localVersion: 2,
      remoteVersion: 3,
      localUpdatedAt: now,
      remoteUpdatedAt: now,
      localSnapshot: { wentWell: "Local note" },
      remoteSnapshot: { wentWell: "Remote note" },
      detectedAt: now,
      resolvedAt: null,
      resolution: null,
    });
    assert.equal(conflict.resolution, null);
  });
});
