import { cn } from "@/lib/cn";

export function ProgressRing({
  percent,
  size = 96,
  stroke = 8,
  label,
  className,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  label: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div
      role="img"
      aria-label={`${label}: ${Math.round(clamped)} percent`}
      className={cn("relative grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--inverse)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped / 100)}
          style={{ transition: "stroke-dashoffset 400ms cubic-bezier(0.16, 1, 0.3, 1)" }}
        />
      </svg>
      <span className="absolute font-display text-xl tabular-nums">{Math.round(clamped)}%</span>
    </div>
  );
}
