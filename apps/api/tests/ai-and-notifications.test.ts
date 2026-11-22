import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import {
  AiChatResponseSchema,
  AiTestProviderResponseSchema,
  ApiErrorResponseSchema,
  NotificationJobResponseSchema,
  type DriveConnectionMetadata,
} from "@justlakshmi/shared";
import { buildApp } from "../src/app.js";
import { createAiProviderService } from "../src/lib/ai/providers.js";
import type { DriveConnectionStore } from "../src/lib/supabase-rls.js";
import { makeTestEnv, makeTestVerifier, TEST_USER, VALID_TEST_TOKEN } from "./helpers.js";

const SECOND_USER_ID = "22222222-3333-4444-8555-666666666666";
const SECOND_USER_TOKEN = "second-user-jwt-token";

describe("AI providers, notifications, and user-scoped Drive isolation", () => {
  let app: FastifyInstance;

  before(async () => {
    const storeByUser = new Map<string, DriveConnectionMetadata>();
    const driveStore: DriveConnectionStore = {
      async getForUser(userId) {
        return storeByUser.get(userId) ?? null;
      },
      async upsertForUser(userId, _token, input) {
        const record: DriveConnectionMetadata = {
          status: input.status,
          folderId: input.folderId,
          folderName: input.folderName,
          manifestFileId: input.manifestFileId,
          schemaVersion: input.schemaVersion,
          verifiedAt: input.verifiedAt,
          lastSyncedAt: null,
          updatedAt: new Date().toISOString(),
        };
        storeByUser.set(userId, record);
        return record;
      },
    };

    const mockFetch: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("generativelanguage.googleapis.com")) {
        return new Response(
          JSON.stringify({ candidates: [{ content: { parts: [{ text: "Gemini grounded reply." }] } }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "OpenAI-compatible grounded reply." } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    app = await buildApp({
      env: makeTestEnv(),
      tokenVerifier: {
        async verifyAccessToken(token) {
          if (token === VALID_TEST_TOKEN) return TEST_USER;
          if (token === SECOND_USER_TOKEN) {
            return { id: SECOND_USER_ID, email: "second@example.com", provider: "google", role: "authenticated" };
          }
          return null;
        },
      },
      driveStore,
      aiService: createAiProviderService(mockFetch),
      logger: false,
    });
  });

  after(async () => {
    await app.close();
  });

  it("isolates Drive connection metadata strictly per authenticated user", async () => {
    const put1 = await app.inject({
      method: "PUT",
      url: "/api/v1/drive/connection",
      headers: { authorization: `Bearer ${VALID_TEST_TOKEN}` },
      payload: {
        status: "connected",
        folderId: "user1-folder",
        folderName: "Habbits",
        manifestFileId: "user1-manifest",
        verifiedAt: "2026-11-22T09:00:00.000Z",
        schemaVersion: 1,
      },
    });
    assert.equal(put1.statusCode, 200);

    const get2 = await app.inject({
      method: "GET",
      url: "/api/v1/drive/connection",
      headers: { authorization: `Bearer ${SECOND_USER_TOKEN}` },
    });
    assert.equal(get2.statusCode, 200);
    assert.equal(get2.json().connection, null);
  });

  it("rejects AI chat without explicit consentGranted: true", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/ai/chat",
      headers: { authorization: `Bearer ${VALID_TEST_TOKEN}` },
      payload: {
        provider: "openai",
        apiKey: "sk-test-1234567890",
        consentGranted: false,
        message: "How did I do?",
      },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(ApiErrorResponseSchema.parse(res.json()).error.code, "VALIDATION_ERROR");
  });

  it("verifies OpenAI and Gemini provider adapters and enforces readOnlyEnforced", async () => {
    const testRes = await app.inject({
      method: "POST",
      url: "/api/v1/ai/test-provider",
      headers: { authorization: `Bearer ${VALID_TEST_TOKEN}` },
      payload: { provider: "gemini", apiKey: "AIzaSyTestKey123456" },
    });
    assert.equal(testRes.statusCode, 200);
    assert.equal(AiTestProviderResponseSchema.parse(testRes.json()).ok, true);

    const chatRes = await app.inject({
      method: "POST",
      url: "/api/v1/ai/chat",
      headers: { authorization: `Bearer ${VALID_TEST_TOKEN}` },
      payload: {
        provider: "groq",
        apiKey: "gsk_test_1234567890",
        consentGranted: true,
        includeJournalContext: false,
        message: "How consistent was I?",
        contextRecords: [{ kind: "analytics", date: "2026-11-22", summary: "7-day completion: 82%" }],
        memories: ["Prefers concise morning check-ins"],
      },
    });
    assert.equal(chatRes.statusCode, 200);
    const parsed = AiChatResponseSchema.parse(chatRes.json());
    assert.equal(parsed.readOnlyEnforced, true);
    assert.equal(parsed.groundedRecordCount, 1);
  });

  it("schedules notification jobs idempotently and cancels on completion", async () => {
    const payload = {
      occurrenceId: "r-walk@2026-11-22",
      jobType: "scheduled",
      dueAt: "2026-11-22T07:30:00.000Z",
      idempotencyKey: "r-walk@2026-11-22:scheduled",
      timeZone: "Asia/Kolkata",
    };

    const first = await app.inject({
      method: "POST",
      url: "/api/v1/push/schedule",
      headers: { authorization: `Bearer ${VALID_TEST_TOKEN}` },
      payload,
    });
    assert.equal(first.statusCode, 200);
    const firstBody = NotificationJobResponseSchema.parse(first.json());
    assert.equal(firstBody.workerStatus, "deferred_no_worker");

    const second = await app.inject({
      method: "POST",
      url: "/api/v1/push/schedule",
      headers: { authorization: `Bearer ${VALID_TEST_TOKEN}` },
      payload,
    });
    assert.equal(second.statusCode, 200);
    assert.equal(second.json().jobId, firstBody.jobId);

    const cancel = await app.inject({
      method: "POST",
      url: "/api/v1/push/cancel",
      headers: { authorization: `Bearer ${VALID_TEST_TOKEN}` },
      payload: { occurrenceId: "r-walk@2026-11-22" },
    });
    assert.equal(cancel.statusCode, 200);
    assert.equal(cancel.json().cancelledCount, 1);
  });

  it("uses makeTestVerifier cleanly for backward compatibility", () => {
    assert.ok(makeTestVerifier());
  });
});
