import type { AiContextRecord, AiMemoryItem, ISODate, JournalEntry, TaskOccurrence, TaskTemplate } from "@justlakshmi/shared";
import { completionFromOccurrences, habitStreak, percent, sumCompletion } from "@/domain/analytics";
import { describeRecurrence } from "@/domain/recurrence";
import { addDays } from "@/lib/dates";

/**
 * Local read-only RAG retriever.
 * Minimizes context sent to external AI providers:
 * - Date-bounded to recent window (default 14 days)
 * - Excludes journal/mood records unless `includeJournalContext` is explicitly granted
 */
export function buildGroundedAiContext(params: {
  today: ISODate;
  templates: readonly TaskTemplate[];
  occurrences: readonly TaskOccurrence[];
  journalEntries: readonly JournalEntry[];
  memories: readonly AiMemoryItem[];
  includeJournalContext: boolean;
  windowDays?: number;
}): { contextRecords: AiContextRecord[]; memories: string[] } {
  const { today, templates, occurrences, journalEntries, memories, includeJournalContext } = params;
  const windowDays = params.windowDays ?? 14;
  const startDate = addDays(today, -(windowDays - 1));
  const records: AiContextRecord[] = [];

  const recentDays = Array.from({ length: windowDays }, (_, i) =>
    completionFromOccurrences(addDays(today, i - (windowDays - 1)), occurrences),
  );
  const summary = sumCompletion(recentDays);
  records.push({
    kind: "analytics",
    date: `${startDate}..${today}`,
    summary: `Last ${windowDays} days: ${summary.completed}/${summary.scheduled} completed (${summary.percent}%).`,
  });

  const isDone = (templateId: string, date: ISODate) =>
    occurrences.some((o) => o.templateId === templateId && o.date === date && o.completed);

  for (const t of templates.filter((x) => !x.isArchived).slice(0, 12)) {
    const streak = habitStreak(t, today, isDone);
    records.push({
      kind: "routine",
      date: today,
      summary: `${t.title} (${describeRecurrence(t.recurrence)}, mode=${t.mode}, streak=${streak} scheduled days).`,
    });
  }

  for (const occ of occurrences.filter((o) => o.date >= startDate && o.date <= today).slice(-25)) {
    const detail =
      occ.mode === "measurable" && occ.targetValue
        ? `${occ.progressValue}/${occ.targetValue} ${occ.unit ?? ""}`
        : occ.mode === "duration" && occ.targetDurationMinutes
          ? `${occ.progressValue}/${occ.targetDurationMinutes} min`
          : occ.completed
            ? "completed"
            : "pending";
    records.push({
      kind: "occurrence",
      date: occ.date,
      summary: `${occ.titleSnapshot}: ${occ.completed ? "done" : "pending"} (${detail.trim()}).`,
    });
  }

  if (includeJournalContext) {
    for (const j of journalEntries.filter((e) => e.date >= startDate && e.date <= today).slice(-7)) {
      const parts = [
        j.mood ? `mood=${j.mood}` : null,
        j.energy ? `energy=${j.energy}/5` : null,
        j.stress ? `stress=${j.stress}/5` : null,
        j.wentWell ? `wentWell="${j.wentWell.slice(0, 120)}"` : null,
        j.tomorrow ? `tomorrow="${j.tomorrow.slice(0, 120)}"` : null,
      ].filter(Boolean);
      if (parts.length > 0) {
        records.push({ kind: "journal", date: j.date, summary: parts.join("; ") });
      }
    }
  }

  const orderedMemories = [...memories]
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 20)
    .map((m) => (m.pinned ? `[Pinned] ${m.content}` : m.content));

  const dailyToday = completionFromOccurrences(today, occurrences);
  records.unshift({
    kind: "analytics",
    date: today,
    summary: `Today (${today}): ${dailyToday.completed}/${dailyToday.scheduled} completed (${percent(dailyToday.completed, dailyToday.scheduled)}%).`,
  });

  return { contextRecords: records.slice(0, 60), memories: orderedMemories };
}
