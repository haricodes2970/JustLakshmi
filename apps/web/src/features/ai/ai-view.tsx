"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowUp,
  Brain,
  CheckCircle2,
  ChevronDown,
  KeyRound,
  Loader2,
  MessageCircle,
  Pin,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { AiModel, AiProviderId } from "@justlakshmi/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, SectionHeading } from "@/components/ui/page-header";
import { Segmented } from "@/components/ui/segmented";
import { AI_SUGGESTED_PROMPTS } from "@/data/demo/ai-prompts";
import { useAuth } from "@/features/auth/auth-provider";
import { useWorkspace } from "@/features/workspace/workspace-provider";
import { buildGroundedAiContext } from "@/lib/ai/rag";
import { ApiClientError, discoverAiModels, isApiConfigured, sendAiChat, testAiProvider } from "@/lib/api-client";
import { cn } from "@/lib/cn";

type UsagePreference = "free" | "paid";

type KeySlot = {
  id: string;
  provider: AiProviderId;
  /** Held strictly in React memory for this session; never written to localStorage/IndexedDB. */
  apiKey: string;
  usagePreference: UsagePreference;
  models: AiModel[];
  fetchedAt: string;
  activeModel: AiModel | null;
  lastTestResult: { ok: boolean; latencyMs: number; message: string } | null;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  meta?: string;
};

const PROVIDERS: readonly { id: AiProviderId; label: string }[] = [
  { id: "openai", label: "OpenAI" },
  { id: "gemini", label: "Google Gemini" },
  { id: "groq", label: "Groq" },
  { id: "openrouter", label: "OpenRouter" },
];

function formatPrice(val: number | null): string {
  if (val === null) return "Unknown";
  if (val === 0) return "$0";
  return `$${val < 0.01 ? val.toFixed(4) : val.toFixed(2)}`;
}

function formatContext(tokens: number | null): string {
  if (!tokens) return "—";
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
  return String(tokens);
}

export function AiView() {
  const auth = useAuth();
  // Keying by account ID guarantees BYOK keys and chat history are cleared on sign-out or account switch.
  return <AiViewInner key={auth.user?.id ?? "guest"} />;
}

function AiViewInner() {
  const uid = useId();
  const auth = useAuth();
  const ws = useWorkspace();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Up to 2 session-memory BYOK provider slots.
  const [slots, setSlots] = useState<KeySlot[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);

  // New-key discovery form state.
  const [provider, setProvider] = useState<AiProviderId>("openrouter");
  const [usagePref, setUsagePref] = useState<UsagePreference>("free");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);

  // Catalogue search + unknown-tier toggle + model activation test.
  const [searchQuery, setSearchQuery] = useState("");
  const [showUnknown, setShowUnknown] = useState(false);
  const [testingModelId, setTestingModelId] = useState<string | null>(null);

  // Chat state.
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const activeAbortRef = useRef<AbortController | null>(null);

  const [newMemory, setNewMemory] = useState("");

  useEffect(() => {
    if (!ws.aiConsent.granted) {
      activeAbortRef.current?.abort();
    }
  }, [ws.aiConsent.granted]);

  const activeSlot = slots.find((s) => s.id === selectedSlotId) ?? slots[0] ?? null;
  const activeModel = activeSlot?.activeModel ?? null;
  const apiReady = isApiConfigured();
  const canSend =
    Boolean(draft.trim()) &&
    !sending &&
    ws.aiConsent.granted &&
    Boolean(activeSlot) &&
    Boolean(activeModel) &&
    apiReady &&
    Boolean(auth.accessToken);

  const filteredModels = useMemo(() => {
    if (!activeSlot) return { primary: [] as AiModel[], unknown: [] as AiModel[] };
    const q = searchQuery.trim().toLowerCase();
    const matchesQuery = (m: AiModel) =>
      !q || m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q);

    const primary = activeSlot.models.filter(
      (m) => m.pricingTier === activeSlot.usagePreference && matchesQuery(m),
    );
    const unknown =
      activeSlot.usagePreference === "paid"
        ? activeSlot.models.filter((m) => m.pricingTier === "unknown" && matchesQuery(m))
        : [];
    return { primary, unknown };
  }, [activeSlot, searchQuery]);

  async function handleVerifyAndLoadModels(e: React.FormEvent) {
    e.preventDefault();
    setDiscoverError(null);
    if (slots.length >= 2) {
      setDiscoverError("Maximum of two BYOK API keys per session. Remove one to add another.");
      return;
    }
    const trimmedKey = apiKeyInput.trim();
    if (trimmedKey.length < 8) {
      setDiscoverError("Enter a valid provider API key (at least 8 characters).");
      return;
    }
    if (!apiReady || !auth.accessToken) {
      setDiscoverError("Sign in with Supabase Auth and configure NEXT_PUBLIC_API_BASE_URL to verify keys and load models.");
      return;
    }

    setDiscovering(true);
    try {
      const res = await discoverAiModels(auth.accessToken, { provider, apiKey: trimmedKey });
      const slot: KeySlot = {
        id: `slot_${Date.now()}`,
        provider,
        apiKey: trimmedKey,
        usagePreference: usagePref,
        models: res.models,
        fetchedAt: res.fetchedAt,
        activeModel: null,
        lastTestResult: null,
      };
      setSlots((prev) => [...prev, slot]);
      setSelectedSlotId(slot.id);
      setApiKeyInput("");
      setSearchQuery("");
      setShowUnknown(false);
    } catch (err) {
      setDiscoverError(err instanceof ApiClientError ? err.message : "Failed to verify key or load models.");
    } finally {
      setDiscovering(false);
    }
  }

  function updateSlotUsagePreference(slotId: string, nextPref: UsagePreference) {
    setSlots((prev) =>
      prev.map((s) => {
        if (s.id !== slotId) return s;
        // Never keep a paid/unknown model active if the user switches to Free-only mode.
        const keepActive = s.activeModel && (nextPref === "paid" || s.activeModel.pricingTier === "free");
        return {
          ...s,
          usagePreference: nextPref,
          activeModel: keepActive ? s.activeModel : null,
          lastTestResult: keepActive ? s.lastTestResult : null,
        };
      }),
    );
    setShowUnknown(false);
  }

  async function handleSelectAndTestModel(slot: KeySlot, model: AiModel) {
    if (slot.usagePreference === "free" && model.pricingTier !== "free") {
      return;
    }
    if (!apiReady || !auth.accessToken) return;
    setTestingModelId(model.id);
    try {
      const res = await testAiProvider(auth.accessToken, {
        provider: slot.provider,
        apiKey: slot.apiKey,
        model: model.id,
      });
      setSlots((prev) =>
        prev.map((s) =>
          s.id === slot.id
            ? {
                ...s,
                activeModel: res.ok ? model : s.activeModel?.id === model.id ? null : s.activeModel,
                lastTestResult: { ok: res.ok, latencyMs: res.latencyMs, message: res.message },
              }
            : s,
        ),
      );
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : "Connection test failed.";
      setSlots((prev) =>
        prev.map((s) =>
          s.id === slot.id
            ? { ...s, lastTestResult: { ok: false, latencyMs: 0, message } }
            : s,
        ),
      );
    } finally {
      setTestingModelId(null);
    }
  }

  function removeSlot(slotId: string) {
    setSlots((prev) => prev.filter((s) => s.id !== slotId));
    if (selectedSlotId === slotId) setSelectedSlotId(null);
  }

  async function submitChat(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend || !activeSlot || !activeModel || !auth.accessToken) return;
    const question = draft.trim();
    setDraft("");
    setChatError(null);
    setMessages((prev) => [...prev, { id: `u_${Date.now()}`, role: "user", text: question }]);
    setSending(true);

    const controller = new AbortController();
    activeAbortRef.current = controller;

    try {
      const { contextRecords, memories } = buildGroundedAiContext({
        today: ws.today,
        templates: ws.templates,
        occurrences: ws.occurrences,
        journalEntries: ws.journalEntries,
        memories: ws.aiMemories,
        includeJournalContext: ws.aiConsent.includeJournal,
      });

      const res = await sendAiChat(
        auth.accessToken,
        {
          provider: activeSlot.provider,
          apiKey: activeSlot.apiKey,
          model: activeModel.id,
          consentGranted: true,
          includeJournalContext: ws.aiConsent.includeJournal,
          message: question,
          contextRecords,
          memories,
        },
        controller.signal,
      );

      setMessages((prev) => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          role: "assistant",
          text: res.answer,
          meta: `${res.provider} · ${res.model} · ${res.groundedRecordCount} records grounded · read-only`,
        },
      ]);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "Unable to reach Lakshmi AI.");
    } finally {
      setSending(false);
    }
  }

  function renderModelCard(slot: KeySlot, model: AiModel) {
    const isActive = slot.activeModel?.id === model.id;
    const isTesting = testingModelId === model.id;
    const isUnavailable = model.availability === "unavailable";

    return (
      <li
        key={model.id}
        className={cn(
          "rounded-ui border p-3 text-xs transition-colors",
          isActive ? "border-inverse bg-surface-2" : "border-line bg-surface",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-ink">{model.name}</p>
            <p className="truncate font-mono text-[11px] text-ink-3">{model.id}</p>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase",
              model.pricingTier === "free"
                ? "border-inverse bg-inverse text-on-inverse"
                : "border-line text-ink-2",
            )}
          >
            {model.pricingTier}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-3">
          <span>
            In: <strong className="text-ink-2">{formatPrice(model.inputPricePerMillionTokens)}/1M</strong>
          </span>
          <span>
            Out: <strong className="text-ink-2">{formatPrice(model.outputPricePerMillionTokens)}/1M</strong>
          </span>
          <span>Ctx: {formatContext(model.contextWindow)}</span>
          {model.pricingVerifiedAt ? <span>Verified {model.pricingVerifiedAt.slice(0, 10)}</span> : <span>Unverified price</span>}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {model.capabilities.slice(0, 3).map((cap) => (
              <span key={cap} className="rounded border border-line px-1.5 py-0.5 text-[10px] text-ink-3">
                {cap}
              </span>
            ))}
          </div>
          <Button
            type="button"
            variant={isActive ? "primary" : "secondary"}
            className="min-h-8 px-3 text-xs"
            disabled={isUnavailable || testingModelId !== null}
            onClick={() => void handleSelectAndTestModel(slot, model)}
          >
            {isTesting ? (
              <>
                <Loader2 aria-hidden className="size-3.5 animate-spin" />
                Testing…
              </>
            ) : isActive ? (
              "Active"
            ) : isUnavailable ? (
              "Unavailable"
            ) : (
              "Select & Test"
            )}
          </Button>
        </div>
      </li>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Lakshmi AI" subtitle="Read-only personal productivity coach (BYOK)." />

      <div className="grid gap-8 lg:grid-cols-[1fr_24rem]">
        <div className="flex min-h-[28rem] flex-col gap-5">
          <div className="flex gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-inverse text-on-inverse">
              <Sparkles aria-hidden className="size-4" />
            </span>
            <div className="max-w-[88%] rounded-ui border border-line bg-surface px-4 py-3">
              <p className="text-[0.9375rem] leading-relaxed">
                Hello, I am Lakshmi. With your explicit consent and a verified BYOK model, I answer questions grounded strictly in
                your authorized records. I am read-only and will never modify your routines or tasks.
              </p>
              {activeSlot && activeModel ? (
                <p className="mt-2 text-xs text-ink-3">
                  Active model: <strong className="text-ink-2">{activeSlot.provider}</strong> ·{" "}
                  <span className="font-mono">{activeModel.id}</span> ({activeModel.pricingTier})
                </p>
              ) : null}
            </div>
          </div>

          {messages.length === 0 ? (
            <div className="flex-1">
              <EmptyState
                icon={MessageCircle}
                title="No conversation yet"
                description="Verify a provider API key, select and test a model, and grant AI consent to ask grounded questions."
              />
            </div>
          ) : (
            <ul className="flex-1 space-y-3" aria-live="polite">
              {messages.map((m) => (
                <li key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-ui border px-4 py-3 text-sm leading-relaxed",
                      m.role === "user" ? "border-inverse bg-inverse text-on-inverse" : "border-line bg-surface text-ink",
                    )}
                  >
                    <p className="whitespace-pre-wrap">{m.text}</p>
                    {m.meta ? <p className="mt-2 text-xs text-ink-3">{m.meta}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <section aria-labelledby={`${uid}-prompts`}>
            <h2 id={`${uid}-prompts`} className="mb-2 text-sm font-medium text-ink-3">
              Suggested prompts
            </h2>
            <ul className="flex flex-wrap gap-2">
              {AI_SUGGESTED_PROMPTS.map((p) => (
                <li key={p}>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(p);
                      inputRef.current?.focus();
                    }}
                    className="min-h-10 rounded-ui border border-line bg-surface px-3.5 py-2 text-left text-sm text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                  >
                    {p}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <form onSubmit={(e) => void submitChat(e)} className="space-y-2">
            <div className="flex items-end gap-2 rounded-ui border border-line bg-surface p-2">
              <label htmlFor={`${uid}-input`} className="sr-only">
                Message Lakshmi AI
              </label>
              <textarea
                id={`${uid}-input`}
                ref={inputRef}
                rows={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Ask about your routines…"
                aria-describedby={`${uid}-note`}
                className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-ink outline-none placeholder:text-ink-3"
              />
              <Button type="submit" size="icon" disabled={!canSend} aria-label="Send message">
                <ArrowUp aria-hidden className="size-5" />
              </Button>
            </div>
            {chatError ? <p className="text-xs text-ink">{chatError}</p> : null}
            <p id={`${uid}-note`} className="text-xs text-ink-3">
              {!ws.aiConsent.granted
                ? "Grant external AI consent to enable sending."
                : !activeSlot || !activeModel
                  ? "Verify a key and test a selected model to activate chat."
                  : !apiReady || !auth.accessToken
                    ? "Sign in and configure NEXT_PUBLIC_API_BASE_URL to send live requests."
                    : `Ready using ${activeSlot.provider} (${activeModel.id}). Read-only enforced.`}
            </p>
          </form>
        </div>

        <aside className="min-w-0 space-y-6">
          <section aria-labelledby="ai-byok-h">
            <SectionHeading id="ai-byok-h">BYOK provider &amp; models ({slots.length}/2)</SectionHeading>
            <Card className="space-y-4 p-4">
              {slots.length > 0 ? (
                <div className="space-y-2">
                  {slots.map((slot) => (
                    <div
                      key={slot.id}
                      className={cn(
                        "flex items-center justify-between gap-2 rounded-ui border px-3 py-2 text-xs",
                        activeSlot?.id === slot.id ? "border-inverse bg-surface-2" : "border-line bg-surface",
                      )}
                    >
                      <button type="button" onClick={() => setSelectedSlotId(slot.id)} className="min-w-0 flex-1 text-left">
                        <p className="font-medium capitalize">
                          {slot.provider} · {slot.models.length} models
                        </p>
                        <p className="truncate text-ink-3">
                          {slot.activeModel ? `Active: ${slot.activeModel.id}` : "Select a model below to test & activate"}
                        </p>
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${slot.provider} key`}
                        onClick={() => removeSlot(slot.id)}
                        className="p-1 text-ink-3 hover:text-ink"
                      >
                        <Trash2 aria-hidden className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              {slots.length < 2 ? (
                <form onSubmit={(e) => void handleVerifyAndLoadModels(e)} className="space-y-3">
                  <div>
                    <label htmlFor={`${uid}-provider`} className="mb-1 block text-xs font-medium text-ink-2">
                      1. Provider
                    </label>
                    <select
                      id={`${uid}-provider`}
                      value={provider}
                      onChange={(e) => {
                        setProvider(e.target.value as AiProviderId);
                        setDiscoverError(null);
                      }}
                      className="min-h-10 w-full rounded-ui border border-line bg-surface px-3 text-sm"
                    >
                      {PROVIDERS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <p className="mb-1 text-xs font-medium text-ink-2">2. Pricing preference</p>
                    <Segmented<UsagePreference>
                      label="Usage preference"
                      value={usagePref}
                      onChange={setUsagePref}
                      options={[
                        { value: "free", label: "Free models" },
                        { value: "paid", label: "Paid models" },
                      ]}
                    />
                  </div>

                  <div>
                    <label htmlFor={`${uid}-apikey`} className="mb-1 block text-xs font-medium text-ink-2">
                      3. Provider API key
                    </label>
                    <input
                      id={`${uid}-apikey`}
                      type="password"
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder="Paste provider API key…"
                      autoComplete="off"
                      className="min-h-10 w-full rounded-ui border border-line bg-surface px-3 text-sm"
                    />
                  </div>

                  <Button type="submit" variant="primary" className="w-full" disabled={discovering}>
                    {discovering ? (
                      <>
                        <Loader2 aria-hidden className="size-4 animate-spin" />
                        Verifying &amp; loading models…
                      </>
                    ) : (
                      <>
                        <KeyRound aria-hidden className="size-4" />
                        Verify key &amp; Load Models
                      </>
                    )}
                  </Button>
                  {discoverError ? (
                    <p role="alert" className="flex items-start gap-1.5 text-xs text-ink">
                      <AlertCircle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                      <span>{discoverError}</span>
                    </p>
                  ) : null}
                </form>
              ) : null}

              {activeSlot ? (
                <div className="space-y-3 border-t border-line pt-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium capitalize text-ink-2">{activeSlot.provider} catalogue</p>
                    <span className="text-[11px] text-ink-3">{filteredModels.primary.length} shown</span>
                  </div>

                  <Segmented<UsagePreference>
                    label="Filter discovered models by pricing"
                    value={activeSlot.usagePreference}
                    onChange={(next) => updateSlotUsagePreference(activeSlot.id, next)}
                    options={[
                      { value: "free", label: "Free only" },
                      { value: "paid", label: "Paid" },
                    ]}
                  />

                  <div className="relative">
                    <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
                    <input
                      aria-label="Search discovered models"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search model name or ID…"
                      className="min-h-10 w-full rounded-ui border border-line bg-surface pr-3 pl-9 text-sm"
                    />
                  </div>

                  {activeSlot.lastTestResult ? (
                    <div
                      role="status"
                      className="flex items-start gap-2 rounded-ui border border-line bg-bg px-3 py-2 text-xs"
                    >
                      {activeSlot.lastTestResult.ok ? (
                        <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-ink" />
                      ) : (
                        <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-ink" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium">{activeSlot.lastTestResult.message}</p>
                        {activeSlot.lastTestResult.latencyMs > 0 ? (
                          <p className="text-ink-3">Latency: {activeSlot.lastTestResult.latencyMs}ms</p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {activeSlot.usagePreference === "paid" ? (
                    <p className="text-[11px] text-ink-3">
                      Paid usage is billed directly by {activeSlot.provider}. Actual rates may vary by account tier.
                    </p>
                  ) : null}

                  {filteredModels.primary.length === 0 ? (
                    <div className="rounded-ui border border-dashed border-line p-4 text-center text-xs text-ink-3">
                      {activeSlot.usagePreference === "free"
                        ? `No verified $0 free models were reported by ${activeSlot.provider}. We never substitute paid or unverified models in Free mode. Switch to Paid or use OpenRouter for verified $0 models.`
                        : "No paid models match your search."}
                    </div>
                  ) : (
                    <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                      {filteredModels.primary.map((m) => renderModelCard(activeSlot, m))}
                    </ul>
                  )}

                  {activeSlot.usagePreference === "paid" && filteredModels.unknown.length > 0 ? (
                    <div className="border-t border-line pt-2">
                      <button
                        type="button"
                        aria-expanded={showUnknown}
                        onClick={() => setShowUnknown((v) => !v)}
                        className="flex min-h-8 w-full items-center justify-between text-xs text-ink-3 hover:text-ink"
                      >
                        <span>Unknown-pricing models ({filteredModels.unknown.length})</span>
                        <ChevronDown aria-hidden className={cn("size-4 transition-transform", showUnknown && "rotate-180")} />
                      </button>
                      {showUnknown ? (
                        <div className="mt-2 space-y-2">
                          <p className="text-[11px] text-ink-3">
                            Pricing could not be verified for these models. Check {activeSlot.provider}&apos;s billing dashboard
                            before using them.
                          </p>
                          <ul className="max-h-56 space-y-2 overflow-y-auto pr-1">
                            {filteredModels.unknown.map((m) => renderModelCard(activeSlot, m))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <p className="text-[11px] text-ink-3">
                Keys stay in session memory only (never localStorage, IndexedDB, or Supabase) and are sent over HTTPS to the
                authenticated JustLakshmi backend only during model discovery, connection tests, and chat.
              </p>
            </Card>
          </section>

          <section aria-labelledby="ai-consent-h">
            <SectionHeading id="ai-consent-h">Consent &amp; privacy</SectionHeading>
            <Card className="space-y-3 p-4 text-sm">
              <div className="flex items-start gap-2 text-xs text-ink-3">
                <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
                <p>
                  Model discovery never sends personal records. During chat, only minimal date-bounded records are sent to your
                  chosen provider under its own terms. Revoking consent blocks future requests (already-sent requests may still
                  finish on the provider).
                </p>
              </div>
              <label className="flex min-h-10 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={ws.aiConsent.granted}
                  onChange={(e) => void ws.setAiConsent(e.target.checked, ws.aiConsent.includeJournal)}
                  className="size-4 accent-ink"
                />
                <span>Allow external AI processing of routine &amp; analytics records</span>
              </label>
              <label className="flex min-h-10 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  disabled={!ws.aiConsent.granted}
                  checked={ws.aiConsent.includeJournal}
                  onChange={(e) => void ws.setAiConsent(ws.aiConsent.granted, e.target.checked)}
                  className="size-4 accent-ink"
                />
                <span className="text-ink-2">Also include recent journal &amp; mood entries</span>
              </label>
            </Card>
          </section>

          <section aria-labelledby="ai-mem-h">
            <SectionHeading id="ai-mem-h">Persistent AI memory</SectionHeading>
            <Card className="space-y-3 p-4">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newMemory.trim()) return;
                  await ws.addAiMemory(newMemory);
                  setNewMemory("");
                }}
                className="flex gap-2"
              >
                <label htmlFor="new-mem" className="sr-only">
                  Add AI memory
                </label>
                <input
                  id="new-mem"
                  value={newMemory}
                  onChange={(e) => setNewMemory(e.target.value)}
                  placeholder="Add a coaching preference…"
                  className="min-h-10 flex-1 rounded-ui border border-line bg-surface px-3 text-sm"
                />
                <Button type="submit" size="icon" aria-label="Add memory">
                  <Plus aria-hidden className="size-4" />
                </Button>
              </form>

              {ws.aiMemories.length === 0 ? (
                <p className="flex items-center gap-2 text-xs text-ink-3">
                  <Brain aria-hidden className="size-4" />
                  No memories stored yet. Stored in IndexedDB &amp; Drive Habbits/ai/memories.json.
                </p>
              ) : (
                <>
                  <ul className="divide-y divide-line">
                    {ws.aiMemories.map((m) => (
                      <li key={m.id} className="flex items-start justify-between gap-2 py-2 text-xs">
                        <span className="flex-1 leading-relaxed">{m.content}</span>
                        <button
                          type="button"
                          aria-label={m.pinned ? "Unpin memory" : "Pin memory"}
                          onClick={() => void ws.togglePinAiMemory(m.id)}
                          className={cn("p-1", m.pinned ? "text-ink" : "text-ink-3 hover:text-ink")}
                        >
                          <Pin aria-hidden className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Delete memory"
                          onClick={() => void ws.deleteAiMemory(m.id)}
                          className="p-1 text-ink-3 hover:text-ink"
                        >
                          <Trash2 aria-hidden className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => void ws.clearAllAiMemories()}
                    className="text-xs text-ink-3 underline underline-offset-4 hover:text-ink"
                  >
                    Clear all memories
                  </button>
                </>
              )}
            </Card>
          </section>
        </aside>
      </div>
    </div>
  );
}
