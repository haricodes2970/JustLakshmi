"use client";

import { useId, useRef, useState } from "react";
import { ArrowUp, MessageCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DemoBadge } from "@/components/ui/demo-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { AI_SUGGESTED_PROMPTS } from "@/data/demo/ai-prompts";

/** Frontend placeholder only. No provider, no keys, no network calls, no fake replies. */
export function AiView() {
  const uid = useId();
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div className="flex min-h-[calc(100dvh-14rem)] flex-col gap-6 lg:min-h-[calc(100dvh-9rem)]">
      <PageHeader title="Lakshmi AI" subtitle="Your private productivity coach." action={<DemoBadge label="Preview only" />} />

      <div className="flex flex-1 flex-col gap-5">
        <div className="flex gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-inverse text-on-inverse">
            <Sparkles aria-hidden className="size-4" />
          </span>
          <div className="max-w-[85%] rounded-ui border border-line bg-surface px-4 py-3">
            <p className="text-[0.9375rem] leading-relaxed">
              Hello, I am Lakshmi. Once connected, I will help you reflect on your routines using only the records you allow me to read. I
              will never change your tasks.
            </p>
            <p className="mt-2 text-xs text-ink-3">This is a layout preview. The assistant is not connected yet.</p>
          </div>
        </div>

        <div className="flex-1">
          <EmptyState
            icon={MessageCircle}
            title="No conversation yet"
            description="Conversations will appear here once Lakshmi AI is available in a later phase."
          />
        </div>

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
                  className="min-h-11 rounded-ui border border-line bg-surface px-4 py-2 text-left text-sm text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  {p}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <form onSubmit={(e) => e.preventDefault()} className="space-y-2">
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
          <Button type="submit" size="icon" disabled aria-label="Send message (unavailable in preview)">
            <ArrowUp aria-hidden className="size-5" />
          </Button>
        </div>
        <p id={`${uid}-note`} className="text-xs text-ink-3">
          Sending is disabled: no AI provider is connected and no API key is requested in this phase.
        </p>
      </form>
    </div>
  );
}
