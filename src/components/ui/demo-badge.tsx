import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/cn";

/** Marks any sample content so it is never mistaken for a real user record. */
export function DemoBadge({ label = "Demo data", className }: { label?: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-dashed border-ink-3 px-2 py-0.5 text-xs font-medium text-ink-3",
        className,
      )}
    >
      <FlaskConical aria-hidden className="size-3" />
      {label}
    </span>
  );
}
