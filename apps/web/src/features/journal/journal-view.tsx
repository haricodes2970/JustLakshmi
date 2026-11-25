"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import type { Mood } from "@justlakshmi/shared";
import { SakugaTextarea, useSakuga } from "@/components/sakuga";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader, SectionHeading } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace, type JournalPatch } from "@/features/workspace/workspace-provider";
import { cn } from "@/lib/cn";
import { addDays, formatLong } from "@/lib/dates";

const MOODS: readonly { value: Mood; label: string }[] = [
  { value: "happy", label: "Happy" },
  { value: "good", label: "Good" },
  { value: "neutral", label: "Neutral" },
  { value: "low", label: "Low" },
  { value: "stressed", label: "Stressed" },
];

const SCALE = [1, 2, 3, 4, 5] as const;

const EMPTY_FORM: JournalPatch = {
  mood: null,
  energy: null,
  stress: null,
  wentWell: "",
  couldBeBetter: "",
  gratitude: "",
  learned: "",
  tomorrow: "",
  notes: "",
};

function entryToForm(entry: ReturnType<ReturnType<typeof useWorkspace>["getJournal"]>): JournalPatch {
  if (!entry) return { ...EMPTY_FORM };
  return {
    mood: entry.mood,
    energy: entry.energy,
    stress: entry.stress,
    wentWell: entry.wentWell,
    couldBeBetter: entry.couldBeBetter,
    gratitude: entry.gratitude,
    learned: entry.learned,
    tomorrow: entry.tomorrow,
    notes: entry.notes,
  };
}

export function JournalView() {
  const ws = useWorkspace();
  const { fireEffect, toast, reducedMotion } = useSakuga();
  const params = useSearchParams();
  const initialParam = params.get("date");
  const [pickedDate, setPickedDate] = useState<string | null>(initialParam);
  const selected = pickedDate ?? ws.today;

  const existing = ws.getJournal(selected);
  const [draftByDate, setDraftByDate] = useState<Record<string, JournalPatch>>({});
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  if (!ws.ready) {
    return (
      <div role="status" aria-label="Loading journal" className="space-y-4">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const form = draftByDate[selected] ?? entryToForm(existing);

  function updateField<K extends keyof JournalPatch>(key: K, value: JournalPatch[K]) {
    setSavedNotice(null);
    setDraftByDate((prev) => ({
      ...prev,
      [selected]: { ...form, [key]: value },
    }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await ws.saveJournal(selected, form);
    const msg = `Saved reflection for ${formatLong(selected)}.`;
    setSavedNotice(msg);
    toast(msg, "success");
  }

  const history = [...ws.journalEntries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Journal"
        subtitle="Structured reflection, stored privately on your device and in your Drive Habbits folder."
      />

      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-xl">{formatLong(selected)}</h2>
        <div className="flex items-center gap-1">
          <Button variant="secondary" className="min-h-9 px-3" onClick={() => setPickedDate(ws.today)} disabled={selected === ws.today}>
            Today
          </Button>
          <Button variant="ghost" size="icon" aria-label="Previous day" onClick={() => setPickedDate(addDays(selected, -1))}>
            <ChevronLeft aria-hidden className="size-5" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Next day" onClick={() => setPickedDate(addDays(selected, 1))}>
            <ChevronRight aria-hidden className="size-5" />
          </Button>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_18rem]">
        <form onSubmit={(e) => void save(e)} className="space-y-6">
          <Card className="space-y-5 p-5">
            <fieldset>
              <legend className="mb-2 text-xs font-medium tracking-wide text-ink-3 uppercase">Mood today</legend>
              <div className="flex flex-wrap gap-2">
                {MOODS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    aria-pressed={form.mood === m.value}
                    onClick={(e) => {
                      const next = form.mood === m.value ? null : m.value;
                      if (next && !reducedMotion) fireEffect("ticks", e.currentTarget, { scale: 0.7, accent: "pink" });
                      updateField("mood", next);
                    }}
                    className={cn(
                      "min-h-10 rounded-ui border px-3.5 text-sm font-medium transition-colors active:scale-95",
                      form.mood === m.value
                        ? "border-2 border-line-strong bg-sk-violet text-white sk-ink-shadow"
                        : "border-line bg-surface text-ink-2 hover:border-sk-violet/60 hover:bg-surface-2",
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <fieldset>
                <legend className="mb-2 text-xs font-medium tracking-wide text-ink-3 uppercase">Energy (1–5)</legend>
                <div className="flex gap-1.5">
                  {SCALE.map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={form.energy === n}
                      onClick={(e) => {
                        const next = form.energy === n ? null : n;
                        if (next && !reducedMotion) fireEffect("ticks", e.currentTarget, { scale: 0.6, accent: "violet" });
                        updateField("energy", next);
                      }}
                      className={cn(
                        "min-h-10 flex-1 rounded-ui border text-sm font-medium tabular-nums transition-colors active:scale-95",
                        form.energy === n
                          ? "border-2 border-line-strong bg-inverse text-on-inverse"
                          : "border-line bg-surface text-ink-2 hover:bg-surface-2",
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-2 text-xs font-medium tracking-wide text-ink-3 uppercase">Stress (1–5)</legend>
                <div className="flex gap-1.5">
                  {SCALE.map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={form.stress === n}
                      onClick={(e) => {
                        const next = form.stress === n ? null : n;
                        if (next && !reducedMotion) fireEffect("ticks", e.currentTarget, { scale: 0.6, accent: "pink" });
                        updateField("stress", next);
                      }}
                      className={cn(
                        "min-h-10 flex-1 rounded-ui border text-sm font-medium tabular-nums transition-colors active:scale-95",
                        form.stress === n
                          ? "border-2 border-line-strong bg-inverse text-on-inverse"
                          : "border-line bg-surface text-ink-2 hover:bg-surface-2",
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
            <p className="text-xs text-ink-3">Mood, energy, and stress are personal reflection notes only — not medical assessments.</p>
          </Card>

          <Card className="space-y-4 p-5">
            {(
              [
                ["wentWell", "What went well?"],
                ["couldBeBetter", "What could have gone better?"],
                ["gratitude", "What am I grateful for?"],
                ["learned", "What did I learn today?"],
                ["tomorrow", "What do I want to improve tomorrow?"],
                ["notes", "Additional notes (optional)"],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <label htmlFor={`j-${key}`} className="mb-1.5 block text-sm font-medium text-ink-2">
                  {label}
                </label>
                <SakugaTextarea
                  id={`j-${key}`}
                  rows={key === "notes" ? 3 : 2}
                  value={form[key]}
                  onChange={(e) => updateField(key, e.target.value)}
                />
              </div>
            ))}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <Button type="submit" variant="accent" effect="burst">
                Save reflection
              </Button>
              <p role="status" aria-live="polite" className="text-sm text-ink-3">
                {savedNotice}
              </p>
            </div>
          </Card>
        </form>

        <aside className="space-y-4">
          <SectionHeading>Recent entries</SectionHeading>
          <Card className="overflow-hidden">
            {history.length === 0 ? (
              <p className="p-4 text-sm text-ink-3">No saved reflections yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {history.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => setPickedDate(entry.date)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm hover:bg-surface-2",
                        entry.date === selected && "bg-surface-2 font-medium",
                      )}
                    >
                      <span>{formatLong(entry.date)}</span>
                      {entry.mood ? <span className="text-xs text-ink-3 capitalize">{entry.mood}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <p className="flex items-center gap-1.5 text-xs text-ink-3">
            <Lock aria-hidden className="size-3.5 shrink-0" />
            Journal entries are never stored in Supabase.
          </p>
        </aside>
      </div>
    </div>
  );
}
