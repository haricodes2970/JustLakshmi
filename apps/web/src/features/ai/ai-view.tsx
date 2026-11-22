"use client";

import { useId, useRef, useState } from "react";
import { ArrowUp, Brain, KeyRound, MessageCircle, Pin, Plus, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { AI_DEFAULT_MODELS, type AiProviderId } from "@justlakshmi/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, SectionHeading } from "@/components/ui/page-header";
import { AI_SUGGESTED_PROMPTS } from "@/data/demo/ai-prompts";
import { useAuth } from "@/features/auth/auth-provider";
import { useWorkspace } from "@/features/workspace/workspace-provider";
import { buildGroundedAiContext } from "@/lib/ai/rag";
import { ApiClientError, isApiConfigured, sendAiChat, testAiProvider } from "@/lib/api-client";
import { cn } from "@/lib/cn";

type KeySlot = {
  id: string;
  provider: AiProviderId;
  model: string;
  /** Held strictly in React memory for this session; never written to localStorage/IndexedDB. */
  apiKey: string;
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

export function AiView() {
  const uid = useId();
  const auth = useAuth();
  const ws = useWorkspace();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [keys, setKeys] = useState<KeySlot[]>([]);
  const [activeKeyId, setActiveKeyId] = useState<string | null>(null);
  const [newProvider, setNewProvider] = useState<AiProviderId>("openai");
  const [newModel, setNewModel] = useState(AI_DEFAULT_MODELS.openai);
  const [newApiKey, setNewApiKey] = useState("");
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [newMemory, setNewMemory] = useState("");

  const activeKey = keys.find((k) => k.id === activeKeyId) ?? keys[0] ?? null;
  const apiReady = isApiConfigured();
  const canSend =
    Boolean(draft.trim()) &&
    !sending &&
    ws.aiConsent.granted &&
    Boolean(activeKey) &&
    apiReady &&
    Boolean(auth.accessToken);

  function addKeySlot(e: React.FormEvent) {
    e.preventDefault();
    if (keys.length >= 2) {
      setTestStatus("Maximum of two BYOK API keys per user.");
      return;
    }
    const trimmed = newApiKey.trim();
    if (trimmed.length < 8) {
      setTestStatus("Enter a valid provider API key.");
      return;
    }
    const slot: KeySlot = {
      id: `key_${Date.now()}`,
      provider: newProvider,
      model: newModel.trim() || AI_DEFAULT_MODELS[newProvider],
      apiKey: trimmed,
    };
    setKeys((prev) => [...prev, slot]);
    setActiveKeyId(slot.id);
    setNewApiKey("");
    setTestStatus(`Added ${slot.provider} key in session memory (never persisted to browser storage).`);
  }

  async function runConnectionTest(slot: KeySlot) {
    if (!apiReady || !auth.accessToken) {
      setTestStatus("Sign in with Supabase Auth and configure NEXT_PUBLIC_API_BASE_URL to test provider keys.");
      return;
    }
    setTesting(true);
    setTestStatus(null);
    try {
      const res = await testAiProvider(auth.accessToken, {
        provider: slot.provider,
        apiKey: slot.apiKey,
        model: slot.model,
      });
      setTestStatus(res.ok ? `${res.message} (${res.latencyMs}ms)` : `Connection failed: ${res.message}`);
    } catch (err) {
      setTestStatus(err instanceof ApiClientError ? err.message : "Provider test failed.");
    } finally {
      setTesting(false);
    }
  }

  async function submitChat(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend || !activeKey || !auth.accessToken) return;
    const question = draft.trim();
    setDraft("");
    setChatError(null);
    setMessages((prev) => [...prev, { id: `u_${Date.now()}`, role: "user", text: question }]);
    setSending(true);

    try {
      const { contextRecords, memories } = buildGroundedAiContext({
        today: ws.today,
        templates: ws.templates,
        occurrences: ws.occurrences,
        journalEntries: ws.journalEntries,
        memories: ws.aiMemories,
        includeJournalContext: ws.aiConsent.includeJournal,
      });

      const res = await sendAiChat(auth.accessToken, {
        provider: activeKey.provider,
        apiKey: activeKey.apiKey,
        model: activeKey.model,
        consentGranted: true,
        includeJournalContext: ws.aiConsent.includeJournal,
        message: question,
        contextRecords,
        memories,
      });

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

  return (
    <div className="space-y-8">
      <PageHeader title="Lakshmi AI" subtitle="Read-only personal productivity coach (BYOK)." />

      <div className="grid gap-8 lg:grid-cols-[1fr_21rem]">
        <div className="flex min-h-[28rem] flex-col gap-5">
          <div className="flex gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-inverse text-on-inverse">
              <Sparkles aria-hidden className="size-4" />
            </span>
            <div className="max-w-[88%] rounded-ui border border-line bg-surface px-4 py-3">
              <p className="text-[0.9375rem] leading-relaxed">
                Hello, I am Lakshmi. With your explicit consent and your own API key, I answer questions grounded strictly in your
                authorized records. I am read-only and will never modify your routines or tasks.
              </p>
            </div>
          </div>

          {messages.length === 0 ? (
            <div className="flex-1">
              <EmptyState
                icon={MessageCircle}
                title="No conversation yet"
                description="Grant AI consent, add a BYOK provider key, and sign in to ask grounded questions about your routines."
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
                ? "Grant external AI consent in the panel to enable sending."
                : !activeKey
                  ? "Add a BYOK provider key (1–2 keys supported) to enable sending."
                  : !apiReady || !auth.accessToken
                    ? "Sign in and configure NEXT_PUBLIC_API_BASE_URL to send live requests."
                    : `Ready using ${activeKey.provider} (${activeKey.model}). Read-only enforced.`}
            </p>
          </form>
        </div>

        <aside className="min-w-0 space-y-6">
          <section aria-labelledby="ai-consent-h">
            <SectionHeading id="ai-consent-h">Consent & privacy</SectionHeading>
            <Card className="space-y-3 p-4 text-sm">
              <div className="flex items-start gap-2 text-xs text-ink-3">
                <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
                <p>Only minimal date-bounded records are sent to your chosen provider under its own terms. You can revoke anytime.</p>
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

          <section aria-labelledby="ai-byok-h">
            <SectionHeading id="ai-byok-h">BYOK API keys ({keys.length}/2)</SectionHeading>
            <Card className="space-y-3 p-4">
              {keys.map((slot) => (
                <div key={slot.id} className="flex items-center justify-between gap-2 rounded-ui border border-line px-3 py-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setActiveKeyId(slot.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="font-medium capitalize">
                      {slot.provider} {activeKey?.id === slot.id ? "(active)" : ""}
                    </p>
                    <p className="truncate text-ink-3">{slot.model}</p>
                  </button>
                  <button
                    type="button"
                    disabled={testing}
                    onClick={() => void runConnectionTest(slot)}
                    className="rounded-ui border border-line px-2 py-1 hover:bg-surface-2"
                  >
                    Test
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${slot.provider} key`}
                    onClick={() => setKeys((prev) => prev.filter((k) => k.id !== slot.id))}
                    className="p-1 text-ink-3 hover:text-ink"
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                </div>
              ))}

              {keys.length < 2 ? (
                <form onSubmit={addKeySlot} className="space-y-2">
                  <select
                    aria-label="AI provider"
                    value={newProvider}
                    onChange={(e) => {
                      const p = e.target.value as AiProviderId;
                      setNewProvider(p);
                      setNewModel(AI_DEFAULT_MODELS[p]);
                    }}
                    className="min-h-10 w-full rounded-ui border border-line bg-surface px-3 text-sm"
                  >
                    {PROVIDERS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label="Model identifier"
                    value={newModel}
                    onChange={(e) => setNewModel(e.target.value)}
                    placeholder="Model ID"
                    className="min-h-10 w-full rounded-ui border border-line bg-surface px-3 text-sm"
                  />
                  <input
                    type="password"
                    aria-label="Provider API key"
                    value={newApiKey}
                    onChange={(e) => setNewApiKey(e.target.value)}
                    placeholder="Paste provider API key…"
                    autoComplete="off"
                    className="min-h-10 w-full rounded-ui border border-line bg-surface px-3 text-sm"
                  />
                  <Button type="submit" variant="secondary" className="w-full">
                    <KeyRound aria-hidden className="size-4" />
                    Add key (session memory only)
                  </Button>
                </form>
              ) : null}

              {testStatus ? <p className="text-xs text-ink-3">{testStatus}</p> : null}
              <p className="text-xs text-ink-3">API keys are kept in memory only for this session and are never stored in browser storage or Supabase.</p>
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
