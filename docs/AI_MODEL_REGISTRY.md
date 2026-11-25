# Lakshmi AI — Dynamic Model Registry & BYOK Architecture

## Overview

Lakshmi AI discovers models dynamically from each supported provider's live API using the user's own API key (BYOK), normalizes them into one shared Zod v4 contract (`AiModelSchema` in `packages/shared`), classifies pricing conservatively (`free`, `paid`, `unknown`), and requires an explicit connection test against the exact selected model before activating it for chat.

No hardcoded default model IDs are used as hidden fallbacks.

## Supported Providers & Discovery Endpoints

| Provider | Discovery Endpoint | Auth Header | Pricing Source |
|---|---|---|---|
| **OpenAI** | `GET https://api.openai.com/v1/models` | `Authorization: Bearer <key>` | Verified catalogue (`https://openai.com/api/pricing/`) |
| **Google Gemini** | `GET https://generativelanguage.googleapis.com/v1beta/models` | `x-goog-api-key: <key>` | Verified catalogue (`https://ai.google.dev/gemini-api/docs/pricing`) |
| **Groq** | `GET https://api.groq.com/openai/v1/models` | `Authorization: Bearer <key>` | Verified catalogue (`https://groq.com/pricing/`) |
| **OpenRouter** | `GET /api/v1/auth/key` + `GET /api/v1/models` | `Authorization: Bearer <key>` | Live per-token `pricing.prompt` / `pricing.completion` |

## Pricing Classification Policy

- **`free`**: Assigned **only** when verified pricing evidence confirms both input and output API cost equal `$0` (e.g. OpenRouter zero-cost models). Models are never assumed free because they are open-source or have a developer free plan.
- **`paid`**: Assigned when verified input or output cost is greater than `$0`. Input/output USD per 1M tokens and verification date are displayed.
- **`unknown`**: Assigned whenever pricing metadata is absent, negative (e.g. dynamic routers), or not present in the verified catalogue. Unknown models are excluded from **Free** mode and shown only in a separate warning section under **Paid** mode.

## Groq Empty-Response Bug Root Cause & Fix

Previously, `testProvider` sent `max_tokens: 16` with the full coaching system prompt and only inspected `choices[0].message.content` as a plain string. On Groq reasoning models (such as `openai/gpt-oss-*` or `qwen3`), internal reasoning consumed all 16 tokens before any final text was emitted, returning `content: ""` with `finish_reason: "length"`.

Fix implemented in `apps/api/src/lib/ai/providers/groq.ts` and `http.ts`:
- Connection tests send a concise verification prompt and `max_completion_tokens >= 256` (1024 for chat).
- Response parser handles string content, structured array content parts, explicit refusals, and `finish_reason: "length"` with `reasoning`/`reasoning_content`, surfacing actionable `AiProviderErrorCode` values (`INVALID_KEY`, `MODEL_UNAVAILABLE`, `EMPTY_RESPONSE`, `RATE_LIMITED`, `PROVIDER_ERROR`, `TIMEOUT`).

## Security, Privacy & Key Lifecycle

- **Session-memory only:** Up to 2 BYOK keys are held in React memory and cleared on reload, sign-out, or account switch. Keys are never written to `localStorage`, `sessionStorage`, IndexedDB, Supabase, URLs, or logs.
- **HTTPS transit disclosure:** Keys are sent over HTTPS to the authenticated JustLakshmi backend (`POST /api/v1/ai/models`, `/api/v1/ai/test-provider`, `/api/v1/ai/chat`) to execute provider requests.
- **Safe caching:** Model discovery results are cached in memory for 5 minutes keyed by `(provider, sha256(apiKey))` — raw API keys are never cached, and concurrent identical discovery calls are deduplicated.
- **Consent & abort honesty:** Model discovery and connection testing never send personal records. Chat requires `consentGranted: true` and excludes journal/mood unless separately enabled. Revoking consent blocks future requests and aborts client fetches, though an external provider may finish processing a request it already received.
