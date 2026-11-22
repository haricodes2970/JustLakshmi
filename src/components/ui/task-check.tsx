import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

/** Accessible checkbox button. State is conveyed by icon and label, never colour alone. */
export function TaskCheck({
  checked,
  onToggle,
  label,
  className,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className={cn("-m-2 grid size-11 shrink-0 place-items-center rounded-full", className)}
    >
      <span
        className={cn(
          "grid size-6 place-items-center rounded-full border-2 transition-colors duration-150",
          checked ? "border-inverse bg-inverse text-on-inverse" : "border-ink-3 text-transparent",
        )}
      >
        <Check aria-hidden className="size-3.5" strokeWidth={3} />
      </span>
    </button>
  );
}
